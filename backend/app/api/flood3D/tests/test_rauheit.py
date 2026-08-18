"""
Passt die angegebene Rauheit ueberhaupt in die wandnahe Zelle?

Die Materialwahl schreibt eine `nutkRoughWallFunction` mit der
aequivalenten Sandrauheit k_s auf den Patch. Diese Wandfunktion verteilt
die Rauheit INNERHALB der wandnaechsten Zelle — passt sie dort nicht
hinein, rechnet der Solver etwas anderes als angegeben. Geprueft wurde
das bis 2026-08-17 nirgends.

Zwei Eigenheiten machen den Fehler tueckisch, weil beide der Intuition
widersprechen, und beide haben hier einen eigenen Test:

  * ein FEINERES Netz macht die Rauheitsangabe schlechter,
  * GRENZSCHICHTEN ebenfalls — sie verkleinern die wandnahe Zelle.

Gemessen an Fabios Fall Rentrich_BetaTest08: Gelaende aus Erde
(k_s = 0,03 m) auf einer feinsten Zelle von 0,125 m — 24 %, knapp ueber
der gebraeuchlichen Grenze von 20 %.
"""
from __future__ import annotations

from ..core import casespec as cs
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3


def _rauheitsbefunde(spec, tmp_path) -> list[dict]:
    return [b for b in validate_case(spec, tmp_path)
            if "k_s" in b["message"]]


def _fall(material="erde", base_cell=0.5, refinements=None, layers=None):
    spec = build_spec_stage3()
    spec.terrain.material = material
    spec.mesh.base_cell = base_cell
    spec.mesh.refinements = refinements if refinements is not None else []
    spec.mesh.boundary_layers = layers
    return spec


def test_erde_auf_grober_zelle_ist_in_ordnung(tmp_path):
    # k_s = 0,03 m auf 0,5 m Zelle = 6 % — unauffaellig
    assert _rauheitsbefunde(_fall(base_cell=0.5), tmp_path) == []


def test_feineres_netz_macht_die_rauheit_ungueltig(tmp_path):
    """
    DIE unerwartete Richtung: verfeinern verschlechtert die
    Rauheitsangabe. Zwei Stufen auf 0,5 m sind 0,125 m — genau Fabios Fall.

    Grenzwertig (0,2 bis 0,5) ist ein HINWEIS: die Wandfunktion rechnet
    dort noch etwas Sinnvolles, nur ungenauer. Als Warnung gesetzt schlug
    der Befund bei jedem der drei Bauwerksrezepte sofort an — und was
    immer dasteht, wird nicht mehr gelesen.
    """
    box = cs.RefineBox(id="fein", type="box", level=2,
                       extent=(0, 0, 90, 24, 18, 100))
    befunde = _rauheitsbefunde(_fall(base_cell=0.5, refinements=[box]),
                               tmp_path)

    assert len(befunde) == 1
    text = befunde[0]["message"]
    assert befunde[0]["severity"] == "hinweis"
    assert "0.125" in text and "0.03" in text
    assert "24%" in text
    # der Text muss die Umkehrung nennen: bis wohin waere es gueltig
    assert "0.025" in text
    # und beide Auswege, ohne einen davon zu verordnen
    assert "gröber vernetzen" in text and "Material" in text


def test_noch_feiner_wird_deutlicher_benannt(tmp_path):
    """
    Ueber der halben Zelle bekommt derselbe Befund einen Zusatz. Vier
    Stufen auf 0,5 m sind 0,031 m — die Erdrauheit ist dann fast so gross
    wie die ganze Zelle.
    """
    box = cs.RefineBox(id="fein", type="box", level=4,
                       extent=(0, 0, 90, 24, 18, 100))
    befund = _rauheitsbefunde(_fall(base_cell=0.5, refinements=[box]),
                              tmp_path)[0]
    assert "halbe Zelle" in befund["message"]
    # ERST hier wird es eine Warnung: darunter rechnet die Wandfunktion
    # noch etwas Sinnvolles
    assert befund["severity"] == "warnung"


