/**
 * Der Achsbezug läuft von der QUELLE bis zum Rezept (Teil XXI, P2a/P2c).
 *
 * `Achsbezug.js` ist rein und getestet; hier wird der WEG geprüft — die vier
 * Stellen, an denen eine Achse oder ein Schachtknoten entsteht. Ein Modul, das
 * niemand füttert, rechnet richtig und wirkt nicht.
 */
import { describe, expect, it, vi } from 'vitest';
import { REZEPTE } from '../services/Bauteilrezepte.js';
import { IfcEngine } from '../services/IfcEngine.js';
import { achsbezugVon } from '../services/Achsbezug.js';

/** Eine Engine ohne Welt — nur die Karten, die diese zwei Leser anfassen. */
function engineMit({ achsen = new Map(), knoten = new Map() } = {}) {
    const e = Object.create(IfcEngine.prototype);
    Object.assign(e, { _achsen: achsen, _knoten: knoten, _cdeKnoten: new Map(),
                       autor: { huellenVon: vi.fn(async () => new Map()) } });
    return e;
}

describe('Eine GELIEFERTE Achse bringt ihren Bezug mit', () => {
    const achse = (quelle) => new Map([['m1', new Map([[1, {
        globalId: 'H1', dn: 400, quelle,
        polyline: [{ x: 0, y: 100, z: 0 }, { x: 30, y: 99.4, z: 0 }],
    }]])]]);

    it('eine Achs-Repräsentation meldet „Sohle", eine Extrusion „Rohrmitte"', () => {
        expect(engineMit({ achsen: achse('axisRep') })._achseAlsLinie('H1'))
            .toMatchObject({ dn: 400, achsbezug: 'sohle', quelle: 'axisRep' });
        expect(engineMit({ achsen: achse('extrusion') })._achseAlsLinie('H1'))
            .toMatchObject({ achsbezug: 'mitte', quelle: 'extrusion' });
    });

    it('die Punkte bleiben unangetastet — umgerechnet wird erst beim Leser', () => {
        const l = engineMit({ achsen: achse('axisRep') })._achseAlsLinie('H1');
        expect(l.punkte.map(p => p.y)).toEqual([100, 99.4]);
    });

    it('eine unbekannte Kennung bleibt null', () => {
        expect(engineMit({ achsen: achse('axisRep') })._achseAlsLinie('gibt-es-nicht')).toBeNull();
    });
});

describe('Ein EIGENES Rohr liegt in der Rohrmitte', () => {
    it('sein Sweep legt das Profil um die gezeichneten Punkte — und sagt es', () => {
        const l = REZEPTE.rohr.formAus({ punkte: [[0, 100, 0], [10, 99.8, 0]], dn: 300 }, 'linie');
        expect(l).toMatchObject({ dn: 300, achsbezug: 'mitte', quelle: 'bauplan' });
        expect(achsbezugVon(l.quelle)).toBe('mitte');
    });
});

describe('Ein EIGENER Schacht liefert einen Knoten — vorher gar keinen', () => {
    it('sein tiefster Punkt ist seine Sohle, und die steht als Unterkante da', () => {
        // Zwei Punkte: Sohle und Deckel — in beliebiger Reihenfolge gezeichnet.
        const k = REZEPTE.schacht.formAus({ punkte: [[5, 102, 7], [5, 98.5, 7]], dn: 1000, name: 'S9' }, 'knoten');
        expect(k).toEqual({ x: 5, y: 98.5, z: 7, unterkante: 98.5, name: 'S9' });
    });

    it('vor Teil XXI fiel ein eigener Schacht im Strang still aus — jetzt nicht mehr', () => {
        // Der Kanalgraben fragt `schaechte` in der Form `knoten`. Kam null
        // zurück, entstand einfach keine Baugrube: ohne Meldung, ohne Spur.
        expect(REZEPTE.schacht.formAus({ punkte: [[0, 10, 0], [0, 12, 0]] }, 'knoten')).not.toBeNull();
    });
});

describe('Ein GELIEFERTER Schacht: die Hülle kennt seine Sohle, die Platzierung nicht', () => {
    const knoten = new Map([['m1', new Map([[1, { globalId: 'S2', name: 'S2', punkt: { x: 5, y: 100, z: 7 } }]])]]);

    it('ohne erreichbare Hülle bleibt die Platzierung — gemeldet durch das FEHLEN der Unterkante', async () => {
        const e = engineMit({ knoten });
        const k = await e._knotenMitUnterkante('S2');
        expect(k).toMatchObject({ x: 5, y: 100, z: 7, name: 'S2' });
        expect(k.unterkante).toBeUndefined();
    });

    it('eine unbekannte Kennung bleibt null, und nichts wirft', async () => {
        expect(await engineMit({ knoten })._knotenMitUnterkante('S9')).toBeNull();
    });
});
