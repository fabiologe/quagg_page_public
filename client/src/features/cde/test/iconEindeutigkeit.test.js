/**
 * X4 — ein Icon, eine Bedeutung (Teil XII).
 *
 * Die Inventur fand `measure` mit sieben, `edit` mit acht Bedeutungen und
 * `close` als Schliessen UND Löschen. Dieser Vertrag hält die entschärften
 * Stellen fest — wer ein Icon zurückdreht, hört es hier.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nachId } from '../services/Bearbeitungen.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { ANSICHTS_MODI_META } from '../services/ViewModes.js';
import { PANEL_DEFS } from '../stores/usePanels.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (p) => readFileSync(WURZEL + p, 'utf8');

describe('Katalog und Kataloge tragen eindeutige Zeichen', () => {
    it('Tiefbau-Werkzeuge: Trasse, Gerinne, Planum, Linie, Schacht', () => {
        expect(nachId('trasse-aendern').icon).toBe('trasse');
        expect(nachId('gerinne-einschneiden').icon).toBe('gerinne');
        expect(nachId('planum-herstellen').icon).toBe('planum');
        expect(rezeptNach('linie').icon).toBe('route');
        expect(rezeptNach('schacht').icon).toBe('schacht');   // vorher: Schere!
    });

    it('„Plan" heisst Karte — view-top ist wieder NUR die Kamera-Draufsicht', () => {
        expect(ANSICHTS_MODI_META?.lageplan?.icon ?? lies('services/ViewModes.js').match(/'lageplan':[^}]*icon: '([a-z-]+)'/)[1]).toBe('karte');
        expect(PANEL_DEFS.find(p => p.id === 'plan').icon).toBe('karte');
        expect(PANEL_DEFS.find(p => p.id === 'verlauf').icon).toBe('verlauf');
    });
});

describe('Die Plan-Leiste spricht eindeutig', () => {
    const view = lies('views/CdeView.vue');
    it('Radierer ist ein Radierer, Beschriften ist Text, Bemaßen ist kein Messen', () => {
        expect(view).toContain('name="radierer"');
        expect(view).toContain('name="text"');
        expect(view).toContain('name="bemassen"');
        // und der Rückfall ist weg:
        expect(view).not.toMatch(/name="undo"[^\n]*Radieren/);
    });
});

describe('X schliesst, der Eimer löscht', () => {
    it('an den vier umgezogenen Lösch-Knöpfen steht delete', () => {
        for (const [datei, umfeld] of [
            ['components/IfcAnnotations.vue', 'Issue löschen'],
            ['components/IfcSavedViews.vue', 'Löschen'],
            ['components/IfcPlanPanel.vue', 'Logo entfernen'],
            ['views/CdeView.vue', 'Aus Register entfernen'],
        ]) {
            const t = lies(datei);
            const i = t.indexOf(umfeld);
            expect(i, `${datei}: ${umfeld}`).toBeGreaterThan(-1);
            expect(t.slice(i, i + 220), `${datei}: ${umfeld}`).toContain('name="delete"');
        }
    });
});
