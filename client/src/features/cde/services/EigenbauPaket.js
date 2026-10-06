/**
 * Das Eigenbau-Paket: was die CDE selbst erzeugt hat, für den IFC-Schreiber.
 *
 * DIE LÜCKE (2026-09-10). Der Verbundexport schreibt gelieferte IFC-Dateien
 * zusammen. Die Bauteile, die die CDE SELBST erzeugt — Aushub, Auftrag,
 * Kanalgraben, Baugrube, Rohre, Schächte —, lebten nur im Journal und im
 * fragments-Modell des Browsers; einen IFC-Weg hatten sie nicht. Dieses Paket
 * trägt sie zum Schreiber (`backend/app/ifc/eigenbau.py`), der daraus eine
 * gewöhnliche Quelle für den Verbund macht — geprüft mit DEMSELBEN Prüftor.
 *
 * DIE UMRECHNUNG PASSIERT HIER, NICHT IM SCHREIBER. Die CDE rechnet in der
 * three-Welt (Y oben, Nord auf −Z, Ladeversatz); IFC will Landeskoordinaten
 * mit Z oben. Umgerechnet wird über `nachProjekt` — dieselbe Funktion, mit der
 * die CDE jede Projektkoordinate rechnet (Koordinatenleiste, Lageplan, DXF).
 * Zwei Umrechnungen wären zwei Wahrheiten über dieselbe Lage.
 *
 * DIE ACHSDREHUNG ERHÄLT DIE WICKLUNG. (x, y, z) → (x, −z, y) ist eine
 * eigentliche Drehung (Determinante +1): was in der CDE nach aussen zeigt,
 * zeigt es auch im IFC. Ein Test hält das am Volumen fest.
 *
 * JE BAUTEIL:
 *  - ECKEN VERSCHWEISST. Die CDE baut Dreiecke mit eigenen Ecken (flache
 *    Facetten); im IFC wären das dreimal so viele Punkte wie nötig. Auf dem
 *    Millimeter zusammengelegt, und Dreiecke, die dabei zu einer Kante
 *    entarten, fallen — gezählt, nicht still.
 *  - EIN URSPRUNG je Bauteil. Die Platzierung trägt den grossen Landeswert,
 *    die Punkte bleiben klein: 2,5 Millionen Meter in jedem einzelnen Punkt
 *    kosten Stellen, die ein Empfänger im Float verliert.
 *  - DER WIRT eines Aushubs. `IfcEarthworksCut` ist schemawidrig ohne das
 *    Bauteil, das er aushöhlt (Prüftor, erster Lauf). Der Wirt ist IMMER das
 *    UR-Gelände (Stufe 1: jeder Vorgang fusst darauf). Nur Alt-Journale nennen
 *    noch ein eigenes DGM — dann wird bis zum gelieferten zurückgegangen.
 *
 * PAKET v2 (Stufe 2 des Aushub-Fachmodells, 2026-09-10). Die ANZEIGEFORM —
 * die geformte Fläche, die der Raum zeigt — kommt nicht mehr mit: sie war im
 * IFC ein zweites TERRAIN am selben Ort, und der Aushub stand damit dreimal
 * in der Datei (Void im Ur, Körper des Cut, abgesenkte Kopie). `ersetzt`
 * entfällt deshalb. Neu je Bauteil: der VORGANG (eine Gruppe im IFC), die
 * MENGEN (Qto, deklariert am Rezept), die QUELLEN (Ur direkt, Rohre,
 * Schächte, Bauteil), das FACHMODELL und die Füllungen, durch die ein Cut
 * schneidet. Je Paket: die QUELLDOKUMENTE — die Registerdateien, in denen die
 * Wirte liegen (das Erdbau-Dokument nimmt genau sie als Quelle).
 *
 * Rein: kein three, kein Vue, keine Engine. Die Geometrie kommt als
 * Positions-/Indexfelder herein (aus `IfcAutor.eigenbauGeometrien`).
 */
