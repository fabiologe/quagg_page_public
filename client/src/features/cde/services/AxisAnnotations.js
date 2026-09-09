/**
 * AxisAnnotations — die Achse einer Leitung (Sprint T1, neu gefasst in 14.1).
 *
 * ZWEI QUELLEN, in dieser Reihenfolge:
 *
 *   1. eine echte `Axis`-Repräsentation (IFCPOLYLINE) — der Idealfall
 *   2. die **Extrusion** des Körpers: `IFCEXTRUDEDAREASOLID` gibt mit
 *      `Position`, `ExtrudedDirection` und `Depth` exakt eine Strecke, und
 *      `IFCCIRCLEPROFILEDEF.Radius` gibt exakt den DN
 *
 * Der zweite Weg ist nicht der Notnagel, sondern der Regelfall: Fabios beide
 * echten Netze (51 und 1.025 Bauteile) tragen **null** Axis-Repräsentationen
 * und ausschliesslich Extrusionen. Ohne ihn kam jede Achse aus der
 * Skelettierung des Netzes — Güte `geschaetzt`, und damit fiel jede Operation
 * mit Güteschranke aus. Die Extrusion ist exakt, nicht geschätzt.
 *
 * Die Funktion liest über eine **IfcQuelle** (`services/IfcQuelle.js`), nicht
 * über `ifcLoader.webIfc`. Der alte Handle hatte nie ein Modell offen; das war
 * der eigentliche Grund, warum hier jahrelang nichts herauskam.
 *
 * Sie liefert je Element:
 *   - die Achs-Polylinie in Welt-Koordinaten (Offset-korrigiert!)
 *   - berechnete Pseudo-Attribute: laenge (m), gefaelle (‰, aus den
 *     Achs-Höhen — bei 2D-Achsen null), dn (mm, nur aus der Extrusion)
 *   - `quelle`: 'axisRep' oder 'extrusion' — die Güte hängt daran
 *
 * Der Beschriftungstext entsteht über die normale Label-Template-Pipeline
 * ({Name}, {Pset.Prop}, plus {laenge:m} und {gefaelle}); gezeichnet wird im
 * Plotter (_drawAxisLabels) — rotiert am längsten Segment.
 *
 * Koordinaten-Konvention — DIESELBE wie web-ifc/fragments für das Netz:
 * IFC-X → three-x, IFC-Z (Höhe) → three-y, IFC-Y (Nord) → three-**minus**-z.
 * Am Realmodell verifiziert (2026-09-08, ENQUIER FK001): die Rohdreiecke aus
 * `GetFlatMesh` liegen bei z ≈ −5.465.712, die Achse lag bis dahin bei
 * +5.465.712 — gespiegelt, und niemand sah es, weil der Ladeversatz in X/Z
 * zugleich null war (siehe `ladeversatzAus` in IfcEngine). `Projektkoordinaten`
 * rechnet `nord = −roh.z`; wer hier +Y nähme, spiegelte jede Achse am Ost-West-
 * Meridian gegen die Fragment-Welt.
 */

import * as THREE from 'three';

export const AXIS_CATEGORIES_DEFAULT = ['IFCPIPESEGMENT', 'IFCFLOWSEGMENT'];

/**
 * Achs-Polylinien aller Produkte der gewünschten Kategorien eines Modells.
 *
 * @param {object} quelle  eine LEBENDE `IfcQuelle` — gebraucht werden nur
 *        `ids(typ, {untertypen})` und `zeile(id, {tief})`. Eine Attrappe mit
 *        diesen zwei Methoden genügt (so prüfen die Tests).
 * @param {object} [opts]
 * @param {string[]} [opts.categories]
 * @param {{x,y,z}|null} [opts.coordOffset]  Engine-Offset (welt = roh − offset)
 * @param {boolean} [opts.untertypen=true]  auch abgeleitete Typen mitnehmen
 * @returns {Array<{category, expressId, polyline, laenge, gefaelle, dn, quelle}>}
 */
