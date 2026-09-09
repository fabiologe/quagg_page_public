// @vitest-environment jsdom
/**
 * Zuletzt offene Modelle beim Öffnen zurückholen (2026-09-03).
 *
 * Fabios Wunsch: „wenn man die CDE lädt, sollte das letzte Modell, das man
 * offen hatte, automatisch mitgeladen werden." Gemerkt wird die MENGE, nicht
 * das einzelne Modell — wer zwei nebeneinander offen hatte, will beide.
 *
 * Die drei Zusagen, die hier hängen:
 *   - DIESELBE REIHENFOLGE. Das erste Modell bestimmt den Welt-Rahmen
 *     (COORDINATE_TO_ORIGIN); eine andere Reihenfolge hiesse ein anderer
 *     Ladeversatz für jeden gespeicherten Anker im Journal.
 *   - VORRANG für alles, was schon offen ist (Deep-Link, Registerklick).
 *   - Ein fehlender Blob wird GEMELDET. Die Ablage hält nur die letzten fünf;
 *     ein still fehlendes Modell wäre genau die Sorte Lücke, die niemand
 *     bemerkt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Repo-Doppel: nur was die Ablage wirklich anfasst. */
const speicher = new Map();
const blobs = new Map();
vi.mock('../services/RepoFacade.js', () => ({
    fehlerLesbar: (f) => ({ text: String(f?.message ?? f) }),
    repo: {
        get: async (k) => speicher.get(k) ?? null,
        set: async (k, v) => { speicher.set(k, v); },
        getBlob: async (k) => blobs.get(k) ?? null,
        setBlob: async (k, blob, meta) => { blobs.set(k, { blob, meta }); },
        listBlobs: async () => [...blobs.entries()].map(([key, v]) => ({ key, meta: v.meta })),
        deleteBlob: async (k) => { blobs.delete(k); },
    },
}));

import { REPO_KEY_OFFEN, useModellAblage } from '../composables/useModellAblage.js';

/** Ein Blob, wie ihn die Ablage liefert — mit `arrayBuffer`, das jsdom fehlt. */
function ablegen(sha, name, inhalt = 'ISO-10303-21;') {
    const bytes = new TextEncoder().encode(`${inhalt} ${name}`);
    blobs.set(`model:${sha}`, {
        blob: { arrayBuffer: async () => bytes.buffer },
        meta: { name, savedAt: Date.now() },
    });
}

function bau() {
    const offen = [];        // was im Viewer steht
    const geladen = [];      // Protokoll der Ladevorgänge — getrennt, sonst
                             // leert ein Zurücksetzen auch die Modellliste
    const engine = { value: {
        getModelList: () => offen.map((n, i) => ({ modelId: `m${i}`, name: n })),
        loadIfc: async (_bytes, name) => { offen.push(name); geladen.push(name); return { modelId: `m${offen.length - 1}` }; },
    } };
    const ablage = useModellAblage({
        engine,
        ifc: {},
        cde: { auftrag: null },
        onModelLoaded: async () => {},
    });
    return { ablage, geladen, offen, engine };
}

beforeEach(() => { speicher.clear(); blobs.clear(); });

describe('merkeOffene', () => {
    it('schreibt Kennung und Name der offenen Modelle — und niemals Bytes', async () => {
        const { ablage, engine } = bau();
        ablegen('aaa', 'Gelaende.ifc');
        ablegen('bbb', 'Kanal.ifc');
        await ablage.openRecent({ key: 'model:aaa' });
        await ablage.openRecent({ key: 'model:bbb' });

        await ablage.merkeOffene();
        const gemerkt = speicher.get(REPO_KEY_OFFEN);
        expect(gemerkt.map(m => m.name)).toEqual(['Gelaende.ifc', 'Kanal.ifc']);
        expect(gemerkt.every(m => typeof m.sha256 === 'string' && m.sha256.length === 64)).toBe(true);
        expect(JSON.stringify(gemerkt)).not.toMatch(/ISO-10303/);
        void engine;
    });

    it('ein Modell ohne Kennung wird nicht gemerkt — zurückholen liesse es sich nicht', async () => {
        const { ablage } = bau();
        // Nichts geladen ⇒ keine Identität bekannt.
        await ablage.merkeOffene();
        expect(speicher.get(REPO_KEY_OFFEN)).toEqual([]);
    });
});

describe('stelleOffeneWiederHer', () => {
    it('holt beide zurück — in DERSELBEN Reihenfolge', async () => {
        ablegen('aaa', 'Gelaende.ifc');
        ablegen('bbb', 'Kanal.ifc');
        speicher.set(REPO_KEY_OFFEN, [{ sha256: 'aaa', name: 'Gelaende.ifc' }, { sha256: 'bbb', name: 'Kanal.ifc' }]);

        const { ablage, geladen } = bau();
        const r = await ablage.stelleOffeneWiederHer();
        expect(r.geladen).toBe(2);
        expect(geladen).toEqual(['Gelaende.ifc', 'Kanal.ifc']);
    });

    it('tut NICHTS, wenn schon etwas offen ist — der Deep-Link hat Vorrang', async () => {
        ablegen('aaa', 'Gelaende.ifc');
        speicher.set(REPO_KEY_OFFEN, [{ sha256: 'aaa', name: 'Gelaende.ifc' }]);
        const { ablage, geladen } = bau();
        await ablage.openRecent({ key: 'model:aaa' });      // „Deep-Link"
        geladen.length = 0;

        const r = await ablage.stelleOffeneWiederHer();
        expect(r).toMatchObject({ geladen: 0, grund: 'schon_offen' });
        expect(geladen).toEqual([]);
    });

    it('ein fehlender Blob wird GEMELDET, die übrigen laden trotzdem', async () => {
        ablegen('bbb', 'Kanal.ifc');                         // „aaa" ist aus der Ablage gefallen
        speicher.set(REPO_KEY_OFFEN, [{ sha256: 'aaa', name: 'Gelaende.ifc' }, { sha256: 'bbb', name: 'Kanal.ifc' }]);

        const { ablage, geladen } = bau();
        const r = await ablage.stelleOffeneWiederHer();
        expect(r.geladen).toBe(1);
        expect(r.fehlend).toEqual(['Gelaende.ifc']);
        expect(geladen).toEqual(['Kanal.ifc']);
        expect(ablage.ablageHinweis.value).toMatch(/Gelaende\.ifc/);
    });

    it('ohne Gemerktes passiert nichts und niemand wird belästigt', async () => {
        const { ablage, geladen } = bau();
        expect(await ablage.stelleOffeneWiederHer()).toMatchObject({ geladen: 0, grund: 'nichts_gemerkt' });
        expect(geladen).toEqual([]);
        expect(ablage.ablageHinweis.value).toBeNull();
    });
});

