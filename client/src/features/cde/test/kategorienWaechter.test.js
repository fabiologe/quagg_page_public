/**
 * Wächter: fachliche Kategorien hängen am Baum, und jeder IFC-Name im Code ist
 * eine Klasse.
 *
 * Vorbild ist die gelöschte Zwillingsliste in TerrainMesh.js (2026-09-03): eine
 * zweite Liste läuft auseinander, sobald jemand nur die erste anfasst. Hier
 * gab es zwei wortgleiche `LINEAR_CATEGORIES`, beide mit `IFCDUCT` — einer
 * Klasse, die kein Schema kennt. `IFCDUCT` stand an neun Stellen (Linienstil,
 * Farbe, Ebenen-Icon, Kostengruppe 430), und an keiner wurde je ein Bauteil so
 * behandelt: Lüftungskanäle heissen `IfcDuctSegment`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENTITY_META } from '../data/entity-schema.js';
import { imWoerterbuch } from '../services/bauform/Typprofile.js';
import {
    AUSHUB_WURZELN, LINEARE_WURZELN, SCHACHT_WURZELN, istAushub, istLinear, istSchacht,
} from '../services/Kategorien.js';
import { GELAENDE_VORBELEGUNG } from '../services/GelaendeQuelle.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Namen, die KEINE Klasse sind — mit Grund. */
const KEINE_KLASSE = Object.freeze({
    IFCLENGTHMEASURE: 'Messtyp — Einheiten.js erkennt Längenwerte an ihm',
});

function quellen(d = WURZEL, out = []) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
            if (!['node_modules', 'test', 'data'].includes(e.name)) quellen(p, out);
        } else if (/\.(js|vue)$/.test(e.name)) {
            out.push(p);
        }
    }
    return out;
}

describe('Fachliche Kategorien hängen am Baum', () => {
    it('keine der alten Listen kommt zurück', () => {
        const alt = /\b(const|let|var)\s+(LINEAR_CATEGORIES|MANHOLE_CATEGORIES|AUSHUB_KLASSEN)\b/;
        const treffer = quellen().filter(p => alt.test(fs.readFileSync(p, 'utf8')));
        expect(treffer.map(p => path.relative(WURZEL, p))).toEqual([]);
    });

    it('die Wurzeln sind Klassen', () => {
        for (const w of [...LINEARE_WURZELN, ...SCHACHT_WURZELN, ...AUSHUB_WURZELN, ...GELAENDE_VORBELEGUNG]) {
            expect(ENTITY_META[w], w).toBeTruthy();
        }
    });

    it('linear deckt jeden Untertyp — auch die, die die Liste vergessen hatte', () => {
        for (const k of ['IFCPIPESEGMENT', 'IFCDUCTSEGMENT', 'IFCCABLESEGMENT', 'IFCCABLECARRIERSEGMENT',
            'IFCCONVEYORSEGMENT', 'IFCBEAMSTANDARDCASE', 'IFCMEMBER', 'IFCKERB']) {
            expect(istLinear(k), k).toBe(true);
        }
        for (const k of ['IFCWALL', 'IFCDISTRIBUTIONCHAMBERELEMENT', 'IFCDUCT', '', null]) {
            expect(istLinear(k), String(k)).toBe(false);
        }
    });

    it('Schacht und Aushub ebenso', () => {
        expect(istSchacht('IFCDISTRIBUTIONCHAMBERELEMENT')).toBe(true);
        expect(istSchacht('IFCPIPESEGMENT')).toBe(false);
        expect(istAushub('IFCEARTHWORKSCUT')).toBe(true);
        expect(istAushub('IFCEARTHWORKSFILL')).toBe(false);
    });
});

describe('Jeder IFC-Name im Code ist eine Klasse', () => {
    it('0 unbekannte Namen in Diensten und Komponenten', () => {
        const unbekannt = [];
        let gesehen = 0;
        for (const p of quellen()) {
            const text = fs.readFileSync(p, 'utf8');
            for (const m of text.matchAll(/'(IFC[A-Z0-9]{3,})'|\b(IFC[A-Z0-9]{3,}):/g)) {
                const k = m[1] ?? m[2];
                gesehen++;
                if (KEINE_KLASSE[k] || imWoerterbuch(k)) continue;
                unbekannt.push(`${k} in ${path.relative(WURZEL, p)}`);
            }
        }
        expect(gesehen).toBeGreaterThan(300);          // Schutz gegen Leerlauf
        expect(unbekannt).toEqual([]);
    });
});