export function extractAxisPolylines(quelle, opts = {}) {
    if (typeof quelle?.ids !== 'function' || typeof quelle?.zeile !== 'function') return [];
    const categories = opts.categories?.length ? opts.categories : AXIS_CATEGORIES_DEFAULT;
    const off = opts.coordOffset ?? null;
    const untertypen = opts.untertypen ?? true;
    const out = [];
    // Die Kategorienliste enthält Ober- UND Untertypen (`IFCFLOWSEGMENT` und
    // `IFCPIPESEGMENT`), und mit `untertypen` findet die Oberklasse dieselben
    // Bauteile noch einmal. Ohne diese Sperre kam jedes Rohr doppelt heraus —
    // 48 statt 24 — und jede Zählung, Beschriftung und Strangbildung wäre
    // doppelt gewesen.
    const gesehen = new Set();

    for (const typeName of categories) {
        let ids;
        try { ids = quelle.ids(typeName, { untertypen }); } catch { continue; }
        if (!ids?.length) continue;

        for (const id of ids) {
            if (gesehen.has(id)) continue;
            gesehen.add(id);
            const product = quelle.zeile(id, { tief: true });
            if (!product) continue;

            // Echte Achse zuerst — sie ist die Aussage des Autors. Erst wenn
            // es keine gibt, wird sie aus der Extrusion gewonnen.
            let pts = _extractAxisPoints(product);
            let herkunft = 'axisRep';
            let dn = null;
            if (pts.length < 2) {
                const aus = _achseAusExtrusion(product);
                if (!aus) continue;
                pts = aus.punkte;
                dn = aus.dn;
                herkunft = 'extrusion';
            }
            if (pts.length < 2) continue;

            // Fallstrick 7: Rohkoordinate → Three-Welt (welt = roh − offset)
            const polyline = off
                ? pts.map(p => ({ x: p.x - off.x, y: p.y - (off.y ?? 0), z: p.z - off.z }))
                : pts;

            out.push({
                category: typeName,
                expressId: id,
                polyline,
                laenge: polylineLength(polyline),
                gefaelle: polylineGefaellePromille(polyline),
                dn,
                quelle: herkunft,
            });
        }
    }
    return out;
}

/**
 * Die Achse aus der Extrusion — exakt, nicht geschätzt.
 *
 * `IFCEXTRUDEDAREASOLID` beschreibt einen Körper als Profil, das entlang einer
 * Richtung um eine Tiefe gezogen wird. Anfang und Ende dieser Strecke SIND die
 * Achse:
 *
 *     Anfang = Ursprung der `Position`
 *     Ende   = Ursprung + ExtrudedDirection × Depth   (in der Position gerechnet)
 *
 * Beides wird durch die Platzierungskette des Produkts geschoben und erst dann
 * auf die three-Konvention gemappt (IFC-Z ist die Höhe).
 *
 * Der DN fällt nebenbei ab: `IFCCIRCLEPROFILEDEF.Radius × 2`. Auch das ist der
 * exakte Wert und nicht die Schätzung aus einem Querschnitt durchs Netz.
 *
 * @returns {{punkte: Array<{x,y,z}>, dn: number|null}|null}
 */
function _achseAusExtrusion(product) {
    const solid = _ersteExtrusion(product);
    if (!solid) return null;

    const tiefe = _zahl(solid.Depth);
    if (!Number.isFinite(tiefe) || Math.abs(tiefe) < 1e-9) return null;

    // Platzierung des Produkts × Lage des Profils im Körper. `_placementMatrix`
    // erwartet eine Kette; ein blosses Axis2Placement3D wird als deren letztes
    // Glied hereingereicht.
    const ges = _placementMatrix(product?.ObjectPlacement)
        .multiply(_placementMatrix({ RelativePlacement: solid.Position }));

    const r = solid.ExtrudedDirection?.DirectionRatios;
    const dir = r
        ? new THREE.Vector3(_zahl(r[0]), _zahl(r[1]), _zahl(r[2]))
        : new THREE.Vector3(0, 0, 1);
    if (dir.lengthSq() < 1e-18) return null;
    dir.normalize();

    const a = new THREE.Vector3(0, 0, 0).applyMatrix4(ges);
    const b = dir.clone().multiplyScalar(tiefe).applyMatrix4(ges);

    return {
        // IFC-Raum → three: x bleibt, IFC-Z wird Höhe, IFC-Y wird −z
        // (`0 - …` statt `-…`, damit aus 0 kein −0 wird).
        punkte: [{ x: a.x, y: a.z, z: 0 - a.y }, { x: b.x, y: b.z, z: 0 - b.y }],
        dn: _dnAusProfil(solid.SweptArea),
    };
}

