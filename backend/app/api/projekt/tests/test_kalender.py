"""Kalender: Termine, Einladungen (Sende-Stub), Antworten aus Wegwerf-SQLite, Feed, Tokens."""

import json
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from app.api.projekt.core import kalender, projekte
from app.services import ical

UTC = timezone.utc
KONTO = "info@quagg-engineering.org"


class Sender:
    """Ersatz fuer email_sender.send_email: sammelt Aufrufe, schickt nichts."""

    def __init__(self):
        self.aufrufe = []

    def __call__(self, **kw):
        self.aufrufe.append(kw)
        return type("Ev", (), {"id": len(self.aufrufe)})()


def _projekt(conn) -> int:
    return projekte.anlegen(conn, name="RRB Nord", honorarmodell="pauschal", akteur="pytest")["id"]


def _termin(conn, pid, **extra) -> dict:
    felder = dict(titel="Baubesprechung", beginn="2026-09-01T10:00:00+02:00", ende="2026-09-01T11:30:00+02:00",
                  akteur="pytest", organisator_email=KONTO, organisator_name="Quagg", projekt_id=pid,
                  ort="Bauamt", teilnehmer=[{"email": "Max.Muster@example.org", "name": "Max"},
                                            {"email": "anna@example.org"}, {"email": "max.muster@example.org"}])
    felder.update(extra)
    return kalender.anlegen(conn, **felder)


def test_anlegen_validierung_und_lesen(frische_db, app_conn, projekte_wurzel):
    pid = _projekt(app_conn)
    t = _termin(app_conn, pid)
    assert t["uid"] == f"termin-{t['id']}@quagg-engineering.org" and t["sequenz"] == 0
    assert t["beginn"] == datetime(2026, 9, 1, 8, 0, tzinfo=UTC)          # Ortszeit -> UTC
    assert [x["email"] for x in t["teilnehmer"]] == ["max.muster@example.org", "anna@example.org"]  # lower + dedupe
    assert t["teilnehmer"][0]["status"] == "NEEDS-ACTION" and t["einladung_offen"] is False
    assert projekte.lesen(app_conn, pid)["termine"][0]["id"] == t["id"]

    with pytest.raises(kalender.TerminAbgelehnt):
        _termin(app_conn, pid, titel="  ")
    with pytest.raises(kalender.TerminAbgelehnt):
        _termin(app_conn, pid, ende="2026-09-01T09:00:00+02:00")
    with pytest.raises(kalender.TerminAbgelehnt):
        _termin(app_conn, pid, besprechungslink="meet.example.org")
    with pytest.raises(kalender.TerminAbgelehnt):
        _termin(app_conn, pid, teilnehmer=["kein-at"])
    with pytest.raises(kalender.TerminAbgelehnt):
        _termin(app_conn, pid, projekt_id=999999)
    with pytest.raises(kalender.TerminUnbekannt):
        kalender.lesen(app_conn, 999999)

    # firmenweit ohne Projekt, ganztaegig: Datumsgrenzen, Ende exklusiv
    g = kalender.anlegen(app_conn, titel="Betriebsausflug", beginn="2026-09-10", ende="2026-09-11", ganztag=True,
                         akteur="pytest", organisator_email=KONTO)
    assert g["projekt_id"] is None
    assert g["beginn"] == datetime(2026, 9, 10, tzinfo=UTC) and g["ende"] == datetime(2026, 9, 12, tzinfo=UTC)
    assert kalender.spanne_text(g) == "10.09.2026 – 11.09.2026 (ganztägig)"
    assert kalender.spanne_text(t) == "Di, 01.09.2026 10:00–11:30"

    im_fenster = kalender.liste(app_conn, "2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z")
    assert [x["id"] for x in im_fenster] == [t["id"]]
    assert [x["id"] for x in kalender.liste(app_conn, "2026-09-01", "2026-09-30", projekt_id=pid)] == [t["id"]]


