"""Stufe 2: Abschnitte, Honorarhistorie, Vorlagen, Fortschritt."""

import pytest

from app.api.projekt.core import abschnitte, fortschritt, projekte


def test_fortschritt_arithmetik():
    a = [dict(honorar_cent=2_000_00, fortschritt_prozent=100, beauftragt=True, status="fertig"),
         dict(honorar_cent=20_000_00, fortschritt_prozent=100, beauftragt=True, status="abgenommen"),
         dict(honorar_cent=25_000_00, fortschritt_prozent=60, beauftragt=True, status="laufend"),
         dict(honorar_cent=5_000_00, fortschritt_prozent=0, beauftragt=True, status="offen"),
         dict(honorar_cent=15_000_00, fortschritt_prozent=0, beauftragt=True, status="offen"),
         dict(honorar_cent=33_000_00, fortschritt_prozent=50, beauftragt=False, status="offen"),   # nicht beauftragt
         dict(honorar_cent=9_000_00, fortschritt_prozent=100, beauftragt=True, status="entfallen")]  # entfallen
    k = fortschritt.leistung(a)
    assert k["honorar_gesamt_cent"] == 109_000_00
    assert k["honorar_beauftragt_cent"] == 67_000_00
    assert k["leistung_cent"] == 2_000_00 + 20_000_00 + 15_000_00
    assert k["prozent"] == round(37_000_00 * 1000 / 67_000_00) / 10
    assert fortschritt.leistung([]) == {"honorar_gesamt_cent": 0, "honorar_beauftragt_cent": 0,
                                        "leistung_cent": 0, "prozent": 0.0}


def test_verteile_ist_exakt():
    prozente = [2, 20, 25, 5, 15, 13, 4, 15, 1]
    betraege = fortschritt.verteile(100_000_01, prozente)
    assert sum(betraege) == 100_000_01
    assert betraege[2] >= betraege[1]                     # Rest landet beim groessten Anteil
    assert fortschritt.verteile(0, prozente) == [0] * 9
    with pytest.raises(ValueError):
        fortschritt.verteile(100, [0, 0])


def _projekt(conn, projekte_wurzel, **ueber):
    felder = dict(name="RRB Nord", honorarmodell="hoai", akteur="pytest")
    felder.update(ueber)
    return projekte.anlegen(conn, **felder)


def test_vorlage_legt_neun_abschnitte_an(frische_db, app_conn, projekte_wurzel):
    p = _projekt(app_conn, projekte_wurzel)
    bilder = abschnitte.leistungsbilder(app_conn)
    assert {b["paragraf"] for b in bilder} == {"35", "39", "43", "47"}
    for b in bilder:
        assert sum(ph["prozent"] for ph in b["phasen"]) == 100, b["paragraf"]
    neue = abschnitte.aus_vorlage(app_conn, p["id"], paragraf="43", honorar_cent=100_000_00,
                                  beauftragt=[1, 2, 3, 4, 5], akteur="pytest")
    assert len(neue) == 9
    assert sum(a["honorar_cent"] for a in neue) == 100_000_00
    assert [a["beauftragt"] for a in neue] == [True] * 5 + [False] * 4
    assert neue[7]["bezeichnung"] == "LPH 8 Bauoberleitung" and neue[7]["honorar_cent"] == 15_000_00
    akte = projekte.lesen(app_conn, p["id"])
    assert akte["leistungsbild"] == "43"
    assert akte["fortschritt"]["honorar_beauftragt_cent"] == 67_000_00
    assert len(akte["honorar_historie"]) == 9
    with pytest.raises(abschnitte.AbschnittAbgelehnt):
        abschnitte.aus_vorlage(app_conn, p["id"], paragraf="43", honorar_cent=1, beauftragt=[1], akteur="pytest")
    with pytest.raises(abschnitte.AbschnittAbgelehnt):
        abschnitte.aus_vorlage(app_conn, p["id"] + 1000, paragraf="99", honorar_cent=1, beauftragt=[1], akteur="pytest")


def test_fortschritt_nachtrag_und_historie(frische_db, app_conn, projekte_wurzel):
    p = _projekt(app_conn, projekte_wurzel, name="Pauschal", honorarmodell="pauschal")
    pid = p["id"]
    a = abschnitte.anlegen(app_conn, pid, bezeichnung="Vorentwurf", honorar_cent=30_000_00, akteur="pytest")
    b = abschnitte.anlegen(app_conn, pid, bezeichnung="Entwurf", honorar_cent=70_000_00, akteur="pytest")
    assert (a["nr"], b["nr"]) == (1, 2)
    abschnitte.aendern(app_conn, pid, a["id"], {"fortschritt_prozent": 100, "status": "fertig"}, akteur="pytest")
    abschnitte.aendern(app_conn, pid, b["id"], {"fortschritt_prozent": 50}, akteur="pytest")
    k = projekte.lesen(app_conn, pid)["fortschritt"]
    assert k["leistung_cent"] == 65_000_00 and k["prozent"] == 65.0
    # Nachtrag als eigener Abschnitt: kein Neunormieren der Altabschnitte
    n = abschnitte.anlegen(app_conn, pid, bezeichnung="Nachtrag Umplanung", art="nachtrag",
                           honorar_cent=10_000_00, akteur="pytest")
    k = projekte.lesen(app_conn, pid)["fortschritt"]
    assert k["honorar_beauftragt_cent"] == 110_000_00 and k["leistung_cent"] == 65_000_00
    # Honoraraenderung landet in der Historie mit Grund
    abschnitte.aendern(app_conn, pid, n["id"], {"honorar_cent": 12_000_00}, akteur="pytest",
                       grund="Nachtrag 1 beauftragt")
    hist = abschnitte.historie(app_conn, pid)
    assert hist[0]["alt_cent"] == 10_000_00 and hist[0]["neu_cent"] == 12_000_00
    assert hist[0]["grund"] == "Nachtrag 1 beauftragt"
    # Historie ist unveraenderlich
    app_conn.rollback()
    with pytest.raises(Exception):
        with app_conn.transaction():
            app_conn.execute("DELETE FROM projekt.honorar_aenderungen WHERE id = %s", (hist[0]["id"],))
    app_conn.rollback()
    # Loeschen nur ohne Historie
    with pytest.raises(abschnitte.AbschnittAbgelehnt):
        abschnitte.loeschen(app_conn, pid, n["id"], akteur="pytest")
    leer = abschnitte.anlegen(app_conn, pid, bezeichnung="Versehen", akteur="pytest")
    abschnitte.loeschen(app_conn, pid, leer["id"], akteur="pytest")
    with pytest.raises(abschnitte.AbschnittUnbekannt):
        abschnitte.loeschen(app_conn, pid, leer["id"], akteur="pytest")
    # Validierung
    for kaputt in ({"fortschritt_prozent": 101}, {"status": "vergessen"}, {"art": "bonus"},
                   {"lph": 12}, {"honorar_cent": -1}, {"bezeichnung": " "}):
        with pytest.raises(abschnitte.AbschnittAbgelehnt):
            abschnitte.aendern(app_conn, pid, a["id"], kaputt, akteur="pytest")
    # Portfolio-Kennzahl je Projekt
    liste = {z["id"]: z for z in projekte.liste(app_conn)}
    assert liste[pid]["fortschritt"]["leistung_cent"] == 65_000_00
