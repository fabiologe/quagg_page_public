// @vitest-environment jsdom
/**
 * Schacht-Griffe im Lageplan (G1, 2026-09-02).
 *
 * Drei Sorgen, drei Prüfungen:
 *
 *  1. Die ENGINE-Auskünfte (`knotenGriffe`, `schachtAnschluesse`) — geprüft
 *     gegen die echten Methodenkörper über `prototype.call` (die Lehre aus
 *     17.3: Attrappen einer Methode, die es so nicht gibt, lügen grün).
 *     Die Landmine dabei: `nah`/`fern` NIE nach Index, immer nach dem Ende,
 *     das am Schacht hängt — sonst dreht sich beim Ziehen gelegentlich eine
 *     Haltung um, und nur manche.
 *  2. Die SUBJEKT-WEICHE in `starte`: der Griff zieht einen Schacht, den in
 *     3D niemand angeklickt hat — die Prüfung gegen die Auswahl darf ihn
 *     dann nicht sperren.
 *  3. Der EINE Schreibweg (Textwächter): der Drop läuft über
 *     starte → ausfuehren → wendeEintragAn, und die Griffe werden erst NACH
 *     `doc.beende()` gezeichnet — sie sind Bedienung und dürfen nie ins PDF.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { IfcEngine } from '../services/IfcEngine.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');

// ── 1. Engine-Auskünfte am echten Methodenkörper ────────────────────────────

function fakeEngine() {
    return {
        _verdeckt: new Set(['WEG']),
        _knoten: new Map([
            ['m1', new Map([
                [11, { globalId: 'S1', name: 'S 1', punkt: { x: 0, y: 3, z: 0 } }],
                [12, { globalId: 'S2', name: 'S 2', punkt: { x: 10, y: 3, z: -5 } }],
                [13, { globalId: 'WEG', name: 'weg', punkt: { x: 1, y: 1, z: 1 } }],
                [14, { globalId: '', name: 'ohne', punkt: { x: 2, y: 2, z: 2 } }],
            ])],
        ]),
        _cdeKnoten: new Map([
            ['cdeS', { punkt: { x: 7, y: 0, z: 7 }, name: 'Eigener' }],
        ]),
    };
}

describe('IfcEngine.knotenGriffe (echter Methodenkörper)', () => {
    it('liefert gelieferte UND eigene Knoten, mit Herkunft — Verdecktes und Namenloses nicht', () => {
        const griffe = IfcEngine.prototype.knotenGriffe.call(fakeEngine());
        const je = new Map(griffe.map(g => [g.globalId, g]));
        expect(je.size).toBe(3);
        expect(je.get('S1')).toMatchObject({ herkunft: 'geliefert', modelId: 'm1', localId: 11, name: 'S 1' });
        expect(je.get('S1').punkt).toEqual({ x: 0, y: 3, z: 0 });
        expect(je.get('cdeS')).toMatchObject({ herkunft: 'cde', modelId: null });
        expect(je.has('WEG')).toBe(false);
    });

    it('schachtOrt findet Modell und localId zur GlobalId — und nur für Geliefertes', () => {
        const dieses = fakeEngine();
        expect(IfcEngine.prototype.schachtOrt.call(dieses, 'S2')).toEqual({ modelId: 'm1', localId: 12 });
        expect(IfcEngine.prototype.schachtOrt.call(dieses, 'cdeS')).toBeNull();
        expect(IfcEngine.prototype.schachtOrt.call(dieses, 'GIBTSNICHT')).toBeNull();
    });

    it('schachtAnschluesse: nah ist IMMER das Ende am Schacht — nie der Index', () => {
        const dieses = {
            // B2: `schachtAnschluesse` liest über `anschluesseFuer` (GlobalId) —
            // die echte Methode, der Ort und das Netz bleiben Attrappen.
            anschluesseFuer: IfcEngine.prototype.anschluesseFuer,
            schachtOrt: () => ({ modelId: 'm1', localId: 11 }),
            anschluesseVon: () => ([
                // Diese Haltung BEGINNT am Schacht: anfang ist nah.
                { globalId: 'H1', name: 'H-001', ende: 'anfang', dn: 300,
                  anfang: { x: 0, y: 3, z: 0 }, ende_: { x: 10, y: 2, z: 0 } },
                // Diese ENDET am Schacht: ende_ ist nah — der Index wäre falsch.
                { globalId: 'H2', name: 'H-002', ende: 'ende', dn: 400,
                  anfang: { x: -8, y: 4, z: 2 }, ende_: { x: 0, y: 3, z: 0 } },
            ]),
        };
        const a = IfcEngine.prototype.schachtAnschluesse.call(dieses, 'S1');
        expect(a[0].nah).toEqual({ x: 0, y: 3, z: 0 });
        expect(a[0].fern).toEqual({ x: 10, y: 2, z: 0 });
        expect(a[1].nah).toEqual({ x: 0, y: 3, z: 0 });
        expect(a[1].fern).toEqual({ x: -8, y: 4, z: 2 });
    });

    it('ohne Ort: leere Liste, kein Wurf', () => {
        expect(IfcEngine.prototype.schachtAnschluesse.call({ anschluesseFuer: IfcEngine.prototype.anschluesseFuer, schachtOrt: () => null }, 'X')).toEqual([]);
    });
});

// ── 2. Die Subjekt-Weiche in starte ─────────────────────────────────────────

describe('starte mit eigenem Subjekt (G1)', () => {
    beforeEach(() => {
        localStorage.clear();
        setActivePinia(createPinia());
        useBearbeitung().modusSetzen(true);
    });

    const ROHR = { modelId: 'm1', localId: 42, category: 'IFCPIPESEGMENT', globalId: '3xY' };
    const resolverAchse = {
        forElements: () => ({
            async getForm(form) {
                if (form === 'axis') {
                    return { form, perElement: [{ polyline: [[0, 0, 0], [1, 0, 0]], source: 'axisRep', warnings: [] }] };
                }
                return { form, data: null, perElement: [], warnings: [] };
            },
        }),
    };
    const SUBJEKT = {
        globalId: 'S1', anker: { x: 0, y: 3, z: 0 },
        lage: { ost: 100, nord: 200, hoehe: 3 },
        versatz: { x: 100, y: 0, z: -200 },
        lageUmkehrbar: true, anschluesse: [],
    };

    it('die Auswahl (ein Rohr) sperrt schacht-verschieben — das Subjekt öffnet es', async () => {
        const b = useBearbeitung();
        await b.einordne(ROHR, resolverAchse);
        // Ohne Subjekt gilt die Güteschranke der Auswahl: ein Rohr ist kein Schacht.
        expect(b.starte('schacht-verschieben')).toBe(false);
        // Mit Subjekt bürgt der Aufrufer — der Griff im Lageplan.
        expect(b.starte('schacht-verschieben', { subjekt: SUBJEKT })).toBe(true);
        // Die Vorbelegung kommt aus dem SUBJEKT, nicht aus der Auswahl.
        expect(b.werte.ost).toBe(100);
        expect(b.werte.nord).toBe(200);
        b.abbrechen();
    });

    it('der Modus bleibt die erste Sperre — auch mit Subjekt', async () => {
        const b = useBearbeitung();
        b.modusSetzen(false);
        expect(b.starte('schacht-verschieben', { subjekt: SUBJEKT })).toBe(false);
    });
});

// ── 3. Der eine Schreibweg + PDF-Reinheit (Textwächter) ─────────────────────

describe('der Griff schreibt über den EINEN Weg', () => {
    const canvas = fs.readFileSync(`${WURZEL}components/IfcPlanCanvas.vue`, 'utf8');

    it('der Drop läuft über starte → ausfuehren → wendeEintragAn', () => {
        const ablegen = canvas.slice(canvas.indexOf('async function griffAblegen'), canvas.indexOf('// ── Bedienung'));
        expect(ablegen).toContain("bearbeitung.starte('schacht-verschieben'");
        expect(ablegen).toContain('bearbeitung.ausfuehren(');
        expect(ablegen).toContain('api.wendeEintragAn');
        expect(ablegen).toContain('api.lieferstandVon');
        expect(ablegen).toContain("modell: 'geliefert'");
    });

    it('gegriffen wird nur hinter der Bereitschafts-Sperre', () => {
        expect(canvas).toContain('function griffBereit()');
        const bereit = canvas.slice(canvas.indexOf('function griffBereit()'), canvas.indexOf('function griffeLaden'));
        expect(bereit).toContain('bearbeitung.modusAn');
        expect(bereit).toContain('!bearbeitung.scharfId');
        // Der Griff-Zugriff in onZeigerAb steht hinter genau dieser Frage.
        expect(canvas).toContain('if (griffBereit())');
    });

    it('die Griffe entstehen NACH doc.beende() — und der PDF-Exporter kennt sie nicht', () => {
        const beende = canvas.indexOf('doc.beende()');
        const griffAufruf = canvas.indexOf('zeichneGriffe(ctx');
        expect(beende).toBeGreaterThan(-1);
        expect(griffAufruf).toBeGreaterThan(beende);
        const exporter = fs.readFileSync(`${WURZEL}services/IfcPdfExporter.js`, 'utf8');
        expect(exporter).not.toContain('zeichneGriffe');
        expect(exporter).not.toContain('Fanglinien');
    });
});
