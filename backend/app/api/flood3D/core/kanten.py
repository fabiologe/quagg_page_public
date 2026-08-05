"""
kanten — aus Vermessungskanten wird Gelände.

Bisher wurde eine importierte Linie sofort zu einer Geländeoperation. Damit
waren Zeichnungselement und Wirkung dasselbe Objekt, und die Bedeutung ging
verloren: dass eine bestimmte Linie die Beckensohle ist, stand nirgends. Die
Böschung entstand nur, wenn Ober- und Unterkante zufällig passend BENANNT
waren — gepaart wurde über den Layernamen, nicht über die Lage. Heißen die
Layer „BK_oben" und „Boeschung_unten", fiel die Paarung aus und beide Linien
wurden einzelne Bruchkanten.

Hier steht der andere Weg: die Kante behält ihre Rolle, und was daraus für
das Gelände folgt, ergibt sich aus **Rolle und Geometrie**.

Die Beziehungen, die abgeleitet werden:

    Sohle INNERHALB eines Beckenrands   -> Böschung zwischen beiden,
                                           dazu die Sohle innen eben
    Böschung OK und UK nebeneinander    -> Böschung zwischen beiden
    Krone mit Unterkanten daneben       -> Böschung je Seite (Damm)
    zwei Böschungen, die sich zuwenden  -> die Fläche zwischen ihren
                                           inneren Kanten: Gerinnesohle
                                           bzw. Dammkrone
    Sohle allein, geschlossen           -> innen eben
    Krone, geschlossen                  -> innen eben (Dammkrone/Plateau)
    frei                                -> Bruchkante wie bisher

Jede erzeugte Operation trägt `aus_kanten`. Beim nächsten Verknüpfen wird
genau das ersetzt und sonst nichts — von Hand angelegte Operationen bleiben
unangetastet. Wer eine abgeleitete Operation von Hand ändern will, leert ihr
`aus_kanten`; dann gilt sie als eigene und wird nicht mehr angefasst.
"""
from __future__ import annotations

import numpy as np
import shapely

from .casespec import (Alignment, BAUTEIL_ROLLEN, CaseSpec, OpBoeschung,
                       OpBruchkante, StructWall, StructWeir, Vermessungskante)


def _ring(k: Vermessungskante) -> shapely.Polygon | None:
    """Geschlossene Kante als Polygon; None, wenn sie keines aufspannt."""
    pts = [(p[0], p[1]) for p in k.polyline]
    if len(pts) < 3:
        return None
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    poly = shapely.Polygon(pts)
    if not poly.is_valid:
        poly = poly.buffer(0)
    return poly if poly.area > 1e-9 else None


def _linie(k: Vermessungskante) -> shapely.LineString:
    return shapely.LineString([(p[0], p[1]) for p in k.polyline])


def _mittlere_hoehe(k: Vermessungskante) -> float:
    return float(np.mean([p[2] for p in k.polyline]))


def _liegt_in(innen: Vermessungskante, aussen: Vermessungskante) -> bool:
    """
    Liegt die eine Kante im Grundriss innerhalb der anderen? Das ist die
    Beziehung, die aus Sohle und Beckenrand ein Becken macht.
    """
    a, i = _ring(aussen), _ring(innen)
    if a is None or i is None:
        return False
    return a.contains(i.representative_point()) and a.area > i.area


def _umschliesst_knapp(innen: Vermessungskante,
                       aussen: list[Vermessungskante]) -> Vermessungskante | None:
    """
    Der KLEINSTE Ring, der die Kante umschließt.

    Bei einem gestuften Becken (Beckenrand, Zwischenberme, Sohle) umschließen
    beide äußeren Ringe die Sohle. Zöge man den äußersten heran, spannte die
    Böschung über die Berme hinweg und die Stufe verschwände. Es zählt der
    nächstgrößere.
    """
    treffer = [(_ring(a).area, a) for a in aussen if _liegt_in(innen, a)]
    return min(treffer, key=lambda x: x[0])[1] if treffer else None


