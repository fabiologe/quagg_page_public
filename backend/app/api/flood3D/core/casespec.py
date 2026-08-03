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
from pathlib import Path
from typing import Annotated, Literal, Union

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

Point2 = tuple[float, float]
Point3 = tuple[float, float, float]
Vec3 = tuple[float, float, float]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --------------------------------------------------------------------------
# meta
# --------------------------------------------------------------------------

class Crs(_Model):
    """
    Bezugssystem als Dokumentation des Nachweises (steht im Ergebnis).
    Verschoben wird über `Meta.crs_offset` — ein zweiter, nie angewandter
    Ursprung mit Drehung hat nur Verwirrung gestiftet.
    """
    epsg: int


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
    # Beim CAD-Import abgezogene Landeskoordinate (x, y). Rechnen in
    # UTM-Zahlen ruiniert float32-Viewer und snappy — der Fall lebt lokal,
    # dieser Wert macht die Rückverortung möglich.
    crs_offset: tuple[float, float] | None = None
    # Drehung des lokalen Systems gegenüber der Landeskoordinate (Grad,
    # gegen den Uhrzeigersinn). Wird beim Import EINMAL auf alle Geometrie
    # angewandt, damit das achsparallele Rechengebiet eng um ein schräg
    # liegendes Bauwerk passt.
    crs_rotation_deg: float = 0.0


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


class OpChannelCarve(_Model):
    id: str
    type: Literal["channel_carve"]
    polyline: list[Point2]
    invert_start: float
    invert_end: float
    bottom_width: float
    depth: float
    side_slope: float


class OpPad(_Model):
    id: str
    type: Literal["pad"]
    polygon: list[Point2]
    level: float


class OpRaiseLower(_Model):
    id: str
    type: Literal["raise_lower"]
    center: Point2
    radius: float
    strength: float               # positiv hebt an, negativ senkt ab
    falloff: Literal["smooth", "linear", "constant"] = "smooth"


class OpSmooth(_Model):
    id: str
    type: Literal["smooth"]
    center: Point2
    radius: float
    strength: float
    polygon: list[Point2] | None = None


class OpRamp(_Model):
    id: str
    type: Literal["ramp"]
    polygon: list[Point2]
    level_start: float
    level_end: float
    direction: Point2             # Interpolationsrichtung im Grundriss


class OpEmbankment(_Model):
    id: str
    type: Literal["embankment"]
    polyline: list[Point2]
    crest_level: float
    crest_width: float
    side_slope: float


class OpReplaceRegion(_Model):
    id: str
    type: Literal["replace_region"]
    polygon: list[Point2]
    source: str                   # Quellraster


class OpSetLevel(_Model):
    id: str
    type: Literal["set_level"]
    polygon: list[Point2]
    level: float
    blend_width: float = 0.0


class OpBruchkante(_Model):
    """
    Bruchkante mit Höhe je Stützpunkt — so kommen Böschungs-, Mauer- und
    Sohlkanten aus der Vermessung (3D-Polylinie im DXF). Das Gelände wird
    innerhalb der Wirkungsbreite auf die Linie gezogen und nach außen
    linear ausgeblendet, sodass keine Stufe stehen bleibt.
    `modus` entscheidet, ob die Kante das Gelände in beide Richtungen
    verändert (ziehen) oder nur abgräbt bzw. aufschüttet.
    """
    id: str
    type: Literal["bruchkante"]
    polyline: list[Point3]
    breite: float = 1.0
    modus: Literal["ziehen", "absenken", "anheben"] = "ziehen"


class OpBoeschung(_Model):
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


class OpAussenkante(_Model):
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
    polygon: list[Point3]              # Rahmen, Höhe je Eckpunkt
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
    operations: list[TerrainOp] = []
    material: Material = "erde"
    material_ks: float | None = None


# --------------------------------------------------------------------------
# structures (Bauwerkskatalog, Spez. 6.3)
# --------------------------------------------------------------------------

class Alignment(_Model):
    kind: Literal["polyline", "spline"] = "polyline"
    points: list[Point3]


# --------------------------------------------------------------------------
# Bearbeitungen — gelten für JEDES Bauwerk, auch importierte Körper.
# Sie werden nach dem Bau des Grundkörpers der Reihe nach angewandt, also
# wie ein Stapel: erst zuschneiden, dann Loch bohren, dann heilen.
# --------------------------------------------------------------------------

class EditAussparung(_Model):
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


class EditSchnitt(_Model):
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


