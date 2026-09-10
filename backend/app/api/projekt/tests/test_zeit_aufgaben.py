"""Stufe 3: Aufgaben, Zeitbuchungen, Timer, Stunden-Fortschritt, Rechnung aus Stunden."""

from datetime import date, timedelta

import pytest

from app.api.pedant.core import stammdaten
from app.api.projekt.core import aufgaben, projekte, vorschlaege, zeit


def _ag(conn) -> int:
    return stammdaten.auftraggeber_anlegen(conn, akteur="pytest", felder={
        "name": "Gemeinde", "strasse": "Weg 2", "plz": "56068", "ort": "Koblenz",
        "leitweg_id": "04011000-12345-03", "portal": "zre_rlp", "email": "g@g.de"})["id"]


def test_aufgaben_lebenszyklus(frische_db, app_conn, projekte_wurzel):
    p = projekte.anlegen(app_conn, name="Aufgaben", honorarmodell="pauschal", akteur="pytest")
    pid = p["id"]
    a = aufgaben.anlegen(app_conn, pid, titel="Bauamt anrufen", akteur="pytest",
                         faellig_am=date.today() - timedelta(days=1))
    b = aufgaben.anlegen(app_conn, pid, titel="Plan prüfen", akteur="pytest", faellig_am=date.today() + timedelta(days=3))
    with pytest.raises(aufgaben.AufgabeAbgelehnt):
        aufgaben.anlegen(app_conn, pid, titel="  ", akteur="pytest")
    assert [x["id"] for x in aufgaben.liste(app_conn, pid)] == [a["id"], b["id"]]
    assert aufgaben.offen_je_projekt(app_conn)[pid] == {"offen": 2, "ueberfaellig": 1}
    assert any(x["id"] == a["id"] for x in aufgaben.faellige(app_conn, 14))
    e = aufgaben.aendern(app_conn, pid, a["id"], {"status": "erledigt"}, akteur="pytest")
    assert e["erledigt_am"] == date.today()
    e = aufgaben.aendern(app_conn, pid, a["id"], {"status": "offen"}, akteur="pytest")
    assert e["erledigt_am"] is None
    with pytest.raises(aufgaben.AufgabeAbgelehnt):
        aufgaben.aendern(app_conn, pid, a["id"], {"quelle": "ki"}, akteur="pytest")
    with pytest.raises(aufgaben.AufgabeUnbekannt):
        aufgaben.aendern(app_conn, pid, 999999, {"titel": "x"}, akteur="pytest")
    aufgaben.loeschen(app_conn, pid, b["id"], akteur="pytest")
    akte = projekte.lesen(app_conn, pid)
    assert [x["titel"] for x in akte["aufgaben"]] == ["Bauamt anrufen"]
    assert projekte.liste(app_conn)[0]["aufgaben"]["offen"] == 1
    assert projekte.kennzahlen(app_conn)["aufgaben_ueberfaellig"] >= 1
    # KI-Vorschlag Aufgabe ist jetzt uebernehmbar
    v = vorschlaege.anlegen(app_conn, pid, art="aufgabe", begruendung="aus Mail",
                            nutzlast={"titel": "Nachtrag schreiben", "faellig_am": "2027-01-10"})
    ok = vorschlaege.entscheiden(app_conn, pid, v["id"], entscheidung="uebernehmen", akteur="fabio")
    assert ok["ergebnis"].startswith("aufgabe ")
    neu = [x for x in aufgaben.liste(app_conn, pid) if x["titel"] == "Nachtrag schreiben"][0]
    assert neu["quelle"] == "ki" and neu["faellig_am"] == date(2027, 1, 10)


