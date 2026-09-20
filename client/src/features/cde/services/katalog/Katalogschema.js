/**
 * Das Katalogschema — EINE Prüfung für alles, was aus einem Repo aktiv wird
 * (Teil XXIII, A5; Audit „Bearbeitungsstruktur", Befund S8).
 *
 * Bis hierher wurde Katalogdaten aus Büro und Projekt still geglaubt: ein
 * Typprofil mit vertipptem Rollennamen wirkte als „Werkzeug erscheint nie",
 * eine Regel mit unbekanntem Operator traf nie. Jetzt gilt für jede
 * Eintragsart dieselbe Antwort: `{ ok, fehler: [] }`. Ein ungültiger Eintrag
 * wird GEMELDET und NICHT aktiv — nie halb.
 *
 * Eintragsarten: vorlage · rezept (Deklaration, A4) · typprofil ·
 * bauformregel · symbol (Plansymbol) · regel (Regelwerk, AR: nur bekannte
 * Werte, Tabellen in der Form der eingebauten).
 *
 * NUR DATEN: eine Deklaration darf keinen Code-Schlüssel tragen (`baue`,
 * `leite` …) — dieselbe Landmine wie bei der Vorlage. Aus einem Repo kommt
 * JSON, also keine Funktion; ein STRING „baue" wäre harmlos, aber er zeigte,
 * dass jemand Code erwartet. Deshalb eine Liste erlaubter Schlüssel.
 */
import { REZEPTE, istKategorie, istSchreibbar, rezeptNach } from '../Bauteilrezepte.js';
import { ABLEITUNGEN } from '../ableitung/Ableitungen.js';
import { BAUFORMEN } from '../bauform/Bauformen.js';
import { EINGEBAUTE_PROFILE } from '../bauform/Typprofile.js';
import { EIGENSCHAFTSARTEN } from '../eigenschaften/Eigenschaftsarten.js';
import { GEOMETRIE_ARTEN, PROFIL_ARTEN, geometrieSchluessel, profilSchluessel } from '../rezept/Rezeptbau.js';
import { EINHEITEN } from '../rezept/Geometriebau.js';
import { EINGEBAUTE_SYMBOLE, SYMBOL_FORMEN, symbolNach } from '../PlanSymbols.js';
import { REGELTABELLEN, eingebauteRegel } from '../regeln/Regelwerk.js';
import { AUFLOCKERUNG, GRABENREGELN } from '../gelaende/Grabenregeln.js';

export const EINTRAGSARTEN = Object.freeze(['vorlage', 'rezept', 'typprofil', 'bauformregel', 'symbol', 'regel']);

const FELDTYPEN = Object.freeze(['text', 'zahl', 'auswahl']);
const NETZROLLEN = EIGENSCHAFTSARTEN.netzrolle.werte;
const OPERATOREN = Object.freeze(['equals', 'notEquals', 'contains', 'gt', 'lt', 'exists']);

/** Welche Bauformen eine Geometrieart tragen kann — ein Band ist keine Platte. */
export const BAUFORMEN_JE_GEOMETRIE = Object.freeze({
    band:    ['linie'],
    flaeche: ['flaeche'],
    sweep:   ['achse+profil', 'koerper'],
    stab:    ['punkt', 'koerper'],
    platte:  ['flaeche+dicke', 'koerper'],
});

const REZEPT_SCHLUESSEL = Object.freeze([
    'id', 'titel', 'icon', 'bauform', 'kategorieVorgabe', 'mindestPunkte', 'hoechstPunkte', 'geschlossen',
    'hoehenAus', 'felder', 'netzrolle', 'geometrie', 'symbol', 'beschreibung',
]);
const FELD_SCHLUESSEL = Object.freeze(['name', 'titel', 'typ', 'einheit', 'min', 'max', 'gueltig', 'vorgabe', 'leerErlaubt', 'optionen', 'setzbar']);

const _einfach = (w) => ['string', 'number', 'boolean'].includes(typeof w);
const _istObjekt = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const _hatFunktion = (v) => typeof v === 'function'
    || (v && typeof v === 'object' && Object.values(v).some(_hatFunktion));

/** Die Rollen, die ein eingebautes Profil nennt — der Grundwortschatz von `mass:<rolle>`. */
export function eingebauteRollen() {
    const r = new Set();
    for (const p of Object.values(EINGEBAUTE_PROFILE)) for (const k of Object.keys(p?.felder ?? {})) r.add(k);
    return r;
}

