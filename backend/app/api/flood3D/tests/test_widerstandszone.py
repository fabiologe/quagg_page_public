"""
Widerstandszonen — Rechen, Steinschüttung, Bewuchs.

Alle drei laufen durch dieselbe Maschinerie (topoSet-Kasten → cellZone →
explicitPorositySource), und genau deshalb muss festgehalten sein, worin
sie sich UNTERSCHEIDEN. Zwei Zusagen tragen die ganze Sache:

  * Der Rechen ist ein FLÄCHENverlust: ζ gilt für die Ebene. Er wird auf
    die Zonentiefe verteilt, also hängt f an ihr. Verdoppelt man die
    Zonentiefe, halbiert sich f — der Verlust bleibt gleich.
  * Steinschüttung und Bewuchs sind VOLUMENwiderstände. Ihre Beiwerte
    sind schon „je Meter"; f darf sich mit der Zonentiefe NICHT ändern —
    ein doppelt so dicker Steinwall bremst doppelt so stark.

Wird das verwechselt, sieht man nichts: es kommt eine plausible Zahl
heraus, nur die falsche. Genau dieser Fehler steckte schon einmal drin
(F1: auf die Stabtiefe normiert statt auf die Zonentiefe, 2,5× zu viel).
"""
import math

import pytest
from pydantic import ValidationError

from ..core import casespec as cs
from ..core.casebuilder import (_SCREEN_ZONE_TIEFE, _screen_resistance,
                                _zonen_tiefe, fv_options, topo_set_dict)
from ..core.validate import validate_case, zone_wirksam
from .synthetic_case import build_spec_stage3


def _zone(**kw) -> cs.StructScreen:
    """Eine Widerstandszone; Vorbelegung ist der Rechen wie bisher."""
    grund = dict(id="zone_1", type="screen", patch="zone_1",
                 plane_polygon=[(6, 8.0, 94.6), (6, 10.0, 94.6),
                                (6, 10.0, 96.6), (6, 8.0, 96.6)],
                 bar_spacing=0.02, bar_thickness=0.008,
                 resistance=cs.ScreenResistance())
    grund.update(kw)
    return cs.StructScreen(**grund)


# --- Rechen: unverändert --------------------------------------------------

def test_rechen_bleibt_kirschmer():
    """Der Altbestand rechnet weiter genau wie vorher."""
    s = _zone()
    zeta = 2.42 * (0.008 / (0.02 - 0.008)) ** (4 / 3) * math.sin(math.radians(90))
    d, f = _screen_resistance(s)
    assert d == (0.0, 0.0, 0.0)
    assert f[0] == pytest.approx(zeta / _SCREEN_ZONE_TIEFE, rel=1e-9)
    # gerichtet: längs der Rechenebene steht nichts im Weg
    assert f[1] == 0.0 and f[2] == 0.0


def test_rechen_verteilt_seinen_verlust_auf_die_zonentiefe():
    """f·L ist die Erhaltungsgröße — nicht f."""
    flach = _zone(zonen_tiefe=0.15)
    tief = _zone(zonen_tiefe=0.60)
    _, f_flach = _screen_resistance(flach)
    _, f_tief = _screen_resistance(tief)
    assert f_tief[0] == pytest.approx(f_flach[0] / 4, rel=1e-9)
    assert f_tief[0] * 0.60 == pytest.approx(f_flach[0] * 0.15, rel=1e-9)


# --- Steinschüttung: Ergun ------------------------------------------------

def _steine(dp=0.10, eps=0.40, **kw):
    return _zone(bar_spacing=None, bar_thickness=None,
                 resistance=cs.ScreenResistance(
                     kind="steinschuettung", korngroesse=dp, porositaet=eps),
                 **kw)


def test_steinschuettung_trifft_ergun():
    """
    Ergun: Δp/L = 150·μ(1−ε)²/(ε³d_p²)·u + 1,75·ρ(1−ε)/(ε³d_p)·u².
    OpenFOAM bildet ½ρ·f·u², also f = 2·1,75·(1−ε)/(ε³d_p).
    """
    d, f = _screen_resistance(_steine(dp=0.10, eps=0.40))
    rest, eps, dp = 0.60, 0.40, 0.10
    assert d[0] == pytest.approx(150 * rest ** 2 / (eps ** 3 * dp ** 2), rel=1e-9)
    assert f[0] == pytest.approx(3.5 * rest / (eps ** 3 * dp), rel=1e-9)


