"""Die Hash-Kette erkennt nachtraegliche Manipulation — auch eine, die an
allen Sperren vorbei direkt in der Tabelle passiert."""

from datetime import date

from app.api.pedant.core import hashkette


def test_kette_ok_nach_mehreren_buchungen(app_conn, buche):
    for i in range(3):
        buche(buchungstext=f"Buchung {i}")
    bericht = hashkette.kette_pruefen(app_conn)
    assert bericht.ok
    assert bericht.zeilen_geprueft == 3


def test_manipulation_wird_an_der_richtigen_zeile_erkannt(app_conn, migrate_conn, buche):
    for i in range(3):
        buche(buchungstext=f"Buchung {i}")
    # Der Angriff: Eigentuemer schaltet den Sperr-Trigger ab und aendert Zeile 2.
    with migrate_conn.transaction():
        migrate_conn.execute(
            "ALTER TABLE buchungssaetze DISABLE TRIGGER buchung_unveraenderlich")
        migrate_conn.execute(
            "UPDATE buchungssaetze SET betrag_cent = betrag_cent + 1 WHERE lfd_nr = 2")
        migrate_conn.execute(
            "ALTER TABLE buchungssaetze ENABLE TRIGGER buchung_unveraenderlich")
    app_conn.rollback()  # frische Sicht auf den committeten Stand
    bericht = hashkette.kette_pruefen(app_conn)
    assert not bericht.ok
    assert bericht.bruch_bei_nr == 2
    assert bericht.zeilen_geprueft == 1  # Zeile 1 war noch in Ordnung


def test_kanonisierung_ist_injektiv():
    """Ein Pipe-Zeichen im Text darf nicht mit einer Feldgrenze verwechselbar
    sein — sonst haetten zwei verschiedene Buchungen denselben Hash."""
    gemeinsam = dict(
        lfd_nr=1, buchungsdatum=date(2027, 1, 1), belegdatum=date(2027, 1, 1),
        sollkonto="6815", habenkonto="1800", betrag_cent=100,
        steuerschluessel="", stornoreferenz=None, hash_prev=hashkette.GENESIS_HASH,
    )
    a = hashkette.kanonisieren(buchungstext="a|b", belegreferenz="", **gemeinsam)
    b = hashkette.kanonisieren(buchungstext="a", belegreferenz="b", **gemeinsam)
    assert a != b
    ruecken = hashkette.kanonisieren(buchungstext="a\\", belegreferenz="b", **gemeinsam)
    normal = hashkette.kanonisieren(buchungstext="a", belegreferenz="\\b", **gemeinsam)
    assert ruecken != normal
