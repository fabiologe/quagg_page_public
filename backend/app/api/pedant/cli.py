"""Wartungsbefehle des Pedanten. Aufruf immer aus backend/ heraus:

  venv/bin/python -m app.api.pedant.cli migrate --ziel test
  venv/bin/python -m app.api.pedant.cli migrate --ziel prod
  venv/bin/python -m app.api.pedant.cli migrate --ziel test --modul projekt
  venv/bin/python -m app.api.pedant.cli kette-pruefen --ziel prod
  venv/bin/python -m app.api.pedant.cli dummydaten --ziel test [--monate 6]
  venv/bin/python -m app.api.pedant.cli skr04-sql

migrate erzwingt die Reihenfolge aus FAHRPLAN Kap. 14: gegen prod laeuft nur,
was in test bereits vollstaendig angewendet ist — Scharfschalten bleibt ein
reiner Wiederholungsschritt. dummydaten verweigert prod hart.
"""

import argparse
import random
import sys
from datetime import date, timedelta
from pathlib import Path

import psycopg

from . import db
from .core import belege, erkennung, hashkette, journal, skr04

MIGRATIONS_ORDNER = Path(__file__).parent / "migrations"

# Module teilen sich Datenbank und Rollen, haben aber eigene Migrationsordner
# und eigene Versionstabellen: (Ordner, Versionstabelle, Schema oder None).
MODULE = {
    "pedant": (MIGRATIONS_ORDNER, "schema_migrationen", None),
    "projekt": (Path(__file__).parents[1] / "projekt" / "migrations",
                "projekt.schema_migrationen", "projekt"),
}


def _migrationsdateien(modul: str = "pedant") -> list[Path]:
    ordner = MODULE[modul][0]
    dateien = sorted(ordner.glob("[0-9][0-9][0-9]_*.sql"))
    # 000 ist der clusterweite Bootstrap (Rollen/Datenbanken als Superuser),
    # kein Teil des normalen Laufs.
    return [p for p in dateien if not p.name.startswith("000")]


def _nummer(pfad: Path) -> int:
    return int(pfad.name[:3])


def _angewendete(conn: psycopg.Connection, modul: str = "pedant") -> set[int]:
    _, tabelle, schema = MODULE[modul]
    with conn.transaction():
        if schema:
            conn.execute(f"CREATE SCHEMA IF NOT EXISTS {schema}")
        conn.execute(
            f"CREATE TABLE IF NOT EXISTS {tabelle} ("
            " nr INT PRIMARY KEY, name TEXT NOT NULL,"
            " angewendet_am TIMESTAMPTZ NOT NULL DEFAULT now())"
        )
    zeilen = conn.execute(f"SELECT nr FROM {tabelle}").fetchall()
    return {zeile[0] for zeile in zeilen}


def migrate(ziel: str, modul: str = "pedant") -> int:
    if modul not in MODULE:
        print(f"VERWEIGERT: unbekanntes modul {modul!r} (bekannt: {', '.join(MODULE)})")
        return 1
    dateien = _migrationsdateien(modul)
    tabelle = MODULE[modul][1]
    if ziel == "prod":
        with db.migrate_verbindung("test") as test_conn:
            test_stand = _angewendete(test_conn, modul)
        fehlen = [p.name for p in dateien if _nummer(p) not in test_stand]
        if fehlen:
            print("VERWEIGERT: erst gegen test anwenden:", ", ".join(fehlen))
            return 1
    with db.migrate_verbindung(ziel) as conn:
        stand = _angewendete(conn, modul)
        neu = 0
        for pfad in dateien:
            if _nummer(pfad) in stand:
                continue
            with conn.transaction():
                conn.execute(pfad.read_text(encoding="utf-8"))
                conn.execute(
                    f"INSERT INTO {tabelle} (nr, name) VALUES (%s, %s)",
                    (_nummer(pfad), pfad.name),
                )
            print(f"[{ziel}/{modul}] angewendet: {pfad.name}")
            neu += 1
        if neu == 0:
            print(f"[{ziel}/{modul}] auf aktuellem Stand ({len(dateien)} Migrationen)")
    return 0


