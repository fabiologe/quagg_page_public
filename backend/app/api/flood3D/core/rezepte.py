"""
rezepte — ein Bauwerk in einem Zug einsetzen (Spez. Kap. 1.3, Stufe B).

Ein Drosselschacht ist kein Grundkörper, sondern eine Anordnung: Kammer
ausheben, Trennwand hineinstellen, Drosselöffnung aussparen, Zulauf und
Ablauf anschließen, das Ganze fein genug vernetzen und gegen das richtige
Kriterium prüfen. Wer das aus Grundformen zusammensetzt, macht sechs
Schritte und vergisst beim siebten die Verfeinerung.

ENTSCHEIDUNG (Stufe B): ein Rezept setzt MEHRERE VORHANDENE Objekte ein und
wird kein eigener Bauwerkstyp. Der Grund ist die Bearbeitbarkeit — jedes
Teil bleibt danach einzeln im Objektbaum wählbar, verschiebbar und im
Undo-Verlauf, und jede vorhandene Prüfregel greift unverändert. Ein eigener
Typ wäre als Ganzes validierbar, aber nach dem Einsetzen eine Blackbox.

Jedes Rezept bringt sein Hydraulikwissen mit (Spez. Kap. 1.6 und 14.5):
nötige Verfeinerung, einschlägiges Regelwerk, typisches Nachweiskriterium
und den Satz, worauf es bei diesem Bauwerk ankommt. Das ist der eigentliche
Mehrwert gegenüber „Kammer plus Wand".
"""
from __future__ import annotations

import math

from .casespec import CaseSpec

# --------------------------------------------------------------------------
# Hilfen
# --------------------------------------------------------------------------


def _belegte_ids(spec: CaseSpec) -> set[str]:
    ids = {s.id for s in spec.structures}
    ids |= {r.id for r in (spec.mesh.refinements if spec.mesh else [])}
    ids |= {o.id for o in (spec.terrain.operations if spec.terrain else [])}
    if spec.evaluation is not None:
        ids |= {t.id for t in spec.evaluation.targets}
        ids |= {g.id for g in spec.evaluation.gauges}
        ids |= {s.id for s in spec.evaluation.sections}
    return ids


def _gelaende_z(spec: CaseSpec, base_dir, x: float, y: float,
                umkreis: float = 0.0) -> float:
    """
    Geländehöhe an einer Stelle. Mit `umkreis` die HÖCHSTE Höhe im Umkreis
    — das ist der richtige Wert für einen Deckel: auf geneigtem Gelände
    läge er sonst bergseitig unter der Erde und wäre damit ein
    verschlossener Hohlraum.
    """
    if spec.terrain is None or spec.domain is None:
        return 0.0
    import numpy as np

    from .terrain import TerrainField
    feld = TerrainField.from_spec(spec.terrain, spec.domain, base_dir)
    if umkreis <= 0:
        return float(feld.sample(np.array(x), np.array(y)))
    winkel = np.linspace(0.0, 2 * math.pi, 13)[:-1]
    xs = np.concatenate([[x], x + umkreis * np.cos(winkel)])
    ys = np.concatenate([[y], y + umkreis * np.sin(winkel)])
    return float(np.max(feld.sample(xs, ys)))


def _mitte(spec: CaseSpec, args: dict) -> tuple[float, float]:
    if args.get("center"):
        return float(args["center"][0]), float(args["center"][1])
    x0, y0, x1, y1 = spec.domain.extent
    return (x0 + x1) / 2, (y0 + y1) / 2


def _zelle(spec: CaseSpec) -> float:
    return spec.mesh.base_cell if spec.mesh else 0.25


def _stufe_fuer(spec: CaseSpec, mass: float) -> int:
    """Verfeinerungsstufe, die `mass` mit mindestens vier Zellen auflöst."""
    from .meshgen import stufe_fuer
    return stufe_fuer(_zelle(spec), mass)


def _rechteck(cx: float, cy: float, b: float, l: float) -> list:
    return [(round(cx - b / 2, 3), round(cy - l / 2, 3)),
            (round(cx + b / 2, 3), round(cy - l / 2, 3)),
            (round(cx + b / 2, 3), round(cy + l / 2, 3)),
            (round(cx - b / 2, 3), round(cy + l / 2, 3))]


