"""Mehrere Fachmodelle zu EINER konformen IFC4X3_ADD2-Datei.

DIE AUFGABE IST NICHT DAS ANEINANDERHAENGEN. Die Lieferungen der Beteiligten
kommen aus verschiedenen Programmen, und sie sind sich in nichts einig:

  * VERSCHIEDENE SCHEMATA. BricsCAD liefert IFC4X3_ADD2, ProVI liefert IFC2X3.
    In eine STEP-Datei passt genau EIN Schema (FILE_SCHEMA). Und
    `file.add()` verweigert den Dienst ueber Schemagrenzen hinweg — gemessen,
    nicht vermutet. Die Migration ist deshalb Vorbedingung, nicht Kuer.

  * VERSCHIEDENE EINHEITEN. Zwei Dateien DESSELBEN Programms aus DEMSELBEN
    Projekt: eine in Metern, eine in Millimetern. IFC erlaubt nur eine
    Einheitenzuweisung je Projekt. Ohne Umrechnung liegt ein Modell um Faktor
    1000 daneben — und die Datei oeffnet sich klaglos. Das ist die
    gefaehrlichste Sorte Fehler: kein Absturz, nur eine falsche Aussage.

  * UNZUVERLAESSIGE GEOREFERENZIERUNG. Die BricsCAD-Lieferungen tragen gar
    keine. Die isyifc-Exporte (A64, ENQUIER) tragen eine — doppelt:
    Landeskoordinaten in der Geometrie UND denselben Ursprung noch einmal in
    der IfcMapConversion. ENQUIER deklariert obendrein UTM32 und liegt in
    Gauss-Krueger Zone 2. Deshalb wird hier nichts geglaubt: welches System
    gilt und ob eine Verschiebung anzuwenden ist, entscheidet, welche Lesart
    in ein bekanntes Fenster faellt (bezugssysteme.py). Was dabei angenommen
    wurde, steht als Annahme in der Datei, nicht als Tatsache.

DIE REIHENFOLGE IST TRAGEND: erst das Zielgeruest bauen, dann hineinhaengen.
`ifcpatch MergeProjects` geht andersherum vor und hinterlaesst laut eigener
Dokumentation doppelte Hierarchien (zwei Sites, zwei Buildings). Genau das
Aufraeumen danach ist hier der Kern — deshalb bauen wir das Geruest selbst.

Rein: keine HTTP-Kenntnis, kein Dateisystem ausserhalb der uebergebenen Pfade.
Der Bericht ist ein dict und wird vom Aufrufer verwertet.
"""
import collections
import math
import time
from dataclasses import dataclass, field
from pathlib import Path

import ifcopenshell
import ifcopenshell.util.schema
import ifcopenshell.util.unit

from . import FASSUNG, WERKZEUG
from . import bezugssysteme as bz
from . import guids
from . import herkunft as H
# Das Zielschema steht EINMAL: in schema.py (Fassung != Familie, siehe dort und
# README). Hier weitergereicht, weil Tests und Aufrufer es von hier holen.
from .schema import ZIELFAMILIE, ZIELSCHEMA  # noqa: F401

# Der Migrator kennt GENAU zwei Paare (im Vertragstest festgenagelt). Einen
# direkten Weg IFC2X3 -> IFC4X3 gibt es nicht, deshalb die Kette.
MIGRATIONSWEG = {
    "IFC2X3": ["IFC4", "IFC4X3"],
    "IFC4": ["IFC4X3"],
    "IFC4X1": ["IFC4X3"],
    "IFC4X3": [],
}

# Die Fenster der Bezugssysteme stehen in bezugssysteme.py. Der erste Entwurf
# hatte hier fest UTM32 — ein Verbund in Gauss-Krueger Zone 2 (ENQUIER) waere an
# der eigenen Pruefung gescheitert, obwohl er richtig war, und haette das falsche
# System in die Datei geschrieben.

# Merkmalssaetze bekommen das Praefix `Quagg_`. `Pset_` ist bSI-reserviert;
# eigene Saetze dort hineinzuschreiben ist ein Konformitaetsverstoss. Bis
# 2026-09-11 hiess die Konstante des Gruppen-Satzes hier PSET_HERKUNFT und trug
# „Quagg_Fachmodell" — neben `Quagg_Herkunft` am Element lief der Name
# auseinander. Beide Namen stehen jetzt in herkunft.py.
PSET_FACHMODELL = H.PSET_FACHMODELL
PSET_GEOREF = "Quagg_Georeferenz"


class VerbundUnmoeglich(ValueError):
    """Die Quellen lassen keinen RICHTIGEN Verbund zu.

    Verschiedene Bezugssysteme, keine Landeskoordinaten, ein unbekanntes System.
    Kein Programmfehler, sondern ein Urteil ueber die Daten — der Lauf meldet es
    als „abgelehnt", mit dem Grund, statt die Modelle still uebereinanderzulegen.
    """


@dataclass
class Quelle:
    """Ein Fachmodell, wie es aus dem CDE-Register kommt."""
    pfad: Path
    name: str = ""
    sha256: str = ""
    revision: int | None = None
    status: str = ""

    def __post_init__(self):
        self.pfad = Path(self.pfad)
        if not self.name:
            self.name = self.pfad.name
        if not self.sha256:
            # Ohne Registereintrag (headless-Lauf) taugt der Name als Schluessel
            # fuer die abgeleiteten Ersatz-Ids — er muss nur STABIL sein.
            self.sha256 = f"name:{self.pfad.name}"


@dataclass
class Befund:
    """Was ueber eine Quelle gemessen wurde. Wandert in den Bericht."""
    name: str
    schema: str = ""
    einheit_faktor: float = 1.0
    entitaeten_vorher: int = 0
    entitaeten_nachher: int = 0
    produkte: int = 0
    uebernommen: int = 0
    verworfen: int = 0
    verworfen_klassen: dict = field(default_factory=dict)
    huelle_vorher: dict | None = None
    huelle_nachher: dict | None = None
    guid_ersetzt: int = 0
    # ZWEI VERSCHIEDENE ZAHLEN, absichtlich getrennt:
    #   gerettet    — in der Quelle vor der Migration entschaerfte Stile
    #   uebernommen — im Verbund tatsaechlich angekommene Darstellungselemente
    # Der erste Lauf meldete `gerettet=37` und hatte trotzdem NULL Stile im
    # Ergebnis. Eine Zahl, die den Erfolg des Zwischenschritts misst, sagt
    # nichts ueber das Ergebnis — deshalb steht die zweite daneben.
    stile_gerettet: int = 0
    stile_uebernommen: int = 0
    # Die Lage: was deklariert war, was die Koordinaten sagen, und ob eine
    # MapConversion angewandt wurde. Alle drei koennen auseinanderfallen — bei
    # ENQUIER tun es alle drei.
    crs_deklariert: str | None = None
    crs_erkannt: list = field(default_factory=list)
    mapconversion: dict | None = None
    mapconversion_angewandt: bool = False
    warnungen: list = field(default_factory=list)
    # Die Sites der Lieferung, die in der des Verbunds aufgingen (`_site_aufloesen`).
    sites_aufgeloest: list = field(default_factory=list)


# ── Messen ──────────────────────────────────────────────────────────────────

def anzahl(datei) -> int:
    """Wieviele Entitaeten stehen in der Datei?

    `len(datei)` gibt es in ifcopenshell 0.8.5 nicht — der Modelltyp ist nicht
    laengenfaehig. Iterieren geht, und bei sechsstelligen Zahlen kostet es
    Bruchteile einer Sekunde.
    """
    return sum(1 for _ in datei)


def by_type_weich(datei, typ: str) -> list:
    """`by_type` fuer Typen, die es im Schema der Datei vielleicht gar nicht gibt.

    `datei.by_type('IfcCartesianPointList3D')` WIRFT gegen eine IFC2X3-Datei —
    den Typ gibt es dort nicht (Tessellation kam erst mit IFC4). Beim Verbund
    laufen aber beide Schemata durch dieselbe Messung. Ein unbekannter Typ ist
    hier kein Fehler, sondern eine Aussage: davon gibt es null.
    """
    try:
        return datei.by_type(typ)
    except RuntimeError:
        return []