class EditAufGebiet(_Model):
    """
    Auf das Modellgebiet zuschneiden. Importierte CAD-Körper ragen fast
    immer über den Rand hinaus; snappyHexMesh quittiert das mit
    zerrissenen Flächen.
    """
    id: str
    type: Literal["auf_gebiet"] = "auf_gebiet"
    rand: float = 0.0                 # Sicherheitsabstand nach innen


class EditTransform(_Model):
    """Verschieben, um z drehen, skalieren — Einpassen von Importen."""
    id: str
    type: Literal["transform"] = "transform"
    verschieben: Point3 = (0.0, 0.0, 0.0)
    drehen_deg: float = 0.0
    skalieren: float = 1.0


class EditHeilen(_Model):
    """
    Löcher schließen und Normalen richten. Für importierte Netze, die
    nicht wasserdicht sind — ohne das lehnt die Prüfung sie ab.
    """
    id: str
    type: Literal["heilen"] = "heilen"


class EditGelaende(_Model):
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


class StructWall(_Model):
    id: str
    type: Literal["wall"]
    patch: str
    alignment: Alignment
    height: float                 # konstant; je Stützpunkt über points[i].z
    thickness: float
    batter_deg: float = 0.0       # optionale Neigung
    edits: list[Edit] = []      # Aussparungen, Schnitte, Transformationen
    material: Material | None = None
    material_ks: float | None = None  # eigene Sandrauheit (m), überschreibt material


class ScreenResistance(_Model):
    model: Literal["darcy_forchheimer"] = "darcy_forchheimer"
    d: Vec3 = (0.0, 0.0, 0.0)
    f: Vec3 = (0.0, 0.0, 0.0)
    blockage_ratio: float = 0.0   # angesetzter Verlegungsgrad


class StructScreen(_Model):
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


class StructCulvert(_Model):
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
    edits: list[Edit] = []      # Aussparungen, Schnitte, Transformationen
    material: Material | None = None
    material_ks: float | None = None  # eigene Sandrauheit (m), überschreibt material


class StructWeir(_Model):
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
    edits: list[Edit] = []      # Aussparungen, Schnitte, Transformationen
    material: Material | None = None
    material_ks: float | None = None  # eigene Sandrauheit (m), überschreibt material


class StructPier(_Model):
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


class StructBasin(_Model):
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
    edits: list[Edit] = []      # Aussparungen, Schnitte, Transformationen

    material: Material | None = None
    material_ks: float | None = None  # eigene Sandrauheit (m), überschreibt material


class StructImported(_Model):
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
    edits: list[Edit] = []      # Aussparungen, Schnitte, Transformationen
    material: Material | None = None
    material_ks: float | None = None  # eigene Sandrauheit (m), überschreibt material


Structure = Annotated[
    Union[StructWall, StructScreen, StructCulvert, StructWeir,
          StructPier, StructBasin, StructImported],
    Field(discriminator="type"),
]


# --------------------------------------------------------------------------
# mesh
# --------------------------------------------------------------------------

class RefineBox(_Model):
    id: str
    type: Literal["box"]
    extent: tuple[float, float, float, float, float, float]  # x0 y0 z0 x1 y1 z1
    level: int


class RefineSurface(_Model):
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


class _Bc(_Model):
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

class Solver(_Model):
    application: Literal["interFoam", "LTSInterFoam"] = "interFoam"
    end_time: float
    max_co: float = 0.5
    max_alpha_co: float = 0.3
    turbulence: Literal["kOmegaSST", "kEpsilon", "laminar"] = "kOmegaSST"
    write_interval_fields: float = 10.0
    write_interval_series: float = 0.1
    initial_level: float | None = None    # Anfangswasserspiegel für setFields


# --------------------------------------------------------------------------
# evaluation (Spez. 2 + 4.1) — steuert functionObjects UND PostProzessing
# --------------------------------------------------------------------------

class Section(_Model):
    id: str
    polyline: list[Point2]


class Gauge(_Model):
    id: str
    point: Point2


class TargetDischargeRatio(_Model):
    id: str
    kind: Literal["discharge_ratio"]
    of: str                       # Section-ID Zähler
    to: str                       # Section-ID Nenner
    limit_max: float | None = None
    limit_min: float | None = None


class TargetMaxLevel(_Model):
    id: str
    kind: Literal["max_level"]
    at: str                       # Gauge-ID
    limit_max: float | None = None


class TargetMaxForce(_Model):
    id: str
    kind: Literal["max_force"]
    at: str                       # Patch-/Struktur-ID
    component: Literal["x", "y", "z", "magnitude"] = "magnitude"
    limit_max: float | None = None


