/**
 * Aus einer Deklaration wird ein Rezept (Teil XXIII, A4).
 *
 * Die Deklaration sagt, WAS ein Bauteil ist (`Eingebaut.js`, später die
 * Bibliothek). Hier steht EINMAL, wie daraus die Schnittstelle wird, die
 * ~15 Leser eines Rezepts kennen: `baue`, `formAus`, `verschiebe`,
 * `fachmodell`, `punkteIn`, `liefert`. `rezeptNach(id)` gibt das Ergebnis
 * zurück — kein Leser merkt, dass das Rezept Daten war.
 *
 * Was NICHT hierher gehört: Rezepte, die aus anderen Objekten RECHNEN
 * (Ableitungen: Kanalgraben, Erdbau …) und das Altrezept `gelaende` — sie
 * bleiben Code (Entscheidung E1). Auch sie laufen durch
 * `rezeptAusDeklaration`, das dann nur ergänzt, was sich ableiten lässt.
 */
import {
    bandGeometrie, dreiecksGeometrie, flaechenGeometrie, hoehenUeberLaenge, massAus, platteKoerper, profilAus,
    punktXYZ, punkteAus, stabKoerper, sweepKoerper,
} from './Geometriebau.js';
import { eigenschaftenVon } from '../eigenschaften/Eigenschaftsarten.js';
import { bezugOder } from '../Achsbezug.js';

/**
 * Die Geometriearten — die geschlossene Liste, die eine Deklaration nennen
 * darf. A5 prüft Bibliotheks-Rezepte gegen genau diese Schlüssel.
 *
 *   band      Linie im Raum als schmales Band (Darstellung, keine Breite)
 *   flaeche   waagerecht trianguliert, jeder Punkt behält seine Höhe
 *   sweep     Profil entlang der Punkte (Rohr, Schacht, Rechteckkanal)
 *   stab      Profil senkrecht auf EINEM Punkt (Pfosten, Schild, Poller)
 *   platte    Umriss mit Dicke (Decke, Belag, Fundament)
 *
 * Je Art steht hier, WAS sie tragen darf (Teil XXV, V1): `masse` sind
 * Feldnamen, die eine Zahl aus den Parametern holen, `weitere` sind eigene
 * Angaben. Alles andere in einer Deklaration ist ein Tippfehler — bis V1
 * fiel er durch, weil niemand die Schlüssel INNERHALB der Geometrie prüfte,
 * und die Angabe wirkte dann einfach nicht.
 */
export const GEOMETRIE_ARTEN = Object.freeze({
    band:    { koerper: false, profil: false, masse: [],        weitere: [] },
    flaeche: { koerper: false, profil: false, masse: [],        weitere: [] },
    sweep:   { koerper: true,  profil: true,  masse: [],        weitere: [] },
    stab:    { koerper: true,  profil: true,  masse: ['laenge'], weitere: [] },
    platte:  { koerper: true,  profil: false, masse: ['dicke'],  weitere: ['richtung'] },
});

/**
 * Die Querschnittsarten eines Profils — `masse` wie oben, `weitere` je Art.
 * `art` und `einheit` trägt jedes Profil.
 */
export const PROFIL_ARTEN = Object.freeze({
    kreis:    { masse: ['durchmesser'],     weitere: ['ecken'] },
    rechteck: { masse: ['breite', 'tiefe'], weitere: [] },
});

/** Alle Schlüssel, die eine Geometrieart tragen darf. */
export function geometrieSchluessel(art) {
    const g = GEOMETRIE_ARTEN[art];
    return g ? ['art', ...(g.profil ? ['profil'] : []), ...g.masse, ...g.weitere] : [];
}

/** Alle Schlüssel, die eine Profilart tragen darf. */
export function profilSchluessel(art) {
    const p = PROFIL_ARTEN[art];
    return p ? ['art', 'einheit', ...p.masse, ...p.weitere] : [];
}

/** Die Vorgabe eines Feldes — der Rückfall, wenn ein Bauplan das Mass nicht nennt. */
function _vorgabeIn(felder) {
    const v = new Map((felder ?? []).filter(f => f?.vorgabe !== undefined).map(f => [f.name, f.vorgabe]));
    return (feld) => v.get(feld) ?? null;
}