def huelle(datei) -> dict | None:
    """Die Ausdehnung ueber ALLE Koordinaten der Datei.

    Bewusst NICHT ueber den Geometriekern (`geom.iterator`): der braucht
    Sekunden je Modell und wuerde hier nur zeigen, was die rohen Punkte schon
    sagen. Diese Huelle hat genau eine Aufgabe — den Einheitenfehler sichtbar
    machen. Ein Modell in Millimetern liegt um Faktor 1000 daneben, und das
    sieht man an jeder einzelnen Koordinate.

    IFC4X3 legt Punkte auch in `IfcCartesianPointList3D` ab (Tessellation);
    wer nur `IfcCartesianPoint` zaehlt, sieht bei tesselierten Modellen nichts.
    """
    mn = [math.inf] * 3
    mx = [-math.inf] * 3
    gesehen = 0

    def merke(koord):
        nonlocal gesehen
        for i in range(min(3, len(koord))):
            v = koord[i]
            if v is None:
                continue
            if v < mn[i]:
                mn[i] = v
            if v > mx[i]:
                mx[i] = v
        gesehen += 1

    for p in by_type_weich(datei, "IfcCartesianPoint"):
        merke(p.Coordinates)
    for liste in by_type_weich(datei, "IfcCartesianPointList3D"):
        for koord in liste.CoordList:
            merke(koord)

    if not gesehen or math.isinf(mn[0]):
        return None
    return {"min": [round(v, 4) for v in mn], "max": [round(v, 4) for v in mx], "punkte": gesehen}


def weltbezug_plausibel(h: dict | None, crs: str = "EPSG:25832") -> bool:
    """Liegt die GROESSTE Koordinate im Fenster dieses Bezugssystems?

    Gemessen wird das Maximum, nicht das Minimum. Der erste Anlauf pruefte das
    Minimum und schlug bei JEDER Datei an: eine IFC-Datei enthaelt neben den
    Weltkoordinaten immer auch lokale Punkte — Profilpunkte, Richtungen,
    relative Platzierungen —, deren Kleinstwert naturgemaess nahe 0 liegt.

    Das Maximum misst genau die Groesse, um die es geht: 410 936 420 (Millimeter,
    nicht umgerechnet) faellt aus jedem Fenster, 410 936 (Meter) in UTM,
    2 577 078 in Gauss-Krueger 2, und 412 (lokal) in keins.

    Ein unbekanntes System ergibt False. Wer „nicht pruefbar" von „passt nicht"
    unterscheiden muss (das Prueftor), fragt `bezugssysteme.fenster_passt`.
    """
    return bz.fenster_passt(h, crs) is True


# ── Normalisieren ───────────────────────────────────────────────────────────

def _stile_retten(datei, befund: Befund) -> None:
    """IfcPresentationStyleAssignment ueberlebt den Weg nach IFC4X3 nicht.

    Gemessen am ProVI-Modell: der Schritt IFC4 -> IFC4X3 verliert 37
    `IfcPresentationStyleAssignment` und die 37 `IfcStyledItem`, die darauf
    zeigten — das Modell kommt FARBLOS an. Kein Bauteil geht verloren, aber
    ein Verbund, in dem eine Lieferung grau ist, wird nicht benutzt.

    Der Ausweg steht im Schema selbst: seit IFC4 darf `IfcStyledItem.Styles`
    direkt auf den `IfcPresentationStyle` zeigen; die Zuweisung dazwischen ist
    abgekuendigt. Wir loesen sie also auf, BEVOR migriert wird.
    """
    if not by_type_weich(datei, "IfcPresentationStyleAssignment"):
        return                                  # nichts zu retten (oder Schema kennt den Typ nicht)
    gerettet = 0
    for stil in by_type_weich(datei, "IfcStyledItem"):
        neu = []
        geaendert = False
        for eintrag in (stil.Styles or []):
            if eintrag.is_a("IfcPresentationStyleAssignment"):
                neu.extend(eintrag.Styles or [])
                geaendert = True
            else:
                neu.append(eintrag)
        if geaendert and neu:
            stil.Styles = neu
            gerettet += 1
    befund.stile_gerettet = gerettet


def _migriere(datei, befund: Befund):
    """Ueber die Kette ins Zielschema. Zaehlt, was dabei still wegfaellt.

    Der Migrator laesst Instanzen ohne Ziel-Aequivalent kommentarlos fallen.
    Ohne diese Zaehlung verschwindet Material aus einer Lieferung, ohne dass es
    jemand erfaehrt — genau die Sorte Befund, die ein Bericht tragen muss.
    """
    weg = MIGRATIONSWEG.get(datei.schema)
    if weg is None:
        befund.warnungen.append(f"unbekanntes Schema {datei.schema!r} — Migration nicht versucht")
        return datei
    if not weg:
        return datei

    ausfaelle = collections.Counter()
    for schritt in weg:
        if schritt == ZIELFAMILIE:
            # Nur der LETZTE Schritt schreibt die Fassung; Zwischenstaende
            # bleiben in der Familie.
            neu = ifcopenshell.file(schema=ZIELSCHEMA)
        else:
            neu = ifcopenshell.file(schema=schritt)
        if schritt == ZIELFAMILIE:
            _stile_retten(datei, befund)
        wanderer = ifcopenshell.util.schema.Migrator()
        for inst in datei:
            try:
                wanderer.migrate(inst, neu)
            except Exception as fehler:          # noqa: BLE001 — wir WOLLEN jeden Ausfall sehen
                ausfaelle[f"{inst.is_a()}: {type(fehler).__name__}"] += 1
        datei = neu

    befund.verworfen = sum(ausfaelle.values())
    befund.verworfen_klassen = dict(ausfaelle.most_common(20))
    return datei


def _richtung(abszisse, ordinate) -> tuple[float, float]:
    """cos/sin der Drehung aus XAxisAbscissa/XAxisOrdinate (fehlend = keine Drehung)."""
    a = 1.0 if abszisse is None else float(abszisse)
    o = 0.0 if ordinate is None else float(ordinate)
    laenge = math.hypot(a, o) or 1.0
    return a / laenge, o / laenge


def _mapconversion_anwenden(datei, e, n, h, cos, sin, massstab) -> int:
    """Die Verschiebung der Quelle in ihre obersten Platzierungen einrechnen.

    Nur die OBERSTEN (`PlacementRelTo = $`): alles darunter ist relativ und
    wandert mit. Neue Punkte statt geaenderter — Exporteure teilen den
    Ursprungspunkt gern zwischen vielen Instanzen, und ihn zu verschieben
    verschoebe alles, was ihn mitbenutzt.
    """
    if massstab is not None and abs(float(massstab) - 1.0) > 1e-9:
        raise VerbundUnmoeglich(
            f"IfcMapConversion mit Massstab {massstab} — die Geometrie umzurechnen "
            "beherrscht der Verbund noch nicht, und ohne es laege das Modell verzerrt")
    verschoben = 0
    for platz in datei.by_type("IfcLocalPlacement"):
        if platz.PlacementRelTo is not None:
            continue
        rel = platz.RelativePlacement
        if rel is None or not rel.is_a("IfcAxis2Placement3D"):
            continue
        x, y, z = (list(rel.Location.Coordinates) + [0.0, 0.0, 0.0])[:3]
        rel.Location = datei.create_entity(
            "IfcCartesianPoint", Coordinates=(cos * x - sin * y + e, sin * x + cos * y + n, z + h))
        if abs(sin) > 1e-12:
            for feld, vorgabe in (("RefDirection", (1.0, 0.0, 0.0)), ("Axis", (0.0, 0.0, 1.0))):
                alt = getattr(rel, feld)
                r = ((list(alt.DirectionRatios) if alt is not None else list(vorgabe)) + [0.0] * 3)[:3]
                setattr(rel, feld, datei.create_entity(
                    "IfcDirection",
                    DirectionRatios=(cos * r[0] - sin * r[1], sin * r[0] + cos * r[1], r[2])))
        verschoben += 1
    return verschoben


