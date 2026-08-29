/**
 * Issue-Pins setzen und pflegen (Sprint I, Stufe 5).
 *
 * Herausgelöst aus `IfcViewer.vue`. Die Issues selbst liegen im Store — hier
 * liegt nur das Verhalten: der Pin-Modus, das Anlegen per Klick, und die
 * Beobachtung, die das 3D-Bild dem Store folgen lässt.
 *
 * Der Pin-Modus sperrt die Auswahl, damit ein Klick nicht gleichzeitig ein
 * Bauteil wählt UND einen Pin setzt. Diese Sperre teilt er sich mit dem
 * Messen; deshalb beendet das Einschalten hier zuerst das Messen. Ohne das
 * stünden beide auf `disabled` und der Auswahlmodus käme beim Ausschalten des
 * einen zurück, während der andere noch läuft.
 */

import { watch } from 'vue';

export function useAnnotationen({ engine, ifc, cde, selection, messen, viewpoint, aktiv }) {
    /**
     * Die Engine folgt dem Store.
     *
     * Vorher spiegelte nur EINE von sieben Store-Änderungen ins 3D-Bild
     * (`updateAnnotationOffset`). Löschen, Farbwechsel, „alle löschen" und der
     * BCF-Import blieben als Pins stehen: die Liste im Panel und die Marken im
     * Modell liefen auseinander. Statt jede Operation einzeln nachzuziehen —
     * sieben Stellen, die man beim nächsten Mal wieder vergisst — folgt die
     * Engine dem Store.
     *
     * Beobachtet wird bewusst nur, was den PIN bestimmt: Kennung, Ort und
     * Farbe (`idx` leitet die Engine aus der Reihenfolge ab). Text, Status,
     * Frist und Kommentare ändern das 3D-Bild nicht — eine tiefe Beobachtung
     * würde beim Tippen im Panel bei jedem Zeichen die Marken neu bauen.
     */
    watch(
        () => ifc.annotations.map((a) => `${a.id}|${a.color ?? ''}|${a.position?.join(',') ?? ''}`).join(';'),
        () => { engine.value?.setAnnotations(ifc.annotations); },
    );

    function umschalten() {
        if (aktiv.value) {
            aktiv.value = false;
            selection()?.setMode('single');
        } else {
            messen.beenden();          // beide teilen sich die Auswahl-Sperre
            engine.value?.enableAnnotationMode();
            aktiv.value = true;
            selection()?.setMode('disabled');
        }
    }

    /**
     * Klick im Pin-Modus: Beschreibung erfragen, Pin setzen, Issue anlegen.
     * @returns {boolean} true, wenn der Klick verbraucht wurde
     */
    async function klick(e) {
        if (!aktiv.value) return false;
        const text = prompt('Issue anlegen — Beschreibung:', '');
        if (text === null) return true;
        // Farbe des letzten Pins wiederverwenden — so lässt sich eine Serie
        // gleichfarbiger Marken setzen, ohne jedes Mal nachzustellen.
        const letzteFarbe = ifc.annotations[ifc.annotations.length - 1]?.color ?? '#e91e63';
        const ann = await engine.value?.addAnnotation(e.clientX, e.clientY, text, letzteFarbe);
        if (ann) {
            // Viewpoint (Kamera, Sichtbarkeit, Schnitt) für „so sah ich es",
            // Autor aus der CDE-Bearbeiterkennung.
            ann.viewpoint = viewpoint();
            ann.author = cde.bearbeiter || '';
            ann.createdAt = Date.now();
            ifc.pushAnnotation(ann);
        }
        return true;
    }

    /** Ein Pin am Modell (statt am Bildschirm) — aus dem HUD-Kontextmenü. */
    function anPunkt(position, text, farbe) {
        const ann = engine.value?.addAnnotationAt?.(position, text, farbe);
        if (!ann) return null;
        ann.viewpoint = viewpoint();
        ann.author = cde.bearbeiter || '';
        ann.createdAt = Date.now();
        ifc.pushAnnotation(ann);
        return ann;
    }

    /** Beschriftung verschoben — Store und Engine gleichziehen. */
    function versatzGeaendert({ id, offset }) {
        ifc.updateAnnotationOffset(id, offset);
        engine.value?.updateAnnotation?.(id, { labelOffset: offset });
    }

    function zoomeAufPin(position) {
        engine.value?.lookAtPoint(position[0], position[1], position[2], 5);
    }

    return { umschalten, klick, anPunkt, versatzGeaendert, zoomeAufPin };
}
