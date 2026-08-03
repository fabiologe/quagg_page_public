"""
validate — fortlaufende Plausibilitätsprüfung (Spez. Kap. 7).

Jede Regel liefert Objekt-ID, Schweregrad und eine Meldung in
wasserbaulicher, nicht numerischer Sprache. Schweregrade:

    fehler    verhindert einen sinnvollen Rechenlauf
    warnung   Lauf möglich, Ergebnis voraussichtlich unbrauchbar/teuer
    hinweis   prüfenswert, aber vertretbar

Die Prüfung meldet Probleme im Editor — nicht erst nach einem bezahlten
Rechenlauf (Spez. 1.8).
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .casespec import CaseSpec
from .meshgen import assign_faces, cell_counts
from .solids import (build_solids, check_solid, gewollt_verschnitten,
                     grundriss, ueberschneidungen)
from .terrain import TerrainField


def pts_z_max(struct) -> float:
    """Oberkante einer Wand (max. z der Achsstützpunkte)."""
    return max(p[2] for p in struct.alignment.points)


def _finding(object_id: str, severity: str, message: str) -> dict:
    return {"object_id": object_id, "severity": severity, "message": message}


def validate_case(spec: CaseSpec, base_dir: str | Path = ".") -> list[dict]:
    base_dir = Path(base_dir)
    findings: list[dict] = []
    f = findings.append

    terrain = None
    if spec.terrain is not None and spec.domain is not None:
        try:
            terrain = TerrainField.from_spec(spec.terrain, spec.domain, base_dir)
        except Exception as e:
            f(_finding("terrain", "fehler", f"Gelände nicht erzeugbar: {e}"))

    # Ein Kraftkriterium ohne eingeschaltete Kraftauswertung liefert keine
    # Zeitreihe — das fällt sonst erst nach dem bezahlten Lauf auf, als
    # „nicht auswertbar" in der Nachweisübersicht.
    kraftpatches = set(spec.evaluation.force_patches)
    for ziel in spec.evaluation.targets:
        if ziel.kind == "max_force" and ziel.at not in kraftpatches:
            f(_finding(ziel.id, "fehler",
                       f"Für \u201e{ziel.at}\u201c ist die Kraftauswertung "
                       "nicht eingeschaltet — das Kriterium bliebe ohne "
                       "Zahlenwert. Im Eigenschaftspanel des Bauwerks "
                       "\u201eKräfte und Momente auswerten\u201c ankreuzen."))

    # LTSInterFoam braucht ein lokales Zeitschema (localEuler) und eine
    # eigene PIMPLE-Steuerung. Beides ist noch nicht verdrahtet — der Fall
    # liefe mit Euler durch und rechnete etwas anderes, als draufsteht.
    if spec.solver.application == "LTSInterFoam":
        f(_finding("solver", "fehler",
                   "LTSInterFoam ist noch nicht lauffähig: der Fall wird mit "
                   "dem Euler-Zeitschema aufgebaut, das lokale Zeitschema "
                   "(localEuler) fehlt. Bis dahin interFoam wählen."))

    # Geländekörper: er ersetzt die Höhenfläche beim Vernetzen. Ist er
    # nicht geschlossen oder deckt er das Gebiet nicht, merkt man das sonst
    # erst an einem zerrissenen Netz.
    if spec.terrain is not None and getattr(spec.terrain.base, "koerper", None):
        import trimesh as _tm
        pfad = base_dir / spec.terrain.base.koerper
        if not pfad.is_file():
            f(_finding("terrain", "fehler",
                       f"Geländekörper „{spec.terrain.base.koerper}“ liegt "
                       "nicht neben dem Fall"))
        else:
            try:
                km = _tm.load(pfad, force="mesh")
            except Exception as e:
                km = None
                f(_finding("terrain", "fehler",
                           f"Geländekörper nicht lesbar: {e}"))
            if km is not None:
                if not km.is_watertight:
                    f(_finding("terrain", "fehler",
                               "Der Geländekörper ist nicht geschlossen — "
                               "snappyHexMesh kann daran nicht entscheiden, "
                               "was Erdreich und was Wasser ist. Im CAD "
                               "schließen oder als Höhenraster importieren."))
                if spec.domain is not None:
                    (bx0, by0, _), (bx1, by1, _) = km.bounds[0], km.bounds[1]
                    x0, y0, x1, y1 = spec.domain.extent
                    if bx0 > x0 + 1e-6 or by0 > y0 + 1e-6 \
                            or bx1 < x1 - 1e-6 or by1 < y1 - 1e-6:
                        f(_finding("terrain", "warnung",
                                   f"Der Geländekörper deckt nur "
                                   f"[{bx0:.1f}, {by0:.1f}] … [{bx1:.1f}, "
                                   f"{by1:.1f}] ab, das Modellgebiet reicht "
                                   f"bis [{x0:.1f}, {y0:.1f}] … [{x1:.1f}, "
                                   f"{y1:.1f}] — außerhalb entscheidet nur "
                                   "das Höhenraster, dort kann kein Hohlraum "
                                   "sein"))

    # ---- Geometrie ------------------------------------------------------
    solids = {}
    try:
        solids = build_solids(spec, base_dir)
    except NotImplementedError as e:
        f(_finding("structures", "fehler", str(e)))
    except Exception as e:
        f(_finding("structures", "fehler", f"Bauwerk nicht erzeugbar: {e}"))

    struct_types = {s.patch: s.type for s in spec.structures}
    struct_edits = {s.patch: list(getattr(s, "edits", []) or [])
                    for s in spec.structures}
    patch_zu_id = {s.patch: s.id for s in spec.structures}
    for patch, mesh in solids.items():
        for problem in check_solid(patch, mesh):
            f(_finding(patch, "fehler", problem))
        if terrain is not None and len(mesh.vertices):
            lo, hi = mesh.bounds
            xs = np.clip([lo[0], hi[0]], *_xr(spec))
            ys = np.clip([lo[1], hi[1]], *_yr(spec))
            ground = terrain.sample(np.array([xs[0], xs[1], xs[0], xs[1]]),
                                    np.array([ys[0], ys[0], ys[1], ys[1]]))
            # Stutzen/Durchlässe dürfen frei ragen (Rohrmündung überm
            # Gelände = Freistrahl, Halterung liegt außerhalb des Modells)
            if (struct_types.get(patch) != "culvert"
                    and lo[2] > float(np.max(ground))):
                f(_finding(patch, "fehler",
                           "Bauwerk hängt in der Luft — Unterkante liegt "
                           "vollständig über dem Gelände, keine Einbindung"))
            # Durchlässe liegen bestimmungsgemäß unter dem Gelände
            if (struct_types.get(patch) != "culvert"
                    and hi[2] < float(np.min(ground))):
                f(_finding(patch, "warnung",
                           "Bauwerk verschwindet vollständig unter dem Gelände "
                           "und ist hydraulisch wirkungslos"))
            # Feiner Blick auf den Geländeanschluss: der Hüllquader oben
            # ist grob, hier zählt das Gelände wirklich UNTER dem Körper.
            hat_anschluss = any(e.type == "gelaende"
                                for e in struct_edits.get(patch, []))
            if struct_types.get(patch) != "culvert" and not hat_anschluss:
                spalt, tiefe = _gelaendelage(mesh, terrain)
                if spalt is not None and spalt > 0.02:
                    f(_finding(patch, "warnung",
                               f"Zwischen Körper und Gelände klafft bis zu "
                               f"{spalt:.2f} m — dort rechnet der Solver "
                               "Wasser hindurch. Bearbeitung „Gelände“ setzt "
                               "den Körper auf und bindet ihn ein."))
                elif tiefe is not None and tiefe > 1.0:
                    f(_finding(patch, "hinweis",
                               f"Körper reicht {tiefe:.1f} m unter das "
                               "Gelände. Das ändert die Strömung nicht, "
                               "kostet aber Dreiecke und schlechte Zellen — "
                               "Bearbeitung „Gelände“ kappt die Übertiefe."))

    # ---- Geländekanten aus der Vermessung --------------------------------
    for op in (spec.terrain.operations if spec.terrain else []):
        if op.type == "bruchkante":
            zs = [p[2] for p in op.polyline]
            if max(zs) - min(zs) < 1e-6 and abs(zs[0]) < 1e-6:
                f(_finding(op.id, "warnung",
                           "Bruchkante liegt auf Höhe 0 — vermutlich eine "
                           "2D-Polylinie aus dem CAD. Ohne Höhen zieht sie "
                           "das Gelände auf 0 m NHN herunter."))
            if spec.terrain and op.breite < 2 * spec.terrain.base.resolution:
                f(_finding(op.id, "hinweis",
                           f"Wirkungsbreite {op.breite:g} m ist schmaler als "
                           f"zwei Rasterweiten "
                           f"({2 * spec.terrain.base.resolution:g} m) — die "
                           "Kante wird dann nur angedeutet."))
        elif op.type == "boeschung":
            z_ok = np.mean([p[2] for p in op.oberkante])
            z_uk = np.mean([p[2] for p in op.unterkante])
            if z_ok < z_uk:
                f(_finding(op.id, "warnung",
                           f"Oberkante liegt im Mittel {z_uk - z_ok:.2f} m "
                           "UNTER der Unterkante — die beiden Linien sind "
                           "vermutlich vertauscht."))
            ok2 = np.asarray([p[:2] for p in op.oberkante], dtype=float)
            uk2 = np.asarray([p[:2] for p in op.unterkante], dtype=float)
            d = np.linalg.norm(ok2[:, None] - uk2[None], axis=2).min(axis=1)
            breite = float(d.mean())
            if spec.terrain and breite < 2 * spec.terrain.base.resolution:
                f(_finding(op.id, "warnung",
                           f"Böschung ist im Mittel nur {breite:.2f} m breit, "
                           f"das Höhenraster hat "
                           f"{spec.terrain.base.resolution:g} m — die Neigung "
                           "wird zur Stufe. Feineres Raster wählen."))
            elif abs(z_ok - z_uk) > 1e-6:
                n = breite / abs(z_ok - z_uk)
                if n < 0.5:
                    f(_finding(op.id, "hinweis",
                               f"Sehr steile Böschung (rund 1:{n:.1f}) — "
                               "prüfen, ob Ober- und Unterkante wirklich "
                               "zusammengehören."))

    # ---- Neue Bauwerksparameter -----------------------------------------
    for st in spec.structures:
        if st.type == "wall" and abs(getattr(st, "batter_deg", 0.0)) > 45:
            f(_finding(st.id, "warnung",
                       f"Anlauf {st.batter_deg:g}° ist sehr steil — der Fuß "
                       "wird dadurch breiter als die Wand hoch ist."))
        if st.type == "basin" and abs(getattr(st, "invert_slope", 0.0)) > 0.1:
            f(_finding(st.id, "warnung",
                       f"Sohlgefälle {st.invert_slope:g} (= "
                       f"{st.invert_slope * 100:.0f} %) ist für ein Becken "
                       "ungewöhnlich steil — Wert je LÄNGE, nicht in Prozent."))
        if st.type == "screen" and getattr(st, "edits", None):
            f(_finding(st.id, "hinweis",
                       "Bearbeitungen an einem Rechen bleiben ohne Wirkung — "
                       "er wird nicht als Körper vernetzt, sondern als poröse "
                       "Zone gerechnet."))
        if st.type == "screen" and (getattr(st, "material", None)
                                    or getattr(st, "material_ks", None)):
            f(_finding(st.id, "hinweis",
                       "Material/Rauheit am Rechen bleibt ohne Wirkung — sein "
                       "Widerstand steckt in der porösen Zone."))

    # ---- Bereich ersetzen: Quelle muss vorhanden sein --------------------
    for op in (spec.terrain.operations if spec.terrain else []):
        if op.type == "replace_region":
            if not op.source:
                f(_finding(op.id, "fehler",
                           "Kein Quellraster gewählt — die Operation ersetzt "
                           "sonst nichts."))
            elif not (base_dir / op.source).is_file():
                f(_finding(op.id, "fehler",
                           f"Quellraster „{op.source}“ liegt nicht beim Fall "
                           "— über „Geometrie importieren“ als Zusatzraster "
                           "hochladen."))

    # ---- Drosselablauf: Fenster muss eingestaut sein --------------------
    for b in spec.boundaries:
        if b.type != "outflow_constant":
            continue
        if b.q <= 0:
            f(_finding(b.id, "fehler",
                       "Drosselabfluss muss größer als null sein — ein Ablauf "
                       "mit q = 0 ist eine Wand."))
        w = getattr(b, "window", None)
        zhi = getattr(w, "z_max", None) if w else None
        if zhi is None and w is not None and w.shape == "kreis" \
                and w.z_center is not None and w.diameter is not None:
            zhi = w.z_center + w.diameter / 2
        if (zhi is not None and spec.solver.initial_level is not None
                and spec.solver.initial_level < zhi):
            f(_finding(b.id, "warnung",
                       f"Der Ablauf reicht bis {zhi:.2f} m, der "
                       f"Anfangswasserspiegel liegt bei "
                       f"{spec.solver.initial_level:.2f} m — die Öffnung ist "
                       "nicht eingestaut. Eine Drossel mit vorgegebenem "
                       "Durchfluss zieht dann auch Luft ab."))

    # ---- Sich durchdringende Körper -------------------------------------
    # Nicht schlimm, aber wissenswert: beim Fallbau wird der gemeinsame
    # Teil dem später genannten Körper abgezogen, damit snappyHexMesh
    # keine doppelt belegten Flächen bekommt. Die Wasserberandung bleibt
    # dabei unverändert — hier steht nur, WAS passieren wird.
    if len(solids) > 1:
        try:
            for a, b, v in ueberschneidungen(
                    solids, ausnehmen=gewollt_verschnitten(spec)):
                f(_finding(patch_zu_id.get(b, b), "hinweis",
                           f"{patch_zu_id.get(b, b)} und "
                           f"{patch_zu_id.get(a, a)} durchdringen sich um "
                           f"{v:.2f} m³. Beim Fallbau wird der gemeinsame "
                           f"Teil {patch_zu_id.get(b, b)} abgezogen "
                           "(gleiche Berandung, sauberere Zellen)."))
        except Exception:                    # noqa: BLE001
            pass

    # ---- Bearbeitungen --------------------------------------------------
    for st in spec.structures:
        for e in getattr(st, "edits", []) or []:
            if e.type == "transform" and e.skalieren <= 0:
                f(_finding(st.id, "fehler",
                           f"Lage {e.id}: Skalierung muss größer 0 sein"))
            if e.type != "aussparung":
                continue
            if st.type == "wall":
                pts = np.asarray(st.alignment.points, dtype=float)[:, :2]
                laenge = float(np.linalg.norm(np.diff(pts, axis=0), axis=1).sum())
                oben = float(max(p[2] for p in st.alignment.points))
                unten, dicke = oben - st.height, st.thickness
            elif st.type == "basin":
                pts = np.asarray(st.footprint, dtype=float)
                ring = np.vstack([pts, pts[:1]])
                laenge = float(np.linalg.norm(np.diff(ring, axis=0), axis=1).sum())
                unten = st.invert_level
                oben = st.invert_level + st.wall_height
                dicke = st.wall_thickness
            else:
                # Import, Pfeiler, Wehr: keine eindeutige Achse/Dicke —
                # die Lage muss dann über einen Punkt kommen
                if e.station is not None and e.point is None:
                    f(_finding(st.id, "warnung",
                               f"Aussparung {e.id}: „station“ ist nur bei Wand "
                               "und Becken definiert — für diesen Bauwerkstyp "
                               "besser „point“ mit „direction“ angeben"))
                continue

            if e.station is not None and not (0 <= e.station <= laenge):
                f(_finding(st.id, "fehler",
                           f"Aussparung {e.id}: Station {e.station:g} m liegt "
                           f"außerhalb der Achse (0 … {laenge:.2f} m)"))
            h = e.diameter if e.shape == "kreis" else e.height
            b = e.diameter if e.shape == "kreis" else e.width
            if e.z - h / 2 < unten - 1e-6 or e.z + h / 2 > oben + 1e-6:
                f(_finding(st.id, "fehler",
                           f"Aussparung {e.id}: reicht über das Bauteil hinaus "
                           f"(Öffnung {e.z - h / 2:.2f} … {e.z + h / 2:.2f} m, "
                           f"Bauteil {unten:.2f} … {oben:.2f} m)"))
            if spec.mesh is not None and min(b, h) < 2 * spec.mesh.base_cell:
                f(_finding(st.id, "warnung",
                           f"Aussparung {e.id} ist {min(b, h):g} m klein — "
                           f"weniger als zwei Zellen ({spec.mesh.base_cell:g} m "
                           "Raster); sie wird im Netz kaum aufgelöst"))
            steg = min(e.z - h / 2 - unten, oben - (e.z + h / 2))
            if -1e-6 <= steg < 0.5 * dicke:
                f(_finding(st.id, "warnung",
                           f"Aussparung {e.id} lässt nur {steg:.2f} m Reststeg "
                           f"(Bauteildicke {dicke:g} m) — als durchgehende "
                           "Öffnung modellieren?"))

    # ---- Vernetzbarkeit -------------------------------------------------
    if spec.mesh is not None:
        surface_levels = {r.target: r.level for r in spec.mesh.refinements
                          if r.type == "surface"}

        def box_level(punkt) -> int:
            """Höchste Verfeinerungsstufe der Boxen, die den Punkt enthalten."""
            stufe = 0
            for r in spec.mesh.refinements:
                if r.type != "box":
                    continue
                bx0, by0, bz0, bx1, by1, bz1 = r.extent
                if (min(bx0, bx1) <= punkt[0] <= max(bx0, bx1)
                        and min(by0, by1) <= punkt[1] <= max(by0, by1)
                        and (len(punkt) < 3
                             or min(bz0, bz1) <= punkt[2] <= max(bz0, bz1))):
                    stufe = max(stufe, r.level)
            return stufe

        def local_cell(patch: str, punkt=None) -> float:
            # Eine Verfeinerungsbox über der Stelle zählt genauso wie eine
            # Flächenverfeinerung — sonst warnt die Prüfung weiter, obwohl
            # der Nutzer genau das getan hat, was sie empfiehlt.
            stufe = surface_levels.get(patch, 0)
            if punkt is not None:
                stufe = max(stufe, box_level(punkt))
            return spec.mesh.base_cell / 2 ** stufe

        for s in spec.structures:
            min_dim, label = None, ""
            if s.type == "wall":
                min_dim, label = s.thickness, "Wanddicke"
            elif s.type == "basin":
                min_dim, label = s.wall_thickness, "Beckenwanddicke"
            elif s.type == "culvert" and s.profile.diameter:
                min_dim, label = s.profile.diameter, "Durchlassdurchmesser"
            mitte = None
            if s.type == "culvert" and s.axis:
                a = np.asarray(s.axis, dtype=float)
                mitte = a.mean(axis=0)
            if min_dim is not None and min_dim < local_cell(s.patch, mitte):
                f(_finding(s.id, "fehler",
                           f"{label} {min_dim:g} m wird von der lokalen "
                           f"Zellgröße {local_cell(s.patch, mitte):g} m nicht aufgelöst "
                           "— Verfeinerungsstufe erhöhen oder Abmessung prüfen"))

        # Rohr im Erdreich: DER Klassiker. Das Gelände ist ein Höhenfeld
        # (ein z je x/y) und hat keinen Tunnel — was darunter liegt, räumt
        # der Vernetzer weg. Ohne diese Prüfung merkt man das erst, wenn
        # der Lauf nach Stunden mit "No matching patches" endet.
        # Bei einem importierten Geländekörper entfällt die Prüfung: dort
        # KANN ein Hohlraum sein, das weiß nur der Körper selbst.
        if terrain is not None and not getattr(spec.terrain.base, "koerper", None):
            gefolgt = {getattr(b.window, "follow", None)
                       for b in spec.boundaries if getattr(b, "window", None)}
            for s in spec.structures:
                if s.type != "culvert" or len(s.axis) < 2:
                    continue
                a = np.asarray(s.axis, dtype=float)
                laengen = np.linalg.norm(np.diff(a[:, :2], axis=0), axis=1)
                if laengen.sum() < 1e-6:
                    continue
                # entlang der Achse abtasten
                stuetz = np.linspace(0, 1, 41)
                strecke = np.concatenate([[0], np.cumsum(laengen)])
                strecke = strecke / strecke[-1]
                pkt = np.column_stack([np.interp(stuetz, strecke, a[:, k])
                                       for k in range(3)])
                # Maßstab ist die ACHSE: liegt sie unter dem Gelände, ist
                # mehr als der halbe Querschnitt im Erdreich und der
                # Vernetzer räumt das Rohrinnere weg
                gelaende = terrain.sample(pkt[:, 0], pkt[:, 1])
                verschuettet = gelaende > pkt[:, 2]
                anteil = float(np.mean(verschuettet))
                if anteil < 0.15 or getattr(s, "durchstoesst_gelaende", False):
                    continue
                schwer = "fehler" if s.id in gefolgt else "warnung"
                f(_finding(s.id, schwer,
                           f"Die Rohrachse liegt auf {anteil * 100:.0f} % "
                           "ihrer Länge unter dem Gelände. Ein Höhenfeld "
                           "kann keinen Tunnel haben — der Vernetzer räumt "
                           "das Rohrinnere weg, die Mündung bekommt keine "
                           "einzige Fläche. Abhilfe: am Durchlass "
                           "\u201edurch das Gelände bohren\u201c einschalten "
                           "(das Gelände wird dann als Erdkörper mit "
                           "ausgeschnittener Bohrung gebaut) oder das "
                           "Modellgebiet an der Mündungsebene abschneiden."))

        if spec.domain is not None:
            x0, y0, x1, y1 = spec.domain.extent
            for r in spec.mesh.refinements:
                if r.type == "surface":
                    if r.target not in {s.patch for s in spec.structures}:
                        f(_finding(r.id, "fehler",
                                   f"Verfeinerung zielt auf unbekanntes "
                                   f"Bauwerk {r.target}"))
                    continue
                bx0, by0, bz0, bx1, by1, bz1 = r.extent
                if (bx0 < x0 or by0 < y0 or bx1 > x1 or by1 > y1
                        or bz0 < spec.domain.z_min or bz1 > spec.domain.z_max):
                    f(_finding(r.id, "fehler",
                               "Verfeinerungsbox ragt aus dem Modellgebiet heraus"))
                level = spec.solver.initial_level
                if level is not None and not (bz0 <= level <= bz1):
                    f(_finding(r.id, "warnung",
                               "Verfeinerungsbox erfasst den erwarteten Bereich "
                               f"der freien Oberfläche ({level:g} m) vertikal nicht"))

            nx, ny, nz = cell_counts(spec)
            if nx * ny * nz > 4_000_000:
                f(_finding("mesh", "warnung",
                           f"Hintergrundnetz hat bereits {nx * ny * nz:,} Zellen "
                           "— Laufzeit und Kosten prüfen, Basiszelle vergröbern"))

        if spec.mesh.boundary_layers:
            fehlend = (set(spec.mesh.boundary_layers.patches)
                       - {s.patch for s in spec.structures})
            for p in sorted(fehlend):
                f(_finding("mesh", "fehler",
                           f"Grenzschicht verweist auf unbekanntes Bauwerk {p}"))

    # ---- Hydraulik und Randbedingungen ----------------------------------
    inflows = [b for b in spec.boundaries
               if b.type in ("inflow_hydrograph", "inflow_constant")]
    outflows = [b for b in spec.boundaries
                if b.type.startswith("outflow")]
    if len(inflows) != 1:
        f(_finding("boundaries", "fehler",
                   f"Genau ein Zuflussrand erforderlich, definiert sind "
                   f"{len(inflows)}"))
    if not outflows:
        f(_finding("boundaries", "fehler", "Kein Abflussrand definiert"))

    # Ohne Ausgabezeitpunkt gibt es hinterher keine Felder, keine
    # Wasseroberfläche und keinen 3D-Viewer — und reconstructPar bricht
    # mit "No times selected" ab. Vor dem Lauf abfangen.
    if spec.solver.write_interval_fields > spec.solver.end_time:
        f(_finding("solver", "fehler",
                   f"Feldausgabe alle {spec.solver.write_interval_fields:g} s, "
                   f"Simulationsdauer aber nur {spec.solver.end_time:g} s — "
                   "der Lauf schriebe keinen einzigen Ausgabezeitpunkt"))
    elif spec.solver.end_time / spec.solver.write_interval_fields < 3:
        f(_finding("solver", "warnung",
                   f"Nur {spec.solver.end_time / spec.solver.write_interval_fields:.0f} "
                   "Feldausgaben über die Laufzeit — für Zeitreihen im "
                   "Viewer sehr wenig"))

    # Auflösbarkeit der Wassertiefe: der häufigste Grund für einen Lauf,
    # in dem "man nichts sieht". Grobe Abschätzung aus Zulaufmenge, Dauer
    # und Gebietsfläche gegen die Zellgröße gehalten.
    if spec.domain is not None and spec.mesh is not None:
        x0, y0, x1, y1 = spec.domain.extent
        flaeche = max((x1 - x0) * (y1 - y0), 1e-9)
        q_ges = sum(b.q for b in spec.boundaries
                    if b.type == "inflow_constant")
        zulauf_volumen = q_ges * spec.solver.end_time
        # Startwasser: Spiegel über der tiefsten Geländehöhe
        start_tiefe = 0.0
        if spec.solver.initial_level is not None and terrain is not None:
            start_tiefe = max(0.0, spec.solver.initial_level
                              - float(np.min(terrain.z)))
        tiefe = start_tiefe + zulauf_volumen / flaeche
        cell = spec.mesh.base_cell
        if q_ges > 0 and tiefe < 2 * cell:
            f(_finding("solver", "warnung",
                       f"Zu erwartende Wassertiefe rund {tiefe:.3f} m — die "
                       f"Basiszelle ist {cell:g} m. Bei weniger als zwei "
                       "Zellen Wassertiefe bildet der Solver keine "
                       "Wasseroberfläche ab (im Ergebnis ist dann nur die "
                       "Sohlschubspannung zu sehen). Abhilfe: feineres "
                       "Netz, längere Simulationsdauer, mehr Zufluss, "
                       "kleineres Gebiet oder ein Anfangswasserspiegel."))

    # Zu-/Ablauf-Fenster: Lage und Abmessung prüfbar machen
    if spec.domain is not None:
        from .casebuilder import (_bc_face, _culvert_end, _follow_channel,
                                  _follow_culvert, _follow_end, resolve_window)
        x0, y0, x1, y1 = spec.domain.extent
        # Zwei Randbedingungen auf derselben Gebietsfläche kann blockMesh
        # nicht abbilden. Das ist ein BEFUND, kein Absturz — nach einer
        # Drehung kommt es leicht vor, und die Prüfung ist genau der Ort,
        # an dem der Nutzer davon erfahren soll.
        try:
            assign_faces(spec)
            flaechen_ok = True
        except ValueError as e:
            f(_finding("domain", "fehler", str(e)))
            flaechen_ok = False
        for b in spec.boundaries if flaechen_ok else []:
            w = getattr(b, "window", None)
            if w is None:
                continue
            face = _bc_face(spec, b)
            if face is None or face == "z_max":
                f(_finding(b.id, "fehler",
                           "Fenster ist nur auf seitlichen Gebietsrändern "
                           "möglich, nicht auf der Atmosphärenfläche"))
                continue
            if w.span is not None and w.follow is not None:
                f(_finding(b.id, "fehler",
                           "Fenster: entweder span (feste Lage) ODER follow "
                           "(an Gerinne gekoppelt) angeben, nicht beides"))
                continue
            if w.follow is None:
                required = {
                    "rechteck": ("span",),
                    "kreis": ("center", "z_center", "diameter"),
                    "trapez": ("center", "bottom_width", "top_width",
                               "z_min", "z_max"),
                    "polygon": ("points",),
                }[w.shape]
                missing = [k for k in required if getattr(w, k) is None]
                if w.shape == "polygon" and not missing and len(w.points) < 3:
                    f(_finding(b.id, "fehler",
                               "Fenster (polygon): mindestens 3 Eckpunkte "
                               "erforderlich"))
                    continue
                if missing:
                    if w.shape == "rechteck":
                        f(_finding(b.id, "fehler",
                                   "Fenster ohne span und ohne follow — "
                                   "Lage fehlt"))
                    else:
                        f(_finding(b.id, "fehler",
                                   f"Fenster ({w.shape}): "
                                   f"{', '.join(missing)} fehlt"))
                    continue
            if w.follow is not None:
                ch = _follow_channel(spec, w)
                cv = _follow_culvert(spec, w)
                limit = 2 * (spec.mesh.base_cell if spec.mesh else 1.0)
                if ch is None and cv is None:
                    f(_finding(b.id, "fehler",
                               f"Fenster folgt „{w.follow}“ — weder Gerinne "
                               "(channel_carve) noch Durchlass/Stutzen "
                               "(culvert) mit dieser id"))
                    continue
                if ch is not None:
                    dist, _pt, _inv = _follow_end(spec, face, ch)
                    if dist > limit:
                        f(_finding(b.id, "fehler",
                                   f"Gerinne „{ch.id}“ endet {dist:g} m vor "
                                   f"dem Gebietsrand {face} — es muss bis an "
                                   "die Kante reichen, damit die Öffnung "
                                   "angeschlossen ist"))
                        continue
                else:
                    dist, _pt = _culvert_end(spec, face, cv)
                    if dist > limit:
                        f(_finding(b.id, "fehler",
                                   f"Stutzen „{cv.id}“ endet {dist:g} m vor "
                                   f"dem Gebietsrand {face} — die Rohrachse "
                                   "muss bis an die Kante reichen, damit die "
                                   "Mündung angeschlossen ist"))
                        continue
                    if spec.mesh is not None and cv.profile.kind == "circular":
                        mitte = np.asarray(cv.axis, dtype=float).mean(axis=0)
                        zelle = local_cell(cv.patch, mitte)
                        if 2 * zelle <= cv.profile.diameter < 4 * zelle:
                            f(_finding(b.id, "warnung",
                                       f"Rohrinneres ({cv.profile.diameter:g} m) "
                                       f"wird mit weniger als 4 Zellen "
                                       f"({zelle:g} m) aufgelöst — "
                                       "Verfeinerungsbox um den Stutzen legen"))
            e0, e1 = (y0, y1) if face.startswith("x") else (x0, x1)
            r = resolve_window(spec, b)
            if r is None:
                continue
            lo, hi, zlo, zhi = r["lo"], r["hi"], r["zlo"], r["zhi"]
            if lo < e0 - 1e-6 or hi > e1 + 1e-6:
                f(_finding(b.id, "fehler",
                           f"Fenster [{lo:g}, {hi:g}] ragt über den Gebietsrand "
                           f"{face} hinaus ([{e0:g}, {e1:g}])"))
            if (zlo is not None
                    and (zlo < spec.domain.z_min - 1e-6
                         or (zhi is not None
                             and zhi > spec.domain.z_max + 1e-6))):
                f(_finding(b.id, "fehler",
                           f"Fenster [{zlo:g}, {zhi:g}] liegt außerhalb der "
                           f"Gebietshöhe [{spec.domain.z_min:g}, "
                           f"{spec.domain.z_max:g}]"))
            if spec.mesh is not None:
                min_dim = hi - lo
                if zlo is not None and zhi is not None:
                    min_dim = min(min_dim, zhi - zlo)
                # Fenstermitte auf der Randfläche — dort zählt die örtliche
                # Zellgröße, nicht die Basiszelle
                mitte_e = (lo + hi) / 2
                mitte_z = ((zlo + zhi) / 2 if zlo is not None and zhi is not None
                           else (spec.domain.z_min + spec.domain.z_max) / 2)
                punkt = ((x0 if face == "x_min" else x1, mitte_e, mitte_z)
                         if face.startswith("x")
                         else (mitte_e, y0 if face == "y_min" else y1, mitte_z))
                zelle = local_cell(b.patch, punkt)
                if min_dim < 2 * zelle:
                    f(_finding(b.id, "warnung",
                               f"Fensteröffnung ist {min_dim:g} m klein — "
                               f"weniger als 2 Zellen ({zelle:g} m örtliche "
                               "Zellgröße); die Öffnung wird im Netz kaum "
                               "aufgelöst, ggf. Verfeinerungsbox ans Fenster "
                               "legen"))
            if zlo is not None and zhi is not None and zlo >= zhi:
                f(_finding(b.id, "fehler",
                           "Fenster-Unterkante liegt über der Oberkante"))

    for b in inflows:
        if b.type != "inflow_hydrograph":
            continue
        csv = base_dir / b.source
        if not csv.exists():
            f(_finding(b.id, "fehler", f"Zuflussganglinie {b.source} nicht gefunden"))
            continue
        try:
            df = pd.read_csv(csv)
            t = df[b.column_time].to_numpy(float)
            if t.min() > 0:
                f(_finding(b.id, "warnung",
                           "Zuflussganglinie beginnt nicht bei t = 0"))
            if t.max() < spec.solver.end_time:
                f(_finding(b.id, "fehler",
                           f"Zuflussganglinie endet bei t = {t.max():g} s und "
                           f"deckt die Simulationsdauer {spec.solver.end_time:g} s "
                           "nicht ab"))
            if np.any(np.diff(t) <= 0):
                f(_finding(b.id, "fehler",
                           "Zuflussganglinie ist zeitlich nicht monoton — "
                           "doppelte oder rückläufige Zeitpunkte"))
        except Exception as e:
            f(_finding(b.id, "fehler", f"Zuflussganglinie nicht lesbar: {e}"))

    for s in spec.structures:
        if s.type == "screen":
            if not any(s.resistance.d) and not any(s.resistance.f):
                f(_finding(s.id, "fehler",
                           "Rechen ohne Widerstandsbeiwerte (d und f sind null) "
                           "— er wäre hydraulisch nicht vorhanden"))
            if s.resistance.blockage_ratio == 0:
                f(_finding(s.id, "hinweis",
                           "Rechen ohne angesetzten Verlegungsgrad — für den "
                           "Nachweis ist meist eine Teilverlegung anzusetzen"))

    lvl = spec.solver.initial_level
    if lvl is not None and spec.domain is not None:
        if not (spec.domain.z_min < lvl < spec.domain.z_max):
            f(_finding("solver", "fehler",
                       f"Anfangswasserspiegel {lvl:g} m liegt außerhalb des "
                       "Modellgebiets"))

    # ---- Auswertung -----------------------------------------------------
    if spec.domain is not None:
        x0, y0, x1, y1 = spec.domain.extent

        def inside(p) -> bool:
            return x0 <= p[0] <= x1 and y0 <= p[1] <= y1

        for sec in spec.evaluation.sections:
            if not all(inside(p) for p in sec.polyline):
                f(_finding(sec.id, "fehler",
                           "Querschnittslinie liegt nicht vollständig im "
                           "Modellgebiet"))
        for g in spec.evaluation.gauges:
            if not inside(g.point):
                f(_finding(g.id, "fehler",
                           "Pegelpunkt liegt außerhalb des Modellgebiets"))
            elif terrain is not None and lvl is not None:
                ground = float(terrain.sample(*g.point))
                if ground > lvl:
                    f(_finding(g.id, "warnung",
                               f"Pegelpunkt liegt auf Gelände {ground:.2f} m über "
                               f"dem Anfangswasserspiegel {lvl:g} m — dort ist "
                               "zunächst kein Wasser zu erwarten"))

    patches = {s.patch for s in spec.structures}
    for p in spec.evaluation.force_patches:
        if p not in patches:
            f(_finding("evaluation", "fehler",
                       f"Kraftauswertung verweist auf unbekanntes Bauwerk {p}"))

    order = {"fehler": 0, "warnung": 1, "hinweis": 2}
    return sorted(findings, key=lambda x: (order[x["severity"]], x["object_id"]))


def _gelaendelage(mesh, terrain) -> tuple[float | None, float | None]:
    """
    (Spalt unter dem Körper, Übertiefe unter Gelände) in Metern.
    Bezug ist das Gelände im GRUNDRISS des Körpers, nicht der Hüllquader —
    sonst meldet jede schräg stehende Wand einen Spalt, den es nicht gibt.
    """
    poly = grundriss(mesh)
    if poly is None:
        return None, None
    from .solids import umriss_teile
    rand = np.vstack([np.asarray(teil.exterior.coords, dtype=float)
                      for teil in umriss_teile(poly)])
    mitte = np.asarray(poly.representative_point().coords, dtype=float)
    xs = np.concatenate([rand[:, 0], mitte[:, 0]])
    ys = np.concatenate([rand[:, 1], mitte[:, 1]])
    boden = terrain.sample(xs, ys)
    unterkante = float(mesh.bounds[0][2])
    spalt = unterkante - float(np.min(boden))
    return (spalt if spalt > 0 else None,
            -spalt if spalt < 0 else None)


def _xr(spec: CaseSpec) -> tuple[float, float]:
    return spec.domain.extent[0], spec.domain.extent[2]


def _yr(spec: CaseSpec) -> tuple[float, float]:
    return spec.domain.extent[1], spec.domain.extent[3]
