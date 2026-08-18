"""
validate — fortlaufende Plausibilitätsprüfung (Spez. Kap. 7).

Jede Regel liefert Objekt-ID, Schweregrad und eine Meldung in
wasserbaulicher, nicht numerischer Sprache. Schweregrade:

    fehler    verhindert einen sinnvollen Rechenlauf
    warnung   Lauf möglich, Ergebnis voraussichtlich unbrauchbar/teuer
    hinweis   prüfenswert, aber vertretbar

Die Prüfung meldet Probleme im Editor — nicht erst nach einem bezahlten
Rechenlauf (Spez. 1.8).

Aufbau: `validate_case` baut EINMAL den gemeinsamen Kontext (`_Kontext`)
und reicht ihn durch die Registry `_PRUEFUNGEN`. Jede Prüffamilie
`_pruefe_<name>(spec, ctx)` liefert ihre Befunde als Liste; die Reihenfolge
der Familien in der Registry ist die historische Reihenfolge der Blöcke —
sie entscheidet über die Reihenfolge gleichrangiger Befunde (stabile
Sortierung am Ende) und darf nicht umgestellt werden.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from .casespec import CaseSpec
from .conventions import befund
from .kur import kur
from .meshgen import assign_faces, cell_counts
from .solids import (build_solids, check_solid, gelaende_mit_aushub,
                     gewollt_verschnitten, grundriss, ist_aushub,
                     ueberschneidungen)
from .terrain import TerrainField


def _flaechen_zelle(mesh, patch: str) -> float:
    """
    Zellgröße an einer Bauwerksfläche: die Basiszelle, je Verfeinerungsstufe
    halbiert. Jede Prüfung auf „wird das aufgelöst?" muss hiermit messen und
    nicht mit der blanken Basiszelle — sonst warnt sie weiter, obwohl der
    Nutzer genau das getan hat, was sie empfiehlt, und die angebotene Kur
    kann den Befund nie beseitigen.
    """
    stufe = max((r.level for r in mesh.refinements
                 if r.type == "surface" and r.target == patch), default=0)
    return mesh.base_cell / 2 ** stufe


def _box_stufe(spec: CaseSpec, punkt) -> int:
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


def _lokale_zelle(spec: CaseSpec, patch: str, punkt=None) -> float:
    """
    Örtliche Zellgröße an einer Fläche: eine Verfeinerungsbox über der
    Stelle zählt genauso wie eine Flächenverfeinerung.
    """
    zelle = _flaechen_zelle(spec.mesh, patch)
    if punkt is not None:
        zelle = min(zelle, spec.mesh.base_cell / 2 ** _box_stufe(spec, punkt))
    return zelle


def _erwarteter_spiegel(spec) -> tuple[float, str] | None:
    """
    Wasserspiegellage, die der Fall im Betrieb erwarten lässt — samt
    Herkunft für die Meldung. Nicht `initial_level`: das ist der
    Startzustand und sagt nichts über den Betrieb (ein Becken läuft
    regelmäßig leer an). Genommen wird, was der Fall selbst festlegt:
    zuerst der Unterwasserstand eines festen Ablaufs, sonst der Einstau,
    gegen den geprüft wird. Gibt es beides nicht, ist nichts zu prüfen.
    """
    for b in spec.boundaries:
        if b.type == "outflow_fixed_level":
            return float(b.level), f"fester Pegel am Ablauf „{b.id}“"
    for t in (spec.evaluation.targets if spec.evaluation else []):
        if t.kind == "max_level" and t.limit_max is not None:
            return float(t.limit_max), f"Einstaukriterium „{t.id}“"
    return None


# Verweisfelder je Nachweiskriterium: Feldname -> Art des Bezugsobjekts.
# Dieselbe Kunde wie `REFERENZ_QUELLEN` im Client (utils/feldTypen.js) — sie
# muss hier stehen, weil der Fall auch ohne Oberfläche geprüft wird.
_TARGET_VERWEISE = {
    "max_level": {"at": "gauge"},
    "max_force": {"at": "patch"},
    "discharge_ratio": {"of": "section", "to": "section"},
    "head_difference": {"upstream": "section", "downstream": "section"},
    "overfall_cd": {"section": "section", "gauge": "gauge", "weir": "weir"},
    "min_bed_shear": {"region": "box"},
    "max_bed_shear": {"region": "box"},
}
_QUELL_NAMEN = {"gauge": "Pegelpunkt", "section": "Querschnitt",
                "patch": "Bauwerk", "box": "Verfeinerungsbox", "weir": "Wehr"}


def _finding(object_id: str, severity: str, message: str,
             fix: dict | None = None) -> dict:
    """
    Ein Befund (Konstruktor: conventions.befund). `fix` ist die zugehörige
    Kur (core/kur.py) — eine benannte Aktion, die das Panel als Knopf
    anbietet. Nur dort setzen, wo die Reparatur aus dem Befund EINDEUTIG
    folgt und keine fachliche Festlegung berührt.
    """
    if fix is not None:
        return befund(object_id, severity, message, fix=fix)
    return befund(object_id, severity, message)


@dataclass
class _Kontext:
    """
    Gemeinsame Vorberechnungen für die Prüffamilien — EINMAL in
    `validate_case` gebaut. `solids` und `terrain` sind Zwischenergebnisse
    früherer Blöcke: `solids` füllt `_pruefe_geometrie` (die Ausfälle sind
    dort Befunde), spätere Familien (Durchdringungen, Randabstand) lesen es.
    """
    base_dir: Path
    # Gewachsene Oberfläche — für die Frage, ob ein Hohlraum noch OFFEN ist,
    # zählt sie und nicht die ausgehobene
    gewachsen: TerrainField | None
    # Alle weiteren Regeln rechnen mit dem AUSGEHOBENEN Gelände: eine
    # Trennwand im ausgehobenen Schacht gilt sonst als „vollständig unter
    # dem Gelände und hydraulisch wirkungslos"
    terrain: TerrainField | None
    inflows: list
    outflows: list
    patch_zu_id: dict
    solids: dict = field(default_factory=dict)


def _kontext_bauen(spec: CaseSpec,
                   base_dir: Path) -> tuple[_Kontext, list[dict]]:
    befunde: list[dict] = []
    gewachsen = terrain = None
    if spec.terrain is not None and spec.domain is not None:
        try:
            gewachsen = TerrainField.from_spec(spec.terrain, spec.domain,
                                               base_dir)
            terrain = gelaende_mit_aushub(gewachsen, spec)
        except Exception as e:
            befunde.append(_finding("terrain", "fehler",
                                    f"Gelände nicht erzeugbar: {e}"))
    ctx = _Kontext(
        base_dir=base_dir,
        gewachsen=gewachsen,
        terrain=terrain,
        inflows=[b for b in spec.boundaries
                 if b.type in ("inflow_hydrograph", "inflow_constant")],
        outflows=[b for b in spec.boundaries
                  if b.type.startswith("outflow")],
        patch_zu_id={s.patch: s.id for s in spec.structures},
    )
    return ctx, befunde


def validate_case(spec: CaseSpec, base_dir: str | Path = ".") -> list[dict]:
    ctx, findings = _kontext_bauen(spec, Path(base_dir))
    for pruefung in _PRUEFUNGEN:
        findings.extend(pruefung(spec, ctx))
    order = {"fehler": 0, "warnung": 1, "hinweis": 2}
    return sorted(findings, key=lambda x: (order[x["severity"]], x["object_id"]))


# ---- Prüffamilien ---------------------------------------------------------
# Jede Familie: _pruefe_<name>(spec, ctx) -> list[dict]. Lazy-Imports
# (casebuilder, anschluss, …) bleiben IN den Familien — es gibt echte
# Importzyklen validate↔casebuilder, ein Modulkopf-Import würde crashen.

def _pruefe_kraftauswertung(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Kraftkriterien und Kraftrollen gegen die Kraftauswertung halten."""
    befunde: list[dict] = []
    f = befunde.append

    # Ein Kraftkriterium ohne eingeschaltete Kraftauswertung liefert keine
    # Zeitreihe — das fällt sonst erst nach dem bezahlten Lauf auf, als
    # „nicht auswertbar" in der Nachweisübersicht.
    # Nur für ein Bauwerk, das es gibt: zeigt das Kriterium ins Leere,
    # meldet das `_pruefe_verweise`. „Kraftauswertung einschalten" für
    # einen Patch, den es nicht gibt, wäre eine Kur, die ihren eigenen
    # Befund nicht beseitigen kann.
    kraftpatches = set(spec.evaluation.force_patches)
    bauwerkspatches = {s.patch for s in spec.structures}
    for ziel in spec.evaluation.targets:
        if ziel.kind == "max_force" and ziel.at in bauwerkspatches \
                and ziel.at not in kraftpatches:
            f(_finding(ziel.id, "fehler",
                       f"Für „{ziel.at}“ ist die Kraftauswertung "
                       "nicht eingeschaltet — das Kriterium bliebe ohne "
                       "Zahlenwert.",
                       fix=kur("kraftauswertung_ein", patch=ziel.at)))

    # Ein importierter Körper trägt seit dem Import eine Rolle: der Layer
    # sagt „Wehr", oder die Gestalt ist schlank und lang, also eine Wand.
    # Bisher stand sie nur da. Ein Bauteil, das umströmt wird, ist im
    # Nachweis fast immer wegen seiner BELASTUNG da — und die Kräfte
    # entstehen nur, wenn der Solver sie während des Laufs mitschreibt:
    # nachrüsten heißt neu rechnen.
    KRAFTROLLEN = {"wand": "Wand", "pfeiler": "Pfeiler", "wehr": "Wehr"}
    for s in spec.structures:
        rolle = getattr(s, "role", None)
        if s.type != "imported" or rolle not in KRAFTROLLEN:
            continue
        if s.patch in kraftpatches:
            continue
        f(_finding(s.id, "hinweis",
                   f"„{s.id}“ ist als {KRAFTROLLEN[rolle]} importiert, die "
                   "Kraftauswertung dafür ist aber aus. Sie lässt sich nach "
                   "dem Lauf nicht nachrüsten — die Kräfte entstehen nur, "
                   "wenn der Solver sie mitschreibt.",
                   fix=kur("kraftauswertung_ein", patch=s.patch)))
    return befunde


