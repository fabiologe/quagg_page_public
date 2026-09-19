/**
 * Das Kommando — die EINE Naht zwischen Oberfläche und Modell (Teil XXIV, K1).
 *
 * Ein Kommando ist eine ABSICHT als Wert: welches Werkzeug, an welchen Zielen,
 * mit welchen Eingaben und Werten. Die Oberfläche baut Kommandos, die Auswertung
 * (`Auswertung.js`) macht daraus Journalschritte. Das Schema steht mit Beispielen
 * in `docs/cde/kommando/kommandodefinition.md`; Fabio hat es am 2026-09-18
 * angenommen (samt den Empfehlungen O1–O7).
 *
 * Die Regeln, die hier geprüft werden, sind die aus Fabios Entscheidungen:
 *   - Ziele sind GlobalIds, nie ein Index (E3), nie ein Name.
 *   - Werte sind absolut; Lage in Projektkoordinaten Ost/Nord, Höhen in m NN (O1).
 *   - Neue Kennungen vergibt der Aufrufer (`neu`, E2), in der Form eigener
 *     Bauteile (`cde-…`) — sonst hielte `modellVon` sie für geliefert.
 *   - Abgelehnt wird nur, was technisch nicht geht (E5, E8): ein Schema, das
 *     diese CDE nicht kennt, ein fehlendes Werkzeug, ein fehlendes Ziel.
 *
 * NICHT im Kommando (siehe Entwurf, Abschnitt 1): Muster, Operation und
 * Katalogeintrag (stehen am Werkzeug), Bauform, alles Berechnete, die Pfänder
 * des Drei-Wege-Vergleichs (`basis`, `quellBasis`).
 *
 * Rein: kein Vue, kein Store, keine Engine.
 */
import { ADRESSEN, eingabeArt, nachId, werkzeugKatalog, GRUPPEN } from '../Bearbeitungen.js';
import { eingabenFuer } from '../Eingaben.js';
import { nnAusWelt, weltAusNn } from '../Hoehenbezug.js';
import { KOMMANDO_SCHEMA, SYSTEM_PRAEFIX, neueKommandoId } from './Beleg.js';

// Die Version DIESES Schemas und die Kommandokennung wohnen in `Beleg.js` —
// der Journal-Store braucht sie ohne den Werkzeugkatalog.
export { KOMMANDO_SCHEMA, neueKommandoId };

/** Die Schlitze, die ein Kommando Punkte tragen lässt — benannt wie in `Eingaben.js`. */
export const PUNKT_SCHLITZE = Object.freeze(['zug', 'umriss']);

/**
 * Die Gesten, deren Ergebnis unter `eingaben` steht statt unter `werte`:
 * `auswahl` (ein anderes Bauteil — eine GlobalId) und `punkt` (ein Ort AUF
 * dem Ziel — eine Station). Je Feld: `eingaben.auswahl.gelaende = '<GlobalId>'`,
 * `eingaben.punkt.station = 12.4`. Die `griff`-Geste nicht: ihre Felder stehen
 * in `werte` — als ADRESSE (der alte Punkt, die Operationskennung), nie als
 * Nummer (E3, K2b; `nummernAlsAdressen`).
 */
export const GESTEN_IN_EINGABEN = Object.freeze(['auswahl', 'punkt']);

/** Welche Formularfelder eines Werkzeugs zu welcher Geste gehören: `{feld: geste}`. */
function _gestenfelder(werkzeug) {
    return Object.fromEntries(eingabenFuer(werkzeug).felderMitGeste
        .filter(f => GESTEN_IN_EINGABEN.includes(f.geste)).map(f => [f.name, f.geste]));
}

/**
 * Die Werte, wie das Werkzeug sie erwartet: `werte` plus die Ergebnisse der
 * Gesten aus `eingaben` — die Umkehrung dessen, was `kommandoAusZustand` trennt.
 */
export function werteFuerWerkzeug(kommando) {
    const aus = { ...(kommando?.werte ?? {}) };
    for (const geste of GESTEN_IN_EINGABEN) Object.assign(aus, kommando?.eingaben?.[geste] ?? {});
    return aus;
}

