"""
Physikalischer Referenzfall (Spez. Kap. 13, Audit U21): Überfall über ein
breitkroniges Wehr, gerechnet mit der ECHTEN Pipeline (blockMesh → snappy →
interFoam), verglichen mit der Überfallformel Q = C_d · 2/3·√(2g)·b·H^1,5 und dem
Literaturband nach DWA-M 176 (siehe `bewertungsband`).

Der Fall ist bewusst klein, kostet aber trotzdem RECHENZEIT (Erstlauf:
82 min auf 4 Kernen bei end_time 25 s; nach Kürzung auf 18 s ≈ 1 h — der
dünne Überfallstrahl drückt den Zeitschritt auf ~0,6 ms) und läuft NICHT
in der Standard-Suite — Aufruf über test_verifikation.py mit FLOOD3D_VERIFIKATION=1
oder direkt:

    FLOOD3D_VERIFIKATION=1 venv/bin/python -m pytest \
        app/api/flood3D/tests/test_verifikation.py -q

Das Ergebnis wird nach data/verifikation/wehr_ueberfall.json geschrieben
und im Client (Phase „Simulation") als Verifikations-Karte angezeigt.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from ..core import casespec as cs

# Bewertungsband (Fahrplan C5, festgelegt 2026-09-24 VOR dem Ergebnis des
# Laufs c5_wehr): die Literatur, keine Eigenreferenz.
#   DWA-M 176 (2013), Abschn. 4.9 „Ausbildung von Überlaufschwellen",
#   Tabelle der Überfallbeiwerte zur hydraulischen Berechnung:
#   breitkroniges Wehr 0,49–0,51, abgefasst 0,50–0,55; scharfkantig 0,62,
#   rundkronig 0,75, profiliert 0,75–0,85 (OCR-Lesung der Tabelle).
# C_d IST der Poleni-Beiwert µ (Q = ⅔·µ·√(2g)·b·h^1,5). Bis dahin stand hier
# „µ ≈ 0,5–0,58 nach Poleni entspricht C_d ≈ 0,55–0,75" — eine Umrechnung,
# die es nicht gibt; sie weitete das Band auf 0,50–0,80, und die am
# 2026-08-11 eingefrorene Eigenreferenz 0,644 (vor dem Freispiegel-Zulauf
# A1 gerechnet) lag scheinbar darin. Das Verifikationswehr ist breitkronig
# mit geneigten Flanken → das Band beider breitkroniger Zeilen.
CD_LITERATUR = (0.49, 0.55)
CD_QUELLE = ("DWA-M 176 (2013), Abschn. 4.9: breitkronig 0,49–0,51, "
             "abgefasst 0,50–0,55")


def bewertungsband() -> tuple[tuple[float, float], str]:
    """Das EINE Band für jede Verifikation des Wehrs (Server-Probe und RunPod)."""
    return CD_LITERATUR, f"Literatur breitkronig — {CD_QUELLE}"


def referenz_spec() -> cs.CaseSpec:
    """Gerinne 8×1 m, breitkroniges Wehr quer, konstanter Zufluss."""
    return cs.CaseSpec(
        meta=cs.Meta(id="verifikation-wehr",
                     title="Verifikation Wehrüberfall (breitkronig)"),
        domain=cs.Domain(extent=(0.0, 0.0, 8.0, 1.0), z_min=94.6, z_max=96.6),
        terrain=cs.Terrain(base=cs.TerrainBase(source="flat:95.0",
                                               resolution=0.25)),
        structures=[cs.StructWeir(
            id="wehr", type="weir", patch="wehr",
            crest_polyline=[(4.0, 0.0, 95.6), (4.0, 1.0, 95.6)],
            crest_width=0.4, slope_upstream=0.0, slope_downstream=0.0,
            profile_type="breitkronig", base_level=95.0)],
        mesh=cs.Mesh(
            base_cell=0.125,
            refinements=[cs.RefineBox(
                id="wehrzone", type="box",
                extent=(3.0, 0.0, 95.3, 5.5, 1.0, 96.2), level=1)]),
        boundaries=[
            cs.BcInflowConstant(id="zulauf", patch="inlet",
                                type="inflow_constant", q=0.12),
            cs.BcOutflowFree(id="ablauf", patch="outlet",
                             type="outflow_free"),
            cs.BcAtmosphere(id="atmo", patch="atmosphere",
                            type="atmosphere")],
        # 18 s statt 25 s: der Überfallbeiwert ist ab t ≈ 12 s stationär
        # (Erstlauf: Median ab 12 s = 0,6436 vs. Endwert 0,6443) — das
        # ausgewertete letzte Drittel beginnt bei 12 s, alles danach war
        # nur Rechenzeit (~30 % Ersparnis je Verifikationslauf)
        solver=cs.Solver(application="interFoam", end_time=18.0,
                         initial_level=95.55,
                         write_interval_fields=5.0,
                         write_interval_series=0.2),
        evaluation=cs.Evaluation(
            sections=[cs.Section(id="qs_ow", polyline=[(3.0, 0.0),
                                                       (3.0, 1.0)])],
            gauges=[cs.Gauge(id="pegel_ow", point=(2.5, 0.5))],
            targets=[cs.TargetOverfallCd(id="cd_wehr", kind="overfall_cd",
                                         weir="wehr", section="qs_ow",
                                         gauge="pegel_ow")]))


def verifikation_rechnen(ziel_json: Path) -> dict:
    """
    Referenzfall komplett rechnen und bewerten. Schreibt das Ergebnis als
    JSON (für GET /verifikation + Client-Karte) und gibt es zurück.

    Fall UND Lauf landen in den normalen Ablagen (data/cases, data/runs):
    der Verifikationslauf ist damit im Werkzeug ANWÄHLBAR wie jedes
    Projekt — C_d-Kurve, 3D-Felder und Überfallstrahl lassen sich im
    PostViewer ansehen (Fabios Wunsch). Es wird immer nur der NEUESTE
    Verifikationslauf behalten.
    """
    import shutil

    import pandas as pd

    from ..core.store import manifest_schreiben
    from ..engines.runpod.relay import lauf_starten
    from ..router import _import_entpacken, cases_root, runs_root

    spec = referenz_spec()
    # Fall in die normale Fallablage (Projektliste)
    fall_dir = cases_root() / "verifikation-wehr"
    fall_dir.mkdir(parents=True, exist_ok=True)
    spec.to_yaml(fall_dir / "case.yaml")
    # alten Verifikationslauf ersetzen — es zählt der neueste Beleg
    runs_root().mkdir(parents=True, exist_ok=True)
    for alt in runs_root().glob("verifikation-wehr_r*"):
        shutil.rmtree(alt, ignore_errors=True)
    run_id = "verifikation-wehr_r001"
    run_root = runs_root() / run_id
    t0 = time.time()
    # Seit Stage B rechnet der Server keine Laeufe mehr — die Verifikation
    # prueft den ECHTEN Rechenort: RunPod, 16 Threads, ueber denselben
    # Relay wie ein Nutzerlauf (~0,2 EUR je Durchlauf). Ohne RunPod-Zugang
    # schlaegt lauf_starten mit klarer Meldung fehl — der Test ist ohnehin
    # env-gated (FLOOD3D_VERIFIKATION=1).
    run_root.mkdir(parents=True, exist_ok=True)

    def _melde(**felder):
        manifest_schreiben(run_root, **felder)

    _melde(status="building", origin="runpod", title=spec.meta.title,
           created=time.time())
    erg = lauf_starten(spec, fall_dir, run_id, run_root, _melde,
                       lambda: False, cores=16, max_laufzeit_s=7200)
    _import_entpacken(run_root, run_id, erg["artefakte"])
    _melde(status="completed", finished=time.time(),
           duration_s=erg["dauer_s"], runpod_job=erg["job_id"])
    manifest = json.loads((run_root / "manifest.json").read_text())

    df = pd.read_parquet(run_root / "normalized.parquet")
    # dieselbe Verdichtung wie jeder Nachweis (Fahrplan C4)
    from ..core.evaluate import ueberfall_beiwert
    cd = ueberfall_beiwert(df, spec, "wehr")
    if cd is None:
        raise AssertionError("Keine Überfallbeiwert-Reihe entstanden — "
                             "Wehr wird nicht überströmt?")
    cd_sim, streuung = cd["wert"], cd["streuung"]
    band, band_art = bewertungsband()
    bestanden = band[0] <= cd_sim <= band[1]

    ergebnis = {
        "fall": "wehr_ueberfall",
        "run_id": run_id,
        "titel": "Wehrüberfall (breitkronig) gegen die Überfallformel",
        "geprueft": time.strftime("%Y-%m-%d %H:%M"),
        "dauer_s": round(time.time() - t0, 1),
        "zellen": manifest.get("checkmesh", {}).get("cells"),
        "cd_sim": round(cd_sim, 4),
        "cd_streuung": round(streuung, 4) if np.isfinite(streuung) else None,
        "band": [round(band[0], 4), round(band[1], 4)],
        "band_art": band_art,
        "bestanden": bool(bestanden),
        "formel": "Q = C_d · 2/3 · √(2g) · b · H^1,5, H = h + ū²/2g",
    }
    ziel_json.parent.mkdir(parents=True, exist_ok=True)
    ziel_json.write_text(json.dumps(ergebnis, indent=2, ensure_ascii=False))
    return ergebnis
