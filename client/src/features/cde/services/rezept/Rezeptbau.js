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
    bandGeometrie, dreiecksGeometrie, flaechenGeometrie, massAus, platteKoerper, profilAus,
    punktXYZ, punkteAus, stabKoerper, sweepKoerper,
} from './Geometriebau.js';
import { eigenschaftenVon } from '../eigenschaften/Eigenschaftsarten.js';

/**
 * Die Geometriearten — die geschlossene Liste, die eine Deklaration nennen
 * darf. A5 prüft Bibliotheks-Rezepte gegen genau diese Schlüssel.
 *
 *   band      Linie im Raum als schmales Band (Darstellung, keine Breite)
 *   flaeche   waagerecht trianguliert, jeder Punkt behält seine Höhe
 *   sweep     Profil entlang der Punkte (Rohr, Schacht, Rechteckkanal)
 *   stab      Profil senkrecht auf EINEM Punkt (Pfosten, Schild, Poller)
 *   platte    Umriss mit Dicke (Decke, Belag, Fundament)
 */
export const GEOMETRIE_ARTEN = Object.freeze({
    band:    { koerper: false, profil: false },
    flaeche: { koerper: false, profil: false },
    sweep:   { koerper: true,  profil: true },
    stab:    { koerper: true,  profil: true },
    platte:  { koerper: true,  profil: false },
});

/** Die Querschnittsarten eines Profils. */
export const PROFIL_ARTEN = Object.freeze({
    kreis:    ['durchmesser'],
    rechteck: ['breite', 'tiefe'],
});

/** Die Vorgabe eines Feldes — der Rückfall, wenn ein Bauplan das Mass nicht nennt. */
function _vorgabeIn(felder) {
    const v = new Map((felder ?? []).filter(f => f?.vorgabe !== undefined).map(f => [f.name, f.vorgabe]));
    return (feld) => v.get(feld) ?? null;
}

/** Der Körper einer Deklaration mit Körper-Geometrie — null, wenn keiner entsteht. */
function _koerper(geo, parameter, vorgabe) {
    const punkte = punkteAus(parameter);
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
            // EIN EIGENES ROHR LIEGT IN DER ROHRMITTE (Teil XXI, E4): der Sweep
            // legt sein Profil UM die gezeichneten Punkte. Ohne diese Angabe
            // müsste der Kanalgraben raten, und er riet anders als der Längsschnitt.
            if (form === 'linie') {
                const feld = geo.profil?.durchmesser;
                return { punkte: punkte.map(punktXYZ), dn: (feld && Number(parameter?.[feld])) || null,
                         achsbezug: 'mitte', quelle: 'bauplan' };
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
    return (globalId, plan) => {
        const roh = plan?.parameter?.punkte;
        if (!Array.isArray(roh) || roh.length < 2) return {};
        const punkte = roh.map(punktXYZ);
        return { kanten: [{
            globalId, name: plan.name ?? '', kategorie: plan.kategorie ?? d.kategorieVorgabe,
            anfang: punkte[0], ende: punkte[punkte.length - 1], punkte,
            laenge: _laengeVon(punkte), dn: (dn && Number(plan.parameter?.[dn])) || null, quelle: 'bauplan',
        }] };
    };
}
/** Der Netz-Knoten eines Schachts ist die SOHLE (dieselbe Konvention wie die Platzierung). */
function _fachmodellKnoten(globalId, plan) {
    const roh = plan?.parameter?.punkte;
    if (!Array.isArray(roh) || !roh.length) return {};
    return { knoten: [{ globalId, name: plan.name ?? '', punkt: punktXYZ(roh[0]) }] };
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
    }
    if (typeof r.fachmodell !== 'function') r.fachmodell = _fachmodell(d);
    // Was dieses Bauteil HAT (AE) — abgeleitet, nie von Hand gepflegt.
    r.liefert = Object.freeze([...eigenschaftenVon({ bauform: d.bauform, rezept: d })]);
    return r;
}
