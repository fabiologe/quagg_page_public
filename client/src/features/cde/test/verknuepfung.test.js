// @vitest-environment jsdom
/**
 * Verknüpfung statt Zufall (Teil XXIV, K8 — Fabios E6).
 *
 * Eigene Bauteile erklären ihren Anschluss im Bauplan (`anschluss: {anfang,
 * ende}` als GlobalId); die Koinzidenz in der Draufsicht bleibt der Weg für
 * Geliefertes. Weichen Erklärung und Lage ab, ist das ein Befund, kein
 * Fehler. Die Toleranz steht im Regelwerk (`netzToleranzM`).
 *
 *   1. Eine Haltung, die ihre Schächte NENNT: Lage und Sohle vom Knoten,
 *      der Bauplan trägt den Anschluss, das Netz verbindet.
 *   2. Ein um 5 cm verschobener Schacht: „Anschluss abweichend" statt eines
 *      stillen losen Endes; ein gelöschter: „Anschluss verwaist".
 *   3. Die Toleranz aus dem Regelwerk.
 *   4. Werkzeuge: Kopieren/Reihe/Spiegeln nehmen den Anschluss nicht mit;
 *      Teilen und Schacht einfügen geben jedem Stück, was an seinem Ende gilt;
 *      „An Schacht anschliessen" schreibt ihn an ein eigenes Rohr.
 *   5. Das Schema: Knotenverweise nur am Rand, ein fehlender Knoten ist E8.
 *   6. Die Oberfläche: der Fang nennt den Knoten und übernimmt seine Sohle.
 *   7. Über die Engine: ein genannter GELIEFERTER Schacht verbindet auch.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useEingabe } from '../composables/useEingabe.js';
import { IfcEngine } from '../services/IfcEngine.js';
import { cdeAchsenAus, eigeneNetzauskunft, verdeckteAus } from '../services/CdeAchsen.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { pruefeKommando, KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
import { setzeRegelwerk } from '../services/regeln/Regelwerk.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});
afterEach(() => setzeRegelwerk([]));

const kommando = (id, werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id, werkzeug, ziel: [], wer: 'fabio', wann: '2026-09-19T12:00:00Z', ...rest });
const schacht = (gid, ost, sohle) => kommando(`ko-${gid}`, 'schacht-zeichnen', { neu: [gid], werte: { name: gid, kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1000 },
    eingaben: { zug: [{ ost, nord: 0, hoehe: sohle }, { ost, nord: -0.001, hoehe: sohle + 2.5 }] } });
const haltung = (gid, zug, werte = {}) => kommando(`ko-${gid}`, 'rohr-zeichnen', { neu: [gid], werte: { name: gid, kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300, ...werte }, eingaben: { zug } });
const regeln = (bef) => bef.map(x => x.regel).sort();

async function ausfuehren(...kommandos) {
    const b = useBearbeitung();
    for (const k of kommandos) {
        const erg = await b.fuehreAus(k);
        expect(erg.grund, k.id).toBe(null);
    }
    const ae = useAenderungen();
    return { b, ae, plan: (gid) => ae.wirksamerStand('erzeugt').get(gid) };
}
/** C2 mit Knotenverweisen: A (Sohle 100), B (99,85), H nennt beide. */
const mitVerweis = () => ausfuehren(schacht('cde-A', 0, 100), schacht('cde-B', 30, 99.85),
    haltung('cde-H', [{ knoten: 'cde-A' }, { knoten: 'cde-B' }]));
/** Dasselbe nur mit Koordinaten — keine Erklärung, nur Koinzidenz. */
const mitKoordinaten = () => ausfuehren(schacht('cde-A', 0, 100), schacht('cde-B', 30, 99.85),
    haltung('cde-H', [{ ost: 0, nord: 0, hoehe: 100 }, { ost: 30, nord: 0, hoehe: 99.85 }]));
/**
 * Ein Schacht, der NEBEN seiner Haltung steht — so hinterliess „Verschieben"
 * einen eigenen Schacht bis 2026-09-19 (die Haltung blieb stehen), und so kann
 * ein Journal von damals ihn noch enthalten. Seitdem folgt die Haltung (8).
 */
async function schachtDaneben(ae, gid, ost) {
    const plan = ae.wirksamerStand('erzeugt').get(gid);
    const dx = ost - plan.parameter.punkte[0][0];
    await ae.eintragen({ art: 'erzeugt', globalId: gid, modell: 'cde',
        nachher: { ...plan, parameter: { ...plan.parameter, punkte: plan.parameter.punkte.map(p => [p[0] + dx, p[1], p[2]]) } } });
}

