"""Beleg-Fachlogik: Plausibilitaet, Vorschlag, Lebenslauf, Freigabe, Trigger."""

import hashlib
from datetime import date

import pytest
from psycopg import errors

from app.api.pedant.core import belege, hashkette, journal
from app.api.pedant.core.ablage import AblageErgebnis

HEUTE = date.today()
JAHR = HEUTE.year


def _ergebnis(inhalt: bytes, name="beleg.pdf", wurzel=None) -> AblageErgebnis:
    sha = hashlib.sha256(inhalt).hexdigest()
    relativ = f"{JAHR}/{sha}.pdf"
    if wurzel is not None:
        (wurzel / str(JAHR)).mkdir(parents=True, exist_ok=True)
        (wurzel / relativ).write_bytes(inhalt)
    return AblageErgebnis(sha256=sha, relativ=relativ, mime_typ="application/pdf",
                          groesse_bytes=len(inhalt), original_name=name)


def _felder(conn, beleg_id, **ueber):
    werte = dict(lieferant="Baumarkt Koblenz", belegdatum=HEUTE,
                 netto_cent=10_000, steuersatz=19, brutto_cent=11_900,
                 akteur="pytest")
    werte.update(ueber)
    return belege.felder_speichern(conn, beleg_id=beleg_id, **werte)


# ── reine Funktionen ─────────────────────────────────────────────────────────

def test_plausibilitaet_grenzfaelle():
    assert belege.plausibilitaet(10_000, 19, 11_900).ok
    assert belege.plausibilitaet(10_000, 19, 11_901).ok      # +1 Cent Toleranz
    assert belege.plausibilitaet(10_000, 19, 11_899).ok      # -1 Cent Toleranz
    assert not belege.plausibilitaet(10_000, 19, 11_902).ok  # +2 Cent: nein
    assert not belege.plausibilitaet(10_000, 19, 11_898).ok
    assert belege.plausibilitaet(10_000, 0, 10_000).ok       # 0 %: netto == brutto
    assert belege.plausibilitaet(999, 19, 1_189).ok          # 189,81 -> 190 gerundet
    befund = belege.plausibilitaet(None, 19, 11_900)
    assert not befund.ok and "gefuellt" in befund.grund


def test_vorschlag_an_den_gwg_grenzen():
    assert belege.vorschlag(24_999)["stufe"] == "sofortaufwand"
    gwg = belege.vorschlag(25_000)
    assert gwg["stufe"] == "gwg" and gwg["konto_vorschlag"] == "6260"
    assert "Anlageverzeichnis" in gwg["hinweis"]
    assert belege.vorschlag(80_000)["stufe"] == "gwg"
    assert belege.vorschlag(80_001)["stufe"] == "aktivierung"
    assert belege.vorschlag(None)["stufe"] is None


def test_steuerschluessel_datev_bu():
    assert belege.steuerschluessel(19) == "9"
    assert belege.steuerschluessel(7) == "8"
    assert belege.steuerschluessel(0) == ""


# ── Lebenslauf ───────────────────────────────────────────────────────────────

def test_belegnummern_zaehlen_hoch(app_conn):
    erster = belege.beleg_anlegen(app_conn, ergebnis=_ergebnis(b"eins"), akteur="pytest")
    zweiter = belege.beleg_anlegen(app_conn, ergebnis=_ergebnis(b"zwei"), akteur="pytest")
    assert erster["belegnummer"] == f"B-{JAHR}-0001"
    assert zweiter["belegnummer"] == f"B-{JAHR}-0002"
    assert erster["status"] == "erfasst"


def test_duplikat_nennt_bestand(app_conn):
    bestand = belege.beleg_anlegen(app_conn, ergebnis=_ergebnis(b"gleich"), akteur="pytest")
    with pytest.raises(belege.BelegDuplikat) as fehler:
        belege.beleg_anlegen(app_conn, ergebnis=_ergebnis(b"gleich"), akteur="pytest")
    assert fehler.value.belegnummer == bestand["belegnummer"]
    assert fehler.value.status == "erfasst"