class _Bauplan:
    """Sammelt, was ein Rezept in den Fall legt, und begründet es."""

    def __init__(self, spec: CaseSpec):
        self.spec = spec
        self.structures = []
        self.refinements = []
        self.targets = []
        self.gauges = []
        self.sections = []
        self.regelwerk: list[str] = []
        self.meldungen: list[str] = []
        # Auch die noch nicht eingehängten Kennungen zählen als vergeben —
        # sonst kollidieren zwei Stufen desselben Rezepts miteinander
        self._vergeben = _belegte_ids(spec)

    def neu(self, stamm: str) -> str:
        kennung = stamm
        n = 2
        while kennung in self._vergeben:
            kennung = f"{stamm}_{n}"
            n += 1
        self._vergeben.add(kennung)
        return kennung

    def struktur(self, obj) -> None:
        self.structures.append(obj)

    def pegel(self, stamm: str, x: float, y: float) -> str:
        """
        Pegelpunkt anlegen und seine id zurückgeben. Ein Kriterium ohne
        Bezugsobjekt ist nicht speicherbar — das Rezept weiß, wo der Pegel
        hingehört, also setzt es ihn selbst.
        """
        from .casespec import Gauge
        gid = self.neu(stamm)
        self.gauges.append(Gauge(id=gid, point=(round(x, 3), round(y, 3))))
        return gid

    def querschnitt(self, stamm: str, punkte) -> str:
        from .casespec import Section
        sid = self.neu(stamm)
        self.sections.append(Section(
            id=sid, polyline=[(round(p[0], 3), round(p[1], 3)) for p in punkte]))
        return sid

    def box(self, extent, level: int, stamm: str) -> None:
        """
        Verfeinerungsquader, auf das Modellgebiet beschnitten. Ohne den
        Zuschnitt ragt er über den Rand, sobald das Bauwerk nahe an der
        Gebietsgrenze sitzt — und die Prüfung meldet einen Fehler an einem
        Objekt, das das Rezept selbst gerade angelegt hat.
        """
        from .casespec import RefineBox
        d = self.spec.domain
        x0, y0, x1, y1 = d.extent
        gx0, gy0, gz0, gx1, gy1, gz1 = (float(v) for v in extent)
        geklemmt = (max(gx0, x0), max(gy0, y0), max(gz0, d.z_min),
                    min(gx1, x1), min(gy1, y1), min(gz1, d.z_max))
        self.refinements.append(RefineBox(
            id=self.neu(stamm), type="box",
            extent=tuple(round(v, 3) for v in geklemmt), level=level))

    def flaeche(self, patch: str, level: int) -> None:
        from .casespec import RefineSurface
        vorhanden = next(
            (r for r in (self.spec.mesh.refinements if self.spec.mesh else [])
             if r.type == "surface" and r.target == patch), None)
        if vorhanden is not None and vorhanden.level >= level:
            return
        self.refinements.append(RefineSurface(
            id=self.neu(f"fein_{patch}"), type="surface",
            target=patch, level=level))

    def kriterium(self, obj) -> None:
        self.targets.append(obj)

    def sagen(self, text: str) -> None:
        self.meldungen.append(text)


# --------------------------------------------------------------------------
# Rezepte
# --------------------------------------------------------------------------

def _richtung(spec: CaseSpec) -> tuple[float, float]:
    """
    Fließrichtung des Falls: vom ersten Zulaufrand ins Gebiet (x_min → +x,
    y_max → −y, …), ohne Zulauf +y. Bis 2026-09-22 stand jedes Rezept fest
    in +y — bei Zulauf von Westen stand der Pegel „oberstrom" neben dem
    Bauwerk und die Endschwelle quer zur Strömung falsch (Audit P14).
    """
    from .casebuilder import _bc_face

    for b in spec.boundaries:
        if b.type in ("inflow_hydrograph", "inflow_constant"):
            face = _bc_face(spec, b)
            return {"x_min": (1.0, 0.0), "x_max": (-1.0, 0.0),
                    "y_min": (0.0, 1.0), "y_max": (0.0, -1.0)}.get(face, (0.0, 1.0))
    return (0.0, 1.0)