def test_einladen_aendern_update_absagen(frische_db, app_conn, projekte_wurzel):
    pid = _projekt(app_conn)
    t = _termin(app_conn, pid, besprechungslink="https://meet.example.org/x")
    senden = Sender()
    with pytest.raises(kalender.TerminAbgelehnt):
        kalender.einladen(app_conn, kalender.anlegen(app_conn, titel="leer", beginn="2026-09-05T08:00:00Z", ende=None,
                                                     akteur="pytest", organisator_email=KONTO)["id"],
                          akteur="pytest", senden=senden)

    t = kalender.einladen(app_conn, t["id"], akteur="pytest", senden=senden, nachricht="Bitte kommen.")
    assert t["eingeladen_am"] is not None and t["eingeladen_sequenz"] == 0
    assert all(x["eingeladen_am"] is not None for x in t["teilnehmer"])
    mail = senden.aufrufe[-1]
    assert mail["to"] == ["max.muster@example.org", "anna@example.org"]
    assert mail["subject"] == "Einladung: Baubesprechung" and mail["ical_methode"] == "REQUEST"
    assert "Bitte kommen." in mail["body_text"] and "Projekt: RRB Nord" in mail["body_text"]
    d = ical.parse_kalender(mail["ical"])
    assert d["methode"] == "REQUEST" and d["uid"] == t["uid"] and d["organizer"]["email"] == KONTO
    assert len(d["attendees"]) == 2

    # Aenderung eines VEVENT-relevanten Feldes nach Einladung -> SEQUENCE+1, Update offen
    t = kalender.aendern(app_conn, t["id"], {"beginn": "2026-09-01T11:00:00+02:00", "ende": "2026-09-01T12:00:00+02:00"},
                         akteur="pytest")
    assert t["sequenz"] == 1 and t["einladung_offen"] is True
    # Nicht relevante Aenderung (Projekt) erhoeht nicht
    t = kalender.aendern(app_conn, t["id"], {"projekt_id": None}, akteur="pytest")
    assert t["sequenz"] == 1
    with pytest.raises(kalender.TerminAbgelehnt):
        kalender.aendern(app_conn, t["id"], {"uid": "x"}, akteur="pytest")

    t = kalender.einladen(app_conn, t["id"], akteur="pytest", senden=senden)
    assert t["eingeladen_sequenz"] == 1 and t["einladung_offen"] is False
    assert senden.aufrufe[-1]["subject"] == "Aktualisiert: Baubesprechung"
    assert ical.parse_kalender(senden.aufrufe[-1]["ical"])["sequenz"] == 1

    # nur_neue: neuer Teilnehmer bekommt die Einladung, die anderen nicht
    t = kalender.teilnehmer_setzen(app_conn, t["id"], [{"email": "max.muster@example.org"}, {"email": "anna@example.org"},
                                                        {"email": "neu@example.org", "name": "Neu"}], akteur="pytest")
    t = kalender.einladen(app_conn, t["id"], akteur="pytest", senden=senden, nur_neue=True)
    assert senden.aufrufe[-1]["to"] == ["neu@example.org"]

    with pytest.raises(kalender.TerminAbgelehnt):
        kalender.loeschen(app_conn, t["id"], akteur="pytest")     # eingeladen -> absagen statt loeschen

    t = kalender.absagen(app_conn, t["id"], akteur="pytest", senden=senden)
    assert t["status"] == "abgesagt" and t["sequenz"] == 2 and t["abgesagt_am"] is not None
    cancel = senden.aufrufe[-1]
    assert cancel["ical_methode"] == "CANCEL" and cancel["subject"] == "Abgesagt: Baubesprechung"
    assert sorted(cancel["to"]) == ["anna@example.org", "max.muster@example.org", "neu@example.org"]
    assert ical.parse_kalender(cancel["ical"])["status"] == "CANCELLED"
    with pytest.raises(kalender.TerminAbgelehnt):
        kalender.aendern(app_conn, t["id"], {"titel": "x"}, akteur="pytest")
    assert t["id"] not in {x["id"] for x in kalender.liste(app_conn, "2026-09-01", "2026-09-02")}
    assert t["id"] in {x["id"] for x in kalender.liste(app_conn, "2026-09-01", "2026-09-02", mit_abgesagten=True)}
    kalender.loeschen(app_conn, t["id"], akteur="pytest")          # abgesagt darf weg


