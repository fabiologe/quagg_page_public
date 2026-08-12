#!/usr/bin/env python3
"""
flood3D Local Runner — läuft IM OpenFOAM-Container auf der Nutzer-Maschine.

Der quagg Local Companion startet diesen Container mit dem Job-Ordner unter
/job. Erwartet wird /job/inputs/case.zip mit dem SERVERSEITIG gebauten Fall
(system/, constant/, 0/, Allrun) plus case.yaml und run_id.txt im Wurzel-
verzeichnis des Archivs. Ausgang: /job/results/artifacts.zip mit exakt den
Artefakten, die auch der Server-Runner erzeugt (manifest.json, result.json,
normalized.parquet, figures/, fields/) — der Import-Endpoint legt sie
unverändert in die Laufablage, die Ergebnis-Phase merkt keinen Unterschied.

Fortschritt als NDJSON auf stdout (Companion-Protokoll wie beim
Flood2D-Solver): {"event":"log"|"progress"|"done"|"error", ...}.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import zipfile
from pathlib import Path

FOAM_BASHRC = os.environ.get(
    "FOAM_BASHRC", "/usr/lib/openfoam/openfoam2406/etc/bashrc")
SAFE_MEMBER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")
# Kerne für den Rechenlauf. 0/leer = automatisch (alle sichtbaren Kerne,
# gedeckelt). Der Server-Runner macht das schon lange; lokal lief bisher
# alles seriell — bei 724k Zellen ist das der Unterschied zwischen
# 9 Stunden und gut einer.
def _cores() -> int:
    """Kernzahl fuer den lokalen Lauf — bewusst OHNE Obergrenze.

    Die Maschine gehoert dem Nutzer: ein 16-Kerner soll 16 Kerne rechnen
    (Entscheidung 2026-08-11, vorher bei 8 gedeckelt). Der Server-Runner
    (core/runner.py) deckelt weiterhin auf os.cpu_count() — die Maschine
    dort ist geteilt; das ist kein Drift, sondern der Unterschied.

    Namen wie beim Server: FLOOD3D_CORES, Altname QUAGG_FOAM_CORES. Eine
    Vorgabe ueber der Kernzahl ist erlaubt (mpirun laeuft mit
    --oversubscribe), bringt aber praktisch nie etwas.
    """
    for name in ("FLOOD3D_CORES", "QUAGG_FOAM_CORES"):
        env = os.environ.get(name, "").strip()
        if env.isdigit() and int(env) > 0:
            return int(env)
    return erlaubte_kerne()


def erlaubte_kerne(cpu_max=Path("/sys/fs/cgroup/cpu.max"),
                   quota=Path("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"),
                   periode=Path("/sys/fs/cgroup/cpu/cpu.cfs_period_us")) -> int:
    """
    Kerne, die dieser Prozess WIRKLICH bekommt.

    ``os.cpu_count()`` meldet die CPUs der MASCHINE, nicht die des
    Containers: In einem Cloud-Container mit 16 zugeteilten vCPUs auf einem
    64-Kern-Knoten kaeme 64 heraus, mpirun startete 64 Raenge auf 16 Kernen
    und der Lauf wuerde langsamer statt schneller (gefunden 2026-08-12 am
    ersten RunPod-Lauf). Deshalb zusaetzlich:

    * ``sched_getaffinity`` — greift bei ``--cpuset-cpus``
    * cgroup v2 ``cpu.max`` bzw. v1 ``cfs_quota/period`` — greift bei
      ``--cpus`` und bei RunPod/Kubernetes-Kontingenten

    Die kleinste dieser Zahlen gewinnt. Auf einer freien Maschine (Fabios
    Rechner) aendert das nichts: dort ist nichts begrenzt.
    """
    kandidaten = []
    try:
        kandidaten.append(len(os.sched_getaffinity(0)))
    except (AttributeError, OSError):
        pass
    try:
        roh = Path(cpu_max).read_text().split()
        if len(roh) == 2 and roh[0] != "max":
            kandidaten.append(round(int(roh[0]) / int(roh[1])))
    except (OSError, ValueError, ZeroDivisionError):
        pass
    try:
        q = int(Path(quota).read_text())
        p = int(Path(periode).read_text())
        if q > 0 and p > 0:
            kandidaten.append(round(q / p))
    except (OSError, ValueError, ZeroDivisionError):
        pass
    kandidaten.append(os.cpu_count() or 1)
    return max(1, min(k for k in kandidaten if k and k > 0))


def emit(**ev) -> None:
    print(json.dumps(ev), flush=True)


# Dateisysteme, die ueber eine Virtualisierungsbruecke laufen. OpenFOAM
# schreibt permanent (Logs, Prozessorordner, Zeitschritte) — auf diesen
# Bruecken kostet das ein Vielfaches. Genau daran scheitert ein sonst
# gesunder Rechner (Audit Rechenorte, 2026-08-12).
LANGSAME_FS = {
    "9p": "Docker-Desktop-Bruecke (WSL1/Hyper-V)",
    "drvfs": "Windows-Laufwerk ueber WSL",
    "virtiofs": "Docker-Desktop-Bruecke (macOS/Windows)",
    "cifs": "Netzlaufwerk",
    "nfs": "Netzlaufwerk",
    "fuse.grpcfuse": "Docker-Desktop-Bruecke (osxfs/gRPC-FUSE)",
}


def _dateisystem(pfad: Path) -> tuple[str, str]:
    """(Typ, Klartext) des Dateisystems, auf dem `pfad` liegt."""
    try:
        eintraege = []
        for zeile in Path("/proc/mounts").read_text().splitlines():
            teile = zeile.split()
            if len(teile) >= 3:
                eintraege.append((teile[1], teile[2]))
    except OSError:
        return "?", ""
    ziel = str(pfad.resolve())
    treffer = max((e for e in eintraege if ziel.startswith(e[0])),
                  key=lambda e: len(e[0]), default=("", "?"))
    return treffer[1], LANGSAME_FS.get(treffer[1], "")


def _bench_platte(ordner: Path) -> dict:
    """
    Schreibtempo DORT, wo der Lauf schreibt — in zwei Mustern:
    eine grosse Datei (Felder) und viele kleine (Logs, Prozessordateien,
    Zeitschritte). Auf einer Docker-Desktop-Bruecke bricht vor allem das
    zweite Muster ein; genau das ist das OpenFOAM-Lastbild.
    """
    import shutil
    mess = ordner / "_bench"
    mess.mkdir(parents=True, exist_ok=True)
    out: dict = {}
    try:
        block = b"\0" * (1024 * 1024)
        t0 = time.time()
        with open(mess / "gross.bin", "wb") as f:
            for _ in range(64):
                f.write(block)
            f.flush()
            os.fsync(f.fileno())
        out["platte_mb_s"] = round(64 / max(time.time() - t0, 1e-9))
        t0 = time.time()
        for i in range(300):
            (mess / f"k_{i}.txt").write_text("x")
        out["platte_dateien_s"] = round(300 / max(time.time() - t0, 1e-9))
    except OSError as e:
        out["platte_fehler"] = str(e)[:120]
    finally:
        shutil.rmtree(mess, ignore_errors=True)
    return out


def _bench_cpu() -> int:
    """
    Ein-Kern-Rechenwert (dimensionslos): dieselbe Python-Schleife im selben
    Image — als RELATIVER Vergleich zwischen Maschinen brauchbar, mehr nicht.
    Referenz: unser Server misst hier ~9 (kalibriert 2026-08-12).
    """
    t0 = time.time()
    x = 0.0
    for i in range(2_000_000):
        x += i * 1e-9
        x *= 0.9999999
    return round(2.0 / max(time.time() - t0, 1e-9))


def maschinen_bericht(job: Path, cores: int) -> dict:
    """
    Womit hier gerechnet wird — und ob etwas davon bremst.

    Ohne diese Angaben laesst sich ein langsamer Lauf auf einer fremden
    Maschine nur raten: Kerne, Speicher, gemeinsamer Speicher und vor allem
    das Dateisystem des Job-Ordners entscheiden ueber die Laufzeit.
    """
    bericht: dict = {"kerne_benutzt": cores, "kerne_sichtbar": os.cpu_count()}
    try:
        for zeile in Path("/proc/meminfo").read_text().splitlines():
            if zeile.startswith("MemTotal:"):
                bericht["ram_gb"] = round(int(zeile.split()[1]) / 1024 ** 2, 1)
            elif zeile.startswith("MemAvailable:"):
                bericht["ram_frei_gb"] = round(int(zeile.split()[1]) / 1024 ** 2, 1)
    except (OSError, ValueError, IndexError):
        pass
    try:
        st = os.statvfs("/dev/shm")
        bericht["shm_mb"] = round(st.f_blocks * st.f_frsize / 1024 ** 2)
    except OSError:
        pass
    try:
        for zeile in Path("/proc/meminfo").read_text().splitlines():
            if zeile.startswith("SwapTotal:"):
                bericht["swap_gb"] = round(int(zeile.split()[1]) / 1024 ** 2, 1)
            elif zeile.startswith("SwapFree:"):
                bericht["swap_frei_gb"] = round(int(zeile.split()[1]) / 1024 ** 2, 1)
    except (OSError, ValueError, IndexError):
        pass
    typ, warnung = _dateisystem(job)
    bericht["job_fs"] = typ
    if warnung:
        bericht["job_fs_warnung"] = warnung
    bericht.update(_bench_platte(job))
    bericht["cpu_wert"] = _bench_cpu()
    try:
        bericht["kern"] = os.uname().release
    except AttributeError:
        pass
    return bericht


def unpack_case(job: Path) -> Path:
    src = job / "inputs" / "case.zip"
    case = job / "case"
    if case.exists():
        shutil.rmtree(case)
    case.mkdir(parents=True)
    with zipfile.ZipFile(src) as z:
        for m in z.namelist():
            # Zip-Slip-Schutz: nur harmlose relative Pfade entpacken
            if not SAFE_MEMBER.match(m) or ".." in m:
                raise ValueError(f"Unsicherer Archivpfad: {m!r}")
        z.extractall(case)
    return case


def _mitgelieferter_core(job: Path, case: Path) -> str | None:
    """
    Das Bundle bringt den Core des Servers mit, der den Fall gebaut hat.
    Diese Kopie schlägt die ins Image gebackene — sonst kippt JEDE neue
    Angabe in der Spezifikation den lokalen Lauf mit „Extra inputs are not
    permitted", solange der Nutzer sein Image nicht neu zieht.
    """
    mit = case / "quagg_runtime"
    ziel = job / "quagg_runtime"
    if mit.is_dir():
        # aus dem Fallordner heraus, damit OpenFOAM und artifacts.zip
        # nichts davon mitbekommen
        if ziel.exists():
            shutil.rmtree(ziel)
        shutil.move(str(mit), str(ziel))
    if (ziel / "flood3D" / "core" / "casespec.py").is_file():
        return str(ziel)
    return None


def _runner_uebergabe(eigen: str | None) -> None:
    """
    Die ins Image gebackene Runner-Kopie übergibt an die aus dem Bundle —
    dieselbe Logik wie beim Core: das Bundle stammt vom Server, der den
    Fall gebaut hat, und kennt jeden neuen Pipeline-Schritt. Ohne die
    Übergabe fehlte z. B. surfaceFeatureExtract (2026-08-06), und snappy
    brach ohne .eMesh-Kanten ab. Der Umgebungswächter verhindert Schleifen.
    """
    if not eigen or os.environ.get("QUAGG_RUNNER_UEBERGEBEN"):
        return
    neu = Path(eigen) / "flood3D" / "engines" / "local" / "local_runner.py"
    try:
        selbst = Path(__file__).resolve()
    except OSError:
        return
    if not neu.is_file() or neu.resolve() == selbst:
        return
    emit(event="log", text="Runner: aus dem Bundle")
    os.environ["QUAGG_RUNNER_UEBERGEBEN"] = "1"
    os.execv(sys.executable, [sys.executable, str(neu)] + sys.argv[1:])


def run_foam_step(case: Path, command: str, log_name: str,
                  end_time: float | None = None) -> None:
    """
    Ein OpenFOAM-Kommando DIREKT (wir sind schon im Foam-Container).
    Beim Solver wird das Log live auf `Time = X` beobachtet und als
    Fortschritt gemeldet.
    """
    emit(event="log", text=f"▶ {command}")
    log_path = case / log_name
    with open(log_path, "w", encoding="utf-8") as lf:
        proc = subprocess.Popen(
            ["bash", "-lc", f"source {FOAM_BASHRC} >/dev/null 2>&1; "
                            f"cd '{case}' && {command}"],
            stdout=lf, stderr=subprocess.STDOUT)
        pos = 0
        letzte_meldung = 0.0
        letzte_zeit = None
        start = time.time()
        while proc.poll() is None:
            time.sleep(2)
            if not end_time:
                continue
            try:
                with open(log_path, encoding="utf-8", errors="replace") as f:
                    f.seek(pos)
                    chunk = f.read()
                    pos = f.tell()
                for m in re.finditer(r"^Time = ([0-9.eE+-]+)", chunk, re.M):
                    letzte_zeit = float(m.group(1))
                # alle 15 s Wanduhr melden — nicht erst ab end_time/50.
                # Sonst sieht der Nutzer bei langen Läufen minutenlang
                # nichts und hält den Lauf für hängengeblieben.
                if time.time() - letzte_meldung >= 15 and letzte_zeit is not None:
                    letzte_meldung = time.time()
                    frac = min(letzte_zeit / end_time, 1.0)
                    verstrichen = time.time() - start
                    rest = (verstrichen / frac - verstrichen) if frac > 0.001 else None
                    emit(event="progress", phase="solving", time=letzte_zeit,
                         end_time=end_time, fraction=round(frac, 4),
                         elapsed_s=round(verstrichen),
                         eta_s=round(rest) if rest else None)
            except OSError:
                pass
        if proc.returncode != 0:
            text = log_path.read_text(errors="replace")
            # OpenFOAM/MPI schreiben die eigentliche Ursache als
            # "--> FOAM FATAL ..." oder "Error"; die reine Schwanzausgabe
            # erwischt sonst nur Hilfetexte.
            kern = ""
            for marke in ("--> FOAM FATAL", "FOAM FATAL", "Error:",
                          "not enough slots", "No times selected",
                          "--> FOAM Warning"):
                i = text.find(marke)
                if i >= 0:
                    kern = text[i:i + 500].strip()
                    break
            raise RuntimeError(f"{command} fehlgeschlagen "
                               f"(Exit {proc.returncode}):\n"
                               f"{kern or text[-500:]}")


MPI = ("mpirun --allow-run-as-root --use-hwthread-cpus --oversubscribe")


def _shm_pruefen(cores: int) -> None:
    """
    Docker gibt einem Container ohne --shm-size nur 64 MB /dev/shm. OpenMPI
    legt dort seine Rang-Puffer ab; bei vielen Raengen reicht das nicht und
    mpirun stirbt mit einer Meldung, die niemand mit Docker in Verbindung
    bringt. Der Companion setzt das ab v1.5.1 — aeltere Installationen
    sollen wenigstens im Log erfahren, woran es lag.
    """
    if cores <= 8:
        return
    try:
        st = os.statvfs("/dev/shm")
    except OSError:
        return
    mb = st.f_blocks * st.f_frsize / 1024 ** 2
    if mb < 256:
        emit(event="log",
             text=f"Hinweis: /dev/shm hat nur {mb:.0f} MB — bei {cores} "
                  "Kernen kann mpirun daran scheitern. Companion auf "
                  "v1.5.1 aktualisieren (setzt --shm-size=2g).")


def _decompose_dict(case: Path, cores: int) -> None:
    (case / "system" / "decomposeParDict").write_text(
        "FoamFile{version 2.0;format ascii;class dictionary;"
        'location "system";object decomposeParDict;}\n'
        f"numberOfSubdomains {cores};\n\nmethod scotch;\n")


def _zeit_ordner(case: Path) -> list[float]:
    """Vorhandene Ausgabezeitpunkte (> 0) eines Falls."""
    out = []
    if not case.is_dir():
        return out
    for d in case.iterdir():
        if not d.is_dir():
            continue
        try:
            t = float(d.name)
        except ValueError:
            continue
        if t > 0:
            out.append(t)
    return sorted(out)


def _letzte_zeit(case: Path) -> float | None:
    ts = _zeit_ordner(case)
    return ts[-1] if ts else None


def _setze_start(case: Path, wert: str) -> None:
    """startFrom in der controlDict umstellen (für die Wiederaufnahme)."""
    cd = case / "system" / "controlDict"
    txt = cd.read_text(errors="replace")
    cd.write_text(re.sub(r"startFrom\s+\w+;", f"startFrom       {wert};", txt))


def _setze_stopp(case: Path, wert: str = "endTime") -> None:
    """
    stopAt zurückstellen. Die PAUSE schreibt `stopAt writeNow` in die
    controlDict (der Solver schreibt den laufenden Zeitschritt und hält
    an). Ohne dieses Zurückstellen läse der fortgesetzte Lauf genau das
    wieder und hielte SOFORT wieder an — die Wiederaufnahme käme keinen
    Zeitschritt weit.
    """
    cd = case / "system" / "controlDict"
    txt = cd.read_text(errors="replace")
    cd.write_text(re.sub(r"stopAt\s+\w+;", f"stopAt          {wert};", txt))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", required=True)
    ap.add_argument("--resume", action="store_true",
                    help="angefangenen Lauf fortsetzen statt neu aufsetzen")
    args = ap.parse_args()
    job = Path(args.job)
    results = job / "results"
    results.mkdir(parents=True, exist_ok=True)

    try:
        import yaml

        # Wiederaufnahme: liegt schon ein vernetzter Fall mit
        # Zwischenergebnissen im Job-Ordner, wird NICHT neu vernetzt —
        # sonst wäre nach einem Absturz die gesamte Rechenzeit verloren.
        cores = _cores()
        _shm_pruefen(cores)
        maschine = maschinen_bericht(job, cores)
        emit(event="log", text=(
            f"Maschine: {cores} Raenge von {maschine.get('kerne_sichtbar')} "
            f"sichtbaren CPUs · {maschine.get('ram_gb', '?')} GB RAM "
            f"({maschine.get('ram_frei_gb', '?')} GB frei) · Job-Ordner auf "
            f"{maschine.get('job_fs', '?')}"))
        # Referenzwerte: unser Server (2026-08-12). Der Vergleich macht aus
        # nackten Zahlen eine Diagnose, die der Nutzer selbst lesen kann.
        emit(event="log", text=(
            f"Selbsttest: Platte {maschine.get('platte_mb_s', '?')} MB/s "
            f"(Server ~570) · kleine Dateien "
            f"{maschine.get('platte_dateien_s', '?')}/s (Server ~9600) · "
            f"CPU-Wert {maschine.get('cpu_wert', '?')} (Server ~9)"))
        if (maschine.get("platte_dateien_s") or 99999) < 1000:
            emit(event="log", text=(
                "WARNUNG: Der Job-Ordner schreibt kleine Dateien sehr "
                "langsam — typisch fuer einen Bind-Mount ueber die "
                "Docker-Desktop-Bruecke. OpenFOAM schreibt staendig; das "
                "kann den Lauf um ein Vielfaches verlangsamen. Abhilfe: "
                "Companion mit Docker-Volume (QUAGG_SIBLING_VOLUME_OPENFOAM) "
                "betreiben."))
        if (maschine.get("ram_frei_gb") or 99) < 2:
            emit(event="log", text=(
                f"WARNUNG: Nur {maschine.get('ram_frei_gb')} GB RAM frei — "
                "die Docker-VM ist zu knapp bemessen oder es laeuft zu viel "
                "nebenher. Wenn der Lauf zu swappen beginnt, bricht das "
                "Tempo um Groessenordnungen ein (Docker Desktop -> "
                "Settings -> Resources)."))
        if maschine.get("job_fs_warnung"):
            emit(event="log", text=(
                f"WARNUNG: Der Job-Ordner liegt auf einer "
                f"{maschine['job_fs_warnung']}. OpenFOAM schreibt dort "
                "staendig — das kann den Lauf um ein Vielfaches verlangsamen. "
                "Abhilfe: Companion auf ein Docker-Volume umstellen."))
        case = job / "case"
        fortsetzen = args.resume and _letzte_zeit(case) is not None
        if not fortsetzen:
            case = unpack_case(job)

        eigen = _mitgelieferter_core(job, case)
        _runner_uebergabe(eigen)
        sys.path.insert(0, "/opt/quagg")
        if eigen:
            sys.path.insert(0, eigen)
        emit(event="log",
             text=f"Core: {'aus dem Bundle' if eigen else 'aus dem Image'}")
        from flood3D.core.casespec import CaseSpec, migriere
        from flood3D.core.evaluate import evaluate_run, overfall_cd_rows
        from flood3D.core.extract import extract_case
        from flood3D.core.foamfields import (bed_shear_series,
                                             convert_case_fields,
                                             energy_head_series,
                                             viz_volume_check)
        from flood3D.core.normalize import write_normalized
        from flood3D.core.render import render_run
        from flood3D.core.runner import (_pruefe_patches, _y_plus_range,
                                         parse_checkmesh)

        spec = CaseSpec.model_validate(
            migriere(yaml.safe_load((case / "case.yaml").read_text())))
        run_id = (case / "run_id.txt").read_text().strip()

        if fortsetzen:
            t0 = _letzte_zeit(case)
            emit(event="log", text=f"Lauf {run_id} wird bei t = {t0} s "
                                   "fortgesetzt (Netz bleibt stehen)")
            _setze_start(case, "latestTime")
            _setze_stopp(case, "endTime")
        else:
            emit(event="log", text=f"Fall entpackt, Lauf {run_id} "
                                   f"({spec.meta.title or spec.meta.id})")

        # ---- Netz + Initialisierung (Reihenfolge wie Server-Runner) ------
        if not fortsetzen:
            emit(event="progress", phase="meshing", fraction=0.0)
            run_foam_step(case, "blockMesh", "log.blockMesh")
            # Kanten der Bauwerksflächen herausziehen — das
            # snappyHexMeshDict verweist unter `features` darauf, ohne die
            # .eMesh-Dateien bricht snappyHexMesh sofort ab
            if (case / "system" / "surfaceFeatureExtractDict").exists():
                run_foam_step(case, "surfaceFeatureExtract",
                              "log.surfaceFeatureExtract")
            # snappyHexMesh ist bei feinen Netzen der teuerste Schritt und
            # laeuft ebenfalls parallel — sonst haengt der Lauf minutenlang
            # auf einem Kern, waehrend elf danebenstehen.
            if cores > 1:
                _decompose_dict(case, cores)
                run_foam_step(case, "decomposePar -force -copyZero",
                              "log.decomposePar_mesh")
                emit(event="log", text=f"Vernetze auf {cores} Kernen")
                run_foam_step(case,
                              f"{MPI} -np {cores} "
                              "snappyHexMesh -overwrite -parallel",
                              "log.snappyHexMesh")
                run_foam_step(case, "reconstructParMesh -constant",
                              "log.reconstructParMesh")
                shutil.rmtree(case / "processor0", ignore_errors=True)
                for d in case.glob("processor*"):
                    shutil.rmtree(d, ignore_errors=True)
            else:
                run_foam_step(case, "snappyHexMesh -overwrite",
                              "log.snappyHexMesh")
            if (case / "system" / "topoSetDict").exists():
                run_foam_step(case, "topoSet", "log.topoSet")
            if (case / "system" / "createPatchDict").exists():
                run_foam_step(case, "createPatch -overwrite", "log.createPatch")
            _pruefe_patches(case, spec)
            run_foam_step(case, "checkMesh", "log.checkMesh")
            if (case / "system" / "setFieldsDict").exists():
                run_foam_step(case, "setFields", "log.setFields")
        cm = parse_checkmesh(
            (case / "log.checkMesh").read_text(errors="replace")
            if (case / "log.checkMesh").exists() else "")
        if not fortsetzen:
            emit(event="log",
                 text=f"checkMesh: {'OK' if cm.get('checkmesh_ok') else 'mit Befunden'}"
                      f" · {cm.get('cells', '?')} Zellen")

        # ---- Rechenlauf ---------------------------------------------------
        app_name = spec.solver.application
        if cores > 1:
            _decompose_dict(case, cores)
            run_foam_step(case, "decomposePar -force", "log.decomposePar")
            emit(event="log", text=f"Rechne auf {cores} Kernen")
            run_foam_step(case,
                          f"{MPI} -np {cores} {app_name} -parallel",
                          f"log.{app_name}", end_time=spec.solver.end_time)
            try:
                run_foam_step(case, "reconstructPar -newTimes",
                              "log.reconstructPar")
            except RuntimeError as e:
                # "No times selected" heisst: der Solver hat keinen
                # Ausgabezeitpunkt geschrieben. Das ist kein Absturz,
                # aber ohne Felder gibt es nichts auszuwerten.
                if "No times selected" in str(e):
                    raise RuntimeError(
                        "Der Lauf hat keinen Ausgabezeitpunkt geschrieben — "
                        "die Feldausgabe ist groesser als die "
                        "Simulationsdauer. Schreibintervall verkleinern "
                        "oder laenger rechnen.") from None
                raise
        else:
            run_foam_step(case, app_name, f"log.{app_name}",
                          end_time=spec.solver.end_time)

        # ---- Nachlauf: exakt die Server-Kette -----------------------------
        emit(event="progress", phase="postprocessing", fraction=1.0)

        # Tatsaechlich vernetzte Oberflaeche — ohne sie kann der Viewer
        # weder Bauwerke noch das Solver-Netz einblenden. surfaceMeshExtract
        # endet auch bei Erfolg mit rc != 0, deshalb ohne Abbruch.
        patches = (["terrain"] if spec.terrain is not None else []) \
            + [st.patch for st in spec.structures if st.type != "screen"]
        if patches:
            try:
                run_foam_step(case, "surfaceMeshExtract meshSurface.stl "
                              f"-time 0 -patches '({' '.join(patches)})'",
                              "log.surfaceMeshExtract")
            except RuntimeError:
                pass
            from flood3D.core.meshsurface import find_mesh_surface
            if find_mesh_surface(case) is None:
                emit(event="log", text="WARNUNG: Solver-Netzoberflaeche nicht "
                     "extrahiert — Bauwerke/Netz fehlen im Viewer")

        ypr = _y_plus_range(case)
        # Wie im Server-Runner geschützt (F12-Drift): scheitert die
        # Feldkonvertierung, stirbt NICHT der ganze Lauf nach Stunden
        # Rechenzeit — die Zeitreihen und Nachweise bleiben nutzbar, nur
        # die 3D-Felder fehlen (und das steht im Manifest)
        conv = {}
        fields_error = None
        try:
            run_foam_step(case,
                          "postProcess -noFunctionObjects -func writeCellCentres -time 0",
                          "log.writeCellCentres")
            conv = convert_case_fields(spec, case, job)
        except Exception as e:               # noqa: BLE001
            fields_error = str(e)
            emit(event="log", text="WARNUNG: 3D-Felder nicht konvertiert — "
                 + str(e) + " (Zeitreihen und Nachweise bleiben nutzbar)")
        if conv.get("terrain_error"):
            emit(event="log", text="WARNUNG: Geländeschicht nicht erzeugt — "
                 + conv["terrain_error"] + " (Ergebnisse bleiben nutzbar, "
                 "im Viewer fehlt nur das Gelände)")
        df, missing = extract_case(case, spec, run_id)

        import pandas as pd
        rows = (bed_shear_series(spec, job, run_id)
                + energy_head_series(spec, job, run_id))
        if rows:
            df = pd.concat([df, pd.DataFrame(rows)], ignore_index=True)
        cd_rows = overfall_cd_rows(df, spec, run_id)
        if cd_rows:
            df = pd.concat([df, pd.DataFrame(cd_rows)], ignore_index=True)
        write_normalized(df, job / "normalized.parquet")

        from flood3D.core.foam import (foam_abweichung,
                                       foam_version_aus_log)
        foam_v = foam_version_aus_log(case)
        foam_hinweis = foam_abweichung(foam_v)
        if foam_hinweis:
            emit(event="log", text=f"WARNUNG: {foam_hinweis}")
        manifest = {"status": "completed", "origin": "companion",
                    "foam": foam_v, "foam_hinweis": foam_hinweis,
                    # Womit gerechnet wurde, gehoert in den Nachweis - und
                    # die Ist-Kosten eines Cloud-Laufs haengen daran
                    "cores": cores, "maschine": maschine,
                    "title": spec.meta.title, "checkmesh": cm,
                    "checkmesh_ok": cm.get("checkmesh_ok"),
                    "missing_sources": missing, "finished": time.time()}
        if conv.get("terrain_error"):
            # Muss mit zum Server: die Warnung im Logstrom ist nach dem
            # Schließen des Fensters weg, und ohne diesen Eintrag stand
            # man vor einem Lauf ohne Gelände und ohne Erklärung
            manifest["terrain_error"] = conv["terrain_error"]
        if fields_error:
            manifest["fields_error"] = fields_error
        if ypr:
            manifest["y_plus_range"] = [round(ypr[0], 2), round(ypr[1], 2)]
        # Selbsttest: Wasservolumen im Visualisierungsgitter vs. Solver
        vol_check = viz_volume_check(job, df)
        if vol_check:
            manifest.update(vol_check)
        result = evaluate_run(df, spec, run_id, manifest)
        render_run(result, df, spec, job)
        (job / "manifest.json").write_text(json.dumps(manifest))

        # ---- Artefakte paketieren ----------------------------------------
        art = results / "artifacts.zip"
        with zipfile.ZipFile(art, "w", zipfile.ZIP_DEFLATED) as z:
            for name in ("manifest.json", "result.json", "normalized.parquet"):
                p = job / name
                if p.exists():
                    z.write(p, name)
            for sub in ("figures", "fields"):
                d = job / sub
                if d.is_dir():
                    for f in sorted(d.rglob("*")):
                        if f.is_file():
                            z.write(f, f"{sub}/{f.relative_to(d)}")
            # Szenengeometrie fuer den Viewer: Eingabe-Bauwerke und die
            # vernetzte Solver-Oberflaeche. Der Server erwartet sie unter
            # case/ (dort sucht /runs/{id}/geometry).
            tri = case / "constant" / "triSurface"
            if tri.is_dir():
                for f in sorted(tri.glob("*.stl")):
                    z.write(f, f"case/constant/triSurface/{f.name}")
            for f in sorted(case.glob("meshSurface*.stl")):
                z.write(f, f"case/{f.name}")
        emit(event="done", artifactsFile="artifacts.zip", run_id=run_id,
             sizeBytes=art.stat().st_size)
        return 0
    except Exception as e:  # noqa: BLE001 — Fehler gehört als Event zum Companion
        emit(event="error", text=f"{type(e).__name__}: {str(e)[:500]}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
