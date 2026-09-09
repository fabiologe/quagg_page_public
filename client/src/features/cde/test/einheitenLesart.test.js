// @vitest-environment jsdom
/**
 * Die Lesart „in Metern" und das Abgeleitete (2026-09-07).
 *
 * Gemessen an Fabios Planungsdatei kostete ein Start mit Umrechnung zwei
 * volle Ladevorgänge plus drei Sekunden Umschreiben — bei JEDEM Start, weil
 * die Entscheidung nirgends stand. Und der fragments-Importer (1,4 s) lief
 * jedes Mal neu, obwohl sein Ergebnis 0,6 MB gross ist.
 *
 * Die Zusagen hier:
 *   - die Lesart wird je Prüfsumme des ORIGINALS gemerkt und gilt auf jedem
 *     Ladeweg — ohne Banner, ohne Klick;
 *   - Meter-Bytes und Fragmentdatei liegen nach dem ersten Mal in der
 *     Ablage und werden beim nächsten Mal gelesen statt gerechnet;
 *   - Abgeleitetes hängt am Original: gelöscht oder verdrängt → weg;
 *   - Zurücknehmen löscht Entscheidung und Meter-Seite und lädt das Original.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const speicher = new Map();
const blobs = new Map();
vi.mock('../services/RepoFacade.js', () => ({
    fehlerLesbar: (f) => ({ text: String(f?.message ?? f) }),
    repo: {
        get: async (k) => speicher.get(k) ?? null,
        set: async (k, v) => { speicher.set(k, v); },
        getBlob: async (k) => blobs.get(k) ?? null,
        setBlob: async (k, blob, meta) => { blobs.set(k, { blob, meta }); return true; },
        listBlobs: async (praefix) => [...blobs.entries()].filter(([k]) => k.startsWith(praefix)).map(([key, v]) => ({ key, meta: v.meta })),
        deleteBlob: async (k) => { blobs.delete(k); },
        letzterFehler: null, fehlerQuittieren() {},
    },
}));

import { REPO_KEY_LESART, useModellAblage } from '../composables/useModellAblage.js';

const bytesVon = (text) => new TextEncoder().encode(text);
/** Ein abgelegter Blob, wie ihn die Ablage liefert — mit `arrayBuffer`, das jsdom fehlt. */
const blobAus = (u8) => ({ arrayBuffer: async () => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) });
function ablegen(key, u8, meta = {}) { blobs.set(key, { blob: blobAus(u8), meta }); }
async function shaVon(u8) {
    const { computeModelIdentity } = await import('../services/ModelIdentity.js');
    return (await computeModelIdentity(u8, 'x.ifc')).sha256;
}

/** Engine-Doppel in der Form der Wirklichkeit: loadIfc protokolliert, was es bekam. */
function engineDoppel() {
    const aufrufe = [];
    let n = 0;
    const offen = [];
    const berichte = new Map();
    const meterBytesMap = new Map();
    const fragMap = new Map();
    return {
        aufrufe,
        value: {
            async loadIfc(bytes, name, opts) {
                const modelId = `m${++n}`;
                aufrufe.push({ bytes, name, ...opts });
                offen.push({ modelId, name });
                if (opts.meterBytes) berichte.set(modelId, { ok: true, weg: 'ablage' });
                else if (opts.inMeter) {
                    berichte.set(modelId, { ok: true, weg: 'worker', faktor: 0.001 });
                    meterBytesMap.set(modelId, bytesVon('METER ' + name));
                }
                fragMap.set(modelId, opts.frag?.puffer
                    ? { puffer: null, ausAblage: true }
                    : { puffer: new Uint8Array([7, 7, 7]), ausAblage: false });
                return { modelId };
            },
            async unloadModel(id) { const i = offen.findIndex(o => o.modelId === id); if (i >= 0) offen.splice(i, 1); },
            getModelList: () => offen,
            einheitsUmrechnung: (id) => berichte.get(id) ?? null,
            einheitsBytes: (id) => { const b = meterBytesMap.get(id) ?? null; meterBytesMap.delete(id); return b; },
            fragmentPuffer: (id) => { const f = fragMap.get(id) ?? null; fragMap.delete(id); return f ? { ...f, offset: { x: 1, y: 2, z: 3 } } : null; },
        },
    };
}

function bau() {
    const engine = engineDoppel();
    const ablage = useModellAblage({ engine, ifc: {}, cde: { auftrag: null }, onModelLoaded: async () => {} });
    return { engine, ablage };
}
const tick = () => new Promise(r => setTimeout(r, 5));

beforeEach(() => { speicher.clear(); blobs.clear(); });

