/**
 * MeshAcquire — Dreiecks-Beschaffung je Element (Sprint G, AP0).
 *
 * Extrahierter, parametrisierter Kern der bisherigen TerrainMesh-Beschaffung:
 *   - Bulk über `model.getItemsGeometry(localIds)` (MeshData → Welt heben)
 *   - Fallback je Element über `getItem().getGeometry().getTriangles()`
 *   - Filter als OPTION: 'none' (alle Dreiecke — Pflicht für Volumen!) oder
 *     'upward' (Unterseiten raus, bisheriges Gelände-Verhalten)
 *   - NEU: Per-Element-Bereiche (`perElement`) — Grundlage für Element-Cache,
 *     Mesh-Volumen je Element und Skelettierung im GeometryResolver.
 *
 * `TerrainMesh.collectCategoryTriangles` bleibt als Wrapper mit dem alten
 * Verhalten erhalten — bestehende Konsumenten/Tests sind unberührt.
 */

import * as THREE from 'three';

const NY_MIN_UPWARD = -0.05; // 'upward': Unterseiten (deutlich abwärts) verwerfen

/**
 * @param {FragmentsModel} model
 * @param {number[]} localIds
 * @param {object} [opts]
 * @param {'none'|'upward'} [opts.filter='none']
 * @returns {Promise<{ positions: Float64Array, triCount: number,
 *                     perElement: Array<{localId, start, end}>,
 *                     degenerate: number }>}
 *          positions: 9 Werte je Dreieck (WELT); start/end = Dreiecks-Indizes
 */
export async function collectElementTriangles(model, localIds, opts = {}) {
    const filter = opts.filter ?? 'none';
    const empty = { positions: new Float64Array(0), triCount: 0, perElement: [], degenerate: 0 };
    if (!model || !localIds?.length) return empty;

    let got = null;
    try { got = await _bulk(model, localIds, filter); } catch { got = null; }
    if (!got) {
        try { got = await _fallback(model, localIds, filter); } catch { got = null; }
    }
    return got ?? empty;
}

// ── Bulk-Pfad: rohe positions/indices + transform, elementweise ─────────────

async function _bulk(model, localIds, filter) {
    if (typeof model.getItemsGeometry !== 'function') return null;
    const perItem = await model.getItemsGeometry(localIds); // MeshData[][] je localId
    if (!perItem?.length) return null;

    // Kapazität schätzen
    let cap = 0;
    for (const meshes of perItem) {
        for (const m of (meshes ?? [])) {
            if (m?.positions?.length) {
                cap += m.indices?.length ? Math.floor(m.indices.length / 3)
                                         : Math.floor(m.positions.length / 9);
            }
        }
    }
    if (!cap) return null;

    const out = new Float64Array(cap * 9);
    const perElement = [];
    let n = 0, degenerate = 0;
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();

    for (let idx = 0; idx < perItem.length; idx++) {
        const start = n;
        for (const m of (perItem[idx] ?? [])) {
            const pos = m?.positions;
            if (!pos?.length) continue;
            const mat = m.transform instanceof THREE.Matrix4
                ? m.transform
                : (m.transform ? new THREE.Matrix4().fromArray(m.transform.elements ?? m.transform) : null);
            const idxArr = m.indices?.length ? m.indices : null;
            const triCount = idxArr ? Math.floor(idxArr.length / 3) : Math.floor(pos.length / 9);

            for (let t = 0; t < triCount; t++) {
                const i0 = idxArr ? idxArr[t * 3]     * 3 : t * 9;
                const i1 = idxArr ? idxArr[t * 3 + 1] * 3 : t * 9 + 3;
                const i2 = idxArr ? idxArr[t * 3 + 2] * 3 : t * 9 + 6;
                va.set(pos[i0], pos[i0 + 1], pos[i0 + 2]);
                vb.set(pos[i1], pos[i1 + 1], pos[i1 + 2]);
                vc.set(pos[i2], pos[i2 + 1], pos[i2 + 2]);
                if (mat) { va.applyMatrix4(mat); vb.applyMatrix4(mat); vc.applyMatrix4(mat); }
                const r = _write(out, n, va, vb, vc, filter);
                if (r === 1) n++;
                else if (r === -1) degenerate++;
            }
        }
        if (n > start) perElement.push({ localId: localIds[idx], start, end: n });
    }
    return { positions: out.subarray(0, n * 9).slice(), triCount: n, perElement, degenerate };
}

// ── Fallback: THREE.Triangle je Element ─────────────────────────────────────

async function _fallback(model, localIds, filter) {
    const chunks = [];
    const perElement = [];
    let total = 0, degenerate = 0;

    for (const localId of localIds) {
        const item = model.getItem?.(localId);
        if (!item) continue;
        let triangleSets = null;
        try {
            const geo = await item.getGeometry();
            triangleSets = await geo?.getTriangles();
        } catch { continue; }

        const tris = [];
        for (const set of (triangleSets ?? [])) {
            for (const tri of (set ?? [])) {
                if (tri?.a && tri?.b && tri?.c) tris.push(tri);
            }
        }
        if (!tris.length) continue;

        const arr = new Float64Array(tris.length * 9);
        let n = 0;
        for (const tri of tris) {
            const r = _write(arr, n, tri.a, tri.b, tri.c, filter);
            if (r === 1) n++;
            else if (r === -1) degenerate++;
        }
        if (n) {
            chunks.push(arr.subarray(0, n * 9));
            perElement.push({ localId, start: total, end: total + n });
            total += n;
        }
    }
    if (!total) return null;

    const positions = new Float64Array(total * 9);
    let off = 0;
    for (const c of chunks) { positions.set(c, off); off += c.length; }
    return { positions, triCount: total, perElement, degenerate };
}

// ── Schreiben + Filter ──────────────────────────────────────────────────────

const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _n = new THREE.Vector3();

/** @returns {1|0|-1}  1 = geschrieben, 0 = gefiltert, -1 = degeneriert */
function _write(arr, n, a, b, c, filter) {
    _e1.subVectors(b, a);
    _e2.subVectors(c, a);
    _n.crossVectors(_e1, _e2);
    const len = _n.length();
    if (len < 1e-12) return -1;
    if (filter === 'upward' && _n.y / len < NY_MIN_UPWARD) return 0;
    const o = n * 9;
    arr[o] = a.x; arr[o + 1] = a.y; arr[o + 2] = a.z;
    arr[o + 3] = b.x; arr[o + 4] = b.y; arr[o + 5] = b.z;
    arr[o + 6] = c.x; arr[o + 7] = c.y; arr[o + 8] = c.z;
    return 1;
}
