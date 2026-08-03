#!/usr/bin/env python3
"""
run_benchmark.py — faehrt die Benchmarkfaelle gegen den echten Solver und
vergleicht das Ergebnis mit der analytischen Loesung.

Abgrenzung: engines/docker/test_*.py sind REGRESSIONSTESTS (tut der Code, was
er soll — Absturzfreiheit, Dateiformate, Massenbilanz-Plausibilitaet). Hier geht
es um VALIDIERUNG: stimmt das Ergebnis mit der Physik ueberein. Das eine sagt
nichts ueber das andere.

Aufruf (aus beliebigem Verzeichnis):
    python3 run_benchmark.py [--image IMAGE] [--case NAME] [--keep]

Exit-Code 0 = alle Faelle innerhalb ihrer Toleranz, 1 = mindestens einer nicht.
Ergebnis landet zusaetzlich als report.json neben diesem Skript.
"""
import argparse
import csv
import json
import math
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))              # flood2D/ — wegen codec.py

import metrics                                    # noqa: E402
from cases import ritter_dambreak                 # noqa: E402
from cases import manning_normalflow              # noqa: E402
from codec import decode_frame                    # noqa: E402

CASES = {
    ritter_dambreak.NAME: ritter_dambreak,
    manning_normalflow.NAME: manning_normalflow,
}

DEFAULT_IMAGE = "fabiologe/quagg-lisflood:latest"

# Toleranzen. Bewusst grosszuegig gesetzt: sie sind eine REGRESSIONSSCHWELLE
# ("ist es schlechter geworden?"), keine Guetezusage. Die tatsaechlich
# gemessenen Werte stehen in REPORT.md — die sind die interessante Groesse.
# Die Frontschwelle, gegen die geprueft wird. 0.2 m statt 0.01 m: der duenne
# Auslauf-Keil wird von jedem Verfahren 1. Ordnung wegdiffundiert, eine Schwelle
# nahe null misst deshalb hauptsaechlich die Diffusion der Zellspitze und nicht
# die Qualitaet der Loesung. Alle Schwellen stehen trotzdem in report.json.
FRONT_CHECK_THRESHOLD = "0.2"

TOLERANCE = {
    "ritter_dambreak": {
        "fv1": {"rmse_active": 0.25, "front_error_abs": 25.0},
        # Die Traegheitsformulierung vernachlaessigt den Advektionsterm und ist
        # fuer Dammbruch-Transienten NICHT gedacht — hier nur zum Vergleich
        # mitgefahren, damit der Unterschied dokumentiert ist.
        "acceleration": {"rmse_active": 2.50, "front_error_abs": 250.0},
    },
    # Normalabfluss: die Front ist hier bedeutungslos (stationaeres Gerinne),
    # geprueft wird nur die Tiefe gegen die Handrechnung.
    "manning_normalflow": {
        # gemessen 2026-08-01: RMSE 0.0014 m — Schwelle mit reichlich Luft
        # darueber, damit sie eine echte Verschlechterung anzeigt und nicht
        # Rundungsrauschen.
        "acceleration": {"rmse_active": 0.02, "front_error_abs": None},
    },
}


def parse_asc(path):
    """ESRI-ASCII-Raster -> (header dict, Zeilenliste von Werten)."""
    text = path.read_text(errors="replace")
    tokens = text.split()
    header, i = {}, 0
    while i + 1 < len(tokens) and tokens[i][0].isalpha():
        header[tokens[i].lower()] = float(tokens[i + 1])
        i += 2
    ncols, nrows = int(header["ncols"]), int(header["nrows"])
    vals = [float(t) for t in tokens[i:i + ncols * nrows]]
    rows = [vals[r * ncols:(r + 1) * ncols] for r in range(nrows)]
    return header, rows


def _decode(path):
    meta, channels = decode_frame(path.read_bytes())
    depth = channels.get("depth")
    if depth is None:
        return None
    ncols, nrows = int(meta["ncols"]), int(meta["nrows"])
    return meta, [list(depth[r * ncols:(r + 1) * ncols]) for r in range(nrows)]


def last_depth_frame(results):
    """
    Tiefenraster zum Endzeitpunkt, plus das vorletzte fuer die
    Stationaritaetspruefung.

    Der Handler laesst die rohen res-NNNN.wd nicht liegen, sondern kodiert sie
    nach frame-NNNN.bin (codec.py) — deshalb wird hier dekodiert statt eine
    .asc gelesen.
    -> (name, meta, Zeilen, Vorgaenger-Zeilen|None) oder None
    """
    frames = sorted(results.glob("frame-*.bin"))
    if not frames:
        return None
    cur = _decode(frames[-1])
    if cur is None:
        return None
    prev = _decode(frames[-2])[1] if len(frames) >= 2 else None
    return frames[-1].name, cur[0], cur[1], prev


