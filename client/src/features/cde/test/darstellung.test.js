/**
 * Die Darstellung des Erdkörpers (Fabio, 2026-09-09): „müsste man dem
 * Volumenkörper beim Rendern mehr 3D geben, sodass man auch die Kanten
 * besser sieht und Neigungen … das Raster im Viewer versperrt die Sicht".
 *
 * Zwei Kuren, beide messbar ohne Bildvergleich:
 *
 *  1. BELEUCHTUNG — die Bibliothek stellt Umgebungs- und Richtungslicht
 *     gleich stark (je 2). Richtungsloses Licht macht jede Fläche gleich
 *     hell, egal wie sie geneigt ist; das IST Flachheit. Der Anteil des
 *     gerichteten Lichts lässt sich ausrechnen — daran hängt der Test.
 *  2. BEZUGSRASTER — es liegt auf Höhe null und schneidet bei einem
 *     georeferenzierten Modell mitten durchs Gelände.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { BELEUCHTUNG, plastizitaet, setzeBeleuchtung } from '../services/IfcBeleuchtung.js';
import { IfcEngine } from '../services/IfcEngine.js';

function welt() {
    const szene = new THREE.Scene();
    const umgebung = new THREE.AmbientLight(0xffffff, 2);
    const haupt = new THREE.DirectionalLight(0xffffff, 2);
    szene.add(umgebung, haupt);
    return { scene: { three: szene, ambientLight: umgebung, directionalLight: haupt } };
}

describe('Beleuchtung — Neigungen werden sichtbar', () => {
    it('die Vorgabe der Bibliothek ist flach, unsere nicht', () => {
        // Bibliothek: Umgebung 2, Richtung 2 ⇒ die Hälfte ist richtungslos.
        expect(plastizitaet({ umgebung: 2, haupt: 2, gegen: 0, himmel: 0 })).toBeCloseTo(0.5, 2);
        // Unsere Werte: der weit überwiegende Teil kommt aus einer Richtung.
        expect(plastizitaet()).toBeGreaterThan(0.72);
    });

    it('setzt Umgebungslicht herunter und richtet das Hauptlicht nach NORDWEST aus', () => {
        const w = welt();
        const r = setzeBeleuchtung(w);
        expect(r.umgebung).toBe(BELEUCHTUNG.umgebung);
        // Das Umgebungslicht deutlich unter dem Hauptlicht — und die SUMME so,
        // dass eine waagerechte Fläche nicht auf Weiss clippt (am Bild abgelesen).
        expect(w.scene.ambientLight.intensity).toBeLessThan(0.5);
        expect(w.scene.directionalLight.intensity).toBeGreaterThan(w.scene.ambientLight.intensity * 2);
        const summe = BELEUCHTUNG.umgebung + BELEUCHTUNG.haupt + BELEUCHTUNG.gegen + BELEUCHTUNG.himmel;
        expect(summe).toBeLessThan(2.0);
        // Nordwest, schräg von oben: x negativ (West), z negativ (Nord), y positiv.
        const p = w.scene.directionalLight.position;
        expect(p.x).toBeLessThan(0);
        expect(p.z).toBeLessThan(0);
        expect(p.y).toBeGreaterThan(0);
        // … und die Höhe überwiegt, sonst stünde die Sonne am Horizont.
        expect(p.y).toBeGreaterThan(Math.abs(p.x));
    });

    it('ergänzt genau EIN Gegenlicht — auch wenn zweimal gerufen (Hot-Reload)', () => {
        const w = welt();
        setzeBeleuchtung(w);
        setzeBeleuchtung(w);
        const gerichtet = w.scene.three.children.filter(o => o.isDirectionalLight);
        expect(gerichtet).toHaveLength(2);                    // Haupt + Gegen, nicht drei
        expect(w.scene.three.children.filter(o => o.isHemisphereLight)).toHaveLength(1);
    });

    it('das Gegenlicht kommt von der ANDEREN Seite und ist schwächer', () => {
        const w = welt();
        setzeBeleuchtung(w);
        const haupt = w.scene.directionalLight;
        const gegen = w.scene.three.getObjectByName('cde-gegenlicht');
        expect(gegen.intensity).toBeLessThan(haupt.intensity);
        // Entgegengesetzte Richtung: das Skalarprodukt der Lagen ist negativ.
        expect(haupt.position.dot(gegen.position)).toBeLessThan(0);
    });

    it('ohne Szene passiert nichts — kein Wurf', () => {
        expect(setzeBeleuchtung(null)).toBeNull();
        expect(setzeBeleuchtung({})).toBeNull();
    });
});

describe('Das Bezugsraster weicht dem Gelände', () => {
    function engine({ kategorien = [], schonGewichen = false } = {}) {
        const e = Object.create(IfcEngine.prototype);
        e._sceneGrid = { three: { visible: true } };
        e._rasterWichGelaende = schonGewichen;
        e._categoryGroups = kategorien.map(name => ({ name, groupData: {} }));
        e._gelaendeKategorien = null;
        e.setGridVisible = vi.fn((v) => { e._sceneGrid.three.visible = v; });
        return e;
    }

    it('bleibt stehen, solange kein Gelände geladen ist', () => {
        const e = engine({ kategorien: ['IFCPIPESEGMENT', 'IFCDISTRIBUTIONCHAMBERELEMENT'] });
        e._bezugsrasterNachziehen();
        expect(e.setGridVisible).not.toHaveBeenCalled();
        expect(e._sceneGrid.three.visible).toBe(true);
    });

    it('weicht, sobald ein Geländemodell dazukommt', () => {
        const e = engine({ kategorien: ['IFCPIPESEGMENT', 'IFCGEOGRAPHICELEMENT'] });
        e._bezugsrasterNachziehen();
        expect(e.setGridVisible).toHaveBeenCalledWith(false);
        expect(e._rasterWichGelaende).toBe(true);
    });

    it('greift NUR EINMAL ein — wer es wieder einschaltet, behält es', () => {
        const e = engine({ kategorien: ['IFCGEOGRAPHICELEMENT'], schonGewichen: true });
        e._bezugsrasterNachziehen();
        expect(e.setGridVisible).not.toHaveBeenCalled();
    });

    it('erkennt auch die anderen Gelände-Kategorien und ignoriert Grossschreibung', () => {
        for (const k of ['IfcEarthworksElement', 'IFCCIVILELEMENT']) {
            const e = engine({ kategorien: [k] });
            e._bezugsrasterNachziehen();
            expect(e.setGridVisible, k).toHaveBeenCalledWith(false);
        }
    });
});