def kette_pruefen(ziel: str) -> int:
    with psycopg.connect(db.db_url(ziel, "app")) as conn:
        bericht = hashkette.kette_pruefen(conn)
    if bericht.ok:
        print(f"[{ziel}] kette ok, {bericht.zeilen_geprueft} zeilen geprueft")
        return 0
    print(f"[{ziel}] KETTENBRUCH bei nr {bericht.bruch_bei_nr}: {bericht.grund}"
          f" ({bericht.zeilen_geprueft} zeilen bis dahin ok)")
    return 1


def skr04_sql() -> int:
    ziel = MIGRATIONS_ORDNER / "003_seed_skr04.sql"
    ziel.write_text(skr04.seed_sql(), encoding="utf-8")
    print(f"geschrieben: {ziel} ({len(skr04.KONTEN)} konten)")
    return 0


def dummydaten(ziel: str, monate: int) -> int:
    if ziel != "test":
        print("VERWEIGERT: dummydaten laufen ausschliesslich gegen test")
        return 1
    zufall = random.Random(2027)  # deterministisch — Laeufe sind vergleichbar
    heute = date.today()
    start = heute - timedelta(days=30 * monate)
    gebucht = abgelehnt = storniert = 0
    offene_forderungen: list[tuple[int, int]] = []  # (lfd_nr, betrag)

    with psycopg.connect(db.db_url(ziel, "app")) as conn:
        def buche(**felder):
            nonlocal gebucht
            ergebnis = journal.buchung_anlegen(conn, akteur="dummydaten", **felder)
            gebucht += 1
            return ergebnis

        tag = start
        while tag <= heute:
            if tag.day == 1:
                buche(buchungsdatum=tag, belegdatum=tag, sollkonto="6310",
                      habenkonto="1800", betrag_cent=95_000,
                      buchungstext=f"Miete {tag:%m/%Y}")
                buche(buchungsdatum=tag, belegdatum=tag, sollkonto="6805",
                      habenkonto="1800", betrag_cent=4_900,
                      buchungstext=f"Telefon {tag:%m/%Y}")
            if tag.day == 15:
                betrag = zufall.randrange(250_000, 1_500_000, 500)
                ergebnis = buche(
                    buchungsdatum=tag, belegdatum=tag, sollkonto="1200",
                    habenkonto="4400", betrag_cent=betrag,
                    buchungstext=f"AR {tag:%Y-%m} Planungsleistung",
                    belegreferenz=f"RE-{tag:%Y%m}-01")
                offene_forderungen.append((ergebnis["lfd_nr"], betrag))
            if tag.day == 28 and offene_forderungen:
                _, betrag = offene_forderungen.pop(0)
                buche(buchungsdatum=tag, belegdatum=tag, sollkonto="1800",
                      habenkonto="1200", betrag_cent=betrag,
                      buchungstext=f"Zahlungseingang {tag:%Y-%m}")
            if zufall.random() < 0.08:
                konto = zufall.choice(["6815", "6820", "6845", "6800"])
                buche(buchungsdatum=tag, belegdatum=tag, sollkonto=konto,
                      habenkonto="1800",
                      betrag_cent=zufall.randrange(500, 25_000),
                      buchungstext=f"Beleg {tag:%Y-%m-%d}")
            tag += timedelta(days=1)

        # Zwei Storni — die Korrektur laeuft ausschliesslich als Gegenbuchung.
        for _ in range(2):
            buchungen = journal.letzte_buchungen(conn, limit=200)
            kandidaten = [b for b in buchungen if b["stornoreferenz"] is None]
            opfer = zufall.choice(kandidaten)
            try:
                journal.storno_anlegen(conn, nr_original=opfer["lfd_nr"],
                                       grund="Dummy-Korrektur", akteur="dummydaten")
                storniert += 1
            except journal.BuchungAbgelehnt:
                pass  # bereits storniert erwischt — in Ordnung

        # Bewusst kaputte VERSUCHE: sie muessen abgelehnt werden und im
        # Auditlog landen — gespeicherte kaputte Buchungen gibt es per Design nicht.
        kaputte = [
            dict(sollkonto="1800", habenkonto="1800", betrag_cent=1_000,
                 buchungstext="soll gleich haben"),
            dict(sollkonto="1800", habenkonto="4400", betrag_cent=0,
                 buchungstext="betrag null"),
            dict(sollkonto="9999", habenkonto="1800", betrag_cent=1_000,
                 buchungstext="unbekanntes konto"),
        ]
        for versuch in kaputte:
            try:
                journal.buchung_anlegen(
                    conn, buchungsdatum=heute, belegdatum=heute,
                    akteur="dummydaten", **versuch)
            except journal.BuchungAbgelehnt:
                abgelehnt += 1

        bericht = hashkette.kette_pruefen(conn)

    print(f"[test] {gebucht} gebucht, {storniert} storniert, "
          f"{abgelehnt} versuche abgelehnt; kette: "
          f"{'ok' if bericht.ok else 'GEBROCHEN'} ({bericht.zeilen_geprueft} zeilen)")
    return 0 if bericht.ok else 1


