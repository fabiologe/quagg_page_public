// @vitest-environment node
/**
 * ProVI-Proxys bekommen Achsen und Knoten (Tragfähig, T6, 2026-09-24).
 *
 * Gemessen im Browser am 24.09.: das Kanalmodell `IFCOUT_Entwässerung Export`
 * lieferte 0 Achsen und 0 Knoten — 18 Haltungen und 19 Schächte als Proxy,
 * nur Brep, alle Platzierungen auf dem Ursprung. Der Längsschnitt blieb
 * gesperrt, die Prüfliste leer.
 *
 * Geprüft wird die ECHTE Schnittstelle: die echte Datei durch `IfcQuelle`,
 * die echte `leseAchsen`, das echte Netz (`netzVon`) — nur ohne WebGL.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IfcQuelle } from '../services/IfcQuelle.js';
import { IfcEngine } from '../services/IfcEngine.js';
import { leseAchsen } from '../services/ifcleser/Achsen.js';
import { netzVon } from '../services/engine/Netzabfragen.js';
import { MITGELIEFERTE_REGELN } from '../services/bauform/Bauformregeln.js';
import { achseAusMerkmalen, knotenAusMerkmalen } from '../services/ifcleser/AchsenAusMerkmalen.js';
import { pruefeEintrag } from '../services/katalog/Katalogschema.js';
import { achsAnzeige } from '../services/Achsanzeige.js';

const hier = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.resolve(hier, '../../../../');
const require = createRequire(import.meta.url);
const WASM = { wasmPfad: path.join(wurzel, 'node_modules/web-ifc/'), absolut: true };
const DATEI = path.join(hier, 'IFCOUT_Entwässerung Export .IFC');
const M = 'provi';

let quelle = null;
beforeAll(async () => {
    if (!fs.existsSync(DATEI)) return;
    quelle = await IfcQuelle.oeffne(require('web-ifc'), new Uint8Array(fs.readFileSync(DATEI)), WASM);
});
afterAll(() => quelle?.schliesse());

/** Eine Engine ohne WebGL: nur, was die Achslese und das Netz lesen. */
function engine({ regeln = null, off = null } = {}) {
    const e = Object.create(IfcEngine.prototype);
    Object.assign(e, {
        getWebIfcAPIs: () => [{ quelle, fragmentModelId: M }],
        quelleVon: (id) => (id === M ? quelle : null),
        _coordOffsets: new Map(off ? [[M, off]] : []),
        _verdeckt: new Set(), _lagen: new Map(),
        _gelaendeVerwerfen: () => {}, _beziehungenVerwerfen: () => {},
    });
    if (regeln) e.setzeNetzregeln({ regeln });
    return e;
}

/** Die Merkmale eines Bauteils, gelesen wie überall (flach). */
let _alle = null;
const merkmaleVon = (id) => (_alle ??= quelle.merkmale()).get(id) ?? {};