def _laeuft_parallel(a: Vermessungskante, b: Vermessungskante) -> float:
    """
    Maß dafür, ob zwei Kanten „nebeneinander herlaufen": der mittlere
    Abstand, bezogen auf die kürzere Länge. Kleiner Wert = sie gehören
    zusammen. `inf`, wenn sie sich schneiden oder viel zu weit auseinander
    liegen.
    """
    la, lb = _linie(a), _linie(b)
    if la.intersects(lb):
        return float("inf")
    kurz = min(la.length, lb.length)
    if kurz <= 0:
        return float("inf")
    abstand = la.distance(lb)
    # Hausdorff fängt „einer ist viel länger und läuft weg" ab
    if la.hausdorff_distance(lb) > 3 * kurz:
        return float("inf")
    return abstand / kurz


def _stamm(k: Vermessungskante) -> str:
    """
    Kennungsstamm einer Kante ohne das Präfix, das der Import ihr gegeben
    hat — sonst hieße die abgeleitete Operation `kante_kante_…`.
    """
    n = k.id
    for p in ("kante_", "kanten_"):
        if n.startswith(p):
            n = n[len(p):]
    return n or k.id


def _neue_id(stamm: str, belegt: set[str]) -> str:
    kennung = stamm
    n = 2
    while kennung in belegt:
        kennung = f"{stamm}_{n}"
        n += 1
    belegt.add(kennung)
    return kennung


def _boeschung(ok: Vermessungskante, uk: Vermessungskante,
               belegt: set[str], stamm: str = "boeschung") -> OpBoeschung:
    return OpBoeschung(
        id=_neue_id(f"{stamm}_{_stamm(uk)}", belegt), type="boeschung",
        oberkante=[tuple(p) for p in ok.polyline],
        unterkante=[tuple(p) for p in uk.polyline],
        aus_kanten=sorted([ok.id, uk.id]),
        herkunft=ok.herkunft or uk.herkunft,
        import_ref=ok.import_ref or uk.import_ref)


def _hoeher(a: Vermessungskante,
            b: Vermessungskante) -> tuple[Vermessungskante, Vermessungskante]:
    """Die beiden Kanten als (oben, unten) — entschieden über die Höhe."""
    return (a, b) if _mittlere_hoehe(a) >= _mittlere_hoehe(b) else (b, a)


def _ebnen(k: Vermessungskante, belegt: set[str]) -> OpBruchkante:
    return OpBruchkante(
        id=_neue_id(f"eben_{_stamm(k)}", belegt), type="bruchkante",
        polyline=[tuple(p) for p in k.polyline], breite=k.breite,
        modus="ebnen", aus_kanten=[k.id],
        herkunft=k.herkunft, import_ref=k.import_ref)


def _als_kante(k: Vermessungskante, belegt: set[str]) -> OpBruchkante:
    return OpBruchkante(
        id=_neue_id(f"kante_{_stamm(k)}", belegt), type="bruchkante",
        polyline=[tuple(p) for p in k.polyline], breite=k.breite,
        modus="ziehen", aus_kanten=[k.id],
        herkunft=k.herkunft, import_ref=k.import_ref)


EINBINDUNG = 0.3      # wie weit ein abgeleitetes Bauteil ins Erdreich greift


def _fusshoehe(k: Vermessungskante, feld) -> tuple[float | None, str]:
    """
    Auf welcher HÖHE ein aus einer Kronenlinie abgeleitetes Bauteil endet.

    Die Zeichnung gibt nur die Krone her. Wie tief das Bauteil gründet,
    steht im Gelände darunter: tiefster Punkt entlang der Linie, dazu eine
    Einbindung — sonst klafft unter dem Bauteil ein Spalt, durch den der
    Solver Wasser rechnet.

    Ohne Geländefeld gibt es nichts zu messen. Dann bleibt der Wert offen
    und die jeweilige Vorbelegung greift; gemeldet wird genau das, statt
    eine Tiefe zu nennen, die niemand gemessen hat.
    """
    if feld is None:
        return None, "Gründung vorbelegt — kein Gelände zum Messen"
    xs = np.array([p[0] for p in k.polyline], dtype=float)
    ys = np.array([p[1] for p in k.polyline], dtype=float)
    boden = float(np.min(feld.sample(xs, ys)))
    return boden - EINBINDUNG, (
        f"gegründet auf {boden - EINBINDUNG:.2f} m (Gelände unter der Linie "
        f"ab {boden:.2f} m, {EINBINDUNG:.2f} m Einbindung)")


