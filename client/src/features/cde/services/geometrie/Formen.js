/**
 * Die Formen des Geometrie-Kernels (Teil XIV, G1).
 *
 * Der Kernel rechnet ZWISCHEN Formen — und eine Form ist ein Datenvertrag,
 * kein Klassenname. Sechs davon reichen für alle Pipelines der
 * Infrastrukturplanung (Teil XIV, §1); jede Operation deklariert, welche
 * Form sie in welchem Schlitz erwartet und welche sie herausgibt.
 *
 * Verbindlich für ALLE Formen:
 *   - Float64. Nie Float32 — der Rest des Stacks rechnet Float64, und ein
 *     Volumen aus Float32-Koordinaten in Landesgrösse ist eine Schätzung.
 *   - Welt-XYZ in three-Konvention: X/Z Grundriss, Y ist die Höhe
 *     (festgeschrieben in Bauteilrezepte.js — hier nur wiederholt).
 *   - Dreieckslisten sind NICHT indiziert: 9 Zahlen je Dreieck. Das ist die
 *     Form, die der GeometryResolver liefert und `meshVolume` liest.
 *
 * `pruefeForm` ist der Türsteher am Kernel: ein Vertragsbruch (falsche Form
 * im Schlitz) ist ein PROGRAMMIERFEHLER und wirft — anders als fachliche
 * Nicht-Ableitbarkeit, die als `ergebnis: null` + Warnung zurückkommt.
 */

export const FORMEN = Object.freeze({
    mesh:    'Dreiecksliste — {positions: Float64Array (9 je Δ, Welt), triCount}',
    koerper: 'geschlossene Dreiecksliste mit Volumen-Attest — mesh + {closed, volumen, warnungen}',
    raster:  'Höhenraster — {x0, z0, maxX, maxZ, cell, nx, nz, heights: Float64Array}; Index ix*nz+iz, NaN = kein Treffer',
    linie:   'Polylinie — {punkte: [{x, y, z}]}; y darf NaN sein (noch nicht auf eine Fläche gelegt); eine ROHRACHSE trägt zusätzlich dn (mm) und achsbezug (\'sohle\'|\'mitte\', siehe Achsbezug.js)',
    knoten:  'Ein Punkt in Welt — {x, y, z}; der Netzknoten eines Schachts, optional name und unterkante (tiefster Punkt der Hülle = Schachtsohle)',
    umriss:  'Grundriss-Ring mit Löchern — {ring: [{x, z}], loecher: [[{x, z}]]}',
    profil:  'Querschnitt im Achsrahmen — {punkte: [{u, v}]}, geschlossen, gegen den Uhrzeigersinn',
    // Sammelformen für Ein-/Ausgänge, die Listen tragen:
    linien:  'Liste von Linien',
    punkte:  'Punktliste — [{x, y, z}]',
    paare:   'Kollisionspaare — [{a, b, volumen}]',
});

function _istFloat64(a) { return a instanceof Float64Array; }
function _endlich(v) { return typeof v === 'number' && Number.isFinite(v); }

function _pruefeMesh(m, fehler) {
    if (!m || typeof m !== 'object') { fehler.push('mesh fehlt'); return; }
    if (!_istFloat64(m.positions)) fehler.push('positions muss Float64Array sein (kein Float32)');
    if (!Number.isInteger(m.triCount) || m.triCount < 0) fehler.push('triCount fehlt');
    else if (m.positions?.length !== m.triCount * 9) fehler.push(`positions hat ${m.positions?.length} Zahlen, erwartet ${m.triCount * 9}`);
}

const PRUEFER = {
    mesh: _pruefeMesh,
    koerper(k, fehler) {
        _pruefeMesh(k, fehler);
        if (typeof k?.closed !== 'boolean') fehler.push('koerper braucht das Attest `closed`');
        if (!_endlich(k?.volumen)) fehler.push('koerper braucht `volumen`');
    },
    raster(r, fehler) {
        if (!r || typeof r !== 'object') { fehler.push('raster fehlt'); return; }
        for (const k of ['x0', 'z0', 'maxX', 'maxZ', 'cell']) if (!_endlich(r[k])) fehler.push(`raster.${k} fehlt`);
        if (!(r.cell > 0)) fehler.push('raster.cell muss > 0 sein');
        if (!Number.isInteger(r.nx) || !Number.isInteger(r.nz) || r.nx < 2 || r.nz < 2) fehler.push('raster.nx/nz müssen ≥ 2 sein');
        if (!_istFloat64(r.heights)) fehler.push('raster.heights muss Float64Array sein');
        else if (r.heights.length !== r.nx * r.nz) fehler.push(`raster.heights hat ${r.heights.length} Werte, erwartet nx·nz = ${r.nx * r.nz}`);
    },
    linie(l, fehler) {
        if (!Array.isArray(l?.punkte)) { fehler.push('linie.punkte fehlt'); return; }
        if (l.punkte.length < 2) fehler.push('linie braucht ≥ 2 Punkte');
        for (const p of l.punkte) {
            if (!_endlich(p?.x) || !_endlich(p?.z)) { fehler.push('linie: Punkt ohne endliches x/z'); break; }
        }
    },
    knoten(k, fehler) {
        if (!k || typeof k !== 'object') { fehler.push('knoten fehlt'); return; }
        if (!_endlich(k.x) || !_endlich(k.y) || !_endlich(k.z)) fehler.push('knoten braucht endliche x/y/z');
    },
    umriss(u, fehler) {
        if (!Array.isArray(u?.ring) || u.ring.length < 3) fehler.push('umriss.ring braucht ≥ 3 Punkte');
        if (u?.loecher !== undefined && !Array.isArray(u.loecher)) fehler.push('umriss.loecher muss eine Liste sein');
    },
    profil(p, fehler) {
        if (!Array.isArray(p?.punkte) || p.punkte.length < 3) fehler.push('profil.punkte braucht ≥ 3 Punkte');
        else if (!p.punkte.every(q => _endlich(q?.u) && _endlich(q?.v))) fehler.push('profil: Punkt ohne endliches u/v');
    },
    linien(l, fehler) {
        if (!Array.isArray(l)) { fehler.push('linien muss eine Liste sein'); return; }
        for (const x of l) PRUEFER.linie(x, fehler);
    },
    punkte(p, fehler) {
        if (!Array.isArray(p)) fehler.push('punkte muss eine Liste sein');
    },
    paare(p, fehler) {
        if (!Array.isArray(p)) fehler.push('paare muss eine Liste sein');
    },
};

/**
 * @param {*} wert
 * @param {string} form  Schlüssel aus FORMEN; `'koerper[]'`-artige Listen prüfen je Element
 * @returns {string[]} leer = gültig
 */
export function pruefeForm(wert, form) {
    const fehler = [];
    if (typeof form === 'string' && form.endsWith('[]')) {
        const einzeln = form.slice(0, -2);
        if (!Array.isArray(wert)) return [`${form}: Liste erwartet`];
        wert.forEach((w, i) => fehler.push(...pruefeForm(w, einzeln).map(f => `[${i}] ${f}`)));
        return fehler;
    }
    const pruefer = PRUEFER[form];
    if (!pruefer) return [`unbekannte Form „${form}"`];
    pruefer(wert, fehler);
    return fehler;
}