def beleg_erkennen(ziel: str, erkenner=None, limit: int = 50) -> int:
    """OCR-Batch ueber Belege im Status 'erfasst' — Worker-Prinzip, nie im
    HTTP-Request. Ohne Scharfstellung (Key+Schalter) klare Meldung + Exit 1."""
    erkenner = erkenner or erkennung.erkenner_aus_umgebung()
    if erkenner is None:
        print("OCR nicht konfiguriert — Scharfstellen: PEDANT_OCR=1 und"
              " ANTHROPIC_API_KEY in backend/.env setzen und das anthropic-Paket"
              " installieren (venv/bin/pip install anthropic).")
        return 1
    from .core import ablage
    erkannt = fehlgeschlagen = 0
    with psycopg.connect(db.db_url(ziel, "app")) as conn:
        offene = belege.belege_liste(conn, status="erfasst", limit=limit)
        for beleg in offene:
            try:
                pfad = ablage.datei_oeffnen(beleg["ablage_pfad"])
                felder = erkenner.erkenne(pfad)
                belege.erkennung_eintragen(conn, beleg_id=beleg["id"],
                                           felder=felder, roh=felder.roh,
                                           akteur="beleg-erkennen")
                erkannt += 1
            except erkennung.ErkennungNichtKonfiguriert:
                raise
            except Exception as fehler:  # noqa: BLE001 — ein kaputter Beleg stoppt nicht den Stapel
                print(f"  {beleg['belegnummer']}: {fehler}")
                fehlgeschlagen += 1
    print(f"[{ziel}] {erkannt} erkannt, {fehlgeschlagen} fehlgeschlagen,"
          f" {len(offene)} angesehen")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pedant")
    unter = parser.add_subparsers(dest="befehl", required=True)
    for name in ("migrate", "kette-pruefen", "dummydaten", "beleg-erkennen"):
        p = unter.add_parser(name)
        p.add_argument("--ziel", choices=("test", "prod"), required=True)
        if name == "migrate":
            p.add_argument("--modul", choices=tuple(MODULE), default="pedant")
        if name == "dummydaten":
            p.add_argument("--monate", type=int, default=6)
        if name == "beleg-erkennen":
            p.add_argument("--limit", type=int, default=50)
    unter.add_parser("skr04-sql")
    args = parser.parse_args(argv)

    if args.befehl == "migrate":
        return migrate(args.ziel, args.modul)
    if args.befehl == "kette-pruefen":
        return kette_pruefen(args.ziel)
    if args.befehl == "dummydaten":
        return dummydaten(args.ziel, args.monate)
    if args.befehl == "beleg-erkennen":
        return beleg_erkennen(args.ziel, limit=args.limit)
    return skr04_sql()


if __name__ == "__main__":
    sys.exit(main())