# ── Antworten aus SQLite ─────────────────────────────────────────────────

def _sqlite_mit_mails(tmp_path, monkeypatch, mails):
    pfad = tmp_path / "quagg.db"
    c = sqlite3.connect(pfad)
    c.execute("CREATE TABLE email_events (id INTEGER PRIMARY KEY, message_id TEXT, sender TEXT, received_at TEXT,"
              " folder TEXT, ical_json TEXT)")
    for i, m in enumerate(mails, start=1):
        c.execute("INSERT INTO email_events VALUES (?, ?, ?, ?, ?, ?)",
                  (i, m.get("message_id", f"<m{i}@t>"), m.get("sender", "x@y.de"), m.get("received_at", "2026-08-28T07:15:00"),
                   m.get("folder", "inbox"), json.dumps(m["ical"]) if m.get("ical") is not None else None))
    c.commit()
    c.close()
    monkeypatch.setenv("QUAGG_SQLITE_PFAD", str(pfad))


def _antwort(uid, email, partstat, *, methode="REPLY", sequenz=0, kommentar="", beginn="2026-09-01T08:00:00+00:00",
             ende="2026-09-01T09:30:00+00:00"):
    return {"methode": methode, "uid": uid, "sequenz": sequenz, "summary": "Baubesprechung", "beginn": beginn,
            "ende": ende, "ganztag": False, "ort": "", "beschreibung": "",
            "organizer": {"email": KONTO, "name": "Quagg"},
            "attendees": [{"email": email, "name": "", "partstat": partstat, "rolle": "REQ-PARTICIPANT"}],
            "kommentar": kommentar, "status": "CONFIRMED", "wiederholend": False, "antwort": None}


