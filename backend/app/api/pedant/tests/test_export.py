"""Export-Vorstufen: Pruefliste, Zeitraumfilter, Belegbilder-ZIP."""

import hashlib
import io
import zipfile
from datetime import date, timedelta

from app.api.pedant.core import export
from app.api.pedant.core import belege as belegmodul
from app.api.pedant.core.ablage import AblageErgebnis

HEUTE = date.today()


def test_pruefliste_meldet_offene_arbeit(app_conn, beleg_wurzel, buche):
    sauber = export.pruefliste(app_conn, von=HEUTE - timedelta(days=30), bis=HEUTE)
    assert sauber["sauber"] is True

    inhalt = b"%PDF-offen"
    sha = hashlib.sha256(inhalt).hexdigest()
    (beleg_wurzel / str(HEUTE.year)).mkdir(parents=True, exist_ok=True)
    (beleg_wurzel / f"{HEUTE.year}/{sha}.pdf").write_bytes(inhalt)
    belegmodul.beleg_anlegen(app_conn, ergebnis=AblageErgebnis(
        sha256=sha, relativ=f"{HEUTE.year}/{sha}.pdf",
        mime_typ="application/pdf", groesse_bytes=len(inhalt),
        original_name="offen.pdf"), akteur="pytest")

    befund = export.pruefliste(app_conn, von=HEUTE - timedelta(days=30), bis=HEUTE)
    assert befund["sauber"] is False
    assert any("nicht gebucht" in eintrag for eintrag in befund["befunde"])


def test_buchungen_im_zeitraum_filtert(app_conn, buche):
    buche(buchungsdatum=date(2027, 1, 15), buchungstext="drin")
    buche(buchungsdatum=date(2027, 3, 15), buchungstext="draussen")
    zeilen = export.buchungen_im_zeitraum(
        app_conn, von=date(2027, 1, 1), bis=date(2027, 1, 31))
    texte = [zeile["buchungstext"] for zeile in zeilen]
    assert "drin" in texte and "draussen" not in texte


def test_beleg_buendel_zip(app_conn, beleg_wurzel):
    inhalt = b"%PDF-buendel"
    sha = hashlib.sha256(inhalt).hexdigest()
    (beleg_wurzel / str(HEUTE.year)).mkdir(parents=True, exist_ok=True)
    (beleg_wurzel / f"{HEUTE.year}/{sha}.pdf").write_bytes(inhalt)
    beleg = belegmodul.beleg_anlegen(app_conn, ergebnis=AblageErgebnis(
        sha256=sha, relativ=f"{HEUTE.year}/{sha}.pdf",
        mime_typ="application/pdf", groesse_bytes=len(inhalt),
        original_name="Kassenbon Bäcker!.pdf"), akteur="pytest")
    belegmodul.felder_speichern(app_conn, beleg_id=beleg["id"],
                                lieferant="Baecker", belegdatum=HEUTE,
                                netto_cent=1000, steuersatz=19, brutto_cent=1190,
                                akteur="pytest")
    belegmodul.freigeben(app_conn, beleg_id=beleg["id"], sollkonto="6850",
                         akteur="pytest")

    daten = export.beleg_buendel(app_conn, von=HEUTE - timedelta(days=1),
                                 bis=HEUTE + timedelta(days=1))
    with zipfile.ZipFile(io.BytesIO(daten)) as archiv:
        namen = archiv.namelist()
        assert len(namen) == 1
        assert namen[0].startswith(beleg["belegnummer"] + "_")
        assert "!" not in namen[0]                       # Dateiname bereinigt
        assert archiv.read(namen[0]) == inhalt


def test_extf_endpunkt_liefert_datei(frische_db, beleg_wurzel, buche):
    from types import SimpleNamespace

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.api.deps import get_current_active_user
    from app.api.pedant.router import router

    app = FastAPI()
    app.include_router(router, prefix="/FastAPI/pedant")
    app.dependency_overrides[get_current_active_user] = (
        lambda: SimpleNamespace(role="ADMIN", username="pytest"))   # Buchhaltung ist ADMIN-only
    client = TestClient(app)

    buche(buchungsdatum=date(2027, 1, 10), buchungstext="Jan-Buchung",
          steuerschluessel="9", belegreferenz="B-2027-0001")

    antwort = client.get("/FastAPI/pedant/export/extf",
                         params={"von": "2027-01-01", "bis": "2027-01-31"})
    assert antwort.status_code == 200
    assert "windows-1252" in antwort.headers["content-type"]
    assert "EXTF_Buchungsstapel_20270101_20270131.csv" in \
        antwort.headers["content-disposition"]
    zeilen = antwort.content.decode("cp1252").rstrip("\r\n").split("\r\n")
    assert zeilen[0].startswith('"EXTF";700;21;')
    # Modul-DB ist geteilt — UNSERE Buchung gezielt suchen statt Zeilen zaehlen.
    unsere = [zeile for zeile in zeilen[2:] if '"B-2027-0001"' in zeile]
    assert len(unsere) == 1
    felder = unsere[0].split(";")
    assert len(felder) == 125
    assert felder[8] == '"9"'                     # BU-Drehung aktiv

    # Jahresgrenze -> 422
    schlecht = client.get("/FastAPI/pedant/export/extf",
                          params={"von": "2026-12-01", "bis": "2027-01-31"})
    assert schlecht.status_code == 422

    zip_antwort = client.get("/FastAPI/pedant/export/belege",
                             params={"von": "2027-01-01", "bis": "2027-01-31"})
    assert zip_antwort.status_code == 200
    assert zip_antwort.headers["content-type"] == "application/zip"
