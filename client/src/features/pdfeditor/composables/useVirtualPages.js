/**
 * useVirtualPages — welche Seiten leben?
 *
 * Kein IntersectionObserver: alle Seitenhöhen sind exakt bekannt, das
 * Sichtfenster ist reine Arithmetik über die kumulierten Offsets. Sichtbar
 * ± `puffer` Seiten werden gerendert; alles andere ist Platzhalter, dessen
 * Canvas-Bitmap freigegeben wird (Speicherdeckel auf dem Tablet).
 */

import { computed } from 'vue';

/**
 * @param {import('vue').Ref<number>} scrollTop
 * @param {import('vue').Ref<number>} containerHoehe
 * @param {import('vue').ComputedRef<Array<{top:number, hoehe:number}>>} layout
 * @param {number} puffer  Seiten ober-/unterhalb des Sichtfensters
 */
export function useVirtualPages(scrollTop, containerHoehe, layout, puffer = 1) {

    /** Erste Seite, deren Unterkante unterhalb von `y` liegt (binäre Suche). */
    function seiteBei(y) {
        const l = layout.value;
        if (!l.length) return 0;
        let lo = 0, hi = l.length - 1;
        while (lo < hi) {
            const mitte = (lo + hi) >> 1;
            if (l[mitte].top + l[mitte].hoehe < y) lo = mitte + 1;
            else hi = mitte;
        }
        return lo;
    }

    const sichtbar = computed(() => {
        const l = layout.value;
        if (!l.length) return { von: 0, bis: 0 };
        const von = seiteBei(scrollTop.value);
        const bis = seiteBei(scrollTop.value + containerHoehe.value);
        return { von, bis };
    });

    const lebendig = computed(() => {
        const l = layout.value;
        const { von, bis } = sichtbar.value;
        const start = Math.max(0, von - puffer);
        const ende = Math.min(l.length - 1, bis + puffer);
        const s = new Set();
        for (let i = start; i <= ende; i++) s.add(i);
        return s;
    });

    return { sichtbar, lebendig };
}