def _pruefe_gelaendekoerper(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Geländekörper-Datei und Sculpt-Ebene: vorhanden, lesbar, deckend."""
    befunde: list[dict] = []
    f = befunde.append

    # Geländekörper: er ersetzt die Höhenfläche beim Vernetzen. Ist er
    # nicht geschlossen oder deckt er das Gebiet nicht, merkt man das sonst
    # erst an einem zerrissenen Netz.
    if spec.terrain is not None and getattr(spec.terrain.base, "koerper", None):
        import trimesh as _tm
        pfad = ctx.base_dir / spec.terrain.base.koerper
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

    # ---- Sculpt-Ebene: Datei muss zum Spec-Eintrag existieren ------------
    if spec.terrain is not None and spec.terrain.sculpt:
        if not (ctx.base_dir / spec.terrain.sculpt).exists():
            f(_finding("terrain", "fehler",
                       f"Sculpt-Ebene „{spec.terrain.sculpt}“ fehlt im "
                       "Fallordner — Formungen gehen beim Rechnen verloren."))
    return befunde


def _pruefe_vorfuellungen(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Vorfüllungen: Höhe im Gebiet, überm Gelände."""
    befunde: list[dict] = []
    f = befunde.append
    for v in spec.solver.vorfuellungen:
        if spec.domain is not None and not (
                spec.domain.z_min < v.level <= spec.domain.z_max):
            f(_finding(v.id, "fehler",
                       f"Vorfüllung „{v.id}“: Spiegel {v.level:g} m liegt "
                       f"außerhalb des Gebiets ({spec.domain.z_min:g} … "
                       f"{spec.domain.z_max:g} m)."))
        elif ctx.gewachsen is not None and len(v.polygon) >= 3:
            xs = np.array([p[0] for p in v.polygon])
            ys = np.array([p[1] for p in v.polygon])
            try:
                zmin = float(np.min(ctx.gewachsen.sample(xs, ys)))
            except Exception:               # noqa: BLE001
                zmin = None
            if zmin is not None and v.level <= zmin:
                f(_finding(v.id, "warnung",
                           f"Vorfüllung „{v.id}“: Spiegel {v.level:g} m "
                           f"liegt unter dem Gelände im Bereich (tiefster "
                           f"Punkt {zmin:.2f} m) — dort entsteht kein "
                           "Wasser."))
    return befunde


def _pruefe_aushub(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Erdkörper-Schalter und Aushübe (Hohlraum im Erdreich)."""
    befunde: list[dict] = []
    f = befunde.append
    gewachsen = ctx.gewachsen

    # ---- Erdkörper-Schalter gegen die Inferenz ---------------------------
    # Regel und Kur messen dieselbe Größe: die Kur stellt den Schalter auf
    # „auto" zurück, danach ist genau dieser Befund weg.
    from .solids import erdkoerper_abgeschaltet_aber_noetig
    if erdkoerper_abgeschaltet_aber_noetig(spec, gewachsen):
        f(_finding("terrain", "warnung",
                   "Der Erdkörper ist abgeschaltet (terrain.erdkoerper: "
                   "aus), aber Bohrungen oder Aushübe verlangen ihn — sie "
                   "wirken so nicht: das Rohr durchstößt nichts, der "
                   "Schacht bleibt zu.",
                   fix=kur("erdkoerper_auto")))

    # ---- Aushub: Hohlraum im Erdreich ------------------------------------
    # Ein ausgehobener Körper hat keine eigene Fläche — seine Wandungen
    # gehören nach dem Ausschneiden zur Geländefläche. Daraus folgen drei
    # Dinge, die sonst erst der Vernetzer bemerkt.
    # Entschieden wird gegen das GEWACHSENE Gelände: gegen das bereits
    # ausgehobene gemessen läge jeder Aushub definitionsgemäß frei
    aushub = [s for s in spec.structures if ist_aushub(s, gewachsen)]
    if not aushub:
        return befunde
    if spec.terrain is None:
        f(_finding(aushub[0].id, "fehler",
                   "Ausgehoben werden kann nur aus einem Gelände — der "
                   "Fall hat keines. Entweder ein Gelände anlegen oder "
                   "das Bauwerk auf „Bauteil“ stellen."))
    for s in aushub:
        # Verweise auf einen Patch, den es im Netz nicht gibt
        verweise = []
        if s.patch in (spec.evaluation.force_patches
                       if spec.evaluation else []):
            verweise.append("Kraftauswertung")
        if any(r.type == "surface" and r.target == s.patch
               for r in (spec.mesh.refinements if spec.mesh else [])):
            verweise.append("Flächenverfeinerung")
        if spec.mesh is not None and spec.mesh.boundary_layers \
                and s.patch in spec.mesh.boundary_layers.patches:
            verweise.append("Grenzschicht")
        if verweise:
            f(_finding(s.id, "fehler",
                       f"{' und '.join(verweise)} verweist auf den Patch "
                       f"„{s.patch}“, den es nicht gibt: ein Aushub ist "
                       "Hohlraum, seine Wandungen gehören zur "
                       "Geländefläche. Auf „terrain“ verweisen oder das "
                       "Bauwerk auf „Bauteil“ stellen."))
    # Geschlossener Hohlraum: der Vernetzer behält nur, was mit dem
    # locationInMesh-Punkt zusammenhängt — ein rundum verschlossener
    # Kasten im Erdreich fällt ersatzlos weg. Maßstab ist hier die
    # GEWACHSENE Oberfläche: gegen das ausgehobene Gelände gemessen
    # läge jeder Aushub definitionsgemäß frei.
    # Geprüft wird je VERBUND: sich berührende Aushübe bilden nach dem
    # Abziehen einen Raum, und reicht einer davon bis an die Oberfläche,
    # hängt der ganze Raum am Strömungsgebiet.
    for gruppe in (_aushub_verbund(aushub) if gewachsen is not None else []):
        lagen = []
        for s in gruppe:
            pkte = _plan_punkte(s)
            deckel = getattr(s, "top_level", None)
            if deckel is None and s.type == "graben":
                deckel = max(p[2] + (s.profile.height or s.profile.width)
                             for p in s.axis)
            if deckel is None or not len(pkte):
                continue
            boden = float(np.min(gewachsen.sample(pkte[:, 0], pkte[:, 1])))
            lagen.append((s, deckel, boden))
        if not lagen or any(bo <= de + 1e-6 for _, de, bo in lagen):
            continue                    # irgendwo offen, alles gut
        # rundum zu — nur ein Durchlass oder ein Randfenster kann noch
        # eine Verbindung herstellen
        angeschlossen = any(
            c.type == "culvert" and getattr(c, "durchstoesst_gelaende", False)
            for c in spec.structures)
        erster, deckel, boden = max(lagen, key=lambda l: l[1])
        mit = [x.id for x, _, _ in lagen if x.id != erster.id]
        f(_finding(erster.id, "warnung" if angeschlossen else "fehler",
                   f"Der Hohlraum liegt vollständig unter dem Gelände "
                   f"(Oberkante {deckel:.2f} m, Gelände darüber ab "
                   f"{boden:.2f} m)"
                   + (f" — zusammen mit {', '.join(mit)}, die im "
                      "Grundriss daran anschließen" if mit else "")
                   + ". Der Vernetzer behält nur, was mit dem "
                   "Strömungsgebiet zusammenhängt — ein rundum "
                   "verschlossener Hohlraum fällt ersatzlos weg. "
                   "Abhilfe: bis an die Geländeoberfläche führen oder "
                   "mit einem Durchlass anschließen („durch das Gelände "
                   "bohren“)."))
    return befunde


def _pruefe_gebietshoehe(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Passt das Gelände in die Gebietshöhe?"""
    befunde: list[dict] = []
    f = befunde.append
    terrain = ctx.terrain

    # Passt das Gelände überhaupt in das Modellgebiet? Ragt es über den
    # Deckel, schneidet die Gebietsgrenze in den Berg und die
    # Atmosphärenfläche liegt dort im Erdreich. Nach außen wächst das
    # Gelände oft unbemerkt: hinter der letzten Vermessungslinie führt der
    # Import die nächstgelegene Höhe fort, und die kann höher liegen als
    # jede gemessene Oberkante.
    if terrain is not None and spec.domain is not None:
        hoch = float(np.max(terrain.z))
        tief = float(np.min(terrain.z))
        if hoch > spec.domain.z_max:
            f(_finding("domain", "warnung",
                       f"Das Gelände reicht bis {hoch:.2f} m und damit "
                       f"{hoch - spec.domain.z_max:.2f} m über den "
                       f"Gebietsdeckel ({spec.domain.z_max:g} m). Dort "
                       "schneidet die Gebietsgrenze in den Berg, und die "
                       "Atmosphärenfläche liegt im Erdreich.",
                       fix=kur("gebiet_hoehe_anpassen")))
        if tief < spec.domain.z_min:
            f(_finding("domain", "warnung",
                       f"Das Gelände liegt bis {tief:.2f} m tief und damit "
                       f"{spec.domain.z_min - tief:.2f} m unter der "
                       f"Gebietssohle ({spec.domain.z_min:g} m) — der untere "
                       "Teil des Modells fehlt im Rechengebiet.",
                       fix=kur("gebiet_hoehe_anpassen")))
    return befunde


def _pruefe_geometrie(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """
    Bauwerkskörper bauen und prüfen. Füllt als Zwischenergebnis
    `ctx.solids` — Durchdringungs- und Randabstandsprüfung lesen es.
    """
    befunde: list[dict] = []
    f = befunde.append
    terrain = ctx.terrain
    try:
        # `ausfaelle` fängt jedes Bauwerk einzeln: der Befund nennt das
        # betroffene Objekt, und die übrigen Körper werden weiter geprüft
        ausfaelle: list[dict] = []
        ctx.solids = build_solids(spec, ctx.base_dir, ausfaelle=ausfaelle)
        for a in ausfaelle:
            f(_finding(a["id"], "fehler", a["meldung"]))
    except Exception as e:                   # noqa: BLE001
        f(_finding("structures", "fehler", f"Bauwerk nicht erzeugbar: {e}"))

    struct_types = {s.patch: s.type for s in spec.structures}
    struct_edits = {s.patch: list(getattr(s, "edits", []) or [])
                    for s in spec.structures}
    for patch, mesh in ctx.solids.items():
        for problem in check_solid(patch, mesh):
            # Der Dichtheits-Befund bekommt seine Kur: „Heilen" anhängen.
            # Bis zum split(repair=False)-Fix konnte die Regel gar nicht
            # anschlagen — deshalb gab es hier nie einen Knopf.
            fix = (kur("heilen_anhaengen", patch=patch)
                   if "nicht wasserdicht" in problem else None)
            f(_finding(patch, "fehler", problem, fix=fix))
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
                           "vollständig über dem Gelände, keine Einbindung",
                           fix=kur("gelaende_einbinden", patch=patch)))
            # Durchlässe liegen bestimmungsgemäß unter dem Gelände
            if (struct_types.get(patch) != "culvert"
                    and hi[2] < float(np.min(ground))):
                # Bewusst ohne Kur: „Gelände einbinden" würde den Körper nur
                # unten kappen, nicht anheben. Wie hoch ein Bauteil steht,
                # ist eine fachliche Festlegung und keine Reparatur.
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
                               "Wasser hindurch.",
                               fix=kur("gelaende_einbinden", patch=patch)))
                elif tiefe is not None and tiefe > 1.0:
                    f(_finding(patch, "hinweis",
                               f"Körper reicht {tiefe:.1f} m unter das "
                               "Gelände. Das ändert die Strömung nicht, "
                               "kostet aber Dreiecke und schlechte Zellen.",
                               fix=kur("gelaende_einbinden", patch=patch)))
    return befunde


