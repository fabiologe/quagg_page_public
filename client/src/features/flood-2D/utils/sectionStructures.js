/**
 * sectionStructures.js — findet Bauwerke (Wehre, Brücken), die eine Querschnitts-
 * Polylinie kreuzt, und projiziert sie auf die Schnitt-Distanz.
 *
 * Eingabe in REAL-Welt-Koordinaten (gleiche Basis wie der Schnitt: xllcorner/…).
 * Wehre sind Zellen mit Kronenhöhe `hc`; Brücken haben eine Achse (Polylinie) und
 * z_sohle/soffit/deck. Rückgabe je Kreuzung:
 *   weir:   { kind:'weir',   distance, crest, label }
 *   bridge: { kind:'bridge', distance, z_sohle, soffit, deck, label }
 *
 * @returns {Array<object>} nach Distanz sortiert
 */
export function findSectionStructures(ax, ay, bx, by, cellsize, weirs, bridges) {
  const out = [];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return out;
  const len = Math.sqrt(len2);

  // Welt-Punkt → { Distanz entlang Schnitt, senkrechter Abstand, innerhalb? }
  const proj = (px, py) => {
    const t = ((px - ax) * dx + (py - ay) * dy) / len2;
    const cx = ax + t * dx, cy = ay + t * dy;
    return { dist: t * len, perp: Math.hypot(px - cx, py - cy), inside: t >= -0.02 && t <= 1.02 };
  };

  const tol = (cellsize || 1) * 0.75;   // Toleranz „Zelle liegt auf dem Schnitt"

  // ── Wehre: je Wehr-Linie (lineId) die dem Schnitt nächste Zelle nehmen ───────
  const weirByLine = new Map();
  for (const w of (weirs || [])) {
    if (!Number.isFinite(w?.x) || !Number.isFinite(w?.y)) continue;
    const p = proj(w.x, w.y);
    if (!p.inside || p.perp > tol) continue;
    const key = w.lineId || w.id;
    const prev = weirByLine.get(key);
    if (!prev || p.perp < prev.perp) {
      weirByLine.set(key, { distance: p.dist, perp: p.perp, crest: w.hc, label: w.label || 'Wehr' });
    }
  }
  for (const [, w] of weirByLine) out.push({ kind: 'weir', distance: w.distance, crest: w.crest, label: w.label });

  // ── Brücken: kreuzende Kanten gegen den Schnitt schneiden ────────────────────
  // Geometriequelle robust wählen: `axis` (Linien-Brücke, offene Polylinie) ODER
  // `footprint` (3D-Brückenkörper 'mesh3d', GESCHLOSSENES Polygon) ODER `cells`
  // (Zellwolke als Fallback). 3D-Brücken haben KEINE axis → früher unsichtbar.
  for (const b of (bridges || [])) {
    const segs = [];
    if (Array.isArray(b.axis) && b.axis.length >= 2) {
      for (let i = 0; i < b.axis.length - 1; i++) segs.push([b.axis[i], b.axis[i + 1]]);
    } else if (Array.isArray(b.footprint) && b.footprint.length >= 2) {
      const f = b.footprint;
      for (let i = 0; i < f.length; i++) segs.push([f[i], f[(i + 1) % f.length]]); // geschlossen
    }

    const hits = [];
    for (const [p, q] of segs) {
      if (!Number.isFinite(p?.x) || !Number.isFinite(q?.x)) continue;
      const hit = segInt(ax, ay, bx, by, p.x, p.y, q.x, q.y);
      if (hit) hits.push(proj(hit.x, hit.y).dist);
    }

    let distance = null, d0 = null, d1 = null;
    if (hits.length) {
      hits.sort((m, n) => m - n);
      d0 = hits[0]; d1 = hits[hits.length - 1]; distance = (d0 + d1) / 2;
    } else {
      // Fallback: Zellwolke (mesh3d ohne Polygon-Treffer) → der Schnitt-nächsten Zelle
      const cells = b.cells || [];
      const r = Math.max(tol, (b.width || 0) * 0.5);
      let best = null;
      for (const c of cells) {
        if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y)) continue;
        const p = proj(c.x, c.y);
        if (p.inside && p.perp <= r && (!best || p.perp < best.perp)) best = p;
      }
      if (best) distance = best.dist;
    }

    if (distance != null) out.push({
      kind: 'bridge', distance, d0, d1,
      z_sohle: b.z_sohle, soffit: b.soffit, deck: b.deck,
      label: b.label || b.id || 'Brücke',
    });
  }

  out.sort((p, q) => p.distance - q.distance);
  return out;
}

// Segment-Segment-Schnitt (A→B gegen C→D); null falls keiner.
function segInt(ax, ay, bx, by, cx, cy, dx, dy) {
  const rX = bx - ax, rY = by - ay, sX = dx - cx, sY = dy - cy;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-9) return null;            // parallel
  const t = ((cx - ax) * sY - (cy - ay) * sX) / denom;
  const u = ((cx - ax) * rY - (cy - ay) * rX) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + t * rX, y: ay + t * rY };
}
