/**
 * BIMFY · Übersetzer — aus neutralen Geometrien werden Kommandos.
 *
 * BIMFY baut KEINEN eigenen Weg ins Modell. Jede Geometrie wird zu genau dem
 * Kommando, das ein Mensch mit dem Zeichenwerkzeug abgesetzt hätte
 * (`<rezept>-zeichnen`, `Bearbeitungen.zeichenBearbeitung`): Punkte unter
 * `eingaben.zug` oder `eingaben.umriss`, Formularwerte unter `werte`. Damit
 * erbt ein übersetztes Bauteil Journal, Rückgängig, Beleg, Befunde, IFC-Export
 * und Prüftor — ohne eine Zeile dafür.
 *
 * WELCHES REZEPT PASST, sagt die DEKLARATION des Rezepts, nicht sein Name:
 *
 *   ort      genau ein Punkt (`hoechstPunkte: 1`)          — Pfosten, Stütze
 *   knoten   Netzrolle `knoten`, zwei Punkte senkrecht       — Schacht
 *   zug      offener Zug                                     — Linie, Rohr, Wand
 *   umriss   geschlossener Umriss                            — Fläche, Platte, Raum
 *
 * WIE EIN KÖRPER ZU PARAMETERN WIRD, sagt ebenfalls die Deklaration: das
 * Profil eines Sweeps nennt seine Felder (`profil.breite`, `profil.tiefe`,
 * `profil.durchmesser`), die Platte ihre Dicke (`geometrie.dicke`) und ihre
 * Richtung. Ein neues Rezept mit derselben Geometrieart ist ohne Änderung
 * hier übersetzbar.
 *
 * Rein: kein Vue, kein Store, keine Engine.
 */
import { REZEPTE, rezeptNach, warumNichtSchreibbar } from '../Bauteilrezepte.js';
import { koerperform, formklasse } from './Koerperform.js';

/** Zwei Punkte gelten in der Draufsicht als derselbe Ort (1 cm). */
const ORT_M = 0.01;
/** Tiefe eines Schachts aus einem 2D-Punkt, wenn nichts anderes bekannt ist. */
export const SCHACHT_TIEFE_M = 2;

const _fin = (v) => typeof v === 'number' && Number.isFinite(v);
const _r3 = (v) => Math.round(v * 1000) / 1000;

// ── Rezepte nach ihrer Form ───────────────────────────────────────────────

/** Die Formklasse eines Rezepts — aus seiner Deklaration. */
export function rezeptform(rezept) {
    if (!rezept) return null;
    if (rezept.hoechstPunkte === 1) return 'ort';
    if (rezept.netzrolle === 'knoten') return 'knoten';
    return rezept.geschlossen ? 'umriss' : 'zug';
}

/** Die Felder, die BIMFY aus der Geometrie füllt (nie aus einer Vorgabe). */
function _gefuellteFelder(rezept) {
    const g = rezept?.geometrie ?? {};
    const p = g.profil ?? {};
    return new Set(['name', 'kategorie', 'hoehe', g.dicke, g.laenge, p.breite, p.tiefe, p.durchmesser].filter(Boolean));
}

/**
 * Kann BIMFY dieses Rezept füllen? Es muss bauen können, darf kein Behälter
 * sein, und jedes Pflichtfeld ohne Vorgabe muss eines sein, das BIMFY aus der
 * Geometrie kennt. Die Rigole etwa verlangt ihren Hohlraumanteil — den weiss
 * keine Zeichnung, also wird sie nicht angeboten.
 */
export function istUebersetzbar(rezept) {
    if (!rezept || typeof rezept.baue !== 'function' || rezept.behaelter || rezept.nurVorlage) return false;
    const gefuellt = _gefuellteFelder(rezept);
    return (rezept.felder ?? []).every(f => f.leerErlaubt || f.vorgabe !== undefined || gefuellt.has(f.name));
}

/** Alle Rezepte, die BIMFY anbietet — in der Reihenfolge des Katalogs. */
export function bimfyRezepte() {
    return Object.values(REZEPTE).filter(istUebersetzbar);
}

/** Steht ein Zug senkrecht (zwei Punkte, ein Ort, zwei Höhen)? Dann ist er ein Knoten. */
export function istSenkrecht(geo) {
    if (geo?.art !== 'zug' || geo.punkte.length !== 2) return false;
    const [a, b] = geo.punkte;
    return Math.hypot(a.ost - b.ost, a.nord - b.nord) <= ORT_M && _fin(a.hoehe) && _fin(b.hoehe) && Math.abs(a.hoehe - b.hoehe) > ORT_M;
}

