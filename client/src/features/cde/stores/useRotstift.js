/**
 * Rotstift auf dem Plan (Sprint I, Stufe 7).
 *
 * Freihand-Anmerkungen über dem Lageplan — das, was auf einem ausgedruckten
 * Plan der rote Kugelschreiber macht: einkringeln, durchstreichen, Pfeil
 * dazu. Fachlich etwas anderes als ein Issue (das hängt an einem Bauteil und
 * hat Status und Zuständigkeit) und als eine Beschriftung (die gehört zum
 * Plan und geht mit ins PDF als Planinhalt).
 *
 * WELTKOORDINATEN, dieselbe Entscheidung wie bei Bemaßung und Planinhalten:
 * ein Kringel, der ein Bauteil meint, muss beim Schwenken und beim
 * Maßstabswechsel an diesem Bauteil bleiben.
 *
 * Die Strichgeometrie kommt aus `@/services/tinte/InkGeometry` — geteilt mit
 * dem PDF-Editor, nicht kopiert. Sie rechnet in einem beliebigen Einheitsraum;
 * hier sind das Weltmeter, dort PDF-Punkte. Die Strichbreite wird deshalb in
 * PAPIER-Millimetern geführt und beim Zeichnen umgerechnet — sonst wäre ein
 * Strich bei 1:1000 zwanzigmal dicker als bei 1:50.
 */

import { defineStore } from 'pinia';
import { computed } from 'vue';
import { planInhaltsListe } from './planJournal.js';
import { zerteileStrich, trifftStrich } from '@/services/tinte/InkGeometry';

const REPO_KEY = 'rotstift';

/** Stiftfarben. Rot ist die Vorgabe — es heißt nicht umsonst Rotstift. */
export const STIFT_FARBEN = Object.freeze(['#d32f2f', '#f57c00', '#1976d2', '#388e3c', '#212121']);
/** Strichbreite in PAPIER-Millimetern. */
export const STIFT_BREITE_MM = 0.6;
/** Radiergummi-Radius in Papier-Millimetern. */
export const RADIER_RADIUS_MM = 2.5;

/**
 * Ein Strich in der Form, die das Tintenmodul erwartet.
 *
 * `strichUmriss` und `trifftStrich` lesen `breitePt` — und zwar in DEM Raum,
 * in dem auch die Punkte liegen. Im PDF-Editor sind das Seitenpunkte, hier
 * Weltmeter. Die dauerhafte Wahrheit bleibt `breiteMm` (Papier), weil ein
 * Strich bei 1:1000 sonst zwanzigmal dicker wäre als bei 1:50.
 *
 * Frei exportiert, damit die Umrechnung ohne Store prüfbar ist.
 */
export function alsTinte(strich, massstab) {
    return { ...strich, breitePt: mmZuWelt(strich.breiteMm ?? STIFT_BREITE_MM, massstab) };
}

/** Papier-Millimeter → Weltmeter beim gegebenen Maßstab. */
export function mmZuWelt(mm, massstab) {
    return (mm / 1000) * (massstab || 100);
}


export const useRotstift = defineStore('cde-rotstift', () => {
    // Journal und alte Liste (Teil XXIII, A7) — siehe `planJournal.js`.
    const { liste, schreibe, laden } = planInhaltsListe({
        art: 'rotstift', repoKey: REPO_KEY, uebernahme: 'Übernahme Rotstift', entprellMs: 300,
        werkzeug: 'rotstift-zeichnen', feld: 'striche',
    });
    /** [{ id, rev, tool, farbe, breiteMm, echterDruck, points: [[x,z,druck], …] }] */
    const striche = liste;
    const anzahl = computed(() => striche.value.length);

    function _id() {
        return 'rs-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    }

    /**
     * Einen fertigen Strich ablegen.
     *
     * @param {Array<[number,number,number]>} punkte  [x, z, druck] in Welt-XZ
     */
    function addStrich(punkte, { farbe = STIFT_FARBEN[0], breiteMm = STIFT_BREITE_MM, echterDruck = false } = {}) {
        // Ein Punkt ist kein Strich — beim bloßen Antippen entstünde sonst ein
        // unsichtbarer Fleck, den man nicht mehr wegradieren kann.
        if (!Array.isArray(punkte) || punkte.length < 2) return null;
        const strich = {
            id: _id(), rev: 0, tool: 'stift',
            farbe, breiteMm, echterDruck,
            points: punkte.map(p => [p[0], p[1], p[2] ?? 0.5]),
        };
        schreibe([{ id: strich.id, wert: strich }]);
        return strich;
    }

    /**
     * Punkt-Radierer: schneidet an der Radierstelle heraus, statt den ganzen
     * Strich zu löschen. Genau das erwartet man von einem Radiergummi.
     *
     * `zerteileStrich` kommt aus dem geteilten Tintenmodul und rechnet in dem
     * Einheitsraum, in dem die Punkte liegen — hier also Weltmeter. Ein
     * Radierzug ist EIN Vorgang: der Strich fällt, seine Reststücke entstehen.
     *
     * @returns {boolean} true, wenn etwas radiert wurde
     */
    function radiere(x, z, radiusWelt, massstab = 100) {
        const aenderungen = [];
        for (const s of striche.value) {
            if (!trifftStrich(alsTinte(s, massstab), x, z, radiusWelt)) continue;
            aenderungen.push({ id: s.id, wert: null });
            // Die Mindestlänge steckt im Einheitsraum der Punkte — die Vorgabe
            // des Moduls (0,6) ist in PDF-Punkten gedacht und wäre hier
            // sechzig Zentimeter. Ein Fünftel des Radierradius passt.
            const teile = zerteileStrich(s.points, x, z, radiusWelt, radiusWelt * 0.2);
            for (const teil of teile) {
                if (teil.length < 2) continue;      // Reststücke fallen weg
                const id = _id();
                aenderungen.push({ id, wert: { ...s, id, rev: s.rev + 1, points: teil } });
            }
        }
        if (aenderungen.length) schreibe(aenderungen, { titel: 'Radieren' });
        return aenderungen.length > 0;
    }

    /** Strich-Radierer: nimmt den ganzen getroffenen Strich weg. */
    function radiereGanz(x, z, radiusWelt, massstab = 100) {
        const weg = striche.value.filter(s => trifftStrich(alsTinte(s, massstab), x, z, radiusWelt));
        if (!weg.length) return false;
        schreibe(weg.map(s => ({ id: s.id, wert: null })), { titel: 'Radieren' });
        return true;
    }

    function entferne(id) {
        schreibe([{ id, wert: null }]);
    }

    function alleEntfernen() {
        schreibe(striche.value.map(s => ({ id: s.id, wert: null })), { titel: 'Rotstift entfernen' });
    }

    const bereit = laden();

    return {
        striche, anzahl, bereit,
        addStrich, radiere, radiereGanz, entferne, alleEntfernen, neuLaden: laden,
    };
});
