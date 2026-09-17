/**
 * Geländekanten (2026-09-10, Fabio): ein Geländemodell zeigt seine Dreiecke —
 * und eine Auswahl färbt nur diese Kanten, statt das Gelände grün zu füllen.
 *
 * Teil XX (2026-09-11, im Browser gemessen): auf der dichten Anzeige (2-m-
 * Raster, 99 414 Dreiecke) verschmolzen die Akzent-Kanten aus der Draufsicht
 * zu einer vollen Fläche. Jetzt blendet der Shader jede Kante nach ihrer
 * Länge in Bildpunkten aus, und eine Auswahl zeigt deckend nur den Umriss.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
    AUSWAHL_FARBE, GelaendeKanten, KANTEN_FARBE, KANTEN_FRAGMENT, KANTEN_VERTEX, LIFT_MAX, PX_AUS, PX_VOLL,
    deckungNachPixel, kantenAusNetz, laengenAus, liftFuer, umrissAusNetz,
} from '../services/GelaendeKanten.js';

const zweiDreiecke = { positions: Float64Array.from([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1]), triCount: 2 };
const welt = () => ({ scene: { three: new THREE.Scene() } });
const wurzelVon = (w) => w.scene.three.children.find(o => o.name === 'cde-gelaende-kanten');
const kantenVon = (w, k) => wurzelVon(w).children.find(l => l.userData.schluessel === k);
const umrissVon = (w, k) => wurzelVon(w).children.find(l => l.userData.umrissVon === k);
const farbe = (w, k) => `#${kantenVon(w, k).material.uniforms.farbe.value.getHexString()}`;

/** Ein Würfel aus 12 Dreiecken — geschlossen, also ohne Rand; sein Umriss sind die 12 Würfelkanten. */
function wuerfel() {
    const p = [];
    const q = (a, b, c, d) => { p.push(...a, ...b, ...c, ...a, ...c, ...d); };
    const v = (x, y, z) => [x, y, z];
    q(v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1));   // unten
    q(v(0, 1, 0), v(0, 1, 1), v(1, 1, 1), v(1, 1, 0));   // oben
    q(v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0));   // Nord
    q(v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1));   // Süd
    q(v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0));   // West
    q(v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1));   // Ost
    return { positions: Float64Array.from(p), triCount: 12 };
}

describe('Die Kanten eines Dreiecksnetzes', () => {
    it('je Dreieck drei Strecken, um den Lift angehoben', () => {
        const k = kantenAusNetz(zweiDreiecke, { lift: 0.05 });
        expect(k.length).toBe(2 * 3 * 6);
        expect(k[1]).toBeCloseTo(0.05);                     // y des ersten Punkts
        expect([k[0], k[2], k[3], k[5]]).toEqual([0, 0, 1, 0]);   // x/z bleiben
    });

    it('der Lift wächst mit der Ausdehnung — mindestens 2 cm, höchstens 3', () => {
        expect(liftFuer(zweiDreiecke)).toBeCloseTo(0.02);
        const mittel = { positions: Float64Array.from([0, 0, 0, 180, 0, 0, 180, 0, 120]), triCount: 1 };
        expect(liftFuer(mittel)).toBeCloseTo(1e-4 * Math.hypot(180, 120), 6);
        // DER DECKEL (Teil XXI): ein 700-m-Gelände bekam 7 cm, und das Netz
        // schwebte sichtbar über seiner eigenen Fläche.
        const gross = { positions: Float64Array.from([0, 0, 0, 600, 0, 0, 600, 0, 400]), triCount: 1 };
        expect(1e-4 * Math.hypot(600, 400)).toBeGreaterThan(LIFT_MAX);   // die alte Regel wollte mehr
        expect(liftFuer(gross)).toBe(LIFT_MAX);
        expect(LIFT_MAX).toBe(0.03);
    });

    it('je Punkt die Länge seiner Strecke — daraus rechnet der Shader Bildpunkte', () => {
        const l = laengenAus(kantenAusNetz(zweiDreiecke));
        expect(l.length).toBe(2 * 3 * 2);
        expect([l[0], l[1]]).toEqual([1, 1]);                // (0,0,0)–(1,0,0)
        expect(l[2]).toBeCloseTo(1, 6);                      // (1,0,0)–(1,0,1)
        expect(l[4]).toBeCloseTo(Math.SQRT2, 6);             // Diagonale zurück
    });
});

