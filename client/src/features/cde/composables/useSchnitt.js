/**
 * Schnittebene bedienen (Sprint I, Stufe 5).
 *
 * Der Zustand hier ist ein SPIEGEL dessen, was die Engine führt — und das ist
 * Absicht, keine Nachlässigkeit: `sectionPosition` liest die Oberfläche
 * fortlaufend, die Engine meldet ihn per Rückruf, und Vue braucht ihn als Ref,
 * um ihn anzuzeigen. Der Unterschied zu einem echten Doppelregister ist, dass
 * es genau EINEN Schreibweg gibt (die Rückmeldung) und die Engine die Wahrheit
 * bleibt.
 *
 * Muster wie `flood-2D/composables/useSectionTool.js`: Engine hereingereicht,
 * Rückgabe ein flaches Objekt aus Refs und Handlern.
 */

import { ref } from 'vue';

export function useSchnitt({ engine }) {
    /** Ist eine Schnittebene angelegt? */
    const aktiv = ref(false);
    /** Ist die Bedienleiste sichtbar? (Die Ebene kann aktiv sein, die Leiste weg.) */
    const leisteOffen = ref(false);
    /** 'translate' | 'rotate' */
    const modus = ref('translate');
    /** { x, y, z } der Ebene, von der Engine gemeldet. */
    const position = ref(null);

    /**
     * Rückmeldung der Engine anmelden.
     *
     * Stand vorher Zeichen für Zeichen an ZWEI Stellen — beim Einschalten des
     * Werkzeugs und beim Anfahren eines Geschosses. Eine Änderung an der einen
     * hätte die andere stillschweigend zurückgelassen.
     */
    function _rueckmeldungAnmelden() {
        engine.value?.setSectionChangeCallback(() => {
            position.value = engine.value?.getSectionPosition() ?? null;
        });
    }

    function umschalten() {
        if (!aktiv.value) {
            if (!engine.value?.createSectionCut()) return;
            modus.value = 'translate';
            aktiv.value = true;
            leisteOffen.value = true;
            position.value = engine.value.getSectionPosition();
            _rueckmeldungAnmelden();
        } else {
            engine.value?.setSectionChangeCallback(null);
            engine.value?.deleteSectionCuts();
            aktiv.value = false;
            leisteOffen.value = false;
            position.value = null;
        }
    }

    /** Nur die Leiste ausblenden — die Ebene schneidet weiter. */
    function leisteAusblenden() {
        leisteOffen.value = false;
        engine.value?.setSectionGizmoVisible(false);
    }

    function setzeModus(m) {
        modus.value = m;
        engine.value?.setSectionMode(m);
    }

    function ausrichten(achse) {
        engine.value?.snapSectionTo(achse);
        position.value = engine.value?.getSectionPosition() ?? null;
    }

    function zuruecksetzen() {
        engine.value?.resetSection();
        position.value = engine.value?.getSectionPosition() ?? null;
    }

    /**
     * Nach einem Geschosswechsel: die Engine hat den Schnitt selbst gesetzt,
     * die Oberfläche muss nachziehen.
     */
    function uebernehmeVonEngine() {
        aktiv.value = true;
        leisteOffen.value = true;
        position.value = engine.value?.getSectionPosition() ?? null;
        _rueckmeldungAnmelden();
    }

    /** Ein neues Modell entwertet den Schnitt. */
    function verwerfen() {
        if (!aktiv.value) return;
        engine.value?.deleteSectionCuts();
        aktiv.value = false;
        leisteOffen.value = false;
        position.value = null;
    }

    return {
        aktiv, leisteOffen, modus, position,
        umschalten, leisteAusblenden, setzeModus, ausrichten, zuruecksetzen,
        uebernehmeVonEngine, verwerfen,
    };
}
