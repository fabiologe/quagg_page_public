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
import { meshVolume } from '../geometrie/MeshOps.js';
import { stationiere } from '../geometrie/Stationierung.js';
import { grundrissAusMesh, ringFlaeche } from '../geometrie/hilfen.js';
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
 * Ein Sweep darf seinen HÖHENBEZUG fest nennen (`achsbezug: 'sohle' | 'mitte'`,
 * Teil XXVI, Z2): wo die gezeichnete Linie im Profil liegt. Eine Haltung
 * schreibt ihren Bezug in den Bauplan (K4); eine Wand hat keinen Bezug zu
 * wählen — ihre Linie ist der Fuss. Ohne die Angabe legte der Sweep das Profil
 * UM die Linie, und die Wand stand mit halber Höhe im Boden. Ein Bezug im
 * Bauplan geht vor; die Deklaration ist die Vorgabe.
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
    sweep:   { koerper: true,  profil: true,  masse: [],        weitere: ['achsbezug'] },
    stab:    { koerper: true,  profil: true,  masse: ['laenge'], weitere: [] },
    platte:  { koerper: true,  profil: false, masse: ['dicke'],  weitere: ['richtung'] },
});

/**
 * Die Querschnittsarten eines Profils — `masse` wie oben, `weitere` je Art.
 *
 * `art`, `einheit`, `versatzU` und `versatzV` trägt JEDES Profil: der Versatz
 * setzt es neben oder unter seine Achse (Teil XXV, V2 — ein Bordstein steht
 * neben der Linie, die man zeichnet).
 *
 *   versatzU   quer zur Achse. POSITIV ist LINKS in Zeichenrichtung — der
 *              Sweep spannt seinen Rahmen als `oben × Richtung` auf. Gemessen
 *              (V2): eine Achse nach Osten legt +1 m auf z − 1 (Norden), eine
 *              nach Süden auf x + 1 (Osten), eine nach Westen auf z + 1.
 *   versatzV   senkrecht, positiv nach oben.
 *
 * Beides ist eine feste Zahl in der Einheit des Profils ODER der Name eines
 * Zahlfelds — ein Bordstein hat seinen Versatz fest, eine Rinne stellt ihn.
 *
 * `polygon` beschreibt einen Querschnitt frei, für alles, was weder Kreis noch
 * Rechteck ist (Hochbord mit Fase, Eiprofil, Rinne): `punkte: [[u, v], …]`.
 */
export const PROFIL_ARTEN = Object.freeze({
    kreis:    { masse: ['durchmesser'],     weitere: ['ecken'] },
    rechteck: { masse: ['breite', 'tiefe'], weitere: [] },
    polygon:  { masse: [],                  weitere: ['punkte'] },
});

/** Was jedes Profil tragen darf, gleich welcher Art. */
const PROFIL_IMMER = Object.freeze(['art', 'einheit', 'versatzU', 'versatzV']);

/** Alle Schlüssel, die eine Geometrieart tragen darf. */
export function geometrieSchluessel(art) {
    const g = GEOMETRIE_ARTEN[art];
    return g ? ['art', ...(g.profil ? ['profil'] : []), ...g.masse, ...g.weitere] : [];
}

/** Alle Schlüssel, die eine Profilart tragen darf. */
export function profilSchluessel(art) {
    const p = PROFIL_ARTEN[art];
    return p ? [...PROFIL_IMMER, ...p.masse, ...p.weitere] : [];
}

/**
 * DIE MASSE EINES KÖRPERS, aus denen ein Rezept seine Mengen nennt (Teil XXVI, Z4).
 *
 * Bis Z4 trugen nur Ableitungen Mengen (Aushub, Auftrag — aus Kennzahlen des
 * Laufs); eine eigene Platte, Wand oder ein Fundament kam OHNE Qto ins IFC
 * (Fund 5). Jetzt deklariert ein Rezept `menge: { netVolume: 'volumen',
 * width: 'dicke', … }`: links der Mengenname der bSI-Vorlage seiner Klasse,
 * rechts ein Körpermass von hier oder ein Zahlfeld in Metern.
 *
 * Gerechnet wird an EINER Stelle, mit dem Kern: Längen waagerecht entlang der
 * Linie (`stationiere`, wie das Gefälle), Flächen in der Draufsicht
 * (`ringFlaeche`), das Volumen am geschlossenen Körper (`meshVolume`). Ein
 * offener Körper hat KEIN Volumen — nie eine Null.
 */