// ── Adressen statt Nummern (E3) ───────────────────────────────────────────

/** Die Felder eines Werkzeugs, die eine Adresse tragen: `[{name, adresse}]` — Operationen zuerst. */
function _adressfelder(werkzeug) {
    const aus = (werkzeug?.felder ?? []).filter(f => f?.adresse && ADRESSEN[f.adresse]).map(f => ({ name: f.name, adresse: f.adresse }));
    return aus.sort((a, b) => (a.adresse === 'operation' ? 0 : 1) - (b.adresse === 'operation' ? 0 : 1));
}

/** Toleranz beim Wiederfinden eines Punkts: 1 mm — der Weg über Ost/Nord kostet 10⁻¹⁰ m. */
const ADRESS_TOLERANZ_M = 1e-3;

/**
 * Nummern → Adressen: aus „Stützpunkt Nr. 2" wird der Punkt selbst (Ost/Nord/m NN),
 * aus „Operation Nr. 1" ihre Kennung. Gebraucht, wenn die Oberfläche ein Kommando
 * baut; die Liste kommt vom Subjekt, wie das Werkzeug sie liest.
 */
export function nummernAlsAdressen(werkzeug, subjekt, werte, rahmen) {
    const aus = { ...werte };
    // Punkte zuerst, solange `op` noch die Nummer ist, in deren Liste sie zeigen.
    for (const { name, adresse } of [..._adressfelder(werkzeug)].reverse()) {
        const roh = aus[name];
        if (roh === null || roh === undefined || roh === '' || typeof roh === 'object') continue;
        // Eine Adresse, die ihre Kennung weiterreicht, kommt schon als Kennung.
        if (ADRESSEN[adresse].kennung) { aus[name] = { operation: String(roh) }; continue; }
        const i = Number(roh);
        const liste = ADRESSEN[adresse].liste(subjekt, werte);
        const eintrag = Number.isInteger(i) ? liste[i] : null;
        if (!eintrag) { aus[name] = null; continue; }
        if (adresse === 'operation') { aus[name] = { operation: eintrag.id }; continue; }
        const q = rahmen.nachProjekt({ x: Number(eintrag.x) || 0, y: 0, z: Number(eintrag.z) || 0 });
        const y = Number(eintrag.y);
        const hoehe = !Number.isFinite(y) ? null : (ADRESSEN[adresse].hoeheInNn ? y : nnAusWelt(y, rahmen.hoehenversatz));
        aus[name] = { ost: q.ost, nord: q.nord, ...(hoehe === null ? {} : { hoehe }) };
    }
    return aus;
}

/**
 * Adressen → Nummern: die Umkehrung, gegen den AKTUELLEN Stand des Subjekts. Ein
 * Punkt, der nicht mehr da ist, ist ein fehlendes Ziel (E8) — die Auswertung
 * lehnt dann ab, statt eine Nummer zu raten.
 *
 * @returns {{werte: object, grund: string|null}}
 */
export function adressenAlsNummern(werkzeug, subjekt, werte, rahmen) {
    const aus = { ...werte };
    for (const { name, adresse } of _adressfelder(werkzeug)) {
        const a = aus[name];
        if (a === null || a === undefined) continue;
        const liste = ADRESSEN[adresse].liste(subjekt, aus);
        const kennung = !!ADRESSEN[adresse].kennung;
        if (adresse === 'operation' || kennung) {
            const j = liste.findIndex(op => op?.id === a.operation);
            if (j < 0) {
                return { werte: aus, grund: kennung
                    ? `Die Operation ${a.operation} gibt es im Stapel dieses Geländes nicht (mehr) — oder sie trägt noch keine gespeicherte Kennung.`
                    : `Die Operation ${a.operation} gibt es an diesem Bauteil nicht (mehr).` };
            }
            // Die Kennung selbst weiter (sie kommt so in den Bauplan) — oder die Nummer, die das Werkzeug liest.
            aus[name] = kennung ? a.operation : j;
            continue;
        }
        const w = rahmen.ausProjekt({ ost: a.ost, nord: a.nord, hoehe: 0 });
        const hy = _fin(a.hoehe) ? (ADRESSEN[adresse].hoeheInNn ? a.hoehe : weltAusNn(a.hoehe, rahmen.hoehenversatz)) : null;
        let beste = -1, bestAbstand = Infinity;
        liste.forEach((p, k) => {
            if (!p) return;
            const dy = hy === null || !Number.isFinite(Number(p.y)) ? 0 : Number(p.y) - hy;
            const d = Math.hypot(Number(p.x) - w.x, Number(p.z) - w.z, dy);
            if (d <= ADRESS_TOLERANZ_M && d < bestAbstand) { beste = k; bestAbstand = d; }
        });
        if (beste < 0) return { werte: aus, grund: `Den Punkt (Ost ${a.ost.toFixed(3)}, Nord ${a.nord.toFixed(3)}) gibt es an diesem Bauteil nicht (mehr).` };
        aus[name] = beste;
    }
    return { werte: aus, grund: null };
}

