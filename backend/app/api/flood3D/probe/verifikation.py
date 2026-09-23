"""
Wehr-Nachlauf ohne RunPod (Fahrplan A6, Fabio 2026-09-23: nichts auf RunPod).

Rechnet den bestehenden Verifikationsfall (tests/verifikation_wehr.py,
unverändert) über probe_lauf im Server-Docker und schreibt das Ergebnis im
BISHERIGEN Format nach data/verifikation/wehr_ueberfall.json — dieselbe
Datei, die GET /verifikation und die Karte in Phase „Simulation" zeigen,
dazu `ort` und `numerik_version`. Den Beiwert rechnet dieselbe Funktion wie
jeder Nutzerlauf (evaluate.overfall_cd_rows), bewertet wird wie bisher der
Median des letzten Drittels gegen die eingefrorene Referenz.

    cd backend
    venv/bin/python -m app.api.flood3D.probe.probe_lauf --fall wehr --name a6_wehr
    venv/bin/python -m app.api.flood3D.probe.verifikation a6_wehr
"""
from __future__ import annotations

import json
import shutil
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

from ..core.casespec import CaseSpec
from ..core.conventions import NUMERIK_VERSION
from ..core.evaluate import overfall_cd_rows
from ..core.extract.case_reader import extract_case
from ..tests.verifikation_wehr import CD_PLAUSIBEL, CD_REFERENZ, CD_TOLERANZ_REL
from .probe_lauf import WURZEL

ZIEL = WURZEL.parent / "verifikation" / "wehr_ueberfall.json"


def wehr_bewerten(job: Path) -> dict:
    spec = CaseSpec.from_yaml(job / "fall" / "case.yaml")
    df, _ = extract_case(job / "case", spec, job.name)
    # Nur vollständige Läufe: am 2026-09-23 schrieb ein Wächter das Ergebnis
    # eines bei t = 8,3 s abgebrochenen Laufs (C_d 0,48, „nicht bestanden")
    # in die live angezeigte Datei
    t_ende = float(df["time"].max()) if len(df) else 0.0
    if t_ende < 0.98 * spec.solver.end_time:
        raise SystemExit(f"Lauf endete bei t = {t_ende:g} s, verlangt "
                         f"{spec.solver.end_time:g} s — keine Verifikation")
    cd = pd.DataFrame(overfall_cd_rows(df, spec, job.name))
    if cd.empty:
        raise SystemExit("Keine Überfallbeiwert-Reihe — Wehr nicht überströmt?")
    cd = cd[cd["location_id"] == "wehr"].sort_values("time")
    hinten = cd.iloc[int(len(cd) * 2 / 3):]
    cd_sim = float(hinten["value"].median())
    streuung = float(hinten["value"].std())
    if CD_REFERENZ is not None:
        band = (CD_REFERENZ * (1 - CD_TOLERANZ_REL), CD_REFERENZ * (1 + CD_TOLERANZ_REL))
        band_art = f"eingefrorene Referenz {CD_REFERENZ:g} ± {CD_TOLERANZ_REL:.0%}"
    else:
        band, band_art = CD_PLAUSIBEL, "Literatur-Plausibilität breitkronig"
    probe = json.loads((job / "probe.json").read_text()) if (job / "probe.json").is_file() else {}
    return {
        "fall": "wehr_ueberfall",
        "run_id": job.name,
        "titel": "Wehrüberfall (breitkronig) gegen die Überfallformel",
        "geprueft": time.strftime("%Y-%m-%d %H:%M"),
        "dauer_s": probe.get("clock_s"),
        "zellen": probe.get("zellen"),
        "cd_sim": round(cd_sim, 4),
        "cd_streuung": round(streuung, 4) if np.isfinite(streuung) else None,
        "band": [round(band[0], 4), round(band[1], 4)],
        "band_art": band_art,
        "bestanden": bool(band[0] <= cd_sim <= band[1]),
        "formel": "Q = C_d · 2/3 · √(2g) · b · h^1,5",
        "ort": "server-docker",
        "numerik_version": NUMERIK_VERSION,
    }


def main(argv=None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    erg = wehr_bewerten(WURZEL / argv[0])
    if ZIEL.is_file():
        alt = json.loads(ZIEL.read_text())
        sicherung = ZIEL.with_suffix(f".{alt.get('geprueft', 'alt')[:10]}.bak")
        if not sicherung.exists():
            shutil.copy(ZIEL, sicherung)
    ZIEL.write_text(json.dumps(erg, indent=2, ensure_ascii=False))
    print(json.dumps(erg, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