class _Rahmen:
    """
    Lokales Achsenkreuz eines Rezepts um (cx, cy): v läuft MIT der
    Strömung, u quer dazu (rechts). Alle Rezepte notieren ihre Geometrie
    in (u, v) und bekommen so dieselbe Anordnung in jeder Fließrichtung.
    """

    def __init__(self, spec: CaseSpec, cx: float, cy: float) -> None:
        self.cx, self.cy = float(cx), float(cy)
        self.ey = _richtung(spec)
        self.ex = (self.ey[1], -self.ey[0])

    def punkt(self, u: float, v: float) -> tuple[float, float]:
        return (round(self.cx + u * self.ex[0] + v * self.ey[0], 3),
                round(self.cy + u * self.ex[1] + v * self.ey[1], 3))

    def rechteck(self, b: float, l: float, v0: float = 0.0) -> list:
        """Grundriss b quer × l längs, Mitte bei v0 auf der Achse."""
        return [self.punkt(-b / 2, v0 - l / 2), self.punkt(b / 2, v0 - l / 2),
                self.punkt(b / 2, v0 + l / 2), self.punkt(-b / 2, v0 + l / 2)]

    def kasten(self, b: float, l: float, z0: float, z1: float,
               rand: float, v0: float = 0.0) -> tuple:
        pts = self.rechteck(b + 2 * rand, l + 2 * rand, v0)
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        return (round(min(xs), 3), round(min(ys), 3), round(z0, 3),
                round(max(xs), 3), round(max(ys), 3), round(z1, 3))


def _drosselschacht(p: _Bauplan, args: dict, base_dir) -> None:
    """
    Kammer mit Trennwand und Drosselöffnung. Die Drossel ist die Stelle, an
    der der Nachweis hängt: ihre lichte Weite bestimmt den Abfluss, und sie
    ist zugleich das kleinste Maß im ganzen Modell.
    """
    spec = p.spec
    cx, cy = _mitte(spec, args)
    R = _Rahmen(spec, cx, cy)
    tiefe = float(args.get("tiefe", 2.5))
    weite = float(args.get("weite", 2.0))
    laenge = float(args.get("laenge", 3.0))
    oeffnung = float(args.get("oeffnung", 0.3))
    wand = float(args.get("wandstaerke", 0.3))
    # Deckelhöhe = höchstes Gelände über dem Grundriss
    gz = _gelaende_z(spec, base_dir, cx, cy, max(weite, laenge) / 2 + wand)
    sohle = round(gz - tiefe, 3)

    from .casespec import (EditAussparung, StructKammer, StructWall,
                           TargetMaxLevel, Alignment)

    kammer_id = p.neu("drosselkammer")
    p.struktur(StructKammer(
        id=kammer_id, type="kammer", patch=kammer_id,
        footprint=R.rechteck(weite, laenge),
        invert_level=sohle, top_level=round(gz, 3),
        wall_thickness=wand, wirkung="aushub"))

    wand_id = p.neu("drosselwand")
    a, b = R.punkt(-weite / 2, 0.0), R.punkt(weite / 2, 0.0)
    p.struktur(StructWall(
        id=wand_id, type="wall", patch=wand_id,
        alignment=Alignment(kind="polyline", points=[
            (a[0], a[1], round(gz, 3)), (b[0], b[1], round(gz, 3))]),
        # bis auf die AUSHUBSOHLE, nicht auf die lichte Sohle — sonst
        # klafft unter der Wand eine Fuge von einer Wandstärke, durch die
        # der Solver das Wasser rechnet
        height=round(tiefe + wand, 3), thickness=round(wand, 3),
        edits=[EditAussparung(
            id="drossel", type="aussparung", shape="kreis",
            station=round(weite / 2, 3),
            z=round(sohle + oeffnung / 2, 3), diameter=oeffnung)]))

    stufe = _stufe_fuer(spec, oeffnung)
    p.flaeche(wand_id, stufe)
    rand = 4 * _zelle(spec)
    p.box(R.kasten(weite, laenge, sohle - rand, gz + rand, rand),
          level=max(stufe - 1, 1), stamm=f"fein_{kammer_id}")

    # Der Pegel gehört OBERSTROM der Drosselwand — dort staut es ein
    px, py = R.punkt(0.0, -laenge / 4)
    pegel = p.pegel("pegel_drosselkammer", px, py)
    p.kriterium(TargetMaxLevel(
        id=p.neu("einstau_drossel"), kind="max_level",
        at=pegel, limit_max=round(gz, 2)))
    p.regelwerk += ["DWA-A 111", "DWA-A 112"]
    p.sagen(f"Drosselöffnung {oeffnung:g} m ist das kleinste Maß im Modell — "
            f"Verfeinerungsstufe {stufe} ({_zelle(spec) / 2 ** stufe:g} m) "
            "gesetzt, damit sie im Netz überhaupt ankommt.")
    p.sagen(f"Pegel „{pegel}“ steht oberstrom der Drosselwand; das "
            "Einstaukriterium liegt auf Geländehöhe und ist der Wert, der "
            "im Nachweis nicht überschritten werden darf.")
    p.sagen("Der Drosselabfluss selbst gehört als Ablauf-Randbedingung "
            "(Drossel, fester Q) an den Gebietsrand.")