describe('1 — die Haltung nennt ihre Schächte', () => {
    it('Lage und Sohle vom Knoten, der Anschluss im Bauplan, das Netz verbindet — ohne Befund', async () => {
        const { b, ae, plan } = await mitVerweis();
        expect(plan('cde-H').parameter.anschluss).toEqual({ anfang: 'cde-A', ende: 'cde-B' });
        expect(rezeptNach('rohr').sohlen.lies(plan('cde-H').parameter)).toEqual([100, 99.85]);
        expect(plan('cde-H').parameter.punkte.map(p => [p[0], p[2]])).toEqual([[0, 0], [30, 0]]);
        const { netz } = eigeneNetzauskunft(ae.wirksamerStand('erzeugt'));
        expect(netz.kanten.get('cde:cde-H')).toMatchObject({ von: 'cde:cde-A', nach: 'cde:cde-B' });
        expect(b.pruefeEigenes()).toEqual([]);
        // Der Beleg nennt die Schächte, nicht ihre Koordinaten.
        expect(ae.eintraege.at(-1).kommando.eingaben.zug).toEqual([{ knoten: 'cde-A' }, { knoten: 'cde-B' }]);
    });
});

describe('2 — Erklärung gegen Lage', () => {
    it('Schacht B 5 cm neben der Haltung: „Anschluss abweichend" — nicht lose, nicht unverbunden', async () => {
        const { b, ae } = await mitVerweis();
        await schachtDaneben(ae, 'cde-B', 30.05);
        const befunde = b.befundeVon('cde-H');
        expect(regeln(befunde)).toEqual(['anschluss_abweichend']);
        expect(befunde[0].wert).toBe('0.05 m');
        expect(befunde[0].grenze).toBe('höchstens 1 mm');
        expect(b.befundeVon('cde-B')).toEqual([]);                     // B hat seinen Anschluss
    });

    it('ohne Erklärung, nur Koordinaten: dasselbe ergibt ein loses Ende und einen Schacht ohne Anschluss (wie bisher)', async () => {
        const { b, ae } = await mitKoordinaten();
        await schachtDaneben(ae, 'cde-B', 30.05);
        expect(regeln(b.befundeVon('cde-H'))).toEqual(['loses_ende']);
        expect(regeln(b.befundeVon('cde-B'))).toEqual(['schacht_ohne_anschluss']);
    });

    it('Schacht B gelöscht: „Anschluss verwaist" — der Befund nennt, was fehlt', async () => {
        const { b } = await mitVerweis();
        await b.fuehreAus(kommando('ko-l', 'loeschen', { ziel: ['cde-B'], werte: {} }));
        const befunde = b.befundeVon('cde-H');
        expect(regeln(befunde)).toContain('anschluss_verwaist');
        expect(befunde.find(x => x.regel === 'anschluss_verwaist').wert).toBe('cde-B');
    });
});

describe('3 — die Toleranz steht im Regelwerk', () => {
    it('5 cm daneben, ohne Erklärung: mit netzToleranzM = 0,1 m verbunden', async () => {
        const { b, ae } = await mitKoordinaten();
        await schachtDaneben(ae, 'cde-B', 30.05);
        setzeRegelwerk([{ id: 'netzToleranzM', wert: 0.1, herkunft: 'buero' }]);
        expect(b.befundeVon('cde-H')).toEqual([]);
        expect(b.befundeVon('cde-B')).toEqual([]);
    });
});

