"""Diagramme der GENUTZTEN IFC-Teilmenge — erzeugt, nie von Hand (Fahrplan IFC-Konsistenz, Stufe 9).

Ein Gesamtdiagramm von IFC 4.3 hilft niemandem (876 Klassen). Welche Klassen
die CDE schreibt oder liest, steht im Code; wie sie erben, welche Enden eine
Beziehung hat und wo die Doku steht, im Schnappschuss (`schema.py`). Dieses
Modul fuehrt beides zusammen und schreibt Mermaid nach `docs/ifc/`:

  entities-genutzt.md  Vererbung der genutzten Klassen, Tabelle mit Doku-Links
  beziehungen.md       die genutzten IfcRel-Klassen mit ihren Enden; die Quagg_*-Saetze
  pruefstufen.md       die Stufen des Prueftors und ihre Regeln

Rein: Quelltext und Schnappschuss, kein ifcopenshell — laeuft mit jedem python3.
Gehalten von tests/test_diagramme.py, dem Hook `.claude/hooks/ifc-wache.sh` und
dem pre-commit.

    python3 -m app.ifc.diagramme            # schreiben (in backend/)
    python3 -m app.ifc.diagramme --pruefe   # vergleichen, Exit 1 bei Abweichung
"""
import argparse
import json
import re
import sys
from pathlib import Path

from . import schema as S

IFC = Path(__file__).resolve().parent
REPO = IFC.parents[2]
ZIEL = REPO / "docs" / "ifc"
CDE = REPO / "client" / "src" / "features" / "cde"

# Wer schreibt oder liest welche Klassen — je Quelle ein Name fuer die Tabelle.
BACKEND = {"Verbund": IFC / "verbund.py", "Eigenbau": IFC / "eigenbau.py", "Herkunft": IFC / "herkunft.py"}
PAKET = IFC / "tests" / "daten" / "paket_v2.json"
CLIENT = {
    "Typprofile": CDE / "services" / "bauform" / "Typprofile.js",
    "Bauteilrezepte": CDE / "services" / "Bauteilrezepte.js",
    "Gelände": CDE / "services" / "GelaendeQuelle.js",
    "Kategorien": CDE / "services" / "Kategorien.js",
}

_PY_NAME = re.compile(r"[\"'](Ifc[A-Z][A-Za-z0-9]*)[\"']")
_JS_NAME = re.compile(r"'(IFC[A-Z0-9]+)'|^\s*(IFC[A-Z0-9]+)\s*:", re.M)
_SCHEMANAME = re.compile(r"^IFC\d")
_QUAGG = re.compile(r"\bQuagg_[A-Za-z]+\b")
_ENDEN = ("Relating", "Related")
_MENGE = re.compile(r"^(SET|LIST|BAG|ARRAY)\b")

# Stufe und Schwere je Regelfamilie. Die Kennungen selbst liest `regeln()` aus
# pruefe.py; welche Verbundregeln bei einer Lieferung nur melden, aus NUR_IM_VERBUND.
STUFE = {"SPF": "schema", "OPEN": "schema", "IDS": "ids", "GHERKIN": "gherkin", "V09": "motor"}
SCHWERE = {"IDS": "Warnung je verfehlter Spezifikation; Hinweis, wenn keine IDS hinterlegt ist",
           "GHERKIN": "Hinweis", "V11": "Hinweis"}

KOPF = ("> Erzeugt von `backend/app/ifc/diagramme.py` aus dem Code und dem Schema-Schnappschuss "
        "({schema}, {werkzeug}). Nicht von Hand ändern — neu schreiben mit "
        "`cd backend && python3 -m app.ifc.diagramme`.\n")