def test_antworten_verarbeiten(frische_db, app_conn, projekte_wurzel, tmp_path, monkeypatch):
    pid = _projekt(app_conn)
    t = _termin(app_conn, pid)
    t = kalender.einladen(app_conn, t["id"], akteur="pytest", senden=Sender())
    fremd_uid = "0400ABC@outlook"
    fremd = kalender.einladung_uebernehmen(app_conn, {
        "uid": fremd_uid, "sequenz": 0, "summary": "Abstimmung", "beginn": "2026-11-02T13:00:00+00:00",
        "ende": "2026-11-02T14:00:00+00:00", "ganztag": False, "ort": "Rathaus", "beschreibung": "",
        "organizer": {"email": "planung@musterhausen.example", "name": "Stadt"},
        "attendees": [{"email": KONTO, "name": "Quagg", "partstat": "NEEDS-ACTION", "rolle": "REQ-PARTICIPANT"}],
    }, email_event_id=77, akteur="pytest", unser_status="ACCEPTED")
    assert fremd["quelle"] == "einladung" and fremd["unser_status"] == "ACCEPTED" and fremd["projekt_id"] is None

    _sqlite_mit_mails(tmp_path, monkeypatch, [
        {"ical": _antwort(t["uid"], "max.muster@example.org", "ACCEPTED", kommentar="Passt.")},
        {"ical": _antwort(t["uid"], "anna@example.org", "TENTATIVE", methode="COUNTER",
                          beginn="2026-09-02T12:00:00+00:00", ende="2026-09-02T13:30:00+00:00")},
        {"ical": _antwort(t["uid"], "chef@example.org", "DECLINED")},               # nicht eingeladen -> neu
        {"ical": _antwort("termin-999999@quagg-engineering.org", "a@b.de", "ACCEPTED")},   # unbekannt
        {"ical": _antwort(fremd_uid, KONTO, "NEEDS-ACTION", methode="CANCEL")},     # fremde Absage
        {"ical": None},                                                             # ohne Kalenderteil
        {"ical": _antwort(t["uid"], "max.muster@example.org", "DECLINED"), "folder": "sent"},  # eigene Sent-Zeile
    ])
    z = kalender.antworten_verarbeiten(app_conn)
    assert z == {"gelesen": 5, "uebernommen": 4, "uebersprungen": 1}

    t = kalender.lesen(app_conn, t["id"])
    status = {x["email"]: (x["status"], x["kommentar"]) for x in t["teilnehmer"]}
    assert status["max.muster@example.org"] == ("ACCEPTED", "Passt.")
    assert status["anna@example.org"][0] == "TENTATIVE" and status["anna@example.org"][1].startswith("Gegenvorschlag: Mi, 02.09.2026 14:00–15:30")
    assert status["chef@example.org"][0] == "DECLINED"
    assert t["teilnehmer"][0]["antwort_am"] == datetime(2026, 8, 28, 7, 15, tzinfo=UTC)
    assert kalender.lesen(app_conn, fremd["id"])["status"] == "abgesagt"

    # zweiter Lauf: alles schon verbucht
    assert kalender.antworten_verarbeiten(app_conn) == {"gelesen": 0, "uebernommen": 0, "uebersprungen": 0}
    ergebnisse = dict(app_conn.execute("SELECT uid, ergebnis FROM projekt.termin_antworten WHERE uid LIKE 'termin-999999%'").fetchall())
    assert ergebnisse == {"termin-999999@quagg-engineering.org": "unbekannte_uid"}

    # veraltete Antwort (SEQUENCE kleiner als die zuletzt versendete) aendert nichts
    kalender.aendern(app_conn, t["id"], {"titel": "Neu"}, akteur="pytest")
    kalender.einladen(app_conn, t["id"], akteur="pytest", senden=Sender())
    pfad = tmp_path / "quagg.db"
    c = sqlite3.connect(pfad)
    c.execute("INSERT INTO email_events VALUES (?, ?, ?, ?, ?, ?)",
              (50, "<alt@t>", "max", "2026-08-29T07:00:00", "inbox",
               json.dumps(_antwort(t["uid"], "max.muster@example.org", "DECLINED", sequenz=0))))
    c.execute("INSERT INTO email_events VALUES (?, ?, ?, ?, ?, ?)",
              (51, "<neu@t>", "max", "2026-08-29T07:01:00", "inbox",
               json.dumps(_antwort(t["uid"], "max.muster@example.org", "DECLINED", sequenz=1))))
    c.commit()
    c.close()
    assert kalender.antworten_verarbeiten(app_conn) == {"gelesen": 2, "uebernommen": 1, "uebersprungen": 1}
    assert {x["email"]: x["status"] for x in kalender.lesen(app_conn, t["id"])["teilnehmer"]}["max.muster@example.org"] == "DECLINED"
    assert dict(app_conn.execute("SELECT message_id, ergebnis FROM projekt.termin_antworten WHERE message_id IN ('<alt@t>', '<neu@t>')").fetchall()) \
        == {"<alt@t>": "veraltet", "<neu@t>": "uebernommen"}


def test_einladung_uebernehmen_aktualisiert_bei_hoeherer_sequenz(frische_db, app_conn, projekte_wurzel):
    basis = {"uid": "X1@fremd", "sequenz": 0, "summary": "Alt", "beginn": "2026-10-01T08:00:00+00:00",
             "ende": "2026-10-01T09:00:00+00:00", "ganztag": False, "ort": "", "beschreibung": "",
             "organizer": {"email": "o@fremd.de", "name": ""}, "attendees": []}
    a = kalender.einladung_uebernehmen(app_conn, basis, email_event_id=1, akteur="pytest")
    b = kalender.einladung_uebernehmen(app_conn, {**basis, "sequenz": 2, "summary": "Neu"}, email_event_id=2,
                                       akteur="pytest", unser_status="TENTATIVE")
    assert a["id"] == b["id"] and b["titel"] == "Neu" and b["sequenz"] == 2 and b["unser_status"] == "TENTATIVE"
    with pytest.raises(kalender.TerminAbgelehnt):
        kalender.einladen(app_conn, b["id"], akteur="pytest", senden=Sender())
    with pytest.raises(kalender.TerminAbgelehnt):
        kalender.einladung_uebernehmen(app_conn, {**basis, "uid": ""}, email_event_id=3, akteur="pytest")


