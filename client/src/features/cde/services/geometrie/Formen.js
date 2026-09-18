/**
 * Die Formen des Geometrie-Kernels (Teil XIV, G1).
 *
 * Der Kernel rechnet ZWISCHEN Formen — und eine Form ist ein Datenvertrag,
 * kein Klassenname. Wenige davon reichen für alle Pipelines der
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
    koerper: 'geschlossene Dreiecksliste mit Volumen-Attest — mesh + {closed, volumen, warnungen}; optional mengenart (\'gewachsen\'|\'lose\'|\'verdichtet\') und rolle',
    raster:  'Höhenraster — {x0, z0, maxX, maxZ, cell, nx, nz, heights: Float64Array}; Index ix*nz+iz, NaN = kein Treffer; optional stand (\'ur\'|\'vorher\'|\'nachher\'|\'anzeige\')',
    linie:   'Polylinie — {punkte: [{x, y, z}]}; y darf NaN sein (noch nicht auf eine Fläche gelegt); eine ROHRACHSE trägt zusätzlich dn (mm) und achsbezug (\'sohle\'|\'mitte\', siehe Achsbezug.js)',
    knoten:  'Ein Punkt in Welt — {x, y, z}; der Netzknoten eines Schachts, optional name, unterkante (tiefster Punkt der Hülle = Schachtsohle), oberkante und hoehenbezug (\'platzierung\'|\'sohle\': was y ist)',
    umriss:  'Grundriss-Ring mit Löchern — {ring: [{x, z}], loecher: [[{x, z}]]}',
    profil:  'Querschnitt im Achsrahmen — {punkte: [{u, v}]}, geschlossen, gegen den Uhrzeigersinn; optional art (\'kreis\'|\'rechteck\'|\'trapez\') und nennmass (mm)',
    platte:  'Ein Umriss mit Dicke — {umriss: [{x, y, z}], dicke (m), richtung (\'unten\'|\'oben\')}: der Umriss ist Ober- bzw. Unterkante, jeder Punkt mit seiner Höhe (Teil XXIII, A9)',
    // Sammelformen für Ein-/Ausgänge, die Listen tragen:
    linien:  'Liste von Linien',
    punkte:  'Punktliste — [{x, y, z}]',
    paare:   'Kollisionspaare — [{a, b, volumen}]',
});

/**
 * WAS DIE ZAHLEN BEDEUTEN (Teil XXIII, A9, Befund B19) — die Wertelisten der
 * optionalen Bedeutungsfelder. Fehlt ein Feld, gilt, was bisher galt; steht es
 * da, muss es einer dieser Werte sein.
 *
 * Nur Felder, die heute jemand LIEFERT: eine Station am Achsanfang, eine
 * Fliessrichtung an der Linie, eine Wanddicke am Profil oder ein Knoten „auf
 * dem Deckel" kennt keine Quelle — die Fliessrichtung ist ein Journalwert
 * (`fliessrichtung-setzen`), den die Kernel-Form nicht sieht. Sie kommen
 * mit ihrem ersten Lieferer, nicht auf Vorrat.
 */
export const BEDEUTUNGEN = Object.freeze({
    koerper: { mengenart: ['gewachsen', 'lose', 'verdichtet'] },
    raster:  { stand: ['ur', 'vorher', 'nachher', 'anzeige'] },
    linie:   { achsbezug: ['sohle', 'mitte'] },
    knoten:  { hoehenbezug: ['platzierung', 'sohle'] },
    profil:  { art: ['kreis', 'rechteck', 'trapez'] },
    platte:  { richtung: ['unten', 'oben'] },
});

/**
 * Ein Raster mit seinem Stand — als flache Kopie, weil Caches am Original
 * hängen (der Präfix-Cache des Ableitungslaufs ist eine WeakMap je Raster).
 * Die Höhen werden nicht kopiert, nur der Umschlag.
 */
export function mitStand(raster, stand) {
    return raster && typeof raster === 'object' ? { ...raster, stand } : raster;
}

function _pruefeBedeutung(form, wert, fehler) {
    for (const [feld, werte] of Object.entries(BEDEUTUNGEN[form] ?? {})) {
        if (wert?.[feld] !== undefined && wert?.[feld] !== null && !werte.includes(wert[feld])) {
            fehler.push(`${form}.${feld} „${wert[feld]}" gibt es nicht (${werte.join(', ')})`);
        }
    }
}

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
        _pruefeBedeutung('koerper', k, fehler);
    },
    raster(r, fehler) {
        if (!r || typeof r !== 'object') { fehler.push('raster fehlt'); return; }
        for (const k of ['x0', 'z0', 'maxX', 'maxZ', 'cell']) if (!_endlich(r[k])) fehler.push(`raster.${k} fehlt`);
        if (!(r.cell > 0)) fehler.push('raster.cell muss > 0 sein');
        if (!Number.isInteger(r.nx) || !Number.isInteger(r.nz) || r.nx < 2 || r.nz < 2) fehler.push('raster.nx/nz müssen ≥ 2 sein');
        if (!_istFloat64(r.heights)) fehler.push('raster.heights muss Float64Array sein');
        else if (r.heights.length !== r.nx * r.nz) fehler.push(`raster.heights hat ${r.heights.length} Werte, erwartet nx·nz = ${r.nx * r.nz}`);
        _pruefeBedeutung('raster', r, fehler);
    },
    linie(l, fehler) {
        if (!Array.isArray(l?.punkte)) { fehler.push('linie.punkte fehlt'); return; }
        if (l.punkte.length < 2) fehler.push('linie braucht ≥ 2 Punkte');
        for (const p of l.punkte) {
            if (!_endlich(p?.x) || !_endlich(p?.z)) { fehler.push('linie: Punkt ohne endliches x/z'); break; }
        }
        _pruefeBedeutung('linie', l, fehler);
    },
    knoten(k, fehler) {
        if (!k || typeof k !== 'object') { fehler.push('knoten fehlt'); return; }
        if (!_endlich(k.x) || !_endlich(k.y) || !_endlich(k.z)) fehler.push('knoten braucht endliche x/y/z');
        for (const f of ['unterkante', 'oberkante']) if (k[f] !== undefined && !_endlich(k[f])) fehler.push(`knoten.${f} muss endlich sein`);
        _pruefeBedeutung('knoten', k, fehler);
    },
    umriss(u, fehler) {
        if (!Array.isArray(u?.ring) || u.ring.length < 3) fehler.push('umriss.ring braucht ≥ 3 Punkte');
        if (u?.loecher !== undefined && !Array.isArray(u.loecher)) fehler.push('umriss.loecher muss eine Liste sein');
    },
    profil(p, fehler) {
        if (!Array.isArray(p?.punkte) || p.punkte.length < 3) fehler.push('profil.punkte braucht ≥ 3 Punkte');
        else if (!p.punkte.every(q => _endlich(q?.u) && _endlich(q?.v))) fehler.push('profil: Punkt ohne endliches u/v');
        _pruefeBedeutung('profil', p, fehler);
    },
    platte(p, fehler) {
        if (!Array.isArray(p?.umriss) || p.umriss.length < 3) fehler.push('platte.umriss braucht ≥ 3 Punkte');
        else if (!p.umriss.every(q => _endlich(q?.x) && _endlich(q?.y) && _endlich(q?.z))) fehler.push('platte: Punkt ohne endliches x/y/z');
        if (!(p?.dicke > 0)) fehler.push('platte.dicke muss > 0 sein');
        _pruefeBedeutung('platte', p, fehler);
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