def test_steinschuettung_wirkt_in_alle_richtungen():
    """Ein Haufwerk hat keine Vorzugsrichtung — der Rechen schon."""
    _, f_steine = _screen_resistance(_steine())
    assert f_steine[0] == f_steine[1] == f_steine[2]
    _, f_rechen = _screen_resistance(_zone())
    assert f_rechen[1] == 0.0


def test_steinschuettung_bremst_mit_der_dicke_mehr():
    """
    DER Unterschied zum Rechen: der Beiwert ist schon „je Meter". Würde er
    wie beim Rechen auf die Zonentiefe normiert, wäre eine 2 m dicke
    Schüttung genauso durchlässig wie eine 20 cm dicke.
    """
    _, f_duenn = _screen_resistance(_steine(zonen_tiefe=0.2))
    _, f_dick = _screen_resistance(_steine(zonen_tiefe=2.0))
    assert f_dick[0] == pytest.approx(f_duenn[0], rel=1e-12)


def test_groeberes_korn_laesst_mehr_durch():
    _, f_fein = _screen_resistance(_steine(dp=0.03))
    _, f_grob = _screen_resistance(_steine(dp=0.30))
    assert f_grob[0] < f_fein[0] / 5


# --- Bewuchs ---------------------------------------------------------------

def _busch(a=3.0, cw=None, **kw):
    return _zone(bar_spacing=None, bar_thickness=None,
                 resistance=cs.ScreenResistance(
                     kind="bewuchs", flaechendichte=a, cw=cw), **kw)


def test_bewuchs_ist_reiner_formwiderstand():
    d, f = _screen_resistance(_busch(a=3.0))
    assert d == (0.0, 0.0, 0.0)          # zäher Anteil spielt keine Rolle
    assert f[0] == pytest.approx(1.2 * 3.0, rel=1e-9)
    assert f[0] == f[1] == f[2]


def test_bewuchs_nimmt_den_eigenen_beiwert():
    _, f = _screen_resistance(_busch(a=2.0, cw=1.0))
    assert f[0] == pytest.approx(2.0, rel=1e-9)


# --- Maße gehören zur Art --------------------------------------------------

def test_steinschuettung_ohne_korngroesse_wird_abgelehnt():
    with pytest.raises(ValidationError, match="Korngröße"):
        cs.ScreenResistance(kind="steinschuettung", porositaet=0.4)


def test_unmoeglicher_porenanteil_wird_abgelehnt():
    with pytest.raises(ValidationError, match="Porenanteil"):
        cs.ScreenResistance(kind="steinschuettung", korngroesse=0.1,
                            porositaet=1.4)


def test_rechen_ohne_stabmasse_wird_abgelehnt():
    with pytest.raises(ValidationError, match="Stabteilung"):
        _zone(bar_spacing=None)


def test_bewuchs_braucht_keine_stabmasse():
    """Sonst müsste man an einem Busch eine Stabdicke erfinden."""
    assert _busch().bar_spacing is None


# --- Der Kasten im Netz ----------------------------------------------------

def test_zonentiefe_steht_im_toposet():
    """Der Kasten muss so tief sein wie die Zone — sonst stimmt Δp nicht."""
    spec = build_spec_stage3()
    spec.structures = [s for s in spec.structures if s.type != "screen"]
    spec.structures.append(_steine(id="wall_1", patch="wall_1",
                                   zonen_tiefe=1.5))
    text = topo_set_dict(spec)
    # k-Vektor der gedrehten Box: Ebene liegt in x = 6, Normale ist x
    zeile = [z for z in text.splitlines() if z.strip().startswith("k ")][0]
    zahlen = [abs(float(x)) for x in
              zeile.split("(")[1].split(")")[0].split()]
    assert max(zahlen) == pytest.approx(1.5, rel=1e-6)


def test_vorbelegung_bleibt_bei_0_15():
    assert _zonen_tiefe(_zone()) == _SCREEN_ZONE_TIEFE


def test_fvoptions_traegt_die_isotropen_beiwerte():
    spec = build_spec_stage3()
    spec.structures = [s for s in spec.structures if s.type != "screen"]
    spec.structures.append(_busch(id="busch_1", patch="busch_1",
                                  zonen_tiefe=2.0))
    text = fv_options(spec)
    assert "busch_1Zone" in text
    f_zeile = [z for z in text.splitlines() if z.strip().startswith("f ")][0]
    werte = [float(x) for x in f_zeile.split("(")[1].split(")")[0].split()]
    assert werte[0] == werte[1] == werte[2] > 0


