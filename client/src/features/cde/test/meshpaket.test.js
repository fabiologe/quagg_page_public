/**
 * Das Meshpaket und das Server-Backend (Teil XIV, G7).
 *
 * Die Golden-Datei `fixtures/meshpaket_v1.bin` hat PYTHON geschrieben
 * (`core/geometrie.schreibe_meshpaket`): Box(2) minus Box(1). Hier wird sie
 * gelesen, und was wir lesen, packen wir BYTEIDENTISCH zurück — derselbe
 * Vertrag von beiden Seiten. Das Server-Backend läuft gegen einen Transport
 * aus Attrappen, die Pakete in genau diesem Format zurückgeben.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { packeMeshpaket, entpackeMeshpaket, koerperAusAntwort } from '../services/geometrie/Meshpaket.js';
import { erzeugeServerBackend } from '../services/geometrie/KernelServer.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';

const GOLDEN = readFileSync(new URL('./fixtures/meshpaket_v1.bin', import.meta.url));
const goldenPuffer = () => GOLDEN.buffer.slice(GOLDEN.byteOffset, GOLDEN.byteOffset + GOLDEN.byteLength);

function koerperAus(bloecke, name) {
    const positions = bloecke.get(name);
    return { positions, triCount: positions.length / 9, closed: true, volumen: 0, warnungen: [] };
}

describe('Meshpaket', () => {
    it('liest die Golden-Datei aus Python: zwei Körper à 12 Dreiecke, Schlitze a/b', () => {
        const { kopf, bloecke } = entpackeMeshpaket(goldenPuffer());
        expect(kopf).toMatchObject({ version: 1, op: 'booleDifferenz', eingaben: { a: 'a', b: 'b' } });
        expect([...bloecke.keys()]).toEqual(['a', 'b']);
        expect(bloecke.get('a').length).toBe(12 * 9);
        expect(bloecke.get('a')).toBeInstanceOf(Float64Array);
        // Box(2) um den Ursprung: alle Koordinaten ±1
        expect(Math.max(...bloecke.get('a'))).toBeCloseTo(1, 12);
        expect(Math.min(...bloecke.get('a'))).toBeCloseTo(-1, 12);
    });

    it('packt dieselben Daten BYTEIDENTISCH — der Client schreibt, was Python schreibt', () => {
        const { kopf, bloecke } = entpackeMeshpaket(goldenPuffer());
        const wieder = packeMeshpaket({
            op: kopf.op, parameter: kopf.parameter,
            eingaben: { a: koerperAus(bloecke, 'a'), b: koerperAus(bloecke, 'b') },
            formen: { a: 'koerper', b: 'koerper' },
        });
        expect(Buffer.from(wieder).equals(GOLDEN)).toBe(true);
    });

    it('Listen-Schlitze werden zu nummerierten Blöcken; Punktlisten zu 3 Werten je Punkt', () => {
        const k = koerperAus(entpackeMeshpaket(goldenPuffer()).bloecke, 'b');
        const p = packeMeshpaket({ op: 'kollisionen', eingaben: { koerper: [k, k] }, formen: { koerper: 'koerper[]' } });
        const { kopf, bloecke } = entpackeMeshpaket(p);
        expect(kopf.eingaben).toEqual({ koerper: ['koerper[0]', 'koerper[1]'] });
        expect(bloecke.get('koerper[1]').length).toBe(12 * 9);
        const l = packeMeshpaket({ op: 'x', eingaben: { linie: { punkte: [{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }] } }, formen: { linie: 'linie' } });
        const e = entpackeMeshpaket(l);
        expect(e.kopf.bloecke[0]).toEqual({ name: 'linie', form: 'linie', n: 2 });
        expect([...e.bloecke.get('linie')]).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('Formbrüche werfen mit Grund: zu kurz, falsche Version, Rest ohne Block', () => {
        expect(() => entpackeMeshpaket(new ArrayBuffer(2))).toThrow(/zu kurz/);
        const falsch = packeMeshpaket({ op: 'x', eingaben: {}, formen: {} });
        const bytes = new Uint8Array(falsch);
        const kopf = JSON.parse(new TextDecoder().decode(bytes.subarray(4)));
        kopf.version = 2;
        const kb = new TextEncoder().encode(JSON.stringify(kopf));
        const p2 = new Uint8Array(4 + kb.length);
        new DataView(p2.buffer).setUint32(0, kb.length, true);
        p2.set(kb, 4);
        expect(() => entpackeMeshpaket(p2.buffer)).toThrow(/Version 2/);
        const rest = new Uint8Array(falsch.byteLength + 8);
        rest.set(bytes, 0);
        expect(() => entpackeMeshpaket(rest.buffer)).toThrow(/ohne Block/);
    });
});

/** Ein Server aus Attrappen: antwortet im Meshpaket-Format. */
function fakeServer({ ops = ['booleDifferenz', 'kollisionen'], antwort } = {}) {
    const hole = vi.fn(async (pfad) => {
        if (!pfad.endsWith('/faehigkeiten')) throw new Error('404');
        return { version: 1, ops, limits: { maxDreiecke: 1000, timeoutS: 30 }, engine: 'fake' };
    });
    const sende = vi.fn(async (pfad, puffer) => antwort(entpackeMeshpaket(puffer)));
    return { hole, sende };
}
function antwortKoerper(positions, volumen) {
    return packeMeshpaket({ op: 'antwort', eingaben: {}, formen: {} }) && _packeAntwort({ ok: true, ergebnis: { form: 'koerper', block: 'ergebnis', closed: true, volumen }, warnungen: [] }, positions);
}
function _packeAntwort(kopf, positions = null) {
    const bloecke = positions ? [{ name: 'ergebnis', form: 'koerper', triCount: positions.length / 9 }] : [];
    const kb = new TextEncoder().encode(JSON.stringify({ version: 1, ...kopf, bloecke }));
    const gesamt = 4 + kb.length + (positions ? positions.byteLength : 0);
    const p = new Uint8Array(gesamt);
    new DataView(p.buffer).setUint32(0, kb.length, true);
    p.set(kb, 4);
    if (positions) p.set(new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength), 4 + kb.length);
    return p.buffer;
}