def _pruefe_gelaendekanten(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Geländekanten aus der Vermessung: Bruchkanten und Böschungen."""
    befunde: list[dict] = []
    f = befunde.append
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
    return befunde


def _pruefe_bauwerksparameter(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Neue Bauwerksparameter: Anlauf, Sohlgefälle, Rechen-Besonderheiten."""
    befunde: list[dict] = []
    f = befunde.append
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
        if st.type == "culvert":
            befunde.extend(_pruefe_durchlass(st, spec, ctx))
    return befunde


def _pruefe_durchlass(st, spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Durchlass: plausible Nennweite, freier Rohrmund am Bohrende."""
    befunde: list[dict] = []
    f = befunde.append

    # Ungewöhnliche Nennweite — der Klassiker ist ein Import, bei dem
    # Kreisradius und Durchmesser verwechselt wurden: aus DN800 wird 1,60 m.
    # Beim Kreis deshalb schon ab 1,5 m warnen; Rechteck-/Maulprofile bis
    # 2 m sind gängige Rahmendurchlässe.
    pr = st.profile
    masse = ([pr.diameter] if pr.kind == "circular"
             else [pr.width, pr.height])
    gross = 1.5 if pr.kind == "circular" else 2.0
    for mass in masse:
        if mass is not None and (mass > gross or mass < 0.2):
            f(_finding(st.id, "warnung",
                       f"Nennweite {mass:g} m ist für einen Durchlass "
                       "ungewöhnlich — aus einem Import übernommen? "
                       "(Kreisradius vs. Durchmesser prüfen)"))
            break

    # Rohrmund im Erdreich: die Bohrung endet bohr_ueberstand hinter dem
    # Achsende — liegt das Gelände dort noch über dem Rohrscheitel, steckt
    # die Mündung im Erdreich und bekommt keine freie Fläche.
    # Gemessen am AUSGEHOBENEN Gelände (ctx.terrain): ein Schacht vor der
    # Mündung legt sie frei.
    if (not getattr(st, "durchstoesst_gelaende", False)
            or ctx.terrain is None or len(st.axis) < 2):
        return befunde
    a = np.asarray(st.axis, dtype=float)
    for ende, nachbar in ((a[0], a[1]), (a[-1], a[-2])):
        v = ende - nachbar
        n = float(np.linalg.norm(v))
        if n < 1e-9:
            continue
        mund = ende + v / n * st.bohr_ueberstand
        # Ein Bohrende AUSSERHALB des Gebiets liegt jenseits des
        # Erdkörpers — dort gibt es kein Erdreich, in dem der Mund
        # stecken könnte (die Abtastung klemmte sonst auf den Rand und
        # meldete jede Mündung am Gebietsrand als begraben).
        if spec.domain is not None:
            x0, y0, x1, y1 = spec.domain.extent
            if not (x0 <= mund[0] <= x1 and y0 <= mund[1] <= y1):
                continue
        # Achsdatum: Kreis und Rechteck werden um die ACHSE zentriert
        # gebaut, das Maulprofil ab der Achse nach OBEN — dort ist die
        # Achse die Sohle und der Scheitel liegt bei Sohle + height.
        if pr.kind == "circular":
            scheitel = mund[2] + pr.diameter / 2
        elif pr.kind == "rectangular":
            scheitel = mund[2] + pr.height / 2
        else:
            scheitel = mund[2] + pr.height
        gelaende = float(ctx.terrain.sample(mund[0], mund[1]))
        if gelaende > scheitel + 1e-6:
            f(_finding(st.id, "warnung",
                       f"Rohrmund liegt im Erdreich: am Bohrende "
                       f"({mund[0]:.1f}, {mund[1]:.1f}) steht das Gelände "
                       f"{gelaende - scheitel:.2f} m über dem Rohrscheitel "
                       f"({gelaende:.2f} m gegen {scheitel:.2f} m) — "
                       "Fräs-Überstand erhöhen oder Achse verlängern."))
    return befunde


def _pruefe_bereich_ersetzen(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Bereich ersetzen: Quelle muss vorhanden sein."""
    befunde: list[dict] = []
    f = befunde.append
    for op in (spec.terrain.operations if spec.terrain else []):
        if op.type == "replace_region":
            if not op.source:
                f(_finding(op.id, "fehler",
                           "Kein Quellraster gewählt — die Operation ersetzt "
                           "sonst nichts."))
            elif not (ctx.base_dir / op.source).is_file():
                f(_finding(op.id, "fehler",
                           f"Quellraster „{op.source}“ liegt nicht beim Fall "
                           "— über „Geometrie importieren“ als Zusatzraster "
                           "hochladen."))
    return befunde


def _pruefe_drosselablauf(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Drosselablauf: q > 0, Fenster muss eingestaut sein."""
    befunde: list[dict] = []
    f = befunde.append
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
    return befunde


def _pruefe_durchdringungen(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Sich durchdringende Körper melden (Zwischenergebnis: ctx.solids)."""
    befunde: list[dict] = []
    f = befunde.append
    patch_zu_id = ctx.patch_zu_id
    # Nicht schlimm, aber wissenswert: beim Fallbau wird der gemeinsame
    # Teil dem später genannten Körper abgezogen, damit snappyHexMesh
    # keine doppelt belegten Flächen bekommt. Die Wasserberandung bleibt
    # dabei unverändert — hier steht nur, WAS passieren wird.
    if len(ctx.solids) > 1:
        try:
            for a, b, v in ueberschneidungen(
                    ctx.solids, ausnehmen=gewollt_verschnitten(spec)):
                f(_finding(patch_zu_id.get(b, b), "hinweis",
                           f"{patch_zu_id.get(b, b)} und "
                           f"{patch_zu_id.get(a, a)} durchdringen sich um "
                           f"{v:.2f} m³. Beim Fallbau wird der gemeinsame "
                           f"Teil {patch_zu_id.get(b, b)} abgezogen "
                           "(gleiche Berandung, sauberere Zellen)."))
        except Exception as e:               # noqa: BLE001
            # Die Durchdringungsprüfung selbst ist gescheitert — das darf
            # nicht LAUTLOS passieren: beim Fallbau würde trotzdem
            # entflochten, nur eben ungeprüft (Audit F9)
            f(_finding("structures", "hinweis",
                       "Durchdringungsprüfung nicht möglich "
                       f"({type(e).__name__}) — ob sich Körper überlappen, "
                       "ist ungeprüft; der Fallbau entflechtet trotzdem."))
    return befunde


def _pruefe_bearbeitungen(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Bearbeitungen an Bauwerken: Lagen und Aussparungen."""
    befunde: list[dict] = []
    f = befunde.append
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
            zelle = (_flaechen_zelle(spec.mesh, st.patch)
                     if spec.mesh is not None else None)
            if zelle is not None and min(b, h) < 2 * zelle:
                f(_finding(st.id, "warnung",
                           f"Aussparung {e.id} ist {min(b, h):g} m klein — "
                           f"weniger als zwei Zellen ({zelle:g} m örtliche "
                           "Zellgröße); sie wird im Netz kaum aufgelöst",
                           fix=kur("verfeinerung_erhoehen", patch=st.patch,
                                   mass=min(b, h))))
            steg = min(e.z - h / 2 - unten, oben - (e.z + h / 2))
            if -1e-6 <= steg < 0.5 * dicke:
                f(_finding(st.id, "warnung",
                           f"Aussparung {e.id} lässt nur {steg:.2f} m Reststeg "
                           f"(Bauteildicke {dicke:g} m) — als durchgehende "
                           "Öffnung modellieren?"))
    return befunde


def _pruefe_netzaufloesung(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Vernetzbarkeit der Bauwerke: kleinste Abmessung und Rohr im Erdreich."""
    befunde: list[dict] = []
    f = befunde.append
    if spec.mesh is None:
        return befunde
    gewachsen, terrain = ctx.gewachsen, ctx.terrain

    for s in spec.structures:
        min_dim, label = None, ""
        if s.type == "wall":
            min_dim, label = s.thickness, "Wanddicke"
        elif s.type == "basin":
            min_dim, label = s.wall_thickness, "Beckenwanddicke"
        elif s.type == "culvert":
            if s.profile.diameter:
                min_dim, label = s.profile.diameter, "Durchlassdurchmesser"
            elif s.profile.width and s.profile.height:
                min_dim = min(s.profile.width, s.profile.height)
                label = "lichte Durchlassweite"
        elif s.type == "schacht":
            min_dim, label = s.width, "lichte Schachtweite"
        elif s.type == "graben":
            min_dim, label = s.profile.width, "Grabensohlbreite"
        # Ausgehobene Körper werden nicht als eigene Fläche vernetzt —
        # aufgelöst werden muss trotzdem der HOHLRAUM, und der liegt in
        # der Geländefläche
        if min_dim is not None and ist_aushub(s, gewachsen):
            label += " (Hohlraum im Gelände)"
        mitte = None
        if s.type == "culvert" and s.axis:
            a = np.asarray(s.axis, dtype=float)
            mitte = a.mean(axis=0)
        # Ein Aushub hat keine eigene Fläche: seine Wandungen gehören zur
        # Geländefläche, dort greift auch die Verfeinerung
        flaeche = "terrain" if ist_aushub(s, gewachsen) else s.patch
        # Ein Durchlass-Querschnitt braucht mindestens ZWEI Zellen (wie
        # die Aussparungs-Prüfung) — mit einer einzigen Zelle über die
        # lichte Weite bleibt vom Rohrinneren nichts Durchströmbares
        schwelle = 2 if s.type == "culvert" else 1
        if min_dim is not None and min_dim < schwelle * _lokale_zelle(
                spec, flaeche, mitte):
            zusatz = {}
            if s.type == "culvert" and getattr(s, "durchstoesst_gelaende",
                                               False):
                # Die Tunnelwand der Bohrung liegt im terrain-Patch —
                # verfeinert werden muss BEIDES, sonst löst nur die
                # Rohrschale auf und der Erdkörper zerdrückt den Tunnel
                zusatz = {"auch": "terrain"}
            f(_finding(s.id, "fehler",
                       f"{label} {min_dim:g} m wird von der lokalen "
                       f"Zellgröße {_lokale_zelle(spec, flaeche, mitte):g} m "
                       "nicht aufgelöst — Verfeinerungsstufe erhöhen oder "
                       "Abmessung prüfen",
                       # struktur mitgeben: bei einem Aushub soll die
                       # Kur einen Quader um DIESES Bauwerk anlegen
                       # statt das ganze Gelände zu verfeinern
                       fix=kur("verfeinerung_erhoehen", patch=flaeche,
                               mass=min_dim, struktur=s.id, **zusatz)))

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
                       "„durch das Gelände bohren“ einschalten "
                       "(das Gelände wird dann als Erdkörper mit "
                       "ausgeschnittener Bohrung gebaut) oder das "
                       "Modellgebiet an der Mündungsebene abschneiden.",
                       fix=kur("durchstoss_ein", struct=s.id)))
    return befunde


def _pruefe_verfeinerungen(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Verfeinerungen, Zellzahl des Hintergrundnetzes, Grenzschichten."""
    befunde: list[dict] = []
    f = befunde.append
    if spec.mesh is None:
        return befunde

    if spec.domain is not None:
        x0, y0, x1, y1 = spec.domain.extent
        for r in spec.mesh.refinements:
            if r.type == "surface":
                # „terrain" ist ein gültiges Ziel: die Sohle ist die
                # Fläche, an der der Sohlschubnachweis hängt.
                erlaubt = {s.patch for s in spec.structures} | {"terrain"}
                if r.target not in erlaubt:
                    f(_finding(r.id, "fehler",
                               f"Verfeinerung zielt auf unbekanntes "
                               f"Bauwerk {r.target}",
                               fix=kur("verweis_entfernen",
                                       art="verfeinerung", id=r.id)))
                elif r.target == "terrain" and spec.terrain is None:
                    f(_finding(r.id, "warnung",
                               "Verfeinerung zielt auf das Gelände, der "
                               "Fall hat aber keines — sie bleibt "
                               "wirkungslos"))
                continue
            bx0, by0, bz0, bx1, by1, bz1 = r.extent
            if (bx0 < x0 or by0 < y0 or bx1 > x1 or by1 > y1
                    or bz0 < spec.domain.z_min or bz1 > spec.domain.z_max):
                f(_finding(r.id, "fehler",
                           "Verfeinerungsbox ragt aus dem Modellgebiet heraus",
                           fix=kur("anschluesse_herstellen")))
            level = spec.solver.initial_level
            if level is not None and not (bz0 <= level <= bz1):
                f(_finding(r.id, "warnung",
                           "Verfeinerungsbox erfasst den erwarteten Bereich "
                           f"der freien Oberfläche ({level:g} m) vertikal nicht",
                           fix=kur("box_auf_spiegel", refinement=r.id)))

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
                       f"Grenzschicht verweist auf unbekanntes Bauwerk {p}",
                       fix=kur("verweis_entfernen", art="grenzschicht",
                               wert=p)))
    return befunde


def _pruefe_raender(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Hydraulik und Randbedingungen: Anzahl der Ränder, Q → U am Zulauf."""
    befunde: list[dict] = []
    f = befunde.append
    if len(ctx.inflows) != 1:
        f(_finding("boundaries", "fehler",
                   f"Genau ein Zuflussrand erforderlich, definiert sind "
                   f"{len(ctx.inflows)}"))
    if not ctx.outflows:
        f(_finding("boundaries", "fehler", "Kein Abflussrand definiert"))

    # Q → U ausweisen: flowRateInletVelocity verteilt den Volumenstrom
    # gleichmäßig über die Fensterfläche, und alpha = 1 füllt das ganze
    # Fenster mit Wasser. Die resultierende Geschwindigkeit stand bisher
    # nirgends — dabei entscheidet sie, ob der Zulauf als ruhige Anströmung
    # oder als Strahl ins Modell schießt (Audit P1-5).
    if spec.domain is not None:
        from .casebuilder import fenster_flaeche
        for b in ctx.inflows:
            if b.type != "inflow_constant" or not b.q:
                continue
            flaeche = fenster_flaeche(spec, b)
            if flaeche and flaeche > 0:
                u = float(b.q) / flaeche
                f(_finding(b.id, "warnung" if u > 3.0 else "hinweis",
                           f"Zufluss {b.q:g} m³/s auf rund {flaeche:.2f} m² "
                           f"Zulauffläche → mittlere Eintrittsgeschwindigkeit "
                           f"rund {u:.2f} m/s über den GANZEN Querschnitt "
                           "(die vernetzte, treppige Fensterfläche kann "
                           "leicht abweichen)."
                           + (" Das ist strahlartig schnell — Fenster "
                              "vergrößern oder Zufluss prüfen."
                              if u > 3.0 else "")))
    return befunde


def _pruefe_solver(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Solverzeiten und Auflösbarkeit der Wassertiefe."""
    befunde: list[dict] = []
    f = befunde.append
    terrain = ctx.terrain

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
    return befunde


def _pruefe_fenster(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Zu-/Ablauf-Fenster: Lage und Abmessung prüfbar machen."""
    befunde: list[dict] = []
    f = befunde.append
    if spec.domain is None:
        return befunde
    # Zwei Randbedingungen auf derselben Gebietsfläche kann blockMesh
    # nicht abbilden. Das ist ein BEFUND, kein Absturz — nach einer
    # Drehung kommt es leicht vor, und die Prüfung ist genau der Ort,
    # an dem der Nutzer davon erfahren soll.
    try:
        assign_faces(spec)
    except ValueError as e:
        f(_finding("domain", "fehler", str(e),
                   fix=kur("anschluesse_herstellen")))
        return befunde
    for b in spec.boundaries:
        _fenster_pruefen(spec, b, f)
    return befunde


def _fenster_pruefen(spec: CaseSpec, b, f) -> None:
    """Ein Zu-/Ablauf-Fenster prüfen (je Randbedingung ein Aufruf)."""
    from .casebuilder import (_bc_face, _culvert_end, _follow_channel,
                              _follow_culvert, _follow_end, resolve_window)
    x0, y0, x1, y1 = spec.domain.extent
    w = getattr(b, "window", None)
    if w is None:
        return
    face = _bc_face(spec, b)
    if face is None or face == "z_max":
        f(_finding(b.id, "fehler",
                   "Fenster ist nur auf seitlichen Gebietsrändern "
                   "möglich, nicht auf der Atmosphärenfläche"))
        return
    if w.span is not None and w.follow is not None:
        f(_finding(b.id, "fehler",
                   "Fenster: entweder span (feste Lage) ODER follow "
                   "(an Gerinne gekoppelt) angeben, nicht beides"))
        return
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
            return
        if missing:
            if w.shape == "rechteck":
                f(_finding(b.id, "fehler",
                           "Fenster ohne span und ohne follow — "
                           "Lage fehlt"))
            else:
                f(_finding(b.id, "fehler",
                           f"Fenster ({w.shape}): "
                           f"{', '.join(missing)} fehlt"))
            return
    if w.follow is not None:
        ch = _follow_channel(spec, w)
        cv = _follow_culvert(spec, w)
        limit = 2 * (spec.mesh.base_cell if spec.mesh else 1.0)
        if ch is None and cv is None:
            f(_finding(b.id, "fehler",
                       f"Fenster folgt „{w.follow}“ — weder Gerinne "
                       "(channel_carve) noch Durchlass/Stutzen "
                       "(culvert) mit dieser id"))
            return
        if ch is not None:
            dist, _pt, _inv = _follow_end(spec, face, ch)
            if dist > limit:
                f(_finding(b.id, "fehler",
                           f"Gerinne „{ch.id}“ endet {dist:g} m vor "
                           f"dem Gebietsrand {face} — es muss bis an "
                           "die Kante reichen, damit die Öffnung "
                           "angeschlossen ist",
                           fix=kur("anschluesse_herstellen")))
                return
        else:
            dist, _pt = _culvert_end(spec, face, cv)
            if dist > limit:
                f(_finding(b.id, "fehler",
                           f"Stutzen „{cv.id}“ endet {dist:g} m vor "
                           f"dem Gebietsrand {face} — die Rohrachse "
                           "muss bis an die Kante reichen, damit die "
                           "Mündung angeschlossen ist",
                           fix=kur("anschluesse_herstellen")))
                return
            if spec.mesh is not None and cv.profile.kind == "circular":
                mitte = np.asarray(cv.axis, dtype=float).mean(axis=0)
                zelle = _lokale_zelle(spec, cv.patch, mitte)
                if 2 * zelle <= cv.profile.diameter < 4 * zelle:
                    f(_finding(b.id, "warnung",
                               f"Rohrinneres ({cv.profile.diameter:g} m) "
                               f"wird mit weniger als 4 Zellen "
                               f"({zelle:g} m) aufgelöst",
                               fix=kur("box_ans_fenster",
                                       boundary=b.id, level=2)))
    e0, e1 = (y0, y1) if face.startswith("x") else (x0, x1)
    r = resolve_window(spec, b)
    if r is None:
        return
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
                   f"{spec.domain.z_max:g}]",
                   fix=kur("anschluesse_herstellen")))
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
        zelle = _lokale_zelle(spec, b.patch, punkt)
        if min_dim < 2 * zelle:
            f(_finding(b.id, "warnung",
                       f"Fensteröffnung ist {min_dim:g} m klein — "
                       f"weniger als 2 Zellen ({zelle:g} m örtliche "
                       "Zellgröße); die Öffnung wird im Netz kaum "
                       "aufgelöst",
                       fix=kur("box_ans_fenster", boundary=b.id,
                               level=2)))
    if zlo is not None and zhi is not None and zlo >= zhi:
        f(_finding(b.id, "fehler",
                   "Fenster-Unterkante liegt über der Oberkante"))
    # Spez. Kap. 7: der Zuflussrand soll unterhalb der ERWARTETEN
    # Wasserspiegellage liegen. Erwartet heißt im Betrieb, nicht bei
    # t = 0 — der Anfangswasserspiegel taugt nicht als Maßstab, sonst
    # fiele jedes Becken darunter, das leer anläuft. Maßstab ist der
    # Pegel, den der Fall selbst festlegt: der Unterwasserstand eines
    # festen Ablaufs, sonst der geprüfte Einstau.
    # Eine Rohrmündung (Kreisfenster oder an einen Stutzen gekoppelt)
    # mündet bestimmungsgemäß frei aus und bleibt außen vor.
    muendung = (r["shape"] == "kreis"
                or _follow_culvert(spec, w) is not None)
    if (b.type in ("inflow_hydrograph", "inflow_constant")
            and not muendung and zlo is not None
            and _erwarteter_spiegel(spec) is not None
            and zlo > _erwarteter_spiegel(spec)[0] + 1e-6):
        spiegel, herkunft = _erwarteter_spiegel(spec)
        f(_finding(b.id, "hinweis",
                   f"Der Zulaufquerschnitt beginnt erst bei "
                   f"{zlo:.2f} m und liegt damit über der erwarteten "
                   f"Wasserspiegellage von {spiegel:.2f} m "
                   f"({herkunft}) — der Zufluss stürzt ein, statt "
                   "eingestaut zuzuströmen. Bei einem Absturz ist "
                   "das gewollt."))


def _pruefe_ganglinien(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Zuflussganglinien: Datei, Zeitachse, Lücken, Q → U der Spitze."""
    befunde: list[dict] = []
    f = befunde.append
    for b in ctx.inflows:
        if b.type != "inflow_hydrograph":
            continue
        csv = ctx.base_dir / b.source
        if not csv.exists():
            f(_finding(b.id, "fehler", f"Zuflussganglinie {b.source} nicht gefunden"))
            continue
        try:
            df = pd.read_csv(csv)
            t = df[b.column_time].to_numpy(float)
            # Q → U auch fuer den Hydrographen, mit der Spitze als Maßstab
            if spec.domain is not None and b.column_q in df:
                from .casebuilder import fenster_flaeche
                q_max = float(df[b.column_q].to_numpy(float).max())
                flaeche = fenster_flaeche(spec, b)
                if q_max > 0 and flaeche and flaeche > 0:
                    u = q_max / flaeche
                    f(_finding(b.id, "warnung" if u > 3.0 else "hinweis",
                               f"Ganglinienspitze {q_max:g} m³/s auf rund "
                               f"{flaeche:.2f} m² Zulauffläche → mittlere "
                               f"Eintrittsgeschwindigkeit bis rund {u:.2f} m/s "
                               "über den ganzen Querschnitt."))
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
            elif len(t) > 2:
                # Der Solver interpoliert zwischen den Stützstellen linear.
                # Eine Lücke schneidet damit still die Spitze ab — sichtbar
                # wird das erst am zu kleinen Zufluss im Ergebnis.
                schritt = np.diff(t)
                gross = float(schritt.max())
                ueblich = float(np.median(schritt))
                if gross > max(10 * ueblich, 2 * spec.solver.write_interval_series):
                    stelle = float(t[int(np.argmax(schritt))])
                    f(_finding(b.id, "warnung",
                               f"Zuflussganglinie hat bei t = {stelle:g} s eine "
                               f"Lücke von {gross:g} s (sonst {ueblich:g} s). "
                               "Der Solver interpoliert linear darüber hinweg — "
                               "eine Spitze in dieser Lücke geht verloren."))
        except Exception as e:
            f(_finding(b.id, "fehler", f"Zuflussganglinie nicht lesbar: {e}"))
    return befunde


def _pruefe_randabstand(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Abstand der Bauwerke zu den Zu- und Ablaufrändern."""
    befunde: list[dict] = []
    f = befunde.append
    # Steht ein Bauwerk am Rand, wirkt die Randbedingung unmittelbar auf
    # seine Umströmung zurück. Ausgenommen sind Bauwerke, an die eine
    # Randbedingung bewusst gekoppelt ist (Rohrmündung im Gebietsrand).
    if spec.domain is None or not spec.structures:
        return befunde
    from .casebuilder import _bc_face
    inflows, outflows = ctx.inflows, ctx.outflows
    gekoppelt = {getattr(b.window, "follow", None)
                 for b in spec.boundaries if getattr(b, "window", None)}
    x0, y0, x1, y1 = spec.domain.extent
    # Maßstab ist die GERINNEBREITE, wo ein Gerinne im Modell liegt — so
    # nennt es die Spezifikation. Ohne Gerinne bleibt als Ersatzmaß die
    # Sperrbreite des Bauwerks quer zur Randfläche.
    gerinne = [op for op in (spec.terrain.operations if spec.terrain else [])
               if op.type == "channel_carve"]
    gerinnebreite = max(
        (op.bottom_width + 2 * op.side_slope * op.depth for op in gerinne),
        default=0.0)
    # Spez. Kap. 7 nennt fünf Gerinnebreiten stromauf und zehn stromab.
    # Diese Vorbelegung ist nach Kap. 14.5 projektbezogen festzulegen —
    # ihre Unterschreitung ist deshalb ein Hinweis. Ein Bauwerk, das dem
    # Rand näher steht als es selbst breit ist, bleibt eine Warnung.
    FAKTOR = {"zulauf": 5, "ablauf": 10}
    for s in spec.structures:
        if s.id in gekoppelt or s.type == "screen":
            continue
        pkte = _plan_punkte(s, ctx.solids)
        if len(pkte) < 2:
            continue
        px, py = pkte[:, 0], pkte[:, 1]
        abstaende = {"x_min": float(px.min() - x0), "x_max": float(x1 - px.max()),
                     "y_min": float(py.min() - y0), "y_max": float(y1 - py.max())}
        # Maßstab ist die SPERRBREITE quer zur Randfläche, nicht die
        # Länge längs: eine Mauer parallel zur Strömung verdrängt nichts,
        # eine quer stehende schon.
        quer = {"x_min": float(py.max() - py.min()),
                "x_max": float(py.max() - py.min()),
                "y_min": float(px.max() - px.min()),
                "y_max": float(px.max() - px.min())}
        for b in inflows + outflows:
            face = _bc_face(spec, b)
            if face is None or face == "z_max":
                continue
            d = abstaende.get(face)
            sperre = quer.get(face, 0.0)
            if d is None or sperre <= 0:
                continue
            if d >= sperre:
                # Der harte Fall ist abgewendet; jetzt gegen die
                # Vorbelegung der Spezifikation messen.
                rolle = "zulauf" if b in inflows else "ablauf"
                mass = gerinnebreite if gerinnebreite > 0 else sperre
                masswort = ("Gerinnebreiten" if gerinnebreite > 0
                            else "Bauwerksbreiten")
                richtung = "stromauf" if rolle == "zulauf" else "stromab"
                soll = FAKTOR[rolle] * mass
                if d < soll:
                    f(_finding(s.id, "hinweis",
                               f"{d:.1f} m bis zum Rand "
                               f"„{b.id}“ ({face}). Spez. "
                               f"Kap. 7 nennt als Vorbelegung "
                               f"{FAKTOR[rolle]} {masswort} {richtung}, "
                               f"hier also {soll:.1f} m ({mass:.1f} m je "
                               "Breite). Die Vorbelegung ist "
                               "projektbezogen festzulegen."))
                continue
            f(_finding(s.id, "warnung",
                       f"Nur {max(d, 0):.1f} m bis zum Rand "
                       f"„{b.id}“ "
                       f"({face}), das Bauwerk selbst ist {sperre:.1f} m "
                       "groß — die Randbedingung wirkt unmittelbar auf "
                       "die Umströmung zurück."))
    return befunde


def _pruefe_gebietslage(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Lage im Modellgebiet: nichts erreicht den Solver, was draußen liegt."""
    befunde: list[dict] = []
    f = befunde.append
    # Punkte außerhalb des Gebiets erreichen sonst den Solver: ein Rechen
    # außerhalb erzeugt eine leere Porositätszone (interFoam bricht ab),
    # eine Vorfüllung außerhalb kippt den inside/outside-Test von
    # surfaceToCell. Regel und Kur messen mit DERSELBEN Funktion
    # (`gebietslage`), damit die Kur den Befund auch wirklich beseitigt.
    if spec.domain is not None:
        from .anschluss import gebietslage
        for lage in gebietslage(spec):
            if lage["voll"]:
                f(_finding(lage["id"], "fehler",
                           f"{lage['art']} liegt vollständig außerhalb des "
                           "Modellgebiets — bitte löschen oder verschieben. "
                           "Außerhalb liegende Geometrie wird nicht an den "
                           "Solver übergeben."))
            elif lage["klippbar"]:
                f(_finding(lage["id"], "warnung",
                           f"{lage['art']} ragt zu {lage['anteil']:.0%} über "
                           "das Modellgebiet hinaus",
                           fix=kur("ins_gebiet")))
            else:
                f(_finding(lage["id"], "warnung",
                           f"{lage['art']} ragt zu {lage['anteil']:.0%} über "
                           "das Modellgebiet hinaus — kappen würde die Form "
                           "verändern, bitte verschieben oder verkleinern"))
    return befunde


# Verhältnis Rauheit zu wandnaher Zellhöhe, ab dem die Wandfunktion ihren
# Gültigkeitsbereich verlässt. `nutkRoughWallFunction` verteilt die
# Rauheit INNERHALB der wandnächsten Zelle; passt sie dort nicht hinein,
# rechnet der Solver etwas anderes als angegeben. 0,2 ist die
# gebräuchliche Grenze, ab 0,5 ragt die Rauheit über die halbe Zelle.
KS_ZELLE_WARN = 0.2
KS_ZELLE_GROB = 0.5

# Was snappyHexMesh als wandnächste Schicht baut: meshgen schreibt
# `relativeSizes true` mit `finalLayerThickness 0.3`, die erste Schicht ist
# also 0,3·Δ / r^(n−1) der lokalen Zellgröße.
_LAYER_FINAL = 0.3


def _feinste_zelle_am_patch(spec: CaseSpec, struct, ctx: _Kontext) -> float:
    """
    Zellhöhe an der Wand dieses Patches — Basiszelle, halbiert je
    Verfeinerungsstufe, die ihn betrifft, und noch einmal gestaucht, wenn
    Grenzschichten auf ihm liegen.

    Maßgeblich ist die FEINSTE Zelle am Patch, nicht die eingestellte
    Basiszelle: die Rauheit muss dort hineinpassen, wo das Netz am
    dichtesten ist. Genau diese Richtung ist die unerwartete — ein
    feineres Netz macht die Rauheitsangabe schlechter, nicht besser.
    """
    mesh = spec.mesh
    grund = float(mesh.base_cell)
    patch = getattr(struct, "patch", None) if struct is not None else "terrain"
    stufe = 0

    # Hüllbox des Bauwerks; das Gelände liegt überall und nimmt jede Box mit
    huelle = None
    if struct is not None:
        pkte = _plan_punkte(struct, ctx.solids)
        if len(pkte):
            huelle = (float(pkte[:, 0].min()), float(pkte[:, 1].min()),
                      float(pkte[:, 0].max()), float(pkte[:, 1].max()))

    for r in mesh.refinements or []:
        lvl = int(getattr(r, "level", 0) or 0)
        if not lvl:
            continue
        if getattr(r, "type", "") == "surface":
            if getattr(r, "target", None) == patch:
                stufe = max(stufe, lvl)
            continue
        ext = getattr(r, "extent", None)
        if not ext or len(ext) < 6:
            continue
        if huelle is None:            # Gelände: jede Box zählt
            stufe = max(stufe, lvl)
            continue
        x0, y0, x1, y1 = huelle
        # Überschneiden sich Box und Hüllbox im Grundriss?
        if not (ext[3] < x0 or ext[0] > x1 or ext[4] < y0 or ext[1] > y1):
            stufe = max(stufe, lvl)

    zelle = grund / (2 ** stufe)
    bl = mesh.boundary_layers
    if bl and patch in (bl.patches or []):
        r = max(float(bl.expansion_ratio), 1.0)
        zelle *= _LAYER_FINAL / (r ** max(bl.n_layers - 1, 0))
    return zelle


def _pruefe_rauheit(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """
    Passt die angegebene Rauheit überhaupt in die wandnahe Zelle?

    Die Materialwahl schreibt eine `nutkRoughWallFunction` mit der
    äquivalenten Sandrauheit k_s auf den Patch (casebuilder.MATERIAL_KS).
    Die Wandfunktion setzt aber voraus, dass k_s klein gegen die
    wandnächste Zelle ist — sonst steht im Fall eine Rauheit, die der
    Solver so nicht umsetzen kann. Geprüft wurde das bis 2026-08-17 nicht,
    und man sah es dem Ergebnis nicht an.
    """
    if spec.mesh is None or not spec.mesh.base_cell:
        return []
    from .casebuilder import MATERIAL_KS

    befunde: list[dict] = []
    kandidaten: list[tuple[str, object, float]] = []
    for st in spec.structures:
        if st.type == "screen":     # keine eigene Netzfläche, siehe _pruefe_rechen
            continue
        ks = (getattr(st, "material_ks", None)
              or MATERIAL_KS.get(getattr(st, "material", None) or ""))
        if ks:
            kandidaten.append((st.id, st, float(ks)))
    if spec.terrain is not None:
        ks = (spec.terrain.material_ks
              or MATERIAL_KS.get(spec.terrain.material or ""))
        if ks:
            kandidaten.append(("terrain", None, float(ks)))
        # Beläge liegen AUF dem Gelände und bekommen eigene Patches — ihre
        # Rauheit darf nicht durchrutschen, nur weil sie in der Karte
        # statt am Gelände steht.
        if spec.terrain.belagskarte is not None:
            for b in spec.terrain.belagskarte.belaege:
                kandidaten.append((f"belag:{b.name}", None, float(b.ks)))

    bl = spec.mesh.boundary_layers
    for obj_id, struct, ks in kandidaten:
        zelle = _feinste_zelle_am_patch(spec, struct, ctx)
        if zelle <= 0:
            continue
        anteil = ks / zelle
        if anteil <= KS_ZELLE_WARN:
            continue

        patch = getattr(struct, "patch", "terrain") if struct is not None \
            else "terrain"
        zulaessig = KS_ZELLE_WARN * zelle
        kern = (f"Rauheit k_s = {ks:g} m gegen {zelle:.3g} m Zellhöhe an der "
                f"Wand ({anteil:.0%} davon). Die Wandfunktion verteilt die "
                f"Rauheit INNERHALB dieser Zelle; belastbar ist sie bis rund "
                f"{zulaessig:.3g} m.")
        if anteil > KS_ZELLE_GROB:
            kern += (" Hier ist k_s größer als die halbe Zelle — der Solver "
                     "rechnet dann etwas anderes als angegeben.")
        wege = ("Entweder gröber vernetzen oder ein Material wählen, das zur "
                "Auflösung passt — welches richtig ist, entscheidet der Fall.")
        if bl and patch in (bl.patches or []):
            wege += (f" Achtung: die {bl.n_layers} Grenzschichten auf diesem "
                     "Patch VERKLEINERN die wandnahe Zelle und verschärfen "
                     "das Verhältnis.")
        # Zwischen 0,2 und 0,5 rechnet die Wandfunktion noch etwas
        # Sinnvolles, nur ungenauer — das ist ein HINWEIS. Als Warnung
        # gesetzt schlug er bei jedem der drei Bauwerksrezepte sofort an,
        # und ein Befund, der immer dasteht, wird nicht mehr gelesen.
        stufe = "warnung" if anteil > KS_ZELLE_GROB else "hinweis"
        befunde.append(_finding(obj_id, stufe, f"{kern} {wege}"))

    # Die Lage insgesamt, EINMAL je Fall: mit welchem y+ die Wandfunktion
    # hier überhaupt arbeitet. Kein Fehlbedienen, sondern die normale Folge
    # grober Vernetzung — aber es entscheidet, wie eine τ-Zahl zu lesen
    # ist, und stand bisher nirgends.
    if kandidaten:
        feinste = min(_feinste_zelle_am_patch(spec, st, ctx)
                      for _, st, _ in kandidaten)
        # y+ = (Δy/2)·u_τ/ν mit u_τ ≈ 0,05·U (Reibungsbeiwert-Faustformel)
        # und ν = 1e-6 m²/s. Angegeben als Spanne für 0,3 bis 3 m/s —
        # eine einzelne Zahl wäre Scheingenauigkeit.
        y_lo = (feinste / 2) * 0.05 * 0.3 / 1e-6
        y_hi = (feinste / 2) * 0.05 * 3.0 / 1e-6
        if y_hi > 500:
            # Tausenderpunkt NUR auf den Zahlen — ein .replace() auf dem
            # ganzen Satz zerlegt die Satzkommas mit.
            def _tsd(x: float) -> str:
                return f"{x:,.0f}".replace(",", ".")

            befunde.append(_finding(
                "mesh", "hinweis",
                f"Wandauflösung: bei {feinste:.3g} m Zellhöhe liegt y+ je "
                f"nach Geschwindigkeit etwa zwischen {_tsd(y_lo)} und "
                f"{_tsd(y_hi)}. Die Wandfunktion gilt für 30 bis 300 — sie "
                "arbeitet hier also im Extrapolationsbereich. Das ist bei "
                "dieser Zellgröße normal und kein Fehler; es heißt aber, "
                "dass die Sohlschubspannung ein belastbarer VERGLEICH "
                "zwischen Varianten ist und kein Messwert."))

    return befunde


def _pruefe_rechen(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Rechen: Widerstandsbeiwerte, lichte Weite, Verlegungsgrad."""
    befunde: list[dict] = []
    f = befunde.append
    for s in spec.structures:
        if s.type == "screen":
            # leere d/f sind KEIN Fehler: genau dann leitet der Fallaufbau
            # die Beiwerte automatisch nach Kirschmer aus Stabform,
            # Stabteilung und Anströmwinkel ab (_screen_resistance). Der
            # frühere fehler-Befund widersprach dem eigenen Fallaufbau.
            if not any(s.resistance.d) and not any(s.resistance.f):
                from .casebuilder import _screen_resistance
                try:
                    _, f_auto = _screen_resistance(s)
                    f(_finding(s.id, "hinweis",
                               "Widerstandsbeiwerte nicht gesetzt — sie "
                               "werden automatisch nach Kirschmer abgeleitet "
                               f"(f = {f_auto[0]:.1f} 1/m aus Stabform "
                               f"„{s.bar_shape}“, Teilung "
                               f"{s.bar_spacing * 1000:.0f} mm, Anströmwinkel "
                               f"{s.approach_angle_deg:g}°)"))
                except Exception as e:       # noqa: BLE001
                    f(_finding(s.id, "hinweis",
                               "Kirschmer-Ableitung nicht berechenbar "
                               f"({type(e).__name__}) — mit welchen "
                               "Widerstandsbeiwerten der Rechen gerechnet "
                               "wird, ist damit unklar."))
            # der wirklich kaputte Fall: lichte Weite ≤ 0 — die
            # Kirschmer-Formel entartet (bisher versteckte das der
            # 1e-4-Boden in _screen_resistance)
            if s.bar_spacing <= s.bar_thickness:
                f(_finding(s.id, "fehler",
                           f"Stabteilung ({s.bar_spacing * 1000:.0f} mm) ist "
                           "nicht größer als die Stabdicke "
                           f"({s.bar_thickness * 1000:.0f} mm) — die lichte "
                           "Weite wäre null, der Rechen dicht"))
            if s.resistance.blockage_ratio == 0:
                f(_finding(s.id, "hinweis",
                           "Rechen ohne angesetzten Verlegungsgrad — für den "
                           "Nachweis ist meist eine Teilverlegung anzusetzen"))
    return befunde


def _pruefe_anfangsspiegel(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Anfangswasserspiegel muss in der Gebietshöhe liegen."""
    befunde: list[dict] = []
    lvl = spec.solver.initial_level
    if lvl is not None and spec.domain is not None:
        if not (spec.domain.z_min < lvl < spec.domain.z_max):
            befunde.append(_finding(
                "solver", "fehler",
                f"Anfangswasserspiegel {lvl:g} m liegt außerhalb des "
                "Modellgebiets"))
    return befunde


def _pruefe_leerlauf(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """
    Ein Leerlauf endet an einem Zustand statt an der Uhr — dafuer muss der
    Zustand ueberhaupt erreichbar sein.
    """
    befunde: list[dict] = []
    a = spec.solver.abbruch
    if a is None:
        return befunde

    if spec.solver.initial_level is None and not spec.solver.vorfuellungen:
        befunde.append(_finding(
            "solver", "fehler",
            "Der Lauf soll enden, wenn nichts mehr ablaeuft — es startet "
            "aber kein Wasser im Gebiet. Anfangswasserspiegel setzen oder "
            "einen Bereich vorfuellen."))

    zufluss = sum(float(getattr(b, "q", 0.0) or 0.0)
                  for b in spec.boundaries
                  if getattr(b, "type", "") == "inflow_constant")
    if zufluss > 0:
        befunde.append(_finding(
            "solver", "warnung",
            f"Dauerhafter Zufluss von {zufluss:g} m3/s: das Becken wird nie "
            "leer und die Stagnation tritt fruehestens ein, wenn sich Zu- "
            "und Ablauf die Waage halten. Der Lauf endet sonst an der "
            f"Obergrenze {spec.solver.end_time:g} s."))

    if a.fenster_s < 2 * spec.solver.write_interval_series:
        befunde.append(_finding(
            "solver", "warnung",
            f"Das Beobachtungsfenster ({a.fenster_s:g} s) umfasst kaum mehr "
            f"als einen Messpunkt (Reihen-Schreibintervall "
            f"{spec.solver.write_interval_series:g} s) — die Stagnation "
            "waere dann Zufall. Fenster vergroessern oder Reihen "
            "haeufiger schreiben."))

    if a.erwartete_dauer_s and a.erwartete_dauer_s > spec.solver.end_time:
        befunde.append(_finding(
            "solver", "warnung",
            f"Die erwartete Dauer ({a.erwartete_dauer_s:g} s) liegt ueber "
            f"der Obergrenze ({spec.solver.end_time:g} s) — der Lauf wird "
            "abgeschnitten, bevor das Kriterium greifen kann."))
    return befunde


def _pruefe_auswertung(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """Auswertung: Querschnitte, Pegel und Kraftpatches."""
    befunde: list[dict] = []
    f = befunde.append
    terrain = ctx.terrain
    lvl = spec.solver.initial_level
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
                       f"Kraftauswertung verweist auf unbekanntes Bauwerk {p}",
                       fix=kur("verweis_entfernen", art="kraftpatch", wert=p)))
    return befunde


def _pruefe_verweise(spec: CaseSpec, ctx: _Kontext) -> list[dict]:
    """
    Jeder Verweis eines Nachweiskriteriums zeigt auf ein existierendes
    Objekt (Spez. Kap. 7, „Auswertung").

    Diese Regeln standen einmal als harte `model_validator` in casespec und
    machten den Fall im Zwischenzustand unlesbar — Löschen eines Pegels
    blockierte Vorschau UND Speichern. Als Prüfregel melden sie dasselbe,
    lassen den Editor aber arbeiten; gesperrt wird der Lauf.

    `region` (Sohlschubkriterien) und `weir` (Überfallbeiwert) wurden bis
    dahin von NIEMANDEM geprüft: foamfields überspringt eine unbekannte
    Region still, das Kriterium bleibt ohne Zahlenwert.
    """
    befunde: list[dict] = []
    bekannt = {
        "gauge": {g.id for g in spec.evaluation.gauges},
        "section": {s.id for s in spec.evaluation.sections},
        "patch": {s.patch for s in spec.structures},
        "box": {r.id for r in (spec.mesh.refinements if spec.mesh else [])
                if r.type == "box"},
        "weir": {s.id for s in spec.structures if s.type == "weir"},
    }
    for t in spec.evaluation.targets:
        for feld, quelle in _TARGET_VERWEISE.get(t.kind, {}).items():
            wert = getattr(t, feld, None)
            if wert is None or wert in bekannt[quelle]:
                continue
            befunde.append(_finding(
                t.id, "fehler",
                f"Kriterium verweist auf {_QUELL_NAMEN[quelle]} "
                f"„{wert}“ — den gibt es im Fall nicht (mehr). Ohne "
                "Bezugsobjekt bleibt das Kriterium ohne Zahlenwert.",
                fix=kur("verweis_entfernen", art="target", id=t.id)))
    return befunde


# Reihenfolge = historische Blockreihenfolge in validate_case. Sie ist Teil
# des Verhaltens: die Schlusssortierung ist stabil, gleichrangige Befunde
# (gleicher Schweregrad, gleiche object_id) behalten die Einfügereihenfolge.
_PRUEFUNGEN = [
    _pruefe_kraftauswertung,
    _pruefe_gelaendekoerper,
    _pruefe_vorfuellungen,
    _pruefe_aushub,
    _pruefe_gebietshoehe,
    _pruefe_geometrie,
    _pruefe_gelaendekanten,
    _pruefe_bauwerksparameter,
    _pruefe_bereich_ersetzen,
    _pruefe_drosselablauf,
    _pruefe_durchdringungen,
    _pruefe_bearbeitungen,
    _pruefe_netzaufloesung,
    _pruefe_verfeinerungen,
    _pruefe_raender,
    _pruefe_solver,
    _pruefe_fenster,
    _pruefe_ganglinien,
    _pruefe_randabstand,
    _pruefe_gebietslage,
    _pruefe_rechen,
    _pruefe_rauheit,
    _pruefe_anfangsspiegel,
    _pruefe_leerlauf,
    _pruefe_auswertung,
    _pruefe_verweise,
]


def _aushub_verbund(aushub: list) -> list[list]:
    """
    Aushübe zu Räumen zusammenfassen.

    Ein Aushub ist eine Subtraktion vom Erdkörper. Überschneiden sich zwei
    im Grundriss, bleibt nach dem Abziehen EIN zusammenhängender Hohlraum —
    und reicht auch nur einer davon bis an die Oberfläche, hängt der ganze
    Raum am Strömungsgebiet. Je Körper geprüft meldete die Hohlraumregel
    deshalb bisher einen „rundum verschlossenen Kasten", während nebenan
    der Schacht offen zu Tage lag.

    Berührung genügt: zwischen zwei anstoßenden Aushüben steht kein Erdreich
    mehr, die Booleschen Operationen verschmelzen sie. Ein Körper ohne
    ermittelbaren Grundriss bleibt für sich.
    """
    from .solids import aushub_grundriss

    formen = [(g[0] if (g := aushub_grundriss(s)) else None) for s in aushub]
    eltern = list(range(len(aushub)))

    def wurzel(i: int) -> int:
        while eltern[i] != i:
            eltern[i] = eltern[eltern[i]]
            i = eltern[i]
        return i

    for i, a in enumerate(formen):
        if a is None:
            continue
        for j in range(i + 1, len(formen)):
            if formen[j] is not None and a.intersects(formen[j]):
                eltern[wurzel(i)] = wurzel(j)

    gruppen: dict = {}
    for i, s in enumerate(aushub):
        gruppen.setdefault(wurzel(i) if formen[i] is not None else f"e{i}",
                           []).append(s)
    return list(gruppen.values())


def _plan_punkte(struct, solids: dict | None = None) -> np.ndarray:
    """
    Grundrisspunkte eines Bauwerks (n, 2) — je nach Typ aus Achse, Grundriss,
    Kronenlinie oder Rechenebene.

    Ein importierter Körper trägt seine Lage nicht im Schema, sondern in der
    STL-Datei: `insert_point` ist eine Verschiebung, kein Grundriss. Ohne
    `solids` bleibt er deshalb leer — und genau daran sind bisher ALLE
    grundrissbasierten Regeln stillschweigend an ihm vorbeigelaufen, allen
    voran der Randabstand. Mit dem gebauten Netz liefert der Hüllquader in
    der Ebene die Antwort, und zwar exakt: die Regeln fragen ausschließlich
    nach kleinstem und größtem x und y, und dafür ist der Hüllquader keine
    Näherung, sondern dasselbe Ergebnis.
    """
    for feld in ("footprint", "axis", "crest_polyline", "plane_polygon"):
        werte = getattr(struct, feld, None)
        if werte:
            return np.asarray(werte, dtype=float)[:, :2]
    ausricht = getattr(struct, "alignment", None)
    if ausricht is not None and ausricht.points:
        return np.asarray(ausricht.points, dtype=float)[:, :2]
    if solids is not None:
        netz = solids.get(getattr(struct, "patch", None))
        if netz is not None and len(netz.vertices):
            lo, hi = netz.bounds
            return np.array([[lo[0], lo[1]], [hi[0], lo[1]],
                             [hi[0], hi[1]], [lo[0], hi[1]]], dtype=float)
    mitte = getattr(struct, "center", None)
    if mitte is not None:
        return np.asarray([mitte], dtype=float)[:, :2]
    return np.zeros((0, 2))


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