/** ERZEUGEN HAT KEIN ZIEL — dieselbe Trennlinie wie `passende` (Einstieg über die Werkzeugleiste). */
export function istErzeugen(werkzeug) {
    return GRUPPEN[werkzeug?.gruppe]?.einstieg === 'werkzeug';
}

/** In welchem Schlitz ein Werkzeug seine Punkte bekommt — `zug` oder `umriss`. */
export function schlitzVon(werkzeug) {
    const art = eingabeArt(werkzeug);
    if (PUNKT_SCHLITZE.includes(art)) return art;
    const erklaert = (werkzeug?.eingaben ?? []).find(e => PUNKT_SCHLITZE.includes(e?.schlitz));
    return erklaert?.schlitz ?? 'zug';
}

// ── Der Rahmen: Welt ↔ Projektkoordinaten ─────────────────────────────────

/**
 * Ein Rahmen ohne Kartenbezug: Ost = x, Nord = −z, Höhe = y + Höhenversatz.
 * Für Läufe ohne geladenes Modell (Tests, Skripte) — die Zahlen sind dann
 * modellbezogen, nicht amtlich, aber der Weg ist derselbe.
 */
export function rahmenOhneBezug({ hoehenversatz = 0 } = {}) {
    return {
        nachProjekt: (p) => ({ ost: Number(p?.x) || 0, nord: -(Number(p?.z) || 0), hoehe: Number(p?.y) || 0 }),
        ausProjekt: (q) => ({ x: Number(q?.ost) || 0, y: Number(q?.hoehe) || 0, z: -(Number(q?.nord) || 0) }),
        hoehenversatz: Number.isFinite(hoehenversatz) ? hoehenversatz : 0,
        mapAngewandt: false,
    };
}

/**
 * Der Rahmen aus dem Koordinatenbezug eines Modells (`Projektkoordinaten.bestimmeBezug`).
 * Lage über `nachProjekt`/`ausProjekt`; die HÖHE in m NN über den
 * Höhenversatz — dieselbe Umrechnung, mit der jedes Formular im Katalog rechnet
 * (`Hoehenbezug.nnAusWelt`), damit ein Kommando und ein Formularfeld dieselbe
 * Zahl meinen.
 */
export function rahmenAusBezug(bezug, { hoehenversatz = null } = {}) {
    if (!bezug?.nachProjekt || !bezug?.ausProjekt) return rahmenOhneBezug({ hoehenversatz: hoehenversatz ?? 0 });
    const hv = Number.isFinite(hoehenversatz) ? hoehenversatz : bezug.nachProjekt({ x: 0, y: 0, z: 0 }).hoehe;
    // `mapAngewandt`: gilt eine Kartenumrechnung (Drehung, Massstab), ist die
    // Lage eines Bauteils nicht mehr über einen blossen Versatz umkehrbar —
    // die Lage-Werkzeuge verweigern dann (`lageUmkehrbar`, K3).
    return { nachProjekt: bezug.nachProjekt, ausProjekt: bezug.ausProjekt, hoehenversatz: hv, mapAngewandt: !!bezug.mapAngewandt };
}

