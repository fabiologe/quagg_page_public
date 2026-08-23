/**
 * Ebenen-Ansichtsmodi (Sprint U, AP-U5) — reine Logik, ohne Vue/Engine.
 *
 * Drei Modi:
 *   'alle' — jede Ebene sichtbar (Normalzustand)
 *   'solo' — nur die gewählte Ebene
 *   'bis'  — alle Ebenen bis einschließlich der gewählten, von unten gezählt
 *            (Bauzustand, Blick unter das Gelände)
 *
 * Ein „explodierter" Modus fehlt bewusst: `@thatopen/fragments` kann einzelne
 * Elemente nicht verschieben (nur ein-/ausblenden), die Geometrie liegt in
 * Batches. Ein nachgebauter Versatz wäre eine Attrappe.
 */

export const STOREY_MODES = Object.freeze(['alle', 'solo', 'bis']);

/** Schlüssel einer Ebene — Modell-ID ist Teil davon (Mehrmodell-Projekte). */
export function storeyKey(s) {
    return `${s.modelId}:${s.localId}`;
}

/**
 * Welche Ebenen sind im gegebenen Modus sichtbar?
 *
 * @param {Array<{modelId, localId, elevation}>} storeys
 * @param {{modelId, localId}|null} aktiv
 * @param {'alle'|'solo'|'bis'} modus
 * @returns {Map<string, boolean>} Schlüssel → sichtbar
 */
export function sichtbarkeitFuerModus(storeys, aktiv, modus) {
    const out = new Map();
    const liste = [...(storeys ?? [])].sort((a, b) => a.elevation - b.elevation);

    // Ohne gewählte Ebene ergeben 'solo'/'bis' keinen Sinn → alles sichtbar
    const aktivEintrag = aktiv
        ? liste.find(s => s.localId === aktiv.localId && s.modelId === aktiv.modelId)
        : null;
    const wirksam = aktivEintrag ? modus : 'alle';

    for (const s of liste) {
        let sichtbar = true;
        if (wirksam === 'solo') {
            sichtbar = s.localId === aktivEintrag.localId && s.modelId === aktivEintrag.modelId;
        } else if (wirksam === 'bis') {
            sichtbar = s.elevation <= aktivEintrag.elevation + 1e-6;
        }
        out.set(storeyKey(s), sichtbar);
    }
    return out;
}

/**
 * Nur die Ebenen, deren Sichtbarkeit sich gegenüber dem Ist-Zustand ändert —
 * so schaltet die Engine nicht bei jedem Klick alles durch.
 *
 * @param {Map<string, boolean>} ziel
 * @param {Set<string>} versteckt  aktuell ausgeblendete Schlüssel
 * @returns {Array<{key: string, visible: boolean}>}
 */
export function aenderungen(ziel, versteckt) {
    const out = [];
    for (const [key, sichtbar] of ziel) {
        const istSichtbar = !versteckt.has(key);
        if (istSichtbar !== sichtbar) out.push({ key, visible: sichtbar });
    }
    return out;
}