class TargetMinBedShear(_Model):
    id: str
    kind: Literal["min_bed_shear"]
    region: str
    limit_min: float | None = None


class TargetMaxBedShear(_Model):
    """Sohlensicherung: τ_max ≤ τ_zulässig (Steinklasse/Material)."""
    id: str
    kind: Literal["max_bed_shear"]
    region: str
    limit_max: float | None = None


class TargetOverfallCd(_Model):
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


class TargetHeadDifference(_Model):
    id: str
    kind: Literal["head_difference"]
    upstream: str                 # Section-ID
    downstream: str
    limit_max: float | None = None


Target = Annotated[
    Union[TargetDischargeRatio, TargetMaxLevel, TargetMaxForce,
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

    @model_validator(mode="after")
    def _targets_referenzieren_existierendes(self):
        # Spez. Kap. 7, Auswertung: jedes Nachweiskriterium verweist auf eine
        # existierende Auswertungsgröße. Kraftpatches werden erst auf
        # CaseSpec-Ebene geprüft, weil dort auch Struktur-Patches zählen.
        sec = {s.id for s in self.sections}
        gau = {g.id for g in self.gauges}
        for t in self.targets:
            if t.kind == "discharge_ratio":
                fehlt = {t.of, t.to} - sec
                if fehlt:
                    raise ValueError(f"Target {t.id}: unbekannte Querschnitte {sorted(fehlt)}")
            elif t.kind == "max_level" and t.at not in gau:
                raise ValueError(f"Target {t.id}: unbekannter Pegelpunkt {t.at}")
            elif t.kind == "head_difference":
                fehlt = {t.upstream, t.downstream} - sec
                if fehlt:
                    raise ValueError(f"Target {t.id}: unbekannte Querschnitte {sorted(fehlt)}")
            elif t.kind == "overfall_cd":
                if t.section not in sec:
                    raise ValueError(f"Target {t.id}: unbekannter Querschnitt {t.section}")
                if t.gauge not in gau:
                    raise ValueError(f"Target {t.id}: unbekannter Pegelpunkt {t.gauge}")
        return self


# --------------------------------------------------------------------------
# Gesamtfall
# --------------------------------------------------------------------------

# Felder, die es einmal gab und die nie eine Wirkung hatten. `extra="forbid"`
# ist scharf — ohne diese Liste ließe sich kein alter Fall mehr öffnen.
_ENTFALLEN = {
    ("structures", "*"): ["cutwater"],
    ("meta", "crs"): ["origin", "rotation_deg"],
}


def migriere(daten: dict) -> dict:
    """Alte case.yaml lesbar halten: entfallene Angaben still verwerfen."""
    if not isinstance(daten, dict):
        return daten
    for st in daten.get("structures") or []:
        if isinstance(st, dict):
            st.pop("cutwater", None)
    crs = (daten.get("meta") or {}).get("crs")
    if isinstance(crs, dict):
        crs.pop("origin", None)
        crs.pop("rotation_deg", None)
    return daten


class CaseSpec(_Model):
    meta: Meta
    domain: Domain | None = None
    terrain: Terrain | None = None
    structures: list[Structure] = []
    mesh: Mesh | None = None
    boundaries: list[Boundary] = []
    solver: Solver
    evaluation: Evaluation = Evaluation()

    @model_validator(mode="after")
    def _force_patches_existieren(self):
        patches = {s.patch for s in self.structures}
        for t in self.evaluation.targets:
            if t.kind == "max_force" and self.structures and t.at not in patches:
                raise ValueError(f"Target {t.id}: Kraftpatch {t.at} ist kein Bauwerkspatch")
        return self

    # -- Laden / Speichern -------------------------------------------------

    @classmethod
    def from_yaml(cls, path: str | Path) -> "CaseSpec":
        with open(path, encoding="utf-8") as f:
            return cls.model_validate(migriere(yaml.safe_load(f)))

    def to_yaml(self, path: str | Path) -> None:
        data = self.model_dump(mode="json", exclude_none=True)
        with open(path, "w", encoding="utf-8") as f:
            yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True)

    def case_hash(self) -> str:
        """Hash über den fachlichen Inhalt, für das Laufmanifest (Spez. 4.4)."""
        blob = json.dumps(self.model_dump(mode="json"), sort_keys=True)
        return hashlib.sha256(blob.encode()).hexdigest()[:16]

    @classmethod
    def json_schema(cls) -> dict:
        """JSON-Schema für die Formularerzeugung im Frontend (Spez. Kap. 11)."""
        return cls.model_json_schema()