/** Derselbe Rahmen mit einem anderen Höhenversatz (der des Subjekts gilt, wie im Werkzeug). */
export function mitHoehenversatz(rahmen, hoehenversatz) {
    return Number.isFinite(hoehenversatz) ? { ...rahmen, hoehenversatz } : rahmen;
}

const _fin = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Ein Weltpunkt → Projektpunkt `{ost, nord, hoehe?}`. Ein Punkt OHNE Höhe
 * bleibt ohne — „noch nicht auf eine Fläche gelegt" ist eine Aussage, keine 0.
 */
export function punktAusWelt(p, rahmen) {
    const x = Array.isArray(p) ? p[0] : p?.x;
    const y = Array.isArray(p) ? p[1] : p?.y;
    const z = Array.isArray(p) ? p[2] : p?.z;
    const q = rahmen.nachProjekt({ x: Number(x) || 0, y: 0, z: Number(z) || 0 });
    return { ost: q.ost, nord: q.nord, ...(_fin(y) ? { hoehe: nnAusWelt(y, rahmen.hoehenversatz) } : {}) };
}

/** Ein Projektpunkt → Weltpunkt `{x, y?, z}` — die Umkehrung von `punktAusWelt`. */
export function punktInWelt(q, rahmen) {
    const w = rahmen.ausProjekt({ ost: q.ost, nord: q.nord, hoehe: 0 });
    return { x: w.x, ...(_fin(q.hoehe) ? { y: weltAusNn(q.hoehe, rahmen.hoehenversatz) } : {}), z: w.z };
}

// ── Prüfen ────────────────────────────────────────────────────────────────

const _text = (v) => typeof v === 'string' && v.length > 0;

/** Fängt dieser Schlitz des Werkzeugs auf Knoten? Dann darf ein Endpunkt einer sein (K8). */
function _faengtKnoten(werkzeug, schlitz) {
    return eingabenFuer(werkzeug).schlitze.find(s => s.schlitz === schlitz)?.fang === 'knoten';
}

function _pruefePunkt(q, wo, fehler, { knotenErlaubt = false } = {}) {
    // EIN VERWEIS AUF EINEN KNOTEN (Teil XXIV, K8 — Fabios E6): `{knoten}` nennt
    // das Bauwerk, an dem die Kante beginnt oder endet. Ost/Nord und Höhe
    // dürfen dabeistehen (so schreibt die Oberfläche ihren Fang); ohne sie
    // übernimmt der Punkt Lage und Sohle des Knotens.
    if (q && typeof q === 'object' && !Array.isArray(q) && 'knoten' in q) {
        if (!knotenErlaubt) {
            fehler.push(`${wo}: ein Knoten ({knoten}) steht nur am Anfang oder Ende eines Zugs, der auf Knoten fängt`);
            return;
        }
        if (!_text(q.knoten)) fehler.push(`${wo}: knoten ist eine GlobalId`);
        if ((q.ost !== undefined || q.nord !== undefined) && !(_fin(q.ost) && _fin(q.nord))) fehler.push(`${wo}: Ost und Nord zusammen, als Zahlen — oder keine`);
        if (q.hoehe !== undefined && !_fin(q.hoehe)) fehler.push(`${wo}: die Höhe muss eine Zahl sein oder fehlen`);
        return;
    }
    if (!q || typeof q !== 'object' || !_fin(q.ost) || !_fin(q.nord)) {
        fehler.push(`${wo}: ein Punkt braucht Ost und Nord als Zahlen`);
        return;
    }
    if (q.hoehe !== undefined && !_fin(q.hoehe)) fehler.push(`${wo}: die Höhe muss eine Zahl sein oder fehlen`);
}

/**
 * Ist das ein Kommando, das diese CDE auswerten kann? Nur TECHNISCHES (E5):
 * ob die Werte fachlich passen, sagen die Befunde nach der Ausführung.
 *
 * @returns {string[]} Fehler — leer heisst: auswertbar
 */