def mass_balance(results):
    """Relativer Volumenfehler aus res.mass (letzte Zeile)."""
    mass = results / "res.mass"
    if not mass.exists():
        return None
    lines = [ln for ln in mass.read_text(errors="replace").splitlines() if ln.strip()]
    if len(lines) < 2:
        return None
    header = lines[0].split()
    last = lines[-1].split()
    try:
        vol = float(last[header.index("Vol")])
        err = float(last[header.index("Qerror")])
    except (ValueError, IndexError):
        return None
    return {"volume_m3": vol, "qerror": err}


def run_case(case, scheme, image, keep=False, cellsize=None):
    """Ein Fall × ein Schema: Szenario bauen, Container fahren, auswerten."""
    cs = cellsize if cellsize is not None else case.CELLSIZE
    # Job-Dir unter backend/data/ — Snap-Docker kann /tmp-Host-Pfade nicht
    # mounten (gleiche Falle wie in engines/docker/test_*.py).
    flood2d = HERE.parent
    job = flood2d / "data" / f"benchmark_{case.NAME}_{scheme}_{cs:g}"
    if job.exists():
        shutil.rmtree(job)
    inp = job / "inputs"
    inp.mkdir(parents=True)
    (job / "results").mkdir()
    case.write_scenario(inp, scheme=scheme, cellsize=cs)

    result = {"case": case.NAME, "scheme": scheme, "image": image, "cellsize": cs}
    try:
        proc = subprocess.run(
            ["docker", "run", "--rm", "-v", f"{job}:/job", image,
             "--job", "/job", "--heartbeat", "5"],
            capture_output=True, text=True, timeout=900,
        )
        events = []
        for line in proc.stdout.splitlines():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass

        ver = next((e for e in events if e.get("event") == "solver_version"), None)
        if ver:
            result["solver_sha"] = ver.get("sha")
            result["solver_patches"] = len(ver.get("patches") or [])

        if proc.returncode != 0 or not any(e.get("event") == "done" for e in events):
            result["status"] = "ERROR"
            result["detail"] = (proc.stdout[-1500:] + proc.stderr[-1500:]).strip()
            return result

        results_dir = job / "results"
        frame = last_depth_frame(results_dir)
        if frame is None:
            result["status"] = "ERROR"
            result["detail"] = "kein Tiefen-Frame (frame-*.bin) erzeugt"
            return result
        fname, fmeta, rows, prev_rows = frame

        # Der Vergleich gilt nur, wenn der Frame wirklich zum Auswertezeitpunkt
        # gehoert — sonst vergleicht man stillschweigend gegen eine andere Zeit.
        ftime = fmeta.get("time")
        if ftime is not None and abs(float(ftime) - case.T_END) > 0.51:
            result["status"] = "ERROR"
            result["detail"] = (f"letzter Frame bei t={ftime}s, erwartet "
                                f"t={case.T_END}s")
            return result
        result["frame_time"] = ftime

        # Faelle mit Gerinne muessen ihre Kanalzeile selbst benennen — die
        # Mittelzeile waere dort ggf. trockenes Vorland.
        pick = getattr(case, "sim_row", lambda rr: rr[len(rr) // 2])
        sim = pick(rows)
        ref = case.reference_profile(cs)
        xs = case.x_axis(cs)
        mask = case.active_mask(cs)

        # Stationaritaet: bei einem Gleichgewichtsfall ist das Ergebnis nur
        # gueltig, wenn sich zwischen den letzten beiden Ausgaben praktisch
        # nichts mehr aendert. Ohne diese Pruefung vergleicht man stillschweigend
        # einen noch laufenden Einschwingvorgang mit der Gleichgewichtsloesung.
        # Nur fuer Faelle, die ueberhaupt einen Gleichgewichtszustand haben —
        # bei einem Dammbruch AENDERT sich das Profil zwangslaeufig.
        if getattr(case, "STEADY_STATE", False) and prev_rows is not None:
            prev = pick(prev_rows)
            drift = max((abs(a - b) for a, b, m in zip(sim, prev, mask) if m),
                        default=0.0)
            result["steady_drift_m"] = drift

        sim_a = [s for s, m in zip(sim, mask) if m]
        ref_a = [r for r, m in zip(ref, mask) if m]
        xs_a = [x for x, m in zip(xs, mask) if m]

        result["status"] = "OK"
        result["grid"] = fname
        finite = [(s, r) for s, r in zip(sim_a, ref_a)
                  if math.isfinite(s) and math.isfinite(r)]
        if finite:
            result["mean_sim"] = sum(s for s, _ in finite) / len(finite)
            result["mean_ref"] = sum(r for _, r in finite) / len(finite)
            result["rel_error_pct"] = (
                100.0 * (result["mean_sim"] - result["mean_ref"]) / result["mean_ref"]
                if result["mean_ref"] else float("nan"))

        # Neigung des Tiefenprofils (lineare Regression ueber das Auswertefenster).
        # Bei echtem Gleichfoermigkeitszustand ist sie null; jede Abweichung der
        # Solver-Konveyanz von der Handrechnung kippt sie messbar.
        # NUR fuer Gleichgewichtsfaelle: bei einer Verduennungswelle FAELLT das
        # Profil zwangslaeufig, die Zahl waere dort bedeutungslos (und wurde beim
        # ersten Tabellenlauf prompt als "-16884 mm/km" ausgewiesen).
        pts = [(x, s) for x, s in zip(xs_a, sim_a) if math.isfinite(s)]
        if getattr(case, "STEADY_STATE", False) and len(pts) >= 2:
            n_p = len(pts)
            mx = sum(x for x, _ in pts) / n_p
            my = sum(y for _, y in pts) / n_p
            den = sum((x - mx) ** 2 for x, _ in pts)
            if den > 0:
                slope = sum((x - mx) * (y - my) for x, y in pts) / den
                result["profile_slope_mm_per_km"] = slope * 1e6
        result["full"] = metrics.summarize(sim, ref, xs, case.WET_THRESHOLD)
        result["active"] = metrics.summarize(sim_a, ref_a, xs_a, case.WET_THRESHOLD)
        result["mass"] = mass_balance(results_dir)
        result["profile"] = {                    # fuer spaetere Plots/Diffs
            "x": xs[::10], "sim": sim[::10], "ref": ref[::10],
        }
        return result
    except subprocess.TimeoutExpired:
        result["status"] = "TIMEOUT"
        return result
    finally:
        if not keep:
            shutil.rmtree(job, ignore_errors=True)


def check_tolerance(res):
    """Gegen die Regressionsschwelle pruefen. -> (bestanden, Begruendung)."""
    tol = TOLERANCE.get(res["case"], {}).get(res["scheme"])
    if res.get("status") != "OK":
        return False, res.get("status", "?")
    if not tol:
        return True, "keine Schwelle definiert"
    why = []
    ok = True
    rmse_a = res["active"]["rmse"]
    if not math.isfinite(rmse_a) or rmse_a > tol["rmse_active"]:
        ok = False
        why.append(f"RMSE(aktiv) {rmse_a:.3f} > {tol['rmse_active']}")
    # front_error_abs = None -> Frontlage ist fuer diesen Fall bedeutungslos
    # (stationaerer Zustand, es gibt keine wandernde Front).
    if tol.get("front_error_abs") is not None:
        front = res["active"].get("fronts", {}).get(FRONT_CHECK_THRESHOLD, {})
        fe = front.get("error_m")
        if fe is None or abs(fe) > tol["front_error_abs"]:
            ok = False
            why.append(f"Frontfehler(≥{FRONT_CHECK_THRESHOLD} m) {fe} "
                       f"> ±{tol['front_error_abs']} m")

    drift = res.get("steady_drift_m")
    if drift is not None and drift > 0.02:
        ok = False
        why.append(f"nicht eingeschwungen (Drift {drift:.3f} m zwischen den "
                   f"letzten Ausgaben)")
    return ok, "; ".join(why) if why else "innerhalb Toleranz"


def run_convergence(case, scheme, image, keep=False):
    """
    Gitterkonvergenz: derselbe Fall ueber mehrere Zellweiten.

    Das ist der Nachweis, dass hier ueberhaupt Diskretisierungsfehler gemessen
    wird. Wird der Fehler bei feinerem Gitter nicht kleiner, stimmt entweder das
    Modell nicht oder die Auswertung — dann sind alle anderen Zahlen wertlos.
    """
    print(f"\nKonvergenz — {case.TITLE} / {scheme}")
    rows = []
    for cs in case.CONVERGENCE_CELLSIZES:
        print(f"  … dx = {cs:>4g} m ({case.ncols_for(cs):>4d} Zellen) ", end="", flush=True)
        res = run_case(case, scheme, image, keep=keep, cellsize=cs)
        if res.get("status") != "OK":
            print(f"{res['status']}  {res.get('detail','')[:120]}")
            rows.append({"cellsize": cs, "status": res.get("status")})
            continue
        a = res["active"]
        rows.append({"cellsize": cs, "status": "OK", "rmse": a["rmse"],
                     "nse": a["nse"],
                     "front_error_m": a["fronts"][FRONT_CHECK_THRESHOLD]["error_m"]})
        print(f"RMSE {a['rmse']:6.3f} m | NSE {a['nse']:6.3f} | "
              f"Front {a['fronts'][FRONT_CHECK_THRESHOLD]['error_m']:+6.1f} m")

    good = [r for r in rows if r.get("status") == "OK"]
    monotone = all(good[i]["rmse"] >= good[i + 1]["rmse"] - 1e-9
                   for i in range(len(good) - 1))

    # Beobachtete Konvergenzordnung p aus je zwei Aufloesungen:
    #     p = log(e_grob / e_fein) / log(dx_grob / dx_fein)
    # Erwartung fuer ein Verfahren 1. Ordnung: p ≈ 1. Bei Unstetigkeiten und
    # Trocken-Nass-Fronten faellt p typischerweise darunter — das ist normal
    # und kein Defekt, gehoert aber dokumentiert.
    orders = []
    for i in range(len(good) - 1):
        e_c, e_f = good[i]["rmse"], good[i + 1]["rmse"]
        dx_c, dx_f = good[i]["cellsize"], good[i + 1]["cellsize"]
        if e_f > 0 and dx_f > 0 and e_c > 0:
            orders.append(math.log(e_c / e_f) / math.log(dx_c / dx_f))
    p_mean = sum(orders) / len(orders) if orders else None

    if len(good) >= 2:
        print(f"  → Fehler faellt monoton mit feinerem Gitter: "
              f"{'JA ✅' if monotone else 'NEIN ❌ (verdaechtig!)'}")
    if p_mean is not None:
        print(f"  → beobachtete Konvergenzordnung p ≈ {p_mean:.2f} "
              f"(Einzelwerte: {', '.join(f'{o:.2f}' for o in orders)})")
    return {"case": case.NAME, "scheme": scheme, "steps": rows,
            "monotone": monotone if len(good) >= 2 else None,
            "observed_order": p_mean, "order_steps": orders}


def _fmt(v, spec=".4f", dash="—"):
    if v is None or (isinstance(v, float) and not math.isfinite(v)):
        return dash
    return format(v, spec)


def write_table(report):
    """
    Ergebnistabelle als Markdown (RESULTS.md) + Zeitreihe als CSV (history.csv).

    Die Markdown-Tabelle ist der Stand des letzten Laufs zum Nachlesen; die CSV
    waechst mit jedem Lauf und macht Drift ueber die Zeit sichtbar — genau das,
    wofuer Regressionsschwellen allein zu grob sind.
    """
    gen = report["generated"]
    lines = [
        "# Benchmark-Ergebnistabelle",
        "",
        "Automatisch erzeugt von `run_benchmark.py` — **nicht von Hand bearbeiten.**",
        "Einordnung und Interpretation der Zahlen: `REPORT.md`.",
        "",
        f"- Lauf: **{gen}**",
        f"- Image: `{report['image']}`",
    ]
    shas = {r.get("solver_sha") for r in report["results"] if r.get("solver_sha")}
    if shas:
        lines.append(f"- Solver-Stempel: `{', '.join(sorted(shas))}`")
    lines += [
        "",
        "## Ergebnisse",
        "",
        "Leere Zellen (—) bedeuten: die Groesse ist fuer diesen Fall nicht aussagekraeftig",
        "(z. B. eine Profilneigung bei einer wandernden Welle oder NSE bei konstanter Referenz).",
        "",
        "| Fall | Schema | dx [m] | RMSE [m] | Abw. [%] | NSE | Front ≥0,2 m | Neigung [mm/km] | Status |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for r in report["results"]:
        if r.get("status") != "OK":
            lines.append(f"| {r['case']} | {r['scheme']} | {_fmt(r.get('cellsize'), 'g')} "
                         f"| — | — | — | — | — | ❌ {r['status']} |")
            continue
        a = r["active"]
        front = a.get("fronts", {}).get(FRONT_CHECK_THRESHOLD, {}).get("error_m")
        lines.append(
            f"| {r['case']} | {r['scheme']} | {_fmt(r.get('cellsize'), 'g')} "
            f"| {_fmt(a.get('rmse'))} | {_fmt(r.get('rel_error_pct'), '+.2f')} "
            f"| {_fmt(a.get('nse'), '.4f')} | {_fmt(front, '+.1f')} "
            f"| {_fmt(r.get('profile_slope_mm_per_km'), '+.1f')} "
            f"| {'✅' if r.get('passed') else '❌ ' + r.get('verdict', '')} |")

    for conv in report.get("convergence") or []:
        lines += [
            "",
            f"## Gitterkonvergenz — {conv['case']} / {conv['scheme']}",
            "",
            "| dx [m] | RMSE [m] | NSE | Front ≥0,2 m |",
            "|---|---|---|---|",
        ]
        for s in conv["steps"]:
            if s.get("status") != "OK":
                lines.append(f"| {_fmt(s['cellsize'], 'g')} | — | — | — |")
                continue
            lines.append(f"| {_fmt(s['cellsize'], 'g')} | {_fmt(s.get('rmse'))} "
                         f"| {_fmt(s.get('nse'), '.4f')} "
                         f"| {_fmt(s.get('front_error_m'), '+.1f')} |")
        p = conv.get("observed_order")
        lines += [
            "",
            f"- Fehler faellt monoton: **{'ja' if conv.get('monotone') else 'NEIN'}**",
            f"- beobachtete Konvergenzordnung: **p ≈ {_fmt(p, '.2f')}**",
        ]

    (HERE / "RESULTS.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Zeitreihe fortschreiben
    hist = HERE / "history.csv"
    new = not hist.exists()
    with hist.open("a", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        if new:
            w.writerow(["generated", "solver_sha", "image", "case", "scheme",
                        "cellsize", "rmse", "mae", "nse", "rel_error_pct",
                        "front_error_m", "profile_slope_mm_per_km",
                        "steady_drift_m", "passed"])
        for r in report["results"]:
            a = r.get("active") or {}
            front = a.get("fronts", {}).get(FRONT_CHECK_THRESHOLD, {}).get("error_m")
            w.writerow([gen, r.get("solver_sha", ""), r.get("image", ""),
                        r.get("case"), r.get("scheme"), r.get("cellsize"),
                        a.get("rmse"), a.get("mae"), a.get("nse"),
                        r.get("rel_error_pct"), front,
                        r.get("profile_slope_mm_per_km"),
                        r.get("steady_drift_m"), r.get("passed")])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", default=DEFAULT_IMAGE)
    ap.add_argument("--case", default=None, help="nur diesen Fall fahren")
    ap.add_argument("--keep", action="store_true", help="Job-Verzeichnisse behalten")
    ap.add_argument("--convergence", action="store_true",
                    help="zusaetzlich Gitterkonvergenz fahren (dauert laenger)")
    args = ap.parse_args()

    selected = ([CASES[args.case]] if args.case else list(CASES.values()))

    print(f"\nBenchmark — Image: {args.image}")
    print("=" * 78)

    results, failures = [], 0
    for case in selected:
        print(f"\n{case.TITLE}")
        for scheme in case.SCHEMES:
            print(f"  … {scheme:14s} ", end="", flush=True)
            res = run_case(case, scheme, args.image, keep=args.keep)
            ok, why = check_tolerance(res)
            res["passed"] = ok
            res["verdict"] = why
            results.append(res)
            if res["status"] != "OK":
                print(f"{res['status']}  {res.get('detail', '')[:200]}")
                failures += 1
                continue
            a = res["active"]
            tol = TOLERANCE.get(res["case"], {}).get(res["scheme"], {})
            if tol.get("front_error_abs") is not None:
                fr = a["fronts"]
                extra = "Frontfehler " + "  ".join(
                    f"≥{th}m:{fr[th]['error_m']:+6.1f}" for th in fr
                    if fr[th]["error_m"] is not None)
            else:
                extra = (f"h_sim {res['mean_sim']:.4f} m vs "
                         f"h_soll {res['mean_ref']:.4f} m "
                         f"({res['rel_error_pct']:+.2f} %) | Profilneigung "
                         f"{res.get('profile_slope_mm_per_km', float('nan')):+.1f} mm/km")
            print(f"RMSE {a['rmse']:6.4f} m | {extra} | "
                  f"{'✅' if ok else '❌ ' + why}")
            if not ok:
                failures += 1

    convergence = []
    if args.convergence:
        for case in selected:
            convergence.append(
                run_convergence(case, case.SCHEMES[0], args.image, keep=args.keep))
            if convergence[-1]["monotone"] is False:
                failures += 1

    report = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "image": args.image,
        "results": results,
        "convergence": convergence,
    }
    (HERE / "report.json").write_text(json.dumps(report, indent=2))
    write_table(report)
    print("\n" + "=" * 78)
    print(f"{len(results) - failures}/{len(results)} innerhalb Toleranz")
    print("→ RESULTS.md (Tabelle), history.csv (Zeitreihe), report.json (Rohdaten)\n")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