def _trennbauwerk(p: _Bauplan, args: dict, base_dir) -> None:
    """Kammer mit Trennwand und Streichwehr — die Aufteilung ist der Nachweis."""
    spec = p.spec
    cx, cy = _mitte(spec, args)
    R = _Rahmen(spec, cx, cy)
    tiefe = float(args.get("tiefe", 2.0))
    weite = float(args.get("weite", 4.0))
    laenge = float(args.get("laenge", 6.0))
    schwelle = float(args.get("schwellenhoehe", 0.8))
    wand = float(args.get("wandstaerke", 0.3))
    gz = _gelaende_z(spec, base_dir, cx, cy, max(weite, laenge) / 2 + wand)
    sohle = round(gz - tiefe, 3)

    from .casespec import (StructKammer, StructWeir, TargetDischargeRatio)

    kammer_id = p.neu("trennkammer")
    p.struktur(StructKammer(
        id=kammer_id, type="kammer", patch=kammer_id,
        footprint=R.rechteck(weite, laenge),
        invert_level=sohle, top_level=round(gz, 3),
        wall_thickness=wand, wirkung="aushub"))

    wehr_id = p.neu("streichwehr")
    krone = round(sohle + schwelle, 3)
    # Streichwehr LÄNGS der Strömung an der rechten Kammerwand
    w0 = R.punkt(weite / 2 - wand, -laenge / 2 + wand)
    w1 = R.punkt(weite / 2 - wand, laenge / 2 - wand)
    p.struktur(StructWeir(
        id=wehr_id, type="weir", patch=wehr_id,
        crest_polyline=[(w0[0], w0[1], krone), (w1[0], w1[1], krone)],
        crest_width=round(wand, 3), slope_upstream=0.0, slope_downstream=0.0,
        # Fuß auf der Aushubsohle, nicht auf der lichten Sohle
        profile_type="scharfkantig", base_level=round(sohle - wand, 3)))

    stufe = _stufe_fuer(spec, wand)
    p.flaeche(wehr_id, stufe)
    # Zähler = was über die Schwelle geht, Nenner = was ankommt
    entlastung = p.querschnitt("qs_entlastung", [w0, w1])
    rand = 2 * _zelle(spec)
    zulauf = p.querschnitt(
        "qs_zulauf_trenn",
        [R.punkt(-weite / 2, -laenge / 2 - rand),
         R.punkt(weite / 2, -laenge / 2 - rand)])
    p.kriterium(TargetDischargeRatio(
        id=p.neu("aufteilung"), kind="discharge_ratio",
        of=entlastung, to=zulauf, limit_max=0.35))
    p.regelwerk += ["DWA-A 111", "DWA-A 112"]
    p.sagen(f"Streichwehr scharfkantig auf {krone:g} m — die Überfallhöhe "
            "über der Schwelle bestimmt die Aufteilung, deshalb steht die "
            "Verfeinerung an der Krone.")
    p.sagen(f"Aufteilung wird als „{entlastung}“ zu „{zulauf}“ gemessen "
            "(entlasteter Anteil am Zufluss); der Grenzwert 0,35 ist eine "
            "Vorbelegung und projektbezogen festzulegen.")


