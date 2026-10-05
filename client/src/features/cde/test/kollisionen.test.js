// @vitest-environment jsdom
/**
 * Teil XXXII, O2 — Kollision als Befund: eigene Körper, die sich überschneiden, ohne verbunden zu sein.
 *
 * Echter Stand: Bauteile über Kommandos. Der Server-Kernel ist eine Attrappe, die die Schnittmenge über die Hüllen
 * nähert — geprüft werden hier die AUSWAHL (wer mit wem, wer nicht) und der Befund, nicht trimesh.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { kollisionenPruefen, pruefbareKoerper } from '../services/Kollisionen.js';
import { kommando } from './hilfen/ruebKommandos.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';

let b, ae;
const e = (ost, nord, hoehe) => ({ ost, nord, hoehe });
const WAND = { kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5 };
beforeEach(async () => {
    repo.setBackend(new Speicher()); setActivePinia(createPinia());
    b = useBearbeitung(); ae = useAenderungen();
    for (const k of [
        kommando('wand-zeichnen', { neu: ['cde-W'], werte: { name: 'Wand', ...WAND }, eingaben: { zug: [e(0, 0, 100), e(6, 0, 100)] } }),
        // Die zweite Wand im Knoten an der Ecke (6 | 0) — überlappt 0,3 × 0,3 × 2,5, ist aber verbunden.
        kommando('wand-zeichnen', { neu: ['cde-W2'], werte: { name: 'Wand 2', ...WAND }, eingaben: { zug: [e(6, 0, 100), e(6, 5, 100)] } }),
        // Ein Rohr quer durch die erste Wand.
        kommando('rohr-zeichnen', { neu: ['cde-R'], werte: { name: 'Zulauf', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 },
                                    eingaben: { zug: [e(3, -2, 101), e(3, 2, 101)] } }),
        // Ein Pfosten weit weg.
        kommando('pfosten-zeichnen', { neu: ['cde-P'], werte: { name: 'Pfosten', kategorie: 'IFCSIGN', hoehe: '', laenge: 1, breite: 0.12, tiefe: 0.12 },
                                       eingaben: { zug: [e(40, 40, 100)] } }),
    ]) {
        const r = await b.fuehreAus(k);
        if (!r.ausgefuehrt) throw new Error(`${k.werkzeug}: ${r.grund}`);
    }
});
afterEach(() => repo.setBackend(null));

/** Eine Attrappe: die Schnittmenge als Überlappung der Hüllen (genug, um die Auswahl zu prüfen). */
function kernel() {
    const huelle = (f) => { const p = f.positions, min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
        for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[i + k]); max[k] = Math.max(max[k], p[i + k]); }
        return { min, max }; };
    return { kann: () => ({ ok: true }), op: vi.fn(async (name, { a, b }) => {
        const A = huelle(a), B = huelle(b);
        const v = [0, 1, 2].reduce((m, k) => m * Math.max(0, Math.min(A.max[k], B.max[k]) - Math.max(A.min[k], B.min[k])), 1);
        return { ergebnis: v > 0 ? { volumen: v, closed: true } : null, warnungen: [] };
    }) };
}
const pruefe = (k = kernel(), mehr = {}) => kollisionenPruefen({ stand: ae.wirksamerStand('erzeugt'), rezeptNach, kernel: k, ...mehr });

describe('Kollisionen', () => {
    it('das Rohr durch die Wand: an beiden ein Befund mit Partner und Volumen', async () => {
        const r = await pruefe();
        expect(r.paare.map(p => [p.a, p.b].sort())).toEqual([['cde-R', 'cde-W']]);
        const w = r.befunde.get('cde-W');
        expect(w).toHaveLength(1);
        expect(w[0]).toMatchObject({ regel: 'kollision', schwere: 'warnung', partner: 'cde-R' });
        expect(w[0].text).toMatch(/^Überschneidet sich mit „Zulauf": \d+,\d{3} m³$/);
        expect(r.befunde.get('cde-R')[0].partner).toBe('cde-W');
    });

    it('die zwei Wände im Knoten überlappen an der Ecke — verbunden, kein Befund; der ferne Pfosten wird gar nicht gefragt', async () => {
        const k = kernel();
        const r = await pruefe(k);
        expect(r.befunde.has('cde-W2')).toBe(false);
        expect(r.befunde.has('cde-P')).toBe(false);
        // Nur das Paar Wand–Rohr ging an den Server (Wand–Wand verbunden, der Pfosten ohne überlappende Hülle).
        expect(r.geprueft).toBe(1);
        expect(k.op).toHaveBeenCalledTimes(1);
    });

    it('verborgenes zählt nicht; ein Raum (IfcSpace) ist kein Bauteil; ohne Server: der Grund', async () => {
        expect((await pruefe(kernel(), { verdeckt: new Set(['cde-R']) })).paare).toEqual([]);
        const r = await b.fuehreAus(kommando('raum-zeichnen', { neu: ['cde-RM'], werte: { name: 'Kammer', hoehe: '', raumhoehe: 2, betriebswasser: 101 },
            eingaben: { umriss: [e(1, -1, 100), e(5, -1, 100), e(5, 1, 100), e(1, 1, 100)] } }));
        expect(r.ausgefuehrt, r.grund).toBe(true);
        expect(pruefbareKoerper({ stand: ae.wirksamerStand('erzeugt'), rezeptNach }).map(k => k.globalId)).not.toContain('cde-RM');
        expect((await pruefe({ op: vi.fn(), kann: () => ({ ok: false, grund: 'offline' }) })).grund).toBe('offline');
    });
});

describe('der Viewer', () => {
    it('rechnet nach jedem Aufbau im Bearbeiten-Modus neu und gibt die Befunde an die Marken (Teil XXX, B7)', async () => {
        const { readFileSync } = await import('node:fs');
        const { fileURLToPath } = await import('node:url');
        const v = readFileSync(fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, 'components/IfcViewer.vue'), 'utf8');
        expect(v).toMatch(/watch\(\(\) => \[bearbeitung\.modusAn, ifc\.geometrieStand, aenderungen\.eintraege\?\.length, bearbeitung\.umbauLaeuft\]/);
        expect(v).toContain('const r = await kollisionenPruefen({');
        expect(v).toContain('eigene = [...eigene, ...[...kollisionen.value].map(([globalId, befunde]) => ({ globalId, befunde }))];');
    });
});
