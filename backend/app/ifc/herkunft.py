"""Die Herkunft erzeugter Elemente — EIN Merkmalssatz, EIN Schreiber.

Fahrplan Erdbau-Container, Stufe 3 (E5). Bis 2026-09-11 trug ein erzeugter
Aushub nur `Quagg_CDE` (Journal-Kennung, Rezept, Wirt). Welches Dokument in
welcher Revision sein Gelaende lieferte, stand an der Fachmodell-GRUPPE, der
Journalstand nur im Bericht — wer in einem fremden Werkzeug den Aushub
anklickte, sah davon nichts. Jetzt:

  * `Quagg_Herkunft` an jedem erzeugten Element: Quelldokument, Revision,
    sha256, die GlobalIds der Quellen, Journalstand, Zeitpunkt, Werkzeug und
    ein Eingabe-Hash. Die GlobalId bleibt an der Journal-Kennung (E4) —
    dasselbe Element ueber Revisionen hinweg; ob sich sein INHALT aenderte,
    sagt der Hash.
  * jede Quelle ein `IfcDocumentInformation`, auf das Gruppe und Elemente ueber
    eine `IfcDocumentReference` zeigen (`IfcRelAssociatesDocument`) — so
    empfiehlt es ifcopenshell (`api.document.assign_document`), und so zeigen
    Werkzeuge Dokumente an.

Der Verbund schreibt denselben Satz, wenn er eine GlobalId umbenennen muss
(`OriginalGlobalId`) — in den Satz, den das Element schon traegt: zwei Saetze
gleichen Namens an einem Element liest jedes Werkzeug anders.

Kein ifcopenshell auf Modulebene: die Datei-Operationen bekommen die Datei
uebergeben, Hash und Journalstand sind rein.
"""
import hashlib
import json
import re

from . import FASSUNG, WERKZEUG

PSET_HERKUNFT = "Quagg_Herkunft"
PSET_FACHMODELL = "Quagg_Fachmodell"
# Die Quelle eines Elements, das nur aus der CDE stammt (ein Aushub auf selbst
# gezeichnetem Gelaende): das Journal — seine Revision ist der Journalstand.
QUELLE_JOURNAL = "CDE-Journal"

# Feld -> Werttyp. Was hier fehlt, wird IfcText.
FELDER = {
    "QuellDokument": "IfcLabel",
    "QuellRevision": "IfcLabel",
    "QuellSHA256": "IfcText",
    "QuellGlobalIds": "IfcText",
    "Journalstand": "IfcLabel",
    "Erzeugt": "IfcDateTime",
    "Werkzeug": "IfcLabel",
    "EingabeHash": "IfcIdentifier",
    "OriginalGlobalId": "IfcLabel",
    "OriginalDatei": "IfcLabel",
}

# Was in den Eingabe-Hash eingeht: was Form und Aussage des Elements bestimmt.
# Name, Farbe, Vorgangstitel NICHT — eine Umbenennung ist kein neuer Koerper.
HASH_FELDER = ("klasse", "predefinedType", "ursprung", "punkte", "dreiecke", "mengen", "quellen")

_SHA256 = re.compile(r"^[0-9a-f]{64}$")


def werkzeug() -> str:
    """Wer schrieb — mit der Fassung (`app/ifc/__init__.py`) und der ifcopenshell darunter."""
    import ifcopenshell
    return f"{WERKZEUG} {FASSUNG} (ifcopenshell {ifcopenshell.version})"