describe('Die Lesart wird gemerkt und gilt auf jedem Ladeweg', () => {
    it('nach „In Meter umrechnen" steht die Entscheidung je Prüfsumme, und die Meter-Bytes liegen ab', async () => {
        const orig = bytesVon('ISO-10303-21; MILLI');
        const sha = await shaVon(orig);
        ablegen(`model:${sha}`, orig, { name: 'boden.ifc' });
        const { engine, ablage } = bau();
        await ablage.openRecent({ key: `model:${sha}` });
        expect(engine.aufrufe[0]).toMatchObject({ inMeter: false, meterBytes: null });

        const r = await ablage.ladeInMeterNeu('m1');
        expect(r.ok).toBe(true);
        expect(engine.aufrufe[1]).toMatchObject({ inMeter: true, meterBytes: null });
        expect(speicher.get(REPO_KEY_LESART)?.[sha]).toMatchObject({ faktor: 0.001 });
        await tick();
        expect(blobs.has(`meter:${sha}`)).toBe(true);          // die Meter-Bytes liegen ab
        expect(blobs.get(`meter:${sha}`).meta).toMatchObject({ abgeleitetVon: sha, faktor: 0.001 });
    });

    it('der nächste Ladevorgang liest in Metern AUS DER ABLAGE — keine Umrechnung, kein Banner', async () => {
        const orig = bytesVon('ISO-10303-21; MILLI');
        const sha = await shaVon(orig);
        ablegen(`model:${sha}`, orig, { name: 'boden.ifc' });
        speicher.set(REPO_KEY_LESART, { [sha]: { wann: 1, faktor: 0.001 } });
        ablegen(`meter:${sha}`, bytesVon('METER boden'), { abgeleitetVon: sha });
        const { engine, ablage } = bau();
        await ablage.openRecent({ key: `model:${sha}` });
        const a = engine.aufrufe[0];
        expect(a.inMeter).toBe(true);
        expect(new TextDecoder().decode(a.meterBytes)).toBe('METER boden');
        // Die Identität kam trotzdem aus den ORIGINALBYTES: die Rohbytes gehen weiter mit.
        expect(new TextDecoder().decode(a.bytes)).toContain('MILLI');
        expect(engine.value.einheitsUmrechnung('m1')).toMatchObject({ ok: true, weg: 'ablage' });
    });

    it('ohne Lesart bleibt alles wie vorher: Millimeter, Banner, Klick', async () => {
        const orig = bytesVon('ISO-10303-21; MILLI');
        const sha = await shaVon(orig);
        ablegen(`model:${sha}`, orig, { name: 'boden.ifc' });
        const { engine, ablage } = bau();
        await ablage.openRecent({ key: `model:${sha}` });
        expect(engine.aufrufe[0].inMeter).toBe(false);
        expect(engine.value.einheitsUmrechnung('m1')).toBeNull();
    });
});

describe('Die Fragmentdatei liegt nach dem ersten Mal ab', () => {
    it('erster Start: Importer läuft, die Fragmentdatei wird mit RAHMEN abgelegt; zweiter Start: sie wird gelesen', async () => {
        const orig = bytesVon('ISO-10303-21; METRE');
        const sha = await shaVon(orig);
        ablegen(`model:${sha}`, orig, { name: 'kanal.ifc' });
        const { engine, ablage } = bau();
        await ablage.openRecent({ key: `model:${sha}` });
        expect(engine.aufrufe[0].frag).toBeNull();
        await tick();
        const f = blobs.get(`frag:${sha}`);
        expect(f).toBeTruthy();
        expect(f.meta).toMatchObject({ inMeter: false, offset: { x: 1, y: 2, z: 3 }, abgeleitetVon: sha });

        // Zweiter Start — aus der Ablage, mit dem Rahmen zur Gegenprobe.
        blobs.set(`frag:${sha}`, { blob: blobAus(new Uint8Array([7, 7, 7])), meta: f.meta });
        const zwei = bau();
        await zwei.ablage.openRecent({ key: `model:${sha}` });
        expect(zwei.engine.aufrufe[0].frag).toMatchObject({ offset: { x: 1, y: 2, z: 3 } });
        expect(zwei.engine.aufrufe[0].frag.puffer).toBeInstanceOf(ArrayBuffer);
        await tick();
        // Aus der Ablage gekommen ⇒ nicht erneut geschrieben (derselbe Eintrag bleibt).
        expect(blobs.get(`frag:${sha}`).meta).toBe(f.meta);
    });

    it('in Metern hat die Fragmentdatei einen EIGENEN Schlüssel — die aus Millimetern passt nicht', async () => {
        const orig = bytesVon('ISO-10303-21; MILLI');
        const sha = await shaVon(orig);
        ablegen(`model:${sha}`, orig, { name: 'boden.ifc' });
        ablegen(`frag:${sha}`, new Uint8Array([1]), { inMeter: false });          // aus Millimetern
        speicher.set(REPO_KEY_LESART, { [sha]: { wann: 1 } });
        const { engine, ablage } = bau();
        await ablage.openRecent({ key: `model:${sha}` });
        expect(engine.aufrufe[0].frag).toBeNull();                               // frag:<sha>:m gibt es noch nicht
        await tick();
        expect(blobs.has(`frag:${sha}:m`)).toBe(true);
        expect(blobs.get(`frag:${sha}:m`).meta.inMeter).toBe(true);
    });
});