# ── Feed + Token ──────────────────────────────────────────────────────────

def test_feed_und_token(frische_db, app_conn, projekte_wurzel):
    pid = _projekt(app_conn)
    jetzt = datetime.now(UTC)
    aktiv = kalender.anlegen(app_conn, titel="Bald", beginn=jetzt + timedelta(days=3), ende=jetzt + timedelta(days=3, hours=1),
                             akteur="pytest", organisator_email=KONTO, projekt_id=pid,
                             teilnehmer=[{"email": "geheim@example.org"}])
    alt = kalender.anlegen(app_conn, titel="Vorbei", beginn=jetzt - timedelta(days=200), ende=jetzt - timedelta(days=199),
                           akteur="pytest", organisator_email=KONTO)
    abgesagt = kalender.absagen(app_conn, kalender.anlegen(app_conn, titel="Abgesagt", beginn=jetzt + timedelta(days=1),
                                                            ende=jetzt + timedelta(days=1, hours=1), akteur="pytest",
                                                            organisator_email=KONTO)["id"], akteur="pytest")
    app_conn.execute("INSERT INTO projekt.meilensteine (projekt_id, art, bezeichnung, faellig_am) VALUES (%s, 'abgabe', 'Entwurf', %s)",
                     (pid, (jetzt + timedelta(days=10)).date()))
    app_conn.execute("INSERT INTO projekt.meilensteine (projekt_id, art, bezeichnung, faellig_am) VALUES (%s, 'gewaehrleistung', 'GWL', %s)",
                     (pid, (jetzt + timedelta(days=10)).date()))
    app_conn.commit()

    # frische_db ist modul-weit: nur die eigenen Eintraege pruefen
    termine, meilensteine = kalender.feed_termine(app_conn)
    ids = {t["id"] for t in termine}
    assert aktiv["id"] in ids and abgesagt["id"] in ids
    assert alt["id"] not in ids                                          # ausserhalb des Fensters
    bezeichnungen = [m["bezeichnung"] for m in meilensteine]
    assert "Entwurf" in bezeichnungen and "GWL" not in bezeichnungen      # nur Fristen-Arten
    text = kalender.feed_ics(app_conn).decode("utf-8").replace("\r\n ", "")
    assert "METHOD:PUBLISH" in text and "STATUS:CANCELLED" in text and "SUMMARY:Entwurf (RRB Nord)" in text
    assert "geheim@example.org" not in text

    assert kalender.feed_link(app_conn, "fabio") is None
    token1 = kalender.feed_neu(app_conn, "fabio", akteur="fabio")
    assert len(token1) >= 40 and kalender.feed_link(app_conn, "fabio")["zuletzt_abgerufen_am"] is None
    assert kalender.feed_nutzer_fuer_token(app_conn, token1) == "fabio"
    assert kalender.feed_link(app_conn, "fabio")["zuletzt_abgerufen_am"] is not None
    token2 = kalender.feed_neu(app_conn, "fabio", akteur="fabio")
    assert kalender.feed_nutzer_fuer_token(app_conn, token1) is None       # alt widerrufen
    assert kalender.feed_nutzer_fuer_token(app_conn, token2) == "fabio"
    assert kalender.feed_nutzer_fuer_token(app_conn, "kurz") is None
    assert kalender.feed_widerrufen(app_conn, "fabio", akteur="fabio") == 1
    assert kalender.feed_nutzer_fuer_token(app_conn, token2) is None
    assert kalender.feed_link(app_conn, "fabio") is None