import { BAUTEILFARBEN, farbeFuer } from './Bauteilfarben.js';
import { istAbzug, istAushub } from './Kategorien.js';
import { klassifikationVon } from './katalog/Bauwerkstypen.js';
import { BAUWERKSARTEN, lagemerkmaleVon, objektTypVon, rechenmerkmaleVon } from './Bauteilrezepte.js';
import { vorlageNach } from './rezept/Bauwerksvorlagen.js';
import { bildeAb, materialVon } from './bimfy/isybau/Abbildung.js';
import { zustandVon, zustandsfarbe } from './Zustand.js';
import { herleitungText } from './bimfy/muster/Herleitung.js';

export const PAKET_VERSION = 2;
/** Auf diesem Raster werden Ecken zusammengelegt (Meter). */
export const SCHWEISS_M = 0.001;


/**
 * Welt-Positionen (x, y, z je Ecke) → Landeskoordinaten (Ost, Nord, Höhe).
 * @param {ArrayLike<number>} positionen
 * @param {(p: {x,y,z}) => {ost, nord, hoehe}} nachProjekt
 * @returns {Float64Array}
 */
export function nachLandes(positionen, nachProjekt) {
    const n = Math.floor((positionen?.length ?? 0) / 3);
    const aus = new Float64Array(n * 3);
    const p = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < n; i++) {
        p.x = positionen[i * 3]; p.y = positionen[i * 3 + 1]; p.z = positionen[i * 3 + 2];
        const q = nachProjekt(p);
        aus[i * 3] = q.ost; aus[i * 3 + 1] = q.nord; aus[i * 3 + 2] = q.hoehe;
    }
    return aus;
}

/**
 * Ecken zusammenlegen und Dreiecke nachziehen.
 *
 * @param {Float64Array} landes   Ecken in Landeskoordinaten
 * @param {ArrayLike<number>|null} index  Dreiecksindex (null = je drei Ecken ein Dreieck)
 * @returns {{punkte: number[][], dreiecke: number[][], entartet: number}}
 */
export function verschweisse(landes, index = null, { raster = SCHWEISS_M } = {}) {
    const n = Math.floor(landes.length / 3);
    const neuVon = new Int32Array(n);
    const karte = new Map();
    const punkte = [];
    for (let i = 0; i < n; i++) {
        const x = landes[i * 3], y = landes[i * 3 + 1], z = landes[i * 3 + 2];
        const k = `${Math.round(x / raster)}|${Math.round(y / raster)}|${Math.round(z / raster)}`;
        let j = karte.get(k);
        if (j === undefined) { j = punkte.length; karte.set(k, j); punkte.push([x, y, z]); }
        neuVon[i] = j;
    }
    const idx = index ?? Array.from({ length: n }, (_, i) => i);
    const dreiecke = [];
    let entartet = 0;
    for (let t = 0; t + 2 < idx.length; t += 3) {
        const a = neuVon[idx[t]], b = neuVon[idx[t + 1]], c = neuVon[idx[t + 2]];
        if (a === b || b === c || a === c) { entartet++; continue; }
        dreiecke.push([a, b, c]);
    }
    return { punkte, dreiecke, entartet };
}

/**
 * Den Ursprung herausziehen: abgerundete Mindestecke; die Punkte werden
 * relativ dazu und auf den Millimeter gerundet.
 */
export function mitUrsprung(punkte) {
    if (!punkte.length) return { ursprung: [0, 0, 0], punkte: [] };
    const min = [Infinity, Infinity, Infinity];
    for (const p of punkte) for (let k = 0; k < 3; k++) if (p[k] < min[k]) min[k] = p[k];
    const ursprung = min.map(v => Math.floor(v));
    const r = (v) => Math.round(v * 1000) / 1000;
    return { ursprung, punkte: punkte.map(p => [r(p[0] - ursprung[0]), r(p[1] - ursprung[1]), r(p[2] - ursprung[2])]) };
}