def _lage_klaeren(datei, befund: Befund) -> None:
    """Wo liegt diese Quelle wirklich — und gilt ihre MapConversion?

    NICHTS WIRD GEGLAUBT, weder das deklarierte System noch die Verschiebung.
    Gemessen am 2026-09-10 an den drei georeferenzierten Dateien, die es gibt:
    alle drei (A64, ENQUIER, der ENQUIER-Erdkoerper) tragen Landeskoordinaten
    IN der Geometrie UND denselben Ursprung noch einmal in der IfcMapConversion.
    Ein Betrachter, der die Verschiebung anwendet, legt ENQUIER bei Rechtswert
    ~5,15 Mio. ab. ENQUIER deklariert dazu UTM32 und liegt in Gauss-Krueger 2.

    Entschieden wird danach, welche LESART in ein bekanntes Fenster faellt:

      roh passt, verschoben nicht    -> schon Landeskoordinaten; die Verschiebung
                                        wird NICHT angewandt (doppelt georeferenziert)
      verschoben passt, roh nicht    -> lokale Koordinaten; anwenden — der
                                        Normalfall nach IFC4
      beide passen (kleiner Versatz) -> nach IFC-Regel anwenden, aber sagen
      keine passt                    -> keine Landeskoordinaten; `_bezug_pruefen`
                                        lehnt ab

    Gilt ein anderes System als deklariert, gilt das erkannte — wie in der CDE
    (Koordinatensysteme.js: „mit dem gerechnet"). Gesagt wird es trotzdem.

    Bekannte Grenze: eine MILLIMETER-Datei mit MapConversion. Deren Versatz steht
    in den Einheiten des Zielsystems, und ob `convert_file_length_units` ihn
    mitskaliert, ist ungeprueft — keine der vorhandenen Dateien hat beides.
    """
    roh = huelle(datei)
    roh_erkannt = bz.erkenne_huelle(roh)
    deklariert = [c.Name for c in by_type_weich(datei, "IfcProjectedCRS") if c.Name]
    befund.crs_deklariert = deklariert[0] if deklariert else None

    umrechnungen = by_type_weich(datei, "IfcMapConversion")
    mc = umrechnungen[0] if umrechnungen else None
    e = n = h = 0.0
    cos, sin = 1.0, 0.0
    if mc is not None:
        e, n, h = float(mc.Eastings or 0.0), float(mc.Northings or 0.0), float(mc.OrthogonalHeight or 0.0)
        cos, sin = _richtung(mc.XAxisAbscissa, mc.XAxisOrdinate)
        befund.mapconversion = {"eastings": e, "northings": n, "hoehe": h,
                                "x_abszisse": mc.XAxisAbscissa, "x_ordinate": mc.XAxisOrdinate,
                                "massstab": mc.Scale}

    if mc is None or (abs(e) < 1e-6 and abs(n) < 1e-6 and abs(h) < 1e-6 and abs(sin) < 1e-12):
        befund.crs_erkannt = roh_erkannt
    else:
        x, y = (roh["max"][0], roh["max"][1]) if roh else (0.0, 0.0)
        vx, vy = cos * x - sin * y + e, sin * x + cos * y + n
        verschoben_erkannt = bz.erkenne(vx, vy)
        if roh_erkannt and not verschoben_erkannt:
            befund.warnungen.append(
                f"IfcMapConversion (E={e:.0f}, N={n:.0f}) widerspricht den Koordinaten: sie "
                f"liegen schon in Landeskoordinaten ({roh_erkannt[0]}); angewandt laege das "
                f"Modell bei {vx:.0f} / {vy:.0f}, ausserhalb jedes Systems. Die Verschiebung "
                "wird NICHT angewandt — der Exporteur hat doppelt georeferenziert.")
            befund.crs_erkannt = roh_erkannt
        elif verschoben_erkannt:
            if roh_erkannt:
                befund.warnungen.append(
                    "Koordinaten passen roh UND verschoben in ein System — nach IFC-Regel wird "
                    "die IfcMapConversion angewandt; bitte die Lage pruefen")
            _mapconversion_anwenden(datei, e, n, h, cos, sin, mc.Scale)
            befund.mapconversion_angewandt = True
            befund.crs_erkannt = verschoben_erkannt
        else:
            befund.crs_erkannt = []

    if befund.crs_deklariert and befund.crs_erkannt and not any(
            bz.gleichwertig(befund.crs_deklariert, x) for x in befund.crs_erkannt):
        befund.warnungen.append(
            f"deklariert {befund.crs_deklariert}, die Koordinaten liegen aber in "
            f"{befund.crs_erkannt[0]} — es gilt, was die Koordinaten sagen")


def normalisiere(quelle: Quelle) -> tuple[object, Befund]:
    """Eine Quelle auf Zielschema und Meter bringen. Misst dabei.

    Reihenfolge: erst Einheiten, dann Schema. Die Einheitenzuweisung ist im
    Ursprungsschema wohlgeformt; sie danach anzufassen hiesse, auf einem
    migrierten Stand zu rechnen, den niemand geprueft hat.
    """
    datei = ifcopenshell.open(quelle.pfad)
    befund = Befund(name=quelle.name, schema=datei.schema_identifier)
    befund.entitaeten_vorher = anzahl(datei)
    befund.produkte = len(datei.by_type("IfcProduct"))
    befund.huelle_vorher = huelle(datei)

    faktor = ifcopenshell.util.unit.calculate_unit_scale(datei)
    befund.einheit_faktor = faktor
    if abs(faktor - 1.0) > 1e-12:
        # `convert_file_length_units` gibt eine NEUE Datei zurueck.
        datei = ifcopenshell.util.unit.convert_file_length_units(datei, "METER")

    datei = _migriere(datei, befund)
    # Nach Einheit und Schema: erst jetzt stehen Koordinaten in Metern und die
    # Georeferenz-Typen im Zielschema.
    _lage_klaeren(datei, befund)

    befund.entitaeten_nachher = anzahl(datei)
    befund.huelle_nachher = huelle(datei)
    return datei, befund


# ── Zielgeruest ─────────────────────────────────────────────────────────────

def _guid(*teile: str) -> str:
    return guids._abgeleitet("verbund", *teile)


# Wer die Anwendung entwickelt hat (IfcApplication) — und ohne Angabe auch die
# Organisation dessen, der ausgibt. Seit S4 neu sind das zwei Rollen.
ENTWICKLER = "quagg engineering"


def schreibe_kopf(f, *, dateiname: str, bearbeiter: str = "", firma: str = ENTWICKLER) -> None:
    """Den STEP-Kopf setzen — vor allem die MVD-Angabe.

    ifcopenshell schreibt von sich aus `ViewDefinition [CoordinationView]`.
    Das ist der MVD-Name aus IFC2x3; in einer IFC4X3-Datei ist er schlicht
    falsch. Genau diese Sorte Angabe steht auch im isyifc-Schreiber
    (`IFC4Precast` als angebliche IFC4-MVD) — eine Behauptung, die niemand
    prueft und die jeder Empfaenger glaubt.

    Fuer IFC4X3 gibt es KEINE verabschiedete MVD. Die IFC4.3-Dokumentation
    nennt dafuer den Platzhalter `notYetAssigned`. Der sagt die Wahrheit: das
    Modell ist schemakonform, aber es behauptet keine Konformitaet zu einer
    Austauschsicht, die wir nicht geprueft haben.

    Die Attributnamen sind Stellungen im STEP-Kopf, nicht Eigenschaften:
    FILE_DESCRIPTION(description, implementation_level),
    FILE_NAME(name, time_stamp, author, organization, preprocessor_version,
              originating_system, authorization).
    """
    kopf = f.wrapped_data.header()
    beschreibung = kopf.file_description_py()
    name = kopf.file_name_py()
    beschreibung.setArgumentAsAggregateOfString(0, ["ViewDefinition [notYetAssigned]"])
    name.setArgumentAsString(0, dateiname)
    name.setArgumentAsAggregateOfString(2, [bearbeiter or "CDE"])
    name.setArgumentAsAggregateOfString(3, [firma])
    name.setArgumentAsString(5, f"{WERKZEUG} Verbundexport {FASSUNG}")
    name.setArgumentAsString(6, "None")


