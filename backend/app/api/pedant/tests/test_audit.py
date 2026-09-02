"""Jede schreibende Aktion hinterlaesst eine Audit-Zeile — auch die abgelehnte."""

import pytest

from app.api.pedant.core import journal


def _audit_zeilen(conn):
    conn.rollback()
    zeilen = conn.execute(
        "SELECT aktion, erfolg FROM auditlog ORDER BY id").fetchall()
    return zeilen


def test_erfolgreiche_buchung_landet_im_audit(app_conn, buche):
    buche()
    zeilen = _audit_zeilen(app_conn)
    assert ("buchung_anlegen", True) in zeilen


def test_abgelehnter_versuch_landet_im_audit(app_conn, buche):
    vorher = len(_audit_zeilen(app_conn))
    with pytest.raises(journal.BuchungAbgelehnt):
        buche(betrag_cent=0)
    with pytest.raises(journal.BuchungAbgelehnt):
        buche(sollkonto="9999")  # Ablehnung aus der Transaktion (Konto-Pruefung)
    zeilen = _audit_zeilen(app_conn)
    neue = zeilen[vorher:]
    assert [erfolg for _, erfolg in neue] == [False, False]
    assert all(aktion == "buchung_anlegen" for aktion, _ in neue)
