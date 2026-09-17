/**
 * Der Umriss eines Erdkörpers auf dem Gelände (Teil XXI, E2).
 *
 * Fabios Entscheidung: das Gelände gewinnt — es ist deckend und trägt das
 * Bild, die Erdkörper liegen durchscheinend zwei Zentimeter darunter
 * (`ERDKOERPER_ABSENKUNG`). Von oben bliebe damit nur unberührtes Gelände zu
 * sehen. Diese Linie ist die Aussage „hier wurde etwas gemacht": der Umriss
 * des Körpers in seiner Katalogfarbe, knapp ÜBER der Anzeige.
 *
 * Geprüft an der echten Klasse mit einer three-Szene — das ist der ganze
 * Vertrag: eine Gruppe, eine Linie je Körper, Farbe aus dem Katalog, Höhe
 * über der Anzeige, und sie folgt dem Hider wie dem Auge am Modell.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ErdbauUmrisse, UMRISS_GRUPPE, UMRISS_HUB, UMRISS_LIFT } from '../services/ErdbauUmrisse.js';
import { BAUTEILFARBEN, ERDKOERPER_ABSENKUNG } from '../services/Bauteilfarben.js';
import { CDE_MODELL_ID } from '../services/IfcAutor.js';

/** Ein Quader von (0,0,0) bis (b,h,t) — geschlossen, also ohne Rand: sein Umriss sind die Knickkanten. */
function quader(b = 4, h = 2, t = 6, y0 = 0) {
    const p = [];
    const e = [[0, y0, 0], [b, y0, 0], [b, y0, t], [0, y0, t],
               [0, y0 + h, 0], [b, y0 + h, 0], [b, y0 + h, t], [0, y0 + h, t]];
    const f = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
    for (const [a, bb, c, d] of f) { p.push(...e[a], ...e[bb], ...e[c], ...e[a], ...e[c], ...e[d]); }
    return { positions: Float64Array.from(p), triCount: p.length / 9 };
}

function umrisse() {
    const scene = new THREE.Scene();
    return { u: new ErdbauUmrisse({ getWorld: () => ({ scene: { three: scene } }) }), scene };
}
const gruppeVon = (scene) => scene.children.find(o => o.name === UMRISS_GRUPPE);
const linieVon = (scene, k) => gruppeVon(scene)?.children.find(o => o.userData.schluessel === k);

const AUSHUB = `${CDE_MODELL_ID}|11`;
const AUFTRAG = `${CDE_MODELL_ID}|12`;
const koerperKarte = () => new Map([
    [AUSHUB,  { netz: quader(), farbe: BAUTEILFARBEN.IFCEARTHWORKSCUT.farbe }],
    [AUFTRAG, { netz: quader(3, 1, 3), farbe: BAUTEILFARBEN.IFCEARTHWORKSFILL.farbe }],
]);

