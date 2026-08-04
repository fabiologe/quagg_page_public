"""
kur — die Reparatur zu einem Prüfbefund.

Die Prüfung sagt bisher, was nicht stimmt, und der Bearbeiter setzt es von
Hand um: Verfeinerungsstufe erhöhen, Box ans Fenster legen, Körper ins
Gelände einbinden, Kraftauswertung einschalten. Das ist jedes Mal
dieselbe, aus dem Befund eindeutig ableitbare Handreichung — also gehört
sie an den Befund.

Jede Kur ist eine benannte Aktion mit Argumenten. `validate` hängt sie an
den Befund, das Panel zeigt einen Knopf, `anwenden()` führt sie aus. Keine
Kur ändert eine fachliche Festlegung: sie verschiebt keinen Wasserspiegel,
keinen Durchfluss und keine Abmessung — sie richtet nur das Netz, die
Auswertung oder den Anschluss an das, was ohnehin schon dasteht.
"""
from __future__ import annotations

from .casespec import CaseSpec

# Beschriftung des Knopfes je Aktion
KUR_LABELS = {
    "verfeinerung_erhoehen": "Verfeinerung erhöhen",
    "box_ans_fenster": "Verfeinerungsbox ans Fenster",
    "box_auf_spiegel": "Box bis zum Wasserspiegel ziehen",
    "gelaende_einbinden": "In das Gelände einbinden",
    "kraftauswertung_ein": "Kraftauswertung einschalten",
    "anschluesse_herstellen": "Anschlüsse herstellen",
    "gebiet_hoehe_anpassen": "Gebietshöhe ans Gelände anpassen",
    "durchstoss_ein": "Durch das Gelände bohren",
}


def kur(aktion: str, **args) -> dict:
    """Kur-Angabe für einen Befund."""
    return {"aktion": aktion, "args": args,
            "label": KUR_LABELS.get(aktion, aktion)}


# --------------------------------------------------------------------------

def _refine_surface(spec: CaseSpec, patch: str, stufe: int) -> str:
    """Flächenverfeinerung für einen Patch anlegen oder anheben."""
    from .casespec import RefineSurface

    for r in spec.mesh.refinements:
        if r.type == "surface" and r.target == patch:
            if r.level >= stufe:
                return (f"Die Flächenverfeinerung an „{patch}“ steht schon auf "
                        f"Stufe {r.level}")
            alt = r.level
            r.level = stufe
            return (f"Flächenverfeinerung an „{patch}“ von Stufe {alt} auf "
                    f"{stufe} angehoben")
    ids = {r.id for r in spec.mesh.refinements}
    neu = f"fein_{patch}"
    n = 2
    while neu in ids:
        neu = f"fein_{patch}_{n}"
        n += 1
    spec.mesh.refinements.append(
        RefineSurface(id=neu, type="surface", target=patch, level=stufe))
    return (f"Flächenverfeinerung „{neu}“ an „{patch}“ mit Stufe {stufe} "
            "angelegt")


def _verfeinerung_erhoehen(spec: CaseSpec, args: dict) -> str:
    """
    Zellgröße am Bauwerk so weit halbieren, bis die kleinste Abmessung
    aufgelöst ist. Vier Zellen über die Dicke sind die Faustregel, mit der
    auch die Prüfung arbeitet.
    """
    patch = args["patch"]
    mass = float(args["mass"])
    zelle = spec.mesh.base_cell
    stufe = 0
    while mass < 4 * zelle / 2 ** stufe and stufe < 5:
        stufe += 1
    return _refine_surface(spec, patch, max(stufe, 1))


