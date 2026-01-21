/**
 * UnitMatrix.js
 * Defines conversion factors to normalize specific ISYBAU XML fields to METERS.
 */
export const UNIT_MATRIX = {
    // --- MILLIMETER (Factor 0.001) ---
    'ProfilBreite': 0.001,
    'ProfilHoehe': 0.001,
    'LichteWeite1': 0.001,
    'LichteWeite2': 0.001,
    'Wanddicke': 0.001,
    'Materialstaerke': 0.001,
    'RohrVa': 0.001, // Infiltration Pipe DN

    // --- CENTIMETER (Factor 0.01) ---
    'HoeheAuflageringe': 0.01,
    'HoeheDauerstau': 0.01,
    'MaxEinstauhoehe': 0.01,
    'StaerkeBodenschicht': 0.01,

    // --- METER (Factor 1.0) ---
    // Explicitly listed for safety
    'Schachttiefe': 1.0,
    'Punkthoehe': 1.0,
    'LaengeDeckel': 1.0,
    'BreiteDeckel': 1.0,
    'LaengeAufbau': 1.0,
    'Rechtswert': 1.0,
    'Hochwert': 1.0,
    'MaxLaenge': 1.0,
    'MaxBreite': 1.0,
    'Oeffnungsweite': 1.0
};

/**
 * Parses a raw XML value into a float (Meters).
 * Handles German commas (123,45) and Unit conversion.
 */
export function parseIsyValue(fieldName, rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === '') return 0;

    // 1. String Cleaning (German Comma)
    const cleanString = String(rawValue).replace(',', '.').trim();
    const num = parseFloat(cleanString);

    if (isNaN(num)) return 0;

    // 2. Apply Factor
    const factor = UNIT_MATRIX[fieldName] || 1.0;
    return num * factor;
}
