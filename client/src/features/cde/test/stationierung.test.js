/**
 * Stationierung — EINE Rechnung statt drei Nachbauten (Teil XXIII, AE).
 *
 * Die drei alten Fassungen stehen hier EINGEFROREN (wörtlich kopiert vor dem
 * Umzug, 2026-09-18): `_stationenEntlang` (Kanalgraben), `pointAt`/`sohleAt`
 * (Längsschnitt), `_ortBei` (Profilkörper). Die neue Rechnung muss auf
 * zufälligen Achsen DIESELBEN Zahlen liefern — auch genau AUF einer
 * Knickstation, wo die Wahl des Abschnitts die Sohlbreite bestimmt.
 */
import { describe, expect, it } from 'vitest';
import { ortBei, stationenEntlang, stationiere } from '../services/geometrie/Stationierung.js';
import { buildStrang, pointAt, sohleAt } from '../services/Laengsschnitt.js';

// ── eingefroren ──────────────────────────────────────────────────────────
function alt_stationenEntlang(punkte, schritt) {
    const aus = [];
    for (let i = 0; i + 1 < punkte.length; i++) {
        const a = punkte[i], b = punkte[i + 1];
        const l = Math.hypot(b.x - a.x, b.z - a.z);
        aus.push({ x: a.x, y: a.y, z: a.z });
        if (!(l > 0)) continue;
        const teile = Math.max(1, Math.ceil(l / Math.max(0.01, schritt)));
        for (let k = 1; k < teile; k++) {
            const t = k / teile;
            aus.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
        }
    }
    const letzter = punkte[punkte.length - 1];
    aus.push({ x: letzter.x, y: letzter.y, z: letzter.z });
    return aus;
}
function alt_dirAt(pts, i) {
    const a = pts[Math.max(0, i)], b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: a.x, z: a.z, dirX: (b.x - a.x) / len, dirZ: (b.z - a.z) / len };
}
function alt_pointAt(strang, s) {
    const pts = strang.points;
    if (!pts.length) return null;
    if (s <= pts[0].s) return alt_dirAt(pts, 0);
    for (let i = 0; i + 1 < pts.length; i++) {
        if (s <= pts[i + 1].s) {
            const t = (s - pts[i].s) / Math.max(1e-9, pts[i + 1].s - pts[i].s);
            const base = alt_dirAt(pts, i);
            return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, z: pts[i].z + (pts[i + 1].z - pts[i].z) * t,
                     dirX: base.dirX, dirZ: base.dirZ };
        }
    }
    return alt_dirAt(pts, pts.length - 2);
}
function alt_sohleAt(strang, s) {
    const pts = strang.points;
    if (!pts.length) return null;
    if (s <= pts[0].s) return pts[0].y;
    for (let i = 0; i + 1 < pts.length; i++) {
        if (s <= pts[i + 1].s) {
            const t = (s - pts[i].s) / Math.max(1e-9, pts[i + 1].s - pts[i].s);
            return pts[i].y + (pts[i + 1].y - pts[i].y) * t;
        }
    }
    return pts[pts.length - 1].y;
}
const EPS = 1e-9;
function alt_einheit(dx, dz) { const l = Math.hypot(dx, dz); return l > EPS ? { x: dx / l, z: dz / l } : null; }
function alt_ortBei(bahn, d) {
    const { st, kum, laenge } = bahn;
    if (d < 0) {
        const u = alt_einheit(st[1].x - st[0].x, st[1].z - st[0].z);
        const e = -d;
        return { x: st[0].x - u.x * e, z: st[0].z - u.z * e, u, sohleRoh: st[0].y, e, b2: st[0].sohlbreite / 2 };
    }
    if (d > laenge) {
        const m = st.length - 1;
        const u = alt_einheit(st[m].x - st[m - 1].x, st[m].z - st[m - 1].z);
        const e = d - laenge;
        return { x: st[m].x + u.x * e, z: st[m].z + u.z * e, u, sohleRoh: st[m].y, e, b2: st[m - 1].sohlbreite / 2 };
    }
    let i = 0;
    while (i + 2 < kum.length && kum[i + 1] < d) i++;
    const t = (d - kum[i]) / (kum[i + 1] - kum[i]);
    const u = alt_einheit(st[i + 1].x - st[i].x, st[i + 1].z - st[i].z);
    return { x: st[i].x + (st[i + 1].x - st[i].x) * t, z: st[i].z + (st[i + 1].z - st[i].z) * t, u, e: 0,
             sohleRoh: st[i].y + (st[i + 1].y - st[i].y) * t, b2: st[i].sohlbreite / 2 };
}
// ─────────────────────────────────────────────────────────────────────────