def _bauteil(k: Vermessungskante, belegt: set[str], feld):
    """Aus einer Kronenlinie ein Bauteil — Wand oder Wehr."""
    kennung = _neue_id(_stamm(k), belegt)
    fuss, wie = _fusshoehe(k, feld)
    punkte = [tuple(p) for p in k.polyline]
    if k.rolle == "mauer":
        # `build_wall` misst ab dem TIEFSTEN Kronenpunkt nach unten:
        # z_bottom = min(krone.z) - height
        krone = min(p[2] for p in k.polyline)
        hoehe = 1.0 if fuss is None else max(krone - fuss, EINBINDUNG)
        return StructWall(
            id=kennung, type="wall", patch=kennung,
            alignment=Alignment(points=punkte, kind="polyline"),
            height=round(hoehe, 3), thickness=k.breite,
            material="beton", aus_kanten=[k.id],
            herkunft=k.herkunft, import_ref=k.import_ref), (
            wie if fuss is not None else "Höhe 1,00 m vorbelegt — kein "
            "Gelände zum Messen")
    # Ein vermessener Kronenzug sagt nichts über die Wehrform. Breitkronig
    # mit senkrechten Flanken gibt genau die gezeichnete Geometrie wieder
    # und erfindet nichts hinzu; Kronenbreite ist die Wirkungsbreite der
    # Kante. Ohne Gelände bleibt `base_level` offen (Vorbelegung Krone − 2 m).
    return StructWeir(
        id=kennung, type="weir", patch=kennung, crest_polyline=punkte,
        crest_width=k.breite, slope_upstream=0.0, slope_downstream=0.0,
        profile_type="breitkronig", base_level=fuss, material="beton",
        aus_kanten=[k.id],
        herkunft=k.herkunft, import_ref=k.import_ref), (
        wie if fuss is not None else "Fußhöhe vorbelegt (Krone − 2 m) — "
        "kein Gelände zum Messen")