/** Die erste Extrusion in der Body-Repräsentation — durch Verpackungen hindurch. */
function _ersteExtrusion(product) {
    const reps = product?.Representation?.Representations;
    if (!Array.isArray(reps)) return null;
    for (const rep of reps) {
        const gefunden = _extrusionInItems(rep?.Items, 0);
        if (gefunden) return gefunden;
    }
    return null;
}

function _extrusionInItems(items, tiefe) {
    if (!Array.isArray(items) || tiefe > 8) return null;
    for (const item of items) {
        if (!item) continue;
        if (item.ExtrudedDirection && item.Depth !== undefined) return item;
        // IfcMappedItem, IfcBooleanResult, IfcShapeRepresentation — die
        // üblichen Verpackungen. Der erste Treffer gewinnt: bei einem
        // Bool'schen Ergebnis ist das der Grundkörper, nicht der Abzug.
        const weiter = item.MappingSource?.MappedRepresentation?.Items
            ?? (item.FirstOperand ? [item.FirstOperand] : null)
            ?? item.Items;
        const gefunden = _extrusionInItems(weiter, tiefe + 1);
        if (gefunden) return gefunden;
    }
    return null;
}

/** DN in Millimetern aus dem gezogenen Profil, oder null. */
function _dnAusProfil(profil) {
    const r = _zahl(profil?.Radius);
    if (Number.isFinite(r) && r > 0) return Math.round(r * 2 * 1000);
    // Rechteck/Trapez: die Breite ist die brauchbarste Einzelzahl.
    const b = _zahl(profil?.XDim);
    if (Number.isFinite(b) && b > 0) return Math.round(b * 1000);
    return null;
}

/** web-ifc verpackt Zahlen mal als `{value}`, mal roh. */
function _zahl(v) {
    const z = Number(typeof v === 'object' ? v?.value : v);
    return Number.isFinite(z) ? z : NaN;
}

/** Erste 'Axis'-Repräsentation als geordnete Punktfolge (Welt-Achsen-Konvention). */
function _extractAxisPoints(product) {
    const reps = product?.Representation?.Representations;
    if (!Array.isArray(reps)) return [];

    for (const rep of reps) {
        const ident = rep?.RepresentationIdentifier?.value ?? rep?.RepresentationIdentifier;
        if (ident !== 'Axis') continue;
        const matrix = _placementMatrix(product?.ObjectPlacement);
        const pts = [];
        for (const item of rep?.Items ?? []) {
            _collectPolylinePoints(item, matrix, pts);
        }
        if (pts.length >= 2) return pts;
    }
    return [];
}

// Die gesamte Placement-Kette rechnet im IFC-ACHSRAUM (x=IFC-X, y=IFC-Y,
// z=IFC-Z=Höhe) — erst NACH der Transformation wird auf die three-Konvention
// gemappt: three.x = X, three.y = Z (Höhe), three.z = −Y (siehe Kopf).
function _collectPolylinePoints(item, matrix, out) {
    if (!item) return;
    if (item.Points) {
        for (const p of item.Points) {
            if (!p) continue;
            const c = p.Coordinates ?? p.coordinates ?? [];
            const val = (v) => (typeof v === 'object' ? v?.value : v) ?? 0;
            const v = new THREE.Vector3(val(c[0]), val(c[1]), c.length > 2 ? val(c[2]) : 0);
            v.applyMatrix4(matrix);                       // IFC-Raum
            out.push({ x: v.x, y: v.z, z: 0 - v.y });     // → three-Konvention
        }
        return;
    }
    if (item.Segments) {
        for (const seg of item.Segments ?? []) _collectPolylinePoints(seg?.ParentCurve ?? seg, matrix, out);
        return;
    }
    if (item.Elements) {
        for (const el of item.Elements ?? []) _collectPolylinePoints(el, matrix, out);
        return;
    }
    if (item.BasisCurve) _collectPolylinePoints(item.BasisCurve, matrix, out);
}

