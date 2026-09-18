/**
 * Modelle entladen (2026-09-03) — Fabios Befund: „das Rausladen funktioniert
 * nicht, da sollte einfach ein X sein."
 *
 * Es WAR eins da. Zwei Dinge standen davor:
 *
 * 1. Der Name war ein anonymes Flex-Kind. Flex-Kinder haben `min-width: auto`
 *    und schrumpfen deshalb nicht unter ihre Textbreite; ein langer Dateiname
 *    schob den Knopf aus dem 200-px-Chip, und `overflow: hidden` schnitt ihn
 *    mit ab. Sichtbar war nur der harte Schnitt mitten im Namen.
 * 2. `removeModel` hat entladen und danach die halbe Nacharbeit ausgelassen:
 *    Projektbezug, Welt- und Höhenversatz, Achsen und Journalstand blieben
 *    auf dem verschwundenen Modell stehen.
 *
 * Beides sind Textwächter am Quelltext — ein jsdom rendert keine Flexbox mit
 * echten Breiten, und der Viewer braucht WebGL. Was sie halten können, ist
 * die Zusage.
 *
 * Abnahme 2026-09-12 (P1: „das Modell bleibt, obwohl ich × gedrückt habe"):
 * `unloadModel` wartete nicht auf das Entsorgen, liess ein Delta-Modell aus
 * Lageänderungen stehen, und `removeModel` baute den Eigenbau nicht neu — die
 * sichtbare Geländeanzeige hing am entladenen Modell. Das Entladen selbst ist
 * hier am echten `IfcEngine.unloadModel` geprüft, mit einer Bibliotheks-Attrappe.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { IfcEngine } from '../services/IfcEngine.js';

const VIEWER = readFileSync(new URL('../components/IfcViewer.vue', import.meta.url), 'utf8');

describe('Das × am Modell (H3: in der Tafel „Modelle“, vorher an der Pille)', () => {
    const FENSTER = readFileSync(new URL('../components/IfcSpatialWindow.vue', import.meta.url), 'utf8');

    it('ist verdrahtet, nennt das Modell beim Namen und heisst im Satz „Aus dem Satz nehmen“', () => {
        expect(FENSTER).toMatch(/class="sw-weg"[\s\S]{0,400}@click\.stop="api\.modellEntfernen\?\.\(baum\.modelId\)"/);
        expect(FENSTER).toContain('`${baum.name} aus dem Satz nehmen` : `${baum.name} schließen`');
        expect(FENSTER).toContain('v-if="!baum.eigenbau" class="sw-weg"');
        // Der Viewer löst es auf — mit Rückfrage im Satz (K5), ohne Satz entlädt er nur.
        expect(VIEWER).toContain('modellEntfernen: (modelId) => modellEntfernen(');
    });

    it('ist auf dem Finger treffbar', () => {
        const coarse = FENSTER.slice(FENSTER.indexOf('@media (pointer: coarse)'));
        expect(coarse).toMatch(/\.sw-weg \{ position: relative|, \.sw-weg \{ position: relative/);
        expect(coarse).toMatch(/\.sw-weg::after/);
    });
});

describe('Das Entladen zieht den Modellstand nach', () => {
    /** Der Rumpf von `removeModel` — bis zur nächsten Deklaration. */
    const rumpf = (() => {
        const ab = VIEWER.indexOf('async function removeModel(');
        return VIEWER.slice(ab, VIEWER.indexOf('\n/**', ab + 10));
    })();

    it('entlädt, vergisst, zieht nach und entwertet das Fachmodell', () => {
        expect(rumpf).toContain('unloadModel(modelId)');
        expect(rumpf).toContain('ablage.vergiss(modelId)');
        // DER Punkt: derselbe Nachzug wie beim Laden, nicht eine zweite Liste.
        expect(rumpf).toContain('_modellmengeNachziehen()');
        // Und der Journalstand — sonst geistern Achsen und Verdecktes weiter.
        expect(rumpf).toMatch(/entwerteNach\(\['erzeugt', 'lage'\]\)/);
    });

    it('baut den Eigenbau neu — die Geländeanzeige hängt am entladenen Modell', () => {
        const neu = rumpf.indexOf('baueErzeugteNeu()');
        expect(neu).toBeGreaterThan(rumpf.indexOf('unloadModel(modelId)'));
        // Vor dem Entwerten: das Fachmodell liest den neu gebauten Stand.
        expect(neu).toBeLessThan(rumpf.indexOf("entwerteNach(['erzeugt', 'lage'])"));
    });

    it('EIN Weg für beide: das Laden ruft denselben Nachzug', () => {
        const laden = VIEWER.slice(VIEWER.indexOf('async function _onModelLoaded('));
        expect(laden.slice(0, 600)).toContain('_modellmengeNachziehen()');
    });

    it('der Nachzug setzt Bezug, Rahmen, Höhenversatz und Achsen — in dieser Reihenfolge', () => {
        const ab = VIEWER.indexOf('async function _modellmengeNachziehen()');
        const block = VIEWER.slice(ab, ab + 1800);
        const reihenfolge = ['_bezuegeNeuBestimmen()', 'setzeWeltversatz', 'setzeHoehenversatz', 'leseAchsen()', 'setModelList'];
        let letzte = -1;
        for (const marke of reihenfolge) {
            const i = block.indexOf(marke);
            expect(i, marke).toBeGreaterThan(letzte);
            letzte = i;
        }
    });
});

