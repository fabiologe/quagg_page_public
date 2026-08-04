"""
Tests Rest-A: jeder Befund, an dem eine Kur hängt, muss durch genau diese
Kur verschwinden. Das ist die eigentliche Zusage des Kursystems — ein Knopf,
der den Befund stehen lässt, ist schlimmer als kein Knopf.

Muster je Test: Befund erzeugen → `fix` auslesen → `anwenden` → Befund darf
nicht mehr auftauchen.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core import casespec as cs
from ..core.kur import KUR_LABELS, anwenden
from ..core.meshgen import snappy_dict
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3


def _befund(spec, teil: str, obj: str | None = None,
            base_dir=".") -> dict | None:
    """Erster Befund am Objekt `obj`, dessen Meldung `teil` enthält."""
    return next((b for b in validate_case(spec, base_dir)
                 if teil in b["message"]
                 and (obj is None or b["object_id"] == obj)), None)


def _kur_wirkt(spec, teil: str, obj: str | None = None, base_dir=".") -> str:
    """Befund suchen, seine Kur anwenden, Verschwinden prüfen."""
    b = _befund(spec, teil, obj, base_dir)
    assert b is not None, f"Befund mit „{teil}“ wurde gar nicht erst gemeldet"
    fix = b.get("fix")
    assert fix, f"Befund „{teil}“ trägt keine Kur: {b['message']}"
    assert fix["label"] in KUR_LABELS.values()
    args = dict(fix.get("args") or {})
    args.setdefault("base_dir", str(base_dir))
    meldung = anwenden(spec, fix["aktion"], args)
    assert _befund(spec, teil, obj, base_dir) is None, (
        f"Kur „{fix['aktion']}“ gelaufen ({meldung}), der Befund "
        f"„{teil}“ steht aber weiter")
    return meldung


# ---- R1: Kuren an den vorhandenen Befunden -------------------------------

def test_bauwerk_in_der_luft_wird_eingebunden():
    spec = build_spec_stage3()
    # Pfeiler komplett über das Gelände (96 m) heben
    p = next(s for s in spec.structures if s.id == "pfeiler_1")
    p.base_level, p.top_level = 97.5, 99.0
    assert "Gelände" in _kur_wirkt(spec, "hängt in der Luft")


def test_zu_kleine_aussparung_wird_verfeinert():
    spec = build_spec_stage3()
    # ohne vorhandene Flächenverfeinerung starten: die Regel misst die
    # ÖRTLICHE Zellgröße, nicht die Basiszelle
    spec.mesh.refinements = [r for r in spec.mesh.refinements
                             if r.id != "r02"]
    wand = next(s for s in spec.structures if s.id == "wand_becken")
    wand.edits = [cs.EditAussparung(id="a1", type="aussparung",
                                    shape="rechteck", station=2.0,
                                    z=98.0, width=0.3, height=0.3)]
    _kur_wirkt(spec, "weniger als zwei Zellen", "wand_becken")
    stufen = {r.target: r.level for r in spec.mesh.refinements
              if r.type == "surface"}
    assert stufen["wand_becken"] >= 3


def test_bereits_verfeinerte_flaeche_meldet_die_aussparung_nicht_mehr():
    """
    Die Regel maß früher gegen die blanke Basiszelle. Dadurch blieb der
    Befund stehen, egal wie fein der Nutzer die Fläche machte — und die
    angebotene Kur konnte ihn nie beseitigen.
    """
    spec = build_spec_stage3()          # wand_becken steht auf Stufe 3
    wand = next(s for s in spec.structures if s.id == "wand_becken")
    wand.edits = [cs.EditAussparung(id="a1", type="aussparung",
                                    shape="rechteck", station=2.0,
                                    z=98.0, width=0.3, height=0.3)]
    assert _befund(spec, "weniger als zwei Zellen", "wand_becken") is None


def test_vergrabenes_rohr_bekommt_die_bohrung():
    spec = build_spec_stage3()
    # Rohrachse unter das flache Gelände auf 96 m legen
    dl = next(s for s in spec.structures if s.id == "dl_1")
    dl.axis = [(4.0, 2.0, 94.5), (4.0, 16.0, 94.3)]
    _kur_wirkt(spec, "kann keinen Tunnel haben")
    assert dl.durchstoesst_gelaende is True


def test_box_ausserhalb_des_gebiets_wird_beschnitten():
    spec = build_spec_stage3()
    box = next(r for r in spec.mesh.refinements if r.id == "r01")
    box.extent = (-4.0, 6.0, 94.0, 12.0, 12.0, 97.0)
    _kur_wirkt(spec, "ragt aus dem Modellgebiet")
    assert box.extent[0] == pytest.approx(0.0)


def test_stutzen_vor_dem_rand_wird_angeschlossen():
    spec = build_spec_stage3()
    dl = next(s for s in spec.structures if s.id == "dl_1")
    dl.axis = [(4.0, 3.0, 94.5), (4.0, 14.0, 94.3)]
    bc = next(b for b in spec.boundaries if b.id == "zulauf")
    bc.window = cs.BcWindow(follow="dl_1")
    _kur_wirkt(spec, "endet", "zulauf")
    # das anzuschließende Ende steht jetzt über die Fläche hinaus
    assert min(dl.axis[0][1], dl.axis[-1][1]) < 0.0


def test_gerinne_vor_dem_rand_wird_verlaengert_und_haelt_das_gefaelle():
    """
    Die Kur war vorher ein leeres Versprechen: `anschluesse_herstellen`
    verlängerte nur Rohrachsen. Ein Gerinne, das vor dem Rand endet, blieb
    stehen — der Knopf meldete „Anschlüsse waren stimmig“.
    """
    spec = build_spec_stage3()
    ch = next(op for op in spec.terrain.operations if op.id == "t01")
    # Anfang 3 m vor x_min, Ende 6 m vor x_max: anzuschließen ist der Anfang
    ch.polyline = [(3.0, 9.0), (18.0, 9.0)]
    gefaelle_vorher = ((ch.invert_end - ch.invert_start)
                       / (ch.polyline[-1][0] - ch.polyline[0][0]))
    bc = next(b for b in spec.boundaries if b.id == "zulauf")
    bc.window = cs.BcWindow(follow="t01")

    _kur_wirkt(spec, "endet", "zulauf")

    assert ch.polyline[0][0] < 0.0          # steht über die Fläche hinaus
    gefaelle_nachher = ((ch.invert_end - ch.invert_start)
                        / (ch.polyline[-1][0] - ch.polyline[0][0]))
    assert gefaelle_nachher == pytest.approx(gefaelle_vorher, rel=1e-3)


def test_kur_meldet_ehrlich_wenn_nichts_zu_tun_war():
    spec = build_spec_stage3()
    assert "stimmig" in anwenden(spec, "anschluesse_herstellen", {})


# ---- R2: Geländeverfeinerung ---------------------------------------------

def test_gelaendeverfeinerung_kommt_im_netz_an():
    spec = build_spec_stage3()
    spec.mesh.refinements.append(
        cs.RefineSurface(id="r_sohle", type="surface", target="terrain",
                         level=2))
    d = snappy_dict(spec, ["wand_becken"], has_terrain=True,
                    location=(1.0, 1.0, 99.0))
    assert "terrain\n        {\n            level (2 2);" in d
    # und sie gilt nicht mehr als Fehler
    assert not [b for b in validate_case(spec)
                if b["object_id"] == "r_sohle" and b["severity"] == "fehler"]


def test_gelaende_ohne_eigene_stufe_bleibt_bei_eins():
    spec = build_spec_stage3()
    d = snappy_dict(spec, [], has_terrain=True, location=(1.0, 1.0, 99.0))
    assert "level (1 1);" in d


def test_verfeinerung_auf_unbekanntes_ziel_bleibt_fehler():
    spec = build_spec_stage3()
    spec.mesh.refinements.append(
        cs.RefineSurface(id="r_x", type="surface", target="gibtsnicht",
                         level=2))
    assert [b for b in validate_case(spec)
            if b["object_id"] == "r_x" and b["severity"] == "fehler"]


# ---- R3: die beiden Prüfregeln -------------------------------------------

def _zulauf_meldungen(spec):
    return [b["message"] for b in validate_case(spec)
            if b["object_id"] == "zulauf"]


def test_einstuerzender_gerinnezulauf_wird_gemeldet():
    spec = build_spec_stage3()
    bc = next(b for b in spec.boundaries if b.id == "zulauf")
    # Rechteckfenster über dem festen Ablaufpegel (94,9 m)
    bc.window = cs.BcWindow(shape="rechteck", span=(6.0, 12.0),
                            z_min=97.0, z_max=99.0)
    assert any("stürzt ein" in m for m in _zulauf_meldungen(spec))
    assert any("fester Pegel am Ablauf" in m for m in _zulauf_meldungen(spec))


def test_leer_anlaufendes_becken_ist_kein_befund():
    """
    Maßstab ist die ERWARTETE Wasserspiegellage im Betrieb, nicht der
    Anfangswasserspiegel. Sonst fällt jedes Becken darunter, das leer
    anläuft — der reale Fall Rentrisch_3D tat das prompt.
    """
    spec = build_spec_stage3()
    bc = next(b for b in spec.boundaries if b.id == "zulauf")
    # Sohle des Zulaufgerinnes bei 94,6 — unter dem Ablaufpegel 94,9, also
    # im Betrieb eingestaut, aber über dem leeren Anfangszustand
    bc.window = cs.BcWindow(shape="trapez", center=9.0, bottom_width=0.3,
                            top_width=0.8, z_min=94.6, z_max=95.3)
    spec.solver.initial_level = 94.0      # Becken läuft nahezu leer an
    assert not any("stürzt ein" in m for m in _zulauf_meldungen(spec))


def test_ohne_bezugspegel_wird_nicht_geraten():
    spec = build_spec_stage3()
    spec.boundaries = [b for b in spec.boundaries
                       if b.type != "outflow_fixed_level"]
    spec.boundaries.append(cs.BcOutflowFree(id="ablauf", patch="outlet",
                                            type="outflow_free"))
    spec.evaluation.targets = []
    bc = next(b for b in spec.boundaries if b.id == "zulauf")
    bc.window = cs.BcWindow(shape="rechteck", span=(6.0, 12.0),
                            z_min=99.0, z_max=99.5)
    assert not any("stürzt ein" in m for m in _zulauf_meldungen(spec))


def test_rohrmuendung_ueber_dem_spiegel_ist_kein_befund():
    """
    Der Regelfall des Werkzeugs: ein Rohr mündet frei über dem Wasser aus.
    Die Spezifikation verlangt den eingestauten Zulauf für das GERINNE —
    eine Mündung darf nicht darunter fallen.
    """
    spec = build_spec_stage3()
    bc = next(b for b in spec.boundaries if b.id == "zulauf")
    bc.window = cs.BcWindow(shape="kreis", center=9.0, z_center=97.5,
                            diameter=1.5)
    meldungen = [b["message"] for b in validate_case(spec)
                 if b["object_id"] == "zulauf"]
    assert not any("stürzt ein" in m for m in meldungen)


def _abstand_befunde(spec, obj_id):
    return [b for b in validate_case(spec)
            if b["object_id"] == obj_id and "Rand" in b["message"]]


def test_bauwerk_direkt_am_rand_bleibt_warnung():
    spec = build_spec_stage3()
    # Wand quer vor den Zulaufrand x_min schieben
    wand = next(s for s in spec.structures if s.id == "wand_becken")
    wand.alignment.points = [(0.5, 3.0, 98.0), (0.5, 8.0, 98.0)]
    b = _abstand_befunde(spec, "wand_becken")
    assert b and b[0]["severity"] == "warnung"
    assert "unmittelbar" in b[0]["message"]


def test_unterschrittene_vorbelegung_ist_nur_ein_hinweis():
    """
    Die Meldung nannte früher fünf Gerinnebreiten stromauf und zehn
    stromab, geprüft wurde 1x Bauwerksbreite — eine Zusage, die der Code
    nicht hielt. Jetzt wird der genannte Maßstab auch gemessen.
    """
    spec = build_spec_stage3()
    wand = next(s for s in spec.structures if s.id == "wand_becken")
    # 6 m vom Zulaufrand entfernt, Wand selbst 5 m breit: über der
    # Sperrbreite, aber unter 5 Gerinnebreiten (Gerinne t01 ist 6,5 m breit)
    wand.alignment.points = [(6.0, 3.0, 98.0), (6.0, 8.0, 98.0)]
    b = _abstand_befunde(spec, "wand_becken")
    assert b and all(x["severity"] == "hinweis" for x in b)
    assert "Gerinnebreiten" in b[0]["message"]
    assert "stromauf" in " ".join(x["message"] for x in b)


def test_ohne_gerinne_bleibt_die_bauwerksbreite_der_massstab():
    spec = build_spec_stage3()
    spec.terrain.operations = [op for op in spec.terrain.operations
                               if op.type != "channel_carve"]
    wand = next(s for s in spec.structures if s.id == "wand_becken")
    wand.alignment.points = [(6.0, 3.0, 98.0), (6.0, 8.0, 98.0)]
    b = _abstand_befunde(spec, "wand_becken")
    assert b and "Bauwerksbreiten" in b[0]["message"]
