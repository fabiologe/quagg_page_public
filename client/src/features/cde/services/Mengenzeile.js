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

/** Die Ableitungen der ERDBAU-Vorgänge, die diese Einträge geschrieben haben (die Anzeige zählt nicht). */
export function erdbauAbleitungenAus(eintraege, istErdbau) {
    const ids = new Set();
    for (const e of (Array.isArray(eintraege) ? eintraege : [eintraege])) {
        if (e?.art === 'erzeugt' && e.nachher?.ableitung && istErdbau(e.nachher.rezept)) ids.add(e.nachher.ableitung);
    }
    return [...ids];
}
