/**
 * BIMFY · Geometrieleser — aus einer Zeichnung werden neutrale Geometrien.
 *
 * Was hereinkommt, ist kein BIM: eine DXF aus dem CAD, eine GeoJSON aus dem
 * GIS, ein OBJ oder STL aus einem Modellierer. Was herausgeht, ist EINE Form,
 * die der Übersetzer (`Uebersetzer.js`) kennt:
 *
 *   { id, art, punkte, ebene, name, quelle, dreiD, … }
 *
 *   art      'punkt' | 'zug' | 'umriss' | 'koerper'
 *   punkte   [{ost, nord, hoehe?}] in PROJEKTKOORDINATEN, Meter. Ein Punkt
 *            ohne `hoehe` ist 2D — „keine Höhe" ist eine Aussage, keine 0
 *            (dieselbe Regel wie `Kommando.punktAusWelt`).
 *   ebene    Layer (DXF), Eigenschaft `layer`/`ebene` (GeoJSON), Gruppe (OBJ)
 *   dreiD    trägt die Geometrie echte Höhen?
 *
 * Ein Körper (`koerper`) trägt nur seine Eckpunkte. Das Netz geht nie weiter —
 * ein `erzeugt`-Eintrag speichert Parameter, niemals ein Netz
 * (`Bauteilrezepte.js`, Kopf). Was aus den Ecken wird, rechnet `Koerperform.js`.
 *
 * ACHSEN: DXF, GeoJSON und STL sind Z-oben (X = Ost, Y = Nord, Z = Höhe).
 * OBJ ist meist Y-oben (X = Ost, −Z = Nord, Y = Höhe) — dieselbe Abbildung wie
 * `rahmenOhneBezug`. Die Vorgabe ist je Format umstellbar (`zOben`).
 *
 * Rein: kein Vue, kein Store, keine Engine.
 */

/** Die Formate, die BIMFY liest — Endung → Leser. */
export const FORMATE = Object.freeze({
    dxf:     { titel: 'DXF (CAD, Vermessungsplan)', zOben: true },
    xml:     { titel: 'ISYBAU-XML (Kanalnetz)', zOben: true },
    xyz:     { titel: 'XYZ-Punktdaten',          zOben: true },
    csv:     { titel: 'Punktliste CSV',          zOben: true },
    txt:     { titel: 'Punktliste TXT',          zOben: true },
    geojson: { titel: 'GeoJSON (GIS, 2D/3D)',   zOben: true },
    json:    { titel: 'GeoJSON (GIS, 2D/3D)',   zOben: true },
    obj:     { titel: 'OBJ (3D-Netz)',          zOben: false },
    stl:     { titel: 'STL ASCII (3D-Netz)',    zOben: true },
});

/** Die Endungen für das Dateifeld. */
export const ANNAHME = Object.keys(FORMATE).map(e => `.${e}`).join(',');

/** Unter dieser Ausdehnung gilt ein geschlossener Zug als offen (1 mm). */
const SCHLUSS_M = 1e-3;

const _fin = (v) => typeof v === 'number' && Number.isFinite(v);

/** Endung einer Datei, klein, ohne Punkt. */
export function endungVon(name) {
    const m = /\.([a-z0-9]+)$/i.exec(String(name ?? ''));
    return m ? m[1].toLowerCase() : '';
}

/**
 * Eine Datei lesen.
 * @param {string} name   Dateiname (die Endung wählt den Leser)
 * @param {string} text   Inhalt
 * @param {object} [opt]  `zOben` überstimmt die Achsvorgabe des Formats
 * @returns {{format: string, geometrien: object[], warnungen: string[]}}
 */
