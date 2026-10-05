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
import { herleitungText } from './muster/Herleitung.js';
import { REZEPTE, rezeptNach, warumNichtSchreibbar, zufallsKennung } from '../Bauteilrezepte.js';
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

/**
 * DER NORMSCHACHT ALS WAHL (BIMFY I6): ein ISYBAU-Schacht, für den das Muster
 * eine Kette gerechnet hat, wird kein einzelnes Rezept, sondern die Vorlage
 * „Normschacht" — Teil für Teil. Kein Rezept, deshalb ein eigener Eintrag.
 */
export const NORMSCHACHT_WAHL = Object.freeze({
    id: 'vorlage:normschacht', titel: 'Normschacht (Teil für Teil)', kategorieVorgabe: 'IFCDISTRIBUTIONCHAMBERELEMENT',
});
const _mitNormschacht = (geo) => geo?.isybau?.art === 'schacht' && !!geo?.muster?.kopf && geo.muster.kopf.vorlage !== 'kastenschacht';

/** DER KASTENSCHACHT ALS WAHL (BIMFY I9): ein eckiger ISYBAU-Schacht mit Kette. */
export const KASTENSCHACHT_WAHL = Object.freeze({
    id: 'vorlage:kastenschacht', titel: 'Kastenschacht (Teil für Teil)', kategorieVorgabe: 'IFCDISTRIBUTIONCHAMBERELEMENT',
});
const _mitKasten = (geo) => geo?.isybau?.art === 'schacht' && geo?.muster?.kopf?.vorlage === 'kastenschacht';
const VORLAGEN_WAHLEN = [NORMSCHACHT_WAHL, KASTENSCHACHT_WAHL];

/** Die IFC-Klasse, die eine Wahl vorgibt — Rezept oder Vorlage. */
export function klasseFuer(id) {
    const vorlage = VORLAGEN_WAHLEN.find(v => v.id === id);
    if (vorlage) return vorlage.kategorieVorgabe;
    return String(rezeptNach(id)?.kategorieVorgabe ?? '').toUpperCase();
}

/** Die Rezepte (und Vorlagen), die zu dieser Geometrie passen. */
export function rezepteFuer(geo) {
    const formen = formenFuer(geo);
    return [...(_mitNormschacht(geo) ? [NORMSCHACHT_WAHL] : []), ...(_mitKasten(geo) ? [KASTENSCHACHT_WAHL] : []),
            ...bimfyRezepte().filter(r => formen.includes(rezeptform(r)))];
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
    if (_mitNormschacht(geo)) return { rezept: NORMSCHACHT_WAHL.id, kategorie: NORMSCHACHT_WAHL.kategorieVorgabe, grund: 'ISYBAU-Schacht, Muster DIN 4034-1' };
    if (_mitKasten(geo)) return { rezept: KASTENSCHACHT_WAHL.id, kategorie: KASTENSCHACHT_WAHL.kategorieVorgabe, grund: 'ISYBAU-Schacht rechteckig, Muster Kasten' };
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
                // Rückgebautes (ISYBAU Status 6) bietet BIMFY an, legt es aber nicht von sich aus an.
                rezept: v.rezept, kategorie: v.kategorie, grund: v.grund, aktiv: !!v.rezept && !/rückgebaut/.test(g.ebene ?? ''),
            });
        }
        zeilen.get(schluessel).geometrien.push(g);
    }
    return [...zeilen.values()];
}

/** Die Rezepte, die ALLEN Geometrien einer Zeile passen. */
export function rezepteFuerZeile(zeile) {
    const listen = zeile.geometrien.map(g => new Set(rezepteFuer(g).map(r => r.id)));
    return [...VORLAGEN_WAHLEN, ...bimfyRezepte()].filter(r => listen.every(s => s.has(r.id)));
}

// ── Kommando ──────────────────────────────────────────────────────────────

/** Die Vorgaben eines Rezepts als Formularwerte. */
function _vorgaben(rezept) {
    return Object.fromEntries((rezept.felder ?? []).filter(f => f.vorgabe !== undefined).map(f => [f.name, f.vorgabe]));
}

