export const Flaechenfunktion = {
    1: "Dachfläche",
    2: "Grünfläche",
    3: "Verkehrsfläche",
    4: "sonstige Funktion",
    5: "Funktion nicht bekannt"
};

export const Flaechenart = {
    1: "Einzel-/ Elementarfläche",
    2: "Sammelfläche",
    3: "Hauptfläche"
};

export const Flaecheneigenschaft = {
    1: "befestigt",
    2: "teilbefestigt",
    3: "unbefestigt",
    4: "natürlich",
    5: "keine Information"
};

export const Flaechennutzung = {
    1: "intensive landwirtschaftliche Nutzung",
    2: "extensive landwirtschaftliche Nutzung",
    3: "fließender motorisierter Verkehr",
    4: "fließender nicht motorisierter Verkehr",
    5: "ruhender Verkehr, PKW",
    6: "ruhender Verkehr, LKW",
    7: "technischer Bereich, PKW",
    8: "technischer Bereich, LKW",
    9: "keine Nutzung",
    10: "sonstige Nutzung"
};

export const Verschmutzungsklasse = {
    1: "F1, geringe Verschmutzung",
    2: "F2, geringe Verschmutzung",
    3: "F3, geringe Verschmutzung",
    4: "F4, mittlere Verschmutzung",
    5: "F5, mittlere Verschmutzung",
    6: "F6, starke Verschmutzung",
    7: "F7, starke Verschmutzung"
};

export const Neigungsklasse = {
    1: "≤1%",
    2: "< 1% bis 4%",
    3: "< 4 % bis 10 %",
    4: "< 10 % bis 14 %",
    5: "> 14 %"
};

export const Profilart = {
    0: "Kreisprofil",
    1: "Eiprofil (H/B=3/2)",
    2: "Maulprofil (H/B = 1,66/2)",
    3: "Rechteckprofil (geschlossen)",
    4: "Kreisprofil (doppelwandig)",
    5: "Rechteckprofil (offen)",
    6: "Eiprofil (H/B ungleich 3/2)",
    7: "Maulprofil (H/B ungleich 1,66/2)",
    8: "Trapezprofil",
    9: "Doppeltrapezprofil",
    10: "U-förmig",
    11: "Bogenförmig",
    12: "oval",
    13: "andere Profilart"
};

// Standard Manning-Strickler Roughness (kst)
// Standard Manning-Strickler Roughness (kst) - UI Options
export const MaterialRoughness = {
    "Kunststoff": 95,
    "Beton": 80,
    "Steinzeug": 90,
    "Metall": 90,
    "Mauerwerk": 60,
    "Kies": 40,
    "Sand": 50,
    "Wiese": 30,
    "Verkrautet": 10,
    "Erde": 25,
    "Unbekannt": 70
};

// Internal Mapping for ISYBAU Codes (Material -> kSt)
const IsybauRoughnessMap = {
    // Beton-Gruppe
    "B": 80, "SB": 80, "BS": 80, "OB": 80, "P": 80, "PC": 85, "PCC": 80, "SPB": 80, "SFB": 80, "SZB": 75, "AZ": 85, "FZ": 85, "PHB": 85,
    // Steinzeug / Mauerwerk
    "STZ": 90, "MA": 60, "ZG": 65,
    // Kunststoff
    "PVC": 95, "PVCU": 95, "PE": 95, "PEHD": 95, "PP": 95, "GFK": 95, "GFKC": 95, "GFUP": 95, "GFVE": 95, "KST": 95, "PH": 90, "SFEP": 95, "SFUP": 95, "SFVE": 95, "TGEP": 95,
    // Metall
    "ST": 90, "CNS": 90, "GG": 85, "GGG": 90, "GJS": 90, "EIS": 80,
    // Natur / Sonst
    "BOD": 30, "RAS": 25, "PFL": 60, "W": 70, "MIX": 70
};

// Standard Runoff Coefficients (Psi)
// Using Flaechenart codes
export const SurfaceRunoff = {
    1: 0.90, // befestigt
    2: 0.50, // teilbefestigt
    3: 0.10, // unbefestigt
    4: 0.05, // natürlich
    5: 0.50  // keine Information (Conservative average)
};

