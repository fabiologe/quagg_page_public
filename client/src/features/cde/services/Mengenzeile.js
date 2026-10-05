/**
 * Die MENGEN eines Vorgangs als eine Zeile (Teil XX, Fabio 2026-09-10: „es
 * fehlen nur die Volumen in m³").
 *
 * Gelesen werden DIESELBEN Kennzahlen wie im Mengen-Reiter und in der IFC-Qto
 * — eine zweite Rechnung gäbe irgendwann eine zweite Zahl. Welche Kennzahl
 * der Aushub IST, sagt `aushubMasseVon`: seit Teil XXI, P6 ist das beim
 * Kanalgraben der Profilkörper und nicht mehr das Raster.
 */
import { aushubMasseVon } from './ableitung/Ableitungen.js';
import { mengenVon } from './Bauteilrezepte.js';

/** m³ deutsch: ab 10 m³ ganze, darunter eine Nachkommastelle. */
export function m3(v) {
    const w = v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
    return `${w.toLocaleString('de-DE')} m³`;
}

/**
 * @param {Array<object|null>} kennzahlenListe  je Vorgang die Kennzahlen aus dem Lauf
 * @returns {string}  '' ohne gebauten Vorgang; sonst „Aushub … · Auftrag …"
 */
export function mengenZeile(kennzahlenListe = []) {
    let aushub = 0, auftrag = 0, verfuellung = 0, gefunden = false;
    for (const k of kennzahlenListe ?? []) {
        if (!k) continue;
        gefunden = true;
        const a = aushubMasseVon(k);
        if (Number.isFinite(a)) aushub += a;
        if (Number.isFinite(k.verfuellung)) verfuellung += k.verfuellung;
        else if (Number.isFinite(k.auftragRaster)) auftrag += k.auftragRaster;
    }
    if (!gefunden) return '';
    const teile = [];
    if (aushub > 0.05) teile.push(`Aushub ${m3(aushub)}`);
    if (auftrag > 0.05) teile.push(`Auftrag ${m3(auftrag)}`);
    if (verfuellung > 0.05) teile.push(`Verfüllung ${m3(verfuellung)}`);
    return teile.length ? teile.join(' · ') : 'keine Erdmassen';
}

/**
 * Die Massen für die Pille am gezogenen Griff (Teil XXX, B7): ein Körper mit Volumen (Schicht, Raum) als
 * „Volumen 412 m³ (+12)" gegen den Stand vor dem Zug; ein Erdbau-Vorgang wie die Zeile nach dem Übernehmen.
 * @param {object|null} kz      die Kennzahlen, wenn der Zug gälte (`autor.probeKennzahlen`)
 * @param {object|null} vorher  die Kennzahlen des letzten Aufbaus
 */
export function mengenLive(kz, vorher = null) {
    if (!kz) return '';
    if (Number.isFinite(kz.volumen)) {
        const d = Number.isFinite(vorher?.volumen) ? kz.volumen - vorher.volumen : 0;
        const delta = Math.abs(d) >= 0.05 ? ` (${d > 0 ? '+' : '−'}${m3(Math.abs(d)).replace(' m³', '')})` : '';
        return `Volumen ${m3(kz.volumen)}${delta}`;
    }
    return mengenZeile([kz]);
}

/** Die Ableitungen der ERDBAU-Vorgänge, die diese Einträge geschrieben haben (die Anzeige zählt nicht). */
export function erdbauAbleitungenAus(eintraege, istErdbau) {
    const ids = new Set();
    for (const e of (Array.isArray(eintraege) ? eintraege : [eintraege])) {
        if (e?.art === 'erzeugt' && e.nachher?.ableitung && istErdbau(e.nachher.rezept)) ids.add(e.nachher.ableitung);
    }
    return [...ids];
}

/** Die Qto-Felder mit deutschem Namen — was ein Planer liest, nicht was im Schema steht. */
const KENNWERT_TITEL = Object.freeze({
    undisturbedVolume: 'Aushub (gewachsen)', looseVolume: 'Aushub (lose, abzufahren)', compactedVolume: 'Auftrag (verdichtet)',
    length: 'Länge', width: 'Breite', height: 'Höhe', depth: 'Tiefe', thickness: 'Dicke', perimeter: 'Umfang',
    volume: 'Volumen', grossVolume: 'Volumen', netVolume: 'Volumen netto', grossArea: 'Fläche', netArea: 'Fläche netto',
    grossSideArea: 'Seitenfläche', netSideArea: 'Seitenfläche netto', grossFootprintArea: 'Grundfläche',
    netFootprintArea: 'Grundfläche netto', grossFloorArea: 'Bodenfläche', netFloorArea: 'Bodenfläche netto',
    crossSectionArea: 'Querschnitt', outerSurfaceArea: 'Mantelfläche', grossSurfaceArea: 'Oberfläche',
});
const _zahl = (v, n = 2) => v.toLocaleString('de-DE', { minimumFractionDigits: n, maximumFractionDigits: n });

/**
 * DIE KENNWERTE EINES EIGENEN BAUTEILS (Teil XXX, Übersicht der Tafel): seine Mengen mit deutschem Namen und Einheit —
 * dieselben Zahlen, die ins IFC gehen (`mengenVon`, Qto) und im Mengen-Reiter stehen, aus dem letzten Aufbau. Vorher
 * standen sie nur an Erdbau-Vorgängen und ganz unten im Eigenschaftsfenster.
 *
 * Netto gleich brutto steht einmal. Am Erdbau dazu der Auflockerungsfaktor und die Gegenprobe Körper ↔ Raster.
 * @returns {Array<{feld, titel, wert}>}
 */
export function kennwerteVon(plan, kennzahlen = null) {
    if (!plan) return [];
    const m = mengenVon(plan, kennzahlen);
    const zeilen = [];
    for (const [feld, v] of Object.entries(m)) {
        if (!Number.isFinite(v)) continue;
        const brutto = feld.replace(/^net/, 'gross');
        if (feld.startsWith('net') && brutto in m && Math.abs(m[brutto] - v) < 1e-9) continue;   // netto = brutto
        const titel = KENNWERT_TITEL[feld] ?? feld.replace(/([A-Z])/g, ' $1').toLowerCase();
        const wert = /volume$/i.test(feld) ? m3(v) : /area$/i.test(feld) ? `${_zahl(v)} m²` : `${_zahl(v)} m`;
        zeilen.push({ feld, titel, wert });
    }
    if (!zeilen.length) return zeilen;
    // DER FAKTOR, MIT DEM GERECHNET WURDE (Teil XXI, P4): ohne ihn steht die lose Masse als Zahl da, die niemand
    // nachrechnen kann.
    if (Number.isFinite(kennzahlen?.auflockerung) && zeilen.some(z => z.feld === 'looseVolume')) {
        zeilen.push({ feld: 'auflockerung', titel: 'Auflockerung', wert: `× ${_zahl(kennzahlen.auflockerung)}` });
    }
    // DIE GEGENPROBE (Teil XXI, P4): Körper gegen Raster — man sieht auch, wie gut sie stimmt.
    const abw = plan.rolle === 'auftrag' ? kennzahlen?.gegenprobeAuftrag : kennzahlen?.gegenprobeAushub;
    if (Number.isFinite(abw)) {
        zeilen.push({ feld: 'gegenprobe', titel: 'Gegenprobe Körper ↔ Raster',
                      wert: `${(abw * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %` });
    }
    return zeilen;
}