/**
 * Der Wirt eines Aushubs: das Gelände, auf dem geformt wurde.
 *
 * Ist die Quelle selbst ein EIGENES Gelände, das nicht mit exportiert wird
 * (ein verborgenes CDE-DGM als Quelle eines Kanalgrabens), wird entlang der
 * Quellen zurückgegangen — bis zu einem exportierten Bauteil oder einem
 * gelieferten. Zyklen sind durch das Journal ausgeschlossen (Teil XIV); ein
 * Deckel schützt trotzdem.
 *
 * Die `historie` (letzter bekannter Bauplan je Kennung) trägt die Kette durch
 * ZURÜCKGENOMMENES (Fahrplan Erdbau-Container, Stufe 1): ohne sie blieb der
 * Wirt eines Aushubs, dessen Anzeige zurückgenommen war, die tote `cde-`-Kennung
 * — und der Server lehnte „Wirt ohne Registerdokument" ab. Die Regel selbst
 * bleibt die alte (jedes nicht exportierte eigene Glied wird durchlaufen) —
 * sie ist weiter als `urGelaendeVon`, das nur über Anzeigeformen läuft.
 */
export function wirtVon(plan, stand, exportiert, historie = null) {
    let gid = plan?.parameter?.quellen?.gelaende ?? null;
    for (let tiefe = 0; gid && tiefe < 16; tiefe++) {
        if (!String(gid).startsWith('cde-') || exportiert.has(gid)) return gid;
        const vorher = stand?.get?.(gid) ?? historie?.get?.(gid);
        const weiter = vorher?.parameter?.quellen?.gelaende ?? null;
        if (!weiter) return gid;            // Ende der Kette — dann eben der letzte bekannte
        gid = weiter;
    }
    return gid;
}

/**
 * DER TYP EINES BAUTEILS (Teil XXIII, A9b — Befund B21): die Vorlage, aus der
 * es entstand (A1: `parameter.vorlage`). Im IFC wird daraus je Vorlage EIN
 * `Ifc…Type` mit `IfcRelDefinesByType`. Ohne Vorlage kein Typ — und kein
 * leerer Schlüssel im Paket. Den Namen kennt die Bibliothek; ohne sie steht
 * die Id (der Schreiber nimmt sie dann als Namen).
 *
 * @returns {{id: string, name: string|null}|null}
 */
export function typAusVorlage(plan) {
    const id = plan?.parameter?.vorlage;
    return id === undefined || id === null || id === '' ? null : { id: String(id), name: null };
}

/**
 * Ein Bauteil fürs Paket.
 *
 * @param {object} teil  aus `IfcAutor.eigenbauGeometrien`: {globalId, wert,
 *        positionen, index, kategorie, name, predefinedType, geschlossen,
 *        kennzahlen, mengen, fachmodell, vorgang, schneidetAuffuellung}
 * @returns {object|null}  null, wenn nach dem Verschweissen nichts übrig bleibt
 */