def _lies(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def genutzt() -> tuple:
    """({Klasse: [Quellen]}, [Namen, die keine Entitaet sind]) — aus dem Code, nicht geraten."""
    wer, fremd = {}, set()

    def nimm(roh, quelle):
        n = S.klasse_zu(roh)
        if n:
            wer.setdefault(n, set()).add(quelle)
        elif not _SCHEMANAME.match(roh):
            fremd.add(roh)

    for quelle, p in BACKEND.items():
        for roh in _PY_NAME.findall(_lies(p)):
            nimm(roh, quelle)
    for b in json.loads(_lies(PAKET)).get("bauteile", []):
        if b.get("klasse"):
            nimm(b["klasse"], "Eigenbau-Paket")
    for quelle, p in CLIENT.items():
        for a, b in _JS_NAME.findall(_lies(p)):
            nimm(a or b, quelle)
    return {n: sorted(q) for n, q in sorted(wer.items())}, sorted(fremd)


def _gruppe(n) -> str:
    if S.ist_untertyp(n, "IfcProduct"):
        return "produkt"
    if S.ist_untertyp(n, "IfcRelationship"):
        return "beziehung"
    if S.ist_untertyp(n, "IfcRoot"):
        return "objekt"
    return "ressource"


def _ast(n) -> str:
    """Der Ast, an dem eine Produktklasse haengt: das Kind von IfcProduct — unter IfcElement eine Stufe tiefer."""
    kette = S.vererbung(n)
    i = kette.index("IfcProduct") + 1
    if i < len(kette) - 1 and kette[i] == "IfcElement":
        i += 1
    return kette[min(i, len(kette) - 1)]


def _klassendiagramm(klassen, markiert, ab=None) -> str:
    """Vererbung ueber `klassen`; mit `ab` beginnt jede Kette erst dort — ein Ast statt des ganzen Baums."""
    kanten = set()
    for n in klassen:
        kette = S.vererbung(n)
        if ab in kette:
            kette = kette[kette.index(ab):]
        kanten.update(zip(kette, kette[1:]))
    in_kanten = {k for kante in kanten for k in kante}
    knoten = sorted(in_kanten | set(klassen))
    zeilen = ["```mermaid", "classDiagram", "  direction LR"]
    zeilen += [f"  class {k}" for k in knoten if k not in in_kanten]
    zeilen += [f"  {o} <|-- {u}" for o, u in sorted(kanten)]
    zeilen += [f"  <<abstract>> {k}" for k in knoten if S.eintrag(k)["abstrakt"]]
    zeilen += [f"  style {k} fill:#dcedc8,stroke:#558b2f" for k in knoten if k in markiert]
    zeilen.append("```")
    return "\n".join(zeilen)


def _schema_spalte(e) -> str:
    text = S.ZIELSCHEMA if S.ZIELSCHEMA in e["schemata"] else "nur " + ", ".join(e["schemata"])
    return text + (" (abgekündigt)" if e.get("abgekuendigt") else "")


def entities_md(wer, fremd, kopf) -> str:
    produkte = [n for n in wer if _gruppe(n) == "produkt"]
    objekte = [n for n in wer if _gruppe(n) == "objekt"]
    wurzel = [n for n in wer if _gruppe(n) != "ressource"]
    ressourcen = [n for n in wer if _gruppe(n) == "ressource"]
    aeste = {}
    for n in produkte:
        aeste.setdefault(_ast(n), []).append(n)
    zeilen = [
        "# Genutzte IFC-Klassen", "", kopf,
        "Grün: Klassen, die die CDE schreibt oder liest — wer, steht in der Tabelle. Die übrigen Knoten "
        "sind die Obertypen dazwischen; `<<abstract>>` lässt sich nicht instanziieren.", "",
        "## Bauteile, Räume, Gelände (unter IfcProduct)", "",
        "An welchen Ästen die genutzten Klassen hängen — darunter je Ast sein Baum. Ein Ast, der selbst "
        "die einzige genutzte Klasse ist, steht nur hier.", "",
        _klassendiagramm(sorted(aeste), set(wer)), "",
        *[z for ast in sorted(aeste) if aeste[ast] != [ast] for z in (
            f"### {ast} — {len(aeste[ast])} genutzt", "", _klassendiagramm(aeste[ast], set(wer), ab=ast), "")],
        "## Projekt, Gruppen, Merkmalsätze", "", _klassendiagramm(objekte, set(wer)), "",
        "Die Beziehungen stehen mit ihren Enden in [beziehungen.md](beziehungen.md).", "",
        "## Alle genutzten Klassen unter IfcRoot", "",
        "| Klasse | genutzt von | abstrakt | Schema |", "|---|---|---|---|",
    ]
    for n in wurzel:
        e = S.eintrag(n)
        name = f"[{n}]({e['spec_url']})" if e.get("spec_url") else n
        zeilen.append(f"| {name} | {', '.join(wer[n])} | {'ja' if e['abstrakt'] else 'nein'} | {_schema_spalte(e)} |")
    zeilen += ["", "## Ressourcen (nicht unter IfcRoot)", "",
               "Geometrie, Einheiten, Werte, Stile — ohne GlobalId, deshalb nicht im Baum oben.", "",
               "| Klasse | genutzt von |", "|---|---|"]
    zeilen += [f"| {n} | {', '.join(wer[n])} |" for n in ressourcen]
    if fremd:
        zeilen += ["", "Im Code genannt, aber keine Klasse des Schnappschusses — Datentypen oder Klassen "
                   f"älterer Schemata, die ADD2 nicht mehr führt ({len(fremd)}): "
                   + ", ".join(f"`{f}`" for f in fremd) + "."]
    return "\n".join(zeilen) + "\n"


def _quagg() -> dict:
    fund = {}
    for p in sorted([*IFC.glob("*.py"), *(CDE / "services").rglob("*.js")]):
        for n in _QUAGG.findall(_lies(p)):
            fund.setdefault(n, set()).add(str(p.relative_to(REPO)))
    return {n: sorted(f) for n, f in sorted(fund.items())}


def beziehungen_md(wer, kopf) -> str:
    ents = S.snapshot()["entitaeten"]
    rels = [n for n in wer if _gruppe(n) == "beziehung" and not S.eintrag(n)["abstrakt"]]
    auswahl = set()
    zeilen = ["```mermaid", "flowchart LR"]
    for r in rels:
        zeilen.append(f"  {r}{{{{{r}}}}}")
        for a in S.attribute(r):
            ziele = re.findall(r"Ifc[A-Za-z0-9]+", a["typ"])
            if not a["name"].startswith(_ENDEN) or not ziele:
                continue
            ziel = ziele[-1]
            if ziel not in ents:
                if not ziel.endswith("Select"):
                    continue                      # z. B. RelatedObjectsType: ein Wahrheitswert, kein Ende
                auswahl.add(ziel)
            beschriftung = a["name"] + (" (Menge)" if _MENGE.match(a["typ"]) else "")
            if a["name"].startswith("Relating"):
                zeilen.append(f'  {ziel} -->|"{beschriftung}"| {r}')
            else:
                zeilen.append(f'  {r} -->|"{beschriftung}"| {ziel}')
    zeilen += [f"  style {x} stroke-dasharray: 4 3" for x in sorted(auswahl)]
    zeilen.append("```")
    quagg = _quagg()
    tabelle = ["| Merkmalsatz | Fundstellen |", "|---|---|"]
    tabelle += [f"| `{n}` | {', '.join(f'`{f}`' for f in fundorte)} |" for n, fundorte in quagg.items()]
    return "\n".join([
        "# Genutzte Beziehungen und Merkmalsätze", "", kopf,
        "Sechseck: eine Beziehung, die die CDE schreibt. Pfeil hinein: das `Relating…`-Ende, Pfeil hinaus: "
        "das `Related…`-Ende. Gestrichelt: ein Auswahl-Typ (SELECT) statt einer Klasse.", "",
        "\n".join(zeilen), "",
        "## Quagg_*-Merkmalsätze", "",
        "Eigene Merkmalsätze der CDE — kein bSI-Standard. Wo sie geschrieben oder gelesen werden:", "",
        "\n".join(tabelle),
    ]) + "\n"


def regeln() -> list:
    """[(Kennung, Titel, Stufe, Schwere)] — gelesen aus pruefe.py und probe.py, nicht abgeschrieben."""
    text = _lies(IFC / "pruefe.py")
    nur = re.search(r"NUR_IM_VERBUND\s*=\s*\(([^)]*)\)", text)
    nur_im_verbund = set(re.findall(r'"([^"]+)"', nur.group(1))) if nur else set()
    out, gesehen = [], set()
    for kennung, titel, name in re.findall(
            r'_befund\(\s*"([A-Z][A-Za-z0-9]*)"\s*,\s*(?:f?"([^"]*)"|([A-Za-z_]\w*))', text):
        if kennung in gesehen:
            continue
        gesehen.add(kennung)
        if not titel and name:
            # Der Titel steht in einer Variablen (SPF: `titel = ("…" if regeln else "…")`) — ihre
            # erste Zuweisung im Modul, bei einer Fallunterscheidung der erste Zweig.
            m = re.search(rf'\b{name}\s*=\s*\(?\s*f?"([^"]*)"', text)
            titel = m.group(1) if m else name
        out.append((kennung, titel.replace("{ZIELSCHEMA}", S.ZIELSCHEMA)))
    v09 = re.search(r'V09_TITEL\s*=\s*"([^"]*)"', _lies(IFC / "probe.py"))
    out.append(("V09", v09.group(1) if v09 else ""))
    zeilen = []
    for kennung, titel in out:
        stufe = STUFE.get(kennung, "verbund")
        if kennung in SCHWERE:
            schwere = SCHWERE[kennung]
        elif kennung in nur_im_verbund:
            schwere = "Fehler im Verbund, Warnung bei einer einzelnen Lieferung"
        else:
            schwere = "Fehler"
        zeilen.append((kennung, titel, stufe, schwere))
    # In der Reihenfolge des Tors, nicht des Quelltexts: SPF vor OPEN, V00 vor V01.
    reihenfolge = ("schema", "verbund", "ids", "gherkin", "motor")
    return sorted(zeilen, key=lambda z: (reihenfolge.index(z[2]), z[0] != "SPF", z[0]))


def pruefstufen_md(kopf) -> str:
    r = regeln()
    verbund = [k for k, _, s, _ in r if s == "verbund"]
    bereich = f"{verbund[0]} … {verbund[-1]}" if verbund else "—"
    tabelle = ["| Kennung | Stufe | Titel | Schwere |", "|---|---|---|---|"]
    tabelle += [f"| {k} | {s} | {t} | {w} |" for k, t, s, w in r]
    return "\n".join([
        "# Die Stufen des Prüftors", "", kopf,
        "Ein Prüftor (`backend/app/ifc/pruefe.py`), fünf Stufen, eine Sperr-Regel. Ein Registerdokument "
        "(Modus `pruefe`) und ein Verbund gehen durch dasselbe Tor; bei einer einzelnen Lieferung melden die "
        "Verbundregeln nur.", "",
        "```mermaid",
        "flowchart TD",
        '  D(["IFC-Datei"]) --> SPF["schema: SPF — Syntax, Schema, Where-Rules<br/>ifcopenshell.validate über den Pfad"]',
        '  SPF --> OPEN["öffnen — OPEN nur, wenn es misslingt"]',
        f'  OPEN --> VB["verbund: {bereich}"]',
        '  VB --> IDS["ids: je Spezifikation IDS:datei:nr<br/>ifctester, IDS 1.0"]',
        '  IDS --> GH["gherkin: nicht eingerichtet (Hinweis)"]',
        '  GH --> MO["motor: V09 — web-ifc liest dieselbe Datei"]',
        '  MO --> U{"sperrt ein Befund?<br/>ok ≠ true UND schwere = fehler"}',
        '  U -->|"nein"| G(["geprüft — ins Register"])',
        '  U -->|"ja"| A(["Verbund: abgelehnt · Dokument: Bericht mit Verstößen"])',
        "```", "",
        "`ok = None` heißt ungeprüft — und ungeprüft gilt als nicht bestanden. Die Regel steht einmal: "
        "`pruefe.offen`, im Client gespiegelt in `services/Pruefbericht.js`.", "",
        "\n".join(tabelle),
    ]) + "\n"


def erzeuge() -> dict:
    wer, fremd = genutzt()
    kopf = KOPF.format(schema=S.ZIELSCHEMA, werkzeug=S.snapshot().get("werkzeug", "ifcopenshell"))
    return {"entities-genutzt.md": entities_md(wer, fremd, kopf),
            "beziehungen.md": beziehungen_md(wer, kopf),
            "pruefstufen.md": pruefstufen_md(kopf)}


def _main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Mermaid-Diagramme der genutzten IFC-Teilmenge nach docs/ifc/")
    p.add_argument("--pruefe", action="store_true", help="nur vergleichen, Exit 1 bei Abweichung")
    a = p.parse_args(argv)
    texte = erzeuge()
    if a.pruefe:
        ab = [n for n, t in texte.items()
              if not (ZIEL / n).is_file() or (ZIEL / n).read_text(encoding="utf-8") != t]
        print("0 Abweichungen" if not ab else f"{len(ab)} Datei(en) weichen ab: {ab} — python3 -m app.ifc.diagramme")
        return 1 if ab else 0
    ZIEL.mkdir(parents=True, exist_ok=True)
    for n, t in texte.items():
        (ZIEL / n).write_text(t, encoding="utf-8")
        print(f"{(ZIEL / n).relative_to(REPO)}: {len(t.splitlines())} Zeilen")
    return 0


if __name__ == "__main__":
    sys.exit(_main())
