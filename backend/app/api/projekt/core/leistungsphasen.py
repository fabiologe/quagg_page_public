"""HOAI-Leistungsphasen 1–9 — Bezeichnungen (Vokabular aus dem frueheren
models/domain.py). Gewichte je Leistungsbild kommen mit Stufe 2 als
editierbare Vorlagen in die Datenbank, nicht hierher."""

import re

LPH = {
    1: "Grundlagenermittlung",
    2: "Vorplanung",
    3: "Entwurfsplanung",
    4: "Genehmigungsplanung",
    5: "Ausführungsplanung",
    6: "Vorbereitung der Vergabe",
    7: "Mitwirkung bei der Vergabe",
    8: "Objektüberwachung",
    9: "Objektbetreuung",
}

_UMLAUTE = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe",
                          "Ü": "Ue", "ß": "ss"})


def slug(text: str, maximal: int = 60) -> str:
    """Dateisystem-sicherer Name: Umlaute transliteriert, alles ausser
    [A-Za-z0-9] wird zu '_', nie leer, nie laenger als `maximal`."""
    roh = (text or "").translate(_UMLAUTE)
    roh = re.sub(r"[^A-Za-z0-9]+", "_", roh).strip("_")
    return roh[:maximal].strip("_")


def ordnername_lph(nr: int) -> str:
    if nr not in LPH:
        raise ValueError(f"unbekannte leistungsphase {nr}")
    return f"LPH{nr}_{slug(LPH[nr])}"