def test_zeit_buchen_timer_und_sperre(frische_db, app_conn, projekte_wurzel):
    p = projekte.anlegen(app_conn, name="Zeit", honorarmodell="stunden", akteur="pytest",
                         stundensatz_cent=9_500, budget_stunden=10, auftraggeber_id=_ag(app_conn))
    pid = p["id"]
    z1 = zeit.buchen(app_conn, pid, datum=date(2027, 2, 1), dauer_min=90, taetigkeit="Vermessung auswerten", akteur="pytest")
    z2 = zeit.buchen(app_conn, pid, datum=date(2027, 2, 2), dauer_min=30, taetigkeit="Telefonat", akteur="pytest",
                     abrechenbar=False)
    for kaputt in (dict(dauer_min=0), dict(dauer_min=2000), dict(taetigkeit=" ")):
        felder = dict(datum=date(2027, 2, 3), dauer_min=60, taetigkeit="x")
        felder.update(kaputt)
        with pytest.raises(zeit.ZeitAbgelehnt):
            zeit.buchen(app_conn, pid, akteur="pytest", **felder)
    s = zeit.summen(app_conn, pid)
    assert (s["minuten_gesamt"], s["minuten_abrechenbar"], s["minuten_unabgerechnet"]) == (120, 90, 90)
    assert s["je_monat"][0] == {"monat": "2027-02", "minuten": 120}
    # Stunden-Fortschritt: 2 h von 10 h Budget
    akte = projekte.lesen(app_conn, pid)
    assert akte["fortschritt"]["prozent"] == 20.0 and akte["fortschritt"]["leistung_cent"] == 2 * 9_500
    assert akte["fortschritt"]["honorar_beauftragt_cent"] == 95_000
    assert projekte.liste(app_conn)[0]["fortschritt"]["prozent"] == 20.0
    # Zeitraum-Auswertung ueber alle Projekte
    woche = zeit.zeitraum(app_conn, date(2027, 2, 1), date(2027, 2, 7))
    assert sum(z["dauer_min"] for z in woche if z["projekt_id"] == pid) == 120
    assert zeit.wochenblatt(date(2027, 2, 3)) == (date(2027, 2, 1), date(2027, 2, 7))
    # Timer
    assert zeit.timer_status(app_conn, "pytest") is None
    t = zeit.timer_start(app_conn, pid, akteur="pytest", taetigkeit="Entwurf zeichnen")
    assert t["projekt_id"] == pid and t["laeuft_min"] == 0
    b = zeit.timer_stop(app_conn, akteur="pytest")
    assert b["dauer_min"] == 1 and b["taetigkeit"] == "Entwurf zeichnen"   # mindestens eine Minute
    assert zeit.timer_status(app_conn, "pytest") is None
    assert zeit.timer_stop(app_conn, akteur="pytest") is None
    zeit.timer_start(app_conn, pid, akteur="pytest")
    zeit.timer_verwerfen(app_conn, akteur="pytest")
    assert zeit.timer_status(app_conn, "pytest") is None
    # Rechnung aus Stunden: nur abrechenbare, unabgerechnete
    akte = projekte.lesen(app_conn, pid)
    v = zeit.rechnung_vorschlag(app_conn, akte)
    assert v["summe_netto_cent"] == (1500 * 9_500 + 500) // 1000 + (round(1 * 1000 / 60) * 9_500 + 500) // 1000
    assert all(pos["einheit"] == "HUR" for pos in v["positionen"])
    r = zeit.rechnung_anlegen(app_conn, akte, akteur="pytest", leistung_von=date(2027, 2, 1))
    assert r["status"] == "entwurf" and r["projekt_id"] == pid
    assert zeit.summen(app_conn, pid)["minuten_unabgerechnet"] == 0
    with pytest.raises(zeit.ZeitAbgelehnt):                          # eingefroren
        zeit.aendern(app_conn, pid, z1["id"], {"dauer_min": 10}, akteur="pytest")
    with pytest.raises(zeit.ZeitAbgelehnt):
        zeit.loeschen(app_conn, pid, z1["id"], akteur="pytest")
    zeit.loeschen(app_conn, pid, z2["id"], akteur="pytest")          # nicht abrechenbar -> nie eingefroren
    with pytest.raises(zeit.ZeitAbgelehnt):
        zeit.rechnung_anlegen(app_conn, akte, akteur="pytest", leistung_von=date(2027, 2, 1))   # nichts offen
    # Rechnung im Pedanten verworfen -> Zeit wieder frei
    from app.api.pedant.core import rechnungen as ped
    ped.verwerfen(app_conn, rechnung_id=r["id"], grund="Test", akteur="pytest")
    assert zeit.verworfene_freigeben(app_conn, pid) == 2
    assert zeit.summen(app_conn, pid)["minuten_unabgerechnet"] == 91


def test_stundenprojekt_ohne_satz_und_ohne_ag(frische_db, app_conn, projekte_wurzel):
    p = projekte.anlegen(app_conn, name="Ohne", honorarmodell="stunden", akteur="pytest")
    zeit.buchen(app_conn, p["id"], datum=date.today(), dauer_min=60, taetigkeit="x", akteur="pytest")
    akte = projekte.lesen(app_conn, p["id"])
    assert akte["fortschritt"]["prozent"] == 0.0                     # ohne Satz: Abschnittslogik (leer)
    with pytest.raises(zeit.ZeitAbgelehnt):
        zeit.rechnung_anlegen(app_conn, akte, akteur="pytest", leistung_von=date.today())