export function bauteilFuersPaket(teil, { nachProjekt, stand, exportiert, farbsatz = BAUTEILFARBEN, historie = null,
                                         typVon = typAusVorlage } = {}) {
    const plan = teil?.wert ?? {};
    const landes = nachLandes(teil.positionen, nachProjekt);
    const { punkte, dreiecke, entartet } = verschweisse(landes, teil.index ?? null);
    if (punkte.length < 3 || !dreiecke.length) return null;
    const { ursprung, punkte: lokal } = mitUrsprung(punkte);
    // LAGEMERKMALE (Fund 10): eine Höhe, die der Körper schon kennt — die
    // Oberkante einer Überlaufschwelle —, gemessen an DENSELBEN Landespunkten,
    // die in die Datei gehen. Getippte Merkmale (aus Feldern) gehen vor nichts:
    // ein Merkmal hat genau eine Quelle, das Katalogschema hält sie getrennt.
    let oberkante = -Infinity, unterkante = Infinity;
    for (const p of punkte) { if (p[2] > oberkante) oberkante = p[2]; if (p[2] < unterkante) unterkante = p[2]; }
    const merkmale = { ...(teil.merkmale ?? {}) };
    for (const [satz, werte] of Object.entries(lagemerkmaleVon(plan, { oberkante, unterkante }))) {
        merkmale[satz] = { ...(merkmale[satz] ?? {}), ...werte };
    }
    // RECHENMERKMALE (Teil XXVIII, V6): Körper × Feld — aus DENSELBEN Mengen, die ins Paket gehen.
    for (const [satz, werte] of Object.entries(rechenmerkmaleVon(plan, teil.mengen ?? {}))) {
        merkmale[satz] = { ...(merkmale[satz] ?? {}), ...werte };
    }
    const klasse = String(teil.kategorie ?? plan.kategorie ?? '').toUpperCase();
    // SACHDATEN DER QUELLE (Fahrplan Sachdaten P4): Klartexte und bSI-Merkmale, wo IFC ein Feld hat.
    // Ein Merkmal hat EINE Quelle — was Felder, Lage oder Rechnung schon setzen, bleibt.
    const abbildung = bildeAb(plan?.parameter?.stammdaten, { klasse });
    _fuegeAn(merkmale, abbildung.merkmale);
    // Der Zustand (Zustand.js) färbt vor dem Typ: Neubau und Rückbau auch in der Datei, Bestand bleibt in Typfarbe.
    const f = zustandsfarbe(zustandVon(plan, (g) => stand?.get?.(g))) ?? farbeFuer(klasse, farbsatz);
    const q = plan?.parameter?.quellen ?? {};
    const ur = q.gelaende ? wirtVon(plan, stand, exportiert, historie) : null;
    const aushub = istAushub(klasse);          // Wurzel im Baum (Kategorien.js): Wirt = Ur-Gelände
    const typ = typVon(plan);
    return {
        cdeId: teil.globalId,
        klasse,
        predefinedType: teil.predefinedType ?? plan.predefinedType ?? null,
        // Der Fachbegriff (Fund 8) — nur mit USERDEFINED Pflicht, sonst eine Verfeinerung.
        ...(objektTypVon(plan) ? { objektTyp: objektTypVon(plan) } : {}),
        name: teil.name ?? plan.name ?? '',
        rezept: plan.rezept ?? null,
        rolle: plan.rolle ?? null,
        ableitung: plan.ableitung ?? null,
        farbe: f?.farbe ?? null,
        deckkraft: f?.deckkraft ?? 1,
        geschlossen: teil.geschlossen ?? null,
        ursprung,
        punkte: lokal,
        dreiecke,
        // Ein Aushub am Ur-Gelände; eine ÖFFNUNG (Teil XXVII, B3) an dem Bauteil, das sie nennt.
        wirt: aushub ? ur : (istAbzug(klasse) ? (q.wirt ?? null) : null),
        fachmodell: teil.fachmodell ?? 'cde',
        vorgang: teil.vorgang ?? null,
        mengen: teil.mengen ?? {},
        quellen: _quellenFuersPaket(q, ur),
        // Nur ein Cut schneidet durch Füllungen früherer Vorgänge.
        schneidetAuffuellung: aushub ? (teil.schneidetAuffuellung ?? []) : [],
        aushubAusAuffuellung: aushub ? (teil.kennzahlen?.aushubAusAuffuellung ?? null) : null,
        hinweis: entartet ? `${entartet} entartete Dreiecke beim Verschweissen entfernt` : null,
        // OPTIONAL (Paket v2, A9b): nur mit Vorlage — ein älterer Schreiber übergeht ihn.
        ...(typ ? { typ } : {}),
        // OPTIONAL (Teil XXVI, Z3): bSI-Merkmale aus Rezeptfeldern. Nur wenn es welche
        // gibt — ein Paket ohne sie bleibt Byte für Byte, was es war.
        ...(Object.keys(merkmale).length ? { merkmale } : {}),
        // OPTIONAL (BIMFY I2): woher jedes Mass stammt — nur wenn der Bauplan es sagt.
        ...(herleitungText(plan?.parameter?.herleitung) ? { herleitung: herleitungText(plan.parameter.herleitung) } : {}),
        // OPTIONAL (Teil XXVI, Z5d): das Bauwerk, zu dem dieses Teil gehört (E17: EIN Wert).
        ...(plan?.parameter?.teilVon ? { teilVon: plan.parameter.teilVon } : {}),
        // OPTIONAL (Fahrplan Sachdaten P3): die Sachdaten der Quelle, unverändert → `ISYBAU_Stammdaten`.
        ..._stammdaten(plan?.parameter, abbildung.texte),
        // OPTIONAL (Fahrplan Sachdaten P4b): das Material aus der Quelle — vom Rohr selbst, beim Schachtteil
        // vom Bauwerk. Ohne Angabe keins (eine Norm-Annahme ist keine Materialangabe).
        ..._material(materialVon(plan?.parameter?.stammdaten ?? stand?.get?.(plan?.parameter?.teilVon)?.parameter?.stammdaten,
                                 plan?.rezept)),
        // OPTIONAL (Z4): wie gemessen wurde — nur, wenn es NICHT die Vorgabe des
        // Schreibers ist (Raster, der Erdbau). Ein Erdbau-Paket bleibt so, wie es war.
        ...(teil.mengenMethode && teil.mengenMethode !== 'raster' ? { mengenMethode: teil.mengenMethode } : {}),
    };
}

