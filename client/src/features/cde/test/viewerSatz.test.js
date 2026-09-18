/**
 * Viewer = Satz (Fahrplan S3) — die Verdrahtung.
 *
 * Gemessen vorher (Karte 2026-09-12): ein Satzwechsel setzte die Kennung und
 * lud die Verlaufsebene; kein Modell wurde geladen oder entladen, und das
 * Nachspielen lief erst beim nächsten Laden, einmal je Modell.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { useModellAblage } from '../composables/useModellAblage.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import { repo } from '../services/RepoFacade.js';

const WURZEL = join(process.cwd(), 'src/features/cde/');
const lies = (p) => readFileSync(join(WURZEL, p), 'utf8');
const rumpf = (text, kopf) => { const a = text.indexOf(kopf); return a < 0 ? '' : text.slice(a, text.indexOf('\n}\n', a)); };

describe('der Viewer zeigt den Satz', () => {
    const viewer = lies('components/IfcViewer.vue');

    it('zeigeSatz lädt ohne Nachspielen je Modell und spielt EINMAL am Ende nach', () => {
        const z = rumpf(viewer, 'async function zeigeSatz()');
        expect(z).toContain('ablage.openBySha(sha, { nachspielen: false })');
        expect(z.match(/nachspielen\.nachModellladung\(/g)).toHaveLength(1);
        expect(z).toContain('satzAbgleich(');
        expect(z).toContain('gen === _satzGeneration');
        // Das Laden je Modell fragt, ob es nachspielen soll.
        expect(rumpf(viewer, 'async function _onModelLoaded(')).toContain('if (mitNachspielen) nachspielen.nachModellladung(');
    });

    it('die Ablage reicht „nicht nachspielen“ bis zum Viewer durch', async () => {
        const gerufen = [];
        const engine = { value: {
            getModelList: () => [],
            loadIfc: async () => ({ modelId: 'm1' }),
        } };
        const ablage = useModellAblage({ engine, ifc: {}, cde: { auftrag: null }, onModelLoaded: async (o) => { gerufen.push(o); } });
        vi.spyOn(repo, 'getBlob').mockResolvedValue({ blob: new Blob([new TextEncoder().encode('ISO-10303-21;')]), meta: { name: 'G.ifc' } });
        vi.spyOn(repo, 'setBlob').mockResolvedValue(true);
        expect(await ablage.openBySha('abc', { nachspielen: false })).toBe(true);
        expect(gerufen).toEqual([{ nachspielen: false }]);
        vi.restoreAllMocks();
    });

    it('EIN Weg hinein: „Modell hinzufügen“ — kein „IFC laden“, kein „Hinzufügen“, kein „öffnen“ im Register', () => {
        expect(viewer).toContain('@change="modellHinzufuegen"');
        expect(viewer).not.toMatch(/onFileUpload|> IFC laden|> Hinzufügen/);
        const view = lies('views/CdeView.vue');
        expect(view).not.toMatch(/openDokument|openBySha/);
        // „Zuletzt geöffnet“ nur noch ohne Projekt — mit Projekt bestimmt der Satz.
        expect(viewer).toContain('recentModels.length && !cde.auftrag');
    });
});

describe('die Schale aktiviert einen Satz auf EINEM Weg', () => {
    const view = lies('views/CdeView.vue');

    it('beide Stores, dann zeigt der Viewer — Satzwahl, Löschen und erdbauNeu gehen darüber', () => {
        const a = rumpf(view, 'async function satzAktivieren(');
        expect(a.indexOf('cde.setzeSatz(')).toBeLessThan(a.indexOf('aenderungen.setzeSatz('));
        expect(a.indexOf('aenderungen.setzeSatz(')).toBeLessThan(a.indexOf('satzZeigen()'));
        expect(rumpf(view, 'async function onSatzWaehlen(')).toContain('satzAktivieren(id)');
        expect(rumpf(view, 'async function onSatzLoeschen(')).toContain('satzAktivieren(null)');
        expect(rumpf(view, 'async function erdbauNeu(')).not.toContain('noch einmal klicken');
        expect(rumpf(view, 'async function satzUmschalten(')).toContain('satzZeigen()');
    });

    it('K1: beim Start immer ein Satz — und der Viewer zeigt ihn; die Wiederherstellung gilt nur ohne Projekt', () => {
        const start = rumpf(view, 'async function auftragAusOrdner(');
        expect(start.indexOf('satzSicherstellen()')).toBeLessThan(start.indexOf('satzZeigen()'));
        expect(view).toMatch(/if \(cde\.auftrag\) return;\s+\/\/ mit Projekt zeigt der Viewer den Satz/);
        expect(lies('components/CdeKopfleiste.vue')).not.toContain('ohne Satz');
    });
});

describe('in den Satz, aus dem Satz', () => {
    // Erst den Start des Stores abwarten — er liest Satz und Register nach und überschriebe sonst, was der Test setzt.
    async function store() {
        setActivePinia(createPinia());
        const cde = useCdeStore();
        await cde.ready;
        cde.auftrag = { id: 42069 };
        cde.dokumente = [
            { sha256: 'k1', name: 'Kanal_R01.ifc', basisname: 'Kanal', art: 'modell', revision: 1 },
            { sha256: 'g', name: 'Gelaende.ifc', basisname: 'Gelaende', art: 'modell', revision: 1 },
            { sha256: 'k2', name: 'Kanal_R02.ifc', basisname: 'Kanal', art: 'modell', revision: 2 },
        ];
        cde.saetze = [{ id: 's1', name: 'Nord', enthaelt: ['k1', 'g'] }];
        cde.aktiverSatzId = 's1';
        const gesendet = [];
        vi.spyOn(repo, 'satzAendern').mockImplementation(async (id, patch) => { gesendet.push(patch); return { id, ...patch }; });
        vi.spyOn(repo, 'saetzeLesen').mockImplementation(async () => [{ id: 's1', name: 'Nord', enthaelt: gesendet.at(-1)?.enthaelt ?? [] }]);
        Object.defineProperty(repo, 'remote', { configurable: true, get: () => true });
        return { cde, gesendet };
    }

    it('eine neue Revision ersetzt die alte AN IHRER STELLE (K6) — die Reihenfolge und der Weltrahmen bleiben', async () => {
        const { cde, gesendet } = await store();
        const r = await cde.nimmInSatzAuf('k2');
        expect(r.ersetzt).toEqual(['Kanal_R01.ifc']);
        expect(gesendet.at(-1).enthaelt).toEqual(['k2', 'g']);
        vi.restoreAllMocks(); delete repo.remote;
    });

    it('× nimmt aus dem Satz, die Datei bleibt im Register', async () => {
        const { cde, gesendet } = await store();
        expect(await cde.nimmAusSatz('g')).toBe(true);
        expect(gesendet.at(-1).enthaelt).toEqual(['k1']);
        expect(cde.dokumente.map(d => d.sha256)).toContain('g');
        vi.restoreAllMocks(); delete repo.remote;
    });
});
