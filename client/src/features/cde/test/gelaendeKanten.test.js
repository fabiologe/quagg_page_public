/**
 * Geländekanten (2026-09-10, Fabio): ein Geländemodell zeigt seine Dreiecke —
 * und eine Auswahl färbt nur diese Kanten, statt das Gelände grün zu füllen.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AUSWAHL_FARBE, GelaendeKanten, KANTEN_FARBE, kantenAusNetz, liftFuer } from '../services/GelaendeKanten.js';

const zweiDreiecke = { positions: Float64Array.from([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1]), triCount: 2 };
const welt = () => ({ scene: { three: new THREE.Scene() } });
const wurzelVon = (w) => w.scene.three.children.find(o => o.name === 'cde-gelaende-kanten');
const farbe = (w, k) => `#${wurzelVon(w).children.find(l => l.userData.schluessel === k).material.color.getHexString()}`;

describe('Die Kanten eines Dreiecksnetzes', () => {
    it('je Dreieck drei Strecken, um den Lift angehoben', () => {
        const k = kantenAusNetz(zweiDreiecke, { lift: 0.05 });
        expect(k.length).toBe(2 * 3 * 6);
        expect(k[1]).toBeCloseTo(0.05);                     // y des ersten Punkts
        expect([k[0], k[2], k[3], k[5]]).toEqual([0, 0, 1, 0]);   // x/z bleiben
    });

    it('der Lift wächst mit der Ausdehnung — mindestens 2 cm', () => {
        expect(liftFuer(zweiDreiecke)).toBeCloseTo(0.02);
        const gross = { positions: Float64Array.from([0, 0, 0, 600, 0, 0, 600, 0, 400]), triCount: 1 };
        expect(liftFuer(gross)).toBeCloseTo(1e-4 * Math.hypot(600, 400), 6);
    });
});

describe('GelaendeKanten im Raum', () => {
    it('zeichnet genau die übergebenen Gelände mit Tiefentest; was fehlt, fällt', () => {
        const w = welt();
        const g = new GelaendeKanten({ getWorld: () => w });
        expect(g.setze(new Map([['m1|7', zweiDreiecke], ['m2|3', zweiDreiecke]]))).toBe(12);
        expect(wurzelVon(w).children).toHaveLength(2);
        expect(wurzelVon(w).children.every(l => l.isLineSegments && l.material.depthTest === true)).toBe(true);
        g.setze(new Map([['m1|7', zweiDreiecke]]));         // m2 entladen
        expect(wurzelVon(w).children.map(l => l.userData.schluessel)).toEqual(['m1|7']);
    });

    it('die Auswahl färbt nur die Kanten des gewählten Geländes — und überlebt den Neuaufbau', () => {
        const w = welt();
        const g = new GelaendeKanten({ getWorld: () => w });
        g.setze(new Map([['m1|7', zweiDreiecke], ['m2|3', zweiDreiecke]]));
        g.markiere(['m1|7']);
        expect(farbe(w, 'm1|7')).toBe(AUSWAHL_FARBE);
        expect(farbe(w, 'm2|3')).toBe(KANTEN_FARBE);
        g.setze(new Map([['m1|7', zweiDreiecke], ['m2|3', zweiDreiecke]]));   // Journalwechsel: neu gebaut
        expect(farbe(w, 'm1|7')).toBe(AUSWAHL_FARBE);
        g.demarkiere(['m1|7', 'gibt|es-nicht']);
        expect(farbe(w, 'm1|7')).toBe(KANTEN_FARBE);
    });

    it('folgt dem Hider, und dispose räumt die Szene', () => {
        const w = welt();
        const g = new GelaendeKanten({ getWorld: () => w });
        g.setze(new Map([['m1|7', zweiDreiecke]]));
        g.sichtbarkeit(false, ['m1|7']);
        expect(wurzelVon(w).children[0].visible).toBe(false);
        g.setze(new Map([['m1|7', zweiDreiecke]]));         // bleibt ausgeblendet
        expect(wurzelVon(w).children[0].visible).toBe(false);
        g.alleSichtbar();
        expect(wurzelVon(w).children[0].visible).toBe(true);
        g.dispose();
        expect(wurzelVon(w)).toBeUndefined();
    });
});