export function pruefeKommando(k, { katalog = werkzeugKatalog() } = {}) {
    if (!k || typeof k !== 'object' || Array.isArray(k)) return ['Das Kommando ist kein Objekt'];
    const fehler = [];
    if (k.schema !== KOMMANDO_SCHEMA) {
        fehler.push(`Kommando-Schema ${k.schema ?? '—'} kennt diese CDE nicht (sie kennt ${KOMMANDO_SCHEMA}) — bitte die Seite neu laden`);
        return fehler;
    }
    if (!_text(k.id)) fehler.push('Das Kommando hat keine id');
    if (typeof k.werkzeug === 'string' && k.werkzeug.startsWith(SYSTEM_PRAEFIX)) {
        fehler.push(`„${k.werkzeug}" ist ein Systembeleg — ein Nachweis, kein ausführbares Kommando`);
        return fehler;
    }
    const b = _text(k.werkzeug) ? nachId(k.werkzeug, katalog) : null;
    if (!b) fehler.push(`Das Werkzeug „${k.werkzeug ?? '—'}" gibt es nicht`);

    if (!Array.isArray(k.ziel) || k.ziel.some(z => !_text(z))) {
        fehler.push('ziel muss eine Liste von GlobalIds sein');
    } else if (b) {
        if (istErzeugen(b) && k.ziel.length) fehler.push(`„${b.id}" erzeugt — es hat kein Ziel`);
        if (!istErzeugen(b) && !k.ziel.length) fehler.push('Dem Bauteil fehlt die GlobalId — es lässt sich nicht eintragen.');
        if (!istErzeugen(b) && k.ziel.length > 1 && !b.mehrfach) fehler.push(`„${b.id}" wirkt auf ein Bauteil, nicht auf ${k.ziel.length}`);
        if (new Set(k.ziel).size !== k.ziel.length) fehler.push('ziel nennt ein Bauteil doppelt');
    }

    if (k.neu !== undefined) {
        if (!Array.isArray(k.neu) || k.neu.some(n => !_text(n))) fehler.push('neu muss eine Liste von Kennungen sein');
        else {
            for (const n of k.neu) {
                if (!n.startsWith('cde-') && !n.startsWith('op-')) fehler.push(`neu: „${n}" ist weder die Kennung eines eigenen Bauteils (cde-…) noch einer Operation (op-…)`);
            }
            if (new Set(k.neu).size !== k.neu.length) fehler.push('neu nennt eine Kennung doppelt');
        }
    }

    if (k.eingaben !== undefined) {
        if (!k.eingaben || typeof k.eingaben !== 'object' || Array.isArray(k.eingaben)) fehler.push('eingaben muss ein Objekt sein');
        else {
            const gesten = b ? _gestenfelder(b) : {};
            for (const [schlitz, liste] of Object.entries(k.eingaben)) {
                if (GESTEN_IN_EINGABEN.includes(schlitz)) {
                    if (!liste || typeof liste !== 'object' || Array.isArray(liste)) { fehler.push(`eingaben.${schlitz} muss ein Objekt {Feld: Wert} sein`); continue; }
                    for (const [feld, wert] of Object.entries(liste)) {
                        if (b && gesten[feld] !== schlitz) fehler.push(`eingaben.${schlitz}.${feld}: „${b.id}" kennt dieses Feld nicht als ${schlitz}`);
                        if (schlitz === 'auswahl' && wert != null && !_text(wert)) fehler.push(`eingaben.auswahl.${feld}: eine Auswahl ist eine GlobalId`);
                    }
                    continue;
                }
                if (!PUNKT_SCHLITZE.includes(schlitz)) { fehler.push(`eingaben.${schlitz}: diesen Schlitz gibt es nicht (${[...PUNKT_SCHLITZE, ...GESTEN_IN_EINGABEN].join(', ')})`); continue; }
                if (!Array.isArray(liste)) { fehler.push(`eingaben.${schlitz} muss eine Punktliste sein`); continue; }
                const knotenAmRand = !!b && _faengtKnoten(b, schlitz);
                liste.forEach((q, i) => _pruefePunkt(q, `eingaben.${schlitz}[${i}]`, fehler,
                    { knotenErlaubt: knotenAmRand && (i === 0 || i === liste.length - 1) }));
            }
        }
    }
    if (k.werte !== undefined && (!k.werte || typeof k.werte !== 'object' || Array.isArray(k.werte))) fehler.push('werte muss ein Objekt sein');
    else if (b) {
        // E3: eine Nummer ist nie eine Adresse.
        for (const { name, adresse } of _adressfelder(b)) {
            const a = k.werte?.[name];
            if (a === undefined || a === null) continue;
            if (adresse === 'operation' || ADRESSEN[adresse]?.kennung) {
                if (!a || typeof a !== 'object' || !_text(a.operation)) fehler.push(`werte.${name}: eine Operation wird über ihre Kennung angesprochen ({operation: 'op-…'}), nie über ihre Nummer (E3)`);
            } else if (!a || typeof a !== 'object' || !_fin(a.ost) || !_fin(a.nord)) {
                fehler.push(`werte.${name}: ein Punkt wird über seine Lage angesprochen ({ost, nord, hoehe?}), nie über seine Nummer (E3)`);
            }
        }
    }
    if (k.ebene !== undefined && !['auftrag', 'stand'].includes(k.ebene)) fehler.push(`ebene „${k.ebene}" gibt es nicht (auftrag, stand)`);
    return fehler;
}