describe('ErdbauUmrisse — eine Linie je Erdkörper, in seiner Farbe', () => {
    it('legt eine eigene Gruppe an und zeichnet je Körper eine Linie', () => {
        const { u, scene } = umrisse();
        const strecken = u.setze(koerperKarte());
        expect(gruppeVon(scene)).toBeTruthy();
        expect(gruppeVon(scene).children).toHaveLength(2);
        expect(strecken).toBeGreaterThan(0);
        expect(linieVon(scene, AUSHUB)).toBeInstanceOf(THREE.LineSegments);
    });

    it('die Farbe ist die des Katalogs — dieselbe, die auch sein Material trägt', () => {
        const { u, scene } = umrisse();
        u.setze(koerperKarte());
        expect(linieVon(scene, AUSHUB).material.color.getHex()).toBe(BAUTEILFARBEN.IFCEARTHWORKSCUT.farbe);
        expect(linieVon(scene, AUFTRAG).material.color.getHex()).toBe(BAUTEILFARBEN.IFCEARTHWORKSFILL.farbe);
        // Gleiche Farbe, EIN Material: zwei Aushübe teilen es sich.
        const zwei = new Map([[AUSHUB, { netz: quader(), farbe: BAUTEILFARBEN.IFCEARTHWORKSCUT.farbe }],
                              [`${CDE_MODELL_ID}|13`, { netz: quader(), farbe: BAUTEILFARBEN.IFCEARTHWORKSCUT.farbe }]]);
        u.setze(zwei);
        expect(linieVon(scene, AUSHUB).material).toBe(linieVon(scene, `${CDE_MODELL_ID}|13`).material);
    });

    it('sie liegt ÜBER der Geländeanzeige, nicht auf ihr — sonst sieht man sie nie', () => {
        const { u, scene } = umrisse();
        // Der Körper kommt aus dem Raum, dort liegt sein Deckel bei y = 2 − 0,02.
        u.setze(new Map([[AUSHUB, { netz: quader(4, 2, 6), farbe: BAUTEILFARBEN.IFCEARTHWORKSCUT.farbe }]]));
        const p = linieVon(scene, AUSHUB).geometry.getAttribute('position').array;
        let hoechstes = -Infinity;
        for (let i = 1; i < p.length; i += 3) hoechstes = Math.max(hoechstes, p[i]);
        expect(hoechstes).toBeCloseTo(2 + UMRISS_LIFT, 5);
        // Die Anzeige läge bei 2 (der Körper ist um ERDKOERPER_ABSENKUNG tiefer
        // gebaut, sein „2" ist also die Anzeige minus 2 cm).
        expect(UMRISS_LIFT - ERDKOERPER_ABSENKUNG).toBeCloseTo(UMRISS_HUB, 9);
        expect(UMRISS_HUB).toBeGreaterThan(0);
    });

    it('das Material prüft die Tiefe, schreibt sie aber nicht — es soll nichts verdecken', () => {
        const { u, scene } = umrisse();
        u.setze(koerperKarte());
        const m = linieVon(scene, AUSHUB).material;
        expect(m.depthTest).toBe(true);
        expect(m.depthWrite).toBe(false);
    });

    it('ein zweites `setze` ersetzt, was war — kein Nachwuchs in der Szene', () => {
        const { u, scene } = umrisse();
        u.setze(koerperKarte());
        u.setze(new Map([[AUSHUB, { netz: quader(), farbe: BAUTEILFARBEN.IFCEARTHWORKSCUT.farbe }]]));
        expect(gruppeVon(scene).children).toHaveLength(1);
        expect(linieVon(scene, AUFTRAG)).toBeUndefined();
    });

    it('ein Netz ohne Umriss (eine einzelne Fläche) macht keine leere Linie', () => {
        const { u, scene } = umrisse();
        // Ein einzelnes Dreieck hat nur Randkanten — `umrissAusNetz` liefert sie,
        // ein LEERES Netz dagegen nichts.
        u.setze(new Map([[AUSHUB, { netz: { positions: new Float64Array(0), triCount: 0 },
                                    farbe: BAUTEILFARBEN.IFCEARTHWORKSCUT.farbe }]]));
        expect(gruppeVon(scene).children).toHaveLength(0);
    });
});

