"""Bezugssysteme des deutschen Tiefbaus — welches ist es WIRKLICH?

DER ANLASS: der erste Verbund schrieb fest EPSG:25832 hinein und pruefte nur das
UTM32-Fenster. Das ENQUIER-Kanalnetz liegt aber in Gauss-Krueger Zone 2
(Rechtswert ~2 577 000), obwohl die Datei UTM32 behauptet. Ein Verbund damit
waere an der eigenen Pruefung gescheitert, OBWOHL er richtig war — und haette das
falsche System ins Modell geschrieben. Gefunden von der Nachbarsitzung, nicht
vom Test: das Bezugssystem kommt deshalb jetzt aus den Daten (oder dem Projekt),
nicht aus einer Konstante.

GESPIEGELT aus `client/src/features/cde/services/Koordinatensysteme.js` (SYSTEME).
Eine bewusste Doppelung: Python kann die JS-Tabelle nicht lesen, und die
Hausregel verbietet Querverknuepfungen; fachliche Doppelung ist der akzeptierte
Preis. Damit sie nicht still auseinanderlaeuft — so wie einst der
Wasserzeichen-Zwilling „ARCHIV"/„ARCHIVIERT" —, vergleicht
`tests/test_bezugssysteme.py` beide Tabellen Zeile fuer Zeile.

WAS HIER NICHT PASSIERT: nichts wird erfunden. Passt kein Fenster, heisst die
Antwort „nicht erkennbar" — nicht das naechstbeste System.

REIN: kein ifcopenshell. Diese Datei darf auch der API-Server importieren
(Produktions-venv), obwohl sie im IFC-Ordner liegt. Wer hier einen
ifcopenshell-Import einbaut, bricht den Server.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class System:
    epsg: str
    name: str
    ost: tuple[float, float]           # Fenster, in dem ein Rechtswert liegen MUSS
    projektion: str                    # fuer IfcProjectedCRS.MapProjection
    zone: str                          # fuer IfcProjectedCRS.MapZone
    datum: str                         # fuer IfcProjectedCRS.GeodeticDatum
    mehrdeutig: tuple[str, ...] = ()   # am Rechtswert nicht unterscheidbar


# Reihenfolge wie in der JS-Tabelle — sie entscheidet bei Mehrdeutigkeit, wer
# „erster Treffer" ist (UTM32 vor UTM33).
SYSTEME: tuple[System, ...] = (
    System("EPSG:31466", "Gauß-Krüger Zone 2 (DHDN)", (2_400_000.0, 2_600_000.0), "Gauss-Krueger", "2", "DHDN"),
    System("EPSG:31467", "Gauß-Krüger Zone 3 (DHDN)", (3_400_000.0, 3_600_000.0), "Gauss-Krueger", "3", "DHDN"),
    System("EPSG:31468", "Gauß-Krüger Zone 4 (DHDN)", (4_400_000.0, 4_600_000.0), "Gauss-Krueger", "4", "DHDN"),
    System("EPSG:31469", "Gauß-Krüger Zone 5 (DHDN)", (5_400_000.0, 5_600_000.0), "Gauss-Krueger", "5", "DHDN"),
    System("EPSG:25832", "UTM Zone 32N (ETRS89)", (166_000.0, 834_000.0), "UTM", "32N", "ETRS89",
           ("EPSG:25833",)),
    System("EPSG:25833", "UTM Zone 33N (ETRS89)", (166_000.0, 834_000.0), "UTM", "33N", "ETRS89",
           ("EPSG:25832",)),
)

# Das Hochwert-Band, in dem GK- UND UTM-Hochwerte in Deutschland liegen.
#
# Die JS-Tabelle prueft den Hochwert nicht — sie ETIKETTIERT nur. Hier wird ein
# Verbund darauf gebaut, und ein falsches „passt" kostet mehr: ohne Untergrenze
# kaeme ein lokal platziertes Modell (Hochwert ~400) durch, und die Pruefung
# faende nur noch den halben Fehler.
NORD = (5_000_000.0, 6_200_000.0)

_NACH_EPSG = {s.epsg: s for s in SYSTEME}


def system_nach(epsg) -> System | None:
    """Ein System ueber seinen EPSG-Code. `None`, wenn wir es nicht kennen."""
    return _NACH_EPSG.get(str(epsg or "").strip().upper())


def erkenne(ost, nord=None) -> list[str]:
    """Alle Systeme, in deren Fenster der Punkt liegt — in Tabellenreihenfolge.

    `[]` heisst „nicht erkennbar". UTM32 und UTM33 kommen immer ZUSAMMEN: am
    Rechtswert sind sie nicht zu trennen, und das wird nicht versteckt.
    """
    try:
        o = float(ost)
    except (TypeError, ValueError):
        return []
    if nord is not None:
        try:
            n = float(nord)
        except (TypeError, ValueError):
            return []
        if not NORD[0] <= n <= NORD[1]:
            return []
    return [s.epsg for s in SYSTEME if s.ost[0] <= o <= s.ost[1]]


def erkenne_huelle(huelle: dict | None) -> list[str]:
    """`erkenne` fuer die Huelle eines Modells — gemessen am GROESSTEN Wert.

    Das Maximum, weil jede IFC-Datei neben Weltkoordinaten auch lokale Punkte
    enthaelt (Profile, Richtungen, relative Platzierungen), deren Kleinstwert
    nahe 0 liegt. Das Minimum schluege bei jeder Datei an.
    """
    if not huelle:
        return []
    return erkenne(huelle["max"][0], huelle["max"][1])


def fenster_passt(huelle: dict | None, epsg) -> bool | None:
    """Liegt das Modell im Fenster dieses Systems?

    True/False, wenn pruefbar. `None`, wenn das System unbekannt ist — dann
    wird NICHT geraten, sondern „ungeprueft" gemeldet (und das zaehlt im
    Prueftor als nicht bestanden).
    """
    system = system_nach(epsg)
    if system is None:
        return None
    return system.epsg in erkenne_huelle(huelle)


def gleichwertig(a, b) -> bool:
    """Sind zwei Angaben am Rechtswert ununterscheidbar (gleich oder UTM32/33)?"""
    sa, sb = system_nach(a), system_nach(b)
    if sa is None or sb is None:
        return False
    return sa.epsg == sb.epsg or sb.epsg in sa.mehrdeutig