/**
 * DIE SOHLEN EINER KANTE (Teil XXIV, K4 — Fabios E7).
 *
 * Gemessen am 2026-09-18: die Punkthöhe einer eigenen Haltung war die
 * ROHRMITTE — der Sweep legt sein Profil um die Punkte —, während
 * Längsschnitt, „Sohlhöhen festlegen" und Sohlzug dieselbe Zahl „Sohle"
 * nannten. Die Sohle im Raum lag genau DN/2 darunter.
 *
 * Jetzt nennt der Bauplan seinen Bezug (`parameter.achsbezug`: 'mitte' |
 * 'sohle'; ohne Angabe 'mitte' — alte Baupläne bleiben bitgleich), und wer
 * eine Sohle liest oder schreibt, tut es HIER. Der Abstand Mitte → Sohle
 * kommt aus dem PROFIL (Kreis r, Rechteck halbe Tiefe): der tiefste Punkt
 * des gebauten Körpers ist damit genau die Sohle, nicht ungefähr.
 *
 * In welchem Bezug NEU gespeichert wird, entscheidet der Aufrufer über die
 * Schreibstufe des Journals (`JournalFormat.kantenbezugNeu`) — das Rezept
 * weiss nichts vom Journal.
 */
function _sohlen(geo, vorgabe) {
    if (geo?.art !== 'sweep') return undefined;
    const abstand = (parameter) => {
        const p = profilAus(geo.profil, parameter, vorgabe);
        return p?.punkte?.length ? Math.max(0, -Math.min(...p.punkte.map(q => q.v))) : 0;
    };
    const bezug = (parameter) => bezugOder(parameter?.achsbezug);
    const lies = (parameter) => {
        const d = bezug(parameter) === 'sohle' ? 0 : abstand(parameter);
        return (parameter?.punkte ?? []).map(p => punktXYZ(p).y - d);
    };
    const speichere = (parameter, sohlen, { bezug: neu = 'mitte' } = {}) => {
        const b = parameter?.achsbezug ? bezug(parameter) : bezugOder(neu);
        const d = b === 'sohle' ? 0 : abstand(parameter);
        const punkte = (parameter?.punkte ?? []).map((p, i) => {
            const s = Number(sohlen?.[i]);
            if (!Number.isFinite(s)) return p;
            const q = punktXYZ(p);
            return [q.x, s + d, q.z];
        });
        return { ...parameter, achsbezug: b, punkte };
    };
    return Object.freeze({
        /** Mitte → Sohle in Metern, aus dem Profil. */
        abstand,
        /** Der Bezug des Bauplans ('mitte' ohne Angabe). */
        bezug,
        /** Die Sohlhöhe (Welt) je Punkt — gleich, in welchem Bezug gespeichert ist. */
        lies,
        /** Sohlhöhen (Welt) je Punkt speichern — im Bezug des Bauplans, sonst in `bezug`. */
        speichere,
        /** Die Enden auf Sohlhöhen (Welt) setzen, die Zwischenpunkte folgen linear; fehlt ein Ende, bleibt es. */
        enden: (parameter, { anfang = null, ende = null } = {}, opts = {}) => {
            const s = lies(parameter);
            if (s.length < 2) return null;
            const a = Number.isFinite(anfang) ? anfang : s[0];
            const e = Number.isFinite(ende) ? ende : s[s.length - 1];
            return speichere(parameter, hoehenUeberLaenge(parameter.punkte, a, e), opts);
        },
    });
}

/** Der Körper einer Deklaration mit Körper-Geometrie — null, wenn keiner entsteht. */
function _koerper(geo, parameter, vorgabe) {
    let punkte = punkteAus(parameter);
    if (geo.art === 'sweep' && bezugOder(parameter?.achsbezug) === 'sohle') {
        // Gespeichert ist die SOHLE — der Sweep legt sein Profil um die Mitte.
        const d = _sohlen(geo, vorgabe).abstand(parameter);
        punkte = punkte.map(p => [p[0], p[1] + d, p[2]]);
    }
    if (geo.art === 'sweep') return sweepKoerper(punkte, profilAus(geo.profil, parameter, vorgabe));
    if (geo.art === 'stab') {
        return stabKoerper(punkte, profilAus(geo.profil, parameter, vorgabe),
                           massAus(parameter, geo.laenge, { rueckfall: vorgabe(geo.laenge) }));
    }
    if (geo.art === 'platte') {
        return platteKoerper(punkte, massAus(parameter, geo.dicke, { rueckfall: vorgabe(geo.dicke) }), geo.richtung ?? 'unten');
    }
    return null;
}

