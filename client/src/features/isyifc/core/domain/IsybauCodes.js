/**
 * ISYBAU Reference Lists (G-Tables)
 * Source: A-7.9.2 Referenzlisten Stammdaten
 */

export const IsybauCodes = {
    // Tab. A-7 - 237 G100 Objektart
    Objektart: {
        1: "Kante",
        2: "Knoten"
    },

    // Tab. A-7 - 259 G205 Profilart
    Profilart: {
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
        10: "U-förmig (kreisförmige Sohle mit parallelen Wänden)",
        11: "Bogenförmig (kreisförmiger Scheitel und flache Sohle mit parallelen Wänden)",
        12: "oval (Sohle und Scheitel kreisförmig mit gleichem Durchmesser und parallelen Wänden)",
        13: "andere Profilart",
        14: "Eiprofil überhöht",
        15: "Eiprofil breit",
        16: "Eiprofil gedrückt",
        17: "Maulprofil überhöht",
        18: "Maulprofil gedrückt",
        19: "Maulprofil gestreckt",
        20: "Maulprofil gestaucht",
        21: "Parabelprofil",
        22: "Drachenprofil",
        23: "Kreisprofil gestreckt"
    },

    // Helper to map Code keys for Logic
    ProfilCodes: {
        KREIS: 0,
        EI: 1,
        MAUL: 2,
        RECHTECK_GESCHLOSSEN: 3,
        RECHTECK_OFFEN: 5,
        TRAPEZ: 8,
        EI_SONSTIG: 6,
        // Add more as needed
    },

    // Tab. A-7 - 239 G102 Material
    Material: {
        'AZ': "Asbestzement",
        'B': "Beton",
        'BS': "Betonsegmente",
        'CNS': "Edelstahl",
        'EIS': "Nicht identifiziertes Eisen und Stahl",
        'FZ': "Faserzement",
        'GFK': "Glasfaserverstärkter Kunststoff",
        'GG': "Grauguss",
        'GGG': "Duktiles Gusseisen",
        'GJS': "Gusseisen mit Kugelgraphit",
        'KST': "Nicht identifizierter Kunststoff",
        'MA': "Mauerwerk",
        'OB': "Ortbeton",
        'PE': "Polyethylen",
        'PP': "Polypropylen",
        'PVC': "Polyvinylchlorid",
        'SB': "Stahlbeton",
        'ST': "Stahl",
        'STZ': "Steinzeug",
        'ZG': "Ziegelwerk",
        'MIX': "unterschiedliche Werkstoffe"
    },

    // Tab. A-7 - 270 G300 Knotentyp
    Knotentyp: {
        0: "Schacht",
        1: "Anschlusspunkt",
        2: "Bauwerk"
    },

    // Tab. A-7 - 271 G301 SchachtFunktion
    SchachtFunktion: {
        1: "Regelschacht",
        2: "Sonderschacht",
        3: "Kontrollschacht",
        4: "Drosselschacht",
        5: "Lampenschacht",
        6: "Probenahmeschacht",
        7: "Hausrevisionsschacht",
        8: "Verbindungsschacht",
        10: "Inspektionsöffnung",
        13: "Drainageschacht",
        17: "Absturzschacht (Schwanenhals)",
        18: "Absturzschacht (Kaskade)"
    },

    // Tab. A-7 - 281 G400 Bauwerkstyp
    Bauwerkstyp: {
        1: "Pumpwerk",
        2: "Becken",
        3: "Behandlungsanlage",
        4: "Kläranlage",
        5: "Auslaufbauwerk",
        7: "Wehr/Überlauf",
        12: "Versickerungsanlage",
        13: "Regenwassernutzungsanlage",
        14: "Einlaufbauwerk"
    },

    resolve: (table, code) => {
        if (table && table[code]) return table[code];
        return code; // Fallback to returning the code itself if not found
    }
};
