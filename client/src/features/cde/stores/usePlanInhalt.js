/**
 * Vom Nutzer gesetzte Planinhalte (Sprint I, Stufe 7).
 *
 * Beschriftungen und Symbole, die IM Plan gesetzt werden — nicht solche, die
 * aus dem Modell abgeleitet sind. Die Unterscheidung ist wichtig: was aus dem
 * Modell kommt (Bauteilbeschriftung nach Vorlage, Haltungstexte), wird bei
 * jedem Maßstabswechsel neu berechnet. Was hier liegt, hat jemand hingesetzt
 * und soll genau dort bleiben.
 *
 * Deshalb WELTKOORDINATEN (Welt-XZ), dieselbe Entscheidung wie bei der
 * Bemaßung in AP-10: eine Verankerung in Prozent der Zeichenfläche überlebt
 * Schwenk und Maßstabswechsel und behauptet danach an anderer Stelle weiter
 * dasselbe.
 *
 * Persistenzmuster wie `useIfcStore.savedViews`: entprellt über die
 * RepoFacade, damit das Setzen mehrerer Marken nicht in ebenso viele
 * Schreibvorgänge läuft.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { repo } from '../services/RepoFacade.js';
import { symbolNach } from '../services/PlanSymbols.js';

const REPO_KEY = 'plan-inhalte';

/** Was sich setzen lässt. `symbol` trägt zusätzlich einen Namen aus PlanSymbols. */
export const INHALT_ARTEN = Object.freeze(['text', 'symbol']);

/** Vorgabe-Schriftgröße in Papier-Millimetern. */
export const TEXT_GROESSE_MM = 2.5;
/** Vorgabe-Symbolgröße in Papier-Millimetern. */
export const SYMBOL_GROESSE_MM = 3;

function _entprelle(fn, ms) {
    let t = null;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const usePlanInhalt = defineStore('cde-planinhalt', () => {
    /** [{ id, art, x, z, text?, symbol?, groesse, winkel }] */
    const inhalte = ref([]);

    const _sichern = _entprelle(() => {
        repo.set(REPO_KEY, JSON.parse(JSON.stringify(inhalte.value)));
    }, 250);

    const anzahl = computed(() => inhalte.value.length);

    function _id() {
        return 'pi-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    }

    /**
     * Beschriftung setzen.
     * @param {{x:number,z:number}} punkt Weltpunkt
     */
    function addText(punkt, text, { groesse = TEXT_GROESSE_MM, winkel = 0 } = {}) {
        const inhalt = (text ?? '').trim();
        // Eine leere Beschriftung ist eine unsichtbare Marke, die man nicht
        // mehr anklicken kann, um sie loszuwerden.
        if (!inhalt || !punkt) return null;
        const eintrag = { id: _id(), art: 'text', x: punkt.x, z: punkt.z, text: inhalt, groesse, winkel };
        inhalte.value.push(eintrag);
        _sichern();
        return eintrag;
    }

    /**
     * Symbol setzen.
     * @param {string} symbol Name aus PLAN_SYMBOL_NAMES
     */
    function addSymbol(punkt, symbol, { groesse = SYMBOL_GROESSE_MM } = {}) {
        if (!punkt || !symbolNach(symbol)) return null;
        const eintrag = { id: _id(), art: 'symbol', x: punkt.x, z: punkt.z, symbol, groesse, winkel: 0 };
        inhalte.value.push(eintrag);
        _sichern();
        return eintrag;
    }

    /** Verschieben — beim Ziehen im Plan. */
    function verschiebe(id, punkt) {
        const e = inhalte.value.find(i => i.id === id);
        if (!e || !punkt) return false;
        e.x = punkt.x;
        e.z = punkt.z;
        _sichern();
        return true;
    }

    function aendere(id, patch) {
        const e = inhalte.value.find(i => i.id === id);
        if (!e) return false;
        Object.assign(e, patch);
        _sichern();
        return true;
    }

    function entferne(id) {
        inhalte.value = inhalte.value.filter(i => i.id !== id);
        _sichern();
    }

    function alleEntfernen() {
        inhalte.value = [];
        _sichern();
    }

    /**
     * Den nächstgelegenen Inhalt innerhalb eines Radius finden.
     *
     * Für Anfassen und Löschen im Plan. Der Radius kommt in WELTMETERN herein
     * — der Aufrufer rechnet ihn aus der Zeigertoleranz in Papier-mm und dem
     * Maßstab, denn was „nah" heißt, hängt vom Maßstab ab.
     */
    function treffer(punkt, radiusWelt) {
        let beste = null;
        let besteDistanz = radiusWelt;
        for (const e of inhalte.value) {
            const d = Math.hypot(e.x - punkt.x, e.z - punkt.z);
            if (d <= besteDistanz) { beste = e; besteDistanz = d; }
        }
        return beste;
    }

    async function laden() {
        try {
            const gespeichert = await repo.get(REPO_KEY);
            if (Array.isArray(gespeichert)) inhalte.value = gespeichert;
        } catch { /* Planinhalte sind kein Grund für einen Fehler */ }
    }

    const bereit = laden();

    return {
        inhalte, anzahl, bereit,
        addText, addSymbol, verschiebe, aendere, entferne, alleEntfernen, treffer,
        neuLaden: laden,
    };
});