def zielgeruest(projektname: str, *, crs: str | None, zone: str | None = None,
                bearbeiter: str = "", firma: str = "", schluessel: str = "verbund",
                crs_herkunft: str = "Angabe des Aufrufers"):
    """Das leere, konforme Geruest, in das die Lieferungen hineinwandern.

    Genau ein IfcProject, genau eine Einheitenzuweisung, genau ein
    Model-Kontext. Das sind keine Formalien — es sind die drei Dinge, die IFC
    nur einmal je Datei zulaesst und an denen ein zusammengeworfener Verbund
    als Erstes scheitert.

    Die GlobalIds sind ABGELEITET, nicht gewuerfelt: derselbe Satz ergibt
    morgen dasselbe Geruest, und ein zweiter Verbund ist eine Revision des
    ersten statt eines Fremdlings.

    `bearbeiter` und `firma` (Fahrplan Klare Ablaeufe, S4 neu): wer die Datei
    ausgibt und fuer welche Organisation — aus dem Ausgeben-Dialog. Ohne Angabe
    wie bisher: der Anmeldename und quagg engineering.
    """
    f = ifcopenshell.file(schema=ZIELSCHEMA)
    firma = (firma or "").strip() or ENTWICKLER
    schreibe_kopf(f, dateiname=f"{projektname}.ifc", bearbeiter=bearbeiter, firma=firma)

    person = f.create_entity("IfcPerson", FamilyName=bearbeiter or "CDE")
    entwickler = f.create_entity("IfcOrganization", Name=ENTWICKLER)
    # Wer ausgibt, arbeitet vielleicht fuer ein anderes Buero als das, das die
    # Anwendung entwickelt hat — zwei Rollen, zwei Organisationen.
    organisation = entwickler if firma == ENTWICKLER else f.create_entity("IfcOrganization", Name=firma)
    anwendung = f.create_entity("IfcApplication", ApplicationDeveloper=entwickler,
                                Version=FASSUNG, ApplicationFullName=f"{WERKZEUG} Verbundexport",
                                ApplicationIdentifier="quagg-cde")
    wer = f.create_entity("IfcPersonAndOrganization", ThePerson=person, TheOrganization=organisation)
    # `LastModifiedDate` ist bei ChangeAction ADDED PFLICHT — die Where-Rule
    # `IfcOwnerHistory.CorrectChangeAction` verlangt es, und das Prueftor hat
    # genau das beim ersten Lauf beanstandet. Die Datei entsteht in einem Zug,
    # also ist Aenderungszeit = Erzeugungszeit.
    jetzt = int(time.time())
    besitz = f.create_entity("IfcOwnerHistory", OwningUser=wer, OwningApplication=anwendung,
                             ChangeAction="ADDED", CreationDate=jetzt, LastModifiedDate=jetzt,
                             LastModifyingUser=wer, LastModifyingApplication=anwendung)

    laenge = f.create_entity("IfcSIUnit", UnitType="LENGTHUNIT", Name="METRE")
    flaeche = f.create_entity("IfcSIUnit", UnitType="AREAUNIT", Name="SQUARE_METRE")
    volumen = f.create_entity("IfcSIUnit", UnitType="VOLUMEUNIT", Name="CUBIC_METRE")
    winkel = f.create_entity("IfcSIUnit", UnitType="PLANEANGLEUNIT", Name="RADIAN")
    einheiten = f.create_entity("IfcUnitAssignment", Units=[laenge, flaeche, volumen, winkel])

    ursprung = f.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0))
    hoch = f.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0))
    ost = f.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0))
    wcs = f.create_entity("IfcAxis2Placement3D", Location=ursprung, Axis=hoch, RefDirection=ost)
    nord = f.create_entity("IfcDirection", DirectionRatios=(0.0, 1.0))

    kontext = f.create_entity("IfcGeometricRepresentationContext", ContextType="Model",
                              CoordinateSpaceDimension=3, Precision=1e-5,
                              WorldCoordinateSystem=wcs, TrueNorth=nord)
    koerper = f.create_entity("IfcGeometricRepresentationSubContext",
                              ContextIdentifier="Body", ContextType="Model",
                              ParentContext=kontext, TargetView="MODEL_VIEW")
    achse = f.create_entity("IfcGeometricRepresentationSubContext",
                            ContextIdentifier="Axis", ContextType="Model",
                            ParentContext=kontext, TargetView="GRAPH_VIEW")

    projekt = f.create_entity("IfcProject", GlobalId=_guid(schluessel, "projekt"),
                              OwnerHistory=besitz, Name=projektname,
                              Description="Verbundmodell aus mehreren Fachmodellen",
                              RepresentationContexts=[kontext], UnitsInContext=einheiten)

    ort_platz = f.create_entity("IfcLocalPlacement",
                                RelativePlacement=f.create_entity(
                                    "IfcAxis2Placement3D",
                                    Location=f.create_entity("IfcCartesianPoint",
                                                             Coordinates=(0.0, 0.0, 0.0))))
    ort = f.create_entity("IfcSite", GlobalId=_guid(schluessel, "site"), OwnerHistory=besitz,
                          Name=projektname, ObjectPlacement=ort_platz,
                          CompositionType="ELEMENT")
    f.create_entity("IfcRelAggregates", GlobalId=_guid(schluessel, "rel-projekt-site"),
                    OwnerHistory=besitz, RelatingObject=projekt, RelatedObjects=[ort])

    geruest = {"datei": f, "projekt": projekt, "site": ort, "besitz": besitz,
               "kontext": kontext, "koerper": koerper, "achse": achse,
               "laenge": laenge, "schluessel": schluessel, "crs": None}
    # `crs` ist PFLICHT und hat bewusst keine Vorgabe mehr: die alte Vorgabe
    # EPSG:25832 war genau der Fehler, der ENQUIER falsch etikettiert haette.
    # `None` heisst „noch offen" — der Verbund setzt es, wenn er die Quellen
    # gemessen hat.
    if crs is not None:
        georeferenz_setzen(geruest, crs, herkunft=crs_herkunft, zone=zone)
    return geruest


def _unbekannt(crs) -> str:
    return (f"Bezugssystem {crs!r} ist unbekannt — bekannt sind "
            f"{', '.join(s.epsg for s in bz.SYSTEME)}; bitte in bezugssysteme.py ergaenzen, "
            "nicht raten")


def georeferenz_setzen(geruest: dict, crs: str, *, herkunft: str, mehrdeutig=(),
                       zone: str | None = None) -> None:
    """IfcProjectedCRS + IfcMapConversion + die Aussage, woher das System kommt.

    Der Versatz ist 0: die Geometrie im Verbund traegt Landeskoordinaten (die der
    Quellen, oder nach angewandter MapConversion). CRS und MapConversion muessen
    trotzdem dastehen — sonst weiss ein Empfaenger nicht, was die Zahlen bedeuten.

    `herkunft` landet im Merkmal `Quagg_Georeferenz.Herkunft`: war das System
    eine Projektangabe, von einer Quelle bestaetigt, oder nur an den Koordinaten
    erkannt? Das Dritte ist eine Annahme und wird so genannt.
    """
    system = bz.system_nach(crs)
    if system is None:
        raise VerbundUnmoeglich(_unbekannt(crs))
    if geruest.get("crs"):
        raise ValueError(f"Georeferenz ist schon gesetzt ({geruest['crs']})")
    f = geruest["datei"]
    projiziert = f.create_entity("IfcProjectedCRS", Name=system.epsg, Description=system.name,
                                 GeodeticDatum=system.datum, MapProjection=system.projektion,
                                 MapZone=zone or system.zone, MapUnit=geruest["laenge"])
    f.create_entity("IfcMapConversion", SourceCRS=geruest["kontext"], TargetCRS=projiziert,
                    Eastings=0.0, Northings=0.0, OrthogonalHeight=0.0, Scale=1.0)
    _merkmale(f, geruest["besitz"], geruest["site"], PSET_GEOREF, {
        "CRS": system.epsg,
        "Name": system.name,
        "Zone": zone or system.zone,
        "Herkunft": herkunft,
        "Mehrdeutig": ", ".join(mehrdeutig) or None,
    }, schluessel=geruest["schluessel"])
    geruest["crs"] = system.epsg


def _merkmale(f, besitz, objekt, satzname: str, werte: dict, *, schluessel: str = ""):
    """Einen Merkmalssatz an ein Objekt haengen.

    Praefix `Quagg_`: `Pset_` ist bSI-reserviert, eigene Saetze gehoeren dort
    nicht hinein.
    """
    eigenschaften = [
        f.create_entity("IfcPropertySingleValue", Name=str(k),
                        NominalValue=f.create_entity("IfcText", str(v)))
        for k, v in werte.items() if v is not None
    ]
    satz = f.create_entity("IfcPropertySet", GlobalId=_guid(schluessel, satzname, str(objekt.GlobalId)),
                           OwnerHistory=besitz, Name=satzname, HasProperties=eigenschaften)
    f.create_entity("IfcRelDefinesByProperties",
                    GlobalId=_guid(schluessel, satzname, "rel", str(objekt.GlobalId)),
                    OwnerHistory=besitz, RelatedObjects=[objekt], RelatingPropertyDefinition=satz)
    return satz


# ── Uebernehmen ─────────────────────────────────────────────────────────────

def _ist_raum(inst) -> bool:
    """Raumelement (Site, Building, Storey, Facility, ...) oder Bauteil?

    IFC4X3 fuehrt `IfcSpatialElement` als Oberbegriff; `IfcSpatialStructureElement`
    ist der aeltere, engere. Beide fragen, damit migrierte IFC2X3-Staende
    genauso erkannt werden.
    """
    return inst.is_a("IfcSpatialElement") or inst.is_a("IfcSpatialStructureElement")


