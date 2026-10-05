// @vitest-environment jsdom
/**
 * Teil XXXI, T6 — die fehlenden Griffe: DN an Rohr und Schacht, die Länge eines Pfostens.
 *
 * Bestand vorher (Teich P11, 70 Kommandos): Rohr DN 0 von 1, Schacht DN 0 von 1, Pfosten Länge 0 von 1 setzbaren
 * Zahlen mit Griff — nur im Formular. Jetzt erklärt das Feld seinen Griff (`griff: { richtung: 'radial' }` bzw. `'y'`),
 * ohne eine Zeile je Rezept; gezogen wird der vorhandene Setzer `<rezept>-<feld>-setzen`.
 *
 * Echter Weg: Bauteile über Kommandos gezeichnet, Griffe aus dem Stand (`griffeFuer` mit `subjektAusStand`), der Zug
 * über `griffZuWerten`, geschrieben über `fuehreAus` ins Journal.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { griffeFuer, griffZuWerten } from '../services/Griffe.js';
import { pruefeEintrag } from '../services/katalog/Katalogschema.js';
import { kommando } from './hilfen/ruebKommandos.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';

let b, ae;
beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); b = useBearbeitung(); ae = useAenderungen(); });
afterEach(() => repo.setBackend(null));

const e = (ost, nord, hoehe) => ({ ost, nord, hoehe });
const plan = (gid) => ae.wirksamerStand('erzeugt').get(gid);
const griffe = (gid) => griffeFuer({ subjekt: subjektAusStand(gid, { wirksamerStand: ae.wirksamerStand }), subjektHerkunft: 'cde' });
async function fuehre(k) {
    const r = await b.fuehreAus(k);
    expect(r.ausgefuehrt, r.grund ?? '').toBe(true);
}
async function ziehe(g, pos) {
    const werte = griffZuWerten(g, pos);
    await fuehre(kommando(g.werkzeug, { ziel: [g.globalId], werte }));
    return werte;
}

describe('DN am Griff', () => {
    it('Rohr DN 600: der Griff sitzt am Profilrand (0,30 m quer zur Achse, in Rohrmitte) — 0,40 m gezogen ist DN 800', async () => {
        await fuehre(kommando('rohr-zeichnen', { neu: ['cde-R'], werte: { name: 'Zulauf', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 600 },
                                                  eingaben: { zug: [e(0, 0, 100), e(20, 0, 99.8)] } }));
        const g = griffe('cde-R').find(x => x.feld?.name === 'dn');
        expect(g).toMatchObject({ art: 'feldmass', werkzeug: 'rohr-dn-setzen', achsen: 'XZ' });
        const p = plan('cde-R').parameter;
        const [a, c] = p.punkte;
        const mitte = { x: (a[0] + c[0]) / 2, z: (a[2] + c[2]) / 2 };
        expect(Math.hypot(g.pos.x - mitte.x, g.pos.z - mitte.z)).toBeCloseTo(0.3, 9);
        // Mit Sohlbezug (K4) liegt die Achse einen Radius über den Punkten.
        const sohle = (a[1] + c[1]) / 2;
        expect(g.pos.y).toBeCloseTo(p.achsbezug === 'sohle' ? sohle + 0.3 : sohle, 9);
        const quer = { x: (g.pos.x - mitte.x) / 0.3, z: (g.pos.z - mitte.z) / 0.3 };
        expect(await ziehe(g, { x: mitte.x + quer.x * 0.4, y: g.pos.y, z: mitte.z + quer.z * 0.4 })).toEqual({ dn: 800 });
        expect(plan('cde-R').parameter.dn).toBe(800);
    });

    it('Schacht DN 1000: der Griff steht in halber Tiefe, 0,50 m östlich — 0,75 m gezogen ist DN 1500, ganze mm', async () => {
        await fuehre(kommando('schacht-zeichnen', { neu: ['cde-S'], werte: { name: 'S1', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1000 },
                                                     eingaben: { zug: [e(5, 5, 98), e(5, 5, 101)] } }));
        const g = griffe('cde-S').find(x => x.feld?.name === 'dn');
        expect(g).toMatchObject({ werkzeug: 'schacht-dn-setzen', achsen: 'XZ' });
        const [s0] = plan('cde-S').parameter.punkte;
        expect(g.pos.x - s0[0]).toBeCloseTo(0.5, 9);
        expect(g.pos.z).toBeCloseTo(s0[2], 9);
        expect(g.pos.y).toBeCloseTo(99.5, 9);                            // halbe Tiefe zwischen 98 und 101
        expect(await ziehe(g, { x: s0[0] + 0.7503, y: g.pos.y, z: s0[2] })).toEqual({ dn: 1501 });
        expect(plan('cde-S').parameter.dn).toBe(1501);
    });
});

describe('Pfostenlänge am Griff', () => {
    it('Pfosten 1,00 m: der Griff sitzt auf dem Kopf — 2,50 m über dem Fuss gezogen ist die Länge 2,50 m', async () => {
        await fuehre(kommando('pfosten-zeichnen', { neu: ['cde-P'], werte: { name: 'Leitpfosten', kategorie: 'IFCSIGN', hoehe: '', laenge: 1, breite: 0.12, tiefe: 0.12 },
                                                     eingaben: { zug: [e(2, -3, 100)] } }));
        const g = griffe('cde-P').find(x => x.feld?.name === 'laenge');
        expect(g).toMatchObject({ werkzeug: 'pfosten-laenge-setzen', achsen: 'Y' });
        const fuss = plan('cde-P').parameter.punkte[0][1];
        expect(g.pos.y).toBeCloseTo(fuss + 1, 9);
        expect(await ziehe(g, { ...g.pos, y: fuss + 2.5 })).toEqual({ laenge: 2.5 });
        expect(plan('cde-P').parameter.laenge).toBe(2.5);
    });
});

describe('ein Bibliotheksrezept darf den Griff erklären', () => {
    it('das Katalogschema kennt „radial" — und lehnt eine unbekannte Richtung weiter ab', () => {
        const rezept = (richtung) => ({ id: 'kanal-rund', titel: 'Kanal rund', bauform: 'achse+profil', kategorieVorgabe: 'IFCPIPESEGMENT',
            mindestPunkte: 2, geschlossen: false, netzrolle: 'kante',
            felder: [{ name: 'dn', titel: 'DN', einheit: 'mm', typ: 'zahl', vorgabe: 400, setzbar: true, griff: { richtung } }],
            geometrie: { art: 'sweep', profil: { art: 'kreis', durchmesser: 'dn', einheit: 'mm', ecken: 12 } } });
        expect(pruefeEintrag('rezept', rezept('radial')).fehler.filter(f => /griff/.test(f))).toEqual([]);
        expect(pruefeEintrag('rezept', rezept('schraeg')).fehler.some(f => /griff\.richtung/.test(f))).toBe(true);
    });
});