// Also map Flaechenfunktion for fallback
export const FunctionRunoff = {
    1: 1.0, // Dach
    2: 0.1, // Grün
    3: 0.9, // Verkehr
    4: 0.5, // Sonstige
    5: 0.5  // Unbekannt
};

export const Status = {
    0: "vorhanden (in Betrieb)",
    1: "geplant",
    2: "fiktiv",
    3: "außer Betrieb",
    4: "verdämmt",
    5: "Sonstige"
};

export const Bauwerkstyp = {
    1: "Pumpwerk",
    2: "Becken",
    3: "Behandlungsanlage",
    4: "Klaeranlage",
    5: "Auslaufbauwerk",
    6: "Pumpe",
    7: "Wehr/Überlauf",
    8: "Drossel",
    9: "Schieber",
    10: "Rechen",
    11: "Sieb",
    12: "Versickerungsanlage",
    13: "Regenwassernutzungsanlage",
    14: "Einlaufbauwerk"
};

// Spiegelt SwmmBuilder.classifyAndAddNodes()/addLinks() (core/services/SwmmBuilder.js) —
// von BEIDEN Stellen genutzt, damit die Preprocessing-Tabelle exakt zeigt, welchem
// SWMM-Objekt ein Bauwerksknoten tatsächlich zugeordnet wird, unabhängig davon,
// welche Eingabefelder das UI gerade für den gewählten Typ anzeigt (z.B. Pumpwerk(1)/
// Behandlungsanlage(3)/Klaeranlage(4) zeigen Pumpen-/Becken-Felder, landen aber je
// nach Volumen in unterschiedlichen SWMM-Sektionen).
const STORAGE_BTYPES = new Set([1, 2, 12, 13]);
const OUTFALL_BTYPES = new Set([3, 4, 5]);
// Pumpe/Wehr/Drossel/Schieber: der Knoten bleibt [JUNCTIONS], aber seine (erste)
// ausgehende Haltung wird zum benannten SWMM-Sonderlink umgebogen (addLinks()).
// Einzige Quelle, exportiert, damit ElementInfo/ResultsNodesTab/Viewer3DInfoPanel/
// SwmmBuilder nicht mehr je eine eigene Kopie dieser Menge pflegen.
export const LINK_BAUWERKSTYPEN = new Set([6, 7, 8, 9]);
export const LINK_SECTION_BY_BTYP = { 6: '[PUMPS]', 7: '[WEIRS]', 8: '[ORIFICES]', 9: '[ORIFICES]' };

export const getEffectiveBauwerkstyp = (node) => {
    if (node.bauwerkstyp != null) return node.bauwerkstyp;
    const t = parseInt(node.type);
    return isNaN(t) ? null : t;
};

// Entwässerungsart (ISYBAU <Entwaesserungsart>, Werte KM/KR/KS) — Farbkennung
// nach Kanaltyp. Steht laut Schema sowohl an Kanten (Haltungen) als auch an
// Knoten (Schächte) direkt an der AbwassertechnischeAnlage. Single Source of
// Truth für 2D-SVG (IsybauViewer.vue) und 3D-Szene (useSceneBuilder.js),
// damit beide Renderer nie auseinanderlaufen.
export const ENTWAESSERUNGSART_COLOR = {
    KR: '#3498db', // Regenwasser — Blau
    KS: '#8b5a2b', // Schmutzwasser — Braun
    KM: '#9b59b6', // Mischwasser — Lila
};
export const ENTWAESSERUNGSART_DEFAULT_COLOR = '#000000'; // unbekannt/nicht klassifiziert — Schwarz

export const getEntwaesserungsartColor = (value) => ENTWAESSERUNGSART_COLOR[value] || ENTWAESSERUNGSART_DEFAULT_COLOR;

/**
 * @param {object} node - Knoten mit type/bauwerkstyp/volume/bauwerkData/is_sink/punktkennung
 * @returns {{ section: string, linkSection: string|null }} SWMM-Zielsektion(en)
 *   (der globale "kein Auslauf gefunden"-Fallback auf den tiefsten Knoten wird hier
 *   NICHT abgebildet, da er den gesamten Netzkontext braucht)
 */