def _guid_kollisionen_entschaerfen(quelle, bekannt: set, quell_sha: str) -> list:
    """Doppelte GlobalIds VOR dem Kopieren umbenennen.

    Zwei Fachmodelle koennen dieselbe GlobalId tragen — derselbe Ursprungsstand,
    zweimal exportiert, oder ein Programm, das beim Kopieren die Id mitnimmt. Im
    Verbund darf sie nur einmal vorkommen.

    Umbenannt wird in der QUELLE, und das ist unbedenklich: sie ist ein
    Arbeitsstand im Speicher (aus Migration oder Einheitenumrechnung, sonst ein
    frisch geoeffneter Lesestand) und wird nie zurueckgeschrieben.

    Die alte Id geht nicht verloren — sie wandert als Merkmal ans Bauteil, damit
    die Spur zum Ursprungsmodell bestehen bleibt.
    """
    ersetzt = []
    for inst in quelle.by_type("IfcRoot"):
        alt = inst.GlobalId
        if alt in bekannt:
            neu = guids.ersatz_guid(quell_sha, alt)
            inst.GlobalId = neu
            ersetzt.append((alt, neu, inst))
            bekannt.add(neu)
        else:
            bekannt.add(alt)
    return ersetzt


def _beruehrt_projekt(rel) -> bool:
    """Zeigt diese Beziehung — irgendwo — auf ein IfcProject?

    Geprueft werden alle direkten Attribute, Mengen eingeschlossen. Das Projekt
    der Quelle ist das eine Stueck, das NICHT mitwandern darf: IFC laesst genau
    ein IfcProject je Datei zu, und unseres steht schon.
    """
    for wert in rel:
        if isinstance(wert, tuple):
            if any(getattr(v, "is_a", None) and v.is_a("IfcProject") for v in wert):
                return True
        elif getattr(wert, "is_a", None) and wert.is_a("IfcProject"):
            return True
    return False


_SITE_ATTRIBUTE = ("RefLatitude", "RefLongitude", "RefElevation", "LandTitleNumber", "SiteAddress")


def _site_leer(wert) -> bool:
    """Traegt ein Site-Attribut nichts? None, leer — oder die Nullen, die Exporteure schreiben.

    Gemessen 2026-09-11: die BricsCAD-Lieferungen tragen RefLatitude (0, 0, 0, 0)
    und RefElevation 0.0, ENQUIER und IFCOUT gar nichts. Eine Null ist kein Standort.
    """
    if wert is None:
        return True
    if isinstance(wert, tuple):
        return not wert or all(v == 0 for v in wert)
    if isinstance(wert, (int, float)):
        return wert == 0
    if isinstance(wert, str):
        return not wert.strip()
    return False


def _merkmalsaetze(objekt) -> dict:
    """Name -> Merkmalssatz der Saetze, die an einem Objekt haengen."""
    out = {}
    for rel in getattr(objekt, "IsDefinedBy", None) or ():
        if rel.is_a("IfcRelDefinesByProperties"):
            satz = rel.RelatingPropertyDefinition
            name = getattr(satz, "Name", None)
            if name:
                out[name] = satz
    return out


def _site_aufloesen(ziel, geruest: dict, site, befund: Befund) -> bool:
    """Die Site einer Lieferung in UNSERER aufgehen lassen — der Verbund hat EINE Site.

    Fahrplan Erdbau-Container, Stufe 2: bis 2026-09-11 hing jede Quell-Site UNTER
    der des Verbunds — im Projekt 1337 vier IfcSite (Geruest, zweimal „Site", die
    Site des Eigenbaus). V05 zaehlte eine Raumwurzel unter dem Projekt und war
    zufrieden; jeder Empfaenger sah vier Standorte. Jetzt wandern die Kinder
    (Gebaeude, direkt enthaltene Bauteile) und jeder andere Verweis auf die
    Quell-Site an unsere, und die Site faellt.

    DIE LAGE AENDERT SICH DABEI NICHT: die Kinder zeigen mit ihren Platzierungen
    auf die PLATZIERUNG der Quell-Site, nicht auf die Site. Die Platzierung bleibt
    stehen und wird wie jede freie in `_platzierungen_verankern` unter unsere
    gehaengt — auch dann, wenn `_mapconversion_anwenden` den Versatz in genau
    sie geschrieben hat.

    Was die Quell-Site sagt, geht nicht still verloren: ihre Attribute
    (Referenzkoordinaten, Adresse) wandern an unsere, wenn dort nichts steht.
    WIDERSPRECHEN sie dem, was schon da ist, bleibt die Quell-Site geschachtelt
    stehen, und der Bericht sagt es. Merkmalssaetze wandern mit — ausser einem
    gleichnamigen, den unsere Site schon traegt, und der Georeferenz: die setzt
    der Verbund selbst, nach allen Quellen (`georeferenz_setzen`).

    @returns True, wenn die Site aufgeloest (und entfernt) wurde
    """
    import ifcopenshell.util.element

    ziel_site = geruest["site"]
    widerspruch = [a for a in _SITE_ATTRIBUTE
                   if not _site_leer(getattr(site, a, None)) and not _site_leer(getattr(ziel_site, a, None))
                   and getattr(site, a) != getattr(ziel_site, a)]
    if widerspruch:
        befund.warnungen.append(f"Site {site.Name!r} bleibt geschachtelt: {', '.join(widerspruch)} "
                                "widersprechen der Site des Verbunds")
        return False
    uebernommen = []
    for a in _SITE_ATTRIBUTE:
        wert = getattr(site, a, None)
        if not _site_leer(wert) and _site_leer(getattr(ziel_site, a, None)):
            setattr(ziel_site, a, wert)
            uebernommen.append(a)
    belegt = set(_merkmalsaetze(ziel_site)) | {PSET_GEOREF}
    verworfen = []
    for verweiser in list(ziel.get_inverse(site)):
        if verweiser.is_a("IfcRelDefinesByProperties"):
            name = getattr(verweiser.RelatingPropertyDefinition, "Name", None)
            if name in belegt:
                # Leer geworden, raeumt `_leere_beziehungen_entfernen` die Beziehung weg.
                verweiser.RelatedObjects = [o for o in verweiser.RelatedObjects if o.id() != site.id()]
                verworfen.append(name)
                continue
        ifcopenshell.util.element.replace_attribute(verweiser, site, ziel_site)
    befund.sites_aufgeloest.append({"name": site.Name, "globalId": site.GlobalId,
                                    "attribute_uebernommen": uebernommen, "merkmalsaetze_verworfen": verworfen})
    ziel.remove(site)
    return True


