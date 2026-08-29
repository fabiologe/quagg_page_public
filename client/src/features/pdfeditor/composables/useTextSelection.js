/**
 * useTextSelection — erfasst die native Textauswahl im TextLayer: Bei
 * pointerup (Werkzeug „Text auswählen") werden die Client-Rects der Auswahl
 * eingesammelt, in Seitenpunkte umgerechnet und zeilenweise vereinigt.
 * Committet wird hier NICHTS mehr — die Auswahl bleibt stehen und wandert
 * als `toolStore.textAuswahl` zum TextAuswahlMenue (Kopieren / Markieren).
 */

import { onMounted, onBeforeUnmount } from 'vue';
import { vereinigeZeilenRects } from '../services/TextRects';
import { zuSeitenRect } from '../services/AnsichtRotation';

export function useTextSelection({ toolStore, annotStore, viewStore }) {

    function _erfasseAuswahl() {
        const auswahl = window.getSelection();
        if (!auswahl || auswahl.isCollapsed || auswahl.rangeCount === 0) {
            toolStore.textAuswahl = null;
            return;
        }

        const range = auswahl.getRangeAt(0);
        const layerEl = (range.startContainer.parentElement ?? range.startContainer)
            .closest?.('.pdfed-textlayer');
        if (!layerEl) return;
        const seitenIndex = Number(layerEl.dataset.seite);
        // Der TextLayer steckt im gedrehten Seitenstapel: sein
        // getBoundingClientRect IST damit die Anzeigebox (bei 90°-Vielfachen
        // exakt), und die unrotierten Seitenmaße ergeben sich durch Tauschen.
        const layerRect = layerEl.getBoundingClientRect();
        const zoom = viewStore.zoom;
        const drehung = viewStore.drehung;
        const quer = drehung % 180 !== 0;
        const breitePt = (quer ? layerRect.height : layerRect.width) / zoom;
        const hoehePt = (quer ? layerRect.width : layerRect.height) / zoom;

        // Client-Rects → Seitenpunkte; Rects außerhalb dieser Seite (Auswahl
        // über Seitengrenzen) fallen weg — markiert wird je Seite.
        // Erst zurückdrehen, DANN zeilenweise vereinigen: Zeilen liegen nur
        // im Seitenraum waagerecht.
        const rects = [...range.getClientRects()]
            .filter(r => r.width > 1 && r.height > 1)
            .filter(r => r.top >= layerRect.top - 2 && r.bottom <= layerRect.bottom + 2)
            .map(r => zuSeitenRect({
                x: (r.left - layerRect.left) / zoom,
                y: (r.top - layerRect.top) / zoom,
                w: r.width / zoom,
                h: r.height / zoom,
            }, drehung, breitePt, hoehePt));

        const zeilen = vereinigeZeilenRects(rects);
        if (!zeilen.length) { toolStore.textAuswahl = null; return; }

        // Anker fürs Menü: Mitte über der Auswahl (Client-Koordinaten —
        // das Menü ist fixed und schließt sich bei Scroll/Zoom selbst).
        const box = range.getBoundingClientRect();
        toolStore.textAuswahl = {
            page: seitenIndex,
            rects: zeilen,
            text: auswahl.toString(),
            ankerX: box.left + box.width / 2,
            ankerY: box.top,
        };
    }

    function aufPointerUp() {
        if (toolStore.aktivesWerkzeug !== 'textMarkieren') return;
        // Die Auswahl steht erst NACH dem pointerup fest.
        setTimeout(_erfasseAuswahl, 0);
    }

    onMounted(() => window.addEventListener('pointerup', aufPointerUp));
    onBeforeUnmount(() => window.removeEventListener('pointerup', aufPointerUp));
}