describe('Dieselbe Gruppe trägt die BÖSCHUNGSKANTEN (Teil XX Stufe B)', () => {
    const KANTE = { punkte: [{ x: 0, y: 10, z: 0 }, { x: 5, y: 10, z: 0 }, { x: 5, y: 10, z: 5 }], geschlossen: false };
    const RING = { punkte: [{ x: 0, y: 9, z: 0 }, { x: 4, y: 9, z: 0 }, { x: 4, y: 9, z: 4 }, { x: 0, y: 9, z: 4 }], geschlossen: true };

    it('eine offene Kante wird zu n−1 Strecken, ein geschlossener Ring zu n', () => {
        const { u, scene } = umrisse();
        const n = u.setze(new Map([
            ['kante:ab-1:oberkante', { linien: [KANTE], farbe: BAUTEILFARBEN.IFCEARTHWORKSCUT.farbe }],
            ['kante:ab-1:sohlkante', { linien: [RING], farbe: BAUTEILFARBEN.IFCEARTHWORKSCUT.farbe }],
        ]));
        expect(n).toBe(2 + 4);
        expect(gruppeVon(scene).children).toHaveLength(2);
        expect(linieVon(scene, 'kante:ab-1:oberkante').material.color.getHex()).toBe(BAUTEILFARBEN.IFCEARTHWORKSCUT.farbe);
    });

    it('sie liegt AUF der Anzeige plus Hub — nicht mit der Körperabsenkung verrechnet', () => {
        const { u, scene } = umrisse();
        u.setze(new Map([['kante:ab-1:fuss', { linien: [KANTE], farbe: BAUTEILFARBEN.IFCEARTHWORKSFILL.farbe }]]));
        const p = linieVon(scene, 'kante:ab-1:fuss').geometry.getAttribute('position').array;
        // Die Kante kommt aus dem Ergebnisraster und liegt schon auf dem
        // Gelände; sie braucht nur den Hub, nicht `UMRISS_LIFT`.
        expect(p[1]).toBeCloseTo(10 + UMRISS_HUB, 5);
        expect(p[1]).not.toBeCloseTo(10 + UMRISS_LIFT, 5);
    });

    it('Punkte ohne Höhe machen keine Strecke — und keinen NaN im Puffer', () => {
        const { u } = umrisse();
        const kaputt = { punkte: [{ x: 0, y: NaN, z: 0 }, { x: 5, y: 10, z: 0 }], geschlossen: false };
        expect(u.setze(new Map([['kante:ab-1:oberkante', { linien: [kaputt], farbe: 0x8a7145 }]]))).toBe(0);
    });

    it('Körper und Kanten stehen nebeneinander in derselben Gruppe', () => {
        const { u, scene } = umrisse();
        u.setze(new Map([
            [AUSHUB, { netz: quader(), farbe: BAUTEILFARBEN.IFCEARTHWORKSCUT.farbe }],
            ['kante:ab-1:oberkante', { linien: [KANTE], farbe: BAUTEILFARBEN.IFCEARTHWORKSCUT.farbe }],
        ]));
        expect(gruppeVon(scene).children).toHaveLength(2);
        // Gleiche Farbe, EIN Material — auch über die beiden Arten hinweg.
        expect(linieVon(scene, AUSHUB).material).toBe(linieVon(scene, 'kante:ab-1:oberkante').material);
    });
});

describe('Der Umriss folgt dem Hider und dem Auge am Modell', () => {
    it('ausgeblendet heisst ohne Linie — und das gilt über den Neuaufbau', () => {
        const { u, scene } = umrisse();
        u.setze(koerperKarte());
        u.sichtbarkeit(false, [AUSHUB]);
        expect(linieVon(scene, AUSHUB).visible).toBe(false);
        expect(linieVon(scene, AUFTRAG).visible).toBe(true);

        u.setze(koerperKarte());                       // jedes Übernehmen baut neu
        expect(linieVon(scene, AUSHUB).visible).toBe(false);

        u.sichtbarkeit(true, [AUSHUB]);
        expect(linieVon(scene, AUSHUB).visible).toBe(true);
    });

    it('das Auge am Eigenbau nimmt alle Umrisse mit', () => {
        const { u, scene } = umrisse();
        u.setze(koerperKarte());
        u.modellSichtbarkeit(CDE_MODELL_ID, false);
        expect(linieVon(scene, AUSHUB).visible).toBe(false);
        expect(linieVon(scene, AUFTRAG).visible).toBe(false);
        // „Alle zeigen" hebt den Hider auf, nicht das Auge.
        u.alleSichtbar();
        expect(linieVon(scene, AUSHUB).visible).toBe(false);
        u.modellSichtbarkeit(CDE_MODELL_ID, true);
        expect(linieVon(scene, AUSHUB).visible).toBe(true);
    });

    it('dispose räumt die Gruppe aus der Szene', () => {
        const { u, scene } = umrisse();
        u.setze(koerperKarte());
        u.dispose();
        expect(gruppeVon(scene)).toBeUndefined();
    });
});
