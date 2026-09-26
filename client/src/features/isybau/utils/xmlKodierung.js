/**
 * XML-Datei nach der Kodierung lesen, die sie selbst angibt (<?xml … encoding="…"?>).
 * ISYBAU-Dateien sind oft ISO-8859-1; File.text() las jede Datei als UTF-8 — Umlaute in
 * Straßennamen und Kommentaren kamen als „�" an und gingen beim Export verloren (P2.7/P3).
 * @param {ArrayBuffer|Uint8Array} puffer
 * @returns {string}
 */
export function dekodiereXml(puffer) {
    const bytes = puffer instanceof Uint8Array ? puffer : new Uint8Array(puffer);
    // UTF-8-BOM gewinnt
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
    const kopf = String.fromCharCode(...bytes.subarray(0, 200));
    const m = /<\?xml[^>]*encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/.exec(kopf);
    let label = (m?.[1] || 'utf-8').toLowerCase();
    try {
        return new TextDecoder(label).decode(bytes);
    } catch {
        label = 'utf-8'; // unbekannte Kodierung: wie bisher
        return new TextDecoder(label).decode(bytes);
    }
}
