"""Fachliche Kategorien der CDE — an der richtigen HOEHE im IFC-Baum, nicht als Aufzaehlung.

Bis 2026-09-11 stand im Server-Verbundlauf zweimal `klasse == "IFCEARTHWORKSCUT"`.
Ein Untertyp oder eine andere Schreibweise waere still durchgefallen. Hier steht
die WURZEL; ob eine Klasse darunter liegt, beantwortet der Schema-Schnappschuss
(`schema.ist_untertyp`).

Spiegel von client/src/features/cde/services/Kategorien.js — der Test haelt die
Wurzeln zeilengleich (Muster test_bezugssysteme.py). Rein: der API-Server
importiert diese Datei, dort gibt es kein ifcopenshell.
"""
from . import schema as S

# Ein Aushub im Sinne des Erdbau-Dokuments: sein Wirt ist das Ur-Gelaende.
AUSHUB_WURZELN = ("IfcEarthworksCut",)


def ist_aushub(klasse) -> bool:
    """Liegt diese Klasse (gleich wie geschrieben) unter einer Aushub-Wurzel?"""
    return any(S.ist_untertyp(klasse, w) for w in AUSHUB_WURZELN)