describe('erzeugeServerBackend', () => {
    const { bloecke } = entpackeMeshpaket(goldenPuffer());
    const A = koerperAus(bloecke, 'a'), B = koerperAus(bloecke, 'b');

    it('ohne Transport kein Backend; vor bereit() nur ein Grund, danach die Liste des Servers', async () => {
        expect(erzeugeServerBackend({})).toBeNull();
        const s = erzeugeServerBackend(fakeServer({ antwort: () => _packeAntwort({ ok: true, ergebnis: null, warnungen: [] }) }));
        expect(s.kann('booleDifferenz')).toMatchObject({ ok: false, grund: expect.stringContaining('noch nicht befragt') });
        expect(await s.bereit()).toBe(true);
        expect(s.kann('booleDifferenz')).toEqual({ ok: true });
        expect(s.kann('huelle').ok).toBe(false);          // der Fake kennt es nicht
    });

    it('ein unerreichbarer Server sperrt mit Grund — und der Kernel gibt null statt zu werfen', async () => {
        const hole = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
        const s = erzeugeServerBackend({ hole, sende: vi.fn() });
        const k = erzeugeKernel({ server: s });
        const r = await k.op('booleDifferenz', { a: A, b: B });
        expect(r.ergebnis).toBeNull();
        expect(r.provenienz.backend).toBe('keins');
        expect(r.warnungen[0]).toMatch(/nicht erreichbar/);
        expect(k.kann('booleDifferenz').grund).toMatch(/ECONNREFUSED/);
    });

    it('booleDifferenz: das Paket geht als Meshpaket hinaus, der Körper kommt mit Attest zurück', async () => {
        const server = fakeServer({ antwort: () => antwortKoerper(A.positions, 7) });
        const k = erzeugeKernel({ server: erzeugeServerBackend(server) });
        const r = await k.op('booleDifferenz', { a: A, b: B });
        expect(r.provenienz.backend).toBe('server');
        expect(r.ergebnis).toMatchObject({ closed: true, volumen: 7, triCount: 12 });
        expect(server.sende).toHaveBeenCalledTimes(1);
        const gesendet = entpackeMeshpaket(server.sende.mock.calls[0][1]);
        expect(gesendet.kopf).toMatchObject({ op: 'booleDifferenz', eingaben: { a: 'a', b: 'b' } });
        expect(Buffer.from(server.sende.mock.calls[0][1]).equals(GOLDEN)).toBe(true);   // exakt das Python-Paket
    });

    it('eine fachliche Ablehnung (422) ist KEIN Wurf: null + Grund; Kollisionen kommen als Paare', async () => {
        const abgelehnt = fakeServer({ antwort: () => { const e = new Error('Request failed'); e.response = { status: 422, data: { detail: 'a: kein geschlossener Koerper' } }; throw e; } });
        const k1 = erzeugeKernel({ server: erzeugeServerBackend(abgelehnt) });
        const r1 = await k1.op('booleDifferenz', { a: A, b: B });
        expect(r1.ergebnis).toBeNull();
        expect(r1.warnungen[0]).toBe('server_422: a: kein geschlossener Koerper');

        const paare = fakeServer({ antwort: () => _packeAntwort({ ok: true, ergebnis: { form: 'paare', paare: [{ a: 0, b: 1, volumen: 1 }] }, warnungen: [] }) });
        const k2 = erzeugeKernel({ server: erzeugeServerBackend(paare) });
        const r2 = await k2.op('kollisionen', { koerper: [A, B] });
        expect(r2.ergebnis).toEqual([{ a: 0, b: 1, volumen: 1 }]);
    });

    it('über dem Server-Limit wird gar nicht erst gesendet', async () => {
        const server = fakeServer({ antwort: () => antwortKoerper(A.positions, 7) });
        const s = erzeugeServerBackend(server);
        const gross = { ...A, triCount: 5000 };
        const r = await s.op('booleDifferenz', { a: gross, b: B });
        expect(r.ergebnis).toBeNull();
        expect(r.warnungen[0]).toMatch(/server_zu_gross/);
        expect(server.sende).not.toHaveBeenCalled();
    });

    it('koerperAusAntwort liefert null, wenn der Block fehlt', () => {
        expect(koerperAusAntwort({ ergebnis: { form: 'koerper', block: 'x' } }, new Map())).toBeNull();
    });
});

describe('Eine Liste am Einzel-Schlitz (B3-Nachprüfung)', () => {
    it('booleDifferenz mit b = [Rohr, Rohr] reist als Liste — der Kopf nennt die Blöcke, das Entpacken liefert sie zurück', () => {
        const k = (o) => ({ positions: new Float64Array([o, 0, 0, o + 1, 0, 0, o, 1, 0]), triCount: 1, closed: true, volumen: 0, warnungen: [] });
        const paket = packeMeshpaket({ op: 'booleDifferenz', eingaben: { a: k(0), b: [k(10), k(20)] }, formen: { a: 'koerper', b: 'koerper' } });
        const { kopf, bloecke } = entpackeMeshpaket(paket);
        expect(Array.isArray(kopf.eingaben.b)).toBe(true);
        expect(kopf.eingaben.b).toHaveLength(2);
        expect(kopf.bloecke.map(b => b.form)).toEqual(['koerper', 'koerper', 'koerper']);
        const zweiter = bloecke instanceof Map ? bloecke.get(kopf.eingaben.b[1]) : bloecke[kopf.eingaben.b[1]];
        expect(zweiter[0]).toBe(20);
    });
});