describe('4 — Werkzeuge und der Anschluss', () => {
    it('Kopieren, Reihe, Spiegeln nehmen ihn NICHT mit', async () => {
        const { b, ae, plan } = await mitVerweis();
        await b.fuehreAus(kommando('ko-k', 'kopieren', { ziel: ['cde-H'], neu: ['cde-K'], werte: { ost: 0, nord: 5, hoehe: 0 } }));
        await b.fuehreAus(kommando('ko-r', 'reihe', { ziel: ['cde-H'], neu: ['cde-R1'], werte: { anzahl: 1, ost: 0, nord: 10 } }));
        await b.fuehreAus(kommando('ko-s', 'spiegeln', { ziel: ['cde-H'], neu: ['cde-S'], werte: { achse: 90, kopie: 'ja' } }));
        for (const gid of ['cde-K', 'cde-R1', 'cde-S']) expect(plan(gid).parameter.anschluss, gid).toBeUndefined();
        expect(plan('cde-H').parameter.anschluss).toEqual({ anfang: 'cde-A', ende: 'cde-B' });
        expect(ae.eintraege.length).toBeGreaterThan(0);
    });

    it('Haltung teilen: jedes Stück behält, was an SEINEM Ende gilt', async () => {
        const { b, ae } = await mitVerweis();
        const erg = await b.fuehreAus(kommando('ko-t', 'haltung-teilen', { ziel: ['cde-H'], neu: ['cde-H1', 'cde-H2'],
            eingaben: { punkt: { station: 15 } } }));
        expect(erg.grund).toBe(null);
        const plan = (gid) => ae.wirksamerStand('erzeugt').get(gid);
        expect(plan('cde-H1').parameter.anschluss).toEqual({ anfang: 'cde-A' });
        expect(plan('cde-H2').parameter.anschluss).toEqual({ ende: 'cde-B' });
    });

    it('Schacht einfügen: die Stücke nennen den neuen Schacht — und das Netz ist ohne Befund', async () => {
        const { b, ae } = await mitVerweis();
        const erg = await b.fuehreAus(kommando('ko-e', 'schacht-einfuegen', { ziel: ['cde-H'], neu: ['cde-S', 'cde-H1', 'cde-H2'],
            eingaben: { punkt: { station: 15 } }, werte: { deckel: 102.5, durchmesser: 1000 } }));
        expect(erg.grund).toBe(null);
        const plan = (gid) => ae.wirksamerStand('erzeugt').get(gid);
        expect(plan('cde-H1').parameter.anschluss).toEqual({ anfang: 'cde-A', ende: 'cde-S' });
        expect(plan('cde-H2').parameter.anschluss).toEqual({ anfang: 'cde-S', ende: 'cde-B' });
        expect(b.pruefeEigenes()).toEqual([]);
    });

    it('„An Schacht anschliessen" an einer eigenen Haltung: das Ende rückt auf den Knoten, der Bauplan nennt ihn, die Sohle bleibt', async () => {
        const { b, plan } = await ausfuehren(schacht('cde-A', 0, 100), schacht('cde-B', 30, 99.85),
            haltung('cde-H', [{ ost: 0, nord: 0, hoehe: 100 }, { ost: 28, nord: 1, hoehe: 99.86 }]));
        expect(regeln(b.befundeVon('cde-H'))).toEqual(['loses_ende']);
        const erg = await b.fuehreAus(kommando('ko-a', 'an-schacht-anschliessen', { ziel: ['cde-H'],
            eingaben: { zug: [{ ost: 29.5, nord: 0.2 }] } }));
        expect(erg.grund).toBe(null);
        expect(plan('cde-H').parameter.anschluss).toEqual({ ende: 'cde-B' });
        const p = plan('cde-H').parameter.punkte;
        expect(p[1][0]).toBe(30);
        expect(Math.abs(p[1][2])).toBe(0);
        expect(rezeptNach('rohr').sohlen.lies(plan('cde-H').parameter)[1]).toBeCloseTo(99.86, 9);
        expect(b.befundeVon('cde-H')).toEqual([]);
    });
});

describe('5 — das Schema', () => {
    it('ein Knoten nur am Rand; ein fehlender Knoten ohne Ort ist E8', async () => {
        const mitte = haltung('cde-X', [{ ost: 0, nord: 0 }, { knoten: 'cde-A' }, { ost: 30, nord: 0 }]);
        expect(pruefeKommando(mitte).join()).toMatch(/nur am Anfang oder Ende/);
        expect(pruefeKommando(haltung('cde-X', [{ knoten: 'cde-A' }, { knoten: 'cde-B' }]))).toEqual([]);
        const erg = await useBearbeitung().fuehreAus(haltung('cde-X', [{ knoten: 'cde-GIBTSNICHT' }, { ost: 30, nord: 0, hoehe: 100 }]));
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toMatch(/Den Knoten cde-GIBTSNICHT gibt es nicht \(mehr\)/);
    });

    it('eine ausdrückliche Höhe am Knotenpunkt gilt — auch gegen die getippte', async () => {
        const { plan } = await ausfuehren(schacht('cde-A', 0, 100), schacht('cde-B', 30, 99.85),
            haltung('cde-H', [{ knoten: 'cde-A', hoehe: 99.95 }, { knoten: 'cde-B' }], { hoehe: 50 }));
        expect(rezeptNach('rohr').sohlen.lies(plan('cde-H').parameter)).toEqual([99.95, 99.85]);
    });
});

