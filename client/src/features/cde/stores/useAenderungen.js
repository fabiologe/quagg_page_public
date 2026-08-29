/**
 * Journal der Merkmalsänderungen (Sprint I, Stufe 7).
 *
 * Bis hierher gab es zwei getrennte Wege, ein Bauteil zu ändern, und keiner
 * war rücknehmbar:
 *
 *   KG-Zuweisung      — eine Map GlobalId→Code in `IfcPlanningCockpit`, unter
 *                       EINEM Repo-Schlüssel abgelegt. Wer zuweist, überschreibt;
 *                       was vorher galt, ist weg.
 *   DIN-277-Klasse    — dasselbe Muster in `IfcAreaSchedule`.
 *   Merkmalssatz      — `addPsetToElement` schreibt direkt ins IFC-Modell.
 *                       Keine Spur, kein Zurück.
 *
 * Hier liegt stattdessen eine **append-only Liste**: jede Änderung merkt sich,
 * was vorher galt. Zurücknehmen heißt dann nicht „raten", sondern den letzten
 * Eintrag lesen und den alten Wert wieder eintragen.
 *
 * Die bestehenden Verbraucher (`KgClassifier`, `Din277Classifier`) erwarten
 * eine Map GlobalId→Wert. Die wird hier **abgeleitet** — ihre Schnittstelle
 * bleibt unberührt, und es gibt trotzdem nur eine Wahrheit.
 *
 * Das Journal hängt am Projekt-Repo (mit Server-Backend also im Projektordner)
 * und ist damit für jeden sichtbar, der das Projekt öffnet — was bei einer
 * Änderung am Bauteilbestand auch der Punkt ist.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { repo } from '../services/RepoFacade.js';

const REPO_KEY = 'aenderungen';

/** Was sich ändern lässt. Neue Arten hier ergänzen — sonst nirgends. */
export const AENDERUNGS_ARTEN = Object.freeze({
    kg:     { titel: 'Kostengruppe',   icon: 'kg' },
    din277: { titel: 'DIN-277-Klasse', icon: 'areas' },
    pset:   { titel: 'Merkmalssatz',   icon: 'info' },
});

/**
 * Den Stand einer Art als Map GlobalId→Wert.
 *
 * Rein und frei exportiert, damit die Ableitung ohne Store prüfbar ist. Sie
 * läuft von vorn nach hinten durch: der letzte Eintrag je Bauteil gewinnt,
 * und `null` als Wert bedeutet „zurück zur Regel" und nimmt den Eintrag
 * wieder heraus.
 */
export function standAus(eintraege, art) {
    const stand = new Map();
    for (const e of eintraege) {
        if (e.art !== art || !e.globalId) continue;
        if (e.nachher === null || e.nachher === undefined) stand.delete(e.globalId);
        else stand.set(e.globalId, e.nachher);
    }
    return stand;
}

/**
 * Der jüngste Schritt, der noch zurückgenommen werden kann.
 *
 * Rein und frei exportiert — die Regel ist die einzige Stelle, an der sich
 * Zurücknehmen von Wiederholen unterscheidet, und sie gehört geprüft.
 *
 * @returns {object|null}
 */
export function letzterOffener(eintraege) {
    const zurueckgenommen = new Set(
        eintraege.map(e => e.ruecknahmeVon).filter(Boolean),
    );
    for (let i = eintraege.length - 1; i >= 0; i--) {
        const e = eintraege[i];
        if (e.ruecknahmeVon) continue;              // selbst eine Rücknahme
        if (zurueckgenommen.has(e.id)) continue;    // schon zurückgenommen
        return e;
    }
    return null;
}