/** Welche Rezeptformen eine Geometrie tragen kann. */
export function formenFuer(geo) {
    switch (geo?.art) {
        case 'punkt': return ['ort', 'knoten'];
        case 'zug': return istSenkrecht(geo) ? ['knoten', 'zug'] : ['zug'];
        case 'umriss': return ['umriss'];
        case 'koerper': return ['umriss', 'zug', 'ort', 'knoten'];
        default: return [];
    }
}

/** Die Rezepte, die zu dieser Geometrie passen. */
export function rezepteFuer(geo) {
    const formen = formenFuer(geo);
    return bimfyRezepte().filter(r => formen.includes(rezeptform(r)));
}

// ── Vorschlag ─────────────────────────────────────────────────────────────

/**
 * Stichworte in Ebene und Name → Rezept und Klasse. Ein Vorschlag, keine
 * Entscheidung: jede Zeile ist in der Tafel umstellbar. Greift nur, wenn das
 * Rezept zur Geometrie passt (ein „Wand"-Punkt bleibt ein Pfosten).
 * Reihenfolge zählt: das Speziellere zuerst (Tauchwand vor Wand).
 */
/*
 * Netzrezepte und die schlichten Zeichenformen werden nicht beim Namen genannt
 * (Architektur-Wächter W3b): gefragt wird nach der ROLLE im Netz oder der
 * Geometrieart — dasselbe, was `rezeptFuerNetzrolle` tut.
 */
const KNOTEN = Object.freeze({ netzrolle: 'knoten' });
const KANTE = Object.freeze({ netzrolle: 'kante' });
const BAND = Object.freeze({ geometrie: 'band' });
const FLAECHE = Object.freeze({ geometrie: 'flaeche' });

/** Ein Rezept nach Id oder nach Eigenschaft (`{netzrolle}`, `{geometrie}`) — die Id, oder null. */
export function rezeptIdVon(wahl, rezepte = bimfyRezepte()) {
    if (!wahl) return null;
    if (typeof wahl === 'string') return rezepte.some(r => r.id === wahl) ? wahl : null;
    return rezepte.find(r => (!wahl.netzrolle || r.netzrolle === wahl.netzrolle)
        && (!wahl.geometrie || r.geometrie?.art === wahl.geometrie))?.id ?? null;
}

export const STICHWORTE = Object.freeze([
    { muster: /schacht|manhole|bauwerk_?s/, rezept: KNOTEN },
    { muster: /rohr|kanal|haltung|leitung|pipe|sewer|drain/, rezept: KANTE },
    { muster: /tauchwand/, rezept: 'tauchwand' },
    { muster: /fundament|footing|found/, rezept: 'streifenfundament' },
    { muster: /fundament|footing|found/, rezept: 'platte', kategorie: 'IFCFOOTING' },
    { muster: /wand|wall|mauer/, rezept: 'wand' },
    { muster: /stuetze|stütze|column|pfeiler|saeule|säule/, rezept: 'pfosten', kategorie: 'IFCCOLUMN' },
    { muster: /pfosten|schild|poller|sign|post/, rezept: 'pfosten' },
    { muster: /traeger|träger|beam|balken|unterzug/, rezept: 'streifenfundament', kategorie: 'IFCBEAM' },
    { muster: /sauberkeit/, rezept: 'sauberkeitsschicht' },
    { muster: /bettung/, rezept: 'bettung' },
    { muster: /decke|slab|platte|boden|sohle|floor|roof|dach/, rezept: 'platte' },
    { muster: /raum|space|room|becken/, rezept: 'raum' },
    { muster: /bruchkante|boeschung|böschung|grenze|achse|trasse|axis|line/, rezept: BAND },
    { muster: /flaeche|fläche|area|parzelle|flurst|zone/, rezept: FLAECHE },
]);

/** Was die Form eines Körpers nahelegt (siehe `Koerperform.formklasse`). */
const KOERPER_VORSCHLAG = Object.freeze({
    scheibe: { rezept: 'wand' },
    stab:    { rezept: 'pfosten', kategorie: 'IFCCOLUMN' },
    balken:  { rezept: 'streifenfundament', kategorie: 'IFCBEAM' },
    platte:  { rezept: 'platte' },
    block:   { rezept: 'platte', kategorie: 'IFCBUILDINGELEMENTPROXY' },
});