/** Ein Projektpunkt mit Umrechnung des Lagesystems, Versatz und (für 2D) der Grundhöhe. */
function _punkt(p, { versatz, basisHoehe, hoehe, umrechnen = null } = {}) {
    const h = _fin(hoehe) ? hoehe : (_fin(p.hoehe) ? p.hoehe : (_fin(basisHoehe) ? basisHoehe : undefined));
    const q = umrechnen ? umrechnen(p.ost, p.nord) : p;
    return {
        ost: _r3(q.ost + (versatz?.ost ?? 0)),
        nord: _r3(q.nord + (versatz?.nord ?? 0)),
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
export function kommandoFuer(geo, wahl, { versatz = null, basisHoehe = null, umrechnen = null } = {}) {
    if (wahl?.rezept === NORMSCHACHT_WAHL.id) return normschachtKommando(geo, wahl, { versatz, umrechnen });
    if (wahl?.rezept === KASTENSCHACHT_WAHL.id) return kastenschachtKommando(geo, wahl, { versatz, umrechnen });
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
    const P = (p, hoehe) => _punkt(p, { versatz, basisHoehe, hoehe, umrechnen });
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
        // … und seine Wand (BIMFY I6): Dicke aus dem Muster `Rohrwand`, DN innen oder aussen.
        // Das Feld DN bekommt den Durchmesser seines Bezugs (I8): Kunststoff „DN 150"
        // der alten Reihe ist DN/OD 160 — sonst stünde die Wand 5 mm zu weit innen.
        const wand = geo.muster?.rohrwand;
        if (form === 'zug' && wand && profil.durchmesser && _fin(wand.dnFeld)) {
            werte[profil.durchmesser] = _mass(wand.dnFeld, feldEinheit(profil.durchmesser));
        }
        if (form === 'zug' && wand && profil.wanddicke) {
            werte[profil.wanddicke] = Math.round(wand.wanddicke * 1000 * 10) / 10;
            if (typeof profil.bezug === 'string' && !['innen', 'aussen'].includes(profil.bezug)) werte[profil.bezug] = wand.dnBezug;
        }
        // … und seine Stösse (I8): Baulänge und Muffe aus dem Muster, wo das Rezept sie kennt.
        const muffen = rezept.geometrie?.muffen;
        if (form === 'zug' && wand?.verbindung && wand.baulaenge > 0 && muffen) {
            werte[muffen.baulaenge] = wand.baulaenge;
            werte[muffen.aussen] = Math.round(wand.verbindung.aussen * 1000);
            werte[muffen.tiefe] = Math.round(wand.verbindung.tiefe * 1000);
        }
        // Woher jedes Mass stammt (I5) — für `Quagg_CDE.Herleitung` am Rohr.
        if (form === 'zug' && wand?.herleitung) werte.herleitung = herleitungText(wand.herleitung);
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
    _verknuepfe(kommandos, opt.kennung ?? zufallsKennung);
    return { kommandos, fehler };
}

/**
 * DAS NETZ AUS ISYBAU (BIMFY I9): jeder Schacht bekommt seine Kennung VORAB
 * (`neu` — die Vorlage vergibt die erste an das Bauwerk), und jede Haltung
 * nennt an Anfang und Ende den Schacht, an dem sie hängt (`knoten` am Zugpunkt,
 * K8). Lage und Höhe bleiben, wie vermessen: eine Haltung endet an der
 * Schachtwand, nicht in der Mitte — das Netz verknüpft über die Erklärung.
 */
function _verknuepfe(kommandos, kennung) {
    const jeSchacht = new Map();
    for (const { geo, kommando } of kommandos) {
        if (geo?.isybau?.art !== 'schacht' || !geo.name || jeSchacht.has(geo.name)) continue;
        const id = kennung('bauteil');
        kommando.neu = [id];
        jeSchacht.set(geo.name, id);
    }
    for (const { geo, kommando } of kommandos) {
        const zug = kommando.eingaben?.zug;
        if (!geo?.isybau || geo.isybau.art === 'schacht' || !Array.isArray(zug) || zug.length < 2) continue;
        const von = jeSchacht.get(geo.isybau.von), bis = jeSchacht.get(geo.isybau.bis);
        if (von) zug[0] = { ...zug[0], knoten: von };
        if (bis) zug[zug.length - 1] = { ...zug[zug.length - 1], knoten: bis };
    }
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

// ── Der Normschacht aus ISYBAU (BIMFY I6) ─────────────────────────────────

const KLASSEN = ['', 'A', 'B', 'C', 'D', 'E', 'F'];
const _grad = (w) => (_fin(w) ? ((Math.round((w * 180) / Math.PI) % 360) + 360) % 360 : null);

/**
 * Die Werte der Vorlage „Normschacht" aus einem ISYBAU-Schacht und seiner Kette.
 * Was die Kette schon entschieden hat (Nennweite, Öffnung, Oberteil), geht als
 * Wert hinein; die Vorlage rechnet dieselbe Kette daraus noch einmal.
 */
export function normschachtWerte(geo) {
    const s = geo.isybau, k = geo.muster.kopf;
    const anschluesse = geo.muster.teile[0]?.gerinne?.anschluesse ?? [];
    const ablauf = anschluesse.find(a => a.art === 'ablauf'), zulauf = anschluesse.find(a => a.art === 'zulauf');
    const dns = anschluesse.map(a => a.dn).filter(_fin);
    return {
        tiefe: k.tiefe, dn: k.dn, oeffnung: k.oeffnung,
        anschlussDn: dns.length ? Math.max(...dns) : 0.3,
        unterteilHoehe: s.unterteil?.hoehe ?? 0,
        auflageringe: s.abdeckung?.hoeheAuflageringe ?? 0,
        oberteil: k.oberteil === 'hals' ? 1 : 2,
        steighilfe: s.einstieghilfe === false ? 5 : (s.artEinstieghilfe ?? 1),
        gerinneform: s.unterteil?.gerinneform ?? 0,
        abgang: _grad(ablauf?.richtung) ?? 0,
        zulauf: _grad(zulauf?.richtung) ?? -1,
        steigRichtung: 90,
        deckelklasse: Math.max(0, KLASSEN.indexOf(s.abdeckung?.klasse ?? '')),
    };
}

/** Das Kommando „Normschacht aus Vorlage" für einen ISYBAU-Schacht: ein Punkt, die Schachtmitte auf der Sohle. */
export function normschachtKommando(geo, wahl = {}, { versatz = null, umrechnen = null } = {}) {
    if (!_mitNormschacht(geo)) return { fehler: 'Für diesen Schacht hat das Muster keine Kette (siehe Befunde)' };
    const k = geo.muster.kopf;
    return {
        werkzeug: 'bauwerk-aus-vorlage-normschacht',
        eingaben: { zug: [_punkt({ ost: k.ort.ost, nord: k.ort.nord }, { versatz, hoehe: k.sohle, umrechnen })] },
        werte: { name: wahl.name || geo.name || 'Schacht', hoehe: '', ...normschachtWerte(geo) },
    };
}

/** Die Werte der Vorlage „Kastenschacht" aus einem eckigen ISYBAU-Schacht und seiner Kette (I9). */
export function kastenschachtWerte(geo) {
    const s = geo.isybau, k = geo.muster.kopf;
    return {
        tiefe: k.tiefe, laenge: k.laenge, breite: k.breite, wand: 0,
        mauerwerk: String(s.aufbau?.material ?? '').toUpperCase() === 'MA' ? 1 : 0,
        oberteil: 0,
        steighilfe: s.einstieghilfe === false ? 5 : 1,
        richtung: _grad(k.richtung) ?? 0,
        deckelklasse: Math.max(0, KLASSEN.indexOf(s.abdeckung?.klasse ?? '')),
    };
}

/** Das Kommando „Kastenschacht aus Vorlage": die Schachtmitte auf der Sohle. */
export function kastenschachtKommando(geo, wahl = {}, { versatz = null, umrechnen = null } = {}) {
    if (!_mitKasten(geo)) return { fehler: 'Für diesen Schacht hat das Muster keinen Kasten (siehe Befunde)' };
    const k = geo.muster.kopf;
    return {
        werkzeug: 'bauwerk-aus-vorlage-kastenschacht',
        eingaben: { zug: [_punkt({ ost: k.ort.ost, nord: k.ort.nord }, { versatz, hoehe: k.sohle, umrechnen })] },
        werte: { name: wahl.name || geo.name || 'Schacht', hoehe: '', ...kastenschachtWerte(geo) },
    };
}