export const useAenderungen = defineStore('cde-aenderungen', () => {
    /** [{ id, art, globalId, vorher, nachher, wer, wann, modellSha }] */
    const eintraege = ref([]);

    const anzahl = computed(() => eintraege.value.length);
    /** Gibt es noch etwas zurückzunehmen? Steuert den Knopf. */
    const kannZurueck = computed(() => letzterOffener(eintraege.value) !== null);
    /** Wie viele Bauteile insgesamt berührt sind (nicht wie viele Schritte). */
    const beruehrteBauteile = computed(() => new Set(eintraege.value.map(e => e.globalId)).size);

    const kgStand     = computed(() => standAus(eintraege.value, 'kg'));
    const din277Stand = computed(() => standAus(eintraege.value, 'din277'));

    async function _sichern() {
        try {
            await repo.set(REPO_KEY, JSON.parse(JSON.stringify(eintraege.value)));
        } catch (fehler) {
            console.warn('cde: aenderungen sichern', fehler?.message ?? fehler);
        }
    }

    /**
     * Eine Änderung eintragen.
     *
     * `vorher` wird NICHT vom Aufrufer geraten, sondern aus dem eigenen Stand
     * gelesen — sonst schreibt jeder Aufrufer seine eigene Vorstellung davon
     * hinein, und das Zurücknehmen führt irgendwohin.
     *
     * @returns {object|null} der Eintrag, oder null wenn nichts zu tun war
     */
    async function eintragen({ art, globalId, nachher, wer = '', modellSha = null }) {
        if (!(art in AENDERUNGS_ARTEN) || !globalId) return null;
        const stand = standAus(eintraege.value, art);
        const vorher = stand.has(globalId) ? stand.get(globalId) : null;
        // Dieselbe Zuweisung noch einmal ist keine Änderung — sonst füllt sich
        // das Journal mit Schritten, die nichts tun, und „zurück" braucht
        // mehrere Klicks für einen sichtbaren Effekt.
        if (vorher === nachher) return null;

        const eintrag = {
            id: 'ae-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            art, globalId, vorher, nachher: nachher ?? null,
            wer, wann: Date.now(), modellSha,
        };
        eintraege.value.push(eintrag);
        await _sichern();
        return eintrag;
    }

    /**
     * Den letzten noch offenen Schritt zurücknehmen.
     *
     * Kein Löschen des Eintrags, sondern ein GEGENEINTRAG: die Spur bleibt
     * vollständig. Wer im Register liest, was mit einem Bauteil passiert ist,
     * soll auch die Rücknahme sehen — sonst sieht es aus, als wäre nie etwas
     * gewesen.
     *
     * „Offen" heißt: noch nicht zurückgenommen, und selbst keine Rücknahme.
     * Ohne diese Unterscheidung nähme der zweite Klick die RÜCKNAHME zurück
     * statt den Schritt davor — man käme nie über den ersten hinaus und
     * pendelte zwischen zwei Ständen. Das ist Wiederholen, nicht
     * Zurücknehmen, und der Knopf verspricht Letzteres.
     */
    async function zurueck(wer = '') {
        const letzter = letzterOffener(eintraege.value);
        if (!letzter) return null;
        const eintrag = {
            id: 'ae-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            art: letzter.art, globalId: letzter.globalId,
            vorher: letzter.nachher, nachher: letzter.vorher,
            wer, wann: Date.now(), modellSha: letzter.modellSha,
            ruecknahmeVon: letzter.id,
        };
        eintraege.value.push(eintrag);
        await _sichern();
        return eintrag;
    }

    /** Alle Änderungen einer Art verwerfen — Journal bleibt, Stand wird leer. */
    async function verwerfe(art, wer = '') {
        const stand = standAus(eintraege.value, art);
        for (const [globalId] of stand) {
            await eintragen({ art, globalId, nachher: null, wer });
        }
    }

    /** Die Schritte zu einem Bauteil, neueste zuerst — für die Anzeige. */
    function verlauf(globalId) {
        return eintraege.value.filter(e => e.globalId === globalId).slice().reverse();
    }

    async function laden() {
        try {
            const gespeichert = await repo.get(REPO_KEY);
            if (Array.isArray(gespeichert)) eintraege.value = gespeichert;
        } catch { /* egal */ }
    }

    const bereit = laden();

    return {
        eintraege, anzahl, kannZurueck, beruehrteBauteile, kgStand, din277Stand, bereit,
        eintragen, zurueck, verwerfe, verlauf, neuLaden: laden,
    };
});