def _uebernimm(ziel, quelle, geruest: dict, befund: Befund, quell_sha: str, bekannt: set) -> list:
    """Eine normalisierte Quelle in das Zielgeruest haengen.

    Der Weg fuehrt ueber die BEZIEHUNGEN, nicht ueber die Bauteile: `file.add`
    kopiert eine Instanz samt allem, worauf sie zeigt. Eine IfcRelAggregates
    zieht also Vater und Kinder mit, eine IfcRelDefinesByProperties den
    Merkmalssatz. Wer nur die Produkte kopierte, bekaeme Bauteile ohne
    Zuordnung, ohne Merkmale und ohne Material.

    Ausgenommen sind die Beziehungen, die am QUELL-PROJEKT haengen: dessen
    Wurzel ersetzen wir durch unsere eigene. Ohne diese Ausnahme kaeme ein
    zweites IfcProject in die Datei — und mehr als eines ist nicht erlaubt.

    `add` ist idempotent (gemessen): dieselbe Instanz zweimal uebergeben ergibt
    dieselbe Ziel-Id. Deshalb duerfen wir hinterher gefahrlos ueber alle
    Produkte gehen, um die Zuordnung Quelle -> Ziel einzusammeln.
    """
    ersetzte = _guid_kollisionen_entschaerfen(quelle, bekannt, quell_sha)
    befund.guid_ersetzt = len(ersetzte)

    # Die Raumwurzeln der Quelle: was direkt unter ihrem Projekt haengt.
    wurzeln_quelle = []
    for rel in quelle.by_type("IfcRelAggregates"):
        if rel.RelatingObject and rel.RelatingObject.is_a("IfcProject"):
            wurzeln_quelle.extend(rel.RelatedObjects or [])

    for rel in quelle.by_type("IfcRelationship"):
        # Jede Beziehung, die das QUELL-PROJEKT beruehrt, bleibt draussen.
        #
        # Der erste Anlauf nannte nur zwei Faelle beim Namen (IfcRelDeclares und
        # IfcRelAggregates unter dem Projekt) und raeumte das mitgeschleppte
        # zweite IfcProject hinterher weg. Die Schema-Pruefung hat gezeigt, was
        # das kostet: drei Beziehungen behielten ein LEERES `RelatedObjects` —
        # und `SET [1:?]` verlangt mindestens einen Eintrag. Das ProVI-Modell
        # haengt naemlich Merkmalssaetze direkt an sein Projekt.
        #
        # Wer die Beziehung gar nicht erst kopiert, muss sie auch nicht
        # reparieren.
        if _beruehrt_projekt(rel):
            continue
        try:
            ziel.add(rel)
        except Exception as fehler:              # noqa: BLE001
            befund.warnungen.append(f"Beziehung {rel.is_a()} nicht uebernommen: {fehler}")

    # Waisen: Bauteile, die an keiner uebernommenen Beziehung hingen. Sie
    # existieren (ein Modell ohne Zuordnung ist erlaubt) und duerfen nicht
    # stillschweigend verschwinden.
    zuordnung = {}
    for p in quelle.by_type("IfcProduct"):
        try:
            zuordnung[p.GlobalId] = ziel.add(p)
        except Exception as fehler:              # noqa: BLE001
            befund.warnungen.append(f"Produkt {p.is_a()} {p.GlobalId} nicht uebernommen: {fehler}")

    # Darstellung: was auf die Geometrie zeigt, statt von ihr aus erreichbar
    # zu sein.
    #
    # GEFUNDEN DURCH DEN TEST, NICHT DURCH NACHDENKEN: nach dem ersten
    # vollstaendigen Lauf standen im Verbund NULL `IfcStyledItem` — alle drei
    # Lieferungen kamen grau an. `IfcStyledItem` ist weder Produkt noch
    # Beziehung, und der Verweis laeuft in die falsche Richtung: das Stilelement
    # zeigt auf das Geometrieelement, waehrend `IfcRepresentationItem.StyledByItem`
    # nur ein INVERSES Attribut ist. `file.add` folgt Vorwaertsverweisen — der
    # Stil wird also von nichts erreicht, was wir kopieren.
    #
    # Dieselbe Bauart hat `IfcPresentationLayerAssignment` (Layer zeigen auf
    # Darstellungen). Beide muessen ausdruecklich mitgenommen werden.
    #
    # `add` ist idempotent, das Geometrieelement liegt also schon im Ziel und
    # der Stil haengt sich an dieselbe Instanz.
    stile = 0
    for typ in ("IfcStyledItem", "IfcPresentationLayerAssignment"):
        for eintrag in by_type_weich(quelle, typ):
            try:
                ziel.add(eintrag)
                stile += 1
            except Exception as fehler:          # noqa: BLE001
                befund.warnungen.append(f"{typ} nicht uebernommen: {fehler}")
    befund.stile_uebernommen = stile

    # Die Raumwurzeln der Quelle: eine SITE geht in UNSERER auf (`_site_aufloesen`
    # — der Verbund hat genau eine Site), alles andere (ein Gebaeude, eine Anlage
    # direkt unter dem Projekt) haengt darunter. Die Gliederung der Lieferung
    # unterhalb der Site bleibt erhalten.
    unter_uns = []
    for w in wurzeln_quelle:
        inst = zuordnung.get(w.GlobalId)
        if inst is None:
            continue
        if inst.is_a("IfcSite") and _site_aufloesen(ziel, geruest, inst, befund):
            zuordnung.pop(w.GlobalId, None)          # entfernt — danach nicht mehr anfassen
            continue
        unter_uns.append(inst)
    if unter_uns:
        ziel.create_entity(
            "IfcRelAggregates", GlobalId=_guid("wurzel", quell_sha),
            OwnerHistory=geruest["besitz"], RelatingObject=geruest["site"],
            RelatedObjects=unter_uns)
    elif not befund.sites_aufgeloest:
        befund.warnungen.append("keine Raumwurzel gefunden — Bauteile haengen direkt am Verbund")

    # Die ersetzten GlobalIds am Bauteil festhalten — in `Quagg_Herkunft`, und zwar
    # in DEM Satz, den ein erzeugtes Element schon mitbringt (herkunft.schreibe).
    for alt, neu, _inst in ersetzte:
        ziel_inst = zuordnung.get(neu)
        if ziel_inst is not None:
            H.schreibe(ziel, geruest["besitz"], ziel_inst, {"OriginalGlobalId": alt, "OriginalDatei": befund.name},
                       guid_von=lambda teil, _n=neu: _guid(quell_sha, H.PSET_HERKUNFT,
                                                           *(() if teil == "satz" else (teil,)), _n))

    bauteile = [i for g, i in zuordnung.items() if not _ist_raum(i)]
    befund.uebernommen = len(bauteile)
    return bauteile


def _kontexte_vereinen(ziel, geruest: dict) -> dict:
    """Alle mitgekommenen Darstellungskontexte auf UNSEREN umlenken.

    `file.add` zieht ueber `IfcShapeRepresentation.ContextOfItems` den
    Geometriekontext der Quelle mit. Nach drei Lieferungen stehen drei
    Model-Kontexte in der Datei, jeder mit eigener Praezision. Formal faellt das
    nicht sofort auf — praktisch heisst es, dass ein Empfaenger nicht weiss,
    welcher gilt.

    Umgelenkt wird nach der Kennung der DARSTELLUNG, nicht nach der des
    Kontexts: `RepresentationIdentifier` steht direkt an der Darstellung und ist
    verlaesslicher als das, was ein fremder Exporteur in den Kontext geschrieben
    hat.
    """
    unsere = {geruest["kontext"].id(), geruest["koerper"].id(), geruest["achse"].id()}
    umgelenkt = 0
    for darstellung in ziel.by_type("IfcRepresentation"):
        alt = darstellung.ContextOfItems
        if alt is not None and alt.id() in unsere:
            continue
        kennung = (darstellung.RepresentationIdentifier or "").lower()
        darstellung.ContextOfItems = geruest["achse"] if kennung == "axis" else geruest["koerper"]
        umgelenkt += 1

    # Erst die Unterkontexte, dann die Wurzeln — ein Unterkontext zeigt auf
    # seinen Vater, und `remove` in der falschen Reihenfolge liesse einen
    # baumelnden Verweis stehen.
    entfernt = 0
    for typ in ("IfcGeometricRepresentationSubContext", "IfcGeometricRepresentationContext"):
        for ctx in list(ziel.by_type(typ, include_subtypes=(typ == "IfcGeometricRepresentationContext"))):
            if ctx.id() in unsere:
                continue
            if typ == "IfcGeometricRepresentationContext" and ctx.is_a(
                    "IfcGeometricRepresentationSubContext"):
                continue                          # in der ersten Runde erledigt
            try:
                ziel.remove(ctx)
                entfernt += 1
            except Exception:                     # noqa: BLE001 — noch benutzt, bleibt stehen
                pass
    return {"umgelenkt": umgelenkt, "entfernt": entfernt}


def _platzierungen_verankern(ziel, geruest: dict) -> int:
    """Freie Platzierungen an die Platzierung der Verbund-Site haengen.

    Eine `IfcLocalPlacement` mit `PlacementRelTo = $` ist absolut im
    Projektsystem — formal erlaubt. Die Implementer Agreements erwarten aber,
    dass die Platzierungskette der Raumgliederung folgt; Werkzeuge, die ein
    Bauteil ueber seine Kette verorten, finden sonst keinen Anschluss.

    Die Site-Platzierung ist die Einheitsabbildung, deshalb aendert das KEINE
    einzige Koordinate — es haengt sie nur ein.
    """
    wurzel = geruest["site"].ObjectPlacement
    verankert = 0
    for platz in ziel.by_type("IfcLocalPlacement"):
        if platz.id() == wurzel.id():
            continue
        if platz.PlacementRelTo is None:
            platz.PlacementRelTo = wurzel
            verankert += 1
    return verankert