/**
 * Die Quellen eines Bauteils, wie der Schreiber sie braucht: das Gelände als
 * UR (nie eine Anzeigeform), Rohre und Schächte als Listen (Alt-Journale
 * nennen `rohr` einzeln), das Bauteil einer Baugrube.
 */
function _quellenFuersPaket(q, ur) {
    const liste = (x) => (Array.isArray(x) ? x : (x ? [x] : [])).filter(Boolean);
    return {
        gelaende: ur,
        rohre: [...liste(q.rohre), ...liste(q.rohr)],
        schaechte: liste(q.schaechte),
        bauteil: q.bauteil ?? null,
    };
}

/**
 * Eine BÖSCHUNGSKANTE fürs Paket (Teil XX Stufe B).
 *
 * Keine Fläche, keine Dreiecke — eine Polylinie. Sie geht denselben Weg wie
 * jedes Bauteil: Welt → Landeskoordinaten → eigener Ursprung, damit der
 * Schreiber mit kleinen Zahlen arbeitet. Im IFC wird daraus ein
 * `IfcAnnotation` in der Vorgangsgruppe.
 *
 * @returns {object|null}  null, wenn weniger als zwei brauchbare Punkte bleiben
 */
export function kanteFuersPaket(kante, { nachProjekt } = {}) {
    const roh = (kante?.punkte ?? []).filter(p => [p?.x, p?.y, p?.z].every(Number.isFinite));
    if (roh.length < 2) return null;
    const flach = new Float64Array(roh.length * 3);
    roh.forEach((p, i) => { flach[i * 3] = p.x; flach[i * 3 + 1] = p.y; flach[i * 3 + 2] = p.z; });
    const landes = nachLandes(flach, nachProjekt);
    const punkte = [];
    for (let i = 0; i < roh.length; i++) punkte.push([landes[i * 3], landes[i * 3 + 1], landes[i * 3 + 2]]);
    const { ursprung, punkte: lokal } = mitUrsprung(punkte);
    return { ableitung: kante.ableitung ?? null, art: String(kante.art ?? ''),
             geschlossen: !!kante.geschlossen, ursprung, punkte: lokal };
}

