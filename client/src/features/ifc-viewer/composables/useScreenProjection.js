/**
 * useScreenProjection — 3D-Punkte auf den Bildschirm werfen (Sprint U, AP-U4.1).
 *
 * Overlays über dem Canvas (Issue-Pins, Mess-Pillen, Kontextmenü) müssen ihre
 * Bildschirmlage neu berechnen, sobald sich die Kamera bewegt. Bisher lief
 * dafür eine blinde 60-Hz-Schleife — auch bei völlig stillem Bild.
 *
 * Hier zählt der Tick nur hoch, wenn sich wirklich etwas geändert hat:
 * Kamera-Matrix (16 Zahlen) oder Canvas-Größe. Bei ruhender Kamera kostet das
 * einen Vergleich pro Frame statt einer kompletten Neuberechnung aller Marken.
 */

import { ref, onMounted, onBeforeUnmount, watch } from 'vue';

/**
 * @param {object} opts
 * @param {() => (THREE.Camera|null)} opts.getCamera
 * @param {() => (HTMLElement|null)} opts.getCanvas
 * @returns {{ tick: import('vue').Ref<number>,
 *             groesse: import('vue').Ref<{w:number,h:number}> }}
 */
export function useScreenProjection({ getCamera, getCanvas }) {
    const tick = ref(0);
    const groesse = ref({ w: 0, h: 0 });

    let rafId = null;
    let ro = null;
    const letzteMatrix = new Float64Array(16);
    let hatMatrix = false;

    function matrixGeaendert(cam) {
        const el = cam?.matrixWorldInverse?.elements;
        if (!el) return false;
        if (!hatMatrix) {
            for (let i = 0; i < 16; i++) letzteMatrix[i] = el[i];
            hatMatrix = true;
            return true;
        }
        for (let i = 0; i < 16; i++) {
            if (letzteMatrix[i] !== el[i]) {
                for (let j = 0; j < 16; j++) letzteMatrix[j] = el[j];
                return true;
            }
        }
        return false;
    }

    function schleife() {
        const cam = getCamera?.();
        if (cam && matrixGeaendert(cam)) tick.value++;
        rafId = requestAnimationFrame(schleife);
    }

    function groesseMessen() {
        const el = getCanvas?.();
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.width !== groesse.value.w || r.height !== groesse.value.h) {
            groesse.value = { w: r.width, h: r.height };
            tick.value++;
        }
    }

    /** Von außen anstoßen, wenn sich die Daten (nicht die Kamera) geändert haben. */
    function aktualisieren() { tick.value++; }

    onMounted(() => {
        groesseMessen();
        const el = getCanvas?.();
        if (el && typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(groesseMessen);
            ro.observe(el);
        }
        rafId = requestAnimationFrame(schleife);
    });

    onBeforeUnmount(() => {
        if (rafId) cancelAnimationFrame(rafId);
        ro?.disconnect();
        rafId = null;
        ro = null;
    });

    // Canvas kann nachträglich erscheinen (Engine-Init)
    watch(() => getCanvas?.(), (el) => {
        if (!el) return;
        groesseMessen();
        if (!ro && typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(groesseMessen);
            ro.observe(el);
        }
    });

    return { tick, groesse, aktualisieren };
}
