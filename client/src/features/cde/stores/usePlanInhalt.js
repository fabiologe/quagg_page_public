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
import { computed } from 'vue';
import { planInhaltsListe } from './planJournal.js';
import { symbolNach } from '../services/PlanSymbols.js';

const REPO_KEY = 'plan-inhalte';

/** Was sich setzen lässt. `symbol` trägt zusätzlich einen Namen aus PlanSymbols. */
export const INHALT_ARTEN = Object.freeze(['text', 'symbol']);

/** Vorgabe-Schriftgröße in Papier-Millimetern. */
export const TEXT_GROESSE_MM = 2.5;
/** Vorgabe-Symbolgröße in Papier-Millimetern. */
export const SYMBOL_GROESSE_MM = 3;


export const usePlanInhalt = defineStore('cde-planinhalt', () => {
    // Journal und alte Liste (Teil XXIII, A7) — siehe `planJournal.js`.
    const { liste, schreibe, laden } = planInhaltsListe({
        art: 'planinhalt', repoKey: REPO_KEY, uebernahme: 'Übernahme Planinhalte',
    });
    /** [{ id, art, x, z, text?, symbol?, groesse, winkel }] */
    const inhalte = liste;
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
        schreibe([{ id: eintrag.id, wert: eintrag }]);
        return eintrag;
    }

    /**
     * Symbol setzen.
     * @param {string} symbol Name aus dem Symbolkatalog
     */
    function addSymbol(punkt, symbol, { groesse = SYMBOL_GROESSE_MM } = {}) {
        if (!punkt || !symbolNach(symbol)) return null;
        const eintrag = { id: _id(), art: 'symbol', x: punkt.x, z: punkt.z, symbol, groesse, winkel: 0 };
        schreibe([{ id: eintrag.id, wert: eintrag }]);
        return eintrag;
    }

    /** Verschieben — beim Ziehen im Plan. */
    function verschiebe(id, punkt) {
        const e = inhalte.value.find(i => i.id === id);
        if (!e || !punkt) return false;
        schreibe([{ id, wert: { ...e, x: punkt.x, z: punkt.z } }]);
        return true;
    }

    function aendere(id, patch) {
        const e = inhalte.value.find(i => i.id === id);
        if (!e) return false;
        schreibe([{ id, wert: { ...e, ...patch } }]);
        return true;
    }

    function entferne(id) {
        schreibe([{ id, wert: null }]);
    }

    function alleEntfernen() {
        schreibe(inhalte.value.map(e => ({ id: e.id, wert: null })), { titel: 'Planinhalt entfernen' });
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

    const bereit = laden();

    return {
        inhalte, anzahl, bereit,
        addText, addSymbol, verschiebe, aendere, entferne, alleEntfernen, treffer,
        neuLaden: laden,
    };
});