describe('6 — die Oberfläche: der Fang nennt den Knoten', () => {
    it('gefangen auf eigene Schächte: Anschluss im Bauplan, ihre Sohlen gelten gegen die getippte Höhe', async () => {
        const { b, ae, plan } = await ausfuehren(schacht('cde-A', 0, 100), schacht('cde-B', 30, 99.85));
        b.modusSetzen(true);
        const m = useEingabe({ bearbeitung: b, cde: { bearbeiter: 'Fabio' }, getModellSha: () => null, getHoehenversatz: () => 0,
                               getKnoten: () => eigeneNetzauskunft(ae.wirksamerStand('erzeugt')).knoten });
        expect(b.starte('rohr-zeichnen')).toBe(true);
        b.setzeWert('hoehe', 50);                                         // getippt — gilt nicht für die Knotenpunkte
        m.aufTreffer({ point: { x: 0.4, y: 7, z: 0.3 } });
        m.aufTreffer({ point: { x: 29.6, y: 7, z: -0.2 } });
        await m.enter();
        const neu = [...ae.wirksamerStand('erzeugt').entries()].find(([, p]) => p.rezept === 'rohr');
        expect(neu[1].parameter.anschluss).toEqual({ anfang: 'cde-A', ende: 'cde-B' });
        expect(rezeptNach('rohr').sohlen.lies(neu[1].parameter)).toEqual([100, 99.85]);
        expect(plan(neu[0]).parameter.punkte.map(p => [p[0], p[2]])).toEqual([[0, 0], [30, 0]]);
        // Der Beleg nennt die Knoten.
        expect(ae.eintraege.at(-1).kommando.eingaben.zug.map(q => q.knoten)).toEqual(['cde-A', 'cde-B']);
    });
});

describe('7 — über die Engine: ein genannter GELIEFERTER Schacht', () => {
    it('die Erklärung verbindet auch 3 cm daneben — mit Befund; ohne Erklärung wäre es lose', async () => {
        // Ein gelieferter Schacht G-S bei x = 30; die eigene Haltung nennt ihn als Ende.
        const { ae } = await ausfuehren(schacht('cde-A', 0, 100),
            haltung('cde-H', [{ knoten: 'cde-A' }, { knoten: 'G-S', ost: 29.97, nord: 0, hoehe: 99.85 }]));
        expect(ae.wirksamerStand('erzeugt').get('cde-H').parameter.anschluss).toEqual({ anfang: 'cde-A', ende: 'G-S' });
        const dies = Object.assign(Object.create(IfcEngine.prototype), {
            _achsen: new Map([['m1', new Map()]]),
            _knoten: new Map([['m1', new Map([[10, { punkt: { x: 30, y: 99.8, z: 0 }, globalId: 'G-S', name: 'G-S' }]])]]),
            _merkmale: new Map(), quelleVon: () => null, merkmaleAlle: () => new Map(),
        });
        IfcEngine.prototype.setzeJournalStand.call(dies, {
            ...cdeAchsenAus(ae.wirksamerStand('erzeugt')), verdeckt: verdeckteAus(ae.wirksamerStand('geloescht')),
        });
        const netz = dies.netzVon('m1');
        expect(netz.kanten.get('cde:cde-H')).toMatchObject({ von: 'cde:cde-A', nach: 10 });
        const zeile = dies.pruefeAlles().find(z => z.globalId === 'cde-H');
        expect(zeile.befunde.map(x => x.regel)).toEqual(['anschluss_abweichend']);
    });
});