// ── Aus dem Zustand der Oberfläche ────────────────────────────────────────

/**
 * Das Kommando zu dem, was die Oberfläche gerade hält: scharfes Werkzeug,
 * Formularwerte, Subjekte, gezeichnete Punkte (Welt). Die Punkte gehen in
 * Projektkoordinaten über `rahmen`, die Werte als JSON — ein Kommando ist ein
 * Wert, kein Verweis auf reaktiven Zustand.
 *
 * Subjekte OHNE GlobalId können kein Ziel sein; wer sie mitgibt, bekommt sie
 * als `ohneKennung` zurück (die Oberfläche zählt sie als übersprungen).
 */
export function kommandoAusZustand({ werkzeug, werte = {}, subjekte = [], punkte = null, rahmen,
                                     wer = '', jetzt = new Date(), id = neueKommandoId() } = {}) {
    const erzeugt = istErzeugen(werkzeug);
    const ziele = erzeugt ? [] : subjekte.filter(s => _text(s?.globalId));
    const ohneKennung = erzeugt ? [] : subjekte.filter(s => !_text(s?.globalId));
    // Ein gefangener Punkt nennt seinen Knoten (K8) — das Kommando auch.
    const liste = Array.isArray(punkte) && punkte.length
        ? punkte.map(p => ({ ...punktAusWelt(p, rahmen), ...(_text(p?.knoten) ? { knoten: p.knoten } : {}) }))
        : null;
    // Die Ergebnisse der Gesten `auswahl` und `punkt` gehören zu den Eingaben,
    // nicht zu den Formularwerten (Schema, Abschnitt 1).
    const alle = JSON.parse(JSON.stringify(werte ?? {}));
    const gesten = _gestenfelder(werkzeug);
    const eingaben = liste ? { [schlitzVon(werkzeug)]: liste } : {};
    const rest = {};
    for (const [feld, wert] of Object.entries(alle)) {
        const geste = gesten[feld];
        if (geste && wert !== undefined) (eingaben[geste] ??= {})[feld] = wert;
        else rest[feld] = wert;
    }
    // Nummern werden Adressen (E3) — gegen das erste Subjekt, wie das Werkzeug es liest.
    const adressiert = ziele.length ? nummernAlsAdressen(werkzeug, ziele[0], rest, rahmen) : rest;
    const kommando = {
        schema: KOMMANDO_SCHEMA,
        id,
        werkzeug: werkzeug?.id ?? null,
        ziel: ziele.map(s => s.globalId),
        wer,
        wann: jetzt.toISOString(),
        ...(Object.keys(eingaben).length ? { eingaben } : {}),
        werte: adressiert,
    };
    return { kommando, ziele, ohneKennung };
}