/**
 * Nur bekannte Schlüssel (Teil XXV, V1) — mit „meintest du …?“, weil ein
 * Tippfehler sonst als fehlende Angabe durchginge.
 */
function _nurBekannt(objekt, erlaubt, wo, fehler) {
    const bekannt = new Set(erlaubt);
    for (const k of Object.keys(objekt ?? {})) {
        if (bekannt.has(k)) continue;
        const nah = _aehnlichster(k, erlaubt);
        fehler.push(`${wo}: unbekannter Schlüssel „${k}“${nah ? ` — meintest du „${nah}“?` : ''} (${erlaubt.join(', ')}).`);
    }
}

/** Der nächste bekannte Name — für „meintest du …?" bei einem Tippfehler. */
function _aehnlichster(name, bekannt) {
    const a = String(name).toLowerCase();
    let best = null, bestD = Infinity;
    for (const k of bekannt) {
        const b = k.toLowerCase();
        const d = _abstand(a, b);
        if (d < bestD) { bestD = d; best = k; }
    }
    return bestD <= Math.max(2, Math.floor(a.length / 4)) ? best : null;
}
function _abstand(a, b) {
    const z = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let vorher = z[0]; z[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const t = z[j];
            z[j] = Math.min(z[j] + 1, z[j - 1] + 1, vorher + (a[i - 1] === b[j - 1] ? 0 : 1));
            vorher = t;
        }
    }
    return z[b.length];
}

// ── je Eintragsart ─────────────────────────────────────────────────────────

function _vorlage(v, fehler) {
    if (!_istObjekt(v)) { fehler.push('keine Vorlage'); return; }
    if (!String(v.name ?? '').trim()) fehler.push('Der Name fehlt.');
    if (!rezeptNach(v.rezept)) fehler.push(`Unbekanntes Rezept „${v.rezept}".`);
    const vorgaben = v.vorgaben ?? {};
    if (!_istObjekt(vorgaben)) { fehler.push('Vorgaben müssen ein Objekt sein.'); return; }
    for (const [feld, wert] of Object.entries(vorgaben)) {
        if (!_einfach(wert)) fehler.push(`Vorgabe „${feld}" ist kein einfacher Wert.`);
    }
}

function _felder(liste, fehler) {
    if (!Array.isArray(liste)) { fehler.push('`felder` muss eine Liste sein.'); return new Map(); }
    const namen = new Map();
    for (const f of liste) {
        if (!_istObjekt(f) || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(String(f.name ?? ''))) {
            fehler.push(`Feld ohne gültigen Namen: ${JSON.stringify(f?.name ?? f)}.`); continue;
        }
        if (namen.has(f.name)) fehler.push(`Feld „${f.name}" steht doppelt.`);
        for (const k of Object.keys(f)) if (!FELD_SCHLUESSEL.includes(k)) fehler.push(`Feld „${f.name}": unbekannter Schlüssel „${k}".`);
        if (!FELDTYPEN.includes(f.typ)) fehler.push(`Feld „${f.name}": Typ „${f.typ}" gibt es nicht (${FELDTYPEN.join(', ')}).`);
        for (const k of ['min', 'max']) if (f[k] != null && !Number.isFinite(f[k])) fehler.push(`Feld „${f.name}": ${k} ist keine Zahl.`);
        // Die TECHNISCHE Grenze (K10): was sich nicht bauen lässt. Nur Zahlen unter bekannten Schlüsseln.
        if (f.gueltig != null) {
            if (typeof f.gueltig !== 'object' || Array.isArray(f.gueltig)) fehler.push(`Feld „${f.name}": gueltig ist ein Objekt {min, max, ueber, unter}.`);
            else for (const [k, v] of Object.entries(f.gueltig)) {
                if (!['min', 'max', 'ueber', 'unter'].includes(k)) fehler.push(`Feld „${f.name}": gueltig.${k} gibt es nicht (min, max, ueber, unter).`);
                else if (!Number.isFinite(v)) fehler.push(`Feld „${f.name}": gueltig.${k} ist keine Zahl.`);
            }
        }
        if (f.vorgabe !== undefined && !_einfach(f.vorgabe)) fehler.push(`Feld „${f.name}": Vorgabe ist kein einfacher Wert.`);
        if (f.setzbar !== undefined && typeof f.setzbar !== 'boolean') fehler.push(`Feld „${f.name}": \`setzbar\` muss wahr oder falsch sein.`);
        if (f.setzbar && ['name', 'kategorie', 'hoehe'].includes(f.name)) fehler.push(`Feld „${f.name}" ist kein Parameter — dafür gibt es eigene Werkzeuge.`);
        namen.set(f.name, f);
    }
    return namen;
}

