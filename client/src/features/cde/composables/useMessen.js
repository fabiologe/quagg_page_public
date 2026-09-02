/**
 * Strecken messen (Sprint I, Stufe 5).
 *
 * Herausgelöst aus `IfcViewer.vue`. Der Zustand — die Messstrecken selbst —
 * liegt im Store (`useIfcStore.messungen`), nicht hier: zwei Konsumenten
 * außerhalb der Komponente lesen ihn (das HUD und der Planexport), und er
 * soll eine Sitzung überleben. **Composable = Verhalten, Store = Zustand.**
 *
 * Der Modus sperrt die Auswahl (`selection.setMode('disabled')`), damit ein
 * Klick nicht gleichzeitig ein Bauteil wählt UND einen Messpunkt setzt. Diese
 * Sperre teilt sich das Messen mit den Annotationen — beide dürfen deshalb
 * nie gleichzeitig an sein.
 */

import { ref } from 'vue';

/** Wie lange eine Rückmeldung stehen bleibt (ms). */
const MELDUNG_MS = 3500;

export function useMessen({ engine, ifc, selection, slot = null }) {
    const aktiv = ref(false);
    /** Kurze Rückmeldung am Bildrand: { text, ts } oder null. */
    const meldung = ref(null);
    /**
     * Was der nächste Tipp tut — STEHT, solange der Modus an ist (T3).
     * Die flüchtige Meldung verschwand nach 3,5 s; auf dem Tablet sah der
     * Modus danach tot aus (kein Hover, kein Esc). Muster: die Statuszeile
     * aus flood-3D / die Hinweiszeile des PDF-Editors.
     */
    const hinweis = ref(null);
    let _meldungTimer = null;

    function _melde(text) {
        meldung.value = { text, ts: Date.now() };
        if (_meldungTimer) clearTimeout(_meldungTimer);
        _meldungTimer = setTimeout(() => { meldung.value = null; }, MELDUNG_MS);
    }

    function umschalten() {
        if (aktiv.value) {
            engine.value?.disableMeasureMode();
            aktiv.value = false;
            meldung.value = null;
            hinweis.value = null;
            selection()?.setMode('single');
            slot?.frei?.('messen');
        } else {
            engine.value?.enableMeasureMode();
            aktiv.value = true;
            hinweis.value = 'Ersten Punkt antippen';
            // DER EINE SLOT (U1): Messen meldet sich an und hinterlegt den
            // Ausschalter — das nächste Werkzeug räumt es damit selbst.
            slot?.belege?.('messen', () => beenden());
            selection()?.setMode('disabled');
        }
    }

    /** Vom Messmodus in den Auswahlmodus zurück, ohne umzuschalten. */
    function beenden() {
        if (aktiv.value) umschalten();
    }

    function alleEntfernen() {
        engine.value?.clearMeasurements();
        ifc.clearMessungen();
        _melde('Messungen zurückgesetzt');
    }

    /**
     * Einzelne Messung entfernen.
     *
     * Die Strecken zeichnet seit AP-U4 das HUD im Bildschirmraum; die 3D-Marken
     * der Engine lassen sich nicht einzeln entfernen, deshalb fallen sie hier
     * alle. Dass das auffällt, ist der Hinweis darauf, dass die 3D-Marken
     * vermutlich ganz entbehrlich sind — zu klären am Bildschirm.
     */
    function entferne(index) {
        ifc.removeMessung(index);
        engine.value?.clearMeasurements();
    }

    /**
     * Einen Klick im Messmodus verarbeiten.
     * @returns {boolean} true, wenn der Klick verbraucht wurde
     */
    async function klick(x, y) {
        if (!aktiv.value) return false;
        const res = await engine.value?.addMeasurePoint(x, y);
        if (!res || res.phase === 'no-hit') {
            _melde('Kein Treffer — ein Bauteil antippen');
        } else if (res.phase === 'awaiting-second') {
            hinweis.value = 'Zweiten Punkt antippen';
        } else if (res.phase === 'complete') {
            ifc.addMessung(
                { x: res.p1.x, y: res.p1.y, z: res.p1.z },
                { x: res.p2.x, y: res.p2.y, z: res.p2.z },
                res.dist,
            );
            hinweis.value = 'Ersten Punkt antippen';
            _melde(`Abstand: ${formatiereLaenge(res.dist)}`);
        }
        return true;
    }

    /** Schwebender Zeiger im Messmodus — zeigt den Fangpunkt. */
    async function bewegung(x, y) {
        if (aktiv.value) await engine.value?.updateMeasureHover(x, y);
    }

    return { aktiv, meldung, hinweis, umschalten, beenden, alleEntfernen, entferne, klick, bewegung };
}

/** Länge in der Einheit, die zur Größenordnung passt. Rein, damit prüfbar. */
export function formatiereLaenge(m) {
    if (m < 1)  return `${(m * 1000).toFixed(0)} mm`;
    if (m < 10) return `${m.toFixed(3)} m`;
    return `${m.toFixed(2)} m`;
}