/** `baue(parameter)` → BufferGeometry | null — REIN: keine Engine, kein Vue. */
function _baue(geo, vorgabe) {
    if (geo.art === 'band') return (parameter) => bandGeometrie(punkteAus(parameter));
    if (geo.art === 'flaeche') return (parameter) => flaechenGeometrie(punkteAus(parameter));
    return (parameter) => {
        const k = _koerper(geo, parameter, vorgabe);
        return k ? dreiecksGeometrie(k.positions) : null;
    };
}

/**
 * Die Kernel-Form AUS DEM BAUPLAN (G6): der Ableitungslauf fragt so nach der
 * Achse eines eigenen Rohrs oder dem Körper einer eigenen Platte, ohne dass
 * das Bauteil eine Ableitung sein müsste.
 */
function _formAus(geo, vorgabe) {
    if (!GEOMETRIE_ARTEN[geo.art]?.koerper) return undefined;
    return (parameter, form) => {
        if (geo.art === 'sweep') {
            const punkte = punkteAus(parameter);
            if (punkte.length < 2) return null;
            // WO DIE PUNKTE EINES EIGENEN ROHRS LIEGEN (Teil XXI, E4; Teil XXIV,
            // K4): das sagt der Bauplan — ohne Angabe in der Rohrmitte, weil
            // der Sweep sein Profil UM die Punkte legt. Dazu der Abstand zur
            // Sohle aus dem Profil, damit der Kanalgraben nicht über DN rät.
            if (form === 'linie') {
                const feld = geo.profil?.durchmesser;
                const s = _sohlen(geo, vorgabe);
                return { punkte: punkte.map(punktXYZ), dn: (feld && Number(parameter?.[feld])) || null,
                         achsbezug: s.bezug(parameter), sohlabstand: s.abstand(parameter), quelle: 'bauplan' };
            }
            // EIN EIGENER SCHACHT ALS KNOTEN (Teil XXI, P2c): sein tiefster
            // Punkt IST seine Sohle — und die Form SAGT es (A9), statt dass
            // der Leser es aus `unterkante === y` erraten muss.
            if (form === 'knoten') {
                const xyz = punkte.map(punktXYZ);
                const tief = xyz.reduce((a, p) => (p.y <= a.y ? p : a));
                const hoch = xyz.reduce((a, p) => (p.y >= a.y ? p : a));
                return { x: tief.x, y: tief.y, z: tief.z, unterkante: tief.y, oberkante: hoch.y,
                         hoehenbezug: 'sohle', name: String(parameter?.name ?? '') };
            }
        }
        // DIE PLATTE ALS FORM (A9): Umriss, Dicke, Richtung — was ein Leser
        // braucht, der nicht Dreiecke zählen will (Aussparung, Mengen).
        if (form === 'platte' && geo.art === 'platte') {
            const umriss = punkteAus(parameter).map(punktXYZ);
            const dicke = massAus(parameter, geo.dicke, { rueckfall: vorgabe(geo.dicke) });
            return umriss.length >= 3 && dicke > 0 ? { umriss, dicke, richtung: geo.richtung ?? 'unten' } : null;
        }
        if (form === 'koerper' || form === 'mesh') return _koerper(geo, parameter, vorgabe);
        return null;
    };
}

/**
 * Rahmenwechsel (Lücke ⑤): jedes Rezept deklariert, wie seine Parameter in
 * einen neuen Ladeversatz gehoben werden. Bei einer Deklaration stehen die
 * Punkte immer in `parameter.punkte` — also gilt diese eine Verschiebung.
 */
export function verschiebePunktliste(parameter, delta) {
    const punkte = parameter?.punkte;
    if (!Array.isArray(punkte)) return parameter;
    return {
        ...parameter,
        punkte: punkte.map(p => (Array.isArray(p) && p.length >= 3
            ? [p[0] + delta.x, p[1] + delta.y, p[2] + delta.z]
            : p)),
    };
}

// ── Fachmodell-Projektion (Stufe 17.3 → Teil XIV): was ein Rezept dem
//    Fachmodell gibt — seit A4 aus der ROLLE, nicht je Rezept geschrieben. ──
function _laengeVon(punkte) {
    let l = 0;
    for (let i = 0; i + 1 < punkte.length; i++) {
        l += Math.hypot(punkte[i + 1].x - punkte[i].x, punkte[i + 1].y - punkte[i].y, punkte[i + 1].z - punkte[i].z);
    }
    return l;
}