/** Der Klassenname der Vorgabe eines Rezepts, gross. */
const _vorgabeKlasse = (id) => String(rezeptNach(id)?.kategorieVorgabe ?? 'IFCBUILDINGELEMENTPROXY').toUpperCase();

/**
 * Der Vorschlag für eine Geometrie: `{rezept, kategorie, grund}`.
 * `grund` sagt in einem Satz, woher er kommt — Ebene, Form oder Vorgabe.
 */
export function vorschlagFuer(geo) {
    const passende = rezepteFuer(geo);
    const text = `${geo?.ebene ?? ''} ${geo?.name ?? ''}`.toLowerCase();
    for (const s of STICHWORTE) {
        const id = s.muster.test(text) ? rezeptIdVon(s.rezept, passende) : null;
        if (id) return { rezept: id, kategorie: s.kategorie ?? _vorgabeKlasse(id), grund: `Ebene/Name „${(geo.ebene || geo.name).trim()}"` };
    }
    let v;
    if (geo.art === 'koerper') {
        const k = formklasse(koerperform(geo.punkte));
        v = { ...KOERPER_VORSCHLAG[k], grund: `Körperform „${k}"` };
    } else if (geo.art === 'punkt') {
        v = (geo.durchmesser ?? 0) >= 0.6 ? { rezept: KNOTEN, grund: 'Kreis ab 60 cm' } : { rezept: 'pfosten', grund: 'Punkt' };
    } else if (geo.art === 'zug') {
        v = istSenkrecht(geo) ? { rezept: KNOTEN, grund: 'senkrechter Zug' } : { rezept: BAND, grund: 'offener Zug' };
    } else {
        v = { rezept: 'platte', grund: 'geschlossener Umriss' };
    }
    const id = rezeptIdVon(v.rezept, passende);
    // Fehlt ein Rezept (eine andere Ausstattung des Katalogs), das erste passende.
    if (!id) {
        const erstes = passende[0]?.id ?? null;
        return { rezept: erstes, kategorie: erstes ? _vorgabeKlasse(erstes) : null, grund: 'erstes passendes Rezept' };
    }
    return { rezept: id, kategorie: v.kategorie ?? _vorgabeKlasse(id), grund: v.grund };
}

// ── Gruppen: eine Zeile je Ebene und Art ──────────────────────────────────

/**
 * Geometrien in Zeilen bündeln — eine je Ebene und Art. In der CAD-Welt ist
 * die Ebene die Bedeutung („WAND_AUSSEN", „KANAL_RW"); also wird je Ebene
 * EINMAL entschieden, nicht je Strich.
 */
export function gruppiere(geometrien) {
    const zeilen = new Map();
    for (const g of geometrien) {
        const schluessel = `${g.ebene ?? ''}\u0000${g.art}`;
        if (!zeilen.has(schluessel)) {
            const v = vorschlagFuer(g);
            zeilen.set(schluessel, {
                schluessel, ebene: g.ebene ?? '', art: g.art, geometrien: [],
                rezept: v.rezept, kategorie: v.kategorie, grund: v.grund, aktiv: !!v.rezept,
            });
        }
        zeilen.get(schluessel).geometrien.push(g);
    }
    return [...zeilen.values()];
}

/** Die Rezepte, die ALLEN Geometrien einer Zeile passen. */
export function rezepteFuerZeile(zeile) {
    const listen = zeile.geometrien.map(g => new Set(rezepteFuer(g).map(r => r.id)));
    return bimfyRezepte().filter(r => listen.every(s => s.has(r.id)));
}

// ── Kommando ──────────────────────────────────────────────────────────────

/** Die Vorgaben eines Rezepts als Formularwerte. */
function _vorgaben(rezept) {
    return Object.fromEntries((rezept.felder ?? []).filter(f => f.vorgabe !== undefined).map(f => [f.name, f.vorgabe]));
}