export function liesGeometrien(name, text, opt = {}) {
    const format = endungVon(name);
    const def = FORMATE[format];
    if (!def) {
        return { format, geometrien: [], warnungen: [`„${name}": dieses Format liest BIMFY nicht (${Object.keys(FORMATE).join(', ')})`] };
    }
    const zOben = typeof opt.zOben === 'boolean' ? opt.zOben : def.zOben;
    let aus;
    try {
        if (format === 'dxf') aus = liesDxf(text);
        else if (format === 'xml') aus = liesIsybau(text);
        else if (format === 'xyz' || format === 'csv' || format === 'txt') aus = liesPunktliste(text, opt);
        else if (format === 'geojson' || format === 'json') aus = liesGeoJson(text);
        else if (format === 'obj') aus = liesObj(text, { zOben });
        else aus = liesStl(text, { zOben });
    } catch (e) {
        return { format, geometrien: [], warnungen: [`„${name}" liess sich nicht lesen: ${e?.message ?? e}`] };
    }
    // Kennungen erst hier — eine Reihenfolge, gleich welcher Leser.
    aus.geometrien.forEach((g, i) => { g.id = `g${i + 1}`; g.quelle = name; });
    if (!aus.geometrien.length) aus.warnungen.push(`„${name}": keine Geometrie gefunden`);
    return { format, ...aus };
}

// ── Gemeinsame Helfer ─────────────────────────────────────────────────────

function _punkt(ost, nord, hoehe) {
    return _fin(hoehe) ? { ost, nord, hoehe } : { ost, nord };
}

/** Ist der Zug geschlossen (erster = letzter Punkt)? Dann ohne Wiederholung zurück. */
function _schliesse(punkte) {
    if (punkte.length < 4) return { punkte, geschlossen: false };
    const a = punkte[0], b = punkte[punkte.length - 1];
    const d = Math.hypot(a.ost - b.ost, a.nord - b.nord, (a.hoehe ?? 0) - (b.hoehe ?? 0));
    return d <= SCHLUSS_M ? { punkte: punkte.slice(0, -1), geschlossen: true } : { punkte, geschlossen: false };
}

/** Folgepunkte, die auf dem Vorgänger liegen, fallen weg. */
function _ohneDoppelte(punkte) {
    const aus = [];
    for (const p of punkte) {
        const q = aus[aus.length - 1];
        if (q && Math.hypot(p.ost - q.ost, p.nord - q.nord, (p.hoehe ?? 0) - (q.hoehe ?? 0)) <= SCHLUSS_M) continue;
        aus.push(p);
    }
    return aus;
}

const _hatHoehe = (punkte) => punkte.some(p => _fin(p.hoehe) && Math.abs(p.hoehe) > 1e-9);

/** Eine Linien-Geometrie aus Punkten — `zug` oder `umriss`, oder nichts. */
function _linienform(roh, { geschlossen = false, ebene = '', name = '' } = {}) {
    // Lauter Nullhöhen sind eine 2D-Zeichnung, keine Linie auf 0 m NN — die
    // DXF schreibt Z = 0 auch dort, wo niemand eine Höhe gemeint hat.
    let punkte = _ohneDoppelte(_hatHoehe(roh) ? roh : roh.map(p => ({ ost: p.ost, nord: p.nord })));
    let zu = geschlossen;
    if (!zu) ({ punkte, geschlossen: zu } = _schliesse(punkte));
    else if (punkte.length > 3) punkte = _schliesse(punkte).punkte;
    if (zu && punkte.length >= 3) return { art: 'umriss', punkte, ebene, name, dreiD: _hatHoehe(punkte) };
    if (punkte.length >= 2) return { art: 'zug', punkte, ebene, name, dreiD: _hatHoehe(punkte) };
    if (punkte.length === 1) return { art: 'punkt', punkte, ebene, name, dreiD: _hatHoehe(punkte) };
    return null;
}

// ── DXF ───────────────────────────────────────────────────────────────────

/** $INSUNITS → Meter je Zeichnungseinheit. Fehlt die Angabe, gilt Meter. */
const DXF_EINHEITEN = Object.freeze({ 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 7: 1000, 14: 0.1 });

/** Die Gruppen einer ASCII-DXF als [{code, wert}]. */
function _dxfPaare(text) {
    const zeilen = String(text ?? '').split(/\r?\n/);
    const paare = [];
    for (let i = 0; i + 1 < zeilen.length; i += 2) {
        const code = parseInt(zeilen[i].trim(), 10);
        if (Number.isNaN(code)) {
            // Binäre DXF beginnt mit einem Klartextkopf — und ist dann hier falsch.
            if (i === 0 && /AutoCAD Binary DXF/.test(zeilen[0])) throw new Error('binäre DXF — bitte als ASCII-DXF speichern');
            throw new Error(`Zeile ${i + 1}: Gruppencode erwartet, „${zeilen[i].slice(0, 20)}" gefunden`);
        }
        paare.push({ code, wert: zeilen[i + 1].trim() });
    }
    return paare;
}