function _rezept(d, fehler) {
    if (!_istObjekt(d)) { fehler.push('keine Deklaration'); return; }
    if (_hatFunktion(d)) { fehler.push('Eine Deklaration ist Daten — sie enthält Code.'); return; }
    for (const k of Object.keys(d)) {
        if (!REZEPT_SCHLUESSEL.includes(k)) fehler.push(`Unbekannter Schlüssel „${k}" — nur Daten, kein Code.`);
    }
    const id = String(d.id ?? '');
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(id)) fehler.push(`Id „${id}": nur Kleinbuchstaben, Ziffern und Bindestrich.`);
    else if (REZEPTE[id] || ABLEITUNGEN[id]) fehler.push(`Id „${id}" ist eingebaut — eine Bibliothek überschreibt kein eingebautes Rezept.`);
    if (!String(d.titel ?? '').trim()) fehler.push('Der Titel fehlt.');
    if (!BAUFORMEN[d.bauform]) fehler.push(`Bauform „${d.bauform}" gibt es nicht.`);
    if (!istSchreibbar(d.kategorieVorgabe)) {
        fehler.push(`„${d.kategorieVorgabe}" ist kein IFC-Typ, den der Eigenbau schreiben kann (IFC 4.3, konkret, ein Bauteil).`);
    }
    if (!Number.isInteger(d.mindestPunkte) || d.mindestPunkte < 1) fehler.push('`mindestPunkte` muss eine ganze Zahl ≥ 1 sein.');
    if (d.hoechstPunkte !== undefined && !(Number.isInteger(d.hoechstPunkte) && d.hoechstPunkte >= (d.mindestPunkte ?? 1))) {
        fehler.push('`hoechstPunkte` muss eine ganze Zahl ≥ `mindestPunkte` sein.');
    }
    if (typeof d.geschlossen !== 'boolean') fehler.push('`geschlossen` muss wahr oder falsch sein.');
    if (d.geschlossen && d.mindestPunkte < 3) fehler.push('Ein geschlossener Umriss braucht mindestens 3 Punkte.');
    if (d.hoehenAus !== undefined && d.hoehenAus !== 'gelaende') fehler.push(`\`hoehenAus\` „${d.hoehenAus}" gibt es nicht.`);
    if (d.netzrolle !== undefined && !NETZROLLEN.includes(d.netzrolle)) fehler.push(`Netzrolle „${d.netzrolle}" gibt es nicht (${NETZROLLEN.join(', ')}).`);
    for (const k of ['icon', 'symbol', 'beschreibung']) if (d[k] !== undefined && typeof d[k] !== 'string') fehler.push(`\`${k}\` muss ein Text sein.`);
    if (typeof d.symbol === 'string' && !symbolNach(d.symbol)) fehler.push(`Plansymbol „${d.symbol}" gibt es nicht.`);
    const felder = _felder(d.felder, fehler);

    const g = d.geometrie;
    if (!_istObjekt(g) || !GEOMETRIE_ARTEN[g.art]) {
        fehler.push(`Geometrieart „${g?.art}" gibt es nicht (${Object.keys(GEOMETRIE_ARTEN).join(', ')}).`);
        return;
    }
    if (!BAUFORMEN_JE_GEOMETRIE[g.art].includes(d.bauform)) {
        fehler.push(`Eine Geometrie „${g.art}" trägt die Bauform „${d.bauform}" nicht (${BAUFORMEN_JE_GEOMETRIE[g.art].join(', ')}).`);
    }
    const zahlfeld = (name, wozu) => {
        const f = felder.get(name);
        if (!f) fehler.push(`${wozu}: Feld „${name}" gibt es nicht.`);
        else if (f.typ !== 'zahl') fehler.push(`${wozu}: Feld „${name}" ist keine Zahl.`);
    };
    // NUR BEKANNTE SCHLÜSSEL — auch INNERHALB der Geometrie (Teil XXV, V1).
    // Bis hierher prüfte das Schema die Schlüssel des Rezepts und die der
    // Felder, aber keinen einzigen in `geometrie` oder `geometrie.profil`:
    // ein `versatzU` am Profil bestand die Prüfung und wirkte nie. Dieselbe
    // Fehlerklasse wie ein vertippter Rollenname im Typprofil, nur stiller.
    _nurBekannt(g, geometrieSchluessel(g.art), `Geometrie „${g.art}"`, fehler);
    for (const k of GEOMETRIE_ARTEN[g.art].masse) zahlfeld(g[k], `${g.art}.${k}`);

    if (GEOMETRIE_ARTEN[g.art].profil) {
        const p = g.profil;
        if (!_istObjekt(p) || !PROFIL_ARTEN[p.art]) {
            fehler.push(`Profilart „${p?.art}" gibt es nicht (${Object.keys(PROFIL_ARTEN).join(', ')}).`);
        } else {
            _nurBekannt(p, profilSchluessel(p.art), `Profil „${p.art}"`, fehler);
            for (const k of PROFIL_ARTEN[p.art].masse) zahlfeld(p[k], `Profil ${p.art}.${k}`);
            if (p.einheit !== undefined && !EINHEITEN[p.einheit]) fehler.push(`Einheit „${p.einheit}" gibt es nicht.`);
            if (p.ecken !== undefined && !(Number.isInteger(p.ecken) && p.ecken >= 3 && p.ecken <= 64)) fehler.push('`ecken` muss zwischen 3 und 64 liegen.');
        }
    }
    if (g.art === 'stab' && d.hoechstPunkte !== 1) fehler.push('Ein Stab steht an EINEM Ort: `hoechstPunkte: 1`.');
    if (g.art === 'platte' && g.richtung !== undefined && !['unten', 'oben'].includes(g.richtung)) {
        fehler.push(`Richtung „${g.richtung}" gibt es nicht (unten, oben).`);
    }
    if ((g.art === 'platte' || g.art === 'flaeche') && !d.geschlossen) fehler.push(`Eine ${g.art === 'platte' ? 'Platte' : 'Fläche'} braucht einen geschlossenen Umriss.`);
    if (g.art === 'sweep' && d.mindestPunkte < 2) fehler.push('Ein Sweep braucht mindestens 2 Punkte.');
    if (d.netzrolle === 'kante' && g.art !== 'sweep' && g.art !== 'band') fehler.push('Eine Kante im Netz braucht eine Achse (sweep oder band).');
}