describe('Die Dichte-Regel (Teil XX): eine Kante verschwindet, wenn sie am Bildschirm zu kurz wird', () => {
    it('unter PX_AUS nichts, ab PX_VOLL ganz, dazwischen stetig steigend', () => {
        expect(deckungNachPixel(0)).toBe(0);
        expect(deckungNachPixel(PX_AUS)).toBe(0);
        expect(deckungNachPixel(PX_VOLL)).toBe(1);
        expect(deckungNachPixel(100)).toBe(1);
        const mitte = [4, 5, 6, 7, 8, 9].map(deckungNachPixel);
        expect(mitte.every((d, i) => d > 0 && d < 1 && (i === 0 || d > mitte[i - 1]))).toBe(true);
    });

    it('die Draufsicht aus dem Browser: 2-m-Zellen bei ~1,2 px/m sind UNSICHTBAR, ein 20-m-TIN bleibt', () => {
        expect(deckungNachPixel(2 * 1.2)).toBe(0);
        expect(deckungNachPixel(20 * 1.2)).toBe(1);
    });

    it('der Shader rechnet mit DENSELBEN Zahlen — Uniforms statt Konstanten im Quelltext', () => {
        const w = welt();
        const g = new GelaendeKanten({ getWorld: () => w });
        g.setze(new Map([['m1|7', zweiDreiecke]]));
        const m = kantenVon(w, 'm1|7').material;
        expect(m.isShaderMaterial).toBe(true);
        expect(m.uniforms.pxAus.value).toBe(PX_AUS);
        expect(m.uniforms.pxVoll.value).toBe(PX_VOLL);
        expect(KANTEN_VERTEX).toMatch(/smoothstep\(pxAus, pxVoll, laenge \* ppm\)/);
        // gerastert statt durchscheinend — sonst wären doppelt gezeichnete Kanten dunkler
        expect(m.transparent).toBe(false);
        expect(KANTEN_FRAGMENT).toMatch(/discard/);
        // Schnittebenen, Tiefe und Farbraum wie jedes eingebaute Material
        expect(m.clipping).toBe(true);
        for (const chunk of ['clipping_planes_fragment', 'logdepthbuf_fragment', 'colorspace_fragment']) {
            expect(KANTEN_FRAGMENT).toContain(chunk);
        }
        expect(kantenVon(w, 'm1|7').geometry.getAttribute('laenge').count)
            .toBe(kantenVon(w, 'm1|7').geometry.getAttribute('position').count);
    });

    it('die Bildhöhe kommt je Bild aus dem Renderer', () => {
        const w = welt();
        const g = new GelaendeKanten({ getWorld: () => w });
        g.setze(new Map([['m1|7', zweiDreiecke]]));
        const obj = kantenVon(w, 'm1|7');
        obj.onBeforeRender({ getSize: (v) => v.set(1400, 900) }, null, null, obj.geometry, obj.material);
        expect(obj.material.uniforms.halbeHoehe.value).toBe(450);
    });
});

describe('Der Umriss (Teil XX): Rand- und Knickkanten', () => {
    it('ein offenes Viereck: die vier Randkanten, nicht die gemeinsame Diagonale', () => {
        expect(umrissAusNetz(zweiDreiecke).length / 6).toBe(4);
    });

    it('ein geschlossener Würfel hat keinen Rand — sein Umriss sind die 12 Knickkanten, keine Flächendiagonale', () => {
        expect(umrissAusNetz(wuerfel()).length / 6).toBe(12);
    });

    it('ein ebenes Raster 3 × 3 Zellen: nur der Umfang (12 Strecken)', () => {
        const p = [];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
            p.push(i, 0, j, i + 1, 0, j, i + 1, 0, j + 1, i, 0, j, i + 1, 0, j + 1, i, 0, j + 1);
        }
        expect(umrissAusNetz({ positions: Float64Array.from(p), triCount: 18 }).length / 6).toBe(12);
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

    it('die Auswahl färbt die Kanten des gewählten Geländes, zeigt deckend seinen Umriss — und überlebt den Neuaufbau', () => {
        const w = welt();
        const g = new GelaendeKanten({ getWorld: () => w });
        g.setze(new Map([['m1|7', zweiDreiecke], ['m2|3', zweiDreiecke]]));
        g.markiere(['m1|7']);
        expect(farbe(w, 'm1|7')).toBe(AUSWAHL_FARBE);
        expect(farbe(w, 'm2|3')).toBe(KANTEN_FARBE);
        const u = umrissVon(w, 'm1|7');
        expect(u.material.isLineBasicMaterial).toBe(true);                     // deckend, nicht nach Dichte
        expect(`#${u.material.color.getHexString()}`).toBe(AUSWAHL_FARBE);
        expect(u.geometry.getAttribute('position').count).toBe(8);             // vier Randkanten
        expect(umrissVon(w, 'm2|3')).toBeUndefined();
        g.setze(new Map([['m1|7', zweiDreiecke], ['m2|3', zweiDreiecke]]));   // Journalwechsel: neu gebaut
        expect(farbe(w, 'm1|7')).toBe(AUSWAHL_FARBE);
        expect(umrissVon(w, 'm1|7')).toBeDefined();
        g.demarkiere(['m1|7', 'gibt|es-nicht']);
        expect(farbe(w, 'm1|7')).toBe(KANTEN_FARBE);
        expect(umrissVon(w, 'm1|7')).toBeUndefined();
    });

    it('folgt dem Hider — Kanten UND Umriss —, und dispose räumt die Szene', () => {
        const w = welt();
        const g = new GelaendeKanten({ getWorld: () => w });
        g.setze(new Map([['m1|7', zweiDreiecke]]));
        g.markiere(['m1|7']);
        g.sichtbarkeit(false, ['m1|7']);
        expect(kantenVon(w, 'm1|7').visible).toBe(false);
        expect(umrissVon(w, 'm1|7').visible).toBe(false);
        g.setze(new Map([['m1|7', zweiDreiecke]]));         // bleibt ausgeblendet
        expect(kantenVon(w, 'm1|7').visible).toBe(false);
        expect(umrissVon(w, 'm1|7').visible).toBe(false);
        g.alleSichtbar();
        expect(kantenVon(w, 'm1|7').visible).toBe(true);
        expect(umrissVon(w, 'm1|7').visible).toBe(true);
        g.dispose();
        expect(wurzelVon(w)).toBeUndefined();
    });
});