def test_felder_speichern_setzt_geprueft_nur_bei_plausibel(app_conn):
    beleg = belege.beleg_anlegen(app_conn, ergebnis=_ergebnis(b"x"), akteur="pytest")
    unstimmig = _felder(app_conn, beleg["id"], brutto_cent=11_950)
    assert unstimmig["status"] == "erfasst"          # Felder gespeichert, nicht geprueft
    assert unstimmig["netto_cent"] == 10_000
    stimmig = _felder(app_conn, beleg["id"])
    assert stimmig["status"] == "geprueft"
    assert stimmig["befund"]["ok"] is True


def test_verwerfen_braucht_grund_und_laesst_datei_liegen(app_conn, beleg_wurzel):
    ergebnis = _ergebnis(b"wegwerf", wurzel=beleg_wurzel)
    beleg = belege.beleg_anlegen(app_conn, ergebnis=ergebnis, akteur="pytest")
    with pytest.raises(belege.BelegAbgelehnt, match="grund"):
        belege.verwerfen(app_conn, beleg_id=beleg["id"], grund="  ", akteur="pytest")
    verworfen = belege.verwerfen(app_conn, beleg_id=beleg["id"],
                                 grund="privat bezahlt", akteur="pytest")
    assert verworfen["status"] == "verworfen"
    assert (beleg_wurzel / ergebnis.relativ).exists()
    with pytest.raises(belege.BelegAbgelehnt, match="felder sind fest"):
        _felder(app_conn, beleg["id"])


# ── Freigabe ─────────────────────────────────────────────────────────────────

def test_freigeben_erzeugt_bruttobuchung_mit_referenz(app_conn):
    beleg = belege.beleg_anlegen(app_conn, ergebnis=_ergebnis(b"f1"), akteur="pytest")
    _felder(app_conn, beleg["id"])
    ergebnis = belege.freigeben(app_conn, beleg_id=beleg["id"],
                                sollkonto="6815", akteur="pytest")
    assert ergebnis["bereits_gebucht"] is False
    zeile = journal.letzte_buchungen(app_conn, limit=1)[0]
    assert zeile["lfd_nr"] == ergebnis["lfd_nr"]
    assert zeile["betrag_cent"] == 11_900                     # BRUTTO
    assert zeile["steuerschluessel"] == "9"
    assert zeile["belegreferenz"] == beleg["belegnummer"]
    assert zeile["habenkonto"] == "1800"
    assert hashkette.kette_pruefen(app_conn).ok
    danach = belege.beleg_lesen(app_conn, beleg["id"])
    assert danach["status"] == "gebucht"
    assert danach["buchung_lfd_nr"] == ergebnis["lfd_nr"]


def test_freigeben_ist_idempotent(app_conn):
    beleg = belege.beleg_anlegen(app_conn, ergebnis=_ergebnis(b"f2"), akteur="pytest")
    _felder(app_conn, beleg["id"])
    erste = belege.freigeben(app_conn, beleg_id=beleg["id"],
                             sollkonto="6815", akteur="pytest")
    stand = journal.status(app_conn)["anzahl_buchungen"]
    zweite = belege.freigeben(app_conn, beleg_id=beleg["id"],
                              sollkonto="6815", akteur="pytest")
    assert zweite["bereits_gebucht"] is True
    assert zweite["lfd_nr"] == erste["lfd_nr"]
    assert journal.status(app_conn)["anzahl_buchungen"] == stand  # keine zweite


def test_freigeben_heilt_abgebrochenen_lauf(app_conn):
    # Buchung existiert schon (frueherer Crash NACH buchung_anlegen),
    # der Beleg haengt in geprueft — der naechste Aufruf traegt nur nach.
    beleg = belege.beleg_anlegen(app_conn, ergebnis=_ergebnis(b"f3"), akteur="pytest")
    _felder(app_conn, beleg["id"])
    vorab = journal.buchung_anlegen(
        app_conn, buchungsdatum=HEUTE, belegdatum=HEUTE, sollkonto="6815",
        habenkonto="1800", betrag_cent=11_900, steuerschluessel="9",
        buchungstext="Crash-Simulation", belegreferenz=beleg["belegnummer"],
        akteur="pytest", aktion="beleg_freigeben")
    stand = journal.status(app_conn)["anzahl_buchungen"]
    ergebnis = belege.freigeben(app_conn, beleg_id=beleg["id"],
                                sollkonto="6815", akteur="pytest")
    assert ergebnis["lfd_nr"] == vorab["lfd_nr"]
    assert journal.status(app_conn)["anzahl_buchungen"] == stand  # nur Nachtrag
    assert belege.beleg_lesen(app_conn, beleg["id"])["status"] == "gebucht"


