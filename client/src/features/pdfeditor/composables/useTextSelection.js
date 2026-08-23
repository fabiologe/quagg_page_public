/**
 * useTextSelection — macht aus einer nativen Textauswahl im TextLayer eine
 * textHighlight-Annotation: Bei pointerup (Werkzeug „Text markieren") werden
 * die Client-Rects der Auswahl eingesammelt, in Seitenpunkte umgerechnet,
 * zeilenweise vereinigt und als EIN Undo-Schritt committet.
 */

import { onMounted, onBeforeUnmount } from 'vue';
import { vereinigeZeilenRects } from '../services/TextRects';

export function useTextSelection({ toolStore, annotStore, viewStore }) {

    function _commitAuswahl() {
        const auswahl = window.getSelection();
        if (!auswahl || auswahl.isCollapsed || auswahl.rangeCount === 0) return;

        const range = auswahl.getRangeAt(0);
        const layerEl = (range.startContainer.parentElement ?? range.startContainer)
            .closest?.('.pdfed-textlayer');
        if (!layerEl) return;
        const seitenIndex = Number(layerEl.dataset.seite);
        const layerRect = layerEl.getBoundingClientRect();
        const zoom = viewStore.zoom;

        // Client-Rects → Seitenpunkte; Rects außerhalb dieser Seite (Auswahl
        // über Seitengrenzen) fallen weg — markiert wird je Seite.
        const rects = [...range.getClientRects()]
            .filter(r => r.width > 1 && r.height > 1)
            .filter(r => r.top >= layerRect.top - 2 && r.bottom <= layerRect.bottom + 2)
            .map(r => ({
                x: (r.left - layerRect.left) / zoom,
                y: (r.top - layerRect.top) / zoom,
                w: r.width / zoom,
                h: r.height / zoom,
            }));

        const zeilen = vereinigeZeilenRects(rects);
        if (!zeilen.length) return;

        annotStore.fuegeHinzu({
            type: 'textHighlight',
            page: seitenIndex,
            farbe: toolStore.textmarker.farbe,
            deckkraft: toolStore.textmarker.deckkraft,
            rects: zeilen,
            textAuszug: auswahl.toString().slice(0, 300),
        });
        auswahl.removeAllRanges();
    }

    function aufPointerUp() {
        if (toolStore.aktivesWerkzeug !== 'textMarkieren') return;
        // Die Auswahl steht erst NACH dem pointerup fest.
        setTimeout(_commitAuswahl, 0);
    }

    onMounted(() => window.addEventListener('pointerup', aufPointerUp));
    onBeforeUnmount(() => window.removeEventListener('pointerup', aufPointerUp));
}
