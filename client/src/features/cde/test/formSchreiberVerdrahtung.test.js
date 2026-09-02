/**
 * Stufe 16 — der FormSchreiber ist VERDRAHTET.
 *
 * Die Tabelle selbst prüft formSchreiber.test.js seit 14.4; hier steht, dass
 * sie in der Produktion auch jemand LIEST. Der Speicher hinter Längsschnitt,
 * Netz, Prüfliste und Plan-Beschriftung sind die Achsen — bis zu dieser
 * Stufe wurden sie genau EINMAL gelesen (beim Laden, und sogar VOR dem
 * initialen Nachspielen): jede Bearbeitung zeigte danach richtige Werte an
 * alten Stellen. Die Fehlerklasse der Prozent-Bemaßung.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { entwertetGeometrie } from '../services/bauform/FormSchreiber.js';

const wurzel = new URL('..', import.meta.url);
const viewer = readFileSync(new URL('components/IfcViewer.vue', wurzel), 'utf8');
const plan   = readFileSync(new URL('components/IfcPlanCanvas.vue', wurzel), 'utf8');

describe('Die reine Frage: entwertet dieser Stapel die Geometrie?', () => {
    it('Geometrieänderungen ja — Färbung und Beschriftung nein', () => {
        for (const art of ['lage', 'parametrik', 'erzeugt', 'geloescht']) {
            expect(entwertetGeometrie([art]), art).toBe(true);
        }
        for (const art of ['kg', 'din277', 'pset', 'bezeichnung', 'massnahme']) {
            expect(entwertetGeometrie([art]), art).toBe(false);
        }
        expect(entwertetGeometrie([])).toBe(false);
        expect(entwertetGeometrie(['kg', 'lage'])).toBe(true);   // einer reicht
    });
});

describe('Die Verklebung im Viewer', () => {
    it('BEIDE Anwendungswege rufen entwerteNach — Einzeleintrag und Vorgang', () => {
        // Ein Weg ohne Entwertung wäre der Weg, den irgendwann jemand nimmt.
        const vorgang = viewer.slice(viewer.indexOf('async function wendeVorgangAn'),
                                     viewer.indexOf('async function wendeEinenAn'));
        expect(vorgang).toContain('entwerteNach(');
        const einzel = viewer.slice(viewer.indexOf('wendeEintragAn:'));
        expect(einzel.slice(0, 400)).toContain('entwerteNach(');
    });

    it('nach dem initialen Nachspielen werden die Achsen NEU gelesen', () => {
        // Der Erstlauf zählte sie VOR dem Replay — trug das Journal
        // Geometrieänderungen, war der Längsschnitt vom ersten Bild an falsch.
        const block = viewer.slice(viewer.indexOf('nachspielen.nachModellladung'));
        expect(block.slice(0, 600)).toContain('entwerteNach(');
    });

    it('der Hub liest Achsen UND Journalstand und stösst den Plan an', () => {
        const hub = viewer.slice(viewer.indexOf('async function entwerteNach'));
        const kopf = hub.slice(0, hub.indexOf('\n}'));
        expect(kopf).toContain('entwertetGeometrie');
        expect(kopf).toContain('leseAchsen');
        // Stufe 17.3: ohne den Journalstand stünde der Geist wieder im Netz.
        expect(kopf).toContain('setzeJournalStand');
        expect(kopf).toContain('cdeAchsenAus');
        expect(kopf).toContain('verdeckteAus');
        expect(kopf).toContain('bumpGeometrieStand');
    });
});

describe('Die Verklebung im Plan', () => {
    it('der Lageplan hängt am geometrieStand-Zähler', () => {
        expect(plan).toContain('ifc.geometrieStand');
        // … und zwar an der ENTWERTENDEN Beobachtung, nicht am reinen Zeichnen.
        const beob = plan.slice(plan.indexOf('ifc.geometrieStand') - 400,
                                plan.indexOf('ifc.geometrieStand') + 400);
        expect(beob).toContain('entwerte');
    });
});
