// @vitest-environment jsdom
/**
 * Teil XXVIII, V5 — die Einbauten eines Beckens, NUR ÜBER KOMMANDOS (Fabios E36).
 *
 * Der Zweikammer-RÜB aus der Vorlage (V4), dazu:
 *   Rechen        IfcFilter/STRAINER, Rechenfeld 3,00 × 0,08 × 1,50 in Kammer 1,
 *                 Quagg_Rechen: Stababstand 0,02 m, maschinell
 *   Drossel       IfcValve/REGULATING, DN 200 durch die Stirnwand Ost,
 *                 Quagg_Drossel: Q_Dr 25 l/s → 0,025 m³/s, Stauhöhe 2,40 m
 *   Tauchwand     IfcWall/USERDEFINED „Tauchwand", Unterkante 211,00, 1,50 hoch
 *   Sauberkeitsschicht  IfcSlab/USERDEFINED, 9,10 × 3,80 × 0,10 = 3,458 m³ unter der Platte
 *   Bettung       IfcSlab/USERDEFINED, 9,30 × 4,00 × 0,20 = 7,440 m³ darunter
 * Rechen und Drossel stehen auf der Bodenplatte (B5), alle gehören zum RÜB.
 *
 * Legt das Vertragspaket für den Schreiber ab:
 *     EINBAUTEN_VERTRAG_SCHREIBEN=1 npx vitest run src/features/cde/test/einbauten.test.js
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { e, k } from './hilfen/kammerKommandos.js';
import { Speicher, paketAus, RUEB_AUS_VORLAGE, RUEB_BEIWERT } from './hilfen/vorlagenKommandos.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../backend/app/ifc/tests/daten/paket_einbauten.json');

const rechteck = (x0, n0, l, b, h) => [e(x0, n0, h), e(x0 + l, n0, h), e(x0 + l, n0 - b, h), e(x0, n0 - b, h)];
export const EINBAUTEN = () => [
    k('rechen-zeichnen', { neu: ['cde-RE'], eingaben: { zug: [e(1, -0.3, 210), e(1, -3.3, 210)] },
        werte: { name: 'Rechen Zulauf', kategorie: 'IFCFILTER', hoehe: '', stabtiefe: 0.08, rechenhoehe: 1.5,
                 stababstand: 0.02, reinigungsart: 'maschinell' } }),
    k('drossel-zeichnen', { neu: ['cde-DR'], eingaben: { zug: [e(8.4, -1.8, 210), e(9.2, -1.8, 210)] },
        werte: { name: 'Drossel', kategorie: 'IFCVALVE', hoehe: '', dn: 200, drosselabfluss: 25, stauhoehe: 2.4,
                 kennlinie: 'Annahme der Abnahme, nicht bemessen' } }),
    k('tauchwand-zeichnen', { neu: ['cde-TA'], eingaben: { zug: [e(5, -0.3, 211), e(5, -3.3, 211)] },
        werte: { name: 'Tauchwand', kategorie: 'IFCWALL', hoehe: '', dicke: 0.2, wandhoehe: 1.5 } }),
    k('sauberkeitsschicht-zeichnen', { neu: ['cde-SK'], eingaben: { umriss: rechteck(-0.1, 0.1, 9.1, 3.8, 209.6) },
        werte: { name: 'Sauberkeitsschicht', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.1 } }),
    k('bettung-zeichnen', { neu: ['cde-BT'], eingaben: { umriss: rechteck(-0.2, 0.2, 9.3, 4, 209.5) },
        werte: { name: 'Kiesbettung', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.2 } }),
    ...['cde-RE', 'cde-DR'].map(gid => k('auf-bauteil-stellen', { ziel: [gid], werte: { bauteil: 'cde-BP', mass: 'oberkante', versatz: 0 } })),
    ...['cde-RE', 'cde-DR', 'cde-TA', 'cde-SK', 'cde-BT'].map(gid => k('bauwerk-zuordnen', { ziel: [gid], eingaben: { auswahl: { bauwerk: 'cde-RUEB' } } })),
];

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

describe('Teil XXVIII, V5 — die Einbauten im RÜB', () => {
    it('fünf Einbauten über Kommandos: Klasse, Ausführung, Merkmale, Mengen, Stand', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        for (const kom of [RUEB_AUS_VORLAGE(), ...RUEB_BEIWERT(), ...EINBAUTEN()]) {
            const erg = await b.fuehreAus(kom);
            expect(erg.ausgefuehrt, `${kom.werkzeug} ${kom.ziel ?? ''}: ${erg.grund ?? ''}`).toBe(true);
        }
        const p = await paketAus(ae);
        const t = (gid) => p.bauteile.find(x => x.cdeId === gid);
        const kurz = (x) => [x.klasse, x.predefinedType, x.objektTyp ?? null, x.teilVon];
        expect(kurz(t('cde-RE'))).toEqual(['IFCFILTER', 'STRAINER', null, 'cde-RUEB']);
        expect(kurz(t('cde-DR'))).toEqual(['IFCVALVE', 'REGULATING', null, 'cde-RUEB']);
        expect(kurz(t('cde-TA'))).toEqual(['IFCWALL', 'USERDEFINED', 'Tauchwand', 'cde-RUEB']);
        expect(kurz(t('cde-SK'))).toEqual(['IFCSLAB', 'USERDEFINED', 'Sauberkeitsschicht', 'cde-RUEB']);
        expect(kurz(t('cde-BT'))).toEqual(['IFCSLAB', 'USERDEFINED', 'Bettung', 'cde-RUEB']);
        // Die Merkmale: was keine bSI-Vorlage kennt, in den Hauseigenen; Q_Dr in m³/s.
        expect(t('cde-RE').merkmale).toEqual({ Quagg_Rechen: { Stababstand: 0.02, Reinigungsart: 'maschinell' } });
        expect(t('cde-DR').merkmale).toEqual({ Quagg_Drossel: { Drosselabfluss: 0.025, Stauhoehe: 2.4,
                                                                Kennlinie: 'Annahme der Abnahme, nicht bemessen' } });
        expect(t('cde-TA').merkmale).toEqual({ Pset_WallCommon: { LoadBearing: false, IsExternal: false } });
        expect(t('cde-SK').merkmale).toEqual({ Pset_SlabCommon: { LoadBearing: false } });
        // Die Mengen, von Hand: 9,10 · 3,80 · 0,10 und 9,30 · 4,00 · 0,20; die Tauchwand 3,00 · 0,20 · 1,50.
        const r6 = (v) => Math.round(v * 1e6) / 1e6;
        expect(r6(t('cde-SK').mengen.netVolume)).toBe(3.458);
        expect(r6(t('cde-BT').mengen.netVolume)).toBe(7.44);
        expect(r6(t('cde-TA').mengen.netVolume)).toBe(0.9);
        // Rechen und Drossel stehen auf der Platte — und folgen ihr.
        const stand = ae.wirksamerStand('erzeugt');
        expect(stand.get('cde-RE').parameter.hoeheVon).toEqual({ bauteil: 'cde-BP', mass: 'oberkante', versatz: 0 });
        expect(rezeptNach('drossel').stand.oberkante(stand.get('cde-DR').parameter)).toBeCloseTo(210.2, 9);
        // Der Beton des Beckens bleibt, was er war; die Vorlage weicht nirgends ab.
        const beton = p.bauteile.filter(x => x.teilVon === 'cde-RUEB' && !['IFCSPACE', 'IFCFILTER', 'IFCVALVE'].includes(x.klasse)
                                           && !['cde-TA', 'cde-SK', 'cde-BT'].includes(x.cdeId));
        expect(r6(beton.reduce((a, x) => a + x.mengen.netVolume, 0))).toBe(40.836);
        expect(b.befundeVon('cde-RUEB').filter(x => x.regel === 'vorlage_abweichung')).toEqual([]);

        if (process.env.EINBAUTEN_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(p));
        expect(existsSync(FIXTURE), 'Fixture fehlt: EINBAUTEN_VERTRAG_SCHREIBEN=1 …').toBe(true);
        const alt = JSON.parse(readFileSync(FIXTURE, 'utf8'));
        expect(alt.bauteile.map(x => [x.cdeId, x.klasse, x.predefinedType, x.teilVon ?? null]))
            .toEqual(p.bauteile.map(x => [x.cdeId, x.klasse, x.predefinedType, x.teilVon ?? null]));
    });

    it('die Merkmalsprüfung: ein Satz für eine Ausführung, ein Durchfluss in m³/s oder l/s', async () => {
        const { zielfehler } = await import('../services/katalog/Merkmalsziele.js');
        const feld = { name: 'stababstand', typ: 'zahl', einheit: 'm', pset: 'Quagg_Rechen.Stababstand' };
        expect(zielfehler(feld, 'IFCFILTER', 'STRAINER')).toBeNull();
        expect(zielfehler(feld, 'IFCFILTER', 'OILFILTER')).toMatch(/gilt nicht für IFCFILTER\/OILFILTER/);
        const q = { name: 'q', typ: 'zahl', einheit: 'l/s', pset: 'Quagg_Drossel.Drosselabfluss' };
        expect(zielfehler(q, 'IFCVALVE')).toBeNull();
        expect(zielfehler({ ...q, einheit: 'm³/h' }, 'IFCVALVE')).toMatch(/m³\/s oder l\/s/);
    });
});

describe('Teil XXVIII, V6 — die Rigole (P8)', () => {
    it('20 × 2,0 × 1,2 m, Hohlraumanteil 30 %: Volume 48 m³, nutzbar 14,4 m³ — gerechnet, nicht getippt', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        const erg = await b.fuehreAus(k('rigole-zeichnen', { neu: ['cde-RG'], eingaben: { umriss: rechteck(0, 0, 20, 2, 99.5) },
            werte: { name: 'Rigole', kategorie: 'IFCCOURSE', hoehe: '', dicke: 1.2, hohlraumanteil: 30, kf: 0.0001,
                     herleitung: 'Annahme der Abnahme, nicht bemessen' } }));
        expect(erg.ausgefuehrt, erg.grund).toBe(true);
        const t = (await paketAus(ae)).bauteile.find(x => x.cdeId === 'cde-RG');
        expect([t.klasse, t.predefinedType]).toEqual(['IFCCOURSE', 'FILTER']);
        expect(t.mengen).toMatchObject({ thickness: 1.2 });
        expect(Math.round(t.mengen.volume * 1e6) / 1e6).toBe(48);
        expect(t.merkmale.Quagg_Versickerung).toEqual({ Hohlraumanteil: 0.3, DurchlaessigkeitKf: 0.0001,
            Herleitung: 'Annahme der Abnahme, nicht bemessen', NutzbaresVolumen: 14.4 });
        // Der Anteil folgt dem Feld, das Volumen dem Körper: 35 % und 1,50 m → 60 · 0,35 = 21,0.
        for (const kom of [k('rigole-hohlraumanteil-setzen', { ziel: ['cde-RG'], werte: { hohlraumanteil: 35 } }),
                           k('rigole-dicke-setzen', { ziel: ['cde-RG'], werte: { dicke: 1.5 } })]) {
            expect((await b.fuehreAus(kom)).ausgefuehrt).toBe(true);
        }
        const neu = (await paketAus(ae)).bauteile.find(x => x.cdeId === 'cde-RG');
        expect(neu.merkmale.Quagg_Versickerung.NutzbaresVolumen).toBe(21);
    });

    it('ohne Hohlraumanteil keine Rigole — er ist die eine Zahl, die der Planer nennen muss', async () => {
        const b = useBearbeitung();
        const erg = await b.fuehreAus(k('rigole-zeichnen', { neu: ['cde-RG'], eingaben: { umriss: rechteck(0, 0, 20, 2, 99.5) },
            werte: { name: 'Rigole', kategorie: 'IFCCOURSE', hoehe: '', dicke: 1.2 } }));
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toMatch(/hohlraumanteil: fehlt/);
    });

    it('die Katalogprüfung: ein Rechenmerkmal braucht eine Menge und ein Zahlfeld mit Merkmal', async () => {
        const { pruefeEintrag } = await import('../services/katalog/Katalogschema.js');
        const { EINGEBAUTE_REZEPTE } = await import('../services/rezept/Eingebaut.js');
        const r = EINGEBAUTE_REZEPTE.find(x => x.id === 'rigole');
        expect(pruefeEintrag('rezept', { ...r, id: 'kopie' }).fehler).toEqual([]);
        const falsch = { ...r, id: 'kopie', rechenmerkmale: { 'Quagg_Versickerung.NutzbaresVolumen': { menge: 'netVolume', mal: 'name' } } };
        expect(pruefeEintrag('rezept', falsch).fehler.join(' ')).toMatch(/„netVolume" ist keine Menge.*„name" ist kein Zahlfeld/);
        const prozent = { ...r, id: 'kopie', felder: r.felder.map(f => (f.name === 'hohlraumanteil' ? { ...f, einheit: '‰' } : f)) };
        expect(pruefeEintrag('rezept', prozent).fehler.join(' ')).toMatch(/IfcRatioMeasure braucht ein Feld in % oder -/);
    });
});
