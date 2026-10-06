/**
 * QG_ISYBAU_Data an Haltung und Schacht: jede Höhe heisst, was sie ist, und ein
 * fehlender Wert bleibt weg statt 0 (Fehler bis 2026-10: Deckelhoehe = Sohle Ablauf).
 */
import { describe, it, expect } from 'vitest';
import { IsybauToIfc } from '../core/export/IfcWriter.js';

const props = (data, schacht) => {
    const w = new IsybauToIfc([], [], { x: 0, y: 0, z: 0 });
    w.lines = [];
    w.buildProperties({ ref: 1 }, data, schacht);
    const out = {};
    for (const l of w.lines) {
        const m = l.match(/IFCPROPERTYSINGLEVALUE\('([^']+)',\$,IFC\w+\(([^)]*)\)/);
        if (m) out[m[1]] = m[2].replace(/^'|'$/g, '');
    }
    return out;
};

describe('QG_ISYBAU_Data', () => {
    it('Haltung: Sohle Zulauf und Ablauf mit Namen, kein Deckel', () => {
        const p = props({ id: 'H1', attributes: { systemType: 'KS' }, profile: { width: 0.3 }, sohleZulauf: 101.25, sohleAblauf: 100.9 }, false);
        expect(Number(p.SohlhoeheZulauf)).toBeCloseTo(101.25, 6);
        expect(Number(p.SohlhoeheAblauf)).toBeCloseTo(100.9, 6);
        expect(p.Deckelhoehe).toBeUndefined();
        expect(p.Sohlenhoehe).toBeUndefined();
        expect(Number(p.Profilhoehe)).toBeCloseTo(0.3, 6);
    });

    it('fehlende Werte bleiben weg statt 0', () => {
        const p = props({ id: 'H2', attributes: {}, profile: {} }, false);
        expect(Object.keys(p)).toEqual(['Objektbezeichnung']);
    });

    it('Schacht: Sohle und Deckel bleiben, wie sie sind', () => {
        const p = props({ id: 'S1', attributes: { year: 1987, material: 'B' }, geometry: { bottomZ: 98.1, coverZ: 101.4 } }, true);
        expect(Number(p.Sohlenhoehe)).toBeCloseTo(98.1, 6);
        expect(Number(p.Deckelhoehe)).toBeCloseTo(101.4, 6);
        expect(p.Baujahr).toBe('1987');
        expect(p.Profilbreite).toBeUndefined();
    });
});
