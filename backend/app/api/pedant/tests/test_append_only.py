"""Die Kern-Garantie: gebuchte Zeilen sind technisch unveraenderbar.
Als pedant_app scheitert Mutation am Rechteentzug (REVOKE), als Eigentuemer
am Sperr-Trigger — Guertel und Hosentraeger, beide einzeln geprueft."""

import pytest
from psycopg import errors


def test_app_rolle_kann_buchungen_nicht_aendern(app_conn, buche):
    buche()
    for sql in (
        "UPDATE buchungssaetze SET betrag_cent = 1",
        "DELETE FROM buchungssaetze",
        "TRUNCATE buchungssaetze",
    ):
        with pytest.raises(errors.InsufficientPrivilege):
            app_conn.execute(sql)
        app_conn.rollback()


def test_app_rolle_kann_auditlog_nicht_aendern(app_conn, buche):
    buche()
    for sql in (
        "UPDATE auditlog SET erfolg = NOT erfolg",
        "DELETE FROM auditlog",
        "TRUNCATE auditlog",
    ):
        with pytest.raises(errors.InsufficientPrivilege):
            app_conn.execute(sql)
        app_conn.rollback()


def test_app_rolle_kopf_nur_fortschreiben(app_conn):
    with pytest.raises(errors.InsufficientPrivilege):
        app_conn.execute(
            "INSERT INTO journal_kopf (id, lfd_nr_letzte, hash_letzter)"
            " VALUES (2, 0, repeat('0', 64))")
    app_conn.rollback()
    with pytest.raises(errors.InsufficientPrivilege):
        app_conn.execute("DELETE FROM journal_kopf")
    app_conn.rollback()


def test_eigentuemer_wird_vom_trigger_gestoppt(app_conn, migrate_conn, buche):
    buche()
    for sql in (
        "UPDATE buchungssaetze SET betrag_cent = 1",
        "DELETE FROM buchungssaetze",
        "UPDATE auditlog SET erfolg = NOT erfolg",
        "DELETE FROM auditlog",
        "DELETE FROM journal_kopf",
    ):
        with pytest.raises(errors.RaiseException, match="append-only"):
            migrate_conn.execute(sql)
        migrate_conn.rollback()


def test_kettentrigger_verhindert_luecke_und_falschen_anschluss(app_conn, buche):
    buche()
    # Direktes INSERT an der Kopf-Fortschreibung vorbei: falsche Nummer …
    with pytest.raises(errors.RaiseException, match="kettenbruch"):
        app_conn.execute(
            "INSERT INTO buchungssaetze (lfd_nr, buchungsdatum, belegdatum,"
            " sollkonto, habenkonto, betrag_cent, buchungstext, hash, hash_prev)"
            " VALUES (99, '2027-01-01', '2027-01-01', '6815', '1800', 100,"
            " 'luecke', repeat('a', 64), repeat('b', 64))")
    app_conn.rollback()
    # … und richtige Nummer, aber hash_prev ohne Anschluss.
    with pytest.raises(errors.RaiseException, match="kettenbruch"):
        app_conn.execute(
            "INSERT INTO buchungssaetze (lfd_nr, buchungsdatum, belegdatum,"
            " sollkonto, habenkonto, betrag_cent, buchungstext, hash, hash_prev)"
            " VALUES (2, '2027-01-01', '2027-01-01', '6815', '1800', 100,"
            " 'falscher anschluss', repeat('a', 64), repeat('b', 64))")
    app_conn.rollback()
