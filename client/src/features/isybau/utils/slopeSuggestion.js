/**
 * Schätzt die Neigungsklasse (mappings.js Neigungsklasse, 1-5) einer Fläche
 * aus dem geladenen DGM (store.terrain) — für den "Neigung aus DGM ermitteln"-
 * Button neben dem Neigungsklasse-Dropdown (ElementInfo.vue/PreprocessingModal.vue/
 * ElementPropertiesModal.vue). Rastert die Fläche ab, berechnet an jedem
 * Sample-Punkt das lokale Gefälle per finiter Differenzen (sampleTerrainAt aus
 * terrainSampling.js) und mittelt.
 */
import { sampleTerrainAt } from './terrainSampling.js';

const SAMPLE_STEP_M = 2;    // Rastermaß fürs Abtasten der Fläche
const GRADIENT_STEP_M = 1;  // Finite-Differenzen-Schrittweite fürs lokale Gefälle

// Exakte Klassengrenzen aus mappings.js Neigungsklasse-Beschriftung
// ("≤1%" / "<1% bis 4%" / "<4% bis 10%" / "<10% bis 14%" / ">14%").
export function slopePercentToClass(pct) {
    if (pct <= 1) return 1;
    if (pct <= 4) return 2;
    if (pct <= 10) return 3;
    if (pct <= 14) return 4;
    return 5;
}

/** Ray-Casting Point-in-Polygon (Standard-Algorithmus, offener Ring). */
function pointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x, yi = points[i].y;
        const xj = points[j].x, yj = points[j].y;
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * @param {{x:number,y:number}[]} points - Area.points (oder Zeichen-Punkte vor dem Commit)
 * @param {object|null} terrain - store.terrain (kanonisches Terrain-Objekt)
 * @returns {{slopeClass:number, avgSlopePercent:number}|null} null wenn kein
 *   gültiger Sample-Punkt innerhalb der Fläche gefunden wurde (z.B. Fläche
 *   liegt außerhalb der DGM-Abdeckung oder komplett auf NODATA).
 */
export function suggestSlopeClassFromTerrain(points, terrain) {
    if (!terrain || !points || points.length < 3) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }

    const slopes = [];
    for (let y = minY; y <= maxY; y += SAMPLE_STEP_M) {
        for (let x = minX; x <= maxX; x += SAMPLE_STEP_M) {
            if (!pointInPolygon(x, y, points)) continue;
            const zC = sampleTerrainAt(terrain, x, y);
            const zE = sampleTerrainAt(terrain, x + GRADIENT_STEP_M, y);
            const zN = sampleTerrainAt(terrain, x, y + GRADIENT_STEP_M);
            if (zC == null || zE == null || zN == null) continue;
            const dzdx = (zE - zC) / GRADIENT_STEP_M;
            const dzdy = (zN - zC) / GRADIENT_STEP_M;
            slopes.push(Math.sqrt(dzdx * dzdx + dzdy * dzdy) * 100);
        }
    }

    if (slopes.length === 0) return null;
    const avgSlopePercent = slopes.reduce((a, b) => a + b, 0) / slopes.length;
    return { slopeClass: slopePercentToClass(avgSlopePercent), avgSlopePercent };
}