/**
 * Eine Engine mit einem geladenen Modell — die Bibliothek in ihrer echten
 * Form: `dispose` nimmt das Objekt erst nach der Worker-Antwort aus der Szene
 * und die Kennung aus der Liste; das Delta räumt nur der Editor.
 */
function engineMitModell() {
    const szene = new THREE.Group();
    const objekt = new THREE.Group();
    szene.add(objekt);
    const list = new Map();
    const stand = { entsorgt: false };
    const model = {
        modelId: 'm1', object: objekt,
        dispose: vi.fn(async () => {
            await new Promise(r => setTimeout(r, 5));        // die Worker-Antwort
            list.delete('m1');
            objekt.removeFromParent();
            stand.entsorgt = true;
        }),
    };
    list.set('m1', model);
    const disposeDeltaModels = vi.fn(async () => {});
    const e = Object.create(IfcEngine.prototype);
    Object.assign(e, {
        components: { get: () => ({ list, core: { editor: { disposeDeltaModels } } }) },
        _coordOffsets: new Map(), _quellen: new Map(), _quellenFehler: new Map(),
        _beziehungenVerwerfen: () => {}, _einheitsUmrechnungen: new Map(), _einheitsBytes: new Map(),
        _fragPuffer: new Map(), _coordinationOffset: new THREE.Vector3(), _gelaendeVerwerfen: () => {},
        buildCategoryIndex: vi.fn(async () => {}),
    });
    return { e, objekt, list, stand, disposeDeltaModels };
}

describe('unloadModel wartet und räumt das Delta mit (Abnahme 2026-09-12)', () => {
    it('das Objekt ist sofort aus der Szene, nicht erst nach der Worker-Antwort', async () => {
        const { e, objekt } = engineMitModell();
        const fertig = e.unloadModel('m1');
        expect(objekt.parent).toBe(null);                  // vorher: noch in der Szene
        await fertig;
    });

    it('entsorgt das Delta des Modells und wartet auf die Basis', async () => {
        const { e, list, stand, disposeDeltaModels } = engineMitModell();
        await e.unloadModel('m1');
        expect(disposeDeltaModels).toHaveBeenCalledWith('m1');   // vorher: nie
        expect(stand.entsorgt).toBe(true);                      // vorher: nicht abgewartet
        expect(list.size).toBe(0);
    });
});
