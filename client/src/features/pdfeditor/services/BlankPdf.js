/**
 * BlankPdf — leere Zeichenblätter (pdf-lib): frisches A4/A3 in Hoch- oder
 * Querformat für den Startbildschirm, und „+ Seite" hängt an ein offenes
 * Dokument eine leere Seite im Format der LETZTEN Seite an (inkl. /Rotate).
 */

import { PDFDocument, PageSizes } from 'pdf-lib';

const FORMATE = {
    A4: PageSizes.A4,   // [595.28, 841.89]
    A3: PageSizes.A3,   // [841.89, 1190.55]
};

/**
 * @param {'A4'|'A3'} format
 * @param {'hoch'|'quer'} ausrichtung
 * @returns {Promise<Uint8Array>}
 */
export async function erzeugeLeeresPdf(format = 'A4', ausrichtung = 'hoch') {
    const [breite, hoehe] = FORMATE[format] ?? FORMATE.A4;
    const doc = await PDFDocument.create();
    doc.addPage(ausrichtung === 'quer' ? [hoehe, breite] : [breite, hoehe]);
    return doc.save();
}

/**
 * Hängt eine leere Seite im Format (und mit der Rotation) der letzten
 * Seite an. Funktioniert für jedes ladbare PDF, nicht nur für Blätter
 * aus erzeugeLeeresPdf.
 * @param {ArrayBuffer|Uint8Array} bytes
 * @returns {Promise<Uint8Array>}
 */
export async function haengeLeereSeiteAn(bytes) {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const letzte = doc.getPage(doc.getPageCount() - 1);
    const { width, height } = letzte.getSize();
    const neue = doc.addPage([width, height]);
    neue.setRotation(letzte.getRotation());
    return doc.save();
}
