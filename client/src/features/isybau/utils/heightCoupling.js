/**
 * Deckelhöhe/Sohlhöhe/Tiefe-Kopplung (coverZ - z = depth), genutzt von
 * PreprocessingModal.vue und ElementInfo.vue. Alle Vergleiche bewusst mit
 * != null, NIE mit reinem Truthy-Check — eine echte Höhe/Tiefe von 0.00 ist
 * ein gültiger Wert und darf nicht wie "nicht gesetzt" behandelt werden.
 */
export const round2 = (v) => Math.round(v * 100) / 100;

/** Deckelhöhe geändert -> Tiefe neu (Sohle bleibt Referenz). */
export function depthFromCoverAndZ(coverZ, z) {
    if (coverZ == null || z == null) return null;
    return round2(coverZ - z);
}

/** Tiefe ODER Sohlhöhe geändert -> Deckelhöhe neu (Deckel folgt). */
export function coverZFromZAndDepth(z, depth) {
    if (z == null || depth == null) return null;
    return round2(z + depth);
}
