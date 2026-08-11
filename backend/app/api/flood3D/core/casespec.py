"""
casespec — der zentrale Vertrag (Spez. Kap. 4.1).

Eine Datei beschreibt den vollständigen Fall. PreProzessing erzeugt daraus den
OpenFOAM-Fall, PostProzessing leitet daraus ab, welche Auswertungen zu
erstellen sind. `extra="forbid"` überall, damit ein Tippfehler im YAML eine
Fehlermeldung erzeugt statt einer stillschweigend ignorierten Angabe.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Annotated, Literal, Union

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

Point2 = tuple[float, float]
Point3 = tuple[float, float, float]
Vec3 = tuple[float, float, float]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ImportRef(_Model):
    """Verweis auf den Rohdaten-Kandidaten unter imports/<import_id>/."""
    import_id: str
    kandidat: str


class _Objekt(_Model):
    """
    Gemeinsame Herkunftsangabe aller Fallobjekte. None bedeutet: von Hand
    angelegt (der Normalfall — deshalb kein Pflichtfeld und kein Eintrag im
    YAML). „import" trägt zusätzlich den Verweis auf die Rohdaten — damit
    ist ein Import wiederholbar und seine Objekte sind gezielt ersetzbar.
    """
    herkunft: Literal["manuell", "import", "kur", "rezept"] | None = None
    import_ref: ImportRef | None = None
    # Zusammengehörigkeit über Objektgrenzen hinweg: die Teile EINES
    # eingesetzten Rezepts (Aushub, Bauteile, Verfeinerung, Pegel,
    # Kriterium) tragen dieselbe Gruppe — der Baum zeigt sie als ein
    # Bauwerk, löschbar als Ganzes. None = gehört zu keiner Gruppe.
    gruppe: str | None = None


# --------------------------------------------------------------------------
# meta
# --------------------------------------------------------------------------

class Crs(_Model):
    """
    Bezugssystem als Dokumentation des Nachweises (steht im Ergebnis).
    Die Verortung des lokalen Systems steht in `Meta.transform` — ein
    zweiter, nie angewandter Ursprung mit Drehung hat nur Verwirrung
    gestiftet.
    """
    epsg: int


class CrsTransform(_Model):
    """
    DIE eine Abbildung Landeskoordinaten (Meter) → lokales Fallsystem:
    p_lokal = R(rotation_deg) @ p_welt + translation. Gilt für Import UND
    nachträgliches Drehen (Komposition über `transform_drehung`).
    `unit_factor` dokumentiert nur die Einheit der Quelldatei (mm → 0.001)
    — in p_welt ist er bereits verrechnet. Rückverortung über
    `lokal_nach_welt` / `welt_nach_lokal`.
    """
    unit_factor: float = 1.0
    rotation_deg: float = 0.0
    translation: tuple[float, float] = (0.0, 0.0)


def _rot2(deg: float) -> tuple[float, float]:
    a = math.radians(deg)
    return math.cos(a), math.sin(a)


# Rückverortung ist ein NACHWEIS-VERSPRECHEN: derzeit test- und
# vertragsgenutzt, ohne Produktions-Leser — Schnittstelle für spätere
# Export-Wege (Landeskoordinaten im Bericht).
def welt_nach_lokal(t: "CrsTransform", x: float, y: float) -> tuple[float, float]:
    c, s = _rot2(t.rotation_deg)
    return (c * x - s * y + t.translation[0],
            s * x + c * y + t.translation[1])


def lokal_nach_welt(t: "CrsTransform", x: float, y: float) -> tuple[float, float]:
    dx, dy = x - t.translation[0], y - t.translation[1]
    c, s = _rot2(-t.rotation_deg)
    return (c * dx - s * dy, s * dx + c * dy)


def transform_import(unit_factor: float, offset, rotation_deg: float) -> "CrsTransform":
    """Importkonvention: p_lokal = R(θ)·(p_welt − off)  ⇒  t = −R(θ)·off."""
    ox, oy = (float(offset[0]), float(offset[1])) if offset else (0.0, 0.0)
    c, s = _rot2(rotation_deg)
    return CrsTransform(unit_factor=float(unit_factor),
                        rotation_deg=float(rotation_deg) % 360.0,
                        translation=(-(c * ox - s * oy), -(s * ox + c * oy)))


def transform_drehung(t: "CrsTransform | None", phi_deg: float,
                      zentrum) -> "CrsTransform":
    """
    Nachträgliche Drehung um `zentrum` (im LOKALEN System) anhängen:
    p' = R(φ)·(p − c) + c  ⇒  θ' = θ+φ, t' = R(φ)·t + c − R(φ)·c.
    """
    t = t or CrsTransform()
    c_, s_ = _rot2(phi_deg)
    tx, ty = t.translation
    cx, cy = float(zentrum[0]), float(zentrum[1])
    return CrsTransform(
        unit_factor=t.unit_factor,
        rotation_deg=(t.rotation_deg + phi_deg) % 360.0,
        translation=(c_ * tx - s_ * ty + cx - (c_ * cx - s_ * cy),
                     s_ * tx + c_ * ty + cy - (s_ * cx + c_ * cy)))


class Conventions(_Model):
    length_unit: Literal["m"] = "m"
    force_sign: Literal["outward_normal"] = "outward_normal"
    level_reference: Literal["absolute"] = "absolute"


class Nachweis(_Model):
    regelwerk: list[str] = []
    bearbeiter: str = ""
    lastfall: str = ""


class Meta(_Model):
    id: str
    title: str = ""
    crs: Crs | None = None
    vertical_datum: str = "DHHN2016"
    conventions: Conventions = Conventions()
    nachweis: Nachweis = Nachweis()
    # Der Fall lebt in einem LOKALEN System (UTM-Zahlen ruinieren
    # float32-Viewer und snappy; ein achsparalleles Gebiet soll eng um ein
    # schräg liegendes Bauwerk passen). Diese eine Abbildung macht die
    # Rückverortung in die Landeskoordinaten rechnerisch möglich — sie
    # ersetzt die alten Felder crs_offset/crs_rotation_deg, die zwei
    # verschiedene Drehkonventionen mischten und das Drehzentrum verloren.
    transform: CrsTransform | None = None


# --------------------------------------------------------------------------
# domain / terrain
# --------------------------------------------------------------------------

class Domain(_Model):
    extent: tuple[float, float, float, float]  # xmin, ymin, xmax, ymax
    z_min: float
    z_max: float


class TerrainBase(_Model):
    source: str
    resolution: float = 0.25
    # Geländekörper: ein geschlossener Volumenkörper (STL) statt der aus
    # dem Raster erzeugten Höhenfläche. Der Vernetzer bekommt dann DIESEN
    # Körper — nur so kann das Gelände Hohlräume haben (Rohr durch den
    # Damm, Kanal unter der Sohle). `source` bleibt trotzdem gesetzt: das
    # daraus abgeleitete Höhenraster trägt alles, was eine Höhe je Punkt
    # braucht (Prüfung, Fensterlage, Anzeige).
    koerper: str | None = None
    # Kettenfreies Drehen: `original` ist die Rasterquelle VOR der ersten
    # Drehung, `original_abbildung` die akkumulierte Abbildung original →
    # aktuelles System. Jede weitere Drehung tastet vom ORIGINAL ab statt
    # vom letzten Resampling — sonst verwischt jedes Drehen das Gelände
    # ein Stück mehr.
    original: str | None = None
    original_abbildung: CrsTransform | None = None


class OpChannelCarve(_Objekt):
    id: str
    type: Literal["channel_carve"]
    polyline: list[Point2]
    invert_start: float
    invert_end: float
    bottom_width: float
    depth: float
    side_slope: float


class OpPad(_Objekt):
    id: str
    type: Literal["pad"]
    polygon: list[Point2]
    level: float


class OpRaiseLower(_Objekt):
    id: str
    type: Literal["raise_lower"]
    center: Point2
    radius: float
    strength: float               # positiv hebt an, negativ senkt ab
    falloff: Literal["smooth", "linear", "constant"] = "smooth"


class OpSmooth(_Objekt):
    id: str
    type: Literal["smooth"]
    center: Point2
    radius: float
    strength: float
    polygon: list[Point2] | None = None


class OpRamp(_Objekt):
    id: str
    type: Literal["ramp"]
    polygon: list[Point2]
    level_start: float
    level_end: float
    direction: Point2             # Interpolationsrichtung im Grundriss


class OpEmbankment(_Objekt):
    id: str
    type: Literal["embankment"]
    polyline: list[Point2]
    crest_level: float
    crest_width: float
    side_slope: float


class OpReplaceRegion(_Objekt):
    id: str
    type: Literal["replace_region"]
    polygon: list[Point2]
    source: str                   # Quellraster


class OpSetLevel(_Objekt):
    id: str
    type: Literal["set_level"]
    polygon: list[Point2]
    level: float
    blend_width: float = 0.0


class OpBruchkante(_Objekt):
    """
    Bruchkante mit Höhe je Stützpunkt — so kommen Böschungs-, Mauer- und
    Sohlkanten aus der Vermessung (3D-Polylinie im DXF).

    `modus` bestimmt die Wirkung. Die ersten drei wirken auf einen Schlauch
    der Breite `breite` um die LINIE; die letzten beiden füllen die FLÄCHE
    innerhalb einer geschlossenen Kante und brauchen deshalb eine solche:

        ziehen    Gelände auf die Kante ziehen, in beide Richtungen
        absenken  nur abgraben (Sohl-, Grabenkanten)
        anheben   nur aufschütten (Dammkronen, Mauern)
        ebnen     innen eine EBENE — die Ausgleichsebene durch die
                  Kantenhöhen. Für Planum, Beckensohle, Parkfläche: innen
                  ist es garantiert eben, ohne jeden Höhensprung.
        fuellen   innen stufenfrei aus der Kante ergänzen (Fläche
                  geringster Krümmung). Anders als `ebnen` folgt sie einer
                  geneigten oder unregelmäßigen Kante und schließt am Rand
                  bündig an.
    """
    id: str
    type: Literal["bruchkante"]
    polyline: list[Point3]
    breite: float = 1.0
    modus: Literal["ziehen", "absenken", "anheben",
                   "ebnen", "fuellen"] = "ziehen"
    # Aus welchen Vermessungskanten abgeleitet. Nicht leer heißt:
    # „Kanten verknüpfen" erzeugt diese Operation neu. Wer sie von
    # Hand ändern will, leert das Feld — dann bleibt sie stehen.
    aus_kanten: list[str] = []


# --------------------------------------------------------------------------
# Vermessungskanten: was in der Zeichnung steht, mit seiner Bedeutung
#
# Bisher wurde eine importierte Linie sofort zu einer OPERATION — damit war
# das Zeichnungselement und seine Wirkung dasselbe Objekt, und die Rolle
# („das ist die Beckensohle") ging verloren. Die Böschung entstand nur,
# wenn Ober- und Unterkante zufällig passend BENANNT waren; über den
# Layernamen gepaart, nicht über die Lage.
#
# Jetzt behält die Kante ihre Identität und ihre Rolle. Was daraus für das
# Gelände folgt, leitet `core/kanten.py` aus Rolle UND Geometrie ab: eine
# geschlossene Sohle innerhalb eines Beckenrands ergibt die Böschung
# dazwischen und die ebene Sohle darin.
# --------------------------------------------------------------------------

# Die ersten sechs formen das GELÄNDE, die letzten beiden sind BAUTEILE.
# Eine Wehrkrone ist kein Geländeknick: als Bruchkante gezeichnet zöge sie
# den Boden nach oben, statt ein umströmtes Bauwerk zu sein — und ohne
# eigene Fläche gäbe es weder Kraft noch Überfallbeiwert.
KantenRolle = Literal[
    "frei",          # nur eine Höhenkante, keine weitere Bedeutung
    "sohle",         # Beckensohle/Grabensohle — innen eben (Ankerfläche)
    "beckenrand",    # obere Umgrenzung eines Beckens
    "boeschung_ok",  # Böschungsoberkante
    "boeschung_uk",  # Böschungsunterkante
    "krone",         # Dammkrone
    "mauer",         # Mauerkrone -> Wand (Bauteil, z = Kronenhöhe)
    "wehrkrone",     # Überfallkante -> Wehr (Bauteil, z = Kronenhöhe)
]

# Welche Rollen ein Bauteil ergeben statt einer Geländeoperation
BAUTEIL_ROLLEN = ("mauer", "wehrkrone")


class Vermessungskante(_Objekt):
    """
    Eine Linie aus der Zeichnung, mit ihrer Bedeutung im Bauwerk.

    `rolle` sagt, WAS die Linie ist; die Geländeoperationen, die daraus
    folgen, werden abgeleitet und tragen `aus_kanten` mit den Kennungen,
    aus denen sie entstanden sind. Wer eine abgeleitete Operation von Hand
    ändern will, löst sie ab (`aus_kanten` leeren) — dann fasst die
    Ableitung sie nicht mehr an.
    """
    id: str
    polyline: list[Point3]
    rolle: KantenRolle = "frei"
    # Wirkungsbreite der Kante selbst (wie bei OpBruchkante)
    breite: float = 1.0
    # Woher sie kam — Layername der Zeichnung, für die Rückverfolgung
    quelle: str = ""

    @model_validator(mode="after")
    def _genug_punkte(self):
        if len(self.polyline) < 2:
            raise ValueError(f"Kante {self.id}: mindestens 2 Punkte nötig")
        return self

    @property
    def geschlossen(self) -> bool:
        a, b = self.polyline[0], self.polyline[-1]
        return abs(a[0] - b[0]) < 1e-6 and abs(a[1] - b[1]) < 1e-6


class OpBoeschung(_Objekt):
    """
    Böschung aus Ober- UND Unterkante (beide mit Höhe je Stützpunkt).
    Zwischen den Linien entsteht die Regelfläche: jeder Punkt bekommt die
    Höhe, die sich aus dem Abstandsverhältnis zu beiden Kanten ergibt.
    Das ist der Normalfall in Vermessungsdaten — die Neigung muss dann
    nicht geraten werden, sie steckt in den Daten.
    """
    id: str
    type: Literal["boeschung"]
    oberkante: list[Point3]
    unterkante: list[Point3]
    kanten_breite: float = 0.0       # Bruchkantenwirkung außerhalb des Bands
    # Aus welchen Vermessungskanten abgeleitet. Nicht leer heißt:
    # „Kanten verknüpfen" erzeugt diese Operation neu. Wer sie von
    # Hand ändern will, leert das Feld — dann bleibt sie stehen.
    aus_kanten: list[str] = []


class OpAussenkante(_Objekt):
    """
    Die Höhe am Rand des Modellgebiets. Außerhalb der äußersten
    Vermessungslinie ist nichts gemessen — dort führt der Import die
    NÄCHSTGELEGENE bekannte Höhe fort. Das ist ein Notbehelf: die
    Außenkante folgt dadurch jeder Welle der Oberkante, obwohl da in
    Wirklichkeit nur „Gelände läuft weiter" steht.

    Diese Operation setzt stattdessen eine bestimmte Außenkante — im
    Regelfall vier Eckpunkte am Gebietsrand, jeder mit eigener Höhe — und
    blendet zwischen der inneren Bezugskante und ihr linear über. Damit
    entscheidet der Bearbeiter, wie das Gelände nach außen ausläuft,
    statt es dem Zufall der nächsten Messung zu überlassen.
    """
    id: str
    type: Literal["aussenkante"]
    # Rahmen mit Höhe je Eckpunkt. OHNE Angabe läuft das Gelände von der
    # inneren Bezugskante mit `gefaelle` bis an den Gebietsrand weiter —
    # das ist der Regelfall und braucht keine Handarbeit.
    polygon: list[Point3] | None = None
    # Höhenänderung je Meter nach außen. 0 = das Gelände bleibt auf der
    # Höhe der Bezugskante (Plateau hinter der Krone), negativ = es fällt
    # ab, positiv = es steigt an.
    gefaelle: float = 0.0
    # Innere Bezugskante: id einer Böschung (deren Oberkante) oder einer
    # Bruchkante. Ohne Angabe wird die erste Böschungsoberkante im
    # Operationsstapel genommen.
    innen: str | None = None


TerrainOp = Annotated[
    Union[OpChannelCarve, OpPad, OpRaiseLower, OpSmooth,
          OpRamp, OpEmbankment, OpReplaceRegion, OpSetLevel,
          OpBruchkante, OpBoeschung, OpAussenkante],
    Field(discriminator="type"),
]


# Oberflächenmaterial: bestimmt die äquivalente Sandrauheit k_s der
# Wandfunktion (nutkRoughWallFunction) — hydraulisch DER Unterschied
# zwischen Stahl, Beton und Erdböschung. None = glatte Standardwand.
Material = Literal["stahl", "beton_glatt", "beton", "mauerwerk", "holz",
                   "erde", "steinschuettung"]


class Terrain(_Model):
    base: TerrainBase
    # Was in der Zeichnung steht (mit Rolle) — getrennt von dem, was daraus
    # für das Gelände folgt
    kanten: list[Vermessungskante] = []
    operations: list[TerrainOp] = []
    material: Material = "erde"
    material_ks: float | None = None
    # Maße des Erdkörpers (früher die Pseudo-Operation
    # „Berechnungskörper" — ein No-op im Höhenfeld, das Audit fand sie als
    # Schicht-(c)-Steuerung im Schicht-(b)-Stapel). Ohne Angabe gilt die
    # Vorbelegung: Sohle vier Zellen unter dem tiefsten Punkt, seitlich
    # zwei Zellen Überstand — nötig, weil eine Körperwand GENAU auf der
    # Gebietsfläche snappyHexMesh gegen sich selbst schneidet.
    erdkoerper_unterkante: float | None = None
    erdkoerper_ueberstand: float | None = None
    # DER Schalter, ob das Gelände als geschlossener ERDKÖRPER an den
    # Vernetzer geht (nur so trägt es Bohrungen und Aushübe) oder als
    # offene Höhenfläche. "auto" = die eine Inferenz in
    # solids.braucht_erdkoerper (Körperdatei, durchstoßender Durchlass, Aushub) — vorher entschieden diese vier
    # Auslöser verstreut und ohne Übersteuerungsmöglichkeit.
    erdkoerper: Literal["auto", "an", "aus"] = "auto"
    # Sculpt-Ebene: frei geformte Höhenänderung (Pinsel im Editor) als
    # Delta-Raster im Fallordner (core/sculpt.py) — Primärdatum, kein
    # derived; wirkt VOR dem Operationsstapel (die Operationen behalten
    # ihre Sollhöhen). `sculpt_stand` ist der
    # Inhalts-Stempel des Rasters, damit case_hash und Netzvorschau jede
    # Formung mitbekommen, obwohl das Delta in einer Datei liegt.
    sculpt: str | None = None
    sculpt_stand: str | None = None


# --------------------------------------------------------------------------
# structures (Bauwerkskatalog, Spez. 6.3)
# --------------------------------------------------------------------------

class Alignment(_Model):
    kind: Literal["polyline"] = "polyline"
    points: list[Point3]


# --------------------------------------------------------------------------
# Bearbeitungen — gelten für JEDES Bauwerk, auch importierte Körper.
# Sie werden nach dem Bau des Grundkörpers der Reihe nach angewandt, also
# wie ein Stapel: erst zuschneiden, dann Loch bohren, dann heilen.
# --------------------------------------------------------------------------

class EditAussparung(_Objekt):
    """
    Durchgehende Öffnung: Rohrdurchführung, Schütz, Entleerung.
    Lage entweder über `station` (Abstand entlang der Bauwerksachse; beim
    Becken entlang des Umfangs) oder über `point` — Letzteres ist der Weg
    für importierte Körper, die keine Achse haben. `z` ist die
    MITTELhöhe der Öffnung.
    """
    id: str
    type: Literal["aussparung"] = "aussparung"
    shape: Literal["kreis", "rechteck"] = "kreis"
    station: float | None = None
    point: Point2 | None = None       # Alternative zu station
    direction: Point2 | None = None   # Bohrrichtung; ohne Angabe aus der Achse
    z: float = 0.0
    diameter: float | None = None
    width: float | None = None
    height: float | None = None
    radius: float = 0.0               # Eckenausrundung beim Rechteck
    vertikal: bool = False            # senkrecht bohren (Schacht/Sohlöffnung)

    @model_validator(mode="after")
    def _masse(self):
        if self.shape == "kreis" and self.diameter is None:
            raise ValueError(f"Aussparung {self.id}: Kreis braucht diameter")
        if self.shape == "rechteck" and (self.width is None
                                         or self.height is None):
            raise ValueError(f"Aussparung {self.id}: Rechteck braucht "
                             "width und height")
        if self.station is None and self.point is None:
            raise ValueError(f"Aussparung {self.id}: station oder point "
                             "angeben")
        return self


class EditSchnitt(_Objekt):
    """
    Abschneiden an einer waagerechten oder senkrechten Ebene — z. B.
    „alles über 100,50 m weg" (Kronenhöhe kappen) oder ein importierter
    Körper, der seitlich aus dem Modell ragt.
    """
    id: str
    type: Literal["schnitt"] = "schnitt"
    achse: Literal["x", "y", "z"] = "z"
    position: float
    behalten: Literal["unter", "ueber"] = "unter"


class EditAufGebiet(_Objekt):
    """
    Auf das Modellgebiet zuschneiden. Importierte CAD-Körper ragen fast
    immer über den Rand hinaus; snappyHexMesh quittiert das mit
    zerrissenen Flächen.
    """
    id: str
    type: Literal["auf_gebiet"] = "auf_gebiet"
    rand: float = 0.0                 # Sicherheitsabstand nach innen


class EditTransform(_Objekt):
    """Verschieben, um z drehen, skalieren — Einpassen von Importen."""
    id: str
    type: Literal["transform"] = "transform"
    verschieben: Point3 = (0.0, 0.0, 0.0)
    drehen_deg: float = 0.0
    skalieren: float = 1.0


class EditHeilen(_Objekt):
    """
    Löcher schließen und Normalen richten. Für importierte Netze, die
    nicht wasserdicht sind — ohne das lehnt die Prüfung sie ab.
    """
    id: str
    type: Literal["heilen"] = "heilen"


class EditGelaende(_Objekt):
    """
    Anschluss an das Gelände. Ein Körper, der über dem Gelände endet, lässt
    Wasser darunter durchlaufen (der Vernetzer baut dort brav Zellen); ein
    Körper, der tief in den Boden reicht, kostet nur Dreiecke und macht
    schlechte Zellen. Beides erledigt dieser Schritt:
    `einbinden` zieht den Körper bis unter das Gelände herunter, `kappen`
    schneidet das Übertiefe weg, `auto` macht beides. Bezug ist das
    NIEDRIGSTE Gelände unter dem Körper — nur so bleibt nirgends ein Spalt.
    """
    id: str
    type: Literal["gelaende"] = "gelaende"
    modus: Literal["auto", "einbinden", "kappen"] = "auto"
    einbindetiefe: float = 0.3        # wie weit unter Gelände der Körper endet


Edit = Annotated[
    Union[EditAussparung, EditSchnitt, EditAufGebiet, EditTransform,
          EditHeilen, EditGelaende],
    Field(discriminator="type"),
]


# Wirkung eines Bauwerkskörpers auf das Modell.
#
# Seit das Gelände ein geschlossener Erdkörper sein kann, ist jedes Bauwerk
# eine Kombination aus Aushub und Bauteil — wie auf der Baustelle: Beton ist,
# was übrig bleibt; Wasser ist, was ausgehoben wurde.
#
#   bauteil — der Körper wird als eigene Fläche vernetzt (Wand, Pfeiler, Wehr)
#   aushub  — der Körper wird aus dem Geländekörper HERAUSGESCHNITTEN und
#             bekommt keine eigene Fläche; seine Wandungen gehören danach zur
#             Geländefläche. Erzwingt den Erdkörper, weil ein Höhenfeld
#             (ein z je x/y) keinen Hohlraum tragen kann.
#   auto    — aus der LAGE entschieden: liegt die Oberkante auf oder unter
#             dem gewachsenen Gelände, ist der Körper eingegraben und wirkt
#             als Aushub; steht er heraus, ist er ein Bauteil. Damit ergibt
#             sich der Aushub aus dem Verschieben und nicht aus einem
#             Schalter — ein neu abgesetzter Schacht steht zunächst auf dem
#             Gelände. Gilt nur für die Aushub-Grundtypen (Schacht, Kammer,
#             Graben): eine in den Boden geschobene WAND soll keine Grube
#             werden, sondern eine eingegrabene Wand bleiben.
Wirkung = Literal["auto", "bauteil", "aushub"]


class StructWall(_Objekt):
    id: str
    type: Literal["wall"]
    patch: str
    alignment: Alignment
    height: float                 # konstant; je Stützpunkt über points[i].z
    thickness: float
    batter_deg: float = 0.0       # optionale Neigung
    # Aus welchen Vermessungskanten dieses Bauteil abgeleitet wurde. Nicht
    # leer heißt: beim nächsten Verknüpfen wird es neu erzeugt. Wer es von
    # Hand ändern will, leert das Feld — dann gilt es als eigenes.
    aus_kanten: list[str] = []
    wirkung: Wirkung = "bauteil"
    edits: list[Edit] = []      # Aussparungen, Schnitte, Transformationen
    material: Material | None = None
    material_ks: float | None = None  # eigene Sandrauheit (m), überschreibt material


class ScreenResistance(_Model):
    model: Literal["darcy_forchheimer"] = "darcy_forchheimer"
    d: Vec3 = (0.0, 0.0, 0.0)
    f: Vec3 = (0.0, 0.0, 0.0)
    blockage_ratio: float = 0.0   # angesetzter Verlegungsgrad


class StructScreen(_Objekt):
    id: str
    type: Literal["screen"]
    patch: str
    plane_polygon: list[Point3]
    bar_spacing: float            # lichte Stabteilung (Achsabstand)
    bar_thickness: float
    bar_depth: float = 0.06       # Stabtiefe in Anströmrichtung
    # Stabform nach Kirschmer: bestimmt den Formbeiwert der Verlustableitung
    bar_shape: Literal["rechteck", "rund", "tropfen"] = "rechteck"
    approach_angle_deg: float = 90.0
    resistance: ScreenResistance
    wirkung: Wirkung = "bauteil"
    edits: list[Edit] = []      # Aussparungen, Schnitte, Transformationen
    material: Material | None = None
    material_ks: float | None = None  # eigene Sandrauheit (m), überschreibt material


class CulvertProfile(_Model):
    kind: Literal["circular", "rectangular", "arch"]
    diameter: float | None = None
    width: float | None = None
    height: float | None = None

    @model_validator(mode="after")
    def _dims(self):
        if self.kind == "circular" and self.diameter is None:
            raise ValueError("Kreisprofil braucht diameter")
        if self.kind in ("rectangular", "arch") and (self.width is None or self.height is None):
            raise ValueError(f"{self.kind}-Profil braucht width und height")
        return self


class StructCulvert(_Objekt):
    id: str
    type: Literal["culvert"]
    patch: str
    axis: list[Point3]
    profile: CulvertProfile
    # Rohr durch den Damm/die Böschung: das Gelände ist ein Höhenfeld (ein z
    # je x/y) und kann von sich aus keinen Tunnel haben — ein vergrabenes
    # Rohr hat deshalb kein Inneres, der Vernetzer räumt es weg. Mit diesem
    # Schalter wird das Gelände als geschlossener Körper gebaut und die
    # Rohrbohrung ausgeschnitten: erst dann steht die Leitung wirklich
    # durch. Kostet Rechenzeit beim Fallaufbau, deshalb nicht die Regel.
    durchstoesst_gelaende: bool = False
    # Wofür der Stutzen da ist. Der Zeichnungslayer weiß es („Einlauf",
    # „Auslauf", „Drossel"), und ohne dieses Feld ging es beim Import
    # verloren: aus beiden Kreisen wurde derselbe Stutzen. Dieselbe
    # Überlegung wie bei [[Vermessungskante.rolle]] — was in der Zeichnung
    # steht, bleibt am Objekt und wird später zur Kopplung gebraucht, wenn
    # die Lage allein nicht entscheidet (zwei Rohre an derselben Randfläche).
    rolle: Literal["zulauf", "ablauf"] | None = None
    wirkung: Wirkung = "bauteil"
    edits: list[Edit] = []      # Aussparungen, Schnitte, Transformationen
    material: Material | None = None
    material_ks: float | None = None  # eigene Sandrauheit (m), überschreibt material


class StructWeir(_Objekt):
    id: str
    type: Literal["weir"]
    patch: str
    crest_polyline: list[Point3]  # z je Stützpunkt = Kronenhöhe
    crest_width: float
    slope_upstream: float
    slope_downstream: float
    # Profilart: Trapez (Dachwehr), breitkronig (Block), scharfkantig
    # (Messwehr-Platte), rundkronig (gerundete Krone)
    profile_type: Literal["trapez", "breitkronig", "scharfkantig",
                          "rundkronig"] = "trapez"
    base_level: float | None = None   # Fußhöhe; ohne Angabe: min. Krone − 2 m
    aus_kanten: list[str] = []        # siehe StructWall.aus_kanten
    wirkung: Wirkung = "bauteil"
    edits: list[Edit] = []      # Aussparungen, Schnitte, Transformationen
    material: Material | None = None
    material_ks: float | None = None  # eigene Sandrauheit (m), überschreibt material


class StructPier(_Objekt):
    id: str
    type: Literal["pier"]
    patch: str
    # Formvarianten: polygon (freier Grundriss), rechteck, rund, tropfen —
    # die parametrischen Formen arbeiten mit Mittelpunkt + Abmessungen
    shape: Literal["polygon", "rechteck", "rund", "tropfen"] = "polygon"
    footprint: list[Point2] = []      # nur für shape=polygon
    center: Point2 | None = None      # für rechteck/rund/tropfen
    length: float | None = None       # rechteck/tropfen: in Achsrichtung
    width: float | None = None        # Breite bzw. Durchmesser (rund)
    rotation_deg: float = 0.0
    base_level: float
    top_level: float
    wirkung: Wirkung = "bauteil"
    edits: list[Edit] = []      # Aussparungen, Schnitte, Transformationen
    material: Material | None = None
    material_ks: float | None = None  # eigene Sandrauheit (m), überschreibt material

    @model_validator(mode="after")
    def _form_parameter(self):
        if self.shape == "polygon":
            if len(self.footprint) < 3:
                raise ValueError(f"Pfeiler {self.id}: Grundrisspolygon braucht "
                                 "mindestens 3 Punkte")
        else:
            if self.center is None or self.width is None:
                raise ValueError(f"Pfeiler {self.id}: {self.shape} braucht "
                                 "center und width")
            if self.shape in ("rechteck", "tropfen") and self.length is None:
                raise ValueError(f"Pfeiler {self.id}: {self.shape} braucht length")
        return self


class StructBasin(_Objekt):
    id: str
    type: Literal["basin"]
    patch: str
    footprint: list[Point2]
    invert_level: float
    invert_slope: float = 0.0         # Sohlgefälle (Höhe je Länge)
    invert_slope_dir: Point2 | None = None   # Gefällerichtung; None = längste
                                             # Ausdehnung des Grundrisses
    wall_height: float
    wall_thickness: float
    wirkung: Wirkung = "bauteil"
    edits: list[Edit] = []      # Aussparungen, Schnitte, Transformationen

    material: Material | None = None
    material_ks: float | None = None  # eigene Sandrauheit (m), überschreibt material


class StructImported(_Objekt):
    id: str
    type: Literal["imported"]
    patch: str
    source: str                   # STL-Datei
    # Rolle des importierten Körpers: steuert Farbe/Label im Editor,
    # Material-Vorbelegung und ob der Patch in die Kraftauswertung gehört.
    # Die parametrischen Typen (wall/pier/…) bleiben dem Zeichnen vorbehalten.
    role: Literal["wand", "pfeiler", "wehr", "becken",
                  "bauwerk"] = "bauwerk"
    insert_point: Point3 = (0.0, 0.0, 0.0)
    rotation_deg: float = 0.0
    wirkung: Wirkung = "bauteil"
    edits: list[Edit] = []      # Aussparungen, Schnitte, Transformationen
    material: Material | None = None
    material_ks: float | None = None  # eigene Sandrauheit (m), überschreibt material


# --------------------------------------------------------------------------
# Aushub-Grundtypen (Stufe B)
#
# Drei Formen decken den Zielbestand ab: senkrechter Schacht, rechteckige
# Kammer, Profilsweep entlang einer Achse. Jede kann Hohlraum (`aushub`)
# oder Beton (`bauteil`) sein — dieselben Maße, zweimal eingesetzt, ergeben
# das echte Bauwerk: der Aushub nimmt die lichte Weite PLUS Wandstärke, das
# Bauteil die Schale dazwischen.
# --------------------------------------------------------------------------

class StructSchacht(_Objekt):
    """Senkrechter Schacht (Straßenablauf, Kontrollschacht, Pumpensumpf)."""
    id: str
    type: Literal["schacht"]
    patch: str
    shape: Literal["rund", "rechteck"] = "rund"
    center: Point2
    width: float                      # lichte Weite bzw. Durchmesser
    length: float | None = None       # rechteck: lichte Länge (None = width)
    rotation_deg: float = 0.0
    invert_level: float               # Sohle
    top_level: float                  # Oberkante (Deckel bzw. Geländehöhe)
    wall_thickness: float = 0.0
    wirkung: Wirkung = "auto"
    edits: list[Edit] = []
    material: Material | None = None
    material_ks: float | None = None

    @model_validator(mode="after")
    def _masse(self):
        if self.top_level <= self.invert_level:
            raise ValueError(f"Schacht {self.id}: Oberkante muss über der "
                             "Sohle liegen")
        if self.width <= 0:
            raise ValueError(f"Schacht {self.id}: lichte Weite muss > 0 sein")
        return self


class StructKammer(_Objekt):
    """
    Kammer mit freiem Grundriss (Drossel-, Trenn-, Verteilerbauwerk,
    Stauraum). Der Grundriss ist die LICHTE Innenkante.
    """
    id: str
    type: Literal["kammer"]
    patch: str
    footprint: list[Point2]
    invert_level: float
    top_level: float
    invert_slope: float = 0.0         # Sohlgefälle (Höhe je Länge)
    wall_thickness: float = 0.0
    wirkung: Wirkung = "auto"
    edits: list[Edit] = []
    material: Material | None = None
    material_ks: float | None = None

    @model_validator(mode="after")
    def _masse(self):
        if len(self.footprint) < 3:
            raise ValueError(f"Kammer {self.id}: Grundriss braucht mindestens "
                             "3 Punkte")
        if self.top_level <= self.invert_level:
            raise ValueError(f"Kammer {self.id}: Oberkante muss über der Sohle "
                             "liegen")
        return self


class GrabenProfil(_Model):
    """Querschnitt eines Grabens; `height` ist die Höhe über der Sohle."""
    kind: Literal["rechteck", "trapez", "kreis", "maul"] = "trapez"
    width: float                      # Sohlbreite, bei kreis der Durchmesser
    height: float | None = None       # nicht bei kreis
    side_slope: float = 1.5           # nur trapez: 1:n

    @model_validator(mode="after")
    def _dims(self):
        if self.kind != "kreis" and self.height is None:
            raise ValueError(f"{self.kind}-Profil braucht height")
        return self


class StructGraben(_Objekt):
    """
    Profilsweep entlang einer Achse: Graben, Stauraumkanal, Zulaufrinne.
    z je Achspunkt ist die SOHLHÖHE — das Gefälle steckt damit in der Achse
    und muss nicht getrennt angegeben werden.
    """
    id: str
    type: Literal["graben"]
    patch: str
    axis: list[Point3]
    profile: GrabenProfil
    wall_thickness: float = 0.0
    wirkung: Wirkung = "auto"
    edits: list[Edit] = []
    material: Material | None = None
    material_ks: float | None = None

    @model_validator(mode="after")
    def _achse(self):
        if len(self.axis) < 2:
            raise ValueError(f"Graben {self.id}: Achse braucht mindestens "
                             "2 Punkte")
        return self


Structure = Annotated[
    Union[StructWall, StructScreen, StructCulvert, StructWeir,
          StructPier, StructBasin, StructImported,
          StructSchacht, StructKammer, StructGraben],
    Field(discriminator="type"),
]


# --------------------------------------------------------------------------
# mesh
# --------------------------------------------------------------------------

class RefineBox(_Objekt):
    id: str
    type: Literal["box"]
    extent: tuple[float, float, float, float, float, float]  # x0 y0 z0 x1 y1 z1
    level: int


class RefineSurface(_Objekt):
    id: str
    type: Literal["surface"]
    target: str                   # Struktur-ID
    level: int


Refinement = Annotated[Union[RefineBox, RefineSurface], Field(discriminator="type")]


class BoundaryLayers(_Model):
    patches: list[str] = []
    n_layers: int = 3
    expansion_ratio: float = 1.2


class Mesh(_Model):
    base_cell: float
    refinements: list[Refinement] = []
    boundary_layers: BoundaryLayers | None = None


# --------------------------------------------------------------------------
# boundaries
# --------------------------------------------------------------------------

DomainFace = Literal["x_min", "x_max", "y_min", "y_max", "z_max"]


class BcWindow(_Model):
    """
    Fenster auf der Randfläche: der Zu-/Ablauf wirkt nicht auf der ganzen
    Gebietsseite, sondern nur in diesem Rechteck. Entweder fest über
    span = [von, bis] entlang der Kante (y-Werte auf x-Flächen, x-Werte auf
    y-Flächen), oder mit follow = id einer channel_carve-Geländeoperation:
    dann leitet sich das Fenster aus dem Gerinnequerschnitt am Gebietsrand
    ab (Öffnungsbreite Sohle + Böschungen, Sohlhöhe bis Einschnittkante)
    und wandert mit dem Gerinne mit. z_min/z_max überschreiben die
    Automatik; ohne Angabe gilt beim span-Fenster die volle Gebietshöhe.
    Der Rest der Fläche wird Wand (topoSet-faceSet + createPatch,
    Patch randwand_<id>).

    Formen (shape): rechteck nutzt span + z_min/z_max; kreis (Rohrmündung)
    nutzt center/z_center/diameter — frei in der Höhe, auch über dem
    Gelände (Freistrahl); trapez (Gerinnequerschnitt) nutzt center,
    bottom_width, top_width, z_min (Sohle) und z_max (Oberkante).
    Alle Formen entstehen als Face-Auswahl auf dem Gebietsrand und sind
    daher in Zellauflösung treppig — Netzverfeinerung am Fenster glättet.
    """
    shape: Literal["rechteck", "kreis", "trapez", "polygon"] = "rechteck"
    span: tuple[float, float] | None = None
    follow: str | None = None
    z_min: float | None = None
    z_max: float | None = None
    center: float | None = None      # kreis/trapez: Lage entlang der Kante
    z_center: float | None = None    # kreis: Achshöhe der Rohrmündung
    diameter: float | None = None    # kreis
    bottom_width: float | None = None  # trapez: Sohlbreite
    top_width: float | None = None     # trapez: Breite an der Oberkante
    # polygon: frei gezeichneter Querschnitt als [(Kante, Höhe), …] —
    # Grundlage auch für Ei-/Maul-/Tropfenprofile (Editor-Vorlagen)
    points: list[tuple[float, float]] | None = None


class _Bc(_Objekt):
    id: str
    patch: str
    # Zuordnung zum Gebietsrand für blockMesh. Ohne Angabe gilt die
    # Vorbelegung: erster Zufluss x_min, erster Abfluss x_max,
    # Atmosphäre z_max (meshgen._assign_faces).
    face: DomainFace | None = None
    window: BcWindow | None = None


class BcInflowHydrograph(_Bc):
    type: Literal["inflow_hydrograph"]
    source: str                   # CSV
    column_time: str = "t"
    column_q: str = "Q"


class BcInflowConstant(_Bc):
    type: Literal["inflow_constant"]
    q: float


class BcOutflowFixedLevel(_Bc):
    type: Literal["outflow_fixed_level"]
    level: float


class BcOutflowFree(_Bc):
    type: Literal["outflow_free"]


class BcOutflowConstant(_Bc):
    """
    Ablauf mit VORGEGEBENEM Durchfluss — die Drossel. Für die Frage, was
    VOR dem Rohr passiert (Anströmung, Einlaufwirbel, Verlusthöhe), ist das
    die richtige Randbedingung: der Drosselabfluss ist die Bemessungsgröße,
    die Rohrhydraulik dahinter interessiert nicht. Das Fenster muss dabei
    eingestaut sein, sonst zieht die Randbedingung auch Luft ab.
    """
    type: Literal["outflow_constant"]
    q: float


class BcAtmosphere(_Bc):
    type: Literal["atmosphere"]


Boundary = Annotated[
    Union[BcInflowHydrograph, BcInflowConstant, BcOutflowFixedLevel,
          BcOutflowFree, BcOutflowConstant, BcAtmosphere],
    Field(discriminator="type"),
]


# --------------------------------------------------------------------------
# solver
# --------------------------------------------------------------------------

class Vorfuellung(_Objekt):
    """
    Teilbereich, der mit Wasser auf EIGENER Höhe startet — ein Becken
    beginnt vorgefüllt, der Rest des Gebiets folgt `initial_level` (bzw.
    startet trocken). Gesetzt wird das über setFields: das Polygon wird
    als Prisma bis zur Höhe extrudiert und surfaceToCell setzt alpha=1.
    Reihenfolge zählt: spätere Bereiche überschreiben frühere.
    """
    id: str
    type: Literal["vorfuellung"] = "vorfuellung"
    polygon: list[Point2]
    level: float                  # Wasserspiegel im Bereich (m NHN)


class Solver(_Model):
    # LTSInterFoam ist BEWUSST nicht wählbar: das lokale Zeitschema
    # (localEuler) und die eigene PIMPLE-Steuerung sind nicht verdrahtet —
    # ein Enum-Wert, der nur existiert, um von der Prüfung verboten zu
    # werden, wäre eine Falle (Audit U26). Kommt mit Fahrplan-Stufe F wieder.
    application: Literal["interFoam"] = "interFoam"
    end_time: float
    max_co: float = 0.5
    max_alpha_co: float = 0.3
    turbulence: Literal["kOmegaSST", "kEpsilon", "laminar"] = "kOmegaSST"
    write_interval_fields: float = 10.0
    write_interval_series: float = 0.1
    initial_level: float | None = None    # Anfangswasserspiegel für setFields
    # Teilbereiche mit eigenem Startwasserspiegel (Becken vorgefüllt
    # starten) — wirken NACH initial_level
    vorfuellungen: list[Vorfuellung] = []


# --------------------------------------------------------------------------
# evaluation (Spez. 2 + 4.1) — steuert functionObjects UND PostProzessing
# --------------------------------------------------------------------------

class Section(_Objekt):
    id: str
    polyline: list[Point2]


class Gauge(_Objekt):
    id: str
    point: Point2


class TargetDischargeRatio(_Objekt):
    id: str
    kind: Literal["discharge_ratio"]
    of: str                       # Section-ID Zähler
    to: str                       # Section-ID Nenner
    limit_max: float | None = None
    limit_min: float | None = None


class TargetMaxLevel(_Objekt):
    id: str
    kind: Literal["max_level"]
    at: str                       # Gauge-ID
    limit_max: float | None = None


class TargetMaxForce(_Objekt):
    id: str
    kind: Literal["max_force"]
    at: str                       # Patch-/Struktur-ID
    component: Literal["x", "y", "z", "magnitude"] = "magnitude"
    limit_max: float | None = None


class TargetMinBedShear(_Objekt):
    id: str
    kind: Literal["min_bed_shear"]
    region: str
    limit_min: float | None = None


class TargetMaxBedShear(_Objekt):
    """Sohlensicherung: τ_max ≤ τ_zulässig (Steinklasse/Material)."""
    id: str
    kind: Literal["max_bed_shear"]
    region: str
    limit_max: float | None = None


class TargetOverfallCd(_Objekt):
    """
    Überfallbeiwert eines Wehrs: C_d = Q / (2/3·√(2g)·b·h^1.5) aus dem
    Durchfluss über den Querschnitt, dem Oberwasserstand am Pegel und
    Kronenhöhe/-länge des Wehrs. Ohne Grenzwerte informativ.
    """
    id: str
    kind: Literal["overfall_cd"]
    weir: str                     # Struktur-ID (weir)
    section: str                  # Querschnitt mit Q über das Wehr
    gauge: str                    # Oberwasser-Pegelpunkt
    limit_max: float | None = None
    limit_min: float | None = None


class TargetMassenbilanz(_Objekt):
    """|Speicheränderung|/Zufluss am Laufende — die 2 %/10 %-Ampel des
    Bilanzpanels als benanntes Kriterium (0.02 = eingeschwungen)."""
    id: str
    kind: Literal["massenbilanz"]
    limit_max: float | None = 0.02


class TargetKurzschluss(_Objekt):
    """t10/τ aus der Tracer-Durchbruchskurve — unter 0,3 läuft ein Teil des
    Zuflusses praktisch direkt durch (Absetzwirkung zählt ihn nicht mit)."""
    id: str
    kind: Literal["kurzschluss"]
    limit_min: float | None = 0.3


class TargetVerweilzeitMin(_Objekt):
    """Mindest-Verweilzeit t50 (s) aus der Durchbruchskurve."""
    id: str
    kind: Literal["verweilzeit_min"]
    limit_min: float | None = None


class TargetHeadDifference(_Objekt):
    id: str
    kind: Literal["head_difference"]
    upstream: str                 # Section-ID
    downstream: str
    limit_max: float | None = None


Target = Annotated[
    Union[TargetMassenbilanz, TargetKurzschluss, TargetVerweilzeitMin,
          TargetDischargeRatio, TargetMaxLevel, TargetMaxForce,
          TargetMinBedShear, TargetMaxBedShear, TargetHeadDifference,
          TargetOverfallCd],
    Field(discriminator="kind"),
]


class Evaluation(_Model):
    sections: list[Section] = []
    gauges: list[Gauge] = []
    force_patches: list[str] = []
    targets: list[Target] = []
    # Verweilzeit: ein mitgerechneter Markierungsstoff tritt ab t = 0 mit dem
    # Zufluss ein; seine Durchbruchskurve am Ablauf beantwortet die Frage,
    # die man einem Becken wirklich stellt — wie lange bleibt das Wasser,
    # gibt es einen Kurzschluss, wie groß ist das tote Volumen.
    verweilzeit: bool = False

    # HINWEIS: dass jedes Nachweiskriterium auf eine existierende
    # Auswertungsgröße verweist, ist eine PRÜFregel (Spez. Kap. 7,
    # „Auswertung") und keine Schemaregel — sie steht in
    # validate._verweise_pruefen.
    #
    # Sie stand hier einmal als harter `model_validator` und machte den Fall
    # damit im Zwischenzustand unlesbar: wer einen Pegel löschte, auf den ein
    # Kriterium zeigte, bekam 422 aus der Entwurfsvorschau (Szene fror auf
    # dem Stand VOR dem Löschen ein) UND aus dem Speichern — der einzige Weg
    # heraus war Undo. Ein Editor muss einen ungültigen Zwischenstand
    # darstellen und speichern können; verhindert wird der LAUF, und das tut
    # die Prüfung (der Startknopf sperrt bei Fehlern).


# --------------------------------------------------------------------------
# Gesamtfall
# --------------------------------------------------------------------------

# Felder, die es einmal gab und die nie eine Wirkung hatten. `extra="forbid"`
# ist scharf — ohne diese Liste ließe sich kein alter Fall mehr öffnen.
def migriere(daten: dict) -> dict:
    """Alte case.yaml lesbar halten: entfallene Angaben still verwerfen."""
    if not isinstance(daten, dict):
        return daten
    for st in daten.get("structures") or []:
        if isinstance(st, dict):
            st.pop("cutwater", None)
            # Importkörper aus der Zeit vor dem herkunft-Feld
            if st.get("type") == "imported" and not st.get("herkunft"):
                st["herkunft"] = "import"
            # "spline" war wählbar, aber nie gebaut — ehrlich: polyline
            al = st.get("alignment")
            if isinstance(al, dict) and al.get("kind") == "spline":
                al["kind"] = "polyline"
    terrain = daten.get("terrain")
    if isinstance(terrain, dict):
        ops = terrain.get("operations")
        if isinstance(ops, list):
            # Pseudo-Operation „Berechnungskörper" → Eigenschaft am Gelände
            reste = [o for o in ops if not (isinstance(o, dict)
                     and o.get("type") == "berechnungskoerper")]
            for o in ops:
                if isinstance(o, dict) and o.get("type") == "berechnungskoerper":
                    # "auto" ist der Schema-Default und zaehlt nicht als
                    # bewusste Wahl — die Operation MEINTE "an"
                    if terrain.get("erdkoerper") in (None, "auto"):
                        terrain["erdkoerper"] = "an"
                    if o.get("unterkante") is not None:
                        terrain.setdefault("erdkoerper_unterkante",
                                           o["unterkante"])
                    if o.get("ueberstand") is not None:
                        terrain.setdefault("erdkoerper_ueberstand",
                                           o["ueberstand"])
            if len(reste) != len(ops):
                terrain["operations"] = reste
    meta = daten.get("meta")
    if isinstance(meta, dict):
        crs = meta.get("crs")
        if isinstance(crs, dict):
            crs.pop("origin", None)
            crs.pop("rotation_deg", None)
        # Alte Verortung (zwei Felder, zwei Drehkonventionen) in die eine
        # transform-Abbildung überführen. Die alten Felder stammten aus der
        # IMPORT-Konvention: erst Offset abziehen, dann um den Ursprung
        # drehen — daraus folgt t = −R(θ)·off.
        off = meta.pop("crs_offset", None)
        rot = float(meta.pop("crs_rotation_deg", 0.0) or 0.0)
        if (off or rot) and not meta.get("transform"):
            ox, oy = (float(off[0]), float(off[1])) if off else (0.0, 0.0)
            c, s = _rot2(rot)
            meta["transform"] = {
                "rotation_deg": rot % 360.0,
                "translation": [-(c * ox - s * oy), -(s * ox + c * oy)]}
    return daten


# Teile des Falls, die das NETZ bestimmen: Gebiet und Basiszelle
# (blockMesh), Gelände und Bauwerke (snappyHexMesh), Verfeinerungen und
# Grenzschichten, und die Randbedingungen — deren Fenster schneiden über
# topoSet/createPatch die Flächen zu.
#
# Bewusst NICHT dabei: meta, solver, evaluation. Ein geänderter Grenzwert,
# eine andere Simulationsdauer oder ein verschobener Pegel ändern kein
# einziges Netzelement. Über den GESAMTEN Fall gehasht entwerteten sie
# trotzdem die Vorschau — die Meldung „Vorschaunetz gehört zu einem älteren
# Stand" stand deshalb nach fast jeder Eingabe.
NETZ_TEILE = ("domain", "terrain", "structures", "mesh", "boundaries")


class CaseSpec(_Model):
    meta: Meta
    domain: Domain | None = None
    terrain: Terrain | None = None
    structures: list[Structure] = []
    mesh: Mesh | None = None
    boundaries: list[Boundary] = []
    solver: Solver
    evaluation: Evaluation = Evaluation()

    # Auch der Kraftpatch eines max_force-Kriteriums wird in der PRÜFUNG
    # kontrolliert, nicht im Schema — aus demselben Grund wie oben.

    # -- Laden / Speichern -------------------------------------------------

    @classmethod
    def from_yaml(cls, path: str | Path) -> "CaseSpec":
        with open(path, encoding="utf-8") as f:
            return cls.model_validate(migriere(yaml.safe_load(f)))

    def to_yaml(self, path: str | Path) -> None:
        data = self.model_dump(mode="json", exclude_none=True)
        with open(path, "w", encoding="utf-8") as f:
            yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True)

    def datei_referenzen(self) -> list[str]:
        """
        Alle Dateien, auf die der Fall RELATIV verweist — Geländequelle,
        Pinsel-Ebene, Volumenkörper, Quellraster von Bereichsersetzungen,
        importierte STL, Ganglinien-CSV.

        EINE Liste, weil sie an mehreren Stellen gebraucht wird (Bundle
        für den lokalen Lauf, Vollständigkeitsprüfung). Vorher zählte das
        Bundle sie von Hand auf und vergaß dabei die Pinsel-Ebene: der
        lokale Lauf rechnete durch, konnte danach aber kein Gelände
        aufbauen — im Ergebnis fehlte die Geländeschicht in 3D
        (2026-08-11 an Rentrisch_BetaTest06).
        """
        namen: list[str] = []
        if self.terrain is not None:
            b = self.terrain.base
            if not b.source.startswith("flat:"):
                namen.append(b.source)
            for opt in (b.koerper, b.original, self.terrain.sculpt):
                if opt:
                    namen.append(opt)
            for op in self.terrain.operations:
                quelle = getattr(op, "source", None)
                if quelle:
                    namen.append(quelle)
        for st in self.structures:
            quelle = getattr(st, "source", None)
            if quelle:
                namen.append(quelle)
        for b in self.boundaries:
            quelle = getattr(b, "source", None)
            if quelle:
                namen.append(quelle)
        # Reihenfolge erhalten, Doppelte raus
        return list(dict.fromkeys(namen))

    def case_hash(self) -> str:
        """Hash über den fachlichen Inhalt, für das Laufmanifest (Spez. 4.4)."""
        blob = json.dumps(self.model_dump(mode="json"), sort_keys=True)
        return hashlib.sha256(blob.encode()).hexdigest()[:16]

    def netz_hash(self) -> str:
        """Hash über alles, was die Vernetzung bestimmt — und sonst nichts."""
        daten = self.model_dump(mode="json")
        teil = {k: daten.get(k) for k in NETZ_TEILE}
        blob = json.dumps(teil, sort_keys=True)
        return hashlib.sha256(blob.encode()).hexdigest()[:16]

    @classmethod
    def json_schema(cls) -> dict:
        """JSON-Schema für die Formularerzeugung im Frontend (Spez. Kap. 11)."""
        return cls.model_json_schema()
