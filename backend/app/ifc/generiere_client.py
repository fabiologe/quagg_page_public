"""Das Client-Woerterbuch der CDE — ERZEUGT aus dem Schema-Schnappschuss.

Liest NUR `daten/schema_IFC4X3_ADD2.json` (kein ifcopenshell) und schreibt
drei Dateien nach `client/src/features/cde/data/`:

  entity-schema.js   ENTITY_META: jede Klasse aus IFC4X3_ADD2 und die Waisen
                     aus IFC4/IFC2X3 — mit Vererbung, Schemata, PredefinedTypes
                     und eigenen Attributen
  pset-templates.js  PSET_TEMPLATES: die bSI-Vorlagen (Pset_/Qto_) aus ADD2
  altnamen.js        ALTNAMEN, ENDUNGEN, GESTRICHEN, ABGEKUENDIGT — und
                     NORMIERT, die Probe, gegen die der Client seine Normierung haelt
  quagg-starter.ids  die mitgelieferten Projektanforderungen (IDS 1.0), als KOPIE von
                     daten/quagg-starter.ids — der Client liest sie fuer seine Vorschau

WARUM ERZEUGT UND NICHT VON HAND: die alten Dateien trugen den Kopf „run
scripts/gen_ifc_schema.py to regenerate" — das Skript gab es nie. Ein
Woerterbuch, das niemand nachbauen kann, altert still.

Der Client bekommt die Dateien FERTIG. Er importiert nichts aus dem Backend;
die Verbindung ist dieser Generator und der Test, der beide Seiten gleich
haelt (`tests/test_client_woerterbuch.py`) — dasselbe Muster wie
`bezugssysteme.py` gegen `Koordinatensysteme.js`.

Aufruf (in backend/, jedes python3):
    python3 -m app.ifc.generiere_client            # schreiben
    python3 -m app.ifc.generiere_client --pruefe   # Exit 1, wenn eine Datei abweicht
"""
import argparse
import json
import re
import sys
from pathlib import Path

from . import schema as S

ZIEL = Path(__file__).resolve().parents[3] / "client" / "src" / "features" / "cde" / "data"
BESCHREIBUNG_ZEICHEN = 200
# Merkmalstexte stehen je Vorlage zu Dutzenden im Bundle; 120 Zeichen wie der alte Export.
MERKMAL_ZEICHEN = 120

_KOPF = """/**
 * {titel} — ERZEUGT, NICHT VON HAND ÄNDERN.
 *
 * Quelle: backend/app/ifc/daten/schema_{ziel}.json ({werkzeug}),
 * der Schema-Schnappschuss der CDE. Neu erzeugen (in backend/):
 *     python3 -m app.ifc.generiere_client
 * backend/app/ifc/tests/test_client_woerterbuch.py hält Datei und Schnappschuss gleich.
 */
"""


def _js(wert) -> str:
    return json.dumps(wert, ensure_ascii=False)


def _kopf(titel: str, snap: dict) -> str:
    return _KOPF.format(titel=titel, ziel=snap["zielschema"], werkzeug=snap["werkzeug"])


def label(name: str, praefix: str = "Ifc") -> str:
    """'IfcEarthworksCut' -> 'Earthworks Cut' (Anzeige, wie das alte Woerterbuch)."""
    rumpf = name[len(praefix):] if name.startswith(praefix) else name
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", rumpf)


# ── entity-schema.js ────────────────────────────────────────────────────────

_ENTITY_GETTER = """
/**
 * Die Attribute einer Klasse in EXPRESS-Reihenfolge, von der Wurzel abwärts.
 * Jede Stufe führt nur ihre EIGENEN — die Kette setzt sie zusammen.
 * @returns {Array<{name: string, type: string, card: '1:1'|'0:1'}>}
 */
export function standardAttributes(ifcTypeUpper) {
  const out = [];
  for (const stufe of ENTITY_META[String(ifcTypeUpper ?? '').toUpperCase()]?.hierarchy ?? []) {
    for (const [name, type, optional] of ENTITY_META[stufe.toUpperCase()]?.attr ?? []) {
      out.push({ name, type, card: optional ? '0:1' : '1:1' });
    }
  }
  return out;
}

/** Die Auskunft über eine Klasse (Großschrift), oder eine leere in derselben Form. */
export function getEntityInfo(ifcTypeUpper) {
  if (!ifcTypeUpper) return null;
  const upper = String(ifcTypeUpper).toUpperCase();
  const entry = ENTITY_META[upper];
  if (!entry) {
    return { name: upper, label: upper, description: '', schema: [], hierarchy: [],
             abstract: false, standardAttributes: [] };
  }
  return { ...entry, standardAttributes: standardAttributes(upper) };
}
"""