/**
 * Eine ASCII-DXF lesen: LINE, LWPOLYLINE, POLYLINE (2D, 3D, Netz), POINT,
 * CIRCLE, 3DFACE. Blöcke (INSERT) und Text werden gezählt und gemeldet.
 */
export function liesDxf(text) {
    const paare = _dxfPaare(text);
    const warnungen = [];
    let massstab = 1;

    // Kopf: nur die Einheit.
    for (let i = 0; i < paare.length - 1; i++) {
        if (paare[i].code === 9 && paare[i].wert === '$INSUNITS') {
            const e = parseInt(paare[i + 1].wert, 10);
            if (DXF_EINHEITEN[e]) massstab = DXF_EINHEITEN[e];
            else if (e) warnungen.push(`DXF-Einheit ${e} unbekannt — Meter angenommen`);
            break;
        }
    }

    // Nur der Abschnitt ENTITIES — Blockdefinitionen sind keine Geometrie am Ort.
    let start = -1, ende = paare.length;
    for (let i = 0; i < paare.length - 1; i++) {
        if (paare[i].code === 0 && paare[i].wert === 'SECTION' && paare[i + 1].code === 2 && paare[i + 1].wert === 'ENTITIES') start = i + 2;
        else if (start >= 0 && paare[i].code === 0 && paare[i].wert === 'ENDSEC') { ende = i; break; }
    }
    if (start < 0) throw new Error('kein Abschnitt ENTITIES');

    // In Elemente zerlegen: jedes beginnt mit Code 0.
    const elemente = [];
    for (let i = start; i < ende; i++) {
        if (paare[i].code === 0) elemente.push({ typ: paare[i].wert, gruppen: [] });
        else elemente[elemente.length - 1]?.gruppen.push(paare[i]);
    }

    const m = (v) => Number(v) * massstab;
    const zahl = (g, code, vorgabe = 0) => { const p = g.find(x => x.code === code); return p ? Number(p.wert) : vorgabe; };
    const ebeneVon = (g) => g.find(x => x.code === 8)?.wert ?? '0';

    const geometrien = [];
    const flaechen = new Map();   // Ebene → Eckpunkte der 3DFACEs (ein Körper je Ebene)
    const uebergangen = new Map();
    let poly = null;               // offene POLYLINE bis SEQEND

    const schliessePolyline = () => {
        if (!poly) return;
        if (poly.netz) {
            if (poly.punkte.length >= 4) geometrien.push({ art: 'koerper', punkte: poly.punkte, ebene: poly.ebene, name: '', dreiD: true });
        } else {
            const g = _linienform(poly.punkte, { geschlossen: poly.geschlossen, ebene: poly.ebene });
            if (g) geometrien.push(g);
        }
        poly = null;
    };

    for (const { typ, gruppen: g } of elemente) {
        if (typ === 'VERTEX' && poly) {
            const flag = zahl(g, 70, 0);
            // Flächensätze eines Polyface-Netzes (128 ohne 64) tragen keine Lage.
            if ((flag & 128) && !(flag & 64)) continue;
            poly.punkte.push(_punkt(m(zahl(g, 10)), m(zahl(g, 20)), poly.dreiD ? m(zahl(g, 30)) : poly.erhebung));
            continue;
        }
        if (typ === 'SEQEND') { schliessePolyline(); continue; }
        schliessePolyline();

        const ebene = ebeneVon(g);
        if (typ === 'LINE') {
            const z1 = zahl(g, 30, NaN), z2 = zahl(g, 31, NaN);
            const gl = _linienform([
                _punkt(m(zahl(g, 10)), m(zahl(g, 20)), _fin(z1) ? m(z1) : undefined),
                _punkt(m(zahl(g, 11)), m(zahl(g, 21)), _fin(z2) ? m(z2) : undefined),
            ], { ebene });
            if (gl) geometrien.push(gl);
        } else if (typ === 'LWPOLYLINE') {
            const erhebung = g.some(x => x.code === 38) ? m(zahl(g, 38)) : undefined;
            const punkte = [];
            for (let i = 0; i < g.length; i++) {
                if (g[i].code !== 10) continue;
                const y = g.slice(i + 1).find(x => x.code === 20 || x.code === 10);
                punkte.push(_punkt(m(Number(g[i].wert)), m(y?.code === 20 ? Number(y.wert) : 0), erhebung));
            }
            const gl = _linienform(punkte, { geschlossen: !!(zahl(g, 70, 0) & 1), ebene });
            if (gl) geometrien.push(gl);
        } else if (typ === 'POLYLINE') {
            const flag = zahl(g, 70, 0);
            const erhebung = g.some(x => x.code === 30) && zahl(g, 30) !== 0 ? m(zahl(g, 30)) : undefined;
            poly = { ebene, punkte: [], geschlossen: !!(flag & 1), dreiD: !!(flag & (8 | 16 | 64)), netz: !!(flag & (16 | 64)), erhebung };
        } else if (typ === 'POINT') {
            const z = zahl(g, 30, NaN);
            geometrien.push({ art: 'punkt', punkte: [_punkt(m(zahl(g, 10)), m(zahl(g, 20)), _fin(z) && z !== 0 ? m(z) : undefined)],
                              ebene, name: '', dreiD: _fin(z) && z !== 0 });
        } else if (typ === 'CIRCLE') {
            // Ein Kreis ist ein ORT mit Durchmesser — Schacht, Pfosten, Stütze.
            const z = zahl(g, 30, NaN);
            geometrien.push({ art: 'punkt', punkte: [_punkt(m(zahl(g, 10)), m(zahl(g, 20)), _fin(z) && z !== 0 ? m(z) : undefined)],
                              durchmesser: 2 * m(zahl(g, 40)), ebene, name: '', dreiD: _fin(z) && z !== 0 });
        } else if (typ === '3DFACE') {
            const liste = flaechen.get(ebene) ?? [];
            for (let k = 0; k < 4; k++) liste.push(_punkt(m(zahl(g, 10 + k)), m(zahl(g, 20 + k)), m(zahl(g, 30 + k))));
            flaechen.set(ebene, liste);
        } else {
            uebergangen.set(typ, (uebergangen.get(typ) ?? 0) + 1);
        }
    }
    schliessePolyline();

    for (const [ebene, punkte] of flaechen) geometrien.push({ art: 'koerper', punkte, ebene, name: '', dreiD: true });
    for (const [typ, n] of uebergangen) warnungen.push(`DXF: ${n} × ${typ} übergangen${typ === 'INSERT' ? ' (Blöcke bitte vorher auflösen)' : ''}`);
    return { geometrien, warnungen };
}