describe.runIf(fs.existsSync(DATEI))('ProVI-Kanalmodell: Achsen und Knoten aus dem Merkmalssatz', { timeout: 60000 }, () => {
    it('17 von 18 Haltungen werden Achsen, 19 Schächte Knoten (vorher 0 / 0) — die 18. sagt, warum nicht', async () => {
        // Die Datei führt die Schächte 1–19; die Haltung #186246 läuft von 19
        // nach „20" — den Schacht gibt es im Export nicht. Kein Ort, keine
        // geratene Achse, aber ein Hinweis mit Namen.
        const e = engine();
        const n = await leseAchsen(e);
        expect(n).toBe(17);
        expect(e._achsenRoh.get(M).size).toBe(17);
        expect(e._knotenRoh.get(M).size).toBe(19);
        expect(e.achsenHinweise(M)).toEqual(['Haltung „Haltung" (#186246) ohne Schacht „20"']);
        // … und der Nutzer sieht es im Import-Befund des Modells.
        e._quellen = new Map([[M, quelle]]);
        const texte = e.importBefunde()[M].texte.map(t => t.text);
        expect(texte).toContain('1 × im Netz nicht verortet: Haltung „Haltung" (#186246) ohne Schacht „20".');
    });

    it('jede Achse hängt an beiden Enden an einem Schacht — 0 lose Enden im Netz', async () => {
        const e = engine();
        await leseAchsen(e);
        const netz = netzVon(e, M);
        expect(netz.loseEnden ?? []).toEqual([]);
        expect(netz.kanten.size).toBe(17);
        for (const k of netz.kanten.values()) {
            expect(k.von).not.toBeNull();
            expect(k.nach).not.toBeNull();
        }
    });

    it('Gefälle und DN stimmen mit dem, was der Exporteur selbst schreibt (PVI_GEFAELLE_PM, PVI_DURCHMESSER)', async () => {
        const e = engine();
        await leseAchsen(e);
        let geprueft = 0;
        for (const [id, a] of e._achsenRoh.get(M)) {
            const w = merkmaleVon(id);
            expect(a.quelle).toBe('merkmale');
            expect(a.dn).toBe(Math.round(Number(w.PVI_DURCHMESSER) * 1000));
            const soll = Number(w.PVI_GEFAELLE_PM);
            if (Number.isFinite(soll) && Math.abs(soll) > 0.05) {
                // Der Exporteur rechnet auf seiner Rohrlänge; wir auf der
                // waagerechten Strecke Schacht–Schacht. 2 % Abweichung sind die Wand.
                expect(Math.sign(a.gefaelle)).toBe(Math.sign(soll));
                expect(Math.abs(a.gefaelle - soll) / Math.abs(soll)).toBeLessThan(0.1);
                geprueft++;
            }
        }
        expect(geprueft).toBeGreaterThan(10);
    });

    it('die Schachtmitte liegt da, wo der Merkmalssatz sagt — nicht auf dem Ursprung der Platzierung', async () => {
        const off = { x: 410000, y: 200, z: -5475000 };
        const e = engine({ off });
        await leseAchsen(e);
        for (const [id, k] of e._knotenRoh.get(M)) {
            const w = merkmaleVon(id);
            expect(k.punkt.x).toBeCloseTo(Number(w.PVI_SCHACHT_RECHTSWERT) - off.x, 6);
            expect(k.punkt.z).toBeCloseTo(-Number(w.PVI_SCHACHT_HOCHWERT) - off.z, 6);
            expect(k.punkt.y).toBeCloseTo(Number(w.PVI_HOEHE_SOHLE) - off.y, 6);
        }
    });

    it('die Tafel zeigt die Sohle des Exporteurs (Achsbezug Sohle, kein DN/2) und sagt, woher', async () => {
        const e = engine();
        await leseAchsen(e);
        for (const [id, a] of e._achsenRoh.get(M)) {
            const w = merkmaleVon(id);
            const z = achsAnzeige(a, { hoehenversatz: 0 });
            expect(z.anfangNn).toBe(Number(w.PVI_HOEHE_SOHLE_VON).toFixed(2));
            expect(z.endeNn).toBe(Number(w.PVI_HOEHE_SOHLE_BIS).toFixed(2));
            expect(z.herkunft).toBe('aus den Merkmalen (Bauformregel)');     // vorher: „aus der Achs-Repräsentation"
        }
    });

    it('ohne Merkmalsangabe an der Regel: keine geratene Achse, sondern ein Hinweis je Bauteil', async () => {
        const ohne = MITGELIEFERTE_REGELN.map(r => (r.id === 'provi-haltung' ? { ...r, achseAus: undefined } : r));
        const e = engine({ regeln: ohne });
        expect(await leseAchsen(e)).toBe(0);
        expect(e._knotenRoh.get(M).size).toBe(19);                       // die Schächte bleiben
        expect(e.achsenHinweise(M)).toHaveLength(18);          // alle 18, auch die ohne Schacht 20
        expect(e.achsenHinweise(M)[0]).toMatch(/Haltung .* ohne Merkmalsangabe/);
    });

    it('ohne Netzrollen-Regel (Regel abgeschaltet): nichts — ein Proxy ist nicht von sich aus eine Leitung', async () => {
        const aus = MITGELIEFERTE_REGELN.map(r => (r.id.startsWith('provi-') ? { ...r, enabled: false } : r));
        const e = engine({ regeln: aus });
        expect(await leseAchsen(e)).toBe(0);
        expect(e._knotenRoh.get(M).size).toBe(0);
    });
});