describe('8 — ein eigener Schacht wandert, seine eigenen Haltungen folgen (2026-09-19)', () => {
    // Bis hierher blieb die Haltung stehen: „Verschieben" kehrte im Zweig für
    // eigene Bauteile zurück, bevor es die Anschlüsse nachführte — der Regler
    // „mitführen" stand da und wirkte nicht (Nebenbefund aus K3). Und „wirklich
    // mitführen" baute auch eine eigene Haltung als Katalog-Rohr neu (N1).
    for (const werkzeug of ['verschieben', 'schacht-verschieben']) {
        it(`${werkzeug}: dieselbe Kennung, derselbe Bauplan, nur das Ende wandert — kein Befund`, async () => {
            const { b, ae, plan } = await mitVerweis();
            const vorher = plan('cde-H');
            const werte = werkzeug === 'verschieben' ? { ost: 30.05, nord: 0, hoehe: 101.25, mitfuehren: 'forderung' }
                                                     : { ost: 30.05, nord: 0, mitfuehren: 'forderung' };
            const erg = await b.fuehreAus(kommando('ko-v', werkzeug, { ziel: ['cde-B'], werte }));
            expect(erg.grund).toBe(null);
            expect(erg.eintraege.map(e => [e.art, e.globalId])).toEqual([['erzeugt', 'cde-B'], ['erzeugt', 'cde-H']]);
            const nachher = plan('cde-H');
            expect(nachher.rezept).toBe(vorher.rezept);
            expect(nachher.parameter.dn).toBe(vorher.parameter.dn);
            expect(nachher.parameter.anschluss).toEqual({ anfang: 'cde-A', ende: 'cde-B' });
            expect(nachher.parameter.punkte[0]).toEqual(vorher.parameter.punkte[0]);          // das andere Ende bleibt
            expect(nachher.parameter.punkte[1][0]).toBeCloseTo(30.05, 9);                     // dieses wandert mit
            expect(nachher.parameter.punkte[1][1]).toBe(vorher.parameter.punkte[1][1]);       // in der Ebene
            expect(plan('cde-B').parameter.punkte[0][0]).toBeCloseTo(30.05, 9);               // der Schacht als Bauplan, keine „lage"
            expect(b.befundeVon('cde-H')).toEqual([]);                                        // vorher: anschluss_abweichend 0.05 m
            expect(ae.wirksamerStand('lage').has('cde-B')).toBe(false);
        });
    }

    it('der Regler erscheint nur, wenn eine GELIEFERTE Haltung am Schacht hängt', async () => {
        const { ae } = await mitVerweis();
        const { subjektAusStand } = await import('../services/kommando/Subjekt.js');
        const { felderFuer, nachId } = await import('../services/Bearbeitungen.js');
        const s = subjektAusStand('cde-B', { wirksamerStand: ae.wirksamerStand });
        expect(s.anschluesse.map(k => k.globalId)).toEqual(['cde-H']);
        expect(felderFuer(nachId('verschieben'), null, s).map(f => f.name)).not.toContain('mitfuehren');
        const mitGeliefert = { ...s, anschluesse: [...s.anschluesse, { globalId: '2Gelief0Rohr0000000001', ende: 'anfang' }] };
        expect(felderFuer(nachId('verschieben'), null, mitGeliefert).map(f => f.name)).toContain('mitfuehren');
    });
});

describe('9 — Schacht entfernen: die neue Haltung behält Knicke und Anschlüsse (2026-09-19)', () => {
    // Bis hierher bekam die zusammengelegte Haltung drei Punkte (fernes
    // Zulauf-Ende, Schacht, fernes Ablauf-Ende) und KEINE Erklärung — die
    // fernen Schächte hingen nur noch am Zufall der Koordinaten.
    it('A — H1 (mit Knick) — B — H2 — C: B entfernen ergibt A → Knick → B → C, erklärt an A und C', async () => {
        const { b, ae, plan } = await ausfuehren(schacht('cde-A', 0, 100), schacht('cde-B', 30, 99.85), schacht('cde-C', 60, 99.7),
            haltung('cde-H1', [{ knoten: 'cde-A' }, { ost: 15, nord: 5, hoehe: 99.93 }, { knoten: 'cde-B' }]),
            haltung('cde-H2', [{ knoten: 'cde-B' }, { knoten: 'cde-C' }]));
        const erg = await b.fuehreAus(kommando('ko-e', 'schacht-entfernen', { ziel: ['cde-B'], neu: ['cde-H'], werte: {} }));
        expect(erg.grund).toBe(null);
        const h = plan('cde-H');
        expect(h.parameter.anschluss).toEqual({ anfang: 'cde-A', ende: 'cde-C' });          // vorher: keine
        expect(h.parameter.punkte.map(p => [p[0], p[2]])).toEqual([[0, 0], [15, -5], [30, 0], [60, 0]]);   // vorher: ohne (15|5)
        expect(rezeptNach('rohr').sohlen.lies(h.parameter).map(y => Math.round(y * 1000) / 1000)).toEqual([100, 99.93, 99.85, 99.7]);   // jede Sohle bleibt
        expect(b.pruefeEigenes().filter(z => z.globalId === 'cde-H' || z.globalId === 'cde-A' || z.globalId === 'cde-C')).toEqual([]);
        expect(ae.eintraege.filter(e => e.vorgang === 'ko-e').map(e => [e.art, e.globalId])).toEqual(
            [['geloescht', 'cde-B'], ['geloescht', 'cde-H1'], ['geloescht', 'cde-H2'], ['erzeugt', 'cde-H']]);
    });
});