def ableiten(spec: CaseSpec, feld=None) -> tuple[list, list, list[str]]:
    """
    Was aus den Vermessungskanten folgt: Geländeoperationen UND Bauteile —
    samt Begründung im Klartext. Ändert `spec` NICHT.

    `feld` ist das Geländehöhenfeld, falls vorhanden: nur damit lässt sich
    die Gründungstiefe eines abgeleiteten Bauteils messen statt vorbelegen.
    """
    kanten = list(spec.terrain.kanten) if spec.terrain else []
    if not kanten:
        return [], [], []

    # Kennungen, die schon vergeben sind: von Hand angelegtes behält
    # seinen Namen, auch die Bauwerke
    belegt = {o.id for o in spec.terrain.operations
              if not getattr(o, "aus_kanten", [])}
    belegt |= {s.id for s in spec.structures if not getattr(s, "aus_kanten", [])}
    belegt |= {s.patch for s in spec.structures if not getattr(s, "aus_kanten", [])}
    ops: list = []
    bauteile: list = []
    meldungen: list[str] = []
    verbraucht: set[str] = set()

    # ---- Kanten, die BAUTEILE sind --------------------------------------
    # Sie werden zuerst behandelt und aus allen Geländebeziehungen
    # herausgenommen: eine Mauerkrone ist keine Böschungsoberkante.
    for k in kanten:
        if k.rolle not in BAUTEIL_ROLLEN:
            continue
        st, wie = _bauteil(k, belegt, feld)
        bauteile.append(st)
        verbraucht.add(k.id)
        was = "Wand" if k.rolle == "mauer" else "Wehr"
        meldungen.append(
            f"„{k.id}“ ist eine {'Mauerkrone' if k.rolle == 'mauer' else 'Überfallkante'}"
            f" — daraus wurde das Bauteil „{st.id}“ ({was}, "
            f"{k.breite:.2f} m breit, {wie}). Es formt nicht das Gelände, "
            "sondern wird umströmt")

    kanten = [k for k in kanten if k.id not in verbraucht]

    nach_rolle: dict[str, list[Vermessungskante]] = {}
    for k in kanten:
        nach_rolle.setdefault(k.rolle, []).append(k)

    # Die abgeleiteten Böschungen als (oben, unten) — daraus ergibt sich
    # weiter unten die Fläche zwischen zwei Böschungen
    flanken: list[tuple[Vermessungskante, Vermessungskante]] = []

    # ---- Geschlossene Ringe ineinander: Becken, Berme, Plateau -----------
    # Nicht nur Sohle-in-Beckenrand: ein gestuftes Becken hat Rand, Berme
    # und Sohle, und jede Stufe ist eine Böschung zur NÄCHSTGRÖSSEREN.
    ringe = [k for k in kanten
             if k.rolle in ("sohle", "beckenrand", "krone") and k.geschlossen
             and _ring(k) is not None]
    for innen in ringe:
        aussen = _umschliesst_knapp(innen, [r for r in ringe if r.id != innen.id])
        if aussen is None:
            continue
        # Die Böschung läuft VOM Rand ZUR Sohle — Ober- und Unterkante
        # ergeben sich aus der Höhe, nicht aus der Benennung
        oben, unten = _hoeher(aussen, innen)
        ops.append(_boeschung(oben, unten, belegt))
        verbraucht |= {innen.id, aussen.id}
        meldungen.append(
            f"„{innen.id}“ liegt in „{aussen.id}“ — Böschung dazwischen "
            f"({_mittlere_hoehe(oben):.2f} m auf {_mittlere_hoehe(unten):.2f} m)")

    # Eine geschlossene Sohle oder Krone ist eine ANKERFLÄCHE: innen eben.
    # Das gilt unabhängig davon, ob sie in einem Rand liegt — die Böschung
    # bildet den Hang, diese Ebene den Grund.
    for k in ringe:
        if k.rolle not in ("sohle", "krone"):
            continue
        ops.append(_ebnen(k, belegt))
        was = "Sohle" if k.rolle == "sohle" else "Krone"
        meldungen.append(
            f"„{k.id}“ ist eine geschlossene {was} — innen geebnet"
            if k.id in verbraucht else
            f"„{k.id}“ ist eine geschlossene {was} ohne Gegenstück — "
            "innen geebnet")
        verbraucht.add(k.id)

    # ---- Ober- und Unterkante, über die LAGE gepaart ---------------------
    # Von der UNTERKANTE aus gesucht: eine Dammkrone trägt Böschungen auf
    # BEIDEN Seiten, also muss dieselbe obere Kante zweimal dienen dürfen.
    # Eine Böschungsoberkante gehört dagegen zu genau einer Böschung.
    oks = [k for k in nach_rolle.get("boeschung_ok", []) if k.id not in verbraucht]
    kronen = [k for k in nach_rolle.get("krone", []) if k.id not in verbraucht]
    for uk in nach_rolle.get("boeschung_uk", []):
        if uk.id in verbraucht:
            continue
        kandidaten = [(_laeuft_parallel(o, uk), o)
                      for o in oks + kronen if o.id not in verbraucht]
        kandidaten = [(d, o) for d, o in kandidaten if np.isfinite(d)]
        if not kandidaten:
            continue
        _, oben = min(kandidaten, key=lambda x: x[0])
        ops.append(_boeschung(oben, uk, belegt))
        flanken.append((oben, uk))
        verbraucht.add(uk.id)
        if oben.rolle == "krone":
            # Die Krone bleibt frei: sie trägt die zweite Böschung und ihre
            # eigene Wirkung (geschlossen = innen eben)
            meldungen.append(
                f"„{uk.id}“ liegt an der Krone „{oben.id}“ — Böschung "
                f"daraus ({_mittlere_hoehe(oben):.2f} m auf "
                f"{_mittlere_hoehe(uk):.2f} m)")
        else:
            verbraucht.add(oben.id)
            meldungen.append(
                f"„{oben.id}“ und „{uk.id}“ laufen nebeneinander — Böschung "
                f"daraus ({_mittlere_hoehe(oben):.2f} m auf "
                f"{_mittlere_hoehe(uk):.2f} m). Gepaart über die Lage, nicht "
                "über den Namen")

    # ---- Die Fläche zwischen zwei Böschungen -----------------------------
    # Zwei Böschungen, die einander zugewandt sind, schließen etwas ein.
    # WAS sie einschließen, muss nicht geraten werden — es ist messbar:
    # liegen die Unterkanten näher beieinander als die Oberkanten, wenden
    # sich die Böschungen nach innen und unten, und dazwischen liegt eine
    # Gerinnesohle. Ist es umgekehrt, stehen sie Rücken an Rücken und
    # dazwischen liegt die Krone eines Damms.
    # Beide Male entsteht die Fläche aus zwei VERMESSENEN Linien — es wird
    # keine Sohlbreite und keine Neigung geschätzt.
    benutzt: set[frozenset[str]] = set()
    for i, (o1, u1) in enumerate(flanken):
        for o2, u2 in flanken[i + 1:]:
            if o1.id == o2.id or u1.id == u2.id:
                continue                # gemeinsame Kante, nichts dazwischen
            unten_ab = _linie(u1).distance(_linie(u2))
            oben_ab = _linie(o1).distance(_linie(o2))
            if unten_ab <= oben_ab:
                a, b, was = u1, u2, "Gerinnesohle"
            else:
                a, b, was = o1, o2, "Dammkrone"
            paar = frozenset({a.id, b.id})
            if paar in benutzt or not np.isfinite(_laeuft_parallel(a, b)):
                continue
            benutzt.add(paar)
            oben, unten = _hoeher(a, b)
            ops.append(_boeschung(oben, unten, belegt, stamm="flaeche"))
            # Beide Kanten sind jetzt Rand einer Fläche. Ohne das würden sie
            # unten zusätzlich zu Bruchkanten — mit der Meldung, aus ihnen
            # lasse sich keine Fläche bilden, während gerade eine entstand.
            verbraucht |= {a.id, b.id}
            meldungen.append(
                f"„{a.id}“ und „{b.id}“ sind die inneren Kanten zweier "
                f"Böschungen ({min(unten_ab, oben_ab):.2f} m auseinander, "
                f"außen {max(unten_ab, oben_ab):.2f} m) — die Fläche "
                f"dazwischen ist die {was}")

    # ---- Einzelne Rollen -------------------------------------------------
    for k in kanten:
        if k.id in verbraucht:
            continue
        if k.rolle in ("sohle", "krone") and k.geschlossen:
            ops.append(_ebnen(k, belegt))
            was = "Sohle" if k.rolle == "sohle" else "Krone"
            meldungen.append(f"„{k.id}“ ist eine geschlossene {was} ohne "
                             "Gegenstück — innen geebnet")
        else:
            ops.append(_als_kante(k, belegt))
            if k.rolle in ("sohle", "krone"):
                meldungen.append(
                    f"„{k.id}“ ({k.rolle}) ist nicht geschlossen — als "
                    "Bruchkante übernommen, eine Fläche lässt sich daraus "
                    "nicht bilden")
            elif k.rolle in ("boeschung_ok", "boeschung_uk"):
                meldungen.append(
                    f"„{k.id}“ ({k.rolle}) hat keine Gegenkante gefunden — "
                    "als Bruchkante übernommen")
        verbraucht.add(k.id)

    return ops, bauteile, meldungen