export const KOERPERMASSE = Object.freeze({
    volumen:      Object.freeze({ typ: 'IfcVolumeMeasure', text: 'Volumen des geschlossenen Körpers' }),
    achslaenge:   Object.freeze({ typ: 'IfcLengthMeasure', text: 'waagerechte Länge der gezeichneten Linie' }),
    // Teil XXIX, G8: die Tiefe eines Schachts — Sohle bis Deckel, der senkrechte Abstand seiner zwei Punkte.
    hoehenspanne: Object.freeze({ typ: 'IfcLengthMeasure', text: 'senkrechter Abstand zwischen tiefstem und höchstem Punkt' }),
    grundflaeche: Object.freeze({ typ: 'IfcAreaMeasure', text: 'Fläche des Umrisses in der Draufsicht' }),
    umfang:       Object.freeze({ typ: 'IfcLengthMeasure', text: 'Umfang des Umrisses in der Draufsicht' }),
    // Teil XXVIII, V7: die Ansicht der Mittelebene eines Profilkörpers — Achslänge ×
    // Profilhöhe, EINE Seite, so wie bSI `GrossSideArea` definiert („as viewed by an
    // elevation view of the middle plane"). Die Schalung beider Seiten ist das Doppelte;
    // Stirnflächen gehören nicht dazu.
    seitenflaeche: Object.freeze({ typ: 'IfcAreaMeasure', text: 'Ansicht der Mittelebene: Achslänge × Profilhöhe (eine Seite)',
                                   nurFuer: 'sweep mit Rechteckprofil' }),
});

function _koerpermass(name, geo, parameter, vorgabe) {
    const punkte = punkteAus(parameter).map(punktXYZ);
    if (name === 'achslaenge') return punkte.length >= 2 ? stationiere(punkte).laenge : undefined;
    if (name === 'hoehenspanne') {
        const y = punkte.map(q => q.y).filter(Number.isFinite);
        return y.length >= 2 ? Math.max(...y) - Math.min(...y) : undefined;
    }
    if (name === 'umfang') return punkte.length >= 3 ? stationiere([...punkte, punkte[0]]).laenge : undefined;
    if (name === 'grundflaeche') return punkte.length >= 3 ? ringFlaeche(punkte) : undefined;
    if (name === 'seitenflaeche') {
        if (geo?.art !== 'sweep' || geo.profil?.art !== 'rechteck' || punkte.length < 2) return undefined;
        const v = (profilAus(geo.profil, parameter, vorgabe)?.punkte ?? []).map(q => q.v);
        return v.length ? stationiere(punkte).laenge * (Math.max(...v) - Math.min(...v)) : undefined;
    }
    if (name === 'volumen') {
        const k = _koerper(geo, parameter, vorgabe);
        if (!k?.positions?.length) return undefined;
        const v = meshVolume(k.positions, k.positions.length / 9);
        return v.closed ? v.volume : undefined;
    }
    return undefined;
}

