/**
 * SurveyPointParser.js
 * Parst terrestrische Vermessungspunkte aus verschiedenen Formaten.
 *
 * Wichtig: XYZ/ASC werden hier als PUNKTWOLKEN gelesen (kein Raster),
 * d.h. jede Zeile = ein Messpunkt mit X, Y, Z. Das ist der Unterschied
 * zum DGM-Import, der aus denselben Formaten ein reguläres Raster baut.
 */

const X_NAMES    = ['x', 'easting', 'rechtswert', 'east', 'lon', 'longitude'];
const Y_NAMES    = ['y', 'northing', 'hochwert',   'north', 'lat', 'latitude'];
const Z_NAMES    = ['z', 'hoehe', 'höhe', 'elev', 'elevation', 'height', 'alt', 'h'];
const LABEL_NAMES = ['name', 'id', 'punkt', 'label', 'bezeichnung', 'nr', 'pnr'];

function findColIndex(headers, candidates) {
    const h = headers.map(s => s.toLowerCase().trim());
    for (const c of candidates) {
        const idx = h.findIndex(col => col === c || col.startsWith(c + '_') || col.endsWith('_' + c));
        if (idx !== -1) return idx;
    }
    return -1;
}

/**
 * Parst eine XYZ- oder ASC-Textdatei als Punktwolke.
 * Erwartet je eine Zeile pro Punkt: "X Y Z" (Leerzeichen/Komma/Tab getrennt).
 * Kopfzeilen und Kommentare (#) werden übersprungen.
 * ASC-Grid-Header (ncols, nrows, …) werden ignoriert — nur numerische Zeilen zählen.
 *
 * @param {string} text
 * @returns {Array<{x: number, y: number, z: number}>}
 */
export function parseXYZPoints(text) {
    const lines = text.trim().split(/\r?\n/);
    const points = [];
    const ASC_HEADER_KEYS = new Set(['ncols', 'nrows', 'xllcorner', 'yllcorner', 'xllcenter', 'yllcenter', 'cellsize', 'nodata_value']);

    for (const line of lines) {
        const l = line.trim();
        if (!l || l.startsWith('#')) continue;

        // ASC-Header-Zeilen überspringen
        const firstToken = l.split(/\s+/)[0].toLowerCase();
        if (ASC_HEADER_KEYS.has(firstToken)) continue;

        // Erste Spalte muss eine Zahl sein
        if (isNaN(parseFloat(firstToken))) continue;

        const parts = l.split(/[\s,;]+/);
        if (parts.length < 3) continue;

        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        const z = parseFloat(parts[2]);

        if (isNaN(x) || isNaN(y) || isNaN(z)) continue;
        points.push({ x, y, z });
    }

    if (points.length === 0) throw new Error('Keine gültigen X Y Z Punkte in der Datei gefunden.');
    return points;
}

/**
 * Parst eine CSV-Datei mit Vermessungspunkten.
 * Erkennt Spalten (X/Y/Z, Easting/Northing/Höhe usw.) automatisch anhand der Kopfzeile.
 * Unterstützt Komma, Semikolon und Tab als Trennzeichen.
 *
 * @param {string} text
 * @returns {Array<{x: number, y: number, z: number, label?: string}>}
 */
export function parseCSVSurveyPoints(text) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error('CSV zu kurz — mindestens 1 Kopfzeile + 1 Datenpunkt erwartet.');

    const first = lines[0];
    const sep = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
    const headers = first.split(sep).map(h => h.replace(/["']/g, '').trim());

    const xCol   = findColIndex(headers, X_NAMES);
    const yCol   = findColIndex(headers, Y_NAMES);
    const zCol   = findColIndex(headers, Z_NAMES);
    const lblCol = findColIndex(headers, LABEL_NAMES);

    if (xCol === -1 || yCol === -1 || zCol === -1) {
        throw new Error(
            `X/Y/Z-Spalten nicht erkannt.\n` +
            `Gefundene Spalten: [${headers.join(', ')}]\n` +
            `Erwartet z.B.: X, Y, Z  oder  Easting, Northing, Hoehe`
        );
    }

    const points = [];
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(sep).map(p => p.replace(/["']/g, '').trim());
        const x = parseFloat(parts[xCol]);
        const y = parseFloat(parts[yCol]);
        const z = parseFloat(parts[zCol]);

        if (isNaN(x) || isNaN(y) || isNaN(z)) { skipped++; continue; }

        const label = lblCol !== -1 ? parts[lblCol] : undefined;
        points.push({ x, y, z, ...(label ? { label } : {}) });
    }

    if (points.length === 0) throw new Error('Keine gültigen Punkte in der CSV gefunden.');
    if (skipped > 0) console.warn(`[SurveyPointParser] ${skipped} Zeilen übersprungen (NaN-Werte).`);

    return points;
}

/**
 * Parst GeoJSON Point-Features.
 * Z aus coordinates[2] oder Properties (z, hoehe, elevation …).
 *
 * @param {object} json
 * @returns {Array<{x: number, y: number, z: number, label?: string}>}
 */
export function parseGeoJSONSurveyPoints(json) {
    const features = json.type === 'FeatureCollection'
        ? json.features
        : json.type === 'Feature'
        ? [json]
        : [];

    if (features.length === 0) throw new Error('Keine GeoJSON-Features gefunden.');

    const points = [];

    for (const feat of features) {
        if (!feat.geometry || feat.geometry.type !== 'Point') continue;

        const [gx, gy, gz] = feat.geometry.coordinates;
        const props = feat.properties || {};

        const z = (gz !== undefined && !isNaN(gz))
            ? gz
            : parseFloat(
                props.z ?? props.Z ??
                props.hoehe ?? props.höhe ?? props.Hoehe ??
                props.elevation ?? props.elev ?? props.height ?? NaN
            );

        if (isNaN(gx) || isNaN(gy) || isNaN(z)) continue;

        const label = props.name ?? props.id ?? props.punkt ?? props.label ?? undefined;
        points.push({ x: gx, y: gy, z, ...(label !== undefined ? { label: String(label) } : {}) });
    }

    if (points.length === 0) {
        throw new Error(
            'Keine gültigen Punkte mit Z-Koordinate gefunden.\n' +
            'Geometrietyp muss "Point" sein, Z als coordinates[2] oder Property (z, elevation, hoehe).'
        );
    }

    return points;
}

/**
 * Universeller Parser — wählt automatisch die richtige Methode anhand des Dateinamens.
 *
 * @param {string} text      - Roher Dateiinhalt
 * @param {string} fileName  - Dateiname (für Format-Erkennung)
 * @returns {Array<{x: number, y: number, z: number, label?: string}>}
 */
export function parseSurveyFile(text, fileName) {
    const name = fileName.toLowerCase();

    if (name.endsWith('.xyz') || name.endsWith('.asc') || name.endsWith('.txt')) {
        return parseXYZPoints(text);
    }

    if (name.endsWith('.csv')) {
        return parseCSVSurveyPoints(text);
    }

    if (name.endsWith('.geojson') || name.endsWith('.json')) {
        return parseGeoJSONSurveyPoints(JSON.parse(text));
    }

    throw new Error(`Unbekanntes Dateiformat: ${fileName}\nUnterstützt: .xyz · .asc · .csv · .geojson`);
}