def verknuepfen(spec: CaseSpec, feld=None) -> list[str]:
    """
    Die abgeleiteten Operationen und Bauteile im Fall herstellen. Ersetzt
    genau das, was beim letzten Mal abgeleitet wurde (`aus_kanten` nicht
    leer), und lässt alles von Hand Angelegte stehen.

    Die Kennung eines abgeleiteten Bauteils folgt der Kantenkennung und ist
    damit über die Runden stabil. Das ist keine Kosmetik: an einem Bauwerk
    hängen Patchname, Kraftauswertung, Verfeinerung und Nachweiskriterien —
    eine wechselnde Kennung ließe all diese Verweise ins Leere zeigen.
    """
    if spec.terrain is None:
        return ["Der Fall hat kein Gelände"]
    if not spec.terrain.kanten:
        return ["Keine Vermessungskanten im Fall"]

    alt = [o for o in spec.terrain.operations if getattr(o, "aus_kanten", [])]
    eigen = [o for o in spec.terrain.operations
             if not getattr(o, "aus_kanten", [])]
    alt_st = [s for s in spec.structures if getattr(s, "aus_kanten", [])]
    eigen_st = [s for s in spec.structures if not getattr(s, "aus_kanten", [])]
    neu, neue_bauteile, meldungen = ableiten(spec, feld)

    # Abgeleitetes zuerst: die Kanten formen das Gelände, von Hand
    # Angelegtes (Planum, Rampe, Außenkante) wirkt darauf
    spec.terrain.operations = neu + eigen
    spec.structures = eigen_st + neue_bauteile

    kopf = (f"{len(neu)} Operation(en) und {len(neue_bauteile)} Bauteil(e) "
            f"aus {len(spec.terrain.kanten)} Vermessungskanten abgeleitet")
    if alt or alt_st:
        kopf += f", {len(alt) + len(alt_st)} vorherige ersetzt"
    if eigen or eigen_st:
        kopf += f", {len(eigen) + len(eigen_st)} eigene unangetastet"
    return [kopf, *meldungen]