def eingabe_hash(bauteil: dict) -> str:
    """sha256[:16] ueber das kanonische JSON dessen, was das Element ausmacht."""
    kern = {k: bauteil.get(k) for k in HASH_FELDER}
    roh = json.dumps(kern, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(roh.encode("ascii")).hexdigest()[:16]


def journalstand(journal: dict | None) -> str | None:
    """`<commit>` — oder `<commit>+Sitzung`, wenn ungesicherte Schritte mitkamen."""
    j = journal or {}
    if not j.get("commit"):
        return None
    return f"{j['commit']}+Sitzung" if j.get("sitzungOffen") else str(j["commit"])


def _hat_wert(v) -> bool:
    return v is not None and v != "" and v != [] and v != {}


def _eigenschaft(f, name: str, wert):
    return f.create_entity("IfcPropertySingleValue", Name=name,
                           NominalValue=f.create_entity(FELDER.get(name, "IfcText"), str(wert)))


def _beziehung(objekt):
    """Die Beziehung, ueber die `Quagg_Herkunft` schon am Objekt haengt — oder None."""
    for rel in getattr(objekt, "IsDefinedBy", None) or ():
        if (rel.is_a("IfcRelDefinesByProperties")
                and getattr(rel.RelatingPropertyDefinition, "Name", None) == PSET_HERKUNFT):
            return rel
    return None


def schreibe(f, besitz, objekt, werte: dict, *, guid_von):
    """`Quagg_Herkunft` an ein Objekt: neu — oder in den Satz, den es schon traegt.

    Gleichnamige Werte werden ersetzt, die anderen bleiben. Teilt sich das
    Objekt den Satz mit anderen, bekommt es einen eigenen mit den alten Werten.

    @param guid_von  Teil -> GlobalId, gerufen mit "satz" und "rel", wenn ein
                     Satz entsteht (Eigenbau und Verbund leiten verschieden ab)
    @returns der Merkmalssatz, oder None, wenn kein Wert kam
    """
    neu = {k: v for k, v in werte.items() if _hat_wert(v)}
    if not neu:
        return None
    rel = _beziehung(objekt)
    if rel is not None and len(rel.RelatedObjects) == 1:
        satz = rel.RelatingPropertyDefinition
        weg = [e for e in satz.HasProperties or () if e.Name in neu]
        satz.HasProperties = [e for e in satz.HasProperties or () if e.Name not in neu] + [
            _eigenschaft(f, k, v) for k, v in neu.items()]
        for e in weg:
            f.remove(e)
        return satz
    alte = {}
    if rel is not None:
        alte = {e.Name: e.NominalValue.wrappedValue for e in rel.RelatingPropertyDefinition.HasProperties or ()
                if e.is_a("IfcPropertySingleValue") and e.NominalValue is not None}
        rel.RelatedObjects = [o for o in rel.RelatedObjects if o.id() != objekt.id()]
    satz = f.create_entity("IfcPropertySet", GlobalId=guid_von("satz"), OwnerHistory=besitz, Name=PSET_HERKUNFT,
                           HasProperties=[_eigenschaft(f, k, v) for k, v in {**alte, **neu}.items()])
    f.create_entity("IfcRelDefinesByProperties", GlobalId=guid_von("rel"), OwnerHistory=besitz,
                    RelatedObjects=[objekt], RelatingPropertyDefinition=satz)
    return satz


def dokument(f, cache: dict, *, sha256: str, datei: str | None = None, revision=None,
             ablage: str | None = None):
    """Eine Quelle als Dokument — je sha256 EINE Referenz.

    Die Kennung ist die sha256 der Datei: gleicher Inhalt, gleiches Dokument.
    `Location` ist der Ablageort, wenn der Server ihn mitgab. Die Referenz
    traegt Kennung und Ort, aber KEINEN Namen: `IfcDocumentReference.WR1`
    verlangt Name XOR ReferencedDocument.

    @param cache  sha256 -> Referenz; dieselbe Quelle zweimal ergibt eine
    @returns die IfcDocumentReference
    """
    if sha256 in cache:
        return cache[sha256]
    ort = f"{ablage.rstrip('/')}/{datei}" if ablage and datei else None
    info = f.create_entity("IfcDocumentInformation", Identification=sha256, Name=datei or sha256[:12],
                           Location=ort, Revision=None if revision is None else str(revision))
    cache[sha256] = f.create_entity("IfcDocumentReference", Location=ort, Identification=sha256,
                                    ReferencedDocument=info)
    return cache[sha256]


def verknuepfe(f, besitz, referenz, objekte, *, guid: str):
    """EIN `IfcRelAssociatesDocument`: das Dokument an Gruppen und Elementen, die daraus stammen."""
    objekte = list({o.id(): o for o in objekte}.values())
    if not objekte:
        return None
    return f.create_entity("IfcRelAssociatesDocument", GlobalId=guid, OwnerHistory=besitz,
                           RelatedObjects=objekte, RelatingDocument=referenz)


def dokument_schluessel(info) -> tuple:
    """Wann zwei IfcDocumentInformation im Verbund DASSELBE Dokument sind.

    Unsere tragen die sha256 der Datei als Kennung: gleicher Inhalt, gleiches
    Dokument — auch wenn eine Seite die Revision nicht kannte. Fremde tragen
    eine Dokumentnummer; dort unterscheidet erst die Revision.
    """
    kennung = info.Identification or ""
    return (kennung,) if _SHA256.match(kennung) else (kennung, info.Revision)
