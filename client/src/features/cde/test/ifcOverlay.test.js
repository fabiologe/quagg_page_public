/**
 * IfcOverlay — der eine Besitzer temporärer Grafik (Teil XVI, S1).
 *
 * three läuft ohne WebGL: eine echte `THREE.Scene` genügt, um Aufbau,
 * Reihenfolge, Leeren und Entsorgen zu prüfen.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EBENEN, IfcOverlay } from '../services/IfcOverlay.js';

function baue() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 60, 0);
    const world = { scene: { three: scene }, camera: { three: camera } };
    return { scene, camera, overlay: new IfcOverlay({ getWorld: () => world }) };
}

describe('Aufbau', () => {
    it('legt EINE Wurzel „cde-overlay" an und darunter die Ebene, die gebraucht wird', () => {
        const { scene, overlay } = baue();
        overlay.zeige('vorschau', [{ art: 'linie', punkte: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] }]);
        const wurzeln = scene.children.filter(o => o.name === 'cde-overlay');
        expect(wurzeln).toHaveLength(1);
        expect(wurzeln[0].children.map(g => g.name)).toEqual(['cde-overlay:vorschau']);
    });

    it('räumt eine ALTE Wurzel gleichen Namens weg (HMR) statt daneben zu bauen', () => {
        const { scene, overlay } = baue();
        const alt = new THREE.Group(); alt.name = 'cde-overlay'; scene.add(alt);
        overlay.zeige('fang', [{ art: 'marke', punkt: { x: 0, y: 0, z: 0 } }]);
        expect(scene.children.filter(o => o.name === 'cde-overlay')).toHaveLength(1);
        expect(scene.children.includes(alt)).toBe(false);
    });

    it('die Ebenen tragen ihre renderOrder — der Zeiger liegt zuoberst', () => {
        expect(EBENEN.zeiger).toBeGreaterThan(EBENEN.fang);
        expect(EBENEN.fang).toBeGreaterThan(EBENEN.griffe);
        expect(EBENEN.griffe).toBeGreaterThan(EBENEN.vorschau);
        const { overlay } = baue();
        overlay.zeige('griffe', [{ art: 'marke', punkt: { x: 0, y: 0, z: 0 } }]);
        const g = overlay._ebenen.get('griffe');
        expect(g.renderOrder).toBe(EBENEN.griffe);
        expect(g.children[0].renderOrder).toBe(EBENEN.griffe);
    });

    it('weist eine unbekannte Ebene laut ab', () => {
        const { overlay } = baue();
        expect(() => overlay.zeige('irgendwas', [])).toThrow(/unbekannte Ebene/);
    });
});

describe('Primitive', () => {
    it('baut jede Sorte — und überspringt Unbrauchbares ohne Wurf', () => {
        const { overlay } = baue();
        const pos = new Float64Array([0, 0, 0, 1, 0, 0, 0, 0, 1]);
        const n = overlay.zeige('vorschau', [
            { art: 'linie', punkte: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], gestrichelt: true },
            { art: 'umriss', ring: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }] },
            { art: 'marke', punkt: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
            { art: 'geist', positions: pos, triCount: 1 },
            { art: 'box', min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
            { art: 'versatz', von: { x: 0, y: 0, z: 0 }, nach: { x: 0, y: 2, z: 0 } },
            { art: 'linie', punkte: [{ x: 0, y: 0, z: 0 }] },                      // zu kurz
            { art: 'geist', positions: pos, triCount: 0 },                          // leer
            { art: 'unbekannt' },
        ]);
        expect(n).toBe(6);
        expect(overlay.anzahl('vorschau')).toBe(6);
    });

    it('`bauplan` baut den Geist über das Rezept — ein untauglicher Bauplan ist kein Fehler (S2)', () => {
        const { overlay } = baue();
        const n = overlay.zeige('vorschau', [
            { art: 'bauplan', bauplan: { rezept: 'linie', kategorie: 'IFCANNOTATION', parameter: { punkte: [[0, 0, 0], [5, 0, 0]] } } },
            { art: 'bauplan', bauplan: { rezept: 'linie', kategorie: 'IFCANNOTATION', parameter: { punkte: [[0, 0, 0]] } } },   // zu wenig
            { art: 'bauplan', bauplan: { rezept: 'gibtsnicht', parameter: {} } },
        ]);
        expect(n).toBe(1);
        const mesh = overlay._ebenen.get('vorschau').children[0];
        expect(mesh.isMesh).toBe(true);
        expect(mesh.children[0].isLineSegments).toBe(true);
        expect(mesh.material.transparent).toBe(true);
    });

    it('`forderung` zeichnet gestrichelte Züge — und fällt leer weg (S2)', () => {
        const { overlay } = baue();
        const n = overlay.zeige('vorschau', [
            { art: 'forderung', linien: [[{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], [{ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }], [{ x: 0, y: 0, z: 0 }]] },
            { art: 'forderung', linien: [] },
        ]);
        expect(n).toBe(1);
        const g = overlay._ebenen.get('vorschau').children[0];
        expect(g.children).toHaveLength(2);
        expect(g.children[0].material.isLineDashedMaterial).toBe(true);
    });

    it('legt eine Marke IN die Trefferebene und hebt sie um den Lift', () => {
        const { overlay } = baue();
        overlay.zeige('fang', [{ art: 'marke', punkt: { x: 5, y: 2, z: 5 }, normal: { x: 0, y: 1, z: 0 } }]);
        const m = overlay._ebenen.get('fang').children[0];
        expect(m.position.y).toBeCloseTo(2.02, 9);
        // Die Ring-Normale (+Z des Objekts) zeigt jetzt nach +Y.
        const n = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion);
        expect(n.y).toBeCloseTo(1, 9);
    });

    it('teilt Materialien je Rolle — zwei Linien, ein Material', () => {
        const { overlay } = baue();
        overlay.zeige('vorschau', [
            { art: 'linie', punkte: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], farbe: '#ff0000' },
            { art: 'linie', punkte: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }], farbe: '#ff0000' },
        ]);
        const [a, b] = overlay._ebenen.get('vorschau').children;
        expect(a.material).toBe(b.material);
        expect(a.material.depthTest).toBe(false);
    });
});

describe('Leeren und Entsorgen', () => {
    it('zeige() ersetzt den Inhalt der Ebene und entsorgt die Geometrien', () => {
        const { overlay } = baue();
        overlay.zeige('vorschau', [{ art: 'linie', punkte: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] }]);
        const alt = overlay._ebenen.get('vorschau').children[0];
        const dispose = vi.spyOn(alt.geometry, 'dispose');
        overlay.zeige('vorschau', [{ art: 'marke', punkt: { x: 0, y: 0, z: 0 } }]);
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(overlay.anzahl('vorschau')).toBe(1);
        // Das Material lebt weiter — es ist geteilt.
        expect(alt.material.dispose).toBeDefined();
    });

    it('leere() räumt nur die eine Ebene', () => {
        const { overlay } = baue();
        overlay.zeige('vorschau', [{ art: 'marke', punkt: { x: 0, y: 0, z: 0 } }]);
        overlay.zeige('griffe', [{ art: 'marke', punkt: { x: 0, y: 0, z: 0 } }]);
        overlay.leere('vorschau');
        expect(overlay.anzahl('vorschau')).toBe(0);
        expect(overlay.anzahl('griffe')).toBe(1);
    });

    it('dispose() nimmt die Wurzel aus der Szene und entsorgt die Materialien', () => {
        const { scene, overlay } = baue();
        overlay.zeige('vorschau', [{ art: 'marke', punkt: { x: 0, y: 0, z: 0 } }]);
        const mats = [...overlay._materialien.values()];
        expect(mats.length).toBeGreaterThan(0);
        const spione = mats.map(m => vi.spyOn(m, 'dispose'));
        overlay.dispose();
        expect(scene.children.filter(o => o.name === 'cde-overlay')).toHaveLength(0);
        for (const sp of spione) expect(sp).toHaveBeenCalled();
    });
});

describe('Der Zeiger', () => {
    it('erscheint mit Normale in der Ebene, ohne Normale als Billboard — und verschwindet mit null', () => {
        const { overlay, camera } = baue();
        expect(overlay.setzeZeiger({ punkt: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, farbe: '#4fc3f7' })).toBe(true);
        const g = overlay._zeiger.gruppe;
        expect(g.visible).toBe(true);
        expect(g.position.y).toBeCloseTo(0.02, 9);
        expect(new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion).y).toBeCloseTo(1, 6);

        overlay.setzeZeiger({ punkt: { x: 0, y: 0, z: 0 }, normal: null, farbe: '#4fc3f7' });
        // Billboard: die Objekt-Z-Achse zeigt zur Kamera (die steht bei y=60).
        expect(new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion).y).toBeCloseTo(1, 6);

        expect(overlay.setzeZeiger(null)).toBe(false);
        expect(g.visible).toBe(false);
        expect(camera).toBeTruthy();
    });

    it('skaliert mit der Kameradistanz, nie unter das Minimum', () => {
        const { overlay, camera } = baue();
        overlay.setzeZeiger({ punkt: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } });
        const nah = overlay._zeiger.gruppe.scale.x;
        camera.position.set(0, 600, 0);
        overlay.setzeZeiger({ punkt: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } });
        expect(overlay._zeiger.gruppe.scale.x).toBeGreaterThan(nah);
        camera.position.set(0, 0.5, 0);
        overlay.setzeZeiger({ punkt: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } });
        expect(overlay._zeiger.gruppe.scale.x).toBeCloseTo(0.12, 9);
    });

    it('ein Farbwechsel (Fang) baut die Marke neu, ohne die alte liegen zu lassen', () => {
        const { overlay } = baue();
        overlay.setzeZeiger({ punkt: { x: 0, y: 0, z: 0 }, farbe: '#4fc3f7' });
        overlay.setzeZeiger({ punkt: { x: 0, y: 0, z: 0 }, farbe: '#ffb74d' });
        expect(overlay._ebenen.get('zeiger').children).toHaveLength(1);
    });
});

describe('griffRadius — die Kugel bleibt auf dem Schirm gleich gross', () => {
    it('folgt dem Kameraabstand, zwischen 8 cm und 50 cm; ohne Kamera 25 cm', async () => {
        const { griffRadius } = await import('../services/IfcOverlay.js');
        const cam = { position: new THREE.Vector3(0, 0, 0) };
        expect(griffRadius(cam, { x: 70, y: 0, z: 0 })).toBeLessThanOrEqual(0.5);
        expect(griffRadius(cam, { x: 14, y: 0, z: 0 })).toBeCloseTo(0.2, 6);
        expect(griffRadius(cam, { x: 1, y: 0, z: 0 })).toBe(0.08);                 // nah dran: Untergrenze
        expect(griffRadius(cam, { x: 3500, y: 0, z: 0 })).toBe(0.5);              // weit weg: Obergrenze
        expect(griffRadius(null, { x: 1, y: 0, z: 0 })).toBe(0.25);
    });
});
