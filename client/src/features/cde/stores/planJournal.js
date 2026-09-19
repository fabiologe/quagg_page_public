/**
 * Planinhalte und Rotstift IM JOURNAL (Teil XXIII, A7, Befund B16).
 *
 * Beide Stores führen eine Liste mit Kennungen — Beschriftungen und Symbole,
 * Rotstiftstriche. Bis hierher lagen sie unter eigenen Repo-Schlüsseln neben
 * dem Journal: kein Undo, kein Commit, keine Satz-Ebene. Dieser Helfer gibt
 * beiden dieselbe Grundlage:
 *
 *   LESEN (ab A7a): die Einträge der Journalart (`planinhalt` / `rotstift`)
 *     gewinnen je Kennung; was nur unter dem alten Schlüssel liegt, gilt
 *     weiter. So sieht ein Client, der schon ins Journal schreibt, auch, was
 *     ein älterer Tab noch in die Liste schreibt.
 *   SCHREIBEN: Schreibstufe 2 (A7a) schreibt wie bisher in die Liste;
 *     Stufe 3 (A7b) schreibt ins Journal, und beim ersten Laden wird, was nur
 *     in der Liste liegt, EIN Commit „Übernahme …" (`useAenderungen.uebernimm`).
 *     Der alte Schlüssel bleibt liegen, als Rückweg.
 */
import { computed, ref } from 'vue';
import { repo } from '../services/RepoFacade.js';
import { schreibStufe } from '../services/JournalFormat.js';
import { useAenderungen } from './useAenderungen.js';

function _entprelle(fn, ms) {
    let t = null;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/**
 * @param {{art: 'planinhalt'|'rotstift', repoKey: string, uebernahme: string, entprellMs?: number}} o
 */
export function planInhaltsListe({ art, repoKey, uebernahme, entprellMs = 250 }) {
    /** Was unter dem ALTEN Schlüssel liegt. */
    const _liste = ref([]);
    const _sichernListe = _entprelle(() => {
        repo.set(repoKey, JSON.parse(JSON.stringify(_liste.value)));
    }, entprellMs);

    const liste = computed(() => {
        const stand = useAenderungen().wirksamerStand(art);
        const aus = [];
        for (const [id, wert] of stand) if (wert) aus.push({ ...wert, id });
        for (const e of _liste.value) if (!stand.has(e.id)) aus.push(e);
        return aus;
    });

    /**
     * Änderungen schreiben: `[{id, wert}]`, `wert: null` entfernt. Mehrere in
     * EINEM Vorgang — ein Radierzug, der einen Strich in drei teilt, ist ein
     * Schritt zurück.
     */
    async function schreibe(aenderungen, { titel = null } = {}) {
        if (!aenderungen.length) return;
        if (schreibStufe() >= 3) {
            const ae = useAenderungen();
            const vorgang = aenderungen.length > 1 ? ae.neueVorgangsId() : undefined;
            // Ganz oder gar nicht (Teil XXIV, K2): ein Radierzug ist EIN Vorgang, einmal gesichert.
            await ae.eintragenVorgang(aenderungen.map(({ id, wert }) => ({
                art, globalId: id, nachher: wert ? (({ id: _weg, ...rest }) => rest)(wert) : null,
            })), vorgang ? { vorgang, vorgangTitel: titel ?? undefined } : {});
            return;
        }
        // Stufe 2 (A7a): wie bisher in die Liste.
        let neu = [..._liste.value];
        for (const { id, wert } of aenderungen) {
            const i = neu.findIndex(e => e.id === id);
            if (!wert) { if (i >= 0) neu.splice(i, 1); continue; }
            const eintrag = { ...wert, id };
            if (i >= 0) neu[i] = eintrag; else neu.push(eintrag);
        }
        _liste.value = neu;
        _sichernListe();
    }

    async function laden() {
        try {
            const gespeichert = await repo.get(repoKey);
            if (Array.isArray(gespeichert)) _liste.value = gespeichert;
        } catch { /* Planinhalte sind kein Grund für einen Fehler */ }
        if (schreibStufe() >= 3) {
            const ae = useAenderungen();
            await ae.bereit;
            await ae.uebernimm(art, _liste.value, uebernahme);
        }
    }

    return { liste, schreibe, laden };
}
