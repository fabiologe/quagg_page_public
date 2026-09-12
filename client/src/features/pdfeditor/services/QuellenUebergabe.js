/**
 * QuellenUebergabe — PDFs von außerhalb des Editors (heute: die Bibliothek)
 * an Quagg-PDF übergeben, ohne Dubletten.
 *
 * Eine Quelle ist eine stabile Kennung, z. B. `bibliothek:<id>` oder
 * `literatur:<dateiname>`. Der Repo-Key `quelle:<kennung>` merkt sich
 * `{ dokId, groesse, importiertAm }`. Liegt das Dokument noch lokal, gibt es
 * nur seine dokId zurück — kein erneuter Download, und die lokalen
 * Anmerkungen bleiben erhalten. Sonst lädt `lade()` den Blob (mit Anmeldung;
 * das weiß nur der Aufrufer) und der Editor importiert ihn wie eine gewählte
 * Datei. Ein verwaister Key (Dokument inzwischen gelöscht) führt zu einem
 * frischen Import.
 */

import { repo as standardRepo } from './PdfRepo';
import { useDocStore } from '../stores/useDocStore';

/** Beginnt der Blob mit der PDF-Signatur? (Spec: innerhalb der ersten 1024 Byte) */
async function _istPdf(blob) {
    const kopf = new TextDecoder().decode(await blob.slice(0, 1024).arrayBuffer());
    return kopf.includes('%PDF');
}

/**
 * @param {string} quelle                         stabile Kennung der Herkunft
 * @param {() => Promise<{blob: Blob, name?: string}>} lade  holt die PDF (nur wenn nötig)
 * @returns {Promise<{dokId: string, neu: boolean}>}
 */
export async function oeffneQuelle(quelle, lade, { docStore = useDocStore(), repo = standardRepo } = {}) {
    if (!quelle || typeof lade !== 'function') {
        throw new Error('Quelle und Ladefunktion sind nötig.');
    }
    const key = `quelle:${quelle}`;

    // Lokal schon vorhanden? Dann nur öffnen — samt Anmerkungen.
    await docStore.ladeIndex();
    // Frischer Store (die Bibliothek navigiert das eine QuaggPdf-Fenster neu):
    // erst die offenen Tabs zurückholen — sonst überschreibt der Import sie
    // mit „nur dem neuen Tab".
    if (!docStore.tabs.length) await docStore.ladeTabs();
    const eintrag = await repo.get(key);
    if (eintrag?.dokId && docStore.dokIndex.some(d => d.id === eintrag.dokId)) {
        return { dokId: eintrag.dokId, neu: false };
    }

    const { blob, name } = await lade();
    if (!blob || !(await _istPdf(blob))) {
        throw new Error('Die Datei ist keine PDF.');
    }
    const datei = new File([blob], name || 'Dokument.pdf', { type: 'application/pdf' });
    const dokId = await docStore.importiereDatei(datei);
    if (!dokId) {
        throw new Error(docStore.ladeFehler || 'Die PDF konnte nicht übernommen werden.');
    }
    await repo.set(key, { dokId, groesse: blob.size, importiertAm: Date.now() });
    return { dokId, neu: true };
}
