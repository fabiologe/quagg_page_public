import { describe, it, expect } from 'vitest';
import { Node } from '../core/domain/Node.js';
import { Edge } from '../core/domain/Edge.js';

describe('Node', () => {
    it('berechnet coverZ aus z + depth', () => {
        const n = new Node({ id: 'N1', x: 10, y: 20, z: 100, depth: 2.5 });
        expect(n.coverZ).toBe(102.5);
        expect(n.isValid()).toBe(true);
    });

    it('fromRaw erzeugt gültige Instanz', () => {
        const n = Node.fromRaw({ id: 'N2', x: 20, y: 30, z: 99, type: 'Unknown' });
        expect(n.id).toBe('N2');
        expect(n.z).toBe(99);
    });

    describe('applyOverflowState (Überstau-Kopplung)', () => {
        it('isManhole=false erzwingt canOverflow=false', () => {
            const n = new Node({ id: 'N1', isManhole: false, canOverflow: true });
            expect(n.isManhole).toBe(false);
            expect(n.canOverflow).toBe(false);
        });

        it('isManhole=true erlaubt canOverflow', () => {
            const n = new Node({ id: 'N1', isManhole: true });
            expect(n.canOverflow).toBe(true);
            const sealed = new Node({ id: 'N2', isManhole: true, canOverflow: false });
            expect(sealed.canOverflow).toBe(false);
        });

        it('nachträgliches Setzen von isManhole=false schaltet canOverflow ab', () => {
            const n = new Node({ id: 'N1' });
            n.applyOverflowState({ isManhole: false });
            expect(n.canOverflow).toBe(false);
            n.applyOverflowState({ isManhole: true, canOverflow: true });
            expect(n.canOverflow).toBe(true);
        });
    });

    it('toJSON persistiert Sonderbauwerk-Parameter (Roundtrip zum Worker)', () => {
        const n = new Node({
            id: 'W1', weirHeight: 1.2, wehrWidth: 2.0, dischargeCoeff: 1.7,
            maxOutflow: 50, initialOpening: 0.5, onDepth: 1.1, offDepth: 0.4,
            pumpRate: 12, initDepth: 0.2, is_sink: true
        });
        const json = n.toJSON();
        expect(json.weirHeight).toBe(1.2);
        expect(json.wehrWidth).toBe(2.0);
        expect(json.dischargeCoeff).toBe(1.7);
        expect(json.maxOutflow).toBe(50);
        expect(json.initialOpening).toBe(0.5);
        expect(json.onDepth).toBe(1.1);
        expect(json.offDepth).toBe(0.4);
        expect(json.pumpRate).toBe(12);
        expect(json.initDepth).toBe(0.2);
        expect(json.is_sink).toBe(true);

        // Roundtrip
        const n2 = Node.fromRaw(json);
        expect(n2.toJSON()).toEqual(json);
    });
});

describe('Edge', () => {
    it('hat Default-Kreisprofil (ISYBAU-Code 0)', () => {
        const e = new Edge({ id: 'E1', fromNodeId: 'N1', toNodeId: 'N2', length: 50 });
        expect(e.profile.type).toBe(0);
    });

    it('fromRaw übernimmt Profil', () => {
        const e = Edge.fromRaw({ id: 'E2', from: 'N2', to: 'N1', length: 45, profile: { type: 1, height: 0.5, width: 0.33 } });
        expect(e.profile.height).toBe(0.5);
    });
});