def entity_schema_js(snap: dict) -> str:
    ents = snap["entitaeten"]
    zeilen = [_kopf("IFC-Woerterbuch der CDE (Klassen)", snap).rstrip("\n"), "",
              "/**",
              " * Schlüssel: Klassenname in GROSSSCHRIFT, wie web-ifc und fragments die Kategorie nennen.",
              f" * {len(ents)} Klassen: alle aus {snap['zielschema']} und die Produkt-Waisen aus "
              f"{', '.join(snap['altschemata'])} (`schema` sagt, wo eine Klasse vorkommt).",
              " * `hierarchy` läuft von der Wurzel zur Klasse; `attr` = EIGENE Attribute [Name, Typ, optional].",
              " */",
              "export const ENTITY_META = {"]
    for name in sorted(ents, key=str.upper):
        e = ents[name]
        felder = [("name", name), ("label", label(name)),
                  ("description", S.kurz(e["beschreibung"], BESCHREIBUNG_ZEICHEN)),
                  ("schema", e["schemata"]), ("hierarchy", S.vererbung(name, snap)), ("abstract", e["abstrakt"])]
        if e.get("predefined"):
            felder.append(("predefined", e["predefined"]))
        if e["attribute"]:
            felder.append(("attr", [[a, t, 1 if o else 0] for a, t, o in e["attribute"]]))
        if e.get("spec_url"):
            felder.append(("specUrl", e["spec_url"]))
        if "nachfolger" in e:
            felder.append(("nachfolger", e["nachfolger"]))
        if e.get("abgekuendigt"):
            felder.append(("abgekuendigt", True))
        zeilen.append(f"  {name.upper()}: {{")
        zeilen += [f"    {k}: {_js(v)}," for k, v in felder]
        zeilen.append("  },")
    zeilen += ["};", _ENTITY_GETTER.rstrip("\n"), ""]
    return "\n".join(zeilen)


# ── pset-templates.js ───────────────────────────────────────────────────────

_PSET_GETTER = """
/**
 * Die Vorlagen, die für eine Klasse gelten — über die VERERBUNG.
 *
 * ApplicableEntity schließt Untertypen ein: eine Vorlage für `IfcElement` gilt
 * für jede Wand. Einträge `IFCACTUATOR/ELECTRICACTUATOR` gelten nur mit
 * diesem PredefinedType.
 */
export function getPsetsForType(ifcType, predefinedType = null) {
  const upper = String(ifcType ?? '').toUpperCase();
  const kette = new Set((ENTITY_META[upper]?.hierarchy ?? []).map(h => h.toUpperCase()));
  kette.add(upper);
  const pt = predefinedType ? String(predefinedType).toUpperCase() : null;
  return Object.entries(PSET_TEMPLATES).filter(([, tpl]) => tpl.applicableTo.some((a) => {
    const [klasse, typ] = a.split('/');
    return kette.has(klasse) && (!typ || typ === pt);
  }));
}

/** Alle Vorlagen als [Name, Vorlage]-Paare. */
export function getAllPsets() {
  return Object.entries(PSET_TEMPLATES);
}
"""


def pset_templates_js(snap: dict) -> str:
    vorl = snap["vorlagen"]
    zeilen = [_kopf("IFC-Woerterbuch der CDE (Merkmals- und Mengenvorlagen)", snap).rstrip("\n"), "",
              "import { ENTITY_META } from './entity-schema.js';", "",
              f"/** {len(vorl)} Vorlagen von buildingSMART für {snap['zielschema']}. */",
              "export const PSET_TEMPLATES = {"]
    for name in sorted(vorl):
        v = vorl[name]
        praefix = "Qto_" if name.startswith("Qto_") else "Pset_"
        art = "Quantity Set" if praefix == "Qto_" else "Property Set"
        zeilen.append(f"  {_js(name)}: {{")
        zeilen.append(f"    label: {_js(f'{art}: ' + label(name, praefix))},")
        zeilen.append(f"    description: {_js(S.kurz(v['beschreibung'], BESCHREIBUNG_ZEICHEN))},")
        zeilen.append(f"    art: {_js(v['art'])},")
        zeilen.append(f"    applicableTo: {_js([x.upper() for x in v['gilt_fuer']])},")
        zeilen.append("    props: [")
        for m_name, m_art, m_typ, m_text, werte in v["merkmale"]:
            prop = {"name": m_name, "type": m_typ or "IfcLabel", "description": S.kurz(m_text, MERKMAL_ZEICHEN)}
            if werte:
                prop["values"] = werte
            zeilen.append(f"      {_js(prop)},")
        zeilen.append("    ],")
        zeilen.append("  },")
    zeilen += ["};", _PSET_GETTER.rstrip("\n"), ""]
    return "\n".join(zeilen)


