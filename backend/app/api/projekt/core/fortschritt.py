"""Fortschritt und Honorarverteilung — reine Arithmetik in Cent, ohne DB.

Leistung (netto) L = Σ honorar_cent_i × fortschritt_i / 100 ueber beauftragte,
nicht entfallene Abschnitte; Gesamtfortschritt = L / Σ honorar_cent_i.
"""

AKTIV = ("offen", "laufend", "fertig", "abgenommen")


def zaehlt(abschnitt: dict) -> bool:
    return bool(abschnitt.get("beauftragt")) and abschnitt.get("status", "offen") in AKTIV


def leistung(abschnitte: list[dict]) -> dict:
    """Kennzahlen fuer Balken und Portfolio; Prozent auf eine Nachkommastelle."""
    beauftragt = 0
    leistung_cent = 0
    gesamt = 0
    for a in abschnitte:
        gesamt += int(a["honorar_cent"])
        if not zaehlt(a):
            continue
        beauftragt += int(a["honorar_cent"])
        leistung_cent += int(a["honorar_cent"]) * int(a["fortschritt_prozent"]) // 100
    prozent = round(leistung_cent * 1000 / beauftragt) / 10 if beauftragt else 0.0
    return {"honorar_gesamt_cent": gesamt, "honorar_beauftragt_cent": beauftragt,
            "leistung_cent": leistung_cent, "prozent": prozent}


def verteile(gesamt_cent: int, prozente: list[int]) -> list[int]:
    """Verteilt ein Gesamthonorar nach Prozenten auf Cent-Betraege, so dass die
    Summe EXAKT dem Gesamtbetrag entspricht (Rest geht auf den groessten Anteil)."""
    if gesamt_cent < 0:
        raise ValueError("gesamt_cent darf nicht negativ sein")
    summe = sum(prozente)
    if summe <= 0:
        raise ValueError("prozente muessen in summe groesser als null sein")
    betraege = [gesamt_cent * p // summe for p in prozente]
    rest = gesamt_cent - sum(betraege)
    if rest:
        groesster = max(range(len(prozente)), key=lambda i: prozente[i])
        betraege[groesster] += rest
    return betraege