// ── GeoJSON ───────────────────────────────────────────────────────────────

/**
 * Eine GeoJSON lesen. Erwartet PROJIZIERTE Koordinaten in Metern (UTM, GK);
 * Längen- und Breitengrade erkennt der Leser und sagt es — umgerechnet wird
 * hier nicht, das wäre eine stille Annahme über das Bezugssystem.
 */
export function liesGeoJson(text) {
    const daten = JSON.parse(text);
    const warnungen = [];
    const geometrien = [];
    const features = daten?.type === 'FeatureCollection' ? (daten.features ?? [])
        : daten?.type === 'Feature' ? [daten]
        : daten?.type ? [{ type: 'Feature', geometry: daten, properties: {} }] : [];

    const pt = (c) => _punkt(Number(c[0]), Number(c[1]), c.length > 2 ? Number(c[2]) : undefined);
    let geografisch = 0;

    const nimm = (geo, props) => {
        if (!geo) return;
        const ebene = String(props?.layer ?? props?.ebene ?? props?.Layer ?? props?.typ ?? props?.type ?? '');
        const name = String(props?.name ?? props?.Name ?? props?.bezeichnung ?? '');
        const c = geo.coordinates;
        switch (geo.type) {
            case 'Point': geometrien.push({ art: 'punkt', punkte: [pt(c)], ebene, name, dreiD: c.length > 2 }); break;
            case 'MultiPoint': c.forEach(p => nimm({ type: 'Point', coordinates: p }, props)); break;
            case 'LineString': { const g = _linienform(c.map(pt), { ebene, name }); if (g) geometrien.push(g); break; }
            case 'MultiLineString': c.forEach(l => nimm({ type: 'LineString', coordinates: l }, props)); break;
            case 'Polygon': {
                // Der äussere Ring zählt; Löcher kann kein Umriss-Rezept tragen.
                if (c.length > 1) warnungen.push(`GeoJSON: ${c.length - 1} Loch/Löcher in „${name || ebene || 'Polygon'}" übergangen`);
                const g = _linienform(c[0].map(pt), { geschlossen: true, ebene, name });
                if (g) geometrien.push(g);
                break;
            }
            case 'MultiPolygon': c.forEach(p => nimm({ type: 'Polygon', coordinates: p }, props)); break;
            case 'GeometryCollection': (geo.geometries ?? []).forEach(gg => nimm(gg, props)); break;
            default: warnungen.push(`GeoJSON: Geometrietyp „${geo.type}" übergangen`);
        }
    };
    for (const f of features) nimm(f?.geometry, f?.properties ?? {});

    for (const g of geometrien) {
        if (g.punkte.every(p => Math.abs(p.ost) <= 180 && Math.abs(p.nord) <= 90)) geografisch++;
    }
    if (geometrien.length && geografisch === geometrien.length) {
        warnungen.push('GeoJSON: die Koordinaten sehen nach Längen-/Breitengrad aus — BIMFY erwartet Meter (UTM/GK). Bitte vorher projizieren.');
    }
    return { geometrien, warnungen };
}

