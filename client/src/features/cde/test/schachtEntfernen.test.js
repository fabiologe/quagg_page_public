// @vitest-environment jsdom
/**
 * Schacht entfernen (Stufe 16) — die Umkehrung von „Schacht einfügen".
 *
 * Der Kern: die Trasse BEWEGT SICH NICHT. Der Ort des entfernten Schachts
 * bleibt als Knickpunkt in der zusammengelegten Haltung — zwei Geraden zu
 * einer zu begradigen wäre eine Lageänderung, die niemand bestellt hat.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen, standAus } from '../stores/useAenderungen.js';
import { nachId } from '../services/Bearbeitungen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

/** Durchgangs-Schacht bei (0,6,0): H1 läuft zu, H2 läuft ab. */
const SCHACHT = {
    modelId: 'm1', localId: 9, category: 'IFCDISTRIBUTIONCHAMBERELEMENT',
    globalId: 'S5', name: 'S5', hoehenversatz: 300,
    anker: { x: 0, y: 6, z: 0 }, bezugshoehe: 6, oberkante: 9,
    anschluesse: [
        { localId: 1, globalId: 'ZU', name: 'H1', kategorie: 'IFCPIPESEGMENT', ende: 'ende',
          anfang: { x: -50, y: 8, z: 0 }, ende_: { x: 0, y: 6, z: 0 }, laenge: 50, dn: 300 },
        { localId: 2, globalId: 'AB', name: 'H2', kategorie: 'IFCPIPESEGMENT', ende: 'anfang',
          anfang: { x: 0, y: 6, z: 0 }, ende_: { x: 50, y: 4, z: 5 }, laenge: 50, dn: 400 },
    ],
};

describe('Der Durchgangsfall', () => {
    it('drei mal ausblenden, einmal erzeugen — Trasse mit Knick am alten Schacht', () => {
        const s = nachId('schacht-entfernen').anwenden(SCHACHT, {});
        expect(s).toHaveLength(4);
        expect(s.slice(0, 3).map(e => [e.art, e.globalId])).toEqual([
            ['geloescht', 'S5'], ['geloescht', 'ZU'], ['geloescht', 'AB'],
        ]);
        const p = s[3].nachher.parameter.punkte;
        // Die SOHLEN bleiben (Teil XXIV, K4): Zulauf DN 300 und Ablauf DN 400
        // werden EINE Haltung DN 400. Die Achsen dieses Beispiels sagen ihren
        // Bezug nicht — sie gelten wie bisher als Rohrmitte. Die Zulaufsohle
        // (8 − 0,15) bleibt also, und die neue Mitte liegt 5 cm höher; bis K4
        // blieb die Mitte, und die Sohle sackte um 5 cm ab.
        expect(p.map(q => q.map(v => Math.round(v * 1e9) / 1e9))).toEqual([[-50, 8.05, 0], [0, 6.05, 0], [50, 4, 5]]);
        expect(s[3].nachher.parameter.achsbezug).toBe('mitte');
    });

    it('fliesst weiter in FLIESSRICHTUNG — Anfang ist der ferne Zulauf', () => {
        const s = nachId('schacht-entfernen').anwenden(SCHACHT, {});
        const p = s[3].nachher.parameter.punkte;
        expect(p[0][1]).toBeGreaterThan(p[2][1]);        // Sohle fällt
    });

    it('nimmt die größere Nennweite und erbt Typ und Namen vom Zulauf', () => {
        const s = nachId('schacht-entfernen').anwenden(SCHACHT, {});
        expect(s[3].nachher.parameter.dn).toBe(400);
        expect(s[3].nachher.kategorie).toBe('IFCPIPESEGMENT');
        expect(s[3].nachher.name).toBe('H1');
    });
});

describe('Was KEIN Durchgang ist, wird nicht zusammengelegt', () => {
    it('Endschacht (ein Anschluss), Kreuzung (drei), einsamer Schacht: nichts', () => {
        const b = nachId('schacht-entfernen');
        expect(b.anwenden({ ...SCHACHT, anschluesse: [SCHACHT.anschluesse[0]] }, {})).toBeNull();
        expect(b.anwenden({ ...SCHACHT, anschluesse: [] }, {})).toBeNull();
        expect(b.anwenden({ ...SCHACHT, anschluesse: [...SCHACHT.anschluesse,
            { ...SCHACHT.anschluesse[0], globalId: 'X' }] }, {})).toBeNull();
    });

    it('Tiefpunkt (zwei Zuläufe) wird abgelehnt — lieber nichts als Unsinn', () => {
        const zweiZu = SCHACHT.anschluesse.map(k => ({ ...k, ende: 'ende' }));
        expect(nachId('schacht-entfernen').anwenden({ ...SCHACHT, anschluesse: zweiZu }, {})).toBeNull();
    });
});

describe('Als Vorgang im Store', () => {
    const resolverKoerper = {
        forElements: () => ({
            async getForm(form) {
                if (form === 'solid') return { form, data: { closed: true, triCount: 12 }, perElement: [], warnings: [] };
                return { form, data: null, perElement: [], warnings: [] };
            },
        }),
    };

    it('vier Einträge unter EINEM Vorgang — „zurück" holt Schacht und Haltungen wieder', async () => {
        const b = useBearbeitung();
        await b.einordne({ ...SCHACHT }, resolverKoerper);
        expect(b.starte('schacht-entfernen')).toBe(true);
        const e = await b.ausfuehren({ wer: 'Fabio' });
        expect(e).toHaveLength(4);
        expect(new Set(e.map(x => x.vorgang)).size).toBe(1);

        const ae = useAenderungen();
        expect(standAus(ae.eintraege, 'geloescht').size).toBe(3);
        await ae.zurueck('Fabio');
        expect(standAus(ae.eintraege, 'geloescht').size).toBe(0);
        expect(standAus(ae.eintraege, 'erzeugt').size).toBe(0);
    });
});