/** Eine Kante: nur, was die Rolle hat — eine gezeichnete Linie ist eine Trasse, kein Kanal. */
function _fachmodellKante(d) {
    const dn = d.geometrie?.profil?.durchmesser ?? null;
    const sohlen = _sohlen(d.geometrie, _vorgabeIn(d.felder));
    return (globalId, plan) => {
        const roh = plan?.parameter?.punkte;
        if (!Array.isArray(roh) || roh.length < 2) return {};
        const punkte = roh.map(punktXYZ);
        return { kanten: [{
            globalId, name: plan.name ?? '', kategorie: plan.kategorie ?? d.kategorieVorgabe,
            anfang: punkte[0], ende: punkte[punkte.length - 1], punkte,
            laenge: _laengeVon(punkte), dn: (dn && Number(plan.parameter?.[dn])) || null, quelle: 'bauplan',
            // Die Netzkante sagt, WAS ihre Höhen sind (K4) — Längsschnitt,
            // Befunde und Überdeckung rechnen damit auf die Sohle.
            ...(sohlen ? { achsbezug: sohlen.bezug(plan.parameter), sohlabstand: sohlen.abstand(plan.parameter) } : {}),
            // … und woran sie angeschlossen ist, wenn der Bauplan es nennt (K8, E6).
            ...(_anschlussAus(plan.parameter) ? { anschluss: _anschlussAus(plan.parameter) } : {}),
        }] };
    };
}
/** Die Erklärung `anschluss: {anfang?, ende?}` eines Bauplans — nur, was eine GlobalId nennt. */
function _anschlussAus(parameter) {
    const a = parameter?.anschluss;
    if (!a || typeof a !== 'object') return null;
    const aus = {};
    for (const ende of ['anfang', 'ende']) if (typeof a[ende] === 'string' && a[ende]) aus[ende] = a[ende];
    return Object.keys(aus).length ? aus : null;
}

/** Der Netz-Knoten eines Schachts ist die SOHLE (dieselbe Konvention wie die Platzierung). */
function _fachmodellKnoten(globalId, plan) {
    const roh = plan?.parameter?.punkte;
    if (!Array.isArray(roh) || !roh.length) return {};
    // `hoehenbezug` (K8): ein Zugpunkt auf diesem Knoten übernimmt seine Sohle —
    // bei einem eigenen Schacht IST y die Sohle, bei einem gelieferten nicht sicher.
    return { knoten: [{ globalId, name: plan.name ?? '', punkt: punktXYZ(roh[0]), hoehenbezug: 'sohle' }] };
}
const _fachmodellNichts = () => ({});
const _fachmodellGelaende = (globalId) => ({ gelaende: [globalId] });

function _fachmodell(d) {
    if (d.netzrolle === 'kante') return _fachmodellKante(d);
    if (d.netzrolle === 'knoten') return _fachmodellKnoten;
    if (d.gelaendeform) return _fachmodellGelaende;
    return _fachmodellNichts;
}

/**
 * Das Rezept aus einer Deklaration — die HEUTIGE Schnittstelle.
 *
 * Eine Deklaration mit `geometrie` bekommt alles aus dem Rezeptbau; eine
 * ohne (`gelaende`, Code nach E1) behält, was sie selbst mitbringt, und
 * bekommt nur das Ableitbare dazu (Fachmodell, `liefert`).
 */
export function rezeptAusDeklaration(d) {
    const r = { ...d };
    if (d.geometrie) {
        const vorgabe = _vorgabeIn(d.felder);
        // Die Ecken stehen in `parameter.punkte` — Griffe und Werkzeuge lesen
        // DAS, nicht den Rezeptnamen (Teil XXIII, A3).
        r.punkteIn = 'parameter';
        r.verschiebe = verschiebePunktliste;
        r.baue = _baue(d.geometrie, vorgabe);
        const formAus = _formAus(d.geometrie, vorgabe);
        if (formAus) r.formAus = formAus;
        // Eine KANTE im Netz kennt ihre Sohlen (K4). Ein Schacht ist auch ein
        // Sweep, aber seine Punkte SIND Sohle und Deckel — er braucht das nicht.
        if (d.netzrolle === 'kante') {
            const sohlen = _sohlen(d.geometrie, vorgabe);
            if (sohlen) r.sohlen = sohlen;
        }
    }
    if (typeof r.fachmodell !== 'function') r.fachmodell = _fachmodell(d);
    // Was dieses Bauteil HAT (AE) — abgeleitet, nie von Hand gepflegt.
    r.liefert = Object.freeze([...eigenschaftenVon({ bauform: d.bauform, rezept: d })]);
    return r;
}