function _typprofil(p, fehler, { rollen }) {
    if (!_istObjekt(p)) { fehler.push('kein Typprofil'); return; }
    const kat = String(p.kategorie ?? '').toUpperCase().trim();
    if (!istKategorie(kat)) fehler.push(`„${p.kategorie}" steht nicht im IFC-Wörterbuch.`);
    // `bauform: null` ist eine Aussage: die Form hängt nicht an der Klasse
    // (IfcGeographicElement — TERRAIN ist ein Höhenfeld, VEGETATION ein Baum;
    // entscheiden die Bauformregeln).
    if (p.bauform != null && !BAUFORMEN[p.bauform]) fehler.push(`Bauform „${p.bauform}" gibt es nicht.`);
    if (p.netzrolle !== undefined && p.netzrolle !== null && !NETZROLLEN.includes(p.netzrolle)) {
        fehler.push(`Netzrolle „${p.netzrolle}" gibt es nicht (${NETZROLLEN.join(', ')}).`);
    }
    const felder = p.felder ?? {};
    if (!_istObjekt(felder)) { fehler.push('`felder` muss ein Objekt sein (Rolle → Feld).'); return; }
    for (const [rolle, f] of Object.entries(felder)) {
        if (!rollen.has(rolle)) {
            const meint = _aehnlichster(rolle, rollen);
            fehler.push(`Rolle „${rolle}" kennt kein Werkzeug${meint ? ` — gemeint „${meint}"?` : ''}.`);
        }
        if (!_istObjekt(f)) { fehler.push(`Rolle „${rolle}": kein Feld.`); continue; }
        if (f.typ !== undefined && !FELDTYPEN.includes(f.typ)) fehler.push(`Rolle „${rolle}": Typ „${f.typ}" gibt es nicht.`);
        for (const k of ['min', 'max']) if (f[k] != null && !Number.isFinite(f[k])) fehler.push(`Rolle „${rolle}": ${k} ist keine Zahl.`);
    }
}

function _bauformregel(r, fehler) {
    if (!_istObjekt(r)) { fehler.push('keine Regel'); return; }
    const c = r.condition;
    if (!_istObjekt(c)) { fehler.push('Die Bedingung fehlt.'); return; }
    if (c.category != null && !istKategorie(String(c.category).toUpperCase())) fehler.push(`„${c.category}" steht nicht im IFC-Wörterbuch.`);
    if (c.operator !== undefined && !OPERATOREN.includes(c.operator)) fehler.push(`Operator „${c.operator}" gibt es nicht (${OPERATOREN.join(', ')}).`);
    if (c.operator !== 'exists' && (c.propertyName || c.psetName) && !_einfach(c.value)) fehler.push('Der Vergleichswert fehlt.');
    if (r.bauform != null && !BAUFORMEN[r.bauform]) fehler.push(`Bauform „${r.bauform}" gibt es nicht.`);
    if (r.netzrolle != null && !NETZROLLEN.includes(r.netzrolle)) fehler.push(`Netzrolle „${r.netzrolle}" gibt es nicht.`);
    if (r.priority != null && !Number.isFinite(r.priority)) fehler.push('`priority` ist keine Zahl.');
    if (r.enabled != null && typeof r.enabled !== 'boolean') fehler.push('`enabled` muss wahr oder falsch sein.');
    if (r.status != null && !['bestaetigt', 'verworfen'].includes(r.status)) fehler.push(`Status „${r.status}" gibt es nicht.`);
}

const _zahl = (v, lo = -2, hi = 2) => Number.isFinite(v) && v >= lo && v <= hi;
const _uv = (p) => Array.isArray(p) && p.length === 2 && p.every(v => _zahl(v));

function _symbol(sym, fehler) {
    if (!_istObjekt(sym)) { fehler.push('kein Symbol'); return; }
    for (const k of Object.keys(sym)) if (!['id', 'titel', 'kurz', 'formen'].includes(k)) fehler.push(`Unbekannter Schlüssel „${k}".`);
    const id = String(sym.id ?? '');
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(id)) fehler.push(`Id „${id}": nur Kleinbuchstaben, Ziffern und Bindestrich.`);
    else if (EINGEBAUTE_SYMBOLE.some(e => e.id === id)) fehler.push(`Id „${id}" ist eingebaut.`);
    if (!String(sym.titel ?? '').trim()) fehler.push('Der Titel fehlt.');
    if (sym.kurz !== undefined && !(typeof sym.kurz === 'string' && sym.kurz.length <= 2)) fehler.push('`kurz` ist höchstens zwei Zeichen.');
    if (!Array.isArray(sym.formen) || !sym.formen.length) { fehler.push('Ein Symbol braucht Formen.'); return; }
    sym.formen.forEach((f, i) => {
        const wo = `Form ${i + 1}`;
        if (!_istObjekt(f) || !SYMBOL_FORMEN.includes(f.art)) { fehler.push(`${wo}: Art „${f?.art}" gibt es nicht (${SYMBOL_FORMEN.join(', ')}).`); return; }
        if (f.gefuellt !== undefined && typeof f.gefuellt !== 'boolean') fehler.push(`${wo}: \`gefuellt\` muss wahr oder falsch sein.`);
        const gut = f.art === 'kreis' ? (f.r === undefined || _zahl(f.r, 0.01, 2))
            : f.art === 'linie' ? _uv(f.von) && _uv(f.bis)
            : f.art === 'dreieck' ? Array.isArray(f.punkte) && f.punkte.length === 3 && f.punkte.every(_uv)
            : _zahl(f.x) && _zahl(f.y) && _zahl(f.b, 0.01, 4) && _zahl(f.h, 0.01, 4);
        if (!gut) fehler.push(`${wo} (${f.art}): Masse fehlen oder liegen ausserhalb des Einheitskreises.`);
    });
}