/**
 * Placement-Kette IfcLocalPlacement → Axis2Placement3D, komplett im
 * IFC-Achsraum (inkl. RefDirection/Axis-Rotation — Muster aus dem Plotter).
 */
function _placementMatrix(placement) {
    if (!placement) return new THREE.Matrix4();
    const m = placement.PlacementRelTo
        ? _placementMatrix(placement.PlacementRelTo)
        : new THREE.Matrix4();
    const rel = placement.RelativePlacement;
    const loc = rel?.Location;
    if (!loc) return m;

    const val = (arr, i) => {
        const v = (arr ?? [])[i];
        return (typeof v === 'object' ? v?.value : v) ?? 0;
    };
    const coords = loc.Coordinates ?? loc.coordinates ?? [];
    const tx = val(coords, 0), ty = val(coords, 1), tz = val(coords, 2);

    const dir = (d, dx, dy, dz) => (d?.DirectionRatios
        ? new THREE.Vector3(val(d.DirectionRatios, 0), val(d.DirectionRatios, 1), val(d.DirectionRatios, 2)).normalize()
        : new THREE.Vector3(dx, dy, dz));
    const xDir = dir(rel.RefDirection, 1, 0, 0);
    const zDir = dir(rel.Axis, 0, 0, 1);
    const yDir = new THREE.Vector3().crossVectors(zDir, xDir).normalize();

    const local = new THREE.Matrix4().set(
        xDir.x, yDir.x, zDir.x, tx,
        xDir.y, yDir.y, zDir.y, ty,
        xDir.z, yDir.z, zDir.z, tz,
        0, 0, 0, 1,
    );
    return m.multiply(local);
}

// ── Geometrie-Helfer (exportiert für Tests + Plotter) ───────────────────────

/** 3D-Länge der Polylinie (2D wenn keine Höhen). */
export function polylineLength(pts) {
    let s = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
        s += Math.hypot(
            pts[i + 1].x - pts[i].x,
            (pts[i + 1].y ?? 0) - (pts[i].y ?? 0),
            pts[i + 1].z - pts[i].z,
        );
    }
    return s;
}

/**
 * Gefälle in ‰ aus den Achs-Höhen: Δy zwischen Anfang und Ende bezogen auf
 * die horizontale Länge. null wenn die Achse keine Höheninformation trägt.
 */
export function polylineGefaellePromille(pts) {
    if (pts.length < 2) return null;
    let l2d = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
        l2d += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    }
    if (l2d < 1e-9) return null;
    const dy = (pts[0].y ?? 0) - (pts[pts.length - 1].y ?? 0);
    if (Math.abs(dy) < 1e-9) return null; // 2D-Achse oder exakt horizontal
    return (dy / l2d) * 1000;
}

/** Längstes Einzelsegment (für die Label-Platzierung). */
export function longestSegment(pts) {
    let best = null, bestLen = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
        const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
        if (len > bestLen) {
            bestLen = len;
            best = { x1: pts[i].x, z1: pts[i].z, x2: pts[i + 1].x, z2: pts[i + 1].z, len };
        }
    }
    return best;
}

/** Textwinkel lesbar halten: nie kopfüber (−90° … +90°]. */
export function normalizeTextAngle(angleDeg) {
    let a = angleDeg;
    while (a > 90) a -= 180;
    while (a <= -90) a += 180;
    return a;
}

/** Gefälle-Anzeige: „5,2 ‰" (Betrag — Fließrichtung zeigt die Achse). */
export function formatGefaelle(promille) {
    if (promille == null || !Number.isFinite(promille)) return '';
    return `${Math.abs(promille).toLocaleString('de-DE', { maximumFractionDigits: 1 })} ‰`;
}
