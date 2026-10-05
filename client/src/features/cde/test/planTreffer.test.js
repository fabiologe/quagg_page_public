/**
 * Teil XXXII, K3/R3 — Griffe und Treffer im Lageplan in Bildschirmpixeln, wie im Raum.
 *
 * Gemessen wird, was der Finger sieht: die Trefferfläche AUF DEM SCHIRM (Weltmeter → Papier-mm → Pixel), bei
 * verschiedenen Zoomstufen und Massstäben. Vorher: 6 Papier-mm — auf dem Schirm 6 × pxProMm.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GRIFF_PX, TREFFER_PX } from '../services/IfcOverlay.js';
import { planGriffPx, planTrefferPx, pxInMetern } from '../services/PlanTreffer.js';

/** Weltmeter → Bildschirmpixel, wie der Plan zeichnet (Meter / Massstab = Papier-m, × 1000 × pxProMm). */
const aufSchirm = (m, { pxProMm, massstab }) => (m / massstab) * 1000 * pxProMm;
const ALT = (massstab) => (6 / 1000) * massstab;

describe('K3/R3 — Lageplan-Treffer in Pixeln', () => {
    it('in jeder Zoomstufe und jedem Massstab: TREFFER_PX auf dem Schirm (Finger), die Hälfte mit der Maus', () => {
        for (const pxProMm of [0.5, 1, 2.5, 8]) {
            for (const massstab of [50, 250, 1000]) {
                const a = { pxProMm, massstab };
                expect(aufSchirm(pxInMetern(planTrefferPx(true), a), a)).toBeCloseTo(TREFFER_PX, 6);
                expect(aufSchirm(pxInMetern(planTrefferPx(false), a), a)).toBeCloseTo(TREFFER_PX / 2, 6);
            }
        }
        // Vorher, dieselbe Messung: bei kleiner Lupe 3 px, bei grosser 48 px.
        expect(aufSchirm(ALT(500), { pxProMm: 0.5, massstab: 500 })).toBeCloseTo(3, 6);
        expect(aufSchirm(ALT(500), { pxProMm: 8, massstab: 500 })).toBeCloseTo(48, 6);
    });

    it('der gezeichnete Griff hat die Pixelgrösse des Raums; ohne Zoom kein Treffer', () => {
        expect(planGriffPx(true)).toBe(GRIFF_PX);
        expect(planGriffPx(false)).toBe(GRIFF_PX / 2);
        expect(pxInMetern(22, { pxProMm: 0, massstab: 500 })).toBe(0);
    });

    it('der Lageplan rechnet Griff, Planinhalt und Fang damit', () => {
        const v = readFileSync(fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, 'components/IfcPlanCanvas.vue'), 'utf8');
        expect(v).toContain('return pxInMetern(planTrefferPx(grobzeiger), { pxProMm: ansicht.pxProMm, massstab: ansicht.massstab });');
        expect(v).toContain('const radius = planGriffPx(grobzeiger);');
        expect(v).not.toMatch(/\(6 \/ 1000\) \* ansicht\.massstab/);
    });
});