/** Die eingebauten Tabellen des Regelwerks — gegen ihre FORM wird eine Überschreibung geprüft. */
const _TABELLEN = Object.freeze({ grabenregeln: GRABENREGELN, auflockerung: AUFLOCKERUNG });

/** Hat `neu` dieselbe Form wie `vorbild` (Schlüssel, Typen; Zahlen endlich)? Gibt die erste Abweichung. */
function _formGleich(vorbild, neu, pfad = '') {
    // Ein OFFENES Ende (`Infinity`, „bis DN ∞") schreibt JSON als `null` — beides gilt.
    if (vorbild === Infinity) return (neu === null || neu === Infinity || Number.isFinite(neu)) ? null : `${pfad}: keine Zahl`;
    if (typeof vorbild === 'number') return Number.isFinite(neu) ? null : `${pfad || 'Wert'}: keine Zahl`;
    if (typeof vorbild === 'string') return typeof neu === 'string' ? null : `${pfad}: kein Text`;
    if (typeof vorbild === 'boolean') return typeof neu === 'boolean' ? null : `${pfad}: nicht wahr/falsch`;
    if (vorbild === null) return null;
    if (Array.isArray(vorbild)) {
        if (!Array.isArray(neu) || !neu.length) return `${pfad}: keine Liste`;
        for (let i = 0; i < neu.length; i++) {
            const f = _formGleich(vorbild[Math.min(i, vorbild.length - 1)], neu[i], `${pfad}[${i}]`);
            if (f) return f;
        }
        return null;
    }
    if (!_istObjekt(neu)) return `${pfad}: kein Objekt`;
    for (const k of Object.keys(vorbild)) {
        if (!(k in neu)) return `${pfad ? pfad + '.' : ''}${k}: fehlt`;
        const f = _formGleich(vorbild[k], neu[k], `${pfad ? pfad + '.' : ''}${k}`);
        if (f) return f;
    }
    for (const k of Object.keys(neu)) if (!(k in vorbild)) return `${pfad ? pfad + '.' : ''}${k}: unbekannt`;
    return null;
}