# --- Prüfung ---------------------------------------------------------------

def _befunde(struct, tmp_path, **mesh_kw):
    spec = build_spec_stage3()
    spec.structures = [s for s in spec.structures if s.type != "screen"]
    spec.structures.append(struct)
    for k, v in mesh_kw.items():
        setattr(spec.mesh, k, v)
    return [b for b in validate_case(spec, tmp_path)
            if b["object_id"] == struct.id]


def _texte(befunde, stufe=None):
    return " ".join(b["message"] for b in befunde
                    if stufe is None or b["severity"] == stufe)


def test_zone_duenner_als_eine_zelle_ist_ein_fehler(tmp_path):
    """
    Der stille Totalausfall: topoSet wählt Zellen nach ihrem MITTELPUNKT.
    Ein Kasten, der dünner als eine Zelle ist, erwischt je nach Lage
    keine einzige — die Widerstandsquelle stünde in einer leeren cellZone
    und bremste nichts, ohne dass irgendwo etwas rot würde.
    """
    b = _befunde(_steine(id="duenn", patch="duenn", zonen_tiefe=0.10),
                 tmp_path, base_cell=1.0, refinements=[])
    assert any(x["severity"] == "fehler" and "Zellen quer" in x["message"]
               for x in b), _texte(b)


def test_zone_ueber_vier_zellen_ist_still(tmp_path):
    b = _befunde(_steine(id="dick", patch="dick", zonen_tiefe=5.0),
                 tmp_path, base_cell=1.0, refinements=[])
    assert "Zellen quer" not in _texte(b)


def test_zu_duenne_zone_meldet_den_verlorenen_anteil(tmp_path):
    """
    Nicht „könnte wirkungslos sein", sondern wieviel ankommt. Bei zwei
    Zellen quer sind es rund zwei Drittel — wer das nicht weiß, schreibt
    einen Verlust in den Bericht, der so nie gerechnet wurde.
    """
    b = _befunde(_steine(id="knapp", patch="knapp", zonen_tiefe=2.0),
                 tmp_path, base_cell=1.0, refinements=[])
    text = _texte(b, "warnung")
    assert "63 %" in text and "nur zum Teil" in text


def test_wirksamer_anteil_trifft_die_messreihe():
    """
    Gemessen an einem 1D-Kastenfall in interFoam v2406 gegen den
    Ergun-Wert. Die Anpassung darf sich nicht unbemerkt verschieben —
    sie steht in einem Befund, den jemand liest und glaubt.
    """
    for n, soll in ((2, 0.63), (4, 0.83), (8, 0.92), (16, 0.97)):
        assert abs(zone_wirksam(n) - soll) < 0.06, n
    assert zone_wirksam(0.5) == 0.0


def test_steinschuettung_meldet_das_fehlende_speichervolumen(tmp_path):
    """
    OpenFOAM setzt hier eine Impulsquelle, KEINE Porosität im Volumen: die
    Zellen speichern weiter vollen Wasserinhalt. Bei ε = 0,4 passt in die
    Zone 2,5-mal so viel Wasser wie in Wirklichkeit — wer damit ein
    Rückhaltevolumen nachweist, rechnet sich reich.
    """
    b = _befunde(_steine(id="schuettung", patch="schuettung",
                         zonen_tiefe=3.0, eps=0.40),
                 tmp_path, base_cell=1.0, refinements=[])
    assert "verdrängt aber kein Wasser" in _texte(b, "hinweis")


def test_manuell_ohne_beiwerte_ist_eine_warnung(tmp_path):
    z = _zone(id="leer", patch="leer", bar_spacing=None, bar_thickness=None,
              resistance=cs.ScreenResistance(kind="manuell"))
    assert "bremst nichts" in _texte(_befunde(z, tmp_path), "warnung")


def test_abgeleiteter_beiwert_steht_im_klartext(tmp_path):
    b = _befunde(_steine(id="steine", patch="steine", zonen_tiefe=3.0),
                 tmp_path, base_cell=1.0, refinements=[])
    assert "Ergun" in _texte(b, "hinweis")
    b2 = _befunde(_busch(id="busch", patch="busch", zonen_tiefe=3.0),
                  tmp_path, base_cell=1.0, refinements=[])
    assert "Formwiderstand" in _texte(b2, "hinweis")