// ── OBJ und STL ───────────────────────────────────────────────────────────

/** Ein Netzpunkt → Projektpunkt, je nach Achslage. */
const _netzpunkt = (x, y, z, zOben) => (zOben ? _punkt(x, y, z) : _punkt(x, -z, y));

/**
 * Ein OBJ lesen: jedes Objekt (`o`) oder jede Gruppe (`g`) ist ein Körper,
 * Linienzüge (`l`) sind Züge. Gezählt werden nur Ecken, die eine Fläche
 * oder Linie auch benutzt.
 */
export function liesObj(text, { zOben = false } = {}) {
    const ecken = [];
    const geometrien = [];
    const warnungen = [];
    let aktuell = { name: '', benutzt: new Set() };
    const teile = [aktuell];

    const index = (tok) => {
        const i = parseInt(String(tok).split('/')[0], 10);
        return i < 0 ? ecken.length + i : i - 1;
    };

    for (const zeile of String(text ?? '').split(/\r?\n/)) {
        const t = zeile.trim().split(/\s+/);
        if (t[0] === 'v') ecken.push(_netzpunkt(Number(t[1]), Number(t[2]), Number(t[3]), zOben));
        else if (t[0] === 'o' || t[0] === 'g') {
            const name = t.slice(1).join(' ');
            if (aktuell.benutzt.size || aktuell.name) teile.push(aktuell = { name, benutzt: new Set() });
            else aktuell.name = name;
        } else if (t[0] === 'f') {
            for (const tok of t.slice(1)) aktuell.benutzt.add(index(tok));
        } else if (t[0] === 'l') {
            const punkte = t.slice(1).map(index).map(i => ecken[i]).filter(Boolean);
            const g = _linienform(punkte, { ebene: aktuell.name, name: aktuell.name });
            if (g) geometrien.push(g);
        }
    }
    for (const teil of teile) {
        const punkte = [...teil.benutzt].map(i => ecken[i]).filter(Boolean);
        if (punkte.length >= 4) geometrien.push({ art: 'koerper', punkte, ebene: teil.name, name: teil.name, dreiD: true });
        else if (punkte.length) warnungen.push(`OBJ: „${teil.name || 'ohne Namen'}" hat zu wenige Ecken für einen Körper`);
    }
    return { geometrien, warnungen };
}

