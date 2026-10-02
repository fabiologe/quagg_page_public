// @vitest-environment jsdom
/**
 * Teil XXVIII, V8 — Abnahme P7 (Regenüberlaufbecken), so weit dieses Modell reicht,
 * NUR ÜBER KOMMANDOS.
 *
 *   1  Zweikammer-RÜB aus der Vorlage (lichte Länge 4,00 je Kammer), Schwelle 212,40
 *   2  lichte Länge 4,00 → 16,67 m: EIN Kommando — 2 · 16,67 · 3,00 · 2,50 = 250,05 m³
 *      (Soll 250 m³ ± 1 %, gemessen als Σ IfcSpace.NetVolume, nicht eingegeben)
 *   3  Einbauten: Rechen im Zulauf, Drossel vor dem Ablauf, Tauchwand vor der
 *      Schwelle, Sauberkeitsschicht und Bettung unter der Platte
 *   4  Zulauf DN 400 durch die Stirnwand West, Ablauf DN 300 durch die Stirnwand Ost,
 *      je eine Durchführung (Ringspalt 0,05)
 *
 * Aussenlänge 2 · 16,67 + 3 · 0,30 = 34,24 m. Beton brutto, von Hand:
 *   Platte 34,24 · 3,60 · 0,40 = 49,3056 · Längswände 2 · 34,24 · 0,30 · 2,50 = 51,36
 *   Stirnwände 2 · 3,00 · 0,30 · 2,50 = 4,50 · Trennwand 3,00 · 0,30 · 1,90 = 1,71
 *   Schwelle 3,00 · 0,30 · 0,50 = 0,45 · Decke 34,24 · 3,60 · 0,25 = 30,816  → 138,1416 m³
 *
 * Legt das Vertragspaket für den Schreiber ab:
 *     P7_VERTRAG_SCHREIBEN=1 npx vitest run src/features/cde/test/abnahmeP7.test.js
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
import { RUEB_AUS_VORLAGE, RUEB_BEIWERT, RUEB_W, Speicher, paketAus, r6 } from './hilfen/vorlagenKommandos.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../backend/app/ifc/tests/daten/paket_p7.json');

const L = 16.67, T = 0.3, AUSSEN = 2 * L + 3 * T;          // 34,24
const X_TRENN = T + L + T / 2;                              // Achse der Trennwand
const rechteck = (x0, n0, l, b, h) => [e(x0, n0, h), e(x0 + l, n0, h), e(x0 + l, n0 - b, h), e(x0, n0 - b, h)];

export const P7 = () => [
    RUEB_AUS_VORLAGE(),
    ...RUEB_BEIWERT(),
    k('vorlage-werte-setzen', { ziel: ['cde-RUEB'], werte: { ...RUEB_W, laenge: L } }),
    k('rechen-zeichnen', { neu: ['cde-RE'], eingaben: { zug: [e(1.5, -0.3, 210), e(1.5, -3.3, 210)] },
        werte: { name: 'Rechen Zulauf', kategorie: 'IFCFILTER', hoehe: '', stabtiefe: 0.08, rechenhoehe: 1.5,
                 stababstand: 0.02, reinigungsart: 'maschinell' } }),
    k('tauchwand-zeichnen', { neu: ['cde-TA'], eingaben: { zug: [e(X_TRENN + 0.8, -0.3, 211.6), e(X_TRENN + 0.8, -3.3, 211.6)] },
        werte: { name: 'Tauchwand', kategorie: 'IFCWALL', hoehe: '', dicke: 0.2, wandhoehe: 0.9 } }),
    k('drossel-zeichnen', { neu: ['cde-DR'], eingaben: { zug: [e(AUSSEN - 1.3, -1.8, 210), e(AUSSEN - 0.5, -1.8, 210)] },
        werte: { name: 'Drossel', kategorie: 'IFCVALVE', hoehe: '', dn: 200, drosselabfluss: 25, stauhoehe: 2.4,
                 kennlinie: 'Annahme der Abnahme, nicht bemessen' } }),
    k('sauberkeitsschicht-zeichnen', { neu: ['cde-SK'], eingaben: { umriss: rechteck(-0.1, 0.1, AUSSEN + 0.2, 3.8, 209.6) },
        werte: { name: 'Sauberkeitsschicht', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.1 } }),
    k('bettung-zeichnen', { neu: ['cde-BT'], eingaben: { umriss: rechteck(-0.2, 0.2, AUSSEN + 0.4, 4, 209.5) },
        werte: { name: 'Kiesbettung', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.2 } }),
    ...['cde-RE', 'cde-DR'].map(gid => k('auf-bauteil-stellen', { ziel: [gid], werte: { bauteil: 'cde-BP', mass: 'oberkante', versatz: 0 } })),
    ...['cde-RE', 'cde-DR', 'cde-TA', 'cde-SK', 'cde-BT'].map(gid => k('bauwerk-zuordnen', { ziel: [gid], eingaben: { auswahl: { bauwerk: 'cde-RUEB' } } })),
    // Zulauf und Ablauf: Rohre durch die Stirnwände, je eine Durchführung.
    k('rohr-zeichnen', { neu: ['cde-ZU'], werte: { name: 'Zulauf', kategorie: 'IFCPIPESEGMENT', hoehe: 210.6, dn: 400 },
        eingaben: { zug: [e(-3, -1.8, 210.6), e(0.6, -1.8, 210.6)] } }),
    k('durchfuehrung-setzen', { ziel: ['cde-ZU'], neu: ['cde-DZ', 'op-DZ'], werte: { wirt: 'cde-SW', ringspalt: 0.05 } }),
    k('rohr-zeichnen', { neu: ['cde-AB'], werte: { name: 'Ablauf', kategorie: 'IFCPIPESEGMENT', hoehe: 210.0, dn: 300 },
        eingaben: { zug: [e(AUSSEN - 0.5, -1.8, 210.0), e(AUSSEN + 3, -1.8, 210.0)] } }),
    k('durchfuehrung-setzen', { ziel: ['cde-AB'], neu: ['cde-DA', 'op-DA'], werte: { wirt: 'cde-SO', ringspalt: 0.05 } }),
];

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

describe('Abnahme Teil XXVIII — P7 aus der Vorlage, nur über Kommandos', () => {
    it('250 m³ ± 1 % gemessen, Einbauten, Zulauf und Ablauf; Rückgängig bis zum Anfang', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        const liste = P7();
        for (const kom of liste) {
            const erg = await b.fuehreAus(kom);
            expect(erg.ausgefuehrt, `${kom.werkzeug} ${kom.ziel ?? ''}: ${erg.grund ?? ''}`).toBe(true);
        }
        expect(liste).toHaveLength(20);
        const p = await paketAus(ae);
        const t = (gid) => p.bauteile.find(x => x.cdeId === gid);

        // Das Speichervolumen: ein Messwert aus den Räumen.
        const raeume = p.bauteile.filter(x => x.klasse === 'IFCSPACE');
        const speicher = raeume.reduce((a, x) => a + x.mengen.netVolume, 0);
        expect(raeume).toHaveLength(2);
        expect(r6(speicher)).toBe(250.05);
        expect(Math.abs(speicher - 250) / 250).toBeLessThan(0.01);

        // Der Beton des Beckens, brutto (die Durchführungen ziehen netto ab).
        const becken = ['cde-BP', 'cde-LN', 'cde-LS', 'cde-SW', 'cde-SO', 'cde-TW', 'cde-UE', 'cde-DE'];
        expect(r6(becken.reduce((a, g) => a + (t(g).mengen.grossVolume ?? t(g).mengen.netVolume), 0))).toBe(138.1416);
        for (const g of ['cde-SW', 'cde-SO']) expect(t(g).mengen.netVolume).toBeLessThan(t(g).mengen.grossVolume);

        // Die Schwelle: gemessen 212,40, das Betriebswasser beider Kammern ebenso.
        expect(t('cde-UE').merkmale.Quagg_Entlastung.SchwellenhoeheNN).toBe(212.4);
        for (const g of ['cde-R1', 'cde-R2']) expect(t(g).merkmale.Quagg_Speicherraum.BetriebswasserNN).toBeCloseTo(212.4, 9);

        // Die Durchführungen sitzen in ihren Stirnwänden.
        const oeffnungen = p.bauteile.filter(x => x.klasse === 'IFCOPENINGELEMENT').map(x => [x.wirt, r6(x.mengen.width)]).sort();
        expect(oeffnungen).toEqual([['cde-SO', 0.4], ['cde-SW', 0.5]]);

        // Die Einbauten gehören zum RÜB; Rechen und Drossel stehen auf der Platte.
        for (const g of ['cde-RE', 'cde-DR', 'cde-TA', 'cde-SK', 'cde-BT']) expect(t(g).teilVon, g).toBe('cde-RUEB');
        expect(rezeptNach('rechen').stand.lies(ae.wirksamerStand('erzeugt').get('cde-RE').parameter)).toBeCloseTo(210, 9);

        // Nichts weicht von der Vorlage ab; das Bauwerk trägt die Werte von heute.
        expect(b.befundeVon('cde-RUEB').filter(x => x.regel === 'vorlage_abweichung')).toEqual([]);
        expect(ae.wirksamerStand('erzeugt').get('cde-RUEB').parameter.bauwerksvorlage.werte.laenge).toBe(L);

        if (process.env.P7_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(p));
        expect(existsSync(FIXTURE), 'Fixture fehlt: P7_VERTRAG_SCHREIBEN=1 …').toBe(true);
        const alt = JSON.parse(readFileSync(FIXTURE, 'utf8'));
        expect(alt.bauteile.map(x => [x.cdeId, x.klasse, x.wirt ?? null, x.teilVon ?? null]))
            .toEqual(p.bauteile.map(x => [x.cdeId, x.klasse, x.wirt ?? null, x.teilVon ?? null]));

        // Rückgängig, Schritt für Schritt: ein Vorgang je Kommando, am Ende leer.
        expect(new Set(ae.eintraege.map(x => x.vorgang)).size).toBe(liste.length);
        for (let i = 0; i < liste.length; i++) await ae.zurueck();
        expect(ae.wirksamerStand('erzeugt').size).toBe(0);
    });
});
