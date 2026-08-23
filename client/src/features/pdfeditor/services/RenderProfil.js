/**
 * RenderProfil — misst, welche Seiten teuer zu rendern sind.
 *
 * CAD-Vektor-PDFs führen bei jedem Render hunderttausende Pfad-Operatoren
 * aus; Text-/Scan-Seiten sind billig. Die Messung entscheidet, welche Seiten
 * die Spezialbehandlung bekommen (Vorschau-Pass, Bitmap-Cache, gedeckelte
 * Auflösung) — leichte Seiten bleiben komplett unangetastet.
 *
 * Pur und DOM-frei; die Zeit liefert der Aufrufer (performance.now()).
 */

/** Ab dieser Renderzeit (ms, voller Pass) gilt eine Seite als „schwer". */
export const SCHWER_MS = 400;

const _zeiten = new Map();   // `${dokId}:${seite}` → { ms, skala }

function _key(dokId, seite) {
    return `${dokId}:${seite}`;
}

/**
 * @param {number} ms      gemessene Renderzeit des Passes
 * @param {number} skala   Render-Skala des Passes
 * @param {boolean} vollerPass  Vorschau-Pässe (11b) kalibrieren die
 *   Schwere NICHT — sie sind absichtlich verbilligt.
 */
export function merkeRenderZeit(dokId, seite, ms, skala, vollerPass = true) {
    if (!vollerPass) return;
    _zeiten.set(_key(dokId, seite), { ms, skala });
}

export function istSchwer(dokId, seite) {
    const eintrag = _zeiten.get(_key(dokId, seite));
    return !!eintrag && eintrag.ms > SCHWER_MS;
}

export function renderZeitVon(dokId, seite) {
    return _zeiten.get(_key(dokId, seite))?.ms ?? null;
}

/** Dokument entfernt/ersetzt → seine Messwerte vergessen. */
export function vergiss(dokId) {
    const praefix = `${dokId}:`;
    for (const k of _zeiten.keys()) {
        if (k.startsWith(praefix)) _zeiten.delete(k);
    }
}

export function _leereAlles() { _zeiten.clear(); }
