/**
 * Die Geländekanten folgen dem Auge am Modell (Abnahme 2026-09-12, M2).
 *
 * Fabio: „irgendein Phantom-Gitter bleibt stehen aus dem Eigenbau". Gemessen
 * in 42069: mit ausgeblendetem Eigenbau blieb die Gruppe `cde-gelaende-kanten`
 * sichtbar — die Kanten des geformten Geländes liegen in einer eigenen Gruppe
 * der Szene, und das Auge setzte nur `object.visible` am Modell.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GelaendeKanten } from '../services/GelaendeKanten.js';

const WURZEL = new URL('..', import.meta.url).pathname;
const DREIECK = () => ({ positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 0, 10]), triCount: 1 });

function kanten() {
    const scene = new THREE.Scene();
    return new GelaendeKanten({ getWorld: () => ({ scene: { three: scene } }) });
}
const sichtbar = (k, schluessel) => k._linien.get(schluessel)?.visible;

describe('Geländekanten und das Auge am Modell', () => {
    it('Eigenbau aus: seine Kanten weg, die der Lieferung bleiben — auch nach dem nächsten Neuaufbau', () => {
        const k = kanten();
        const netze = () => new Map([['cde-eigenbau|5', DREIECK()], ['dgm.ifc|7', DREIECK()]]);
        k.setze(netze());
        k.modellSichtbarkeit('cde-eigenbau', false);
        expect(sichtbar(k, 'cde-eigenbau|5')).toBe(false);
        expect(sichtbar(k, 'dgm.ifc|7')).toBe(true);

        k.setze(netze());                                   // jedes Übernehmen baut neu
        expect(sichtbar(k, 'cde-eigenbau|5')).toBe(false);

        k.modellSichtbarkeit('cde-eigenbau', true);
        expect(sichtbar(k, 'cde-eigenbau|5')).toBe(true);
    });

    it('„alle zeigen" hebt den Hider auf, nicht das Auge', () => {
        const k = kanten();
        k.setze(new Map([['cde-eigenbau|5', DREIECK()]]));
        k.modellSichtbarkeit('cde-eigenbau', false);
        k.alleSichtbar();
        expect(sichtbar(k, 'cde-eigenbau|5')).toBe(false);
    });

    it('das Auge der Engine erreicht die Kanten', () => {
        const engine = readFileSync(join(WURZEL, 'services/IfcEngine.js'), 'utf8');
        const ab = engine.indexOf('async setzeModellSichtbar(');
        const rumpf = engine.slice(ab, engine.indexOf('\n    }\n', ab));
        expect(rumpf).toContain('this.gelaendeKanten?.modellSichtbarkeit?.(modelId, sichtbar)');
    });
});