def _box_ans_fenster(spec: CaseSpec, args: dict) -> str:
    """
    Verfeinerungsquader um die Öffnung einer Randbedingung. Zwei Zellen
    Rand ringsum und zwei Zellen tief ins Gebiet — genug, damit die
    Öffnung im Netz ankommt, ohne das ganze Gebiet zu verfeinern.
    """
    from .casebuilder import _bc_face, resolve_window
    from .casespec import RefineBox

    b = next((x for x in spec.boundaries if x.id == args["boundary"]), None)
    if b is None:
        return f"Randbedingung „{args['boundary']}“ gibt es nicht mehr"
    r = resolve_window(spec, b)
    face = _bc_face(spec, b)
    if r is None or face is None or face == "z_max":
        return f"Für „{b.id}“ lässt sich kein Fenster auflösen"
    stufe = int(args.get("level", 2))
    zelle = spec.mesh.base_cell
    rand = 2 * zelle
    tiefe = max(4 * zelle, 0.5)
    x0, y0, x1, y1 = spec.domain.extent
    lo, hi = r["lo"] - rand, r["hi"] + rand
    zlo = (r["zlo"] if r["zlo"] is not None else spec.domain.z_min) - rand
    zhi = (r["zhi"] if r["zhi"] is not None else spec.domain.z_max) + rand
    if face == "x_min":
        ext = (x0, lo, zlo, x0 + tiefe, hi, zhi)
    elif face == "x_max":
        ext = (x1 - tiefe, lo, zlo, x1, hi, zhi)
    elif face == "y_min":
        ext = (lo, y0, zlo, hi, y0 + tiefe, zhi)
    else:
        ext = (lo, y1 - tiefe, zlo, hi, y1, zhi)
    ext = (max(ext[0], x0), max(ext[1], y0), max(ext[2], spec.domain.z_min),
           min(ext[3], x1), min(ext[4], y1), min(ext[5], spec.domain.z_max))
    ids = {x.id for x in spec.mesh.refinements}
    neu = f"fein_{b.id}"
    n = 2
    while neu in ids:
        neu = f"fein_{b.id}_{n}"
        n += 1
    spec.mesh.refinements.append(
        RefineBox(id=neu, type="box",
                  extent=tuple(round(float(v), 3) for v in ext), level=stufe))
    return (f"Verfeinerungsbox „{neu}“ um die Öffnung von „{b.id}“ gelegt "
            f"(Stufe {stufe}, entspricht {zelle / 2 ** stufe:g} m Zellgröße)")


def _box_auf_spiegel(spec: CaseSpec, args: dict) -> str:
    """Verfeinerungsquader vertikal bis über den Anfangswasserspiegel ziehen."""
    ref = next((r for r in spec.mesh.refinements
                if r.id == args["refinement"] and r.type == "box"), None)
    if ref is None:
        return f"Verfeinerungsquader „{args['refinement']}“ gibt es nicht mehr"
    level = spec.solver.initial_level
    if level is None:
        return "Ohne Anfangswasserspiegel gibt es nichts anzupassen"
    rand = 2 * spec.mesh.base_cell
    x0, y0, z0, x1, y1, z1 = ref.extent
    neu_z0 = min(z0, max(level - rand, spec.domain.z_min))
    neu_z1 = max(z1, min(level + rand, spec.domain.z_max))
    ref.extent = (x0, y0, round(neu_z0, 3), x1, y1, round(neu_z1, 3))
    return (f"Verfeinerungsquader „{ref.id}“ auf {neu_z0:.2f} … {neu_z1:.2f} m "
            f"gezogen — der Wasserspiegel bei {level:g} m liegt jetzt darin")


def _gelaende_einbinden(spec: CaseSpec, args: dict) -> str:
    """Bearbeitung „Gelände" an ein Bauwerk hängen (Sockel bzw. Kappen)."""
    from .casespec import EditGelaende

    st = next((s for s in spec.structures if s.patch == args["patch"]), None)
    if st is None:
        return f"Bauwerk mit Patch „{args['patch']}“ gibt es nicht mehr"
    if any(e.type == "gelaende" for e in st.edits):
        return f"„{st.id}“ hat bereits eine Geländebearbeitung"
    ids = {e.id for e in st.edits}
    neu = "gelaende"
    n = 2
    while neu in ids:
        neu = f"gelaende_{n}"
        n += 1
    st.edits.append(EditGelaende(id=neu, modus="auto", einbindetiefe=0.3))
    return (f"Bearbeitung \u201eGelände\u201c an \u201e{st.id}\u201c "
            "angehängt — der Körper wird bis 0,30 m unter das tiefste Gelände "
            "geführt und die Übertiefe gekappt")