/** Ein ASCII-STL lesen: jeder `solid` ist ein Körper. Binäres STL wird erkannt und gemeldet. */
export function liesStl(text, { zOben = true } = {}) {
    const s = String(text ?? '');
    if (!/^\s*solid/i.test(s) || !/facet/i.test(s)) throw new Error('binäres STL — bitte als ASCII-STL speichern');
    const geometrien = [];
    let aktuell = null;
    for (const zeile of s.split(/\r?\n/)) {
        const t = zeile.trim().split(/\s+/);
        if (t[0] === 'solid') aktuell = { name: t.slice(1).join(' '), punkte: [] };
        else if (t[0] === 'vertex' && aktuell) aktuell.punkte.push(_netzpunkt(Number(t[1]), Number(t[2]), Number(t[3]), zOben));
        else if (t[0] === 'endsolid' && aktuell) {
            if (aktuell.punkte.length >= 4) geometrien.push({ art: 'koerper', punkte: aktuell.punkte, ebene: aktuell.name, name: aktuell.name, dreiD: true });
            aktuell = null;
        }
    }
    return { geometrien, warnungen: [] };
}

// ── XYZ- und Punktlisten ──────────────────────────────────────────────────

/** Eine Zahl, wie sie in deutschen Listen steht („101,25"). */
function _zahl(t) {
    const s = String(t ?? '').trim();
    if (!s) return NaN;
    return Number(/^-?\d+,\d+$/.test(s) ? s.replace(',', '.') : s);
}

/**
 * Eine Punktliste lesen — XYZ, CSV, TXT aus der Vermessung.
 *
 * Erkannt werden die Formen `X Y Z`, `Nr X Y Z`, `Nr X Y Z Code` und
 * `X Y Z Code`, getrennt durch Leerraum, Semikolon, Tab oder Komma. Jeder
 * Punkt wird ein `punkt`; der CODE (Punktart der Vermessung, etwa „SD"
 * Schachtdeckel) ist seine Ebene — derselbe Gedanke wie der Layer im CAD.
 *
 * DIE ACHSREIHENFOLGE ist in der Vermessung nicht einheitlich: Gauss-Krüger
 * schreibt oft Hochwert vor Rechtswert. `reihenfolge` legt sie fest; ohne
 * Angabe gilt Ost/Nord, ausser die erste Spalte trägt deutlich grössere
 * Werte als die zweite und die zweite sieht nach einem UTM-Rechtswert ohne
 * Zone aus (< 1 000 000) — dann ist es Nord/Ost, und das steht in den Warnungen.
 */