/**
 * Das Paket.
 *
 * @param {object} o
 * @param {Array}  o.teile        aus `IfcAutor.eigenbauGeometrien(...).bauteile`
 * @param {Array}  [o.kanten]     aus `IfcAutor.eigenbauGeometrien(...).kanten` — Böschungskanten je Vorgang
 * @param {Map}    o.stand        wirksamer erzeugt-Stand (gid → Bauplan) — für die Wirtkette
 * @param {Function} o.nachProjekt  Welt → {ost, nord, hoehe}
 * @param {string} o.crs          das WIRKSAME System (bei Widerspruch das erkannte)
 * @param {string[]} o.anzeigeformen  aus `eigenbauGeometrien` — stehen unter `uebersprungen`, mit Grund
 * @param {Array}  o.quellDokumente  Registerdateien der Wirte [{sha256, datei, revision, globalIds}]
 * @param {object} o.journal      {commit, sitzungOffen} — welcher Journalstand exportiert wurde
 * @returns {object}  JSON-tauglich
 */
export function baueEigenbauPaket({ teile = [], kanten = [], stand = new Map(), nachProjekt, crs = null, crsHerkunft = null,
                                   projektname = '', schluessel = '', bearbeiter = '', farbsatz = BAUTEILFARBEN,
                                   anzeigeformen = [], quellDokumente = [], journal = null, bauwerke = [],
                                   jetzt = new Date(), historie = null, typVon = typAusVorlage } = {}) {
    if (typeof nachProjekt !== 'function') throw new Error('EigenbauPaket: ohne nachProjekt keine Landeskoordinaten');
    const exportiert = new Set(teile.map(t => t.globalId));
    const bauteile = [];
    const uebersprungen = [];
    for (const t of teile) {
        const b = bauteilFuersPaket(t, { nachProjekt, stand, exportiert, farbsatz, historie, typVon });
        if (b) bauteile.push(b);
        else uebersprungen.push({ cdeId: t.globalId, grund: 'nach dem Verschweissen keine Fläche übrig' });
    }
    // Nicht still weglassen: die Anzeigeform steht im Raum, aber nicht im IFC.
    // DIE NETTOMENGE DES WIRTS (Teil XXVII, B3): eine Öffnung nimmt ihm, was in ihm
    // liegt (`volume` der Öffnung = Querschnitt × Dicke). Brutto bleibt der Körper.
    for (const o of bauteile) {
        if (!istAbzug(o.klasse) || istAushub(o.klasse) || !o.wirt) continue;
        const w = bauteile.find(t => t.cdeId === o.wirt);
        const v = o.mengen?.volume;
        if (!w || !Number.isFinite(w.mengen?.netVolume) || !Number.isFinite(v)) continue;
        w.mengen = { ...w.mengen, grossVolume: w.mengen.grossVolume ?? w.mengen.netVolume, netVolume: w.mengen.netVolume - v };
    }
    for (const gid of anzeigeformen) {
        uebersprungen.push({ cdeId: gid, grund: 'Anzeigeform — kein Bauteil: der Aushub ist ein IfcEarthworksCut am Ur-Gelände' });
    }
    return {
        version: PAKET_VERSION,
        crs,
        crsHerkunft,
        projektname,
        schluessel,
        bearbeiter,
        erzeugt: jetzt.toISOString(),
        journal,
        quellDokumente,
        bauteile,
        // OPTIONAL (Paket v2): fehlen sie, schreibt der Server nur die Körper.
        // Ein alter Client ohne Kanten bleibt damit gültig.
        kanten: kanten.map(k => kanteFuersPaket(k, { nachProjekt })).filter(Boolean),
        // OPTIONAL (Teil XXVI, Z5d): die Behälter. Nur wenn es welche gibt — ein
        // Paket ohne Bauwerke bleibt Byte für Byte, was es war. Welche IFC-Klasse
        // und Beziehung daraus wird, entscheidet der Schreiber aus `art`.
        ...(bauwerke.length ? { bauwerke: bauwerke.map(bauwerkFuersPaket) } : {}),
        uebersprungen,
    };
}