/** Ein Projektpunkt mit Versatz und (für 2D) der Grundhöhe. */
function _punkt(p, { versatz, basisHoehe, hoehe } = {}) {
    const h = _fin(hoehe) ? hoehe : (_fin(p.hoehe) ? p.hoehe : (_fin(basisHoehe) ? basisHoehe : undefined));
    return {
        ost: _r3(p.ost + (versatz?.ost ?? 0)),
        nord: _r3(p.nord + (versatz?.nord ?? 0)),
        ...(_fin(h) ? { hoehe: _r3(h) } : {}),
    };
}

/** Ein Mass in der Einheit des Felds (Durchmesser stehen in mm, alles andere in m). */
function _mass(meter, einheit) {
    return einheit === 'mm' ? Math.round(meter * 1000) : _r3(meter);
}

/**
 * Das Kommando für EINE Geometrie — ohne `schema`, `id`, `wer`, `wann`; die
 * setzt der Kommandoweg (`useKommandoweg.absetzen`).
 *
 * @param {object} geo          eine Geometrie des Lesers
 * @param {object} wahl         `{rezept, kategorie, name?}`
 * @param {object} [opt]        `versatz` {ost, nord} (lokale Zeichnung → Projekt),
 *                              `basisHoehe` m NN für Punkte ohne Höhe
 * @returns {{werkzeug, eingaben, werte}|{fehler: string}}
 */
export function kommandoFuer(geo, wahl, { versatz = null, basisHoehe = null } = {}) {
    const rezept = rezeptNach(wahl?.rezept);
    if (!rezept || !istUebersetzbar(rezept)) return { fehler: `Rezept „${wahl?.rezept}" kann BIMFY nicht füllen` };
    const form = rezeptform(rezept);
    if (!formenFuer(geo).includes(form)) return { fehler: `${rezept.titel} passt nicht zu einem ${geo.art}` };

    const kategorie = String(wahl.kategorie || rezept.kategorieVorgabe).toUpperCase().trim();
    const nicht = warumNichtSchreibbar(kategorie, { raum: !!rezept.raum });
    if (nicht) return { fehler: nicht };

    const werte = { ..._vorgaben(rezept), name: wahl.name ?? geo.name ?? '', kategorie, hoehe: '' };
    // EINE ANDERE KLASSE als die Vorgabe des Rezepts: die Ausführung der
    // Vorgabe gilt dort nicht (ein Streifenfundament als Träger kennt kein
    // STRIP_FOOTING) — leer heisst „Vorgabe, wenn die Klasse sie kennt".
    if (kategorie !== String(rezept.kategorieVorgabe).toUpperCase()) {
        if ('predefinedType' in werte) werte.predefinedType = '';
        if ('objektTyp' in werte) werte.objektTyp = '';
    }
    // Eine Bezeichnung, die Pflicht ist (Raum), bekommt wenigstens die Ebene.
    if (!werte.name && (rezept.felder ?? []).some(f => f.name === 'name' && !f.leerErlaubt)) {
        werte.name = geo.ebene || rezept.titel;
    }

    const g = rezept.geometrie ?? {};
    const profil = g.profil ?? {};
    const feldEinheit = (name) => (rezept.felder ?? []).find(f => f.name === name)?.einheit ?? profil.einheit;
    const P = (p, hoehe) => _punkt(p, { versatz, basisHoehe, hoehe });
    let punkte;

    if (geo.art === 'koerper') {
        const f = koerperform(geo.punkte);
        const h = Math.max(f.hoehe, 0.01);
        if (form === 'umriss') {
            if (f.umriss.length < 3) return { fehler: 'der Körper hat keine Grundfläche' };
            // Die Platte hängt an ihrer Oberkante nach unten, der Raum steht auf seinem Boden.
            const bezug = g.richtung === 'oben' ? f.unten : f.oben;
            punkte = f.umriss.map(p => P(p, bezug));
            if (g.dicke) werte[g.dicke] = _mass(h, feldEinheit(g.dicke));
        } else if (form === 'zug') {
            if (f.laenge < ORT_M) return { fehler: 'der Körper hat keine Länge' };
            // Gezeichnet wird an der Sohle — so stehen Wand, Fundament und Rohr (K4, Z2).
            punkte = f.achse.map(p => P(p, f.unten));
            if (profil.breite) werte[profil.breite] = _mass(Math.max(f.breite, 0.01), feldEinheit(profil.breite));
            if (profil.tiefe) werte[profil.tiefe] = _mass(h, feldEinheit(profil.tiefe));
            if (profil.durchmesser) werte[profil.durchmesser] = _mass(Math.max(Math.min(f.breite, h), 0.01), feldEinheit(profil.durchmesser));
        } else if (form === 'ort') {
            punkte = [P(f.mitte, f.unten)];
            if (g.laenge) werte[g.laenge] = _mass(h, feldEinheit(g.laenge));
            if (profil.breite) werte[profil.breite] = _mass(Math.max(f.laenge, 0.01), feldEinheit(profil.breite));
            if (profil.tiefe) werte[profil.tiefe] = _mass(Math.max(f.breite, 0.01), feldEinheit(profil.tiefe));
        } else {
            punkte = [P(f.mitte, f.unten), P(f.mitte, f.oben)];
            if (profil.durchmesser) werte[profil.durchmesser] = _mass(Math.max(f.breite, 0.01), feldEinheit(profil.durchmesser));
        }
    } else if (form === 'knoten') {
        if (geo.art === 'zug') {
            punkte = [...geo.punkte].sort((a, b) => a.hoehe - b.hoehe).map(p => P(p));
        } else {
            const p = geo.punkte[0];
            const sohle = _fin(p.hoehe) ? p.hoehe : basisHoehe;
            if (!_fin(sohle)) return { fehler: `${rezept.titel}: der Punkt hat keine Höhe — Grundhöhe angeben` };
            punkte = [P(p, sohle), P(p, sohle + SCHACHT_TIEFE_M)];
        }
        if (_fin(geo.durchmesser) && geo.durchmesser > 0 && profil.durchmesser) {
            werte[profil.durchmesser] = _mass(geo.durchmesser, feldEinheit(profil.durchmesser));
        }
    } else {
        punkte = geo.punkte.map(p => P(p));
        if (form === 'ort' && _fin(geo.durchmesser) && geo.durchmesser > 0) {
            if (profil.breite) werte[profil.breite] = _mass(geo.durchmesser, feldEinheit(profil.breite));
            if (profil.tiefe) werte[profil.tiefe] = _mass(geo.durchmesser, feldEinheit(profil.tiefe));
        }
        // Eine Haltung aus ISYBAU kennt ihr Profil — das Rohr bekommt seine Nennweite.
        if (form === 'zug' && _fin(geo.durchmesser) && geo.durchmesser > 0 && profil.durchmesser) {
            werte[profil.durchmesser] = _mass(geo.durchmesser, feldEinheit(profil.durchmesser));
        }
    }

    if (punkte.length < (rezept.mindestPunkte ?? 1)) {
        return { fehler: `${rezept.titel}: mindestens ${rezept.mindestPunkte} Punkte, ${punkte.length} vorhanden` };
    }
    return {
        werkzeug: `${rezept.id}-zeichnen`,
        eingaben: { [rezept.geschlossen ? 'umriss' : 'zug']: punkte },
        werte,
    };
}