/** `mengen(parameter)` → `{ netVolume: 7.5, … }` — nur endliche, nicht negative Werte. */
function _mengen(d, vorgabe) {
    if (!d.menge) return undefined;
    return (parameter = {}) => {
        const out = {};
        for (const [menge, quelle] of Object.entries(d.menge)) {
            let v;
            if (KOERPERMASSE[quelle]) v = _koerpermass(quelle, d.geometrie, parameter, vorgabe);
            else {
                // Ein Feld: der Wert des Bauplans, sonst die Vorgabe — fehlt beides,
                // gibt es keine Menge (anders als `massAus`, das dann 0 sagt).
                const roh = parameter?.[quelle] ?? vorgabe(quelle);
                v = roh === null || roh === undefined || roh === '' ? undefined : Number(roh);
            }
            if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[menge] = v;
        }
        return out;
    };
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
    // DIE PROFILHOEHE (Teil XXV, V2): Sohle bis Scheitel, aus dem Profil.
    // Bis hierher rechnete `Achsbezug.rohrscheitel` den Scheitel als Sohle
    // plus ZWEIMAL dem Abstand zur Sohle — das stimmt nur, solange jedes
    // Profil um seine Achse symmetrisch ist. Mit `polygon` und `versatzV`
    // ist es das nicht mehr, und ein Eiprofil laege mit seinem Scheitel
    // daneben (die Ueberdeckung waere zu gross gerechnet).
    const hoehe = (parameter) => {
        const p = profilAus(geo.profil, parameter, vorgabe);
        if (!p?.punkte?.length) return 0;
        const v = p.punkte.map(q => q.v);
        return Math.max(0, Math.max(...v) - Math.min(...v));
    };
    // EIN Ort für den Bezug: der Bauplan, sonst die Deklaration (Z2), sonst die Mitte.
    const bezug = (parameter) => bezugOder(parameter?.achsbezug ?? geo.achsbezug);
    const lies = (parameter) => {
        const d = bezug(parameter) === 'sohle' ? 0 : abstand(parameter);
        return (parameter?.punkte ?? []).map(p => punktXYZ(p).y - d);
    };
    const speichere = (parameter, sohlen, { bezug: neu = 'mitte' } = {}) => {
        const b = (parameter?.achsbezug ?? geo.achsbezug) ? bezug(parameter) : bezugOder(neu);
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
        /** Sohle → Scheitel in Metern, aus dem Profil (V2). */
        hoehe,
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
    const sohlen = geo.art === 'sweep' ? _sohlen(geo, vorgabe) : null;
    if (sohlen && sohlen.bezug(parameter) === 'sohle') {
        // Gespeichert ist die SOHLE (der Fuss einer Wand) — der Sweep legt sein
        // Profil um die Mitte. Der Bezug kommt aus `_sohlen` — derselbe, den die
        // Form `linie` und die Sohlhöhen lesen, nicht ein zweites Mal nachgeschlagen.
        const d = sohlen.abstand(parameter);
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
                         achsbezug: s.bezug(parameter), sohlabstand: s.abstand(parameter),
                         profilhoehe: s.hoehe(parameter),
                         // Die BREITE eines Rechteckprofils (Teil XXVII, B3): die Dicke einer
                         // Wand — eine Öffnung geht genau so tief.
                         ...(geo.profil?.art === 'rechteck'
                             ? { profilbreite: massAus(parameter, geo.profil.breite, { rueckfall: vorgabe(geo.profil.breite) }) } : {}),
                         quelle: 'bauplan' };
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
        // DER GRUNDRISS EINES EIGENEN KÖRPERS (Fund 12, Teil XXVI): derselbe, den
        // die Engine einem GELIEFERTEN Bauteil gibt (`engine/Quellformen`) —
        // Hülle im Lageplan, Unter- und Oberkante, aus dem gebauten Körper.
        // Ohne ihn liess sich „Baugrube ums Bauwerk" an keinem eigenen Bauteil
        // ableiten: der Lauf fragt das Rezept, und das kannte nur `platte`.
        if (form === 'umriss') {
            const k = _koerper(geo, parameter, vorgabe);
            return k ? grundrissAusMesh({ mesh: k }).ergebnis : null;
        }
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
/**
 * DIE STANDHÖHE (Teil XXVII, B5): die UNTERKANTE eines Körpers, wie sie aus
 * seinen Punkten folgt — und wie man sie setzt, ohne Form und Gefälle zu
 * ändern (alle Punkte um dasselbe Δ). Nur, wo die Punkte die Unterkante
 * eindeutig tragen:
 *   platte, richtung 'oben'  (Raum)        Punkte = Unterkante
 *   platte, richtung 'unten' (Platte)      Punkte = Oberkante, Unterkante = − Dicke
 *   sweep mit achsbezug 'sohle' (Wand …)   Punkte = Fuss
 * Ein Rohr (Sohle oder Mitte, je Bauplan) steht nicht AUF etwas — es liegt im Netz.
 */
function _stand(geo, vorgabe) {
    const tief = (parameter) => {
        const ys = punkteAus(parameter).map(p => (Array.isArray(p) ? p[1] : p?.y)).filter(Number.isFinite);
        return ys.length ? Math.min(...ys) : null;
    };
    const hoch = (parameter) => {
        const ys = punkteAus(parameter).map(p => (Array.isArray(p) ? p[1] : p?.y)).filter(Number.isFinite);
        return ys.length ? Math.max(...ys) : null;
    };
    const dicke = (parameter) => massAus(parameter, geo.dicke, { rueckfall: vorgabe(geo.dicke) });
    // Die Höhe des Profils (Sohle bis Scheitel) — für die Oberkante einer Wand.
    const profilhoehe = (parameter) => {
        const p = profilAus(geo.profil, parameter, vorgabe);
        const v = (p?.punkte ?? []).map(q => q.v);
        return v.length ? Math.max(...v) - Math.min(...v) : null;
    };
    let lies = null, oberkante = null;
    if (geo?.art === 'platte' && (geo.richtung ?? 'unten') === 'unten') {
        lies = (parameter) => { const t = tief(parameter); return t === null ? null : t - dicke(parameter); };
        oberkante = hoch;
    } else if (geo?.art === 'platte' && geo.richtung === 'oben') {
        lies = tief;
        oberkante = (parameter) => { const h = hoch(parameter); return h === null ? null : h + dicke(parameter); };
    } else if (geo?.art === 'sweep' && geo.achsbezug === 'sohle') {
        lies = tief;
        oberkante = (parameter) => { const h = hoch(parameter), d = profilhoehe(parameter); return h === null || d === null ? null : h + d; };
    }
    if (!lies) return undefined;
    return {
        lies,
        // EXAKT aus dem Bauplan — nicht aus dem gebauten Netz (Float32: 210,2 käme als
        // 210,199 997 zurück und stünde so als „absolute" Höhe im Journal).
        oberkante,
        stelle: (parameter, unterkante) => {
            const ist = lies(parameter);
            if (ist === null || !Number.isFinite(unterkante)) return parameter;
            return verschiebePunktliste(parameter, { x: 0, y: unterkante - ist, z: 0 });
        },
    };
}

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
        // WORAUF ES STEHT (Teil XXVII, B5): wer eine Unterkante hat, die sich
        // aus seinen Punkten lesen und durch Schieben setzen lässt.
        const stand = _stand(d.geometrie, vorgabe);
        if (stand) r.stand = stand;
    }
    // OHNE PUNKTE NICHTS ZU VERSCHIEBEN (Teil XXVI, Z5d): ein Behälter trägt nur Art,
    // Name und `teilVon` — der Ladeversatz eines alten Journals ändert daran nichts.
    // Hier und nicht am Rezept: einmal geschriebener Code, kein Hook je Rezept (W5).
    if (!d.geometrie && typeof r.verschiebe !== 'function') r.verschiebe = (parameter) => parameter;
    // Die Mengen aus Körpermassen und Feldern (Z4) — nur, wenn die Deklaration sie nennt.
    const mengen = GEOMETRIE_ARTEN[d.geometrie?.art] ? _mengen(d, _vorgabeIn(d.felder)) : undefined;
    if (mengen) r.mengen = mengen;
    if (typeof r.fachmodell !== 'function') r.fachmodell = _fachmodell(d);
    // Was dieses Bauteil HAT (AE) — abgeleitet, nie von Hand gepflegt.
    r.liefert = Object.freeze([...eigenschaftenVon({ bauform: d.bauform, rezept: d })]);
    return r;
}