def test_dichte_steinschuettung_ist_ein_hinweis_keine_warnung(tmp_path):
    """
    ξ ≈ 200 ist bei einer Steinschüttung der NORMALFALL, kein Bedienfehler:
    durch Wasserbausteine geht kaum Wasser hindurch, es geht darüber. Als
    Warnung wäre das ein Fehlalarm auf jeder Schüttung — der Nutzer
    gewöhnt sich daran und übersieht die echten.
    """
    b = _befunde(_steine(id="damm", patch="damm", zonen_tiefe=3.0),
                 tmp_path, base_cell=1.0, refinements=[])
    dicht = [x for x in b if "praktisch dicht" in x["message"]]
    assert dicht and dicht[0]["severity"] == "hinweis"
    assert "Überströmung" in dicht[0]["message"]


def test_dichter_rechen_ist_eine_warnung(tmp_path):
    """Beim Rechen dagegen heißt ξ ≈ 200: da stimmt etwas nicht."""
    z = _zone(id="dicht", patch="dicht", zonen_tiefe=3.0,
              bar_spacing=0.02, bar_thickness=0.017,
              resistance=cs.ScreenResistance(blockage_ratio=0.8))
    b = _befunde(z, tmp_path, base_cell=1.0, refinements=[])
    dicht = [x for x in b if "praktisch dicht" in x["message"]]
    assert dicht and dicht[0]["severity"] == "warnung"


def test_flaechenverfeinerung_auf_eine_zone_wird_gemeldet(tmp_path):
    """
    Eine Widerstandszone hat keine Fläche im Netz. Eine Flächenverfeinerung
    darauf findet nichts zu verfeinern — snappy schweigt, der Nutzer sieht
    einen Eintrag in der Liste und glaubt, er habe etwas getan.
    """
    from ..core import casespec as cs2
    spec = build_spec_stage3()
    spec.mesh.refinements.append(
        cs2.RefineSurface(id="fein_rechen", type="surface",
                          target="rechen_1", level=2))
    b = [x for x in validate_case(spec, tmp_path) if x["object_id"] == "fein_rechen"]
    assert b and b[0]["severity"] == "warnung"
    assert "Verfeinerungsbox" in b[0]["message"]


# --- Vertrag zum Client ----------------------------------------------------
# Dieselbe Tabelle steht im Client (test/widerstand.test.js) und speist dort
# die Startwerte beim Artwechsel. Verlangt das Modell hier eines Tages mehr,
# muss der Client mitziehen — sonst erzeugt ein Klick im Auswahlkasten ein
# Bauwerk, das sich nicht speichern laesst.
PFLICHT_JE_ART = {
    "rechen": ["bar_spacing", "bar_thickness"],
    "steinschuettung": ["korngroesse", "porositaet"],
    "bewuchs": ["flaechendichte"],
    "manuell": [],
}


@pytest.mark.parametrize("art", sorted(PFLICHT_JE_ART))
def test_genau_diese_angaben_werden_verlangt(art):
    """
    Jedes Pflichtfeld EINZELN weglassen: fehlt es, muss das Modell nein
    sagen. Sind alle da, muss es ja sagen. Ohne diesen Test koennte ein
    Feld still zur Pflicht werden und der Client fuellte es nicht.
    """
    voll = {"rechen": dict(bar_spacing=0.02, bar_thickness=0.008),
            "steinschuettung": dict(korngroesse=0.1, porositaet=0.4),
            "bewuchs": dict(flaechendichte=3.0),
            "manuell": {}}[art]
    am_bauwerk = {"bar_spacing", "bar_thickness"}
    bauen = lambda w: _zone(                                    # noqa: E731
        bar_spacing=w.get("bar_spacing"), bar_thickness=w.get("bar_thickness"),
        resistance=cs.ScreenResistance(kind=art, **{
            k: v for k, v in w.items() if k not in am_bauwerk}))

    bauen(voll)                                   # vollstaendig -> geht
    for fehlt in PFLICHT_JE_ART[art]:
        with pytest.raises(ValidationError):
            bauen({k: v for k, v in voll.items() if k != fehlt})