/**
 * Eine geprüfte Tabelle aus JSON in die Form der eingebauten bringen: wo die
 * eingebaute ein offenes Ende (`Infinity`) hat, wird `null` wieder `Infinity`
 * — sonst fände „bis DN ∞" nie eine Zeile.
 */
export function tabelleAusJson(id, wert) {
    const vorbild = _TABELLEN[id];
    const zurueck = (v, w) => {
        if (v === Infinity) return w === null ? Infinity : w;
        if (Array.isArray(v) && Array.isArray(w)) return w.map((x, i) => zurueck(v[Math.min(i, v.length - 1)], x));
        if (_istObjekt(v) && _istObjekt(w)) return Object.fromEntries(Object.entries(w).map(([k, x]) => [k, zurueck(v[k], x)]));
        return w;
    };
    return vorbild ? zurueck(vorbild, wert) : wert;
}

function _regel(r, fehler) {
    if (!_istObjekt(r)) { fehler.push('keine Regel'); return; }
    for (const k of Object.keys(r)) if (!['id', 'wert', 'quelle'].includes(k)) fehler.push(`Unbekannter Schlüssel „${k}".`);
    if (REGELTABELLEN.includes(r.id)) {
        const f = _formGleich(_TABELLEN[r.id], r.wert);
        if (f) fehler.push(`Tabelle „${r.id}" hat nicht die Form der eingebauten: ${f}.`);
        return;
    }
    const e = eingebauteRegel(r.id);
    if (!e) { fehler.push(`Regel „${r.id}" gibt es nicht — das Regelwerk überschreibt nur bekannte Werte.`); return; }
    if (Array.isArray(e.wert)) {
        if (!Array.isArray(r.wert) || !r.wert.length || !r.wert.every(v => Number.isFinite(v) && v > 0)) {
            fehler.push(`„${r.id}": eine Liste positiver Zahlen (${e.einheit}).`);
        }
    } else if (r.wert === null) {
        if (!e.formel) fehler.push(`„${r.id}": ohne Formel braucht es einen Wert.`);
    } else if (!(Number.isFinite(r.wert) && r.wert >= 0)) {
        fehler.push(`„${r.id}": eine Zahl ≥ 0 in ${e.einheit}.`);
    }
    if (r.quelle !== undefined && typeof r.quelle !== 'string') fehler.push('`quelle` muss ein Text sein.');
}

/**
 * Einen Katalogeintrag prüfen.
 * @param {'vorlage'|'rezept'|'typprofil'|'bauformregel'|'symbol'|'regel'} art
 * @param {object} eintrag   beim Typprofil mit `kategorie`
 * @param {{rollen?: Set<string>}} [opt]  bekannte Rollen (Typprofil) — Vorgabe: die der eingebauten Profile
 * @returns {{ ok: boolean, fehler: string[] }}
 */
export function pruefeEintrag(art, eintrag, { rollen = null } = {}) {
    const fehler = [];
    if (art === 'vorlage') _vorlage(eintrag, fehler);
    else if (art === 'rezept') _rezept(eintrag, fehler);
    else if (art === 'typprofil') _typprofil(eintrag, fehler, { rollen: rollen ?? eingebauteRollen() });
    else if (art === 'bauformregel') _bauformregel(eintrag, fehler);
    else if (art === 'symbol') _symbol(eintrag, fehler);
    else if (art === 'regel') _regel(eintrag, fehler);
    else fehler.push(`Eintragsart „${art}" gibt es nicht.`);
    return { ok: fehler.length === 0, fehler };
}