export const classifyPreview = (node) => {
    const btyp = getEffectiveBauwerkstyp(node);
    const typeStr = String(node.type);
    const volume = parseFloat(node.volume) || 0;
    const hasVolume = volume > 0 || (node.bauwerkData?.volume != null && node.bauwerkData.volume > 0);

    if (hasVolume || STORAGE_BTYPES.has(btyp)) {
        return { section: '[STORAGE]', linkSection: null };
    }
    const isOutfall = OUTFALL_BTYPES.has(btyp) || typeStr === 'Auslaufbauwerk' || node.is_sink === true
        || (typeStr === 'Anschlusspunkt' && node.punktkennung === 'NN');
    if (isOutfall) {
        return { section: '[OUTFALLS]', linkSection: null };
    }
    if (LINK_BAUWERKSTYPEN.has(btyp)) {
        return { section: '[JUNCTIONS]', linkSection: LINK_SECTION_BY_BTYP[btyp] };
    }
    // Flow-Divider: kein ISYBAU-Bauwerkstyp (1-14 hat keinen passenden Eintrag) —
    // String-Sentinel analog zum generischen 'Bauwerk'. Beide ausgehenden Kanten
    // bleiben normale [CONDUITS], nur der Knoten bekommt einen [DIVIDERS]-Eintrag.
    if (typeStr === 'Divider') {
        return { section: '[DIVIDERS]', linkSection: null };
    }
    return { section: '[JUNCTIONS]', linkSection: null };
};

// Wehr-Kronenform-Presets (Überfallbeiwert Cw = (2/3)·μ·√(2g)) — gemeinsam von
// PreprocessingModal.vue und ElementInfo.vue genutzt, damit beide Editoren
// exakt dieselben Auswahlmöglichkeiten anbieten (vermeidet das Drift-Problem,
// das schon einmal zu inkonsistenten weirWidth/wehrWidth-Feldern geführt hat).
export const WeirCrestPresets = [
    { cw: 1.48, label: '① Breit, scharfkantig, waagerecht (μ≈0.50 → Cw=1.48)' },
    { cw: 1.55, label: '② Breit, gut abger. Kanten (μ≈0.53 → Cw=1.55)' },
    { cw: 2.04, label: '③ Breit, vollst. abgerundet (μ≈0.69 → Cw=2.04)' },
    { cw: 1.89, label: '④ Scharfkantig, Strahl belüftet (μ≈0.64 → Cw=1.89)' },
    { cw: 2.19, label: '⑤ Rundkronig, lotrechte OW-Seite (μ≈0.74 → Cw=2.19)' },
    { cw: 2.27, label: '⑥ Dachförmig, abgerundete Krone (μ≈0.77 → Cw=2.27)' },
];

// Eintrittsverlustbeiwert (Kentry) für Rechen/Sieb/Einlaufbauwerk (SWMM [LOSSES]).
// Richtwerte aus der Kirschmer-Formel für Rechen/Siebe bzw. üblichen
// Einlauf-Verlustbeiwerten — grobe Orientierung, kein Solver-Fixwert, da der
// tatsächliche Wert von Stababstand/-form, Anströmwinkel und Verschmutzungsgrad
// abhängt. Von PreprocessingModal.vue UND ElementInfo.vue genutzt (eine Quelle).
export const LossCoeffHints = {
    10: 'Rechen (grob): Richtwert 0,5 (sauber) – 1,5 (teilverstopft)',
    11: 'Sieb (fein): Richtwert 1,0 – 3,0 (steigt mit Verschmutzungsgrad)',
    14: 'Einlaufbauwerk: Richtwert 0,2 – 0,5 (scharfkantiger Einlauf)',
};
export const LossCoeffDefaults = { 10: 0.5, 11: 1.5, 14: 0.3 };
export const lossCoeffHint = (type) => LossCoeffHints[type] ?? 'Eintrittsverlustbeiwert Kentry (SWMM [LOSSES]) — Haltung bleibt normaler Kanal';

