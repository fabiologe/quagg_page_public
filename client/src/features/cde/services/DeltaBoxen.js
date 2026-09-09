/**
 * Das DELTA-MODELL des fragments-Editors (Teil XVI, Nachprüfung 2026-09-08).
 *
 * Jede Bearbeitung (`editor.applyChanges`) landet in einem eigenen Modell
 * `<modelId>-DELTA-MODEL-<zeit>`, das die Bibliothek in DIESELBE Liste legt;
 * die Basis blendet das bearbeitete Bauteil aus, das Delta zeichnet es am
 * neuen Ort. Für die CDE ist das Delta KEIN Modell: Treffer, Auswahl,
 * Färbung, Verstecken und die GlobalId-Karte gehören dem Basismodell.
 *
 * Die drei Zeilen stehen HIER (und nicht in der Engine), damit auch reine
 * Dienste sie benutzen können, ohne die Engine zu importieren.
 */
export const DELTA_MARKE = '-DELTA-MODEL-';

/** Die Basis zu einer Modellkennung — ein Delta wird auf sein Basismodell abgebildet. */
export function basisModelId(id) {
    const t = String(id ?? '');
    const i = t.indexOf(DELTA_MARKE);
    return i >= 0 ? t.slice(0, i) : id;
}

export function istDeltaModell(id) { return String(id ?? '').includes(DELTA_MARKE); }

/**
 * Die AKTUELLEN Boxen eines Modells — mit dem, was der fragments-Editor
 * verschoben hat (Nachprüfung Teil XVI, 2026-09-08).
 *
 * Der Editor schreibt jede Bearbeitung in ein DELTA-MODELL
 * (`model.deltaModelId`, in derselben Liste als `…-DELTA-MODEL-…`); die Basis
 * bleibt beim Lieferstand und blendet das bearbeitete Bauteil aus. Die
 * Bibliothek führt `getItemsGeometry`/`getElements` selbst zusammen —
 * `getBoxes` NICHT (im Bibliotheksrumpf nachgesehen). Wer nur die Basis
 * fragt, sieht den Lieferort: Anker, Griff und Kamera standen nach dem Zug
 * am alten Platz, `setzeAnker` addierte doppelt (Autor), und „auf Auswahl
 * zoomen" kreiste um eine leere Stelle (Kamera). EIN Helfer für alle drei.
 *
 * Rein bis auf die Bibliotheksobjekte: kein three, kein Vue.
 *
 * @param {object} modell          FragmentsModel (Basis)
 * @param {number[]} ids           localIds
 * @param {(id:string) => object|null} holeModell   Modell nach Kennung (die Liste)
 * @returns {Promise<Array>}       je id die Delta-Box, wo es eine gibt, sonst die Basis-Box
 */
export async function boxenAktuell(modell, ids, holeModell) {
    const basis = await modell.getBoxes(ids);
    const deltaId = modell?.deltaModelId ?? null;
    const delta = deltaId ? (holeModell?.(deltaId) ?? null) : null;
    if (!delta) return basis;
    let dboxen = null;
    try { dboxen = await delta.getBoxes(ids); } catch { return basis; }
    return ids.map((_, i) => (boxBrauchbar(dboxen?.[i]) ? dboxen[i] : basis?.[i]));
}

/** Eine Box, die etwas umschliesst — das leere Delta meldet min +∞ / max −∞. */
export function boxBrauchbar(b) {
    return !!b?.min && !!b?.max
        && [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every(Number.isFinite)
        && b.min.x <= b.max.x && b.min.y <= b.max.y && b.min.z <= b.max.z;
}