def _einmalige_verschmelzen(ziel) -> dict:
    """Entitaeten zusammenfuehren, die IFC nur EINMAL je Datei zulaesst.

    GEFUNDEN BEIM ERSTEN ECHTEN LAUF: beide BricsCAD-Lieferungen tragen
    dasselbe `IfcApplication('V26','BricsCAD Civil','Bcad')`. Im Verbund stand
    es zweimal, und die Schema-Pruefung beanstandete beide
    Eindeutigkeitsregeln:

        IfcApplication.UR1  ApplicationIdentifier muss eindeutig sein
        IfcApplication.UR2  (ApplicationFullName, Version) muss eindeutig sein

    Das ist kein Sonderfall dieser zwei Dateien, sondern die Regel beim
    Zusammenfuehren: `file.add` ist idempotent je QUELLE — zwei Quellen mit
    demselben Inhalt liefern zwei Instanzen, weil es zwei verschiedene sind.
    Ueberall dort, wo das Schema Eindeutigkeit verlangt, muss danach
    verschmolzen werden.

    Die GlobalIds der IfcRoot-Nachfahren sind davon nicht betroffen — die
    entschaerft `_guid_kollisionen_entschaerfen` schon vor dem Kopieren, und
    zwar andersherum: dort wird UMBENANNT (zwei Bauteile bleiben zwei), hier
    wird VERSCHMOLZEN (zwei Nennungen desselben Programms werden eine). Der
    Unterschied ist fachlich: ein doppeltes Bauteil ist ein zweites Bauteil,
    ein doppelt genanntes Programm ist dasselbe Programm.
    """
    import ifcopenshell.util.element

    # Typ -> was diesen Eintrag ausmacht. Erweiterbar. IfcApplication traegt eine
    # Eindeutigkeitsregel, die uns beim Merge trifft; die Quelldokumente
    # (herkunft.dokument, Fahrplan Erdbau-Container Stufe 3) keine Regel, aber
    # dieselbe Sorte: der Eigenbau bringt das Dokument seines Gelaendes mit, und
    # der Verbund nennt dieselbe Lieferung an ihrer Gruppe noch einmal. Die
    # Reihenfolge traegt: erst die Dokumente, dann die Referenzen, die danach auf
    # dasselbe Dokument zeigen.
    EINMALIG = {
        "IfcApplication": lambda a: (a.ApplicationFullName, a.Version, a.ApplicationIdentifier),
        "IfcDocumentInformation": H.dokument_schluessel,
        "IfcDocumentReference": lambda r: (r.ReferencedDocument.id() if r.ReferencedDocument else None,
                                           r.Location, r.Identification, r.Name),
    }

    verschmolzen = collections.Counter()
    for typ, schluessel_von in EINMALIG.items():
        behalten = {}
        for inst in list(ziel.by_type(typ)):
            schluessel = schluessel_von(inst)
            erster = behalten.get(schluessel)
            if erster is None:
                behalten[schluessel] = inst
                continue
            # Was der Erste nicht weiss, weiss vielleicht der Zweite — die Revision
            # eines Dokuments, das eine Seite ohne sie nannte.
            for i in range(len(erster)):
                if erster[i] is None and inst[i] is not None:
                    erster[i] = inst[i]
            for verweiser in ziel.get_inverse(inst):
                ifcopenshell.util.element.replace_attribute(verweiser, inst, erster)
            ziel.remove(inst)
            verschmolzen[typ] += 1

    # UR1 verlangt eine eindeutige ApplicationIdentifier. Zwei FASSUNGEN desselben
    # Programms — ein Erdbau-Dokument der Fassung 1 im Verbund der Fassung 2 —
    # verschmelzen oben nicht (UR2 unterscheidet sie, jede steht an ihren
    # Bauteilen); die spaetere Nennung bekommt ihre Fassung in die Kennung.
    kennungen = set()
    for a in sorted(ziel.by_type("IfcApplication"), key=lambda a: a.id()):
        if a.ApplicationIdentifier in kennungen:
            a.ApplicationIdentifier = f"{a.ApplicationIdentifier} {a.Version}"
            verschmolzen["IfcApplication (Kennung um Fassung ergaenzt)"] += 1
        kennungen.add(a.ApplicationIdentifier)
    return dict(verschmolzen)


def _leere_beziehungen_entfernen(ziel) -> int:
    """Beziehungen wegnehmen, die ihre Gegenseite verloren haben.

    Das Netz unter allem, was vorher entfernt oder verschmolzen wurde. IFC
    verlangt fuer `RelatedObjects` eine Menge mit MINDESTENS einem Eintrag
    (`SET [1:?]`); eine leere ist schemawidrig — und genau das hat die
    Schema-Pruefung beim Dreier-Verbund gemeldet, nachdem das mitgeschleppte
    ProVI-Projekt entfernt worden war und drei Beziehungen ins Leere zeigten.

    Diese Pruefung misst den ZUSTAND, nicht die Ursache: sie fragt nicht, wer
    etwas entfernt hat, sondern ob am Ende eine Beziehung ohne Gegenseite
    dasteht. Damit faengt sie auch die naechste Ursache, die noch niemand
    kennt.
    """
    entfernt = 0
    for rel in list(ziel.by_type("IfcRelationship")):
        namen = rel.get_info(recursive=False, include_identifier=False).keys()
        leer = False
        for feld in ("RelatedObjects", "RelatedElements", "RelatedFeatureElement",
                     "RelatingObject", "RelatingGroup", "RelatingPropertyDefinition"):
            if feld not in namen:
                continue
            wert = getattr(rel, feld, None)
            if wert is None or (isinstance(wert, tuple) and not wert):
                leer = True
                break
        if leer:
            try:
                ziel.remove(rel)
                entfernt += 1
            except Exception:                     # noqa: BLE001
                pass
    return entfernt


def _herkunft(ziel, geruest: dict, quelle: Quelle, befund: Befund, bauteile: list, *,
              ablage: str | None = None, dokumente: dict | None = None) -> None:
    """Je Fachmodell eine Gruppe — damit im Verbund sichtbar bleibt, wer was lieferte.

    Die Merkmale haengen an der GRUPPE, nicht an jedem Bauteil. Bei sechsstelligen
    Entitaetenzahlen waere das Zweite die Dateigroesse nicht wert, und die Aussage
    waere dieselbe.

    Ohne diese Spur ist ein Verbund eine Einbahnstrasse: man sieht, DASS etwas
    drin ist, aber nicht, aus welcher Lieferung es kam und welchen Stand sie hatte.
    """
    if not bauteile:
        return
    gruppe = ziel.create_entity(
        "IfcGroup", GlobalId=_guid("gruppe", quelle.sha256), OwnerHistory=geruest["besitz"],
        Name=quelle.name, Description="Fachmodell im Verbund", ObjectType="Fachmodell")
    ziel.create_entity(
        "IfcRelAssignsToGroup", GlobalId=_guid("gruppe-rel", quelle.sha256),
        OwnerHistory=geruest["besitz"], RelatedObjects=bauteile, RelatingGroup=gruppe)
    werte = {
        "Datei": quelle.name,
        "SHA256": quelle.sha256,
        "Revision": quelle.revision,
        "Status": quelle.status,
        "Quellschema": befund.schema,
        "Quelleinheit_Faktor": befund.einheit_faktor,
        "Bauteile": len(bauteile),
        "MigrationVerworfen": befund.verworfen,
        "GlobalIdErsetzt": befund.guid_ersetzt,
    }
    if befund.sites_aufgeloest:
        # Die Site der Lieferung ging in der des Verbunds auf — ihre Kennung bleibt hier lesbar.
        werte["OriginalSiteGlobalId"] = ", ".join(s["globalId"] for s in befund.sites_aufgeloest)
        werte["OriginalSiteName"] = ", ".join(str(s["name"]) for s in befund.sites_aufgeloest)
    _merkmale(ziel, geruest["besitz"], gruppe, PSET_FACHMODELL, werte, schluessel=quelle.sha256)
    # Die Lieferung als Dokument an ihrer Gruppe (herkunft.dokument). Einen
    # Ablageort hat nur, was als Registerdatei kam — der Eigenbau entsteht im Laufordner.
    ref = H.dokument(ziel, {} if dokumente is None else dokumente, sha256=quelle.sha256, datei=quelle.name,
                     revision=quelle.revision, ablage=ablage if quelle.pfad.name == quelle.name else None)
    H.verknuepfe(ziel, geruest["besitz"], ref, [gruppe], guid=_guid("dokument", quelle.sha256))


def _bezug_pruefen(befund: Befund, crs, kandidaten, befunde) -> list | None:
    """Liegt diese Quelle dort, wo die anderen liegen? Lehnt LAUT ab, statt zu legen."""
    if not befund.crs_erkannt:
        groesste = befund.huelle_nachher["max"][:2] if befund.huelle_nachher else "keine Koordinaten"
        raise VerbundUnmoeglich(
            f"{befund.name}: keine Landeskoordinaten erkennbar (groesste Koordinate {groesste}) "
            "— im Verbund laege das Modell am Nullpunkt, fern von allen anderen")
    if crs is not None:
        if not any(bz.gleichwertig(crs, e) for e in befund.crs_erkannt):
            raise VerbundUnmoeglich(
                f"{befund.name} liegt nicht in {bz.system_nach(crs).epsg}: seine Koordinaten "
                f"passen zu {befund.crs_erkannt[0]}")
        return kandidaten
    neu = list(befund.crs_erkannt) if kandidaten is None else \
        [e for e in kandidaten if e in befund.crs_erkannt]
    if not neu:
        alle = list(befunde) + [befund]
        raise VerbundUnmoeglich(
            "die Quellen liegen in verschiedenen Bezugssystemen — "
            + "; ".join(f"{b.name}: {'/'.join(b.crs_erkannt) or 'keins'}" for b in alle)
            + ". Ein Verbund legte sie still uebereinander, obwohl sie Hunderte Kilometer "
              "auseinander gemeint sind")
    return neu