def _tosbecken(p: _Bauplan, args: dict, base_dir) -> None:
    """Aushub mit Endschwelle und Störkörpern — der Wechselsprung soll drin bleiben."""
    spec = p.spec
    cx, cy = _mitte(spec, args)
    R = _Rahmen(spec, cx, cy)
    zelle = _zelle(spec)
    tiefe = float(args.get("tiefe", 1.2))
    weite = float(args.get("weite", 4.0))
    laenge = float(args.get("laenge", 10.0))
    schwelle = float(args.get("schwellenhoehe", 0.5))
    gz = _gelaende_z(spec, base_dir, cx, cy, max(weite, laenge) / 2)
    sohle = round(gz - tiefe, 3)

    from .casespec import (StructKammer, StructPier, StructWeir,
                           TargetMaxBedShear)

    becken_id = p.neu("tosbecken")
    p.struktur(StructKammer(
        id=becken_id, type="kammer", patch=becken_id,
        footprint=R.rechteck(weite, laenge),
        invert_level=sohle, top_level=round(gz, 3),
        wall_thickness=0.0, wirkung="aushub"))

    # Maße folgen dem Becken und der Zelle, nicht festen Metern (Audit
    # P14: 0,4 × 0,6 × 0,6 m Störkörper, ±1,0 m Rand — bei 2-m-Zellen
    # unsichtbar, bei 0,1 m viel zu grob)
    kronenbreite = max(0.4, 2 * zelle)
    sk = max(weite / 10, 2 * zelle)                  # Störkörper quadratisch
    sk_hoehe = max(tiefe / 2, 2 * zelle)

    wehr_id = p.neu("endschwelle")
    krone = round(sohle + schwelle, 3)
    # eine halbe Kronenbreite INNERHALB des Beckens: genau auf der
    # Aushubkante stünde die Schwelle zur Hälfte im gewachsenen Boden
    v_schwelle = laenge / 2 - kronenbreite / 2
    s0, s1 = R.punkt(-weite / 2, v_schwelle), R.punkt(weite / 2, v_schwelle)
    p.struktur(StructWeir(
        id=wehr_id, type="weir", patch=wehr_id,
        crest_polyline=[(s0[0], s0[1], krone), (s1[0], s1[1], krone)],
        crest_width=round(kronenbreite, 3), slope_upstream=1.0,
        slope_downstream=1.0, profile_type="trapez", base_level=sohle))

    # Störkörper versetzt im ersten Drittel — dort steht der Wechselsprung
    anzahl = int(args.get("stoerkoerper", 3))
    for i in range(max(anzahl, 0)):
        u = -weite / 2 + weite * (i + 0.5) / max(anzahl, 1)
        sk_id = p.neu(f"stoerkoerper_{i + 1}")
        p.struktur(StructPier(
            id=sk_id, type="pier", patch=sk_id, shape="rechteck",
            center=R.punkt(u, -laenge / 4),
            width=round(sk, 3), length=round(sk, 3), base_level=sohle,
            top_level=round(sohle + sk_hoehe, 3)))

    # Box bis über den erwarteten Wasserspiegel ziehen — sonst liegt die
    # freie Oberfläche außerhalb der Verfeinerung
    rand = 2 * zelle
    oben_box = gz + rand
    if spec.solver.initial_level is not None:
        oben_box = max(oben_box, spec.solver.initial_level + rand)
    unten_box = min(sohle - rand, spec.domain.z_min)
    if spec.solver.initial_level is not None:
        unten_box = min(unten_box, spec.solver.initial_level - rand)
    p.box(R.kasten(weite, laenge, max(unten_box, spec.domain.z_min),
                   min(oben_box, spec.domain.z_max), rand),
          level=2, stamm=f"fein_{becken_id}")
    p.kriterium(TargetMaxBedShear(
        id=p.neu("sohlschub_tosbecken"), kind="max_bed_shear",
        region=p.refinements[-1].id, limit_max=25.0))
    p.regelwerk += ["DWA-A 112", "DWA-M 176"]
    p.sagen("Die Sohlschubspannung im Becken ist der Nachweis — die "
            "Verfeinerungsbox über der Sohle ist zugleich die Auswerteregion.")
    p.sagen("Ob der Wechselsprung im Becken bleibt, zeigt die Froude-Zahl im "
            "Längsschnitt; die Beckenlänge notfalls danach anpassen.")
    p.sagen(f"Störkörper {sk:g} × {sk:g} × {sk_hoehe:g} m und Endschwelle "
            f"{kronenbreite:g} m breit — aus Beckenbreite und Zelle "
            f"({zelle:g} m) abgeleitet, im Panel änderbar.")


