// @vitest-environment jsdom
/**
 * Teil XXIX, G6 — die Gewerke im IFC (Konzept E42): das Paket trägt je Bauteil sein Gewerk mit dem System aus dem
 * Katalog; der Schreiber fasst je Bauwerk und Gewerk zusammen (`test_bauwerke.py::test_g6…`).
 *
 * Szenario: die Kammer aus der Vorlage (Platten und Wände → Konstruktiv, der Raum → Entwässerung), dazu ohne Bauwerk ein
 * Rohr aus dem Reiter „Leitungen" und ein Zaun (Ausstattung). Erwartet: vier Systeme — zwei an der Kammer, zwei an der Site.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { GEWERKE } from '../services/katalog/Gewerke.js';
import { KAMMER_AUS_VORLAGE, Speicher, paketAus } from './hilfen/vorlagenKommandos.js';
import { e, k } from './hilfen/kammerKommandos.js';

/** Das Vertragspaket: `GEWERKE_VERTRAG_SCHREIBEN=1 npx vitest run …/gewerkSysteme.test.js`. */
const FIXTURE = `${process.cwd()}/../backend/app/ifc/tests/daten/paket_gewerke_g6.json`;

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

describe('Teil XXIX, G6 — die Gewerke im Paket', () => {
    it('der Katalog nennt je Gewerk sein System — Erdbau und Vermessung keines', () => {
        expect(Object.fromEntries(Object.entries(GEWERKE).map(([id, g]) => [id, g.system
            ? `${g.system.klasse}/${g.system.typ}${g.system.objektTyp ? ` ${g.system.objektTyp}` : ''}` : null]))).toEqual({
            erdbau: null,
            entwaesserung: 'IfcDistributionSystem/DRAINAGE',
            wasserbau: 'IfcBuiltSystem/EROSIONPREVENTION',
            konstruktiv: 'IfcBuiltSystem/USERDEFINED Konstruktiver Ingenieurbau',
            verkehr: 'IfcBuiltSystem/USERDEFINED Verkehrsfläche',
            ausstattung: 'IfcBuiltSystem/USERDEFINED Ausstattung',
            leitungen: 'IfcDistributionSystem/USERDEFINED Leitungen Dritter',
            ta: 'IfcDistributionSystem/USERDEFINED Technische Ausrüstung',
            landschaft: 'IfcBuiltSystem/USERDEFINED Landschaft',
            vermessung: null,
        });
    });

    it('das Paket trägt je Bauteil Gewerk und System — die Kammer, ein Rohr unter „Leitungen", ein Zaun', async () => {
        const b = useBearbeitung();
        for (const kom of [
            KAMMER_AUS_VORLAGE(),
            k('rohr-zeichnen', { neu: ['cde-LT'], eingaben: { zug: [e(20, 0, 209), e(40, 0, 209)] },
                werte: { name: 'Wasserleitung', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 150, gewerk: 'leitungen' } }),
            k('wand-zeichnen', { neu: ['cde-ZA'], eingaben: { zug: [e(-5, 5, 210), e(15, 5, 210)] },
                werte: { name: 'Zaun', kategorie: 'IFCRAILING', hoehe: '', dicke: 0.05, wandhoehe: 1.6, predefinedType: 'FENCE' } }),
        ]) expect((await b.fuehreAus(kom)).ausgefuehrt, kom.werkzeug).toBe(true);
        const p = await paketAus(useAenderungen());
        const gw = Object.fromEntries(p.bauteile.map(t => [t.cdeId, t.gewerk?.id ?? null]));
        expect(gw).toEqual({ 'cde-BP': 'konstruktiv', 'cde-WN': 'konstruktiv', 'cde-WS': 'konstruktiv', 'cde-WW': 'konstruktiv',
                             'cde-WO': 'konstruktiv', 'cde-DE': 'konstruktiv', 'cde-RA': 'entwaesserung',
                             'cde-LT': 'leitungen', 'cde-ZA': 'ausstattung' });
        expect(p.bauteile.find(t => t.cdeId === 'cde-LT').gewerk).toEqual({ id: 'leitungen', titel: 'Leitungen',
            system: { klasse: 'IfcDistributionSystem', typ: 'USERDEFINED', objektTyp: 'Leitungen Dritter' } });
        if (process.env.GEWERKE_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(p));
        expect(existsSync(FIXTURE), 'Fixture fehlt: GEWERKE_VERTRAG_SCHREIBEN=1 …').toBe(true);
        expect(JSON.parse(readFileSync(FIXTURE, 'utf8')).bauteile.map(t => [t.cdeId, t.klasse, t.gewerk?.id ?? null]))
            .toEqual(p.bauteile.map(t => [t.cdeId, t.klasse, t.gewerk?.id ?? null]));
    });
});