/**
 * Alle Kommandos einer Übersetzung — je aktiver Zeile, je Geometrie. Namen
 * werden je Ebene durchnummeriert, wenn die Geometrie selbst keinen trägt.
 *
 * @returns {{kommandos: Array<{geo, kommando}>, fehler: Array<{geo, fehler}>}}
 */
export function kommandosFuer(zeilen, opt = {}) {
    const kommandos = [], fehler = [];
    for (const z of zeilen) {
        if (!z.aktiv || !z.rezept) continue;
        z.geometrien.forEach((geo, i) => {
            const name = geo.name || (z.ebene ? `${z.ebene} ${i + 1}` : '');
            const k = kommandoFuer(geo, { rezept: z.rezept, kategorie: z.kategorie, name }, opt);
            if (k.fehler) fehler.push({ geo, fehler: k.fehler });
            else kommandos.push({ geo, kommando: k });
        });
    }
    return { kommandos, fehler };
}

/** Die Ausdehnung aller Geometrien in der Draufsicht — für Vorschau und lokalen Versatz. */
export function ausdehnung(geometrien) {
    let minO = Infinity, minN = Infinity, maxO = -Infinity, maxN = -Infinity;
    for (const g of geometrien) for (const p of g.punkte) {
        minO = Math.min(minO, p.ost); maxO = Math.max(maxO, p.ost);
        minN = Math.min(minN, p.nord); maxN = Math.max(maxN, p.nord);
    }
    return Number.isFinite(minO) ? { minO, minN, maxO, maxN } : null;
}
