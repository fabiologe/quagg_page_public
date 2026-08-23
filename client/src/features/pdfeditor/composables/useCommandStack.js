/**
 * useCommandStack — Undo/Redo als Delta-Kommandostack.
 *
 * Kein Snapshot-Muster (Tintendaten wären je Snapshot komplett kopiert) —
 * jedes Kommando trägt nur sein Delta, aber IMMER als VOLLSTÄNDIGE
 * Objekt-Klone: { typ: 'add'|'remove'|'update', vorher, nachher }.
 * Teilfeld-Klone erzeugen tote Undo-Klicks (Projektgedächtnis:
 * feedback_history_snapshot_falle) — der Test prüft das explizit.
 *
 * Der Stack speichert und blättert nur; ANWENDEN (invertieren) tut der
 * useAnnotStore, der einzige Mutationspunkt.
 */

import { ref, computed } from 'vue';

/** Tiefe Kopie — structuredClone, Fallback JSON (ohne NaN-Erhalt, reicht hier). */
export function klon(wert) {
    if (wert == null) return wert;
    try { return structuredClone(wert); }
    catch { return JSON.parse(JSON.stringify(wert)); }
}

export function erzeugeCommandStack(cap = 100) {
    const vergangenheit = ref([]);
    const zukunft = ref([]);

    const canUndo = computed(() => vergangenheit.value.length > 0);
    const canRedo = computed(() => zukunft.value.length > 0);

    /** Neues Kommando — verwirft die Redo-Zukunft. */
    function push(kommando) {
        vergangenheit.value.push(kommando);
        if (vergangenheit.value.length > cap) vergangenheit.value.shift();
        zukunft.value = [];
    }

    /** @returns Kommando zum Invertieren oder null */
    function undo() {
        const k = vergangenheit.value.pop();
        if (!k) return null;
        zukunft.value.push(k);
        return k;
    }

    /** @returns Kommando zum erneuten Anwenden oder null */
    function redo() {
        const k = zukunft.value.pop();
        if (!k) return null;
        vergangenheit.value.push(k);
        return k;
    }

    /** Dokumentwechsel: Verläufe gehören zum Dokument. */
    function leere() {
        vergangenheit.value = [];
        zukunft.value = [];
    }

    return { push, undo, redo, leere, canUndo, canRedo };
}
