"""GlobalIds, die bei jedem Lauf dieselben sind.

WARUM DAS EINE EIGENE DATEI IST: an zwei Stellen braucht der Verbund eine
GlobalId, die es vorher nicht gab — und beide Male waere eine gewuerfelte Id
ein stiller Schaden.

  1. KOLLISION. Zwei Fachmodelle koennen dieselbe GlobalId tragen (derselbe
     Ursprungsstand, zweimal exportiert). Im Verbund darf sie nur einmal
     vorkommen. Der zweite Traeger braucht eine ERSATZ-Id.

  2. CDE-EIGENBAU. `neueGlobalId()` im Client liefert absichtlich
     `cde-<base36>-<zufall>` — keinen gueltigen IfcGloballyUniqueId. Die
     Begruendung steht dort im Quelltext und ist richtig: solange das Bauteil
     nur im Journal lebt, waere eine echte GUID eine Behauptung ueber
     Herkunft, die nicht stimmt. Im Augenblick des Exports wird das Bauteil
     aber wirklich ein IFC-Element — und bekommt dann eine echte Id.

In beiden Faellen ist WUERFELN die falsche Antwort. Der isyifc-Schreiber macht
genau das (`toIfcGuid` ignoriert sein Argument), und die Folge ist, dass zwei
Exporte desselben Netzes nichts miteinander zu tun haben: kein Modellvergleich,
keine Revisionsverfolgung, kein zweiter Verbund, der den ersten wiedererkennt.

Deshalb: abgeleitet statt gewuerfelt. Gleiche Eingabe, gleiche Id — heute,
morgen und auf einer anderen Maschine.
"""
import uuid

import ifcopenshell.guid

# Ein eigener Namensraum. Ohne ihn koennte dieselbe CDE-Id in einem anderen
# Programm dieselbe GUID erzeugen — unwahrscheinlich, aber grundlos riskant.
NAMENSRAUM = uuid.uuid5(uuid.NAMESPACE_URL, "https://quagg-engineering.org/cde/ifc")


def _abgeleitet(*teile: str) -> str:
    """uuid5 ueber die Teile, komprimiert auf die 22 Zeichen des IFC-Formats.

    `ifcopenshell.guid.compress` erzeugt die Base64-Variante, die IFC verlangt:
    genau 22 Zeichen, erstes aus 0-3 (das erste Zeichen traegt nur 2 Bit). Der
    Vertragstest prueft beides an 50 Werten — der CARD/1-Schreiber in isyifc
    stolpert genau hier.
    """
    return ifcopenshell.guid.compress(uuid.uuid5(NAMENSRAUM, "|".join(teile)).hex)


def ersatz_guid(quell_sha: str, alte_guid: str) -> str:
    """Fuer den zweiten Traeger einer kollidierenden GlobalId.

    Der Quell-Hash geht mit ein: dieselbe Kollision aus derselben Datei liefert
    immer dieselbe Ersatz-Id, zwei verschiedene Dateien liefern verschiedene.
    Die alte Id verschwindet nicht — sie wandert in ein Merkmal am Bauteil.
    """
    return _abgeleitet("ersatz", quell_sha, alte_guid)


def guid_aus_cde_id(cde_id: str) -> str:
    """Fuer ein Bauteil, das die CDE selbst erzeugt hat.

    Stabil ueber Laeufe: derselbe Journaleintrag ergibt im naechsten Verbund
    dieselbe GlobalId. Genau das macht den Verbund wiederholbar — ein zweiter
    Export ist eine neue REVISION desselben Bauteils, kein neues Bauteil.
    """
    return _abgeleitet("cde", cde_id)


def ist_gueltig(guid: str) -> bool:
    """Was IFC von einem IfcGloballyUniqueId verlangt.

    22 Zeichen aus dem IFC-Base64-Alphabet, erstes aus 0-3. Wird vom Prueftor
    (V04) ueber jede erzeugte Datei gefahren.
    """
    if not isinstance(guid, str) or len(guid) != 22:
        return False
    if guid[0] not in "0123":
        return False
    erlaubt = set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$")
    return set(guid) <= erlaubt
