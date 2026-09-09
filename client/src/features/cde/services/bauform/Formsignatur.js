/**
 * Die Formsignatur — was sich an einem Netz MESSEN lässt, ohne zu wissen,
 * was es ist (2026-09-07).
 *
 * DER ANLASS, an Fabios Datei: das DGM der fertigen Planung ist ein
 * `IfcCivilElement` (IFC4, in 4.3 gestrichen), offen, 45.710 Dreiecke,
 * 1.046 × 115 × 1.799 m. Kein Typprofil, keine Regel — und der alte
 * Geometrie-Rückfall kannte nur „echte Achse", „geschlossen" und „sonst":
 * ein Gelände wurde `netz`, und mit `netz` gibt es kein einziges Werkzeug.
 * Fünf von acht Bauformen waren ohne Deklaration UNERREICHBAR.
 *
 * WARUM DAS KEIN „TURM AUS SCHWELLWERTEN" IST (die Sorge im Kopf von
 * Bauformen.js, und sie bleibt berechtigt):
 *
 *   1. Vier Zahlen, jede eine physikalische Aussage, alle an EINER Stelle:
 *      FLACH, LIEGEND, LANG, EBEN. Keine Feinjustage je Modell.
 *   2. Drei davon sind Verhältnisse und damit EINHEITENFREI — ob ein Modell
 *      in Millimetern oder Metern liegt, ändert an „flach" nichts. Nur EBEN
 *      ist ein absolutes Mass (Bauteile sind auf Zentimeter eben, Gelände
 *      nie), und es entscheidet nur ZWISCHEN Platte und Gelände.
 *   3. Das Ergebnis ist ein VORSCHLAG mit Güte `geschaetzt`, nie eine
 *      Deklaration. Er steht sichtbar in Toolbox und Panel, mit dem gemessenen
 *      Grund, und wird mit einem Klick zur Auslegung oder Regel — also zu
 *      Daten, die den Vorschlag ab dann überstimmen. „Regler statt Raterei"
 *      heisst nicht „nicht messen", sondern „das Gemessene zeigen und
 *      entscheiden lassen".
 *
 * WAS GEMESSEN WIRD — die Dimensionalität, nach der die acht Bauformen
 * sortiert sind:
 *
 *   ausdehnung   die achsparallele Hülle (Welt, Y ist oben)
 *   liegend      wie sehr die Fläche nach oben/unten zeigt — flächengewichtet
 *                |n_y|: ein Blatt 1, ein Rohr 2/π, ein Würfel ⅓, eine Wand ≈ 0
 *   relief       Höhe zu Grundfläche (e_y / √(e_x·e_z)) — ein Gelände ist flach,
 *                auch wenn es hügelig ist; ein Schacht ist es nie
 *   stehend      dasselbe quer: Dicke zu Standfläche (Wand)
 *   lang         längste zu mittlerer UND kürzester Ausdehnung
 *   obenEben     die nach oben zeigenden Ecken gegen ihre Ausgleichsebene:
 *                eine Decke liegt auf Zentimeter in einer Ebene, ein Gelände
 *                nicht — das trennt `flaeche+dicke` von `hoehenfeld`
 *   geschlossen  das Attest aus `meshVolume`
 *   achse        gemessen (Axis-Rep, Extrusion) / geschätzt (Skelett) / keine
 *
 * Rein: Float64, keine Engine, kein three. Läuft in Node.
 */

/** Höhe zu Grundflächenseite — darunter „liegt" etwas (Gelände 0,08, Platte 0,03; Schacht 1, DN-1000-Rohr 0,32). */
export const FLACH = 0.15;
/** Flächenanteil, der nach oben/unten zeigt — darüber ist es ein Blatt (Gelände ≥ 0,9; Rohr 0,64; Würfel 0,33). */
export const LIEGEND = 0.85;
/** Längste zu mittlerer Ausdehnung — darüber ist etwas ein Lauf (Rohr 30, Wand 3). */
export const LANG = 6;
/** Metrisch: bis zu dieser Abweichung (RMS) gilt eine Oberseite als EBEN. Bauteile ja, Gelände nie. */
export const EBEN = 0.05;

/** Ab diesem Anteil zeigt ein Dreieck „nach oben" (wie SurfaceOps/MeshOps). */
const NY_OBEN = 0.05;