def _kraftauswertung_ein(spec: CaseSpec, args: dict) -> str:
    patch = args["patch"]
    if patch in spec.evaluation.force_patches:
        return f"Die Kraftauswertung für „{patch}“ war bereits eingeschaltet"
    spec.evaluation.force_patches.append(patch)
    return (f"Kraftauswertung für „{patch}“ eingeschaltet — Kraft und Moment "
            "werden ab dem nächsten Lauf als Zeitreihe geschrieben")


def _gebiet_hoehe_anpassen(spec: CaseSpec, args: dict) -> str:
    """
    Gebietsdeckel und -sohle so weit ziehen, dass das Gelände hineinpasst.
    Eine halbe Basiszelle Luft, damit die Grenze nicht auf der Oberfläche
    liegt. Fachlich unkritisch: das Gebiet ist der Ausschnitt, nicht das
    Modell — es wird nur groß genug gemacht.
    """
    from .terrain import TerrainField

    if spec.terrain is None:
        return "Ohne Gelände gibt es nichts anzupassen"
    feld = TerrainField.from_spec(spec.terrain, spec.domain,
                                  args.get("base_dir", "."))
    luft = 0.5 * spec.mesh.base_cell
    hoch = float(feld.z.max())
    tief = float(feld.z.min())
    alt_max, alt_min = spec.domain.z_max, spec.domain.z_min
    if hoch > spec.domain.z_max:
        spec.domain.z_max = round(hoch + luft, 3)
    if tief < spec.domain.z_min:
        spec.domain.z_min = round(tief - luft, 3)
    if (spec.domain.z_max, spec.domain.z_min) == (alt_max, alt_min):
        return "Das Gelände passt bereits in das Modellgebiet"
    return (f"Gebietshöhe von {alt_min:g} … {alt_max:g} auf "
            f"{spec.domain.z_min:g} … {spec.domain.z_max:g} m gezogen — "
            "das Gelände passt jetzt hinein")


def _durchstoss_ein(spec: CaseSpec, args: dict) -> str:
    """
    Am vergrabenen Durchlass das Bohren einschalten. Das Gelände wird
    dadurch nicht mehr als Höhenfläche, sondern als Erdkörper mit
    ausgeschnittener Bohrung gebaut — nur so kann ein Rohr durch einen Damm
    führen. Fachlich ändert sich nichts: Lage, Neigung und Querschnitt des
    Rohres bleiben, wie sie sind.
    """
    st = next((s for s in spec.structures
               if s.id == args["struct"] and s.type == "culvert"), None)
    if st is None:
        return f"Durchlass „{args['struct']}“ gibt es nicht mehr"
    if st.durchstoesst_gelaende:
        return f"„{st.id}“ bohrt sich bereits durch das Gelände"
    st.durchstoesst_gelaende = True
    return (f"„{st.id}“ bohrt sich jetzt durch das Gelände — der Erdkörper "
            "bekommt den Rohrquerschnitt als Hohlraum ausgeschnitten, die "
            "Mündung wird dadurch als Fläche angeschnitten")


def _anschluesse(spec: CaseSpec, args: dict) -> str:
    from .anschluss import anschluesse_herstellen

    meldungen = anschluesse_herstellen(spec)
    return " · ".join(meldungen) if meldungen else "Anschlüsse waren stimmig"


_KUREN = {
    "verfeinerung_erhoehen": _verfeinerung_erhoehen,
    "box_ans_fenster": _box_ans_fenster,
    "box_auf_spiegel": _box_auf_spiegel,
    "gelaende_einbinden": _gelaende_einbinden,
    "kraftauswertung_ein": _kraftauswertung_ein,
    "gebiet_hoehe_anpassen": _gebiet_hoehe_anpassen,
    "anschluesse_herstellen": _anschluesse,
    "durchstoss_ein": _durchstoss_ein,
}


def anwenden(spec: CaseSpec, aktion: str, args: dict | None = None) -> str:
    """Eine Kur ausführen. Rückgabe: was geändert wurde, in Klartext."""
    fn = _KUREN.get(aktion)
    if fn is None:
        raise ValueError(f"Unbekannte Kur: {aktion}")
    if spec.mesh is None or spec.domain is None:
        raise ValueError("Ohne Modellgebiet und Netzangaben gibt es nichts "
                         "zu richten")
    return fn(spec, args or {})