/** Ein Bauwerk fürs Paket: Kennung, Art, Name, und wozu es selbst gehört. */
export function bauwerkFuersPaket({ globalId, wert }) {
    const p = wert?.parameter ?? {};
    const klassifikation = p.bauwerkstyp ? klassifikationVon(p.bauwerkstyp) : null;
    const abbildung = bildeAb(p.stammdaten, { klasse: BAUWERKSARTEN[p.art]?.klasse });
    const merkmale = _fuegeAn(_bauwerkMerkmale(p) ?? {}, abbildung.merkmale);
    return {
        cdeId: globalId,
        art: p.art ?? null,
        name: wert?.name ?? p.name ?? '',
        ...(p.teilVon ? { teilVon: p.teilVon } : {}),
        // OPTIONAL (Fahrplan Sachdaten): die Ausführung eines Elements ohne Körper — der Schreiber prüft sie.
        ...(BAUWERKSARTEN[p.art]?.ohneKoerper && p.predefinedType ? { predefinedType: p.predefinedType } : {}),
        // OPTIONAL: der Fachbegriff einer Baugruppe → ObjectType (z. B. „Leitung" aus Rohrstücken und Bögen).
        ...(p.art === 'baugruppe' && p.objektTyp ? { objectType: p.objektTyp } : {}),
        // Der Bauwerkstyp als Klassifizierung (Z7) — aus dem Katalog, samt Quelle.
        ...(klassifikation ? { klassifikation } : {}),
        // OPTIONAL (BIMFY I5): die bSI-Merkmale, die eine Vorlage für ihr Bauwerk kennt (der Schacht).
        // … und die bSI-Merkmale aus den Sachdaten (Fahrplan Sachdaten P4).
        ...(Object.keys(merkmale).length ? { merkmale } : {}),
        // OPTIONAL (Fahrplan Sachdaten P3): die Sachdaten hängen am Bauwerk, nicht an den Teilen.
        ..._stammdaten(p, abbildung.texte),
        // OPTIONAL (P4b): das Material eines Elements ohne Körper (die Leitung nennt ihres).
        ..._material(materialVon(p.stammdaten, `bauwerk:${p.art}`)),
    };
}

/** Das Material fürs Paket — `{name, kategorie?, quelle}` oder nichts. */
function _material(m) {
    return m ? { material: { name: m.name, ...(m.kategorie ? { kategorie: m.kategorie } : {}), quelle: `ISYBAU ${m.pfad} = ${m.code}` } } : {};
}

/**
 * Die Sachdaten eines Bauplans fürs Paket — roh, dahinter die Klartexte der
 * Schlüssel (P4). Nur wenn welche da sind (ein Paket ohne bleibt, was es war).
 */
function _stammdaten(p, texte = {}) {
    const sd = p?.stammdaten;
    return sd && typeof sd === 'object' && Object.keys(sd).length ? { stammdaten: { ...sd, ...texte } } : {};
}

/** Merkmale anfügen, ohne ein schon gesetztes zu überschreiben (ein Merkmal, eine Quelle). */
function _fuegeAn(ziel, dazu) {
    for (const [satz, werte] of Object.entries(dazu ?? {})) ziel[satz] = { ...werte, ...(ziel[satz] ?? {}) };
    return ziel;
}

/** Die bSI-Merkmale eines Bauwerks aus seiner Vorlage — oder null. */
function _bauwerkMerkmale(p) {
    const bv = p?.bauwerksvorlage;
    const vorlage = bv ? vorlageNach(bv.id) : null;
    if (typeof vorlage?.merkmale !== 'function') return null;
    const m = vorlage.merkmale(bv.werte ?? {}, bv.rahmen ?? null);
    return Object.keys(m).length ? m : null;
}
