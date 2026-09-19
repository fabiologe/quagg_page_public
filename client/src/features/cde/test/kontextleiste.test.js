// @vitest-environment jsdom
/**
 * Kontextleiste, Vorschau-Composable und Neueinordnung (Teil XVI, S2).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useVorschau, _zugPrimitive } from '../composables/useVorschau.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (p) => readFileSync(WURZEL + p, 'utf8');

describe('Verklebung (Textwächter)', () => {
    const viewer = lies('components/IfcViewer.vue');
    const leiste = lies('components/CdeKontextleiste.vue');

    it('die Kontextleiste zeigt Tipp-Werkzeuge UND die scharfe Bearbeitung — ein Ort', () => {
        expect(viewer).toMatch(/<CdeKontextleiste[\s\S]*?v-if="messen\.aktiv\.value \|\| annotationActive \|\| bearbeitung\.scharf \|\| rueckmeldung \|\| bearbeitung\.eckenFuer"/);
        expect(leiste).toContain('<CdeBearbeitungForm');
        expect(leiste).toContain("$emit('uebernehmen')");
        expect(leiste).toContain('kl-chip');
    });

    it('✓ in der Leiste geht denselben Weg wie Toolbox und HUD: ausfuehren → wendeEintragAn', () => {
        const fn = viewer.slice(viewer.indexOf('async function uebernehmeScharf'));
        expect(fn.slice(0, 1200)).toMatch(/bearbeitung\.ausfuehren\(/);
        expect(fn.slice(0, 1200)).toMatch(/await wendeEintragAn\(eintrag\)/);
        expect(fn.slice(0, 1200)).toMatch(/lieferstandVon/);
        expect(fn.slice(0, 1200)).toMatch(/modellHerkunft/);
    });

    it('JEDER Anwendungsweg ordnet das Subjekt danach neu ein — ohne Kamerafahrt', () => {
        const fn = viewer.slice(viewer.indexOf('async function wendeEintragAn'));
        expect(fn.slice(0, 700)).toMatch(/nachAusfuehrenEinordnen\(eintragOderListe\)/);
        const neu = viewer.slice(viewer.indexOf('async function nachAusfuehrenEinordnen'));
        expect(neu.slice(0, 1600)).toMatch(/waehleOrt/);
        expect(neu.slice(0, 1600)).toMatch(/_einordnenMitHuelle\(frisch\)/);
        expect(neu.slice(0, 1600)).not.toMatch(/zoomToElement|fitTo|waehleBauteil/);
        // Ersetzt (geloescht) ⇒ Auswahl leer + Meldung, kein stilles Weiterzeigen.
        expect(neu.slice(0, 1600)).toMatch(/geloescht/);
        expect(neu.slice(0, 1600)).toMatch(/melde\(/);
        // Die viewerApi-Fassade ruft dieselbe Funktion.
        expect(viewer).toMatch(/wendeEintragAn: \(eintragOderListe\) => wendeEintragAn\(eintragOderListe\)/);
    });

    it('das Subjekt trägt seine Box — die Lage-Vorschau braucht sie', async () => {
        expect(viewer).toMatch(/box: h\.box \?\? null/);
        // Seit Teil XXIV (K3) rechnet `geometrie/Huelle.js` die Hülle — für die
        // Box aus dem Raum und für die aus dem Rezept. Geprüft wird das
        // Ergebnis, nicht mehr die Zeile.
        const THREE = await import('three');
        const { huelleAusBox } = await import('../services/IfcAutor.js');
        const h = huelleAusBox(new THREE.Box3(new THREE.Vector3(1, 2, 3), new THREE.Vector3(5, 6, 9)));
        expect(h).toEqual({ anker: { x: 3, y: 4, z: 6 }, unterkante: 2, oberkante: 6,
                            box: { min: { x: 1, y: 2, z: 3 }, max: { x: 5, y: 6, z: 9 } } });
    });

    it('die alte Modus-Leiste ist restlos umgezogen', () => {
        expect(viewer.split('<style')[1]).not.toContain('modus-leiste');
        expect(viewer).not.toContain('class="modus-leiste"');
    });
});

describe('useVorschau am echten Store', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); vi.useFakeTimers(); });

    function baue() {
        const b = useBearbeitung();
        b.modusSetzen(true);
        const e = {
            overlayZeige: vi.fn(), overlayLeere: vi.fn(),
            faerbe: vi.fn(async () => 1), entfaerbe: vi.fn(async () => true), entfaerbeAlle: vi.fn(async () => {}),
            components: { get: () => ({ list: new Map([['m1', {
                modelId: 'm1',
                getLocalIdsByGuids: async (guids) => guids.map(g => (g === 'ROHR' ? 42 : null)),
            }]]) }) },
        };
        const v = useVorschau({ engine: ref(e), bearbeitung: b, getHoeheAn: () => 302, getHoehenversatz: () => 0,
                                farben: () => ({ accent: '#0af', warn: '#fa0', ok: '#0f0' }), verzoegerungMs: 10 });
        return { b, e, v };
    }

    const ROHR = {
        modelId: 'm1', localId: 42, category: 'IFCPIPESEGMENT', globalId: 'ROHR',
        anker: { x: 10, y: 300, z: 0 }, bezugshoehe: 299.85, oberkante: 300.15,
        box: { min: { x: 0, y: 299.85, z: -0.15 }, max: { x: 20, y: 300.15, z: 0.15 } }, hoehenversatz: 0,
    };

    it('zeichnet entprellt, sobald ein Werkzeug scharf ist — und färbt über die Engine', async () => {
        const t = baue();
        await t.b.einordne(ROHR, null);
        // Ohne Resolver ist das Rohr `netz` — das Subjekt geht mit (wie beim
        // Schacht-Griff), dann bürgt der Aufrufer und der Store startet.
        expect(t.b.starte('bezugshoehe-setzen', { subjekt: ROHR })).toBe(true);
        t.b.setzeWert('hoehe', 305);
        await vi.advanceTimersByTimeAsync(30);
        expect(t.e.overlayZeige).toHaveBeenCalled();
        const [ebene, prim] = t.e.overlayZeige.mock.calls.at(-1);
        expect(ebene).toBe('vorschau');
        expect(prim.some(p => p.art === 'box')).toBe(true);
        expect(t.v.stand.value.chips[0].text).toMatch(/ΔH/);
        // Keine Färbung nötig → die Rollen werden geräumt, nicht gesetzt.
        expect(t.e.faerbe).not.toHaveBeenCalled();
        expect(t.e.entfaerbe).toHaveBeenCalled();
    });

    it('das Dimmen läuft über die GlobalId-Karte zur Engine', async () => {
        const t = baue();
        await t.b.einordne({ ...ROHR, achse: { anfang: { x: 0, y: 300, z: 0 }, ende: { x: 20, y: 299.8, z: 0 }, laenge: 20, dn: 300 } }, null);
        expect(t.b.starte('haltung-teilen', { subjekt: t.b.bauteil })).toBe(true);
        await vi.advanceTimersByTimeAsync(30);
        expect(t.e.faerbe).toHaveBeenCalledWith('dimmen', [{ modelId: 'm1', localId: 42 }]);
    });

    it('abbrechen räumt Overlay und Färbungen', async () => {
        const t = baue();
        await t.b.einordne(ROHR, null);
        t.b.starte('bezugshoehe-setzen', { subjekt: ROHR });
        await vi.advanceTimersByTimeAsync(30);
        t.b.abbrechen();
        await vi.advanceTimersByTimeAsync(30);
        expect(t.e.overlayLeere).toHaveBeenCalledWith('vorschau');
        // Nur die Rollen der Vorschau — der Farbkatalog bleibt (Abnahme K4).
        expect(t.e.entfaerbeAlle).not.toHaveBeenCalled();
        expect(t.e.entfaerbe).toHaveBeenCalledWith('dimmen');
        expect(t.v.stand.value).toBeNull();
    });

    it('der laufende Zug ist sichtbar, bevor anwenden etwas liefert', () => {
        const prim = _zugPrimitive([{ x: 0, z: 0 }, { x: 5, z: 0 }], { x: 8, z: 1 }, { hoeheAn: () => 302, farbe: '#0af' });
        expect(prim.filter(p => p.art === 'marke')).toHaveLength(2);
        expect(prim.find(p => p.art === 'linie' && !p.gestrichelt).punkte[0].y).toBe(302);
        expect(prim.find(p => p.gestrichelt).punkte[1]).toEqual({ x: 8, y: 302, z: 1 });
        // Ohne Höhe (kein Sampler, keine Vorgabe): keine Punkte, kein Wurf.
        expect(_zugPrimitive([{ x: 0, z: 0 }], null, {})).toEqual([]);
    });
});
