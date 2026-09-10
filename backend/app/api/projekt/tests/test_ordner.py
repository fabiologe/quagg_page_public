"""Ordnerlogik rein gegen tmp_path — keine Datenbank."""

import pytest

from app.api.projekt.core import akte, ordner
from app.api.projekt.core.leistungsphasen import ordnername_lph, slug


def test_slug_und_lph_namen():
    assert slug("Straße Überführung (Nord) – 2. BA") == "Strasse_Ueberfuehrung_Nord_2_BA"
    assert slug("") == ""
    assert ordnername_lph(5) == "LPH5_Ausfuehrungsplanung"
    with pytest.raises(ValueError):
        ordnername_lph(10)
    assert ordner.ordnername_bilden(1338, "Kanal Musterhausen") == "1338_Kanal_Musterhausen"
    assert ordner.ordnername_bilden(1339, "") == "1339"


def test_scan_liest_nur_nummerierte_ordner(projekte_wurzel):
    (projekte_wurzel / "01_Laufend" / "1337_Genau").mkdir()
    (projekte_wurzel / "00_Angebote" / "1400-Angebot Bruecke").mkdir()
    (projekte_wurzel / "00_Angebote" / "Notizen").mkdir()          # keine Nummer -> kein Projekt
    (projekte_wurzel / "00_Angebote" / ".versteckt").mkdir()
    (projekte_wurzel / "Sonstiges").mkdir()                         # keine Phase
    gefunden = ordner.scan()
    assert [(o.id, o.phase) for o in gefunden] == [(1337, "01_Laufend"), (1400, "00_Angebote")]
    assert ordner.hoechste_nummer() == 1400
    assert ordner.finde(1337).ordnername == "1337_Genau"
    assert ordner.finde(1) is None


def test_anlegen_mit_template_und_lph(projekte_wurzel):
    neu = ordner.anlegen("1500_Test", "00_Angebote", lph=[2, 3])
    assert neu.id == 1500 and neu.phase == "00_Angebote"
    namen = sorted(p.name for p in neu.pfad.iterdir())
    assert namen == sorted([ordner.AKTE, *ordner.TEMPLATE])
    assert sorted(p.name for p in (neu.pfad / "02_Planung").iterdir()) == \
        ["LPH2_Vorplanung", "LPH3_Entwurfsplanung"]
    with pytest.raises(ordner.OrdnerFehler):
        ordner.anlegen("1500_Test", "00_Angebote")       # Nummer nie doppelt
    with pytest.raises(ordner.OrdnerFehler):
        ordner.anlegen("ohne_nummer", "00_Angebote")
    with pytest.raises(ordner.OrdnerFehler):
        ordner.anlegen("1501_X", "99_Quatsch")


def test_verschieben_ist_ein_rename(projekte_wurzel):
    o = ordner.anlegen("1600_Umzug", "00_Angebote")
    (o.pfad / "00_Vertrag" / "auftrag.txt").write_text("x", encoding="utf-8")
    neu = ordner.verschiebe(o, "01_Laufend")
    assert neu.phase == "01_Laufend"
    assert not o.pfad.exists()
    assert (neu.pfad / "00_Vertrag" / "auftrag.txt").read_text(encoding="utf-8") == "x"
    assert ordner.verschiebe(neu, "01_Laufend") == neu           # gleiche Phase: no-op
    (projekte_wurzel / "03_Abgeschlossen" / "1600_Umzug").mkdir()
    with pytest.raises(ordner.OrdnerFehler):
        ordner.verschiebe(neu, "03_Abgeschlossen")               # Ziel belegt


def test_akte_yaml_atomar_und_lesbar(projekte_wurzel):
    o = ordner.anlegen("1700_Akte", "01_Laufend")
    pfad = akte.schreiben(o, {"id": 1700, "name": "Kanal Müllerstraße", "beteiligte": []})
    assert pfad.name == "akte.yaml" and pfad.parent.name == ordner.AKTE
    gelesen = akte.lesen(o)
    assert gelesen["name"] == "Kanal Müllerstraße" and "stand" in gelesen
    assert not [p for p in pfad.parent.iterdir() if p.name.startswith(".tmp-")]
    assert akte.lesen(ordner.Ordner(1, "1_x", "01_Laufend", projekte_wurzel / "1_x")) is None


def test_sperre_ohne_wurzel_faellt_laut(monkeypatch):
    monkeypatch.setenv("PROJEKTE_ROOT", "/projekt-testsperre-nicht-vorhanden")
    assert ordner.scan() == []                                   # keine Phasenordner -> leer
    with pytest.raises(ordner.OrdnerNichtBereit):
        ordner.anlegen("1_x", "00_Angebote")                     # Phasenordner werden nie implizit angelegt