def _bezug_entscheiden(crs, kandidaten, befunde) -> tuple[str, str, tuple]:
    """Welches System bekommt der Verbund — und was davon ist Annahme?

    UTM32 und UTM33 sind am Rechtswert nicht zu trennen. Deklariert eine Quelle
    eines der beiden, entscheidet diese Angabe; sonst gilt die Tabellenreihenfolge,
    und die Mehrdeutigkeit wird in die Datei geschrieben statt verschwiegen.
    """
    if crs is not None:
        return (bz.system_nach(crs).epsg,
                "Projektangabe — die Koordinaten aller Quellen bestaetigen sie", ())
    deklariert = {}
    for b in befunde:
        s = bz.system_nach(b.crs_deklariert)
        if s is not None and s.epsg in kandidaten:
            deklariert.setdefault(s.epsg, []).append(b.name)
    if len(deklariert) > 1:
        raise VerbundUnmoeglich(
            "die Quellen deklarieren verschiedene, an den Koordinaten nicht unterscheidbare "
            "Systeme: " + "; ".join(f"{k} in {', '.join(v)}" for k, v in deklariert.items()))
    if deklariert:
        ziel, namen = next(iter(deklariert.items()))
        herkunft = (f"Erkannt an den Koordinaten der Quellen; {ziel} nach der Angabe in "
                    f"{', '.join(namen)}")
    else:
        ziel = kandidaten[0]
        herkunft = ("Erkannt an den Koordinaten der Quellen — eine Annahme, keine Angabe: "
                    "keine Quelle deklarierte ein passendes System")
    mehrdeutig = tuple(k for k in kandidaten if k != ziel)
    if mehrdeutig:
        herkunft += f"; am Rechtswert allein nicht von {', '.join(mehrdeutig)} zu unterscheiden"
    return ziel, herkunft, mehrdeutig


# ── Der Lauf ────────────────────────────────────────────────────────────────

def fuehre_zusammen(quellen, ziel_pfad, *, projektname: str = "Verbundmodell",
                    crs: str | None = None, bearbeiter: str = "", firma: str = "",
                    schluessel: str = "verbund", melde=None, nachbearbeiten=None,
                    ablage: str | None = None) -> dict:
    """Der ganze Weg: normalisieren, Geruest bauen, hineinhaengen, aufraeumen, schreiben.

    @param quellen      Liste von `Quelle` oder von dicts mit denselben Feldern
    @param ziel_pfad    wohin die Verbunddatei geschrieben wird
    @param schluessel   macht die abgeleiteten GlobalIds eindeutig je Satz —
                        zwei Saetze desselben Projekts sollen nicht dasselbe
                        IfcProject beanspruchen
    @param crs          Bezugssystem des Projekts (z. B. "EPSG:31466"). `None`: aus
                        den Koordinaten der Quellen ermitteln — verschiedene Systeme
                        werden dann abgelehnt, nicht uebereinandergelegt
    @param nachbearbeiten  Liste von (name, funktion); jede als `funktion(ziel)`
                        gerufen, wenn alle Quellen uebernommen sind und bevor
                        aufgeraeumt und geschrieben wird. Ihr Ergebnis steht im
                        Bericht unter `nachbearbeitung[name]`. So haengt der
                        CDE-Eigenbau seine Aushuebe an ihre Wirte, ohne dass diese
                        Datei ihn kennen muss.
    @param melde        optionaler Rueckruf `melde(text)` fuer den Fortschritt
    @param ablage       wo die Registerdateien liegen (`<Phase>/<Projekt>/CDE`) —
                        `Location` ihrer Dokumentverweise (herkunft.dokument)
    @returns            der Bericht (dict, JSON-tauglich)
    """
    begonnen = time.time()
    quellen = [q if isinstance(q, Quelle) else Quelle(**q) for q in quellen]
    if not quellen:
        raise ValueError("keine Quelle angegeben — ein Verbund aus nichts ist keiner")

    def sag(text):
        if melde:
            melde(text)

    if crs is not None and bz.system_nach(crs) is None:
        # Vor dem ersten Oeffnen: ein unbekanntes System scheitert nach einer
        # Sekunde, nicht nach zwei Minuten Migration.
        raise VerbundUnmoeglich(_unbekannt(crs))
    geruest = zielgeruest(projektname, crs=None, bearbeiter=bearbeiter, firma=firma, schluessel=schluessel)
    ziel = geruest["datei"]
    bekannt = {i.GlobalId for i in ziel.by_type("IfcRoot")}
    befunde = []
    dokumente = {}                            # sha256 -> Dokumentverweis (herkunft.dokument)
    kandidaten = None                         # Systeme, in denen ALLE bisherigen Quellen liegen

    for nr, quelle in enumerate(quellen, 1):
        sag(f"({nr}/{len(quellen)}) {quelle.name}: lesen und normalisieren")
        datei, befund = normalisiere(quelle)
        kandidaten = _bezug_pruefen(befund, crs, kandidaten, befunde)
        sag(f"({nr}/{len(quellen)}) {quelle.name}: {befund.entitaeten_nachher} Entitaeten uebernehmen")
        bauteile = _uebernimm(ziel, datei, geruest, befund, quelle.sha256, bekannt)
        _herkunft(ziel, geruest, quelle, befund, bauteile, ablage=ablage, dokumente=dokumente)
        befunde.append(befund)
        del datei                                 # Speicher zurueckgeben, bevor die naechste kommt

    ziel_crs, crs_herkunft, mehrdeutig = _bezug_entscheiden(crs, kandidaten, befunde)
    georeferenz_setzen(geruest, ziel_crs, herkunft=crs_herkunft, mehrdeutig=mehrdeutig)

    nachbearbeitung = {}
    for name, funktion in nachbearbeiten or ():
        sag(f"nachbearbeiten: {name}")
        nachbearbeitung[name] = funktion(ziel)

    sag("Kontexte vereinen")
    kontexte = _kontexte_vereinen(ziel, geruest)
    sag("Platzierungen verankern")
    verankert = _platzierungen_verankern(ziel, geruest)
    sag("doppelte Einmalige verschmelzen")
    verschmolzen = _einmalige_verschmelzen(ziel)

    # Ein zweites IfcProject waere schemawidrig. `_beruehrt_projekt` sollte
    # keines durchgelassen haben — aber nachsehen kostet nichts, und still
    # falsch ist die Sorte Fehler, gegen die diese Datei geschrieben ist.
    fremde = [p for p in ziel.by_type("IfcProject") if p.id() != geruest["projekt"].id()]
    for p in fremde:
        try:
            ziel.remove(p)
        except Exception:                         # noqa: BLE001
            pass

    sag("leere Beziehungen entfernen")
    leere = _leere_beziehungen_entfernen(ziel)

    Path(ziel_pfad).parent.mkdir(parents=True, exist_ok=True)
    ziel.write(str(ziel_pfad))

    bericht = {
        "ziel": str(ziel_pfad),
        "schema": ZIELSCHEMA,
        "projektname": projektname,
        "crs": geruest["crs"],
        "crs_herkunft": crs_herkunft,
        "crs_mehrdeutig": list(mehrdeutig),
        "nachbearbeitung": nachbearbeitung,
        "groesse_mb": round(Path(ziel_pfad).stat().st_size / 1e6, 2),
        "entitaeten": anzahl(ziel),
        "produkte": len(ziel.by_type("IfcProduct")),
        "bauteile": sum(b.uebernommen for b in befunde),
        "raumwurzeln": len(ziel.by_type("IfcSite")),
        "kontexte": len(ziel.by_type("IfcGeometricRepresentationContext")),
        "kontexte_umgelenkt": kontexte["umgelenkt"],
        "kontexte_entfernt": kontexte["entfernt"],
        "platzierungen_verankert": verankert,
        "einmalige_verschmolzen": verschmolzen,
        "dokumente": len(ziel.by_type("IfcDocumentInformation")),
        "fremde_projekte_entfernt": len(fremde),
        "leere_beziehungen_entfernt": leere,
        "huelle": huelle(ziel),
        "dauer_s": round(time.time() - begonnen, 1),
        "quellen": [vars(b) for b in befunde],
    }
    bericht["weltbezug_plausibel"] = weltbezug_plausibel(bericht["huelle"], geruest["crs"])
    return bericht