describe('WÄCHTER: die Verklebung', () => {
    const lies = (p) => require('node:fs').readFileSync(require('node:path').resolve(process.cwd(), 'src/features/cde', p), 'utf8');

    it('jede Änderung der Modellmenge merkt sich den Stand', () => {
        const viewer = lies('components/IfcViewer.vue');
        const ab = viewer.indexOf('async function _modellmengeNachziehen()');
        expect(viewer.slice(ab, ab + 1800)).toContain('ablage.merkeOffene()');
    });

    it('die Schale holt sie NACH dem Auftrag zurück — sonst spielt das Journal gegen einen leeren Satz nach', () => {
        const view = lies('views/CdeView.vue');
        expect(view).toMatch(/auftragAusOrdner\(\)\s*\.finally\(\(\)\s*=>\s*\{[\s\S]{0,200}stelleOffeneWiederHer/);
    });
});

/**
 * Eine abgewiesene Ladung MUSS sich melden (2026-09-09).
 *
 * `_mitSperre` gab bei laufender Ladung `false` zurück und tat sonst nichts:
 * kein Modell, keine Meldung, kein Fehler in der Konsole. Beim Start ist das
 * der Regelfall — dann läuft die Wiederherstellung —, und die Sekunden davor
 * sieht die Oberfläche fertig aus. Mir ist es beim Testen dreimal passiert,
 * bis ich `loading` gemessen hatte; als Nutzer meldet man „das zweite Modell
 * lädt einfach nicht".
 */
describe('die Ladesperre schweigt nicht', () => {
    /** Eine Ladung, die erst auf Kommando fertig wird. */
    function bauMitBremse() {
        const geladen = [];
        let loesen;
        const bremse = new Promise((r) => { loesen = r; });
        const engine = { value: {
            getModelList: () => geladen.map((n, i) => ({ modelId: `m${i}`, name: n })),
            loadIfc: async (_b, name) => { await bremse; geladen.push(name); return { modelId: `m${geladen.length}` }; },
        } };
        const ablage = useModellAblage({ engine, ifc: {}, cde: { auftrag: null }, onModelLoaded: async () => {} });
        return { ablage, geladen, loesen: () => loesen() };
    }

    const datei = (name) => ({
        target: { files: [{ name, arrayBuffer: async () => new TextEncoder().encode('ISO-10303-21;').buffer }], value: '' },
    });

    it('der zweite Ladeversuch wird abgewiesen UND gemeldet', async () => {
        const { ablage, geladen, loesen } = bauMitBremse();
        const ersteLadung = ablage.onFileUpload(datei('Gelaende.ifc'));
        await Promise.resolve();
        expect(ablage.loading.value).toBe(true);

        // Der zweite Klick, während die erste Ladung noch läuft.
        await ablage.onFileUploadAdd(datei('Kanal.ifc'));
        expect(ablage.ablageHinweis.value).toMatch(/wird gerade ein Modell geladen/i);
        expect(geladen).not.toContain('Kanal.ifc');

        loesen();
        await ersteLadung;
        expect(geladen).toEqual(['Gelaende.ifc']);
        expect(ablage.loading.value).toBe(false);
    });

    it('nach dem Ende geht der zweite Versuch durch', async () => {
        const { ablage, geladen, loesen } = bauMitBremse();
        const ersteLadung = ablage.onFileUpload(datei('Gelaende.ifc'));
        await Promise.resolve();
        loesen();
        await ersteLadung;

        await ablage.onFileUploadAdd(datei('Kanal.ifc'));
        expect(geladen).toEqual(['Gelaende.ifc', 'Kanal.ifc']);
    });

    it('die Datei-Knöpfe sind während des Ladens gesperrt', () => {
        // Zweiter Weg, damit es gar nicht erst passiert: ein Klick, der
        // nichts tut, ist schlimmer als ein grauer Knopf.
        // jsdom liefert kein `file:`-`import.meta.url` — derselbe Weg wie
        // beim Wächter weiter oben.
        const quelle = readFileSync(
            resolve(process.cwd(), 'src/features/cde/components/IfcViewer.vue'), 'utf8');
        const eingaben = quelle.match(/<input type="file"[^>]*>/g) ?? [];
        expect(eingaben.length).toBeGreaterThanOrEqual(2);
        for (const e of eingaben) expect(e).toContain(':disabled="ablage.loading.value"');
        expect(quelle).toContain('.action-btn.laedt');
    });
});
