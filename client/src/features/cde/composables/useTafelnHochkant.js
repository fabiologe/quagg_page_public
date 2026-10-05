/**
 * useTafelnHochkant — die Bodenblätter klappen beim Formen ein (Teil XXXI, T5 — E-T5).
 *
 * Tabletlauf T0 (iPad hochkant): die Zeichenfläche hatte 44 % des Schirms, darunter zwei Blätter zu je 42dvh. Wer
 * mit Griffen modelliert, braucht das Bild, nicht die Tafel. Deshalb: im Bearbeiten-Modus mit gewähltem Bauteil — dem
 * Zustand, in dem seit T3 alle Griffe stehen — sind die Blätter eingeklappt (nur ihr Kopf bleibt). Ein Tipp auf einen
 * Kopf klappt sie auf; das gilt, bis ein ANDERES Bauteil gewählt oder der Modus verlassen wird.
 *
 * Bewusst NICHT: aufklappen, sobald ein Werkzeug scharf wird. Ein Zug am Griff schaltet sein Werkzeug scharf — das Bild
 * spränge mitten im Zug um ein Blatt. Wer ein Werkzeug aus der Tafel will, hat sie dafür schon aufgeklappt.
 *
 * Wirkt nur im Hochkant-Layout (≤ 900 px, `CdePanel.vue`/`CdeView.vue`); quer bleibt alles, wie es ist.
 *
 * @param {object} bearbeitung  Store (`modusAn`, `bauteil`)
 */
import { computed, ref, watch } from 'vue';

export function useTafelnHochkant(bearbeitung) {
    const aufgeklappt = ref(false);

    watch(() => [bearbeitung?.bauteil?.globalId ?? null, !!bearbeitung?.modusAn], ([gid, an], vorher) => {
        const [gidVorher, anVorher] = vorher ?? [];
        if (gid !== gidVorher || an !== anVorher) aufgeklappt.value = false;
    }, { flush: 'sync' });

    const eingeklappt = computed(() => !!bearbeitung?.modusAn && !!bearbeitung?.bauteil?.globalId && !aufgeklappt.value);

    return {
        eingeklappt,
        aufklappen: () => { aufgeklappt.value = true; },
        einklappen: () => { aufgeklappt.value = false; },
    };
}
