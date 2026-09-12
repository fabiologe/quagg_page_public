"""Buero-Ebene der CDE: projektuebergreifende Ablage.

Plankoepfe, Blattformate, Linienstil-Presets, Symbolsaetze, IDS-Regelwerke und
KG-Kennwerte sind Buerowissen, kein Projektwissen. Bisher lagen sie je Projekt
im Repo und fingen in jedem neuen Projekt bei null an.
"""

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.api.projekt.core import cde, ordner, projekte
from app.api.projekt.router import router
from app.api.projekt.router_buero import router_buero


def _client():
    app = FastAPI()
    app.include_router(router, prefix="/FastAPI/projekte")
    app.include_router(router_buero, prefix="/FastAPI/buero")
    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(
        role="INTERNAL", username="fabio")
    return TestClient(app)


@pytest.fixture()
def buero_wurzel(tmp_path, monkeypatch):
    """BUERO_ROOT auf tmp_path — sonst schriebe der Test in die echte Ablage."""
    wurzel = tmp_path / "0_Buero"
    monkeypatch.setenv("BUERO_ROOT", str(wurzel))
    return wurzel


def test_wurzel_liegt_neben_den_projekten(monkeypatch, tmp_path):
    """Ohne BUERO_ROOT ist die Buero-Ablage ein Geschwister von 1_Projekte.

    Auf der StorageBox liegen dort schon 0_Literatur, 2_Archiv, 3_Buchhaltung
    und 99_Admin — die Buero-CDE reiht sich ein, statt sich in einem
    Projektordner zu verstecken.
    """
    monkeypatch.delenv("BUERO_ROOT", raising=False)
    monkeypatch.setenv("PROJEKTE_ROOT", str(tmp_path / "1_Projekte"))
    assert cde.buero_wurzel() == tmp_path / "0_Buero"


def test_lesen_schreiben_loeschen(buero_wurzel):
    c = _client()
    assert c.get("/FastAPI/buero/cde/repo").json() == {}

    vorlagen = [{"name": "A3 quer", "format": "A3"}]
    assert c.put("/FastAPI/buero/cde/repo/plankopf-vorlagen", json=vorlagen).status_code == 200
    assert c.put("/FastAPI/buero/cde/repo/linienstile", json={"IFCWALL": {"w": 0.35}}).status_code == 200

    alles = c.get("/FastAPI/buero/cde/repo").json()
    assert alles["plankopf-vorlagen"] == vorlagen
    assert alles["linienstile"]["IFCWALL"]["w"] == 0.35
    # Ablageform wie beim Projekt: eine JSON-Datei je Schluessel.
    assert (buero_wurzel / "CDE" / "_repo" / "plankopf-vorlagen.json").is_file()

    assert c.delete("/FastAPI/buero/cde/repo/linienstile").json() == {"ok": True}
    assert c.delete("/FastAPI/buero/cde/repo/linienstile").json() == {"ok": False}
    assert "linienstile" not in c.get("/FastAPI/buero/cde/repo").json()


def test_dieselben_schranken_wie_beim_projekt(buero_wurzel):
    """Schluesselpruefung und Groessengrenze kommen aus derselben Umsetzung.

    Sie zweimal zu schreiben hiesse, dass sie auseinanderlaufen — genau so ist
    es beim Wasserzeichen passiert (Server "ARCHIV", Viewer "ARCHIVIERT").
    """
    c = _client()
    for weg in ("../boese", "mit%2Fslash"):
        antwort = c.put(f"/FastAPI/buero/cde/repo/{weg}", json=1)
        assert antwort.status_code >= 400, (weg, antwort.status_code)
    assert not (buero_wurzel / "boese").exists()
    assert not (buero_wurzel.parent / "boese").exists()

    with pytest.raises(cde.CdeAbgelehnt):
        cde.buero_repo_setzen("zu-gross", "x" * (cde.MAX_REPO_BYTES + 1))


def test_buero_und_projekt_stoeren_sich_nicht(frische_db, app_conn, projekte_wurzel, buero_wurzel):
    """Gleicher Schluessel, zwei Ebenen — zwei Werte.

    Das ist die Voraussetzung fuer die Vorrangregel: der Projektwert soll den
    Buerowert ueberstimmen KOENNEN, ohne ihn zu ueberschreiben.
    """
    p = projekte.anlegen(app_conn, name="Vorrang", honorarmodell="pauschal", akteur="pytest")
    o = ordner.finde(p["id"])
    c = _client()

    c.put("/FastAPI/buero/cde/repo/linienstile", json={"quelle": "buero"})
    c.put(f"/FastAPI/projekte/{p['id']}/cde/repo/linienstile", json={"quelle": "projekt"})

    assert c.get("/FastAPI/buero/cde/repo").json()["linienstile"] == {"quelle": "buero"}
    assert c.get(f"/FastAPI/projekte/{p['id']}/cde/repo").json()["linienstile"] == {"quelle": "projekt"}
    assert (buero_wurzel / "CDE" / "_repo" / "linienstile.json").is_file()
    assert (o.pfad / "CDE" / "_repo" / "linienstile.json").is_file()


def test_buero_route_liegt_nicht_unter_projekte():
    """Die Buero-Routen duerfen NICHT im Projekt-Router haengen.

    Sonst hiesse der Pfad /projekte/buero/cde/repo und kollidierte mit
    /projekte/{projekt_id}/cde/repo — "buero" waere dann eine Projektnummer.
    """
    pfade = {r.path for r in router.routes}
    assert not any("buero" in p for p in pfade)
    assert {r.path for r in router_buero.routes} == {"/cde/repo", "/cde/repo/{key}"}


def test_ids_regelwerke_im_buero(buero_wurzel):
    """Stufe 5 (IFC-Konsistenz): IDS-Regelwerke des Bueros stehen im Buero-Repository unter `ids:`.

    Keine zweite Ablage und keine neue Route — aber unter dem Praefix landet
    nur eine IDS-Datei, mit einem Dateinamen, der im Laufordner taugt.
    """
    from pathlib import Path
    xml = (Path(__file__).parents[3] / "ifc" / "daten" / "quagg-starter.ids").read_text(encoding="utf-8")
    c = _client()
    r = c.put("/FastAPI/buero/cde/repo/ids:starter", json={"datei": "quagg-starter.ids", "xml": xml})
    assert r.status_code == 200, r.text
    for falsch in ({"datei": "x.ids", "xml": "<foo/>"}, {"datei": "../x.ids", "xml": xml},
                   {"datei": "x.xml", "xml": xml}, {"xml": xml}, "nur text"):
        r = c.put("/FastAPI/buero/cde/repo/ids:falsch", json=falsch)
        assert r.status_code == 422, (falsch, r.text)
    assert not (buero_wurzel / "CDE" / "_repo" / "ids:falsch.json").exists()
    assert c.put("/FastAPI/buero/cde/repo/linienstile", json={"xml": "egal"}).status_code == 200  # nur ids: wird geprueft
    assert [w["datei"] for w in cde.buero_regelwerke()] == ["quagg-starter.ids"]