describe('AchsenAusMerkmalen — rein', () => {
    const spec = { von: 'V', bis: 'B', sohleVon: 'SV', sohleBis: 'SB', dn: 'D' };
    const k = new Map([['1', { punkt: { x: 0, y: 10, z: 0 }, sohle: 10 }], ['2', { punkt: { x: 30, y: 9, z: -40 }, sohle: 9 }]]);

    it('von Schacht zu Schacht, auf den Sohlhöhen der HALTUNG (Absturz dazwischen)', () => {
        const a = achseAusMerkmalen(spec, { V: '1', B: '2', SV: 10.5, SB: '10,0', D: 0.3 }, k);
        expect(a.anfang).toEqual({ x: 0, y: 10.5, z: 0 });
        expect(a.ende).toEqual({ x: 30, y: 10, z: -40 });
        expect(a.gefaelle).toBeCloseTo(10, 9);                            // 0,5 m auf 50 m
        expect(a.dn).toBe(300);
    });
    it('fehlender Schacht oder fehlendes Merkmal: sagt was, rät nicht', () => {
        expect(achseAusMerkmalen(spec, { V: '1', B: '9', SV: 1, SB: 1 }, k).fehlt).toEqual(['Schacht „9"']);
        expect(achseAusMerkmalen(spec, { V: '1', B: '2', SV: 1 }, k).fehlt).toEqual(['SB']);
        expect(knotenAusMerkmalen({ kennung: 'K', rechtswert: 'R', hochwert: 'H', sohle: 'S' }, { K: 'x', R: 1, H: 2 }).fehlt).toEqual(['S']);
    });
});

describe('Katalog: knotenAus/achseAus an einer Büro-Regel werden geprüft', () => {
    const regel = (extra) => ({ id: 'r', name: 'r', condition: { category: 'IFCBUILDINGELEMENTPROXY', propertyName: 'Name', operator: 'equals', value: 'H' }, bauform: 'achse+profil', netzrolle: 'kante', ...extra });
    it('die mitgelieferten Regeln bestehen', () => {
        for (const r of MITGELIEFERTE_REGELN) expect(pruefeEintrag('bauformregel', r).fehler).toEqual([]);
    });
    it('fehlendes Pflichtfeld, falsche Rolle, kein Name: abgelehnt mit Grund', () => {
        expect(pruefeEintrag('bauformregel', regel({ achseAus: { von: 'A', bis: 'B', sohleVon: 'C' } })).fehler.join(' ')).toMatch(/achseAus\.sohleBis/);
        expect(pruefeEintrag('bauformregel', regel({ knotenAus: { kennung: 'A', rechtswert: 'B', hochwert: 'C', sohle: 'D' } })).fehler.join(' ')).toMatch(/nur für die Netzrolle „knoten"/);
        expect(pruefeEintrag('bauformregel', regel({ achseAus: { von: 'A', bis: 'B', sohleVon: 'C', sohleBis: 'D', dn: 3 } })).fehler.join(' ')).toMatch(/achseAus\.dn.*kein Merkmalsname/);
    });
});

describe('Wächter: kein Merkmalsname im Code der Achslese', () => {
    it('die Namen stehen an der Regel (Daten), nicht in ifcleser/', () => {
        for (const f of ['services/ifcleser/Achsen.js', 'services/ifcleser/AchsenAusMerkmalen.js']) {
            expect(fs.readFileSync(path.join(hier, '..', f), 'utf8')).not.toMatch(/PVI_/);
        }
    });
});