function _ausdehnung(positions, triCount) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const n = triCount * 9;
    for (let i = 0; i < n; i += 3) {
        const x = positions[i], y = positions[i + 1], z = positions[i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (!Number.isFinite(minX)) return { x: 0, y: 0, z: 0 };
    return { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
}

/**
 * Flächengewichteter Anteil |n_y| und die Ecken der nach oben zeigenden
 * Dreiecke — EIN Durchlauf für beide Grössen.
 */
function _flaechen(positions, triCount) {
    let gesamt = 0, liegend = 0;
    const oben = [];   // [x, y, z, …] der nach oben zeigenden Ecken
    const unten = [];  // … und der nach unten zeigenden — für Blätter mit gekippter Wicklung
    for (let t = 0; t < triCount; t++) {
        const o = t * 9;
        const ax = positions[o], ay = positions[o + 1], az = positions[o + 2];
        const bx = positions[o + 3], by = positions[o + 4], bz = positions[o + 5];
        const cx = positions[o + 6], cy = positions[o + 7], cz = positions[o + 8];
        const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
        const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
        const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-12) continue;
        gesamt += len;
        liegend += Math.abs(ny);
        if (ny / len > NY_OBEN) oben.push(ax, ay, az, bx, by, bz, cx, cy, cz);
        else if (ny / len < -NY_OBEN) unten.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    }
    // Die OBERSEITE ist, was nach oben zeigt. Zeigt nichts nach oben (ein
    // offenes Blatt mit gekippter Wicklung — in IFC-Dateien keine Seltenheit),
    // gilt die Unterseite; beide zugleich NICHT: bei einer Platte lägen Deckel
    // und Boden in einer Anpassung, und ihre Dicke würde zur „Unebenheit".
    return { liegendAnteil: gesamt > 0 ? liegend / gesamt : 0, oben: oben.length ? oben : unten };
}

/**
 * RMS-Abweichung der Punkte von ihrer Ausgleichsebene y = a·x + b·z + c
 * (kleinste Quadrate, 3×3-Normalgleichungen). `null` bei zu wenig Punkten
 * oder entarteter Lage (alle Punkte auf einer Geraden).
 */
export function ebenheit(punkte) {
    const n = punkte.length / 3;
    if (n < 3) return null;
    // ZWEI Durchläufe: erst die Mittel, dann die Summen über ZENTRIERTE
    // Koordinaten. Bei Landeskoordinaten (10⁶) ist x² ≈ 10¹², und die
    // nachträgliche Zentrierung (Σx² − n·x̄²) löscht sich auf 10⁻³ aus —
    // gemessen: 4·10⁻⁵ statt 0 für eine exakte Ebene.
    let sx = 0, sz = 0, sy = 0;
    for (let i = 0; i < punkte.length; i += 3) { sx += punkte[i]; sy += punkte[i + 1]; sz += punkte[i + 2]; }
    const mx = sx / n, my = sy / n, mz = sz / n;
    let cxx = 0, cxz = 0, czz = 0, cxy = 0, czy = 0;
    for (let i = 0; i < punkte.length; i += 3) {
        const x = punkte[i] - mx, y = punkte[i + 1] - my, z = punkte[i + 2] - mz;
        cxx += x * x; cxz += x * z; czz += z * z;
        cxy += x * y; czy += z * y;
    }
    const det = cxx * czz - cxz * cxz;
    if (!(Math.abs(det) > 1e-12 * Math.max(1, cxx * czz))) return null;
    const a = (cxy * czz - czy * cxz) / det;
    const b = (czy * cxx - cxy * cxz) / det;
    let s = 0;
    for (let i = 0; i < punkte.length; i += 3) {
        const d = punkte[i + 1] - my - a * (punkte[i] - mx) - b * (punkte[i + 2] - mz);
        s += d * d;
    }
    return Math.sqrt(s / n);
}

/**
 * @param {object} netz
 * @param {Float64Array} netz.positions  unindizierte Dreiecke, Welt
 * @param {number} netz.triCount
 * @param {boolean} [netz.closed]        Attest aus meshVolume
 * @param {'gemessen'|'geschaetzt'|null} [netz.achse]
 * @returns {object} die Signatur — reine Messwerte, keine Deutung
 */
export function formsignatur({ positions, triCount = 0, closed = false, achse = null } = {}) {
    const leer = !positions?.length || !triCount;
    const e = leer ? { x: 0, y: 0, z: 0 } : _ausdehnung(positions, triCount);
    const { liegendAnteil, oben } = leer ? { liegendAnteil: 0, oben: [] } : _flaechen(positions, triCount);
    const grund = Math.sqrt(Math.max(e.x, 0) * Math.max(e.z, 0));
    const relief = grund > 1e-12 ? e.y / grund : Infinity;
    const stehendX = Math.sqrt(e.y * e.z) > 1e-12 ? e.x / Math.sqrt(e.y * e.z) : Infinity;
    const stehendZ = Math.sqrt(e.x * e.y) > 1e-12 ? e.z / Math.sqrt(e.x * e.y) : Infinity;
    const sortiert = [e.x, e.y, e.z].sort((p, q) => q - p);
    const lang = sortiert[1] > 1e-12 && sortiert[2] > 1e-12
        && sortiert[0] / sortiert[1] > LANG && sortiert[0] / sortiert[2] > LANG;
    const obenAbweichung = oben.length >= 9 ? ebenheit(oben) : null;
    return {
        triCount, ausdehnung: e, geschlossen: !!closed, achse: achse ?? null,
        liegendAnteil, relief, stehend: Math.min(stehendX, stehendZ),
        liegend: relief < FLACH || liegendAnteil > LIEGEND,
        stehendFlach: Math.min(stehendX, stehendZ) < FLACH && !(relief < FLACH),
        lang,
        obenAbweichung,
        obenEben: obenAbweichung === null ? null : obenAbweichung < EBEN,
    };
}

/**
 * Die Deutung — in der Reihenfolge der Sicherheit:
 *
 *   1. eine ECHTE Achse (Axis-Rep, Extrusion) macht linear — gemessen
 *   2. liegend flach: Oberseite eben ⇒ Platte/Fläche, sonst Höhenfeld
 *   3. stehend flach ⇒ Fläche mit Dicke (Wand)
 *   4. lang ⇒ Lauf — mit Volumen ein Schwelkörper, ohne eine Linie
 *   5. geschlossen ⇒ Körper — gemessen (nichts geschätzt)
 *   6. netz
 *
 * `punkt` kommt NIE aus der Geometrie: ein Baum und eine Pumpe sind beide
 * kompakte Körper; was davon ein Standort ist, weiss nur der Typ.
 *
 * @returns {{bauform: string, guete: 'gemessen'|'geschaetzt'|'unbekannt', grund: string}}
 */
export function bauformAusSignatur(s) {
    // Eine ECHTE Achse zuerst — auch ohne Netz: eine Trasse (IfcAlignment)
    // positioniert nur, sie hat kein Volumen. Ob daraus ein Schwelkörper oder
    // eine Linie wird, entscheidet, ob überhaupt Dreiecke da sind.
    if (s?.achse === 'gemessen') {
        return s.triCount > 0
            ? { bauform: 'achse+profil', guete: 'gemessen', grund: 'echte Achse mit Volumen' }
            : { bauform: 'linie', guete: 'gemessen', grund: 'echte Achse ohne Volumen' };
    }
    if (!s || !s.triCount) return { bauform: 'netz', guete: 'unbekannt', grund: 'kein Netz' };
    if (s.liegend) {
        const lage = s.relief < FLACH
            ? `liegend flach (Höhe ${_m(s.ausdehnung.y)} zu Grundfläche ${_m(s.ausdehnung.x)} × ${_m(s.ausdehnung.z)})`
            : `Blatt (${Math.round(s.liegendAnteil * 100)} % der Fläche zeigt nach oben oder unten)`;
        if (s.obenEben === true) {
            return s.geschlossen
                ? { bauform: 'flaeche+dicke', guete: 'geschaetzt', grund: `${lage}, Oberseite eben (±${_m(s.obenAbweichung)})` }
                : { bauform: 'flaeche', guete: 'geschaetzt', grund: `${lage}, eben, ohne Volumen` };
        }
        return { bauform: 'hoehenfeld', guete: 'geschaetzt',
                 grund: `${lage}, Oberseite uneben${s.obenAbweichung != null ? ` (±${_m(s.obenAbweichung)})` : ''}` };
    }
    if (s.stehendFlach) {
        return { bauform: 'flaeche+dicke', guete: 'geschaetzt',
                 grund: `stehend flach (Dicke zu Standfläche ${s.stehend.toFixed(2)})` };
    }
    if (s.lang) {
        const l = Math.max(s.ausdehnung.x, s.ausdehnung.y, s.ausdehnung.z);
        return s.geschlossen
            ? { bauform: 'achse+profil', guete: 'geschaetzt', grund: `lang (${_m(l)}) mit Volumen${s.achse ? ', Achse skelettiert' : ''}` }
            : { bauform: 'linie', guete: 'geschaetzt', grund: `lang (${_m(l)}) ohne Volumen` };
    }
    if (s.geschlossen) return { bauform: 'koerper', guete: 'gemessen', grund: 'geschlossener Körper' };
    return { bauform: 'netz', guete: s.achse === 'geschaetzt' ? 'geschaetzt' : 'unbekannt',
             grund: 'weder flach noch lang noch geschlossen' };
}

/** Eine Länge lesbar — die Signatur weiss nicht, ob Meter oder Millimeter vorliegen; sie zeigt die Zahl. */
function _m(v) {
    if (!Number.isFinite(v)) return '—';
    if (v >= 100) return `${Math.round(v)}`;
    if (v >= 1) return `${v.toFixed(1)}`;
    return `${v.toFixed(2)}`;
}

/** Signatur → Deutung in einem Zug — was `bestimme` ruft. */
export function bauformAusNetz(netz) {
    const signatur = formsignatur(netz);
    return { ...bauformAusSignatur(signatur), signatur };
}