def test_freigeben_guards(app_conn):
    beleg = belege.beleg_anlegen(app_conn, ergebnis=_ergebnis(b"f4"), akteur="pytest")
    with pytest.raises(belege.BelegAbgelehnt, match="geprueft"):
        belege.freigeben(app_conn, beleg_id=beleg["id"], sollkonto="6815", akteur="pytest")
    _felder(app_conn, beleg["id"])
    with pytest.raises(belege.BelegAbgelehnt, match="geldkonto"):
        belege.freigeben(app_conn, beleg_id=beleg["id"], sollkonto="6815",
                         geldkonto="4400", akteur="pytest")
    with pytest.raises(belege.BelegAbgelehnt, match="verschieden"):
        belege.freigeben(app_conn, beleg_id=beleg["id"], sollkonto="1800", akteur="pytest")
    with pytest.raises(belege.BelegAbgelehnt, match="existiert nicht"):
        belege.freigeben(app_conn, beleg_id=999_999, sollkonto="6815", akteur="pytest")


# ── DB-Trigger als letzte Verteidigung ──────────────────────────────────────

def test_trigger_delete_und_identitaet(app_conn, migrate_conn):
    beleg = belege.beleg_anlegen(app_conn, ergebnis=_ergebnis(b"t1"), akteur="pytest")
    with pytest.raises(errors.RaiseException, match="append-only"):
        migrate_conn.execute("DELETE FROM belege")
    migrate_conn.rollback()
    with pytest.raises(errors.RaiseException, match="identitaetsfelder"):
        migrate_conn.execute("UPDATE belege SET sha256 = repeat('f', 64)"
                             " WHERE id = %s", (beleg["id"],))
    migrate_conn.rollback()


def test_trigger_uebergangsmatrix(app_conn, migrate_conn, buche):
    beleg = belege.beleg_anlegen(app_conn, ergebnis=_ergebnis(b"t2"), akteur="pytest")
    buchung = buche()
    # erfasst -> gebucht direkt (am Freigabepfad vorbei) ist verboten
    with pytest.raises(errors.RaiseException, match="uebergang"):
        migrate_conn.execute(
            "UPDATE belege SET status = 'gebucht', buchung_lfd_nr = %s,"
            " lieferant = 'x', belegdatum = now()::date, netto_cent = 1,"
            " steuersatz = 19, brutto_cent = 1 WHERE id = %s",
            (buchung["lfd_nr"], beleg["id"]))
    migrate_conn.rollback()
    # regulaer buchen, dann zurueckdrehen versuchen
    _felder(app_conn, beleg["id"])
    belege.freigeben(app_conn, beleg_id=beleg["id"], sollkonto="6815", akteur="pytest")
    with pytest.raises(errors.RaiseException, match="nur kostenmerkmal"):
        migrate_conn.execute("UPDATE belege SET netto_cent = 1 WHERE id = %s",
                             (beleg["id"],))
    migrate_conn.rollback()
    # kostenmerkmal bleibt nach gebucht erlaubt (spaetere Projektzuordnung)
    with migrate_conn.transaction():
        migrate_conn.execute("UPDATE belege SET kostenmerkmal = 'P9123'"
                             " WHERE id = %s", (beleg["id"],))
    app_conn.rollback()
    assert belege.beleg_lesen(app_conn, beleg["id"])["kostenmerkmal"] == "P9123"


def test_trigger_verworfen_ist_terminal(app_conn, migrate_conn):
    beleg = belege.beleg_anlegen(app_conn, ergebnis=_ergebnis(b"t3"), akteur="pytest")
    belege.verwerfen(app_conn, beleg_id=beleg["id"], grund="test", akteur="pytest")
    with pytest.raises(errors.RaiseException, match="endgueltig"):
        migrate_conn.execute("UPDATE belege SET status = 'erfasst',"
                             " verworfen_grund = NULL WHERE id = %s", (beleg["id"],))
    migrate_conn.rollback()
