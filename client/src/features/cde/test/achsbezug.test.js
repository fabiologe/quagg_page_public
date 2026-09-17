/**
 * Wo liegt die Achse eines Rohrs? (Teil XXI, P2a / E4)
 *
 * DER BEFUND, den dieses Modul auflöst: `kanalgraben.leite` las die Achshöhe
 * als ROHRMITTE (`sohle = y − DN/2 − Bettung`), `Laengsschnitt` dieselbe Höhe
 * als SOHLE. Bei isyifc-Daten grub der Graben deshalb DN/2 zu tief und meldete
 * die Überdeckung um DN/2 zu klein. Hier steht die Aussage EINMAL.
 */
import { describe, expect, it } from 'vitest';
import {
    ACHSBEZUEGE, ACHSBEZUG_VORGABE, achsbezugVon, alsSohle, bezugOder, bezugTitel, bezugWaehlen,
    halbmesser, rohrhoehen, rohrmitte, rohrscheitel, rohrsohle,
} from '../services/Achsbezug.js';

describe('achsbezugVon — die Herkunft verspricht den Bezug', () => {
    it('eine Achs-Repräsentation ist auf Sohlniveau geschrieben', () => {
        expect(achsbezugVon('axisRep')).toBe('sohle');
    });

    it('was aus der Extrusion, dem Netz oder einem Bauplan kommt, liegt in der Rohrmitte', () => {
        // Ein Sweep legt sein Profil UM die Achse — das gilt für die
        // zurückgerechnete Extrusion, das Skelett und ein eigenes Rohr.
        for (const h of ['extrusion', 'mesh', 'bauplan']) expect(achsbezugVon(h)).toBe('mitte');
    });

    it('ohne Angabe gilt die Rohrmitte — nicht „unbekannt", das hilft niemandem', () => {
        expect(achsbezugVon(null)).toBe(ACHSBEZUG_VORGABE);
        expect(achsbezugVon(undefined)).toBe('mitte');
        expect(achsbezugVon('etwas anderes')).toBe('mitte');
    });
});

describe('bezugWaehlen — das Formular schlägt die Quelle', () => {
    it('„aus der Quelle" nimmt, was die Achse sagt', () => {
        expect(bezugWaehlen('quelle', 'sohle')).toBe('sohle');
        expect(bezugWaehlen('quelle', 'mitte')).toBe('mitte');
    });

    it('eine ausdrückliche Wahl gewinnt — auch gegen die Quelle', () => {
        expect(bezugWaehlen('mitte', 'sohle')).toBe('mitte');
        expect(bezugWaehlen('sohle', 'mitte')).toBe('sohle');
    });

    it('fehlt beides, gilt die Vorgabe; Unsinn wird nicht durchgereicht', () => {
        expect(bezugWaehlen(null, null)).toBe('mitte');
        expect(bezugWaehlen('kniehoch', null)).toBe('mitte');
        expect(bezugOder('kniehoch', 'sohle')).toBe('sohle');
    });
});

describe('Die drei Höhen eines Rohrs', () => {
    const DN = 400;                                   // r = 0,20 m

    it('halbmesser rechnet Millimeter in Meter — und Unsinn auf null', () => {
        expect(halbmesser(400)).toBeCloseTo(0.2, 12);
        for (const v of [0, -300, null, undefined, 'DN300', NaN]) expect(halbmesser(v)).toBe(0);
    });

    it('bei Bezug „Sohle" IST die Achshöhe die Sohle', () => {
        const r = { achsbezug: 'sohle', dn: DN };
        expect(rohrsohle(100, r)).toBeCloseTo(100, 12);
        expect(rohrmitte(100, r)).toBeCloseTo(100.2, 12);
        expect(rohrscheitel(100, r)).toBeCloseTo(100.4, 12);
    });

    it('bei Bezug „Rohrmitte" liegt die Sohle um r tiefer', () => {
        const r = { achsbezug: 'mitte', dn: DN };
        expect(rohrsohle(100, r)).toBeCloseTo(99.8, 12);
        expect(rohrmitte(100, r)).toBeCloseTo(100, 12);
        expect(rohrscheitel(100, r)).toBeCloseTo(100.2, 12);
    });

    it('DER UNTERSCHIED IST DN — genau das, was Graben und Längsschnitt trennte', () => {
        const a = rohrsohle(100, { achsbezug: 'sohle', dn: DN });
        const b = rohrsohle(100, { achsbezug: 'mitte', dn: DN });
        expect(a - b).toBeCloseTo(0.2, 12);
        // Und der Scheitel liegt IMMER 2r über der Sohle — gleich, welcher Bezug.
        for (const bezug of ['sohle', 'mitte']) {
            const h = rohrhoehen(100, { achsbezug: bezug, dn: DN });
            expect(h.scheitel - h.sohle).toBeCloseTo(0.4, 12);
            expect(h.mitte - h.sohle).toBeCloseTo(0.2, 12);
        }
    });

    it('ohne DN fallen alle drei zusammen — ein Rohr ohne Durchmesser hat keine Dicke', () => {
        const r = { achsbezug: 'mitte', dn: null };
        expect(rohrsohle(100, r)).toBe(100);
        expect(rohrscheitel(100, r)).toBe(100);
    });

    it('eine Höhe, die keine ist, bleibt keine — NaN wird nicht zu 0', () => {
        for (const v of [null, undefined, NaN, 'tief']) expect(rohrsohle(v, { dn: 400 })).toBeNaN();
    });

    it('alsSohle legt eine ganze Polylinie auf die Sohle und lässt x/z liegen', () => {
        const pl = [{ x: 1, y: 100, z: 2 }, { x: 4, y: 99, z: 2 }];
        const aus = alsSohle(pl, { achsbezug: 'mitte', dn: 400 });
        expect(aus.map(p => [p.x, p.z])).toEqual([[1, 2], [4, 2]]);
        expect(aus.map(p => p.y)).toEqual([99.8, 98.8]);
    });
});

describe('bezugTitel — was die Oberfläche sagt', () => {
    it('nennt den Bezug, auf Wunsch mit der Herkunft', () => {
        expect(bezugTitel('sohle')).toBe('Achse = Sohle');
        expect(bezugTitel('sohle', { quelle: 'axisRep', ausQuelle: true })).toBe('Achse = Sohle (Achs-Repräsentation)');
        expect(bezugTitel('mitte', { quelle: 'extrusion', ausQuelle: true })).toBe('Achse = Rohrmitte (Extrusion)');
        // Ohne bekannte Herkunft bleibt es bei der Aussage selbst.
        expect(bezugTitel('mitte', { quelle: null, ausQuelle: true })).toBe('Achse = Rohrmitte');
    });

    it('die Bezüge sind DATEN, keine verstreuten Zeichenketten', () => {
        expect(Object.keys(ACHSBEZUEGE).sort()).toEqual(['mitte', 'sohle']);
        expect(ACHSBEZUEGE.sohle.titel).toBe('Sohle');
    });
});