# ── altnamen.js ─────────────────────────────────────────────────────────────

def altnamen_js(snap: dict) -> str:
    ents = snap["entitaeten"]
    probe = sorted({*S.waisen(snap), *snap["abgekuendigt"], *snap["altnamen"]}, key=str.upper)
    normiert = {n.upper(): S.normalisiere(n) for n in probe}
    zeilen = [_kopf("IFC-Woerterbuch der CDE (Altnamen)", snap).rstrip("\n"), "",
              "/** Umbenennungen älterer Schemata → der Name in " + snap["zielschema"] + ". */",
              "export const ALTNAMEN = Object.freeze({"]
    zeilen += [f"    {k.upper()}: {_js(v.upper())}," for k, v in sorted(snap["altnamen"].items())]
    zeilen += ["});", "",
               "/** Endungen, die sagen, WIE etwas modelliert ist, nicht WAS es ist (IfcWallStandardCase ist eine Wand). */",
               f"export const ENDUNGEN = Object.freeze({_js([e.upper() for e in snap['endungen']])});", "",
               "/** Ersatzlos gestrichen — kein Nachfolger, aber in Lieferungen noch da. */",
               f"export const GESTRICHEN = Object.freeze({_js([n.upper() for n in snap['gestrichen']])});", "",
               f"/** In {snap['zielschema']} vorhanden, von buildingSMART abgekündigt. */",
               f"export const ABGEKUENDIGT = Object.freeze({_js([n.upper() for n in snap['abgekuendigt']])});", "",
               "/**",
               " * Die Probe: so normiert der SCHREIBER (schema.normalisiere) jeden Altnamen.",
               " * Ein Client-Test hält `normalisiereKategorie` dagegen — zwei Umsetzungen, eine Tabelle.",
               " */",
               "export const NORMIERT = Object.freeze({"]
    zeilen += [f"    {k}: {_js(v)}," for k, v in normiert.items()]
    zeilen += ["});", ""]
    return "\n".join(zeilen)


def erzeuge(snap: dict) -> dict:
    """Dateiname -> Inhalt. Rein, schreibt nichts."""
    return {"entity-schema.js": entity_schema_js(snap),
            "pset-templates.js": pset_templates_js(snap),
            "altnamen.js": altnamen_js(snap),
            # Keine Uebersetzung: IDS ist das kanonische Format, der Client bekommt die Datei selbst.
            "quagg-starter.ids": (Path(__file__).parent / "daten" / "quagg-starter.ids").read_text(encoding="utf-8")}


def _main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Client-Woerterbuch aus dem Schema-Schnappschuss erzeugen")
    p.add_argument("--pruefe", action="store_true", help="nur vergleichen, Exit 1 bei Abweichung")
    a = p.parse_args(argv)
    abweichend = []
    for datei, inhalt in erzeuge(S.snapshot()).items():
        pfad = ZIEL / datei
        alt = pfad.read_text(encoding="utf-8") if pfad.is_file() else None
        if alt == inhalt:
            continue
        abweichend.append(datei)
        if not a.pruefe:
            pfad.write_text(inhalt, encoding="utf-8")
            print(f"{datei}: geschrieben, {len(inhalt.encode('utf-8')) / 1e3:.0f} kB")
    if a.pruefe:
        print("0 Abweichungen" if not abweichend else
              f"{len(abweichend)} Datei(en) weichen ab: {abweichend} — python3 -m app.ifc.generiere_client")
        return 1 if abweichend else 0
    if not abweichend:
        print("alle Dateien aktuell")
    return 0


if __name__ == "__main__":
    sys.exit(_main())