def _absturz(p: _Bauplan, args: dict, base_dir) -> None:
    """Kaskade aus Stufenaushüben — je Stufe ein Becken."""
    spec = p.spec
    cx, cy = _mitte(spec, args)
    R = _Rahmen(spec, cx, cy)
    stufen = max(int(args.get("stufen", 3)), 1)
    hoehe = float(args.get("stufenhoehe", 0.5))
    tiefe = float(args.get("beckentiefe", 0.4))
    weite = float(args.get("weite", 2.0))
    laenge = float(args.get("stufenlaenge", 2.0))
    gz = _gelaende_z(spec, base_dir, cx, cy, max(weite, stufen * laenge) / 2)

    from .casespec import StructKammer, TargetMaxBedShear

    # Jede Stufe ist bis zur GELÄNDEOBERFLÄCHE offen — eine Kaskade ist eine
    # Rinne mit Stufen, kein Tunnel. Nur die Sohle steigt ab; ein bis zur
    # Stufenoberkante gedeckelter Aushub wäre ein verschlossener Kasten und
    # würde vom Vernetzer ersatzlos entfernt. Die Stufen fallen MIT der
    # Strömung ab.
    for i in range(stufen):
        oben = round(gz - i * hoehe, 3)
        v = -(stufen - 1) * laenge / 2 + i * laenge
        sid = p.neu(f"absturz_{i + 1}")
        p.struktur(StructKammer(
            id=sid, type="kammer", patch=sid,
            footprint=R.rechteck(weite, laenge, v0=v),
            invert_level=round(oben - tiefe, 3), top_level=round(gz, 3),
            wall_thickness=0.0, wirkung="aushub"))

    gesamt = stufen * hoehe
    rand = 2 * _zelle(spec)
    p.box(R.kasten(weite, stufen * laenge, gz - gesamt - tiefe - rand,
                   gz + rand, rand),
          level=2, stamm="fein_absturz")
    p.kriterium(TargetMaxBedShear(
        id=p.neu("sohlschub_absturz"), kind="max_bed_shear",
        region=p.refinements[-1].id, limit_max=25.0))
    p.regelwerk += ["DWA-A 112", "DWA-M 176"]
    p.sagen(f"{stufen} Stufen zu {hoehe:g} m, Gesamtabsturz {gesamt:g} m. "
            "Jede Stufe ist ein eigener Aushub und einzeln verschiebbar.")
    p.sagen("Der Lufteintrag an einem Absturz ist mit VOF nur qualitativ zu "
            "beurteilen — die Phasengrenze verschmiert über 2–3 Zellen.")


def _pumpensumpf(p: _Bauplan, args: dict, base_dir) -> None:
    """Runder Sumpf mit Saugrohr — Wirbelbildung am Einlauf ist die Frage."""
    spec = p.spec
    cx, cy = _mitte(spec, args)
    durchmesser = float(args.get("durchmesser", 2.0))
    tiefe = float(args.get("tiefe", 3.0))
    saugrohr = float(args.get("saugrohr", 0.3))
    wand = float(args.get("wandstaerke", 0.25))
    gz = _gelaende_z(spec, base_dir, cx, cy, durchmesser / 2 + wand)
    sohle = round(gz - tiefe, 3)

    from .casespec import (CulvertProfile, StructCulvert, StructSchacht,
                           TargetMaxLevel)

    sumpf_id = p.neu("pumpensumpf")
    p.struktur(StructSchacht(
        id=sumpf_id, type="schacht", patch=sumpf_id, shape="rund",
        center=(round(cx, 3), round(cy, 3)), width=durchmesser,
        invert_level=sohle, top_level=round(gz, 3),
        wall_thickness=wand, wirkung="aushub"))

    rohr_id = p.neu("saugrohr")
    p.struktur(StructCulvert(
        id=rohr_id, type="culvert", patch=rohr_id,
        axis=[(round(cx, 3), round(cy, 3), round(sohle + 0.5 * saugrohr, 3)),
              (round(cx, 3), round(cy, 3), round(gz + 0.5, 3))],
        profile=CulvertProfile(kind="circular", diameter=saugrohr),
        durchstoesst_gelaende=False))

    stufe = _stufe_fuer(spec, saugrohr)
    p.flaeche(rohr_id, stufe)
    pegel = p.pegel("pegel_saugmund", cx + durchmesser / 4, cy)
    p.kriterium(TargetMaxLevel(
        id=p.neu("wasserstand_sumpf"), kind="max_level",
        at=pegel, limit_max=round(gz, 2)))
    p.regelwerk += ["DWA-A 112", "DWA-M 176"]
    p.sagen(f"Maßgeblich ist die Überdeckung über dem Saugmund "
            f"({round(sohle + 0.5 * saugrohr, 2):g} m): reicht sie nicht, "
            f"zieht die Pumpe einen Luftwirbel. Pegel „{pegel}“ steht "
            "unmittelbar daneben und macht das ablesbar.")
    p.sagen("Das Saugrohr steht senkrecht — RANS mittelt gerade die "
            "Wirbelablösung aus, die hier interessiert. Das Ergebnis zeigt "
            "die Tendenz, nicht den Einzelwirbel.")


