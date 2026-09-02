"""Kuratierter SKR04-Kontenrahmen fuer ein Ingenieurbuero als UG.

EINE Quelle: aus dieser Liste wird migrations/003_seed_skr04.sql generiert
(cli.py skr04-sql), und ein Test haelt beide auf demselben Stand. Wer ein Konto
ergaenzt, aendert HIER und erzeugt die Seed-Datei neu — nie umgekehrt.

Die Nummern folgen dem DATEV-SKR04. Bewusst eine Teilmenge (~40 statt tausender
Konten): was ein Einzel-Ingenieurbuero im ersten Jahr tatsaechlich braucht.
Erweiterung spaeter per neuer Migration (INSERT), nie per Aenderung des Seeds.
"""

# (kontonr, bezeichnung, kontoart)
KONTEN = [
    # Anlagevermoegen
    ("0135", "EDV-Software", "AKTIV"),
    ("0650", "Bueroeinrichtung", "AKTIV"),
    ("0670", "Geringwertige Wirtschaftsgueter", "AKTIV"),
    # Forderungen / Vorsteuer / Finanz
    ("1200", "Forderungen aus Lieferungen und Leistungen", "FORDERUNG"),
    ("1401", "Abziehbare Vorsteuer 7 %", "STEUER"),
    ("1406", "Abziehbare Vorsteuer 19 %", "STEUER"),
    ("1460", "Geldtransit", "FINANZ"),
    ("1550", "Forderungen gegen Gesellschafter", "FORDERUNG"),
    ("1600", "Kasse", "FINANZ"),
    ("1800", "Bank", "FINANZ"),
    # Kapital / Verbindlichkeiten / Umsatzsteuer
    ("2900", "Gezeichnetes Kapital", "KAPITAL"),
    ("3300", "Verbindlichkeiten aus Lieferungen und Leistungen", "VERBINDLICHKEIT"),
    ("3530", "Verbindlichkeiten gegenueber Gesellschaftern", "VERBINDLICHKEIT"),
    ("3801", "Umsatzsteuer 7 %", "STEUER"),
    ("3806", "Umsatzsteuer 19 %", "STEUER"),
    ("3820", "Umsatzsteuer-Vorauszahlungen", "STEUER"),
    # Erloese
    ("4200", "Erloese", "ERTRAG"),
    ("4400", "Erloese 19 % USt", "ERTRAG"),
    ("4830", "Sonstige betriebliche Ertraege", "ERTRAG"),
    # Aufwand
    ("5900", "Fremdleistungen", "AUFWAND"),
    ("6220", "Abschreibungen auf Sachanlagen", "AUFWAND"),
    ("6260", "Sofortabschreibung geringwertiger Wirtschaftsgueter", "AUFWAND"),
    ("6310", "Miete", "AUFWAND"),
    ("6325", "Gas, Strom, Wasser", "AUFWAND"),
    ("6400", "Versicherungen", "AUFWAND"),
    ("6420", "Beitraege (Kammer, Verbaende)", "AUFWAND"),
    ("6600", "Werbekosten", "AUFWAND"),
    ("6640", "Bewirtungskosten", "AUFWAND"),
    ("6650", "Reisekosten Arbeitnehmer", "AUFWAND"),
    ("6670", "Reisekosten Unternehmer", "AUFWAND"),
    ("6800", "Porto", "AUFWAND"),
    ("6805", "Telefon", "AUFWAND"),
    ("6810", "Telefax und Internetkosten", "AUFWAND"),
    ("6815", "Buerobedarf", "AUFWAND"),
    ("6820", "Zeitschriften, Buecher (Fachliteratur)", "AUFWAND"),
    ("6821", "Fortbildungskosten", "AUFWAND"),
    ("6825", "Rechts- und Beratungskosten", "AUFWAND"),
    ("6827", "Abschluss- und Pruefungskosten", "AUFWAND"),
    ("6830", "Buchfuehrungskosten", "AUFWAND"),
    ("6845", "Werkzeuge und Kleingeraete", "AUFWAND"),
    ("6850", "Sonstiger Betriebsbedarf", "AUFWAND"),
    ("6855", "Nebenkosten des Geldverkehrs", "AUFWAND"),
    ("7310", "Zinsen und aehnliche Aufwendungen", "AUFWAND"),
    ("7600", "Koerperschaftsteuer", "AUFWAND"),
    ("7610", "Gewerbesteuer", "AUFWAND"),
    # Vortrag
    ("9000", "Saldenvortraege Sachkonten", "STATISTIK"),
]


def seed_sql() -> str:
    """Erzeugt den Inhalt von migrations/003_seed_skr04.sql aus KONTEN."""
    zeilen = [
        "-- 003_seed_skr04.sql — GENERIERT aus core/skr04.py (cli.py skr04-sql).",
        "-- Nicht von Hand editieren; Aenderungen in skr04.py, dann neu erzeugen.",
        "",
    ]
    for kontonr, bezeichnung, kontoart in KONTEN:
        sicher = bezeichnung.replace("'", "''")
        zeilen.append(
            "INSERT INTO konten (kontonr, bezeichnung, kontoart) "
            f"VALUES ('{kontonr}', '{sicher}', '{kontoart}') "
            "ON CONFLICT (kontonr) DO NOTHING;"
        )
    return "\n".join(zeilen) + "\n"
