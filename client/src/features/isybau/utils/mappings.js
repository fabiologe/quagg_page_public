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
export const MaterialRoughness = {
    "PVC": 90,
    "Beton": 70,
    "Metall": 90,
    "Kies": 40,
    "Sand": 50,
    "Wiese": 30,
    "Verkrautet": 10,
    "Erde": 25,
    "Steinzeug": 85, // Common fallback
    "Mauerwerk": 60, // Common fallback
    "Unbekannt": 70
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
    // Simple lookup, could be improved with fuzzy matching
    if (!material) return MaterialRoughness["Unbekannt"];

    // Sort keys by length descending to match most specific first (e.g. "Stahlbeton" before "Beton")
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