def _strassenablauf(p: _Bauplan, args: dict, base_dir) -> None:
    """Schacht mit Betonring — der einfachste Fall von Aushub plus Bauteil."""
    spec = p.spec
    cx, cy = _mitte(spec, args)
    weite = float(args.get("weite", 1.0))
    tiefe = float(args.get("tiefe", 1.5))
    wand = float(args.get("wandstaerke", 0.12))
    gz = _gelaende_z(spec, base_dir, cx, cy, weite / 2 + wand)
    sohle = round(gz - tiefe, 3)

    from .casespec import StructSchacht

    aushub_id = p.neu("schacht_aushub")
    grund = dict(shape="rund", center=(round(cx, 3), round(cy, 3)),
                 width=weite, invert_level=sohle, top_level=round(gz, 3),
                 wall_thickness=wand)
    p.struktur(StructSchacht(id=aushub_id, type="schacht", patch=aushub_id,
                             wirkung="aushub", **grund))
    ring_id = p.neu("schacht_ring")
    p.struktur(StructSchacht(id=ring_id, type="schacht", patch=ring_id,
                             wirkung="bauteil", **grund))

    stufe = _stufe_fuer(spec, wand)
    p.flaeche(ring_id, stufe)
    p.regelwerk += ["DWA-A 157"]
    p.sagen("Zwei Objekte mit denselben Maßen: der Aushub nimmt lichte Weite "
            "plus Wandstärke, das Bauteil ist die Schale dazwischen — "
            "passgenau, weil beide aus derselben Angabe entstehen.")
    p.sagen(f"Die Wandstärke {wand:g} m ist das kleinste Maß; ohne "
            f"Verfeinerungsstufe {stufe} verschwindet der Ring im Netz.")


REZEPTE = {
    "strassenablauf": {
        "label": "Schacht / Straßenablauf",
        "beschreibung": "Runder Schacht als Aushub plus Betonring als Bauteil "
                        "— der einfachste Fall des Prinzips.",
        "bauen": _strassenablauf,
    },
    "drosselschacht": {
        "label": "Drosselschacht",
        "beschreibung": "Kammer mit Trennwand und Drosselöffnung; die lichte "
                        "Weite der Drossel bestimmt den Abfluss.",
        "bauen": _drosselschacht,
    },
    "trennbauwerk": {
        "label": "Trenn- / Verteilerbauwerk",
        "beschreibung": "Kammer mit Streichwehr; nachzuweisen ist die "
                        "Abflussaufteilung.",
        "bauen": _trennbauwerk,
    },
    "tosbecken": {
        "label": "Tosbecken",
        "beschreibung": "Aushub mit Endschwelle und Störkörpern; nachzuweisen "
                        "ist die Sohlschubspannung.",
        "bauen": _tosbecken,
    },
    "absturz": {
        "label": "Absturzbauwerk / Kaskade",
        "beschreibung": "Treppe aus Stufenaushüben, jede Stufe einzeln "
                        "verschiebbar.",
        "bauen": _absturz,
    },
    "pumpensumpf": {
        "label": "Pumpensumpf",
        "beschreibung": "Runder Sumpf mit Saugrohr; maßgeblich ist die "
                        "Überdeckung über dem Saugmund.",
        "bauen": _pumpensumpf,
    },
}