export const getMapping = (category, code) => {
    if (category === 'Flaechenfunktion') return Flaechenfunktion[code] || code;
    if (category === 'Flaechenart') return Flaechenart[code] || code;
    if (category === 'Flaecheneigenschaft') return Flaecheneigenschaft[code] || code;
    if (category === 'Flaechennutzung') return Flaechennutzung[code] || code;
    if (category === 'Verschmutzungsklasse') return Verschmutzungsklasse[code] || code;
    if (category === 'Neigungsklasse') return Neigungsklasse[code] || code;
    if (category === 'Profilart') return Profilart[code] || code;
    if (category === 'Status') return Status[code] || code;
    return code;
};

export const getRoughness = (material) => {
    if (!material) return MaterialRoughness["Unbekannt"];

    // 1. Direct Lookup in UI Options (e.g. "Beton")
    if (MaterialRoughness[material]) return MaterialRoughness[material];

    // 2. Lookup in ISYBAU Codes (e.g. "STZ", "B")
    if (IsybauRoughnessMap[material]) return IsybauRoughnessMap[material];

    // 3. Fuzzy Search (Fallback)
    // Sort keys by length descending to match most specific first
    const keys = Object.keys(MaterialRoughness).sort((a, b) => b.length - a.length);
    for (const key of keys) {
        if (material.includes(key)) return MaterialRoughness[key];
    }

    return MaterialRoughness["Unbekannt"];
};

// Horton Infiltration Parameters (Max, Min, Decay, DryTime, MaxInfil)
// Based on Green-Ampt/Horton Soil Types
export const getHortonParams = (func) => {
    // defaults: maxRate (mm/hr), minRate (mm/hr), decay (1/hr), dryTime (days), maxInfil (mm)

    // 1: Dachfläche (Impervious - no infiltration actually, but for pervious part?)
    // Usually Dächer have 0 infiltration. But swmm applies this to the pervious part.
    // If it's a Green Roof (Gründach), it behaves like Soil.
    // Let's assume standard Roof is impervious.
    // If Func 1 (Dach) -> Pervious area is likely negligible OR it's a Green Roof.
    // If Green Roof, high infiltration.
    if (func === 1) {
        // High params for potential green roof parts? Or low for slate?
        // Let's assume standard roof pervious parts are dirt/moss -> moderate.
        return { max: 50.0, min: 10.0, decay: 4.0, dry: 7.0, maxVol: 0 };
    }

    // 2: Grünfläche (High Infiltration)
    if (func === 2) {
        // Grass / Loam
        return { max: 75.0, min: 12.0, decay: 3.0, dry: 5.0, maxVol: 0 };
    }

    // 3: Verkehrsfläche (Compacted)
    if (func === 3) {
        // Compacted soil, Clay-like
        return { max: 15.0, min: 3.0, decay: 4.0, dry: 7.0, maxVol: 0 };
    }

    // 4: Sonstige (Mix)
    if (func === 4) {
        return { max: 25.0, min: 5.0, decay: 4.0, dry: 7.0, maxVol: 0 };
    }

    // Default / Unknown
    // Clay / Loam mix
    return { max: 25.0, min: 5.0, decay: 4.0, dry: 7.0, maxVol: 0 };
};

export const getRunoffCoeff = (property, func, slopeClass) => {
    // Logic based on Function and Slope (Prioritized over Type)

    // 1: Dachfläche
    if (func === 1) {
        // Slope Class 1 (<=1%) or 2 (<=4%) -> Flachdach (0.9)
        // Slope Class 3+ (>4%) -> Schrägdach (1.0)
        if (slopeClass <= 2) return 0.9;
        return 1.0;
    }

    // 2: Grünfläche
    if (func === 2) {
        // Slope Class 1 (<=1%) -> Flach (0.1)
        // Slope Class 2+ (>1%) -> Steil (0.3)
        if (slopeClass <= 1) return 0.1;
        return 0.3;
    }

    // 3: Verkehrsfläche
    if (func === 3) {
        // Default to 0.9 (Asphalt/Beton)
        return 0.9;
    }

    // 4: sonstige Funktion
    if (func === 4) {
        // Mix of Wiese/Straße -> 0.5
        return 0.5;
    }

    // 5: Funktion nicht bekannt
    if (func === 5) {
        return 0.5;
    }

    // Fallback based on Property (Surface) if available and Function didn't match
    if (SurfaceRunoff[property] !== undefined) return SurfaceRunoff[property];

    return 0.5; // Global Default
};