/** Reproduzierbarer Zufall (mulberry32). */
function zufall(saat) {
    let a = saat >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function achse(r, n) {
    const p = [{ x: r() * 100, y: 300 + r() * 5, z: r() * 100, sohlbreite: 0.5 + r() }];
    for (let i = 1; i < n; i++) {
        const q = p[i - 1];
        p.push({ x: q.x + (r() - 0.3) * 30, y: q.y - r() * 0.5, z: q.z + (r() - 0.3) * 30, sohlbreite: 0.5 + r() });
    }
    return p;
}

describe('Eine Rechnung, dieselben Zahlen wie die drei alten', () => {
    it('Stationen entlang — Kanalgraben (auch mit doppeltem Punkt)', () => {
        const r = zufall(7);
        for (let k = 0; k < 50; k++) {
            const p = achse(r, 2 + Math.floor(r() * 6));
            if (k % 7 === 0) p.splice(1, 0, { ...p[1] });           // Abschnitt ohne Länge
            const schritt = 0.5 + r() * 4;
            expect(stationenEntlang(p, schritt)).toEqual(alt_stationenEntlang(p, schritt));
        }
    });

    it('Ort bei Station — Profilkörper, mit Verlängerung und genau AUF den Knicken', () => {
        const r = zufall(11);
        for (let k = 0; k < 50; k++) {
            const st = achse(r, 2 + Math.floor(r() * 6));
            const s = stationiere(st);
            const bahn = { st, kum: s.kum, laenge: s.laenge };
            const proben = [-3.2, 0, ...s.kum, s.laenge + 2.5, ...Array.from({ length: 20 }, () => (r() * 1.2 - 0.1) * s.laenge)];
            for (const d of proben) {
                const alt = alt_ortBei(bahn, d);
                const neu = ortBei(s, d, { ausserhalb: 'verlaengern' });
                expect(neu.x).toBeCloseTo(alt.x, 12);
                expect(neu.z).toBeCloseTo(alt.z, 12);
                expect(neu.richtung).toEqual(alt.u);
                expect(neu.ueber).toBeCloseTo(alt.e, 12);
                expect(neu.y).toBeCloseTo(alt.sohleRoh, 12);
                // Die Stufe der Sohlbreite: der Abschnitt, der an der Station ENDET.
                const i = d > s.laenge ? st.length - 2 : neu.i;
                expect(st[i].sohlbreite / 2).toBe(alt.b2);
            }
        }
    });

    it('Lage und Sohle an Station — Längsschnitt (mit Schachtlücke zwischen zwei Haltungen)', () => {
        const r = zufall(23);
        for (let k = 0; k < 30; k++) {
            const a = achse(r, 3), b0 = a[a.length - 1];
            const b = achse(r, 3).map((p, i) => (i === 0 ? { ...p, x: b0.x + 0.8, z: b0.z + 0.4 } : p));
            const strang = buildStrang([{ polyline: a }, { polyline: b }], { chainEps: 1.5 });
            if (!strang) continue;
            for (const s of [-1, 0, ...strang.points.map(p => p.s), ...Array.from({ length: 15 }, () => r() * strang.length)]) {
                const alt = alt_pointAt(strang, s), neu = pointAt(strang, s);
                expect(neu.x).toBeCloseTo(alt.x, 12);
                expect(neu.z).toBeCloseTo(alt.z, 12);
                expect(neu.dirX).toBeCloseTo(alt.dirX, 12);
                expect(neu.dirZ).toBeCloseTo(alt.dirZ, 12);
                expect(sohleAt(strang, s)).toBeCloseTo(alt_sohleAt(strang, s), 12);
            }
        }
    });
});

describe('Was die alte Fassung falsch machte', () => {
    it('hinter dem Strangende lag der Ort am VORLETZTEN Punkt — jetzt am letzten', () => {
        const strang = buildStrang([{ polyline: [{ x: 0, y: 1, z: 0 }, { x: 10, y: 0.9, z: 0 }, { x: 20, y: 0.8, z: 0 }] }]);
        expect(alt_pointAt(strang, 25).x).toBe(10);                  // der Fehler
        expect(pointAt(strang, 25).x).toBe(20);
        expect(sohleAt(strang, 25)).toBeCloseTo(0.8, 12);
    });

    it('Stationen zählen in der Draufsicht — auch bei starkem Gefälle', () => {
        const s = stationiere([{ x: 0, y: 10, z: 0 }, { x: 3, y: 6, z: 4 }]);
        expect(s.laenge).toBe(5);
        expect(ortBei(s, 2.5)).toMatchObject({ x: 1.5, y: 8, z: 2 });
    });

    it('klemmen bleibt am Ende stehen, verlängern läuft weiter', () => {
        const s = stationiere([{ x: 0, y: 0, z: 0 }, { x: 10, y: -1, z: 0 }]);
        expect(ortBei(s, 12)).toMatchObject({ x: 10, y: -1, ueber: 0 });
        expect(ortBei(s, 12, { ausserhalb: 'verlaengern' })).toMatchObject({ x: 12, y: -1, ueber: 2 });
        expect(ortBei(s, -2, { ausserhalb: 'verlaengern' })).toMatchObject({ x: -2, y: 0, ueber: 2 });
    });
});