def katalog() -> list[dict]:
    """Rezeptliste für die Oberfläche."""
    return [{"id": k, "label": v["label"], "beschreibung": v["beschreibung"]}
            for k, v in REZEPTE.items()]


def einsetzen(spec: CaseSpec, name: str, args: dict | None = None,
              base_dir=".") -> list[str]:
    """
    Ein Rezept in den Fall legen. Ändert `spec` und gibt in Klartext
    zurück, was eingesetzt wurde und worauf zu achten ist.
    """
    eintrag = REZEPTE.get(name)
    if eintrag is None:
        raise ValueError(f"Unbekanntes Rezept: {name}")
    if spec.domain is None or spec.mesh is None:
        raise ValueError("Ohne Modellgebiet und Netzangaben lässt sich kein "
                         "Bauwerk einsetzen")

    p = _Bauplan(spec)
    eintrag["bauen"](p, args or {}, base_dir)

    # Herkunft UND Gruppe stempeln: die Teile eines Rezepts gehören
    # zusammen — der Baum zeigt sie als EIN Bauwerk, löschbar als Ganzes.
    # Die Gruppenkennung ist je Einsetzung eindeutig (zweiter
    # Drosselschacht = drosselschacht_2).
    belegt = {getattr(o, "gruppe", None)
              for liste in (spec.structures, spec.mesh.refinements,
                            spec.evaluation.gauges, spec.evaluation.sections,
                            spec.evaluation.targets)
              for o in liste}
    gruppe = name
    n = 2
    while gruppe in belegt:
        gruppe = f"{name}_{n}"
        n += 1
    for o in (*p.structures, *p.refinements, *p.gauges, *p.sections,
              *p.targets):
        if hasattr(o, "herkunft") and getattr(o, "herkunft", None) is None:
            o.herkunft = "rezept"
        if hasattr(o, "gruppe"):
            o.gruppe = gruppe

    spec.structures.extend(p.structures)
    spec.mesh.refinements.extend(p.refinements)
    # Bezugsobjekte VOR den Kriterien: ein Kriterium mit unbekanntem Pegel
    # lässt sich nicht speichern (Evaluation prüft hart)
    spec.evaluation.gauges.extend(p.gauges)
    spec.evaluation.sections.extend(p.sections)
    spec.evaluation.targets.extend(p.targets)
    for r in p.regelwerk:
        if r not in spec.meta.nachweis.regelwerk:
            spec.meta.nachweis.regelwerk.append(r)

    namen = ", ".join(f"„{s.id}“" for s in p.structures)
    kopf = f"{eintrag['label']} eingesetzt: {namen}"
    for anzahl, eins, viele in (
            (len(p.refinements), "Verfeinerung", "Verfeinerungen"),
            (len(p.gauges), "Pegel", "Pegel"),
            (len(p.sections), "Querschnitt", "Querschnitte"),
            (len(p.targets), "Nachweiskriterium", "Nachweiskriterien")):
        if anzahl:
            kopf += f" · {anzahl} {eins if anzahl == 1 else viele}"
    if p.regelwerk:
        kopf += f" · Regelwerk {', '.join(p.regelwerk)}"

    # Teure Verfeinerung nicht stillschweigend setzen: Stufe 4 ist Faktor 16
    # auf die Kantenlänge und damit rund das Tausendfache an Zellen im
    # verfeinerten Bereich.
    tief = [r for r in p.refinements if r.level >= 4]
    if tief:
        p.meldungen.append(
            f"ACHTUNG Netzgröße: {len(tief)} Verfeinerung(en) auf Stufe "
            f"{max(r.level for r in tief)} — das ist bei Basiszelle "
            f"{_zelle(spec):g} m nötig, um das kleinste Maß aufzulösen, "
            "treibt aber die Zellzahl. Netzvorschau vor dem Lauf ansehen; "
            "notfalls die Basiszelle verkleinern statt örtlich so tief zu "
            "verfeinern.")
    return [kopf, *p.meldungen]
