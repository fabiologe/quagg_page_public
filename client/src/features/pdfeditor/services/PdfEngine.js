/**
 * PdfEngine — pdf.js-Anbindung des Editors.
 *
 * Worker-Setup unter Vite: die Worker-Datei wird per `?url` importiert, damit
 * API- und Worker-Version IMMER aus demselben Paketstand kommen (pdfjs-dist
 * ist exakt gepinnt; Versionsmix crasht kryptisch im Worker).
 *
 * ArrayBuffer-Falle: `getDocument({ data })` TRANSFERIERT den Buffer an den
 * Worker — er ist danach im Hauptthread unbrauchbar („neutered"). Deshalb wird
 * das Original ausschließlich als Blob gehalten und hier für jeden Ladevorgang
 * eine frische Kopie gezogen. Der Export (pdf-lib) zieht sich seine eigene.
 */

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// pdfjs 4.x nutzt Promise.withResolvers — fehlt in Safari < 17.4.
if (typeof Promise.withResolvers !== 'function') {
    Promise.withResolvers = function () {
        let resolve, reject;
        const promise = new this((res, rej) => { resolve = res; reject = rej; });
        return { promise, resolve, reject };
    };
}

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const RenderingCancelledException = pdfjs.RenderingCancelledException;

/**
 * Render-Auflösung einer Seite: Zoom × devicePixelRatio, gedeckelt so, dass
 * die Canvas-Fläche unter ~16 Mio Pixeln bleibt — darüber verweigern mobile
 * Browser das Canvas stillschweigend.
 *
 * `schwer` (Stufe 11d): Seiten mit teurer Operatorliste (CAD-Pläne) deckeln
 * zusätzlich den DPR-Anteil auf 1.25 und die Fläche auf 8 Mio px — ein
 * 500k-Operatoren-Blatt muss nicht in doppelter Retina-Auflösung gerastert
 * werden. Das Annotations-Canvas nutzt weiterhin die volle Schärfe (billig);
 * beide Canvases sind CSS-gestreckt auf dieselbe Fläche, unterschiedliche
 * Bitmapgrößen kollidieren nicht.
 */
export function renderScaleFuer(breitePt, hoehePt, zoom, dpr = window.devicePixelRatio || 1, schwer = false) {
    const maxPixel = schwer ? 8e6 : 16e6;
    const dprEffektiv = schwer ? Math.min(dpr, 1.25) : dpr;
    const deckel = Math.sqrt(maxPixel / Math.max(1, breitePt * hoehePt));
    return Math.min(zoom * dprEffektiv, deckel);
}

/**
 * Kapselt ein geöffnetes pdf.js-Dokument: Seiten-Proxies werden gecacht,
 * Seitenmaße (Punktraum, inkl. /Rotate der Seite) stapelweise geladen.
 */
export class PdfDokument {
    constructor(pdfjsDoc) {
        this._doc = pdfjsDoc;
        this.seitenAnzahl = pdfjsDoc.numPages;
        this._seitenCache = new Map();   // index (0-basiert) → Promise<PDFPageProxy>
        // Optional-Content-Konfiguration (PDF-Layer/OCGs, „AutoCAD-Layer"):
        // EINE Instanz je Dokument — setzeLayerSichtbar mutiert sie, und
        // PdfPage übergibt sie jedem Render.
        this.ocgConfig = null;
    }

    /**
     * PDF-Layer (Optional Content Groups) als flache Liste.
     * Leer bei Dokumenten ohne Layer (Text-/Scan-PDFs).
     * @returns {Promise<Array<{id: string, name: string, sichtbar: boolean}>>}
     */
    async holeLayer() {
        if (!this.ocgConfig) {
            try { this.ocgConfig = await this._doc.getOptionalContentConfig(); }
            catch { return []; }
        }
        const config = this.ocgConfig;
        if (!config) return [];
        const flach = [];
        const sammle = (liste) => {
            for (const eintrag of liste ?? []) {
                if (typeof eintrag === 'string') {
                    const gruppe = config.getGroup(eintrag);
                    if (gruppe) {
                        flach.push({
                            id: eintrag,
                            name: gruppe.name || eintrag,
                            sichtbar: gruppe.visible !== false,
                        });
                    }
                } else if (eintrag?.order) {
                    sammle(eintrag.order);   // verschachtelte Gruppen einebnen
                }
            }
        };
        try { sammle(config.getOrder()); } catch { return []; }
        return flach;
    }

    /** Sichtbarkeit eines Layers umschalten (wirkt beim nächsten Render). */
    setzeLayerSichtbar(id, sichtbar) {
        try { this.ocgConfig?.setVisibility(id, sichtbar); } catch { /* unbekannte id */ }
    }

    /** @param {number} index 0-basiert */
    holeSeite(index) {
        let p = this._seitenCache.get(index);
        if (!p) {
            p = this._doc.getPage(index + 1);
            this._seitenCache.set(index, p);
        }
        return p;
    }

    /**
     * Maße aller Seiten in PDF-Punkten (Anzeige-Maße, /Rotate eingerechnet).
     * Lädt stapelweise und meldet Zwischenstände, damit die Seitenliste bei
     * großen Dokumenten nicht auf die letzte Seite warten muss.
     *
     * @param {(seiten: Array<{breitePt:number, hoehePt:number}>) => void} [aufZwischenstand]
     * @returns {Promise<Array<{breitePt:number, hoehePt:number}>>}
     */
    async ladeSeitenMasse(aufZwischenstand = null, stapelGroesse = 25) {
        const seiten = new Array(this.seitenAnzahl).fill(null);
        // Erste Seite als vorläufige Annahme für alle — sofort brauchbares Layout.
        const erste = await this.holeSeite(0);
        const v0 = erste.getViewport({ scale: 1 });
        for (let i = 0; i < this.seitenAnzahl; i++) {
            seiten[i] = { breitePt: v0.width, hoehePt: v0.height };
        }
        aufZwischenstand?.(seiten.slice());

        for (let start = 1; start < this.seitenAnzahl; start += stapelGroesse) {
            const ende = Math.min(start + stapelGroesse, this.seitenAnzahl);
            const proxies = await Promise.all(
                Array.from({ length: ende - start }, (_, k) => this.holeSeite(start + k))
            );
            proxies.forEach((p, k) => {
                const v = p.getViewport({ scale: 1 });
                seiten[start + k] = { breitePt: v.width, hoehePt: v.height };
            });
            aufZwischenstand?.(seiten.slice());
        }
        return seiten;
    }

    async schliesse() {
        this._seitenCache.clear();
        try { await this._doc.destroy(); } catch { /* schon zu */ }
    }
}

/**
 * Öffnet ein PDF aus einem Blob.
 * @returns {Promise<PdfDokument>}
 * @throws bei kaputten/verschlüsselten Dateien (Aufrufer meldet verständlich)
 */
export async function oeffnePdf(blob) {
    const daten = await blob.arrayBuffer();   // frische Kopie, siehe Kopfkommentar
    const task = pdfjs.getDocument({
        data: daten,
        // Keine externen Ressourcen nachladen — der Editor läuft auch offline.
        disableAutoFetch: false,
        isEvalSupported: false,
    });
    const doc = await task.promise;
    return new PdfDokument(doc);
}