def test_eine_box_neben_dem_bauwerk_zaehlt_nicht_fuer_dessen_patch(tmp_path):
    """
    Die Stufe gilt je PATCH. Eine Box weit weg von einem Bauwerk
    verfeinert dessen Wand nicht — fuer das Gelaende dagegen schon, es
    liegt ueberall.
    """
    spec = build_spec_stage3()
    spec.terrain.material = "stahl"          # glatt: kein Gelaendebefund
    spec.mesh.base_cell = 0.5
    spec.structures = [cs.StructWall(
        id="wand", type="wall", patch="wand", thickness=0.4,
        height=1.0, material="steinschuettung",
        alignment=cs.Alignment(kind="polyline",
                               points=[(2, 2, 96), (4, 2, 96)]))]
    # Box im entgegengesetzten Eck des Gebiets
    spec.mesh.refinements = [cs.RefineBox(
        id="weit_weg", type="box", level=3,
        extent=(18, 14, 90, 22, 17, 100))]

    befunde = _rauheitsbefunde(spec, tmp_path)
    # Steinschuettung (0,1 m) auf 0,5 m Zelle sind 20 % — genau an der
    # Grenze, also noch kein Befund. Waere die ferne Box mitgezaehlt
    # worden, waeren es 160 % und der Test faengt es.
    assert befunde == [], [b["message"] for b in befunde]


def test_grenzschichten_verschaerfen_das_verhaeltnis(tmp_path):
    """
    Layers verkleinern die wandnahe Zelle: mit `finalLayerThickness 0.3`
    und Expansion 1,2 ist die erste Schicht rund 0,21 der Zellgroesse.
    Aus unauffaelligen 6 % werden damit knapp 30 %.
    """
    ohne = _fall(base_cell=0.5)
    assert _rauheitsbefunde(ohne, tmp_path) == []

    mit = _fall(base_cell=0.5, layers=cs.BoundaryLayers(
        patches=["terrain"], n_layers=3, expansion_ratio=1.2))
    befunde = _rauheitsbefunde(mit, tmp_path)

    assert len(befunde) == 1
    # und der Text nennt die Grenzschichten als Ursache
    assert "Grenzschichten" in befunde[0]["message"]


def test_glattes_material_bleibt_still(tmp_path):
    box = cs.RefineBox(id="fein", type="box", level=3,
                       extent=(0, 0, 90, 24, 18, 100))
    assert _rauheitsbefunde(
        _fall(material="beton_glatt", refinements=[box]), tmp_path) == []


def test_der_rechen_bekommt_keinen_zweiten_befund(tmp_path):
    """
    Ein Rechen hat keine eigene Netzflaeche (er wirkt als poroese Zone).
    Dass Material an ihm wirkungslos ist, meldet bereits _pruefe_rechen —
    ein zweiter Befund derselben Sache waere Laerm.
    """
    spec = build_spec_stage3()
    for st in spec.structures:
        if st.type == "screen":
            st.material = "steinschuettung"
            break
    else:
        return                       # kein Rechen im Fixture: nichts zu tun
    spec.mesh.base_cell = 0.1
    assert not any(b["message"].startswith("Rauheit")
                   for b in validate_case(spec, tmp_path)
                   if b["object_id"] == st.id)


def test_die_lage_der_wandfunktion_wird_einmal_genannt(tmp_path):
    """
    y+ liegt bei diesen Zellgroessen weit ueber dem Gueltigkeitsbereich
    der Wandfunktion. Das ist kein Fehlbedienen — aber es entscheidet,
    wie eine tau-Zahl zu lesen ist, und stand nirgends.
    """
    befunde = [b for b in validate_case(_fall(), tmp_path)
               if "Wandauflösung" in b["message"]]

    assert len(befunde) == 1
    assert befunde[0]["severity"] == "hinweis"     # normal, keine Warnung
    text = befunde[0]["message"]
    assert "30 bis 300" in text
    assert "VERGLEICH" in text and "kein Messwert" in text
    # Der Tausenderpunkt darf die Satzkommas nicht mitnehmen
    assert "aber, dass" in text


def test_kein_befund_traegt_eine_kur_als_freitext(tmp_path):
    """
    `fix` ist eine benannte Kur-AKTION (dict), die das Panel als Knopf
    anbietet — kein Freitext. Ein String dort brachte den Aufrufer zum
    Absturz, der `b["fix"].get("aktion")` liest. Zwei Leerlauf-Befunde vom
    16.08. hatten das stumm; gefunden hat es erst der Rauheits-Befund, als
    er im selben Fall dazukam.
    """
    spec = _fall()
    spec.solver.abbruch = cs.Abbruch()
    spec.solver.initial_level = None
    spec.solver.vorfuellungen = []
    for b in validate_case(spec, tmp_path):
        f = b.get("fix")
        assert f is None or isinstance(f, dict), (b["object_id"], f)