export function liesPunktliste(text, { reihenfolge = null } = {}) {
    const warnungen = [];
    const roh = [];
    for (const zeile of String(text ?? '').split(/\r?\n/)) {
        const z = zeile.trim();
        if (!z || /^[#%/]/.test(z)) continue;
        // Komma als Trenner nur, wenn kein Dezimalkomma gemeint sein kann.
        const teile = (/[;\t]/.test(z) ? z.split(/[;\t]+/) : /\s/.test(z) ? z.split(/\s+/) : z.split(',')).map(t => t.trim()).filter(Boolean);
        const zahlen = teile.map(_zahl);
        const zahl = (k) => Number.isFinite(zahlen[k]);
        // Wo beginnen die drei Koordinaten? Nach einer Punktnummer (Text oder
        // eine kleine ganze Zahl vor grossen Koordinaten) — sonst vorn.
        let i;
        if (zahl(1) && zahl(2) && zahl(3) && (!zahl(0) || (Number.isInteger(zahlen[0]) && Math.abs(zahlen[0]) * 10 < Math.abs(zahlen[1])))) i = 1;
        else if (zahl(0) && zahl(1) && zahl(2)) i = 0;
        else {
            if (roh.length) warnungen.push(`Punktliste: Zeile „${z.slice(0, 40)}" übergangen`);
            continue;   // vor dem ersten Punkt: eine Kopfzeile
        }
        const nr = i === 1 ? teile[0] : '';
        const code = teile.slice(i + 3).find(t => !Number.isFinite(_zahl(t))) ?? '';
        roh.push({ nr, a: zahlen[i], b: zahlen[i + 1], h: zahlen[i + 2], code });
    }
    if (!roh.length) return { geometrien: [], warnungen };

    let nordOst = reihenfolge === 'nord-ost';
    if (!reihenfolge) {
        const mA = roh.reduce((s, p) => s + Math.abs(p.a), 0) / roh.length;
        const mB = roh.reduce((s, p) => s + Math.abs(p.b), 0) / roh.length;
        if (mA > 2 * mB && mB < 1e6 && mA > 1e6) {
            nordOst = true;
            warnungen.push('Punktliste: erste Spalte als Hochwert gelesen (Nord/Ost) — bitte prüfen');
        }
    }
    const geometrien = roh.map(p => ({
        art: 'punkt',
        punkte: [_punkt(nordOst ? p.b : p.a, nordOst ? p.a : p.b, p.h)],
        ebene: p.code || 'Punkte', name: p.nr, dreiD: true,
    }));
    if (geometrien.length > 500) {
        warnungen.push(`Punktliste: ${geometrien.length} Punkte — für ein Geländemodell (DGM) aus Punkten ist ein eigener Weg nötig; hier wird jeder Punkt ein Bauteil`);
    }
    return { geometrien, warnungen };
}

// ── ISYBAU-XML ────────────────────────────────────────────────────────────

/** Alle Nachfahren mit diesem lokalen Namen (Namensräume egal, `isy:` wie ohne). */
const _alle = (el, name) => [...el.getElementsByTagName('*')].filter(e => e.localName === name);
const _erstes = (el, name) => _alle(el, name)[0] ?? null;
const _text = (el, name) => _erstes(el, name)?.textContent?.trim() ?? '';
const _isyZahl = (el, name) => _zahl(_text(el, name));

/** Ein Profilmass: ISYBAU schreibt Millimeter; ein Wert über 9 ist es sicher. */
const _profilM = (v) => (Number.isFinite(v) && v > 0 ? (v > 9 ? v / 1000 : v) : NaN);

/** Ein Punkt einer Geometrie: Rechtswert, Hochwert, Punkthöhe. */
function _isyPunkt(el) {
    const ost = _isyZahl(el, 'Rechtswert'), nord = _isyZahl(el, 'Hochwert');
    if (!Number.isFinite(ost) || !Number.isFinite(nord)) return null;
    return _punkt(ost, nord, _isyZahl(el, 'Punkthoehe'));
}

/**
 * Eine ISYBAU-XML (Austauschformat Abwasser, Stammdaten) lesen.
 *
 * Gelesen werden die Objektarten, aus denen ein Netz besteht — dieselbe
 * Entscheidungstabelle wie im Feature „isyifc" (`PARSING.md`), hier nach
 * BIMFY-Form neu geschrieben, weil kein Feature aus einem anderen importiert:
 *
 *   Objektart 1                    Haltung/Leitung → `zug` mit Sohlhöhen, `durchmesser`
 *   Objektart 2, KnotenTyp 0       Schacht → senkrechter `zug` Sohle → Deckel
 *   Objektart 2, KnotenTyp 1 und 2 Anschlusspunkt, Bauwerk → gezählt, gemeldet
 *
 * Eine Haltung ohne eigene Geometrie bekommt die Lage ihrer Knoten.
 */
export function liesIsybau(text) {
    if (typeof DOMParser === 'undefined') throw new Error('kein XML-Leser in dieser Umgebung');
    const doc = new DOMParser().parseFromString(String(text ?? ''), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('kein gültiges XML');
    const objekte = _alle(doc.documentElement, 'AbwassertechnischeAnlage');
    if (!objekte.length) throw new Error('keine AbwassertechnischeAnlage — ist das eine ISYBAU-Datei?');

    const warnungen = [];
    const geometrien = [];
    const knoten = new Map();       // Bezeichnung → {ort, sohle}
    const haltungen = [];
    const uebergangen = { Anschlusspunkt: 0, Bauwerk: 0, andere: 0 };

    for (const o of objekte) {
        const name = _text(o, 'Objektbezeichnung');
        const art = parseInt(_text(o, 'Objektart'), 10);
        if (art === 2) {
            const typ = parseInt(_text(o, 'KnotenTyp'), 10);
            const punkte = _alle(o, 'Punkt').map(p => ({ el: p, attr: _text(p, 'PunktattributAbwasser').toUpperCase(), p: _isyPunkt(p) }))
                .filter(x => x.p);
            const dmp = punkte.find(x => x.attr === 'DMP')?.p ?? punkte[0]?.p ?? null;
            const smp = punkte.find(x => x.attr === 'SMP')?.p ?? null;
            if (!dmp) { warnungen.push(`ISYBAU: Knoten „${name}" ohne Lage übergangen`); continue; }
            const tiefe = _isyZahl(o, 'Schachttiefe');
            let deckel = dmp.hoehe, sohle = smp?.hoehe;
            if (!Number.isFinite(sohle) && Number.isFinite(deckel) && Number.isFinite(tiefe)) sohle = deckel - tiefe;
            if (!Number.isFinite(deckel) && Number.isFinite(sohle) && Number.isFinite(tiefe)) deckel = sohle + tiefe;
            const ort = { ost: dmp.ost, nord: dmp.nord };
            knoten.set(name, { ort, sohle });
            if (typ === 0) {
                const durchmesser = _profilM(_isyZahl(o, 'LaengeAufbau')) || _profilM(_isyZahl(o, 'LaengeDeckel')) || 1;
                if (Number.isFinite(sohle) && Number.isFinite(deckel) && deckel - sohle > 0.01) {
                    geometrien.push({ art: 'zug', punkte: [{ ...ort, hoehe: sohle }, { ...ort, hoehe: deckel }],
                                      ebene: 'ISYBAU Schacht', name, durchmesser, dreiD: true });
                } else {
                    geometrien.push({ art: 'punkt', punkte: [_punkt(ort.ost, ort.nord, sohle ?? deckel)],
                                      ebene: 'ISYBAU Schacht', name, durchmesser, dreiD: Number.isFinite(sohle ?? deckel) });
                }
            } else if (typ === 1) uebergangen.Anschlusspunkt++;
            else if (typ === 2) uebergangen.Bauwerk++;
            else uebergangen.andere++;
        } else if (art === 1) {
            haltungen.push(o);
        } else {
            uebergangen.andere++;
        }
    }

    for (const o of haltungen) {
        const name = _text(o, 'Objektbezeichnung');
        const von = _text(o, 'KnotenZulauf') || _text(o, 'Anfangsknoten');
        const bis = _text(o, 'KnotenAblauf') || _text(o, 'Endknoten');
        // Die eigene Geometrie (Start, Knickpunkte, Ende) in Dokumentreihenfolge.
        const geo = _erstes(o, 'Geometrie');
        let punkte = geo ? [...geo.getElementsByTagName('*')]
            .filter(e => ['Start', 'Ende', 'Knickpunkt', 'Punkt', 'Anfangspunkt', 'Endpunkt'].includes(e.localName))
            .map(_isyPunkt).filter(Boolean) : [];
        if (punkte.length < 2) {
            const a = knoten.get(von)?.ort, b = knoten.get(bis)?.ort;
            if (!a || !b) { warnungen.push(`ISYBAU: Haltung „${name}" ohne Lage und ohne bekannte Knoten übergangen`); continue; }
            punkte = [{ ...a }, { ...b }];
        }
        // Die Sohlhöhen der Haltung gelten an ihren Enden, dazwischen linear über die Länge.
        let oben = _isyZahl(o, 'SohlhoeheZulauf'), unten = _isyZahl(o, 'SohlhoeheAblauf');
        if (!Number.isFinite(oben)) oben = knoten.get(von)?.sohle;
        if (!Number.isFinite(unten)) unten = knoten.get(bis)?.sohle;
        if (Number.isFinite(oben) && Number.isFinite(unten)) {
            const laengen = [0];
            for (let i = 1; i < punkte.length; i++) laengen.push(laengen[i - 1] + Math.hypot(punkte[i].ost - punkte[i - 1].ost, punkte[i].nord - punkte[i - 1].nord));
            const gesamt = laengen[laengen.length - 1] || 1;
            punkte = punkte.map((p, i) => ({ ost: p.ost, nord: p.nord, hoehe: oben + (unten - oben) * laengen[i] / gesamt }));
        }
        const durchmesser = _profilM(_isyZahl(o, 'Profilbreite'));
        const g = _linienform(punkte, { ebene: 'ISYBAU Haltung', name });
        if (g) geometrien.push({ ...g, ...(Number.isFinite(durchmesser) ? { durchmesser } : {}) });
    }

    for (const [art, n] of Object.entries(uebergangen)) {
        if (n) warnungen.push(`ISYBAU: ${n} × ${art === 'andere' ? 'andere Objektart' : art} übergangen`);
    }
    return { geometrien, warnungen };
}
