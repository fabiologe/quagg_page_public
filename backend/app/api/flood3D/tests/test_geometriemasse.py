"""
Geometriemaße (Etappe E5c der Sanierung, Audit P10, P4, P12, P7).

P10: Geländelage an den vier Ecken des Hüllquaders — ein Wehr quer im
Flussschlauch „verschwand unter dem Gelände". P4: „Rohr im Erdreich" maß
den ANTEIL der Rohrlänge (15 %), ein kurzer Damm blieb stumm. P12: die
Sperrbreite eines Rohrs war seine Achslänge (längs) oder null (quer).
P7: „Nennweite über 1,5 m ungewöhnlich" stand am DN800 des Testfalls.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core import casespec as cs
from ..core.anschluss import verschuettete_strecke
from ..core.terrain import TerrainField
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3, build_spec_tal, tal_hoehe


def _meldungen(spec, obj, base_dir="."):
    return [b["message"] for b in validate_case(spec, base_dir)
            if b["object_id"] == obj]


# ---- P10 ------------------------------------------------------------------

def test_wehr_quer_im_tal_verschwindet_nicht_unter_dem_gelaende(tmp_path):
    spec = build_spec_tal(tmp_path)
    ys = np.linspace(20.0, 70.0, 51)
    boden = np.array([tal_hoehe(70.0, y) for y in ys])
    krone = float(boden.min()) + 0.5          # knapp über der Talsohle
    # an beiden Enden (den Ecken des Hüllquaders) liegt das Gelände HÖHER
    # als die Krone — die alte Eckenregel hätte „verschwindet" gemeldet
    assert boden[0] > krone and boden[-1] > krone
    spec.structures.append(cs.StructWeir(
        id="wehr", type="weir", patch="wehr",
        crest_polyline=[(70.0, 20.0, krone), (70.0, 70.0, krone)],
        crest_width=1.0, slope_upstream=1.5, slope_downstream=1.5,
        base_level=krone - 3.0))
    m = _meldungen(spec, "wehr", tmp_path)
    assert not [x for x in m if "verschwindet" in x], m
    assert not [x for x in m if "hängt in der Luft" in x], m


# ---- P4 -------------------------------------------------------------------

def _mit_damm(breite: float) -> cs.CaseSpec:
    """Rohr 20 m lang knapp über dem flachen Gelände, ein Damm `breite` m quer."""
    spec = build_spec_stage3()
    spec.terrain.operations.append(cs.OpPad(
        id="damm", type="pad", level=97.5,
        polygon=[(10.0, 14.0), (10.0 + breite, 14.0),
                 (10.0 + breite, 17.0), (10.0, 17.0)]))
    spec.structures.append(cs.StructCulvert(
        id="rohr_lang", type="culvert", patch="rohr_lang",
        axis=[(2.0, 15.5, 96.4), (22.0, 15.5, 96.4)],
        profile=cs.CulvertProfile(kind="circular", diameter=0.6)))
    return spec


def test_kurzer_damm_ueber_langem_rohr_wird_gemeldet():
    """2 m Damm über 20 m Rohr = 10 % — vorher stumm (Schwelle 15 %)."""
    import re

    spec = _mit_damm(2.0)
    m = [x for x in _meldungen(spec, "rohr_lang") if "unter dem Gelände" in x]
    assert m and "am Stück" in m[0], m
    # das Planum hat Böschungsflanken: 2 m Krone werden ~3 m Verschüttung
    strecke = float(re.search(r"auf ([\d.]+) m am Stück", m[0]).group(1))
    assert 2.0 <= strecke <= 4.0, m[0]


def test_streifendes_rohr_bleibt_stumm():
    """0,4 m Damm bei 0,5-m-Zelle: unter zwei Zellen trennt der Vernetzer nicht."""
    spec = _mit_damm(0.4)
    assert not [x for x in _meldungen(spec, "rohr_lang") if "unter dem Gelände" in x]


def test_verschuettete_strecke_misst_meter_nicht_anteil():
    class Ebene:
        def sample(self, xs, ys):
            return np.where((np.asarray(xs) > 100) & (np.asarray(xs) < 110), 99.0, 90.0)
    achse = [(0.0, 0.0, 95.0), (200.0, 0.0, 95.0)]
    assert verschuettete_strecke(achse, Ebene(), 0.25) == pytest.approx(10.0, abs=0.5)


# ---- P12 ------------------------------------------------------------------

def test_sperrbreite_des_rohrs_ist_sein_aussendurchmesser():
    spec = build_spec_stage3()
    # Rohr quer zum Zulaufrand x_min, Außenrand 0,25 m vor der Fläche —
    # vorher: Achsbreite quer = 0 → übersprungen, kein Befund
    spec.structures.append(cs.StructCulvert(
        id="rohr_quer", type="culvert", patch="rohr_quer",
        axis=[(0.8, 9.0, 96.5), (6.0, 9.0, 96.5)],
        profile=cs.CulvertProfile(kind="circular", diameter=0.8)))
    m = [x for x in _meldungen(spec, "rohr_quer") if "bis zum Rand" in x]
    assert m, _meldungen(spec, "rohr_quer")
    assert "1.1 m groß" in m[0], m[0]        # 0,8 + 2 · 0,15 Wandung


# ---- P7 -------------------------------------------------------------------

def test_nennweite_wird_am_zufluss_gemessen():
    spec = build_spec_stage3()
    dl = next(s for s in spec.structures if s.id == "dl_1")
    dl.axis = [(0.0, 9.0, 96.6), (6.0, 9.0, 96.4)]     # mündet am Zulaufrand
    dl.profile = cs.CulvertProfile(kind="circular", diameter=0.15)   # DN150
    zulauf = next(b for b in spec.boundaries if b.id == "zulauf")
    zulauf.window = cs.BcWindow(follow="dl_1")
    zulauf.q = 0.8
    m = [x for x in _meldungen(spec, "dl_1") if "m/s im Rohr" in x]
    assert m and "strahlartig" in m[0], m           # 45 m/s
    # DN2000 mit 0,8 m³/s: 0,25 m/s — kein Befund (vorher: „ungewöhnlich")
    dl.profile = cs.CulvertProfile(kind="circular", diameter=2.0)
    assert not [x for x in _meldungen(spec, "dl_1")
                if "m/s im Rohr" in x or "ungewöhnlich" in x]
    # DN2000 mit 0,01 m³/s: sehr groß für den Zufluss — ein Hinweis
    zulauf.q = 0.01
    assert [x for x in _meldungen(spec, "dl_1") if "sehr groß" in x]


def test_ungekoppeltes_rohr_wird_nur_am_gebiet_gemessen():
    spec = build_spec_stage3()
    dl = next(s for s in spec.structures if s.id == "dl_1")
    dl.profile = cs.CulvertProfile(kind="circular", diameter=1.6)   # 1,6 < 18/3
    assert not [x for x in _meldungen(spec, "dl_1")
                if "ungewöhnlich" in x or "Drittel" in x]
    dl.profile = cs.CulvertProfile(kind="circular", diameter=7.0)   # 7 > 6
    assert [x for x in _meldungen(spec, "dl_1") if "Drittel" in x]
