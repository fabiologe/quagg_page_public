// Test: Migration alter Boundaries auf das Kanten-Segment-Modell (rein).
// Ausführen: node src/features/flood-2D/test/test_boundary_migration.mjs (aus client/)
import { migrateBoundaries } from '../utils/boundarySegments.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};

const header = { ncols: 20, nrows: 20, cellsize: 5, xllcorner: 0, yllcorner: 0 };

console.log('── Alte Kanten-Boundary wird gesnappt + Felder entfernt ──');
{
    const fc = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature', id: 'b1',
            geometry: { type: 'LineString', coordinates: [[0, 20], [0, 60]] }, // x=0 ⇒ Westrand
            properties: { type: 'BOUNDARY' } // KEIN edge
        }],
    };
    const assignments = { b1: { type: 'INFLOW_DYNAMIC', profileId: 'g', inflowMode: 'DIRECTED', direction: 'E' } };
    const stats = migrateBoundaries(fc, assignments, header);

    assert(fc.features[0].properties.edge === 'W', `edge='W' gesetzt (got ${fc.features[0].properties.edge})`);
    assert(fc.features[0].geometry.coordinates.every(c => c[0] === 0), 'Koordinaten auf col 0 projiziert');
    assert(!('inflowMode' in assignments.b1), 'inflowMode entfernt');
    assert(!('direction' in assignments.b1), 'direction entfernt');
    assert(assignments.b1.type === 'INFLOW_DYNAMIC' && assignments.b1.profileId === 'g', 'Rolle/Profil unverändert');
    assert(stats.snapped === 1 && stats.fieldsStripped === 2, `Stats: snapped=1, fieldsStripped=2 (got ${stats.snapped},${stats.fieldsStripped})`);
}

console.log('── Mitten-im-Gebiet-Boundary ⇒ Innenquelle (edge=null) ──');
{
    const fc = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature', id: 'b2',
            geometry: { type: 'LineString', coordinates: [[50, 20], [50, 60]] }, // tief innen
            properties: {},
        }],
    };
    const stats = migrateBoundaries(fc, {}, header);
    assert(fc.features[0].properties.edge === null, 'edge=null (Innenquelle)');
    assert(stats.interior === 1, 'als Innenquelle gezählt');
}

console.log('── Idempotenz: bereits gesetzte edge bleibt ──');
{
    const fc = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature', id: 'b3',
            geometry: { type: 'LineString', coordinates: [[95, 20], [95, 60]] },
            properties: { edge: 'E' }, // schon migriert
        }],
    };
    const before = JSON.stringify(fc.features[0].geometry.coordinates);
    const stats = migrateBoundaries(fc, {}, header);
    assert(fc.features[0].properties.edge === 'E', 'edge bleibt E');
    assert(JSON.stringify(fc.features[0].geometry.coordinates) === before, 'Koordinaten unverändert (idempotent)');
    assert(stats.snapped === 0 && stats.interior === 0, 'keine erneute Migration');
}

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
