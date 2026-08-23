/**
 * PdfExporter — Burn-in-Export: lädt die ORIGINAL-Bytes (Vektorinhalt und
 * Text bleiben vollständig erhalten), zeichnet alle Annotationen als Vektor
 * über DIESELBE Painter-Routine wie der Bildschirm (PdfLibAnnotDoc) und
 * liefert die neuen Bytes. Kommentare werden als Pin eingebrannt und
 * optional als Übersichtsseite angehängt.
 */

import { PDFDocument, StandardFonts, PageSizes } from 'pdf-lib';
import { erstellePdfLibAnnotDoc } from './PdfLibAnnotDoc';
import { zeichneAnnotationen } from './AnnotationPainter';
import { kalibrierungFuerSeite } from './MeasureMath';

/**
 * @param {ArrayBuffer|Uint8Array} originalBytes
 * @param {Array} items                     alle Annotationen des Dokuments
 * @param {object|null} kalibrierung        docMeta.kalibrierung
 * @param {{kommentarSeite?: boolean}} opts
 * @returns {Promise<Uint8Array>}
 */
export async function exportiereMitAnnotationen(originalBytes, items, kalibrierung, opts = {}) {
    let doc;
    try {
        doc = await PDFDocument.load(originalBytes);
    } catch (e) {
        if (/encrypted/i.test(String(e?.message))) {
            // Viele „geschützte" PDFs sind nur mit Leererlaubnis verschlüsselt —
            // zweiter Versuch, bevor wir aufgeben.
            doc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
        } else {
            throw e;
        }
    }

    const font = await doc.embedFont(StandardFonts.Helvetica);
    const seiten = doc.getPages();

    // Annotationen je Seite gruppieren
    const proSeite = new Map();
    for (const a of items) {
        if (a.page >= seiten.length) continue;   // Sicherheitsnetz
        let liste = proSeite.get(a.page);
        if (!liste) { liste = []; proSeite.set(a.page, liste); }
        liste.push(a);
    }

    const alleNotizen = [];   // { seite, nummer, text, erledigt }

    for (const [seitenIndex, seitenItems] of proSeite) {
        const adapter = erstellePdfLibAnnotDoc(seiten[seitenIndex], font);
        zeichneAnnotationen(adapter, seitenItems, {
            ohneTypen: new Set(['note']),
            messKontext: kalibrierungFuerSeite(kalibrierung, seitenIndex),
        });
        // Notiz-Pins: am Bildschirm HTML, im Export als Kreis + Nummer.
        const notizen = seitenItems
            .filter(a => a.type === 'note')
            .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
        notizen.forEach((n, i) => {
            const nummer = i + 1;
            adapter.kreis(n.x, n.y, 6, { fuellFarbe: n.farbe ?? '#d97706' });
            adapter.textMitHalo(n.x, n.y, String(nummer), {
                groessePt: 7, farbe: '#ffffff', haloFarbe: n.farbe ?? '#d97706',
            });
            alleNotizen.push({
                seite: seitenIndex + 1, nummer,
                text: n.text ?? '', erledigt: !!n.erledigt,
            });
        });
    }

    if (opts.kommentarSeite && alleNotizen.length) {
        _haengeKommentarSeiteAn(doc, font, alleNotizen);
    }

    return doc.save();
}

/** Schlichte Übersichtsseite: „Seite N, Kommentar M: Text", umgebrochen. */
function _haengeKommentarSeiteAn(doc, font, notizen) {
    const RAND = 56, GROESSE = 11, ZEILE = 16;
    let page = doc.addPage(PageSizes.A4);
    let y = page.getHeight() - RAND;

    const schreibe = (text, groesse = GROESSE, einzug = 0) => {
        if (y < RAND) { page = doc.addPage(PageSizes.A4); y = page.getHeight() - RAND; }
        page.drawText(text, { x: RAND + einzug, y, size: groesse, font });
        y -= ZEILE;
    };

    schreibe('Kommentare', 16);
    y -= 8;

    const maxBreite = page.getWidth() - 2 * RAND - 12;
    for (const n of notizen) {
        schreibe(`Seite ${n.seite} - Kommentar ${n.nummer}${n.erledigt ? ' (erledigt)' : ''}:`, GROESSE);
        const woerter = (n.text || '(ohne Text)').split(/\s+/);
        let zeile = '';
        for (const wort of woerter) {
            const test = zeile ? `${zeile} ${wort}` : wort;
            if (font.widthOfTextAtSize(test, GROESSE) > maxBreite && zeile) {
                schreibe(zeile, GROESSE, 12);
                zeile = wort;
            } else {
                zeile = test;
            }
        }
        if (zeile) schreibe(zeile, GROESSE, 12);
        y -= 6;
    }
}

/** Uint8Array → Download über einen unsichtbaren Link. */
export function ladeHerunter(bytes, dateiname) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = dateiname;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Speichern über den System-Dialog (File System Access API, Chromium/Edge).
 * `startIn` ist das Herkunfts-Handle der Originaldatei — damit öffnet der
 * Dialog direkt in DEREN Ordner statt im Downloads-Standard. Ohne Picker-
 * Unterstützung (Firefox/Safari) fällt es auf den normalen Download zurück.
 *
 * @returns {'gespeichert'|'download'|'abgebrochen'}
 */
export async function speichereMitPicker(bytes, dateiname, { picker, startIn = null } = {}) {
    const zeige = picker
        ?? (typeof window !== 'undefined' && window.showSaveFilePicker
            ? (o) => window.showSaveFilePicker(o)
            : null);
    if (!zeige) {
        ladeHerunter(bytes, dateiname);
        return 'download';
    }
    const optionen = {
        suggestedName: dateiname,
        types: [{ description: 'PDF-Datei', accept: { 'application/pdf': ['.pdf'] } }],
    };
    let ziel = null;
    try {
        ziel = await zeige(startIn ? { ...optionen, startIn } : optionen);
    } catch (e) {
        if (e?.name === 'AbortError') return 'abgebrochen';
        if (!startIn) throw e;
        // Verwaistes Handle (Datei verschoben/gelöscht) → Standardordner.
        try { ziel = await zeige(optionen); }
        catch (e2) {
            if (e2?.name === 'AbortError') return 'abgebrochen';
            throw e2;
        }
    }
    const schreiber = await ziel.createWritable();
    await schreiber.write(bytes);
    await schreiber.close();
    return 'gespeichert';
}

/** Teilen über das System-Share-Sheet (Edge/Windows, iPad), wenn verfügbar. */
export async function teile(bytes, dateiname) {
    const datei = new File([bytes], dateiname, { type: 'application/pdf' });
    if (!navigator.canShare?.({ files: [datei] })) return false;
    try {
        await navigator.share({ files: [datei], title: dateiname });
        return true;
    } catch {
        return false;   // Nutzer hat abgebrochen
    }
}

/** Drucken über einen versteckten iframe. */
export function drucke(bytes) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    iframe.onload = () => {
        try { iframe.contentWindow?.print(); } catch { /* Viewer blockiert */ }
        setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url); }, 60000);
    };
    document.body.appendChild(iframe);
}