describe('Abgeleitetes hängt am Original', () => {
    it('Löschen aus „Zuletzt geöffnet" nimmt Meter-Bytes und Fragmentdateien mit', async () => {
        ablegen('model:abc', bytesVon('x'), { name: 'a.ifc' });
        ablegen('meter:abc', bytesVon('m'), {});
        ablegen('frag:abc', new Uint8Array([1]), {});
        ablegen('frag:abc:m', new Uint8Array([2]), {});
        const { ablage } = bau();
        await ablage.deleteRecent({ key: 'model:abc' });
        expect([...blobs.keys()].filter(k => k.includes('abc'))).toEqual([]);
    });

    it('„Zuletzt geöffnet" zeigt NUR Modelle — Abgeleitetes hat andere Präfixe', async () => {
        ablegen('model:abc', bytesVon('x'), { name: 'a.ifc', savedAt: 5 });
        ablegen('meter:abc', bytesVon('m'), { savedAt: 9 });
        ablegen('frag:abc', new Uint8Array([1]), { savedAt: 9 });
        const { ablage } = bau();
        await ablage.aktualisiereZuletzt();
        expect(ablage.recentModels.value.map(r => r.key)).toEqual(['model:abc']);
    });

    it('Zurücknehmen löscht Entscheidung und Meter-Seite, lässt die Millimeter-Fragmentdatei und lädt das Original', async () => {
        const orig = bytesVon('ISO-10303-21; MILLI');
        const sha = await shaVon(orig);
        ablegen(`model:${sha}`, orig, { name: 'boden.ifc' });
        ablegen(`meter:${sha}`, bytesVon('METER'), {});
        ablegen(`frag:${sha}:m`, new Uint8Array([2]), {});
        ablegen(`frag:${sha}`, new Uint8Array([1]), { offset: null });
        speicher.set(REPO_KEY_LESART, { [sha]: { wann: 1 } });
        const { engine, ablage } = bau();
        await ablage.openRecent({ key: `model:${sha}` });
        expect(engine.aufrufe[0].inMeter).toBe(true);

        const r = await ablage.lesartZuruecknehmen(sha);
        expect(r).toMatchObject({ ok: true, neuGeladen: true });
        expect(speicher.get(REPO_KEY_LESART)?.[sha]).toBeUndefined();
        expect(blobs.has(`meter:${sha}`)).toBe(false);
        expect(blobs.has(`frag:${sha}:m`)).toBe(false);
        expect(blobs.has(`frag:${sha}`)).toBe(true);
        expect(engine.aufrufe[1].inMeter).toBe(false);
    });
});

describe('WÄCHTER: Engine-Seite', () => {
    const lies = (p) => readFileSync(resolve(process.cwd(), 'src/features/cde', p), 'utf8');
    it('die abgelegte Fragmentdatei wird am KOORDINATIONSPUNKT geprüft und sonst neu importiert', () => {
        // Nicht mehr an `object.position` — die ist beim ersten Modell immer
        // null (2026-09-08, siehe `ladeversatzAus`). Der Punkt steckt in der
        // Fragmentdatei selbst; eine Ablage ohne ihn wird neu importiert.
        const e = lies('services/IfcEngine.js');
        const ab = e.indexOf('async _fragmenteLaden(');
        const rumpf = e.slice(ab, e.indexOf('async _modellVerwerfen', ab));
        expect(rumpf).toContain('fragments.core.settings.autoCoordinate = true');
        expect(rumpf).toMatch(/const ist = await model\.getCoordinates\(\)/);
        expect(rumpf).toMatch(/const soll = frag\.koordinaten/);
        expect(rumpf).not.toMatch(/-p\.x - soll\.x/);
        expect(rumpf).toContain('await this._modellVerwerfen(model)');
        expect(rumpf).toContain('new FRAGS.IfcImporter()');
        expect(rumpf).toContain("fragments.core.load(puffer, { modelId: name })");
    });
    it('Meter-Bytes und Fragmentdatei sind EINMAL abholbar und sterben mit dem Modell', () => {
        const e = lies('services/IfcEngine.js');
        expect(e).toMatch(/fragmentPuffer\(modelId\) \{[\s\S]{0,200}this\._fragPuffer\.delete\(modelId\)/);
        expect(e).toMatch(/einheitsBytes\(modelId\) \{[\s\S]{0,200}this\._einheitsBytes\.delete\(modelId\)/);
        const ab = e.indexOf('async unloadModel(');
        expect(e.slice(ab, ab + 1500)).toContain('this._fragPuffer.delete(modelId)');
    });
});
