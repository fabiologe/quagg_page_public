/**
 * Abflussbeiwert ψ (Fahrplan „Grenzen beheben“, Stufe 1): fehlt er, bleibt er
 * fehlend — gerechnet wird mit der Programmvorgabe, EINE Regel (psiWirksam)
 * für Übersetzer, Fläche und Auslass-Übersicht.
 */
import { describe, it, expect } from 'vitest';
import { Area } from '../core/domain/Area.js';
import { psiWirksam, getRunoffCoeff } from '../utils/mappings.js';
import { SwmmBuilder } from '../core/services/SwmmBuilder.js';
import { Node } from '../core/domain/Node.js';
import { Edge } from '../core/domain/Edge.js';

describe('Abflussbeiwert ψ', () => {
    it('Area setzt keinen stillen Vorgabewert mehr', () => {
        expect(new Area({ id: 'F', function: 3, runoffCoeff: null }).runoffCoeff).toBeNull();
        expect(new Area({ id: 'F', function: 3, runoffCoeff: '' }).runoffCoeff).toBeNull();
        expect(new Area({ id: 'F', function: 3, runoffCoeff: 0 }).runoffCoeff).toBe(0);
        expect(new Area({ id: 'F', function: 3, runoffCoeff: '0.4' }).runoffCoeff).toBe(0.4);
    });

    it('gerechnet wird mit dem eingetragenen Wert, sonst mit der Vorgabe', () => {
        expect(psiWirksam({ runoffCoeff: 0 })).toBe(0);
        expect(psiWirksam({ runoffCoeff: 0.3 })).toBe(0.3);
        const verkehr = { runoffCoeff: null, function: 3, slope: 1 };
        expect(psiWirksam(verkehr)).toBe(getRunoffCoeff(undefined, 3, 1));
        expect(new Area({ id: 'F', size: 2, function: 3 }).effectiveArea).toBeCloseTo(2 * psiWirksam(verkehr));
    });

    it('der Übersetzer schreibt für fehlendes ψ die Vorgabe als %Imperv (vorher pauschal 50)', () => {
        const nodes = [new Node({ id: 'N1', x: 0, y: 0, z: 100 }), new Node({ id: 'N2', x: 100, y: 0, z: 98 })];
        const edges = [new Edge({ id: 'E1', fromNodeId: 'N1', toNodeId: 'N2', length: 100, profile: { type: 0, height: 0.3 } })];
        const areas = [{ id: 'FV', size: 0.5, runoffCoeff: null, function: 3, slope: 1, nodeId: 'N1' }];
        const b = new SwmmBuilder({ get getAllNodes() { return nodes; }, get getAllEdges() { return edges; }, areas });
        b.setOptions({ durationHours: 1 });
        const inp = b.build().inpContent;
        const zeile = inp.split('[SUBCATCHMENTS]')[1].split('[')[0].split('\n').find(l => l.startsWith('FV'));
        expect(parseFloat(zeile.trim().split(/\s+/)[4])).toBeCloseTo(getRunoffCoeff(undefined, 3, 1) * 100);
    });
});
