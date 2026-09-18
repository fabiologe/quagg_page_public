/**
 * Das Ableitungs-Register (Teil XIV, G2 — Stufe 12.7 des alten Plans).
 *
 * Eine ABLEITUNG ist ein Rezept, das aus ANDEREN Objekten rechnet: Schlitze
 * nennen die Quellen (`braucht`: Bauformen, `formen`: Kernel-Form), `leite`
 * rechnet über den Kernel, und heraus kommen MEHRERE Teile mit Rolle,
 * IFC-Typ und Bauform. Für das Gelände: Aushubkörper, Auftragskörper und
 * das neue DGM — aus EINER Rechnung.
 *
 * Vier Regeln (Plan Teil V/XIV), hier eingebaut:
 *   1. Nichts Gerechnetes wird gespeichert — der Bauplan trägt Quellen,
 *      Prüfmass, Zellweite und die Operationsliste; Raster, Körper, Massen
 *      entstehen bei jedem Aufbau neu.
 *   2. Der Aufbau ist TOTAL und idempotent (baueErzeugte).
 *   3. Zyklen sind Fehler mit Namen (Ableitungslauf), keine Endlosschleifen.
 *   4. Der Cache lebt genau einen Durchlauf; ein Fehler in `leite` baut
 *      KEIN halbes Ding — beide Teile fallen mit demselben Grund.
 *
 * DIE NN-GRENZE: Sohlen und Höhen stehen im Journal in m NN (das ist, was
 * der Planer eingibt und im Bericht liest); das Raster rechnet in Welt-Y.
 * Umgerechnet wird GENAU HIER, tabellengetrieben über `hoehenFelder` — das
 * schliesst den Nebenbefund aus Teil XIII (Gerinne rechnete bei Versatz ≠ 0
 * daneben).
 *
 * Rein: kein Vue, keine Engine, kein three. Importiert nur nach unten.
 */
import { feinheitAus, feinheitFuer, formeNach, massenAus, verschiebeOperationen, wirkbereichVon } from '../gelaende/Operationen.js';
import { anzeigeFlicken } from '../gelaende/Flicken.js';
import { ANZEIGE_URNETZ_MAX, anzeigeNetz } from '../gelaende/Anzeigenetz.js';
import { innenEcken } from '../gelaende/Innenecken.js';
import { AUFLOCKERUNG, GRABENREGELN, auflockerungFuer, auflockerungOder, wandFuer, grabenbreite, baugrubenmass, rechteckUmriss, baugrubenRichtung, pruefeGraben, schaechteAnKanten, WANDFORMEN } from '../gelaende/Grabenregeln.js';
import { weltAusNn } from '../Hoehenbezug.js';
import { rasterAbtasten } from '../geometrie/ops/Raster.js';
import { GRABEN_QUER, GRABEN_SCHRITT } from '../geometrie/ops/Graben.js';
import { kreisProfil, trapezProfil, sweep, extrudiere } from '../geometrie/ops/Sweep.js';
import { versetztePunkte, ringFlaeche } from '../geometrie/ops/Linien.js';
import { umrissFlaeche } from '../geometrie/ops/Umriss.js';
import { bezugTitel, bezugWaehlen, rohrmitte, rohrscheitel, rohrsohle } from '../Achsbezug.js';
import { boeschungskanten, kantenUebersicht } from '../gelaende/Boeschungskanten.js';

/** Welche Op-Parameter Höhen in m NN sind — und deshalb an der Grenze in Welt-Y wandern. */
export const ERDBAU_HOEHENFELDER = Object.freeze({
    gerinne:   ['sohleAnfang', 'sohleEnde'],
    planum:    ['hoehe'],
    boeschung: ['hoehe'],
    baugrube:  ['sohle'],
    // Die Bauwerksgrube trägt ihre Sohle in m NN (leer = Unterkante des Bauteils).
    bauwerksgrube: ['sohle'],
    // Teil XX: Umriss bzw. Kante AUF dem Gelände, Böschung nach innen bzw. zur Seite.
    grube:          ['sohle'],
    schuettung:     ['hoehe'],
    boeschungLinie: [],
});

/**
 * Welche Op-Parameter PUNKTLISTEN mit Höhe je Punkt sind (Teil XX) — Rand
 * und Kante tragen ihre Höhe in m NN wie jede Sohle, und wandern an
 * derselben Grenze nach Welt-Y.
 */
export const ERDBAU_PUNKTHOEHEN = Object.freeze({
    grube:          ['umriss'],
    schuettung:     ['umriss'],
    boeschungLinie: ['linie'],
    // Teil XXI: ein Gerinne darf seine Sohle stationsweise tragen — auch die
    // Stationen sind Punkte mit Höhe in m NN.
    gerinne:        ['stationen'],
});

/** Gegenprobe Körper ↔ Raster: darüber ist etwas faul. */
export const GEGENPROBE_TOLERANZ = 0.02;
/** Ab dieser Höhendifferenz gilt eine Zelle als geformt: dort liegt die Planlinie. */
export const BILD_SCHWELLE = 0.01;
/** Rohrscheitel gegen Ur-Gelände (m) — darunter meldet der Kanalgraben einen Befund (DIN EN 1610: Regelfall ≥ 0,8 m). */
export const MINDEST_UEBERDECKUNG = 0.8;
/** Vorgaben des Grabenprofils, wenn das Formular nichts sagt. */
export const KANALGRABEN_VORGABEN = Object.freeze({ arbeitsraum: 0.4, bettung: 0.15, boeschung: 0.5 });

/**
 * Die Bauformen, aus denen sich ein VOLUMEN gewinnen lässt.
 *
 * Gebraucht für das Formpaar-Gate boolescher Operationen. Ausgeschlossen sind
 * genau die Formen ohne Rauminhalt — `punkt`, `linie`, `flaeche`,
 * `hoehenfeld` — und `netz`, das für „nicht einordenbar" steht und deshalb
 * keine Zusage über Geschlossenheit macht.
 */
export const KOERPERHAFT = Object.freeze(['koerper', 'flaeche+dicke', 'achse+profil']);

/**
 * Das PLANBILD (G5) UND DIE KANTEN (Teil XX Stufe B) — aus EINER Rechnung.
 *
 * Die Nulllinie der Differenz ist die Böschungsoberkante; genau die zeichnet
 * der Lageplan als Planbild. Bis Teil XXI wurde sie hier gerechnet und später
 * für die Kanten ein zweites Mal — zwei Wege zu derselben Linie. Jetzt liefert
 * `boeschungskanten` beides: die Linien mit Höhe (Kanten) und ihre Grundrisse
 * (Bild). Details und die vier Arten stehen in `gelaende/Boeschungskanten.js`.
 */
async function _kantenUndBild(kernel, vorher, nachher, ops = []) {
    try {
        return await boeschungskanten(kernel, { vorher, nachher, ops, schwelle: BILD_SCHWELLE });
    } catch (fehler) {
        // Ein Bild ist kein Bauteil: fällt es aus, läuft der Vorgang weiter —
        // aber nicht still.
        return { kanten: [], bild: [], warnungen: [`kanten_nicht_gerechnet: ${fehler?.message ?? fehler}`] };
    }
}

function _opsInWelt(operationen, versatz) {
    return (operationen ?? []).map(op => {
        const felder = ERDBAU_HOEHENFELDER[op.art] ?? [];
        const punktfelder = ERDBAU_PUNKTHOEHEN[op.art] ?? [];
        if (!felder.length && !punktfelder.length) return op;
        const p = { ...op.parameter };
        for (const f of felder) {
            if (Number.isFinite(Number(p[f]))) p[f] = weltAusNn(Number(p[f]), versatz);
        }
        for (const f of punktfelder) {
            if (!Array.isArray(p[f])) continue;
            p[f] = p[f].map(q => (Number.isFinite(Number(q?.y)) ? { ...q, y: weltAusNn(Number(q.y), versatz) } : q));
        }
        return { ...op, parameter: p };
    });
}

/**
 * Der innere Ring einer Grube bzw. Schüttung für die VORSCHAU: der Umriss um
 * `d` eingerückt (Gehrung aus `versetztePunkte`). Welche Richtung „innen"
 * ist, entscheidet die Fläche — nicht die Umlaufrichtung, die der Planer
 * beliebig zeichnet. Kippt der Ring (zu tief für den Umriss), entfällt er;
 * die exakte Form rechnet der Lauf.
 */
function _innenring(ring, d) {
    if (!(d > 0.01) || ring.length < 3) return null;
    const flaeche = ringFlaeche(ring);
    let bester = null;
    for (const s of [d, -d]) {
        const r = versetztePunkte(ring, s, { geschlossen: true });
        const f = ringFlaeche(r);
        if (r.length >= 3 && f < flaeche * 0.99 && f > flaeche * 0.01 && (!bester || f < bester.f)) bester = { r, f };
    }
    return bester?.r ?? null;
}

/** Eine Parallele zur offenen Linie, `d` nach LINKS der Zeichenrichtung (negativ = rechts) — dieselbe Seite wie `boeschungLinie`. */
function _parallele(punkte, d) {
    const n = punkte.length;
    const links = (i) => {
        const a = punkte[i], b = punkte[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        return { x: dz / l, z: -dx / l };
    };
    return punkte.map((p, i) => {
        const m = i === 0 ? links(0) : i === n - 1 ? links(n - 2)
            : (() => { const u = links(i - 1), v = links(i); const l = Math.hypot(u.x + v.x, u.z + v.z) || 1; return { x: (u.x + v.x) / l, z: (u.z + v.z) / l }; })();
        return { x: p.x + m.x * d, y: p.y, z: p.z + m.z * d };
    });
}

/**
 * Unter dieser Menge sagt eine PROZENTZAHL nichts mehr: bei zwei Kubikmetern
 * sind drei Prozent sechs Hundertstel — das ist die Rasterauflösung, kein
 * Befund. Gemessen an einer Schachtbaugrube (Teil XIX, 2026-09-09): sie
 * meldete zuverlässig einen Fehlalarm.
 */
const GEGENPROBE_MINDEST_M3 = 5;

function _gegenprobe(rolle, koerper, rasterWert, befunde, warnungen) {
    if (!koerper) return null;
    if (!koerper.closed) warnungen.push(`${rolle}: Körper nicht geschlossen — Volumen unsicher`);
    const bezug = Math.max(rasterWert, 1e-6);
    const abweichung = Math.abs(koerper.volumen - rasterWert) / bezug;
    if (Math.max(rasterWert, koerper.volumen) < GEGENPROBE_MINDEST_M3) return null;
    if (abweichung > GEGENPROBE_TOLERANZ) {
        befunde.push({
            regel: 'aushub_gegenprobe', schwere: 'warnung',
            text: `${rolle}: Körper ${koerper.volumen.toFixed(1)} m³ gegen Raster ${rasterWert.toFixed(1)} m³ — ${(abweichung * 100).toFixed(1)} % Abweichung`,
        });
    }
    // DIE GEGENPROBE IST EINE ZAHL, KEIN GEHEIMNIS (Teil XXI, P4). Bis hierher
    // sprach sie nur, wenn sie ausschlug; der Planer sah nie, wie gut Raster
    // und Körper übereinstimmen. Jetzt steht sie als Kennzahl neben der Menge.
    return +abweichung.toFixed(5);
}

/**
 * DIE GELTENDE AUSHUBMASSE einer Ableitung — eine Regel, vier Leser.
 *
 * Meldung nach dem Übernehmen, Mengen-Reiter, Eigenschaftsfenster und
 * IFC-Qto müssen dieselbe Zahl zeigen; sonst streitet die Oberfläche mit dem
 * Export. Seit P6 ist das nicht mehr immer `aushubRaster`: wo ein
 * Profilkörper gebaut werden konnte, zählt der (`aushubMasse`). Rezepte ohne
 * Profilkörper tragen keine `aushubMasse` — dort bleibt es beim Raster.
 */
export function aushubMasseVon(kennzahlen) {
    const k = kennzahlen ?? {};
    if (Number.isFinite(k.aushubMasse)) return k.aushubMasse;
    return Number.isFinite(k.aushubRaster) ? k.aushubRaster : null;
}

/**
 * Die Gegenprobe des PROFILKÖRPERS (Teil XXI, P6) — zwei unabhängige Wege zu
 * derselben Menge: Querprofile gegen Rasterknoten.
 *
 * Bei geböschten Wänden MÜSSEN sie übereinstimmen (gemessen: 0,03 %); tun sie
 * es nicht, ist einer von beiden falsch, und das ist ein Befund. Bei
 * SENKRECHTEN Wänden dürfen sie auseinanderlaufen — dort misst das Raster
 * eine Sprungfunktion und liegt nachweislich daneben. Das ist dann kein
 * Fehler, sondern der Grund, warum der Profilkörper zählt; gesagt wird es
 * trotzdem, sonst wundert sich jemand über zwei Zahlen.
 */
function _profilGegenprobe(koerper, rasterWert, wand, befunde) {
    const bezug = Math.max(rasterWert, 1e-6);
    const abweichung = Math.abs(koerper.volumen - rasterWert) / bezug;
    if (Math.max(rasterWert, koerper.volumen) < GEGENPROBE_MINDEST_M3) return +abweichung.toFixed(5);
    if (abweichung > GEGENPROBE_TOLERANZ) {
        befunde.push(wand.n > 0
            ? { regel: 'aushub_gegenprobe', schwere: 'warnung',
                text: `Graben: Profilkörper ${koerper.volumen.toFixed(1)} m³ gegen Raster ${rasterWert.toFixed(1)} m³ — ${(abweichung * 100).toFixed(1)} % Abweichung` }
            : { regel: 'masse_senkrecht_raster', schwere: 'hinweis',
                text: `Senkrechte Wände: gerechnet wird mit dem Profilkörper ${koerper.volumen.toFixed(1)} m³; das Raster misst hier ${rasterWert.toFixed(1)} m³ (${(abweichung * 100).toFixed(1)} % daneben) — eine Sprungfunktion lässt sich an Knoten nicht messen`,
                quelle: 'Kanalgraben-Ableitung (Teil XXI, P6)' });
    }
    return +abweichung.toFixed(5);
}

// ── Vorschau (Teil XVI, S2) ────────────────────────────────────────────────
//
// Die Vorschau einer Ableitung ist ANSCHAUUNG, nicht das Ergebnis: ein
// Trapez-Sweep entlang der Achse, eine extrudierte Platte — Mikro- bis
// Millisekunden, nie `leite` (Raster + Körper + Attest, > 500 ms auf dem
// Planungs-DGM). Das Ergebnis entsteht beim Übernehmen über den Neuaufbau.

/** Wie tief liegt die Sohle unter dem Gelände? — aus dem Sampler, sonst Rückfall. */
function _tiefeUeber(hoeheAn, punkte, rueckfall = 1) {
    let tiefe = 0;
    for (const p of punkte) {
        const h = hoeheAn?.(p.x, p.z);
        if (Number.isFinite(h)) tiefe = Math.max(tiefe, h - p.y);
    }
    return tiefe > 0.05 ? tiefe : rueckfall;
}

/**
 * Ein Pyramidenstumpf (Kasten mit geböschten Wänden) aus Boden- und
 * Deckelrechteck — vier Ecken unten, vier oben, zwölf Dreiecke. Das Bild
 * der Baugrube UND des Grabens je Segment: verbaut (n = 0) ein Prisma,
 * abgeböscht wachsen alle vier Wände nach aussen — auch die Stirnseiten
 * (B3-Nachtrag: „Rechteck, dann Trapez im Längsschnitt").
 */
function _kastenGeist(unten, oben, farbe) {
    const v = [...unten, ...oben];
    const dreiecke = [
        [0, 2, 1], [0, 3, 2],             // Boden
        [4, 5, 6], [4, 6, 7],             // Deckel
        [0, 1, 5], [0, 5, 4],             // vier Wände
        [1, 2, 6], [1, 6, 5],
        [2, 3, 7], [2, 7, 6],
        [3, 0, 4], [3, 4, 7],
    ];
    const positions = new Float64Array(dreiecke.length * 9);
    let o = 0;
    for (const [a, b, c] of dreiecke) {
        for (const i of [a, b, c]) { positions[o++] = v[i].x; positions[o++] = v[i].y; positions[o++] = v[i].z; }
    }
    return { art: 'geist', positions, triCount: dreiecke.length, farbe, opacity: 0.35 };
}

/**
 * Der Graben als Geist entlang einer Sohl-Polylinie (Welt, mit y): je Segment
 * ein Kasten — unten der Sohlstreifen (halbe Sohlbreite), oben um tiefe · n
 * nach allen Seiten erweitert, auf Geländehöhe (Sohle + Tiefe).
 */
function _grabenGeist(punkte, { sohlbreite, boeschung, tiefe }, farbe) {
    const b2 = Math.max(0.05, sohlbreite / 2);
    const n = Math.max(0, boeschung);
    const t = Math.max(0.1, tiefe);
    const aus = [{ art: 'linie', punkte, farbe, gestrichelt: true }];
    for (let i = 0; i + 1 < punkte.length; i++) {
        const a = punkte[i], b = punkte[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z;
        const l = Math.hypot(dx, dz);
        if (l < 1e-6) continue;
        const ux = dx / l, uz = dz / l;             // längs
        const qx = -uz, qz = ux;                    // quer
        const ecke = (p, laengs, quer, y) => ({ x: p.x + ux * laengs + qx * quer, y, z: p.z + uz * laengs + qz * quer });
        const r = t * n;                            // Ausladung der Böschung oben
        const unten = [ecke(a, 0, -b2, a.y), ecke(b, 0, -b2, b.y), ecke(b, 0, b2, b.y), ecke(a, 0, b2, a.y)];
        const oben = [ecke(a, -r, -b2 - r, a.y + t), ecke(b, r, -b2 - r, b.y + t), ecke(b, r, b2 + r, b.y + t), ecke(a, -r, b2 + r, a.y + t)];
        aus.unshift(_kastenGeist(unten, oben, farbe));
    }
    return aus;
}

/** Die Sohle je Achspunkt, linear nach Station zwischen Anfang und Ende. */
function _sohlPunkte(achse, sohleAnfang, sohleEnde) {
    const pts = (achse ?? []).map(p => ({ x: Number(p.x), z: Number(p.z) })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.z));
    if (pts.length < 2) return [];
    const st = [0];
    for (let i = 1; i < pts.length; i++) st.push(st[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const l = st[st.length - 1] || 1;
    const e = Number.isFinite(sohleEnde) ? sohleEnde : sohleAnfang;
    return pts.map((p, i) => ({ x: p.x, y: sohleAnfang + (e - sohleAnfang) * (st[i] / l), z: p.z }));
}

const ABLEITUNGEN_ERWEITERT = {
    /**
     * Gelände formen — Gerinne, Planum, Böschung als Operationsliste auf EINEM
     * Quellgelände. Folgeformungen hängen ihre Operation an dieselbe
     * Ableitung; so wächst keine Kette (Ableitung auf Ableitung entsteht nur,
     * wenn ein ANDERES Rezept ein DGM als Quelle nimmt).
     */
    erdbau: {
        id: 'erdbau',
        titel: 'Gelände formen',
        icon: 'terrain',
        // Ein ERDBAU-VORGANG (Stufe 1): fusst auf dem Ur-Gelände, meldet seine
        // Operationen als `ops`, wird im Stapel über die Vorgänger gefaltet.
        erdbau: true,
        bauform: 'hoehenfeld',
        kategorieVorgabe: 'IFCGEOGRAPHICELEMENT',
        mindestPunkte: 0,
        geschlossen: false,
        felder: [],
        braucht: { gelaende: ['hoehenfeld'] },
        formen:  { gelaende: 'raster' },
        teile: [
            {
                rolle: 'aushub', kategorie: 'IFCEARTHWORKSCUT', bauform: 'koerper', form: 'koerper',
                // Ein reines Gerinne ist ein Graben (TRENCH); sobald ein Planum
                // dabei ist, ist es ein Aushub (EXCAVATION).
                predefinedType: (parameter) => ((parameter?.operationen ?? []).every(op => op.art === 'gerinne')
                    ? 'TRENCH' : 'EXCAVATION'),
                name: (q) => `${q} · Aushub`,
                // DIE MENGE fürs IFC (Stufe 2): welche Kennzahl welcher Qto-Wert
                // ist. Es ist die Rasterzahl — dieselbe, die der Mengenreiter
                // zeigt und die sich mit den anderen Vorgängen zur Gesamtmasse
                // summiert. Der Körper ist die Gegenprobe, nicht die Menge.
                //
                // DAZU DAS LOSE VOLUMEN (Teil XXI, P4): gewachsener Boden
                // nimmt beim Lösen mehr Raum ein. Gemessen wird gewachsen,
                // abgefahren wird lose — beide Zahlen gehören in die Datei,
                // sonst rechnet sie jeder Empfänger mit seinem eigenen Faktor.
                menge: { undisturbedVolume: 'aushubRaster', looseVolume: 'aushubLose' },
            },
            {
                rolle: 'auftrag', kategorie: 'IFCEARTHWORKSFILL', bauform: 'koerper', form: 'koerper',
                // Teil XX: eine Rückverfüllung bis GOK ist BACKFILL, eine Böschung
                // an einer Kante SLOPEFILL („side slope fill"), sonst ein Damm.
                predefinedType: (parameter) => {
                    const ops = parameter?.operationen ?? [];
                    if (ops.some(op => op.art === 'schuettung' && op.parameter?.ziel === 'ur')) return 'BACKFILL';
                    if (ops.some(op => op.art === 'boeschungLinie')) return 'SLOPEFILL';
                    return 'EMBANKMENT';
                },
                name: (q) => `${q} · Auftrag`,
                // Eingebaut ist ein Auftrag verdichtet — sein Raum IST das CompactedVolume.
                menge: { compactedVolume: 'auftragRaster' },
            },
            // KEIN `dgm`-Teil mehr (Stufe 1): die geformte Fläche ist die EINE
            // Anzeigeform des Ur-Geländes (Rezept `anzeige`), nicht ein Teil
            // jedes Vorgangs. `leite` liefert `teile.dgm` weiter — Alt-Journale
            // von vor Stufe 1 tragen solche Teile, und sie sollen bauen.
        ],
        hoehenFelder: ERDBAU_HOEHENFELDER,

        /**
         * @param {object} parameter  {quellen, quellBasis, raster:{cell}, operationen}
         * @param {object} quellen    {gelaende: raster} — vom Lauf aufgelöst
         * @param {object} kontext    {kernel, hoehenversatz}
         */
        /**
         * Das Gelände ein zweites Mal — FEIN und nur im Korridor um die
         * Formung. Darauf rechnen Aushub, Auftrag und die Massen; das
         * sichtbare DGM bleibt das volle Raster (siehe ERDBAU_ZELLE).
         */
        zusatzQuellen(parameter, quellen, genannt) {
            const gid = genannt?.gelaende;
            const ur = quellen?.gelaende;
            if (!gid || !ur) return {};
            // JEDER VORGANG BEKOMMT IHN (Teil XXI, 2026-09-17). Bis dahin nur
            // die schmalen (`_zuFeinFuerZelle`: Gerinne, Baugrube) — „zwei
            // Sekunden für die dritte Nachkommastelle sind ein schlechtes
            // Geschäft". Das galt, solange nur die MASSE daran hing. Seit die
            // Anzeige ihre Flicken fein zeichnet, hängt auch das BILD daran:
            // eine Grube ohne Korridor lieferte einen Körper mit 2-m-Rand,
            // während die Anzeige den Rand auf 0,5 m auflöste — gemessen
            // 2026-09-17: 0,67 m Unterschied am Grubenrand, im Bild ein
            // Erdkörper, der aus dem Gelände ragt. Bild und Zahl kommen aus
            // derselben Rechnung, oder sie widersprechen sich.
            const b = _erdbauKorridor(ur, parameter?.operationen ?? []);
            if (!b) return {};
            // DIE EINE FEINHEITSREGEL (Teil XXI, 2026-09-17): Fläche UND
            // schmalste Kennweite entscheiden — dieselbe Funktion, die auch
            // die Anzeige-Flicken befragen. Zwei Formeln für dieselbe Zelle
            // hiessen zwei Gitter, und damit zwei Flächen im Bild.
            const { k, cell } = feinheitFuer(ur, parameter?.operationen ?? [],
                                             { zelle: ERDBAU_ZELLE, budget: ERDBAU_ZELLBUDGET });
            if (k < 2) return {};
            // AUF DEM GITTER DES GROBEN RASTERS (Teil XXI): sonst liegen die
            // Knoten des Korridors zwischen denen der Anzeige, und Erdkörper
            // und Gelände durchdringen sich sichtbar.
            return { gelaendeFein: { gid, form: 'raster',
                opts: { cell, bereich: b, gitter: { x0: ur.x0, z0: ur.z0, cell: ur.cell } } } };
        },

        async leite(parameter, quellen, { kernel, hoehenversatz = 0, stapel = null } = {}) {
            // `ur` ist das Gelände VOR diesem Vorgang — nach allen Vorgängern
            // gefaltet (Stapel), sonst das gelieferte.
            const ur = quellen?.gelaende;
            if (!ur) throw new Error('erdbau: Quellgelände fehlt');
            if (!kernel) throw new Error('erdbau: kein Kernel');
            const warnungen = [];
            const befunde = [];
            const ops = _opsInWelt(parameter?.operationen ?? [], hoehenversatz);
            if (!ops.length) throw new Error('erdbau: keine Operationen');
            // Das UR für „bis GOK" (Teil XX): `ur` hier ist das Gelände VOR diesem
            // Vorgang; das ursprüngliche liegt im Stapel.
            const { raster: neu, warnungen: w1 } = formeNach(ur, ops, { ur: stapel?.urRaster ?? ur });
            warnungen.push(...w1);

            // KÖRPER UND MASSEN auf dem feinen Korridor, wenn es einen gibt —
            // das DGM bleibt das volle Raster. Beides muss aus DERSELBEN
            // Formung stammen, sonst widersprechen sich Bild und Zahl.
            // Der feine Korridor kommt ROH von der Quelle — die Vorgänger
            // müssen auch auf ihm liegen, sonst schnitte der zweite Vorgang
            // fein durch das ungeformte Gelände.
            const fein = quellen?.gelaendeFein ? (stapel?.vorherVon?.(quellen.gelaendeFein) ?? quellen.gelaendeFein) : null;
            let rechenAlt = ur, rechenNeu = neu;
            if (fein) {
                const { raster: feinNeu, warnungen: w2 } = formeNach(fein, ops, { ur: quellen.gelaendeFein });
                warnungen.push(...w2.filter(w => !w1.includes(w)));
                rechenAlt = fein; rechenNeu = feinNeu;
            }

            const faktor = auflockerungOder(parameter?.auflockerung, AUFLOCKERUNG.vorgabe);
            const aushub = await kernel.op('koerperZwischenRastern', { oben: rechenAlt, unten: rechenNeu });
            const auftrag = await kernel.op('koerperZwischenRastern', { oben: rechenNeu, unten: rechenAlt });
            const massen = massenAus(rechenAlt, rechenNeu) ?? { aushub: 0, auftrag: 0 };
            const abwAushub = _gegenprobe('Aushub', aushub.ergebnis, massen.aushub, befunde, warnungen);
            const abwAuftrag = _gegenprobe('Auftrag', auftrag.ergebnis, massen.auftrag, befunde, warnungen);

            // DIE KANTEN auf DEMSELBEN Raster wie die Massen (feiner Korridor,
            // wenn es einen gibt): eine Oberkante aus dem groben Raster läge
            // neben dem Erdkörper, den sie beschreibt.
            const { kanten, bild, warnungen: w3 } = await _kantenUndBild(kernel, rechenAlt, rechenNeu, ops);
            warnungen.push(...w3);

            return {
                teile: {
                    aushub:  aushub.ergebnis  ? { form: 'koerper', daten: aushub.ergebnis }  : null,
                    auftrag: auftrag.ergebnis ? { form: 'koerper', daten: auftrag.ergebnis } : null,
                    dgm:     { form: 'raster', daten: neu },
                },
                kennzahlen: {
                    aushubRaster: massen.aushub,
                    auftragRaster: massen.auftrag,
                    aushubKoerper: aushub.ergebnis?.volumen ?? 0,
                    auftragKoerper: auftrag.ergebnis?.volumen ?? 0,
                    // DIE AUFLOCKERUNG (Teil XXI, P4): gemessen wird gewachsen,
                    // abgefahren wird lose. Der Faktor steht im Bauplan, nicht
                    // im Code — jeder Boden lockert anders auf.
                    auflockerung: faktor,
                    aushubLose: massen.aushub * faktor,
                    gegenprobeAushub: abwAushub,
                    gegenprobeAuftrag: abwAuftrag,
                    operationen: ops.length,
                    zellweite: rechenAlt.cell,
                    zellweiteDgm: ur.cell,
                    korridor: !!fein,
                    reihe: stapel?.reihe ?? 0,
                    kanten: kantenUebersicht(kanten),
                },
                befunde,
                warnungen,
                bild,
                kanten,
                ops,       // in Welt — der Stapel faltet damit die Nachfolger
            };
        },

        /**
         * Vorschau (S2): je Operation ein Geist — Gerinne als Trapez-Sweep entlang
         * der Sohle, Planum als Platte zwischen Sollhöhe und Gelände; Böschung
         * nur als Chip. Höhen kommen in NN und gehen hier über dieselbe
         * Tabelle nach Welt wie in `leite`.
         */
        vorschau(parameter, { hoeheAn = null, hoehenversatz = 0, farben = {} } = {}) {
            const farbe = farben.warn ?? '#ffb74d';
            const primitive = [];
            const chips = [];
            for (const op of _opsInWelt(parameter?.operationen ?? [], hoehenversatz)) {
                const q = op.parameter ?? {};
                if (op.art === 'gerinne') {
                    const pts = _sohlPunkte(q.achse, Number(q.sohleAnfang), Number(q.sohleEnde));
                    if (pts.length < 2 || !Number.isFinite(pts[0].y)) continue;
                    const tiefe = _tiefeUeber(hoeheAn, pts);
                    primitive.push(..._grabenGeist(pts, { sohlbreite: Number(q.sohlbreite) || 1, boeschung: Number(q.boeschung) || 1.5, tiefe }, farbe));
                    chips.push({ art: 'vorschau', text: `Gerinne · Sohle ${(pts[0].y + hoehenversatz).toFixed(2)} → ${(pts[pts.length - 1].y + hoehenversatz).toFixed(2)} m NN · bis ${tiefe.toFixed(1)} m tief` });
                } else if (op.art === 'planum') {
                    const ring = (q.umriss ?? []).map(p => ({ x: Number(p.x), z: Number(p.z) })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.z));
                    const hoehe = Number(q.hoehe);
                    if (ring.length < 3 || !Number.isFinite(hoehe)) continue;
                    // Die Platte reicht von der Sollhöhe bis zum höchsten Geländepunkt des Umrisses.
                    let oben = hoehe;
                    for (const p of ring) { const h = hoeheAn?.(p.x, p.z); if (Number.isFinite(h)) oben = Math.max(oben, h); }
                    if (oben - hoehe < 0.05) oben = hoehe + 0.5;
                    const ex = extrudiere({ umriss: { ring, loecher: [] } }, { von: hoehe, bis: oben });
                    if (ex.ergebnis) primitive.push({ art: 'geist', positions: ex.ergebnis.positions, triCount: ex.ergebnis.triCount, farbe, opacity: 0.3 });
                    primitive.push({ art: 'umriss', ring: ring.map(p => ({ x: p.x, y: hoehe, z: p.z })), farbe });
                    chips.push({ art: 'vorschau', text: `Planum ${(hoehe + hoehenversatz).toFixed(2)} m NN` });
                } else if (op.art === 'boeschung') {
                    chips.push({ art: 'vorschau', text: `Böschung 1 : ${Number(q.neigung) || 1.5} — Anschluss nach Übernehmen` });
                } else if (op.art === 'grube' || op.art === 'schuettung') {
                    // Teil XX: der gezeichnete Rand liegt AUF dem Gelände (Punkthöhen),
                    // der innere Ring auf Sohle bzw. Zielhöhe.
                    const ring = (q.umriss ?? []).map(p => ({ x: Number(p.x), y: Number(p.y), z: Number(p.z) }))
                        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
                    if (ring.length < 3) continue;
                    const randMittel = ring.reduce((a, p) => a + p.y, 0) / ring.length;
                    const n = Number(q.neigung) > 0 ? Number(q.neigung) : 0;
                    primitive.push({ art: 'umriss', ring, farbe });
                    // Der INNERE Ring Ecke für Ecke (Teil XXII, `Innenecken`): dieselbe
                    // Regel wie die Rechnung, und genau dort sitzen die Griffe
                    // von „Ecken ziehen". Je Ecke die Gratlinie von oben nach
                    // innen — sie zeigt, welche Ecken zusammengehören.
                    const innenGrat = (hoehe) => {
                        const ecken = innenEcken(op);
                        if (!ecken || ecken.some(e => !e)) return null;
                        primitive.push({ art: 'umriss', ring: ecken.map(e => ({ x: e.x, y: hoehe, z: e.z })), farbe });
                        ecken.forEach((e, k) => primitive.push({ art: 'linie', gestrichelt: true, farbe,
                            punkte: [{ x: ring[k].x, y: ring[k].y, z: ring[k].z }, { x: e.x, y: hoehe, z: e.z }] }));
                        return ecken;
                    };
                    if (op.art === 'grube') {
                        const sohle = Number(q.sohle);
                        if (!Number.isFinite(sohle)) continue;
                        if (!innenGrat(sohle)) {
                            const innen = n ? _innenring(ring, Math.max(0, randMittel - sohle) * n) : ring;
                            if (innen) primitive.push({ art: 'umriss', ring: innen.map(p => ({ x: p.x, y: sohle, z: p.z })), farbe });
                        }
                        chips.push({ art: 'vorschau', text: `Ausheben · Sohle ${(sohle + hoehenversatz).toFixed(2)} m NN · ${(randMittel - sohle).toFixed(2)} m unter dem Rand · ${n ? `Böschung 1 : ${n}` : 'senkrecht'}` });
                    } else if (q.ziel === 'ur') {
                        chips.push({ art: 'vorschau', text: 'Auffüllen bis GOK — auf das Ur-Gelände, nur auffüllen' });
                    } else {
                        const hoehe = Number(q.hoehe);
                        if (!Number.isFinite(hoehe)) continue;
                        if (!innenGrat(hoehe)) {
                            const innen = n ? _innenring(ring, Math.max(0, hoehe - randMittel) * n) : ring;
                            if (innen) primitive.push({ art: 'umriss', ring: innen.map(p => ({ x: p.x, y: hoehe, z: p.z })), farbe });
                        }
                        chips.push({ art: 'vorschau', text: `Auffüllen · ${(hoehe + hoehenversatz).toFixed(2)} m NN · ${(hoehe - randMittel).toFixed(2)} m über dem Rand · ${n ? `Böschung 1 : ${n}` : 'senkrecht'}` });
                    }
                } else if (op.art === 'boeschungLinie') {
                    const pts = (q.linie ?? []).map(p => ({ x: Number(p.x), y: Number(p.y), z: Number(p.z) }))
                        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
                    if (pts.length < 2) continue;
                    const n = Number(q.neigung) || 1.5;
                    primitive.push({ art: 'linie', punkte: pts, farbe });
                    // Die SEITE sichtbar: eine gestrichelte Parallele zwei Meter daneben.
                    primitive.push({ art: 'linie', punkte: _parallele(pts, q.seite === 'links' ? 2 : -2), farbe, gestrichelt: true });
                    chips.push({ art: 'vorschau', text: `Böschung 1 : ${n} · ${q.seite === 'links' ? 'links' : 'rechts'} der Zeichenrichtung` });
                }
            }
            return { primitive, chips, hinweise: [] };
        },

        verschiebe: (parameter, delta) => ({
            ...parameter,
            operationen: verschiebeOperationen(parameter?.operationen, delta),
        }),

        /** Fachmodell-Projektion je Teil: das DGM ist Gelände, die Körper sind Körper. */
        fachmodell: (globalId, plan) => (plan?.rolle === 'dgm'
            ? { gelaende: [globalId] }
            : { koerper: [globalId] }),

        beschreibe: (nachher) => {
            const ops = nachher?.parameter?.operationen ?? [];
            const arten = [...new Set(ops.map(o => o.art))];
            const rolle = { aushub: 'Aushub', auftrag: 'Auftrag', dgm: 'DGM' }[nachher?.rolle] ?? nachher?.rolle ?? '';
            return `Gelände formen · ${rolle} · ${ops.length} ${ops.length === 1 ? 'Operation' : 'Operationen'}`
                + (arten.length ? ` (${arten.join(', ')})` : '');
        },
    },
};

/**
 * DER KANALGRABEN (Teil XIV, G6) — die zweite Pipeline, und die erste mit
 * ZWEI Quellen: ein Rohr (Achse mit DN) und ein Gelände. Der Graben ist ein
 * Trapez entlang der Rohrachse — Sohle = Rohrsohle − Bettung, Sohlbreite =
 * DN + 2 · Arbeitsraum, Böschung 1 : n (0 = Verbau, wird zur steilsten
 * Zelle) — und schneidet wie ein Gerinne ins Gelände, je Segment mit
 * eigener Sohle (ein Rohr mit Knick bekommt keinen geraden Graben).
 *
 * Teile: Graben (IfcEarthworksCut TRENCH), Verfüllung (IfcEarthworksFill
 * BACKFILL — als KÖRPER erst mit dem Server-Kernel in G7, der Graben minus
 * Rohr rechnet; bis dahin steht die Menge als Kennzahl), DGM mit Graben.
 *
 * Alles hier rechnet in WELT: die Rohrachse kommt in Welt-Y, die Sohlen
 * werden daraus gebildet — kein Feld in m NN, keine Grenze zu übersetzen.
 * Die Überdeckung (Rohrscheitel gegen Ur-Gelände) ist der erste Befund der
 * Familie „Raum" (Teil IX, §4): ein Befund an der Nachbarschaft zweier
 * Fachmodelle, nirgends gespeichert.
 */
/**
 * Die Werte eines Kanalgrabens aus den Operationsparametern (B3, nach Norm).
 *
 * NEU: `wandform` (verbau | boeschung | senkrecht), `boden`, `winkelGrad`,
 * `wanddickeMm`, `breite` (eigene Sohlbreite, leer = DIN EN 1610), `bettung`,
 * `schachtDm`, `dn` (leer = aus der Achse), `umfang`. ALT (Journale vor B3):
 * `arbeitsraum` + `boeschung` (1:n) — werden übersetzt, damit ein gespeicherter
 * Graben genauso wieder entsteht: n > 0 ⇒ Böschung mit dem Winkel dazu,
 * sonst Verbau; Arbeitsraum ⇒ eigene Sohlbreite DN + 2 · Arbeitsraum.
 */
function _kanalgrabenWerte(parameter, rohr) {
    const g = (parameter?.operationen ?? []).find(o => o?.art === 'kanalgraben')?.parameter ?? {};
    const zahl = (v, vorgabe) => (v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : vorgabe);
    const dnFest = zahl(g.dn, 0) || 0;
    const dn = dnFest || Number(rohr?.dn) || 300;
    const alt = g.wandform === undefined && (g.arbeitsraum !== undefined || g.boeschung !== undefined);
    let wandform = g.wandform ?? 'verbau';
    let winkelGrad = zahl(g.winkelGrad, null);
    let breite = zahl(g.breite, null);
    if (alt) {
        const n = zahl(g.boeschung, KANALGRABEN_VORGABEN.boeschung);
        wandform = n > 0 ? 'boeschung' : 'verbau';
        winkelGrad = n > 0 ? Math.round(Math.atan(1 / n) * 180 / Math.PI * 10) / 10 : null;
        breite = dn / 1000 + 2 * Math.max(0, zahl(g.arbeitsraum, KANALGRABEN_VORGABEN.arbeitsraum));
    }
    return {
        dn, dnFest,
        // ALT-JOURNALE KENNEN DAS FELD NICHT (Teil XXI, E4): `quelle` heisst
        // „nimm den Bezug der Achse". Für isyifc-Daten ist das die Sohle —
        // genau die Kur; wer den alten Stand braucht, stellt „Rohrmitte" ein.
        achsbezug: g.achsbezug ?? 'quelle',
        umfang: g.umfang ?? 'haltung',
        wandform: WANDFORMEN[wandform] ? wandform : 'verbau',
        boden: g.boden ?? 'nichtbindig',
        winkelGrad,
        wanddickeMm: Math.max(0, zahl(g.wanddickeMm, 0)),
        breite: breite != null && breite > 0 ? breite : null,
        bettung: Math.max(0, zahl(g.bettung, GRABENREGELN.bettung.ueblich)),
        schachtMass: Math.max(0.3, zahl(g.schachtMass ?? g.schachtDm, 1.0)),
    };
}

/** Eine Quelle oder eine Liste davon — als Liste. */
const _liste = (q) => (q == null ? [] : (Array.isArray(q) ? q : [q]));
/** Feinste Zellweite des Graben-Korridors (m) und sein Rand um Rohre und Schächte (m). */
/**
 * Ist eine der Operationen SCHMALER als zwei Zellen? Dann wird sie auf dem
 * groben Raster nicht mehr richtig getroffen, und der feine Korridor lohnt.
 * Dieselbe Frage, die `gerinne` schon als Warnung stellt — hier als
 * Entscheidung, damit Warnung und Kur dieselbe Grösse messen.
 */
function _zuFeinFuerZelle(raster, operationen) {
    const cell = Number(raster?.cell) || 0;
    if (!cell) return false;
    for (const op of operationen ?? []) {
        const p = op?.parameter ?? {};
        let mass = Infinity;
        if (op.art === 'gerinne') mass = Number(p.sohlbreite) || 0;
        else if (op.art === 'baugrube') {
            mass = Math.min(
                Number(p.laenge) || Infinity,
                Number(p.breite) || Infinity,
                (Number(p.radius) || Infinity) * 2,
            );
        } else continue;                       // Planum/Böschung sind flächig
        if (mass > 0 && mass < cell * 2) return true;
    }
    return false;
}

/**
 * Die gemeinsame Ausdehnung aller Operationen einer Formung, plus Rand.
 *
 * Sie kommt aus DEMSELBEN `wirkbereichVon`, das auch die Rasterschleifen
 * eingrenzt — Korridor und Rechenbereich messen damit dieselbe Grösse.
 * Zwei Wege dorthin wären zwei Antworten auf „wo wirkt das?" (Gesetz 7).
 */
function _erdbauKorridor(raster, operationen) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const op of operationen ?? []) {
        const b = wirkbereichVon(raster, op?.art, op?.parameter ?? {});
        if (!b) return null;                     // eine Operation ohne Grenze ⇒ kein Korridor
        minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX);
        minZ = Math.min(minZ, b.minZ); maxZ = Math.max(maxZ, b.maxZ);
    }
    if (!Number.isFinite(minX)) return null;
    const r = ERDBAU_KORRIDOR_RAND;
    return { minX: minX - r, maxX: maxX + r, minZ: minZ - r, maxZ: maxZ + r };
}

/**
 * Der ERDBAU-KORRIDOR (2026-09-09, auf Fabios „extrem heavy 3D").
 *
 * Zweimal derselbe Gedanke wie beim Kanalgraben, aus zwei Gründen:
 *  - GENAUIGKEIT: eine 4-m-Sohle in 2-m-Zellen ist grob; im Korridor wird
 *    feiner gerastert, und Massen wie Körper stimmen dadurch besser.
 *  - TEMPO: gerechnet wird nur, wo die Formung wirkt.
 * Das sichtbare DGM bleibt das VOLLE Raster — sonst hätte die Oberfläche
 * ein Loch, wo der Korridor endet.
 */
export const ERDBAU_ZELLE = 0.5;
export const ERDBAU_KORRIDOR_RAND = 15;
/**
 * SO VIELE FEINE ZELLEN DARF EIN VORGANG KOSTEN (Teil XXI, 2026-09-17).
 *
 * Gemessen im Browser an der 80 × 80 m grossen Testgrube: bei 0,5 m sind das
 * rund 31.000 Zellen, der Körper bekommt 52.784 Dreiecke, und ein Übernehmen
 * dauert 10,7 s statt 6,6 s. Fabio: „Gräben können zig Meter lang werden —
 * dort braucht es ein smartes Handling."
 *
 * 20.000 setzt die Grube auf 0,667 m (drei Teilungen statt vier) und spart
 * damit knapp die Hälfte der Dreiecke. Was SCHMAL ist, bleibt fein: die
 * Kennweite in `feinheitAus` überstimmt das Budget, sonst verschwände eine
 * 0,9-m-Grabensohle, nur weil ihr Graben lang ist.
 *
 * Vorher 160.000 — eine Zahl, die nie band.
 */
export const ERDBAU_ZELLBUDGET = 20000;

export const KANALGRABEN_ZELLE = 0.5;
export const KANALGRABEN_KORRIDOR_RAND = 12;
/**
 * Abstand der Stationen entlang einer Haltung (m) — Teil XXI, P2b.
 *
 * Bis dahin mass der Graben seine Tiefe an den ZWEI Segmentenden und nahm die
 * grössere: über 60 m Haltung eine einzige Sohlbreite, und die Grabensohle
 * eine Gerade zwischen zwei Punkten. Zwei Meter sind vier Rasterzellen des
 * Korridors (0,5 m) — feiner als das Gelände, das der Graben schneidet, und
 * grob genug, dass eine lange Haltung nicht Hunderte Stationen bekommt.
 */
export const KANALGRABEN_STATION = 2;
/** Wie nah ein Rohrende am Schacht liegen muss, um als Anschluss zu zählen (m). */
export const KANALGRABEN_ANSCHLUSS = 2;
/**
 * Soviele Querprofile trägt ein Grabenkörper höchstens (Teil XXI, P6).
 *
 * Fabio, 2026-09-17: „Gräben können zig Meter lang werden." Bei festem
 * Profilabstand hinge die Dreieckszahl an der Länge; hier wächst stattdessen
 * der Abstand. 400 Profile sind bei 500 m Strang 1,25 m — immer noch feiner,
 * als das Gelände dort aufgelöst ist.
 */
export const KANALGRABEN_PROFILE_MAX = 400;

/**
 * Eine Polylinie in Stationen zerlegen: jeder Knickpunkt bleibt, dazwischen
 * höchstens `schritt` Meter. Die Höhe läuft linear im Segment mit.
 */
function _stationenEntlang(punkte, schritt) {
    const aus = [];
    for (let i = 0; i + 1 < punkte.length; i++) {
        const a = punkte[i], b = punkte[i + 1];
        const l = Math.hypot(b.x - a.x, b.z - a.z);
        aus.push({ x: a.x, y: a.y, z: a.z });
        if (!(l > 0)) continue;
        const teile = Math.max(1, Math.ceil(l / Math.max(0.01, schritt)));
        for (let k = 1; k < teile; k++) {
            const t = k / teile;
            aus.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
        }
    }
    const letzter = punkte[punkte.length - 1];
    aus.push({ x: letzter.x, y: letzter.y, z: letzter.z });
    return aus;
}

ABLEITUNGEN_ERWEITERT.kanalgraben = {
    id: 'kanalgraben',
    titel: 'Kanalgraben',
    icon: 'gerinne',
    erdbau: true,
    bauform: 'koerper',
    kategorieVorgabe: 'IFCEARTHWORKSCUT',
    mindestPunkte: 0,
    geschlossen: false,
    felder: [],
    /**
     * QUELLEN (B3): `rohre` ist eine LISTE (eine Haltung oder der Strang),
     * `schaechte` die Schächte an ihren Enden (Baugruben), `gelaende` das
     * DGM. Alt-Journale nennen `rohr` (Einzel) — wird als Liste gelesen.
     */
    braucht: { rohr: ['achse+profil'], rohre: ['achse+profil'], schaechte: ['koerper', 'punkt', 'netz'], gelaende: ['hoehenfeld'] },
    formen:  { rohr: 'linie', rohre: 'linie', schaechte: 'knoten', gelaende: 'raster' },
    teile: [
        { rolle: 'graben', kategorie: 'IFCEARTHWORKSCUT', bauform: 'koerper', form: 'koerper',
          predefinedType: 'TRENCH', name: (q) => `${q} · Graben`,
          // Menge (Stufe 2) — siehe erdbau; die Länge ist die Achslänge der Rohre.
          // `aushubMasse` ist die EINE geltende Zahl (Teil XXI, P6): der
          // Profilkörper, wo es ihn gibt, sonst das Raster. `aushubRaster` und
          // `aushubKoerper` stehen als die beiden Wege daneben.
          menge: { undisturbedVolume: 'aushubMasse', looseVolume: 'aushubLose', length: 'laenge' } },
        { rolle: 'verfuellung', kategorie: 'IFCEARTHWORKSFILL', bauform: 'koerper', form: 'koerper',
          predefinedType: 'BACKFILL', name: (q) => `${q} · Verfüllung`,
          menge: { compactedVolume: 'verfuellung' } },
        // kein `dgm`-Teil mehr (Stufe 1) — siehe erdbau; `leite` liefert es weiter.
    ],

    /**
     * DER GRABEN NACH NORM (B3): je Segment ein Gerinne mit der Sohlbreite aus
     * DIN EN 1610 (Tabelle 1 nach DN und Wandform, Tabelle 2 nach Tiefe — der
     * grössere Wert), Wand nach DIN 4124 (verbaut senkrecht, abgeböscht mit
     * dem Winkel der Bodenklasse, oder senkrecht ohne Verbau bis 1,25 m);
     * je Schacht eine runde Baugrube (Aussendurchmesser + 2 · Arbeitsraum).
     * Befunde beraten: senkrecht ohne Verbau zu tief, Böschung zu steil,
     * Überdeckung zu gering — gebaut wird trotzdem (Gesetz 6).
     */
    /**
     * DER KORRIDOR (B3): ein Graben von 0,9 m Breite in einem DGM mit 2-m-Zellen
     * ist kein Graben — das Budget von 250 000 Zellen vergröbert ein ganzes
     * Gelände auf Meter. Deshalb verlangt das Rezept nach den Hauptquellen ein
     * ZWEITES Raster derselben Kennung: fein (≤ 0,5 m), zugeschnitten auf den
     * Streifen um Rohre und Schächte. Darauf werden Graben, Massen, Tiefe und
     * Überdeckung gerechnet; das sichtbare DGM-Teil bleibt das volle Raster mit
     * denselben Operationen (grob, aber lückenlos).
     */
    zusatzQuellen(parameter, quellen, genannt) {
        const gid = genannt?.gelaende;
        if (!gid) return {};
        const punkte = [];
        for (const r of _liste(quellen?.rohre ?? quellen?.rohr)) for (const p of (r?.punkte ?? [])) punkte.push(p);
        for (const s of _liste(quellen?.schaechte)) punkte.push(s);
        const xs = punkte.map(p => Number(p?.x)).filter(Number.isFinite), zs = punkte.map(p => Number(p?.z)).filter(Number.isFinite);
        if (!xs.length) return {};
        const rand = KANALGRABEN_KORRIDOR_RAND;
        const ur = quellen?.gelaende;
        const grob = Number(ur?.cell) || Number(parameter?.raster?.cell) || 1;
        // DIE FEINHEIT NACH DERSELBEN REGEL wie der Erdbau (Teil XXI): bis
        // hierher nahm der Graben FEST 0,5 m ohne jedes Budget. Bei einem
        // Strang über hunderte Meter sind das Millionen Zellen — Fabio:
        // „Gräben können zig Meter lang werden".
        //
        // Seine Fläche ist ein STREIFEN (Länge × Korridorbreite), nicht das
        // Hüllrechteck: ein diagonaler Strang füllt seine Hülle nicht aus.
        // Seine Kennweite ist die schmalste Grabensohle nach DIN EN 1610
        // Tabelle 1 (ohne Tiefe — die kennt erst `leite`); schmaler wird der
        // Graben nie, also darf die Zelle nie gröber werden, als sie auflöst.
        const w = _kanalgrabenWerte(parameter, _liste(quellen?.rohre ?? quellen?.rohr)[0] ?? null);
        const wand = wandFuer({ wandform: w.wandform, boden: w.boden, winkelGrad: w.winkelGrad });
        let laenge = 0, schmalste = Infinity;
        for (const r of _liste(quellen?.rohre ?? quellen?.rohr)) {
            const pts = (r?.punkte ?? []).filter(p => [p?.x, p?.z].every(v => Number.isFinite(Number(v))));
            for (let i = 0; i + 1 < pts.length; i++) laenge += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
            const dn = w.dnFest || Number(r?.dn) || w.dn;
            schmalste = Math.min(schmalste, grabenbreite({ dn, wanddickeMm: w.wanddickeMm, tiefe: 0, wand, eigene: w.breite }).sohlbreite);
        }
        const streifen = 2 * rand;
        const flaeche = Math.max(1, laenge * streifen + _liste(quellen?.schaechte).length * streifen * streifen);
        const { k, cell } = feinheitAus({ grob, flaeche, kennweite: Number.isFinite(schmalste) ? schmalste : null,
                                          zelle: KANALGRABEN_ZELLE, budget: ERDBAU_ZELLBUDGET });
        if (k < 2) return {};
        return { gelaendeFein: { gid, form: 'raster', opts: {
            cell,
            bereich: { minX: Math.min(...xs) - rand, maxX: Math.max(...xs) + rand, minZ: Math.min(...zs) - rand, maxZ: Math.max(...zs) + rand },
            // Auf dem Gitter des groben Rasters (Teil XXI) — Grabenkörper und
            // Geländeanzeige sollen dieselbe Fläche zeigen, nicht zwei fast gleiche.
            ...(ur ? { gitter: { x0: ur.x0, z0: ur.z0, cell: ur.cell } } : {}),
        } } };
    },

    async leite(parameter, quellen, { kernel, stapel = null } = {}) {
        const ur = quellen?.gelaende;                    // nach allen Vorgängern (Stapel)
        const fein = quellen?.gelaendeFein ? (stapel?.vorherVon?.(quellen.gelaendeFein) ?? quellen.gelaendeFein) : null;
        const rechen = fein ?? ur;                       // worauf Graben, Massen, Tiefe gerechnet werden
        const rohre = _liste(quellen?.rohre ?? quellen?.rohr);
        const schaechte = _liste(quellen?.schaechte);
        // Die KENNUNGEN der Rohre laufen in derselben Reihenfolge wie ihre Formen —
        // ein Befund je Rohr gehört an DESSEN Zeile in der Prüfliste, nicht ans DGM.
        const rohrGids = _liste(parameter?.quellen?.rohre ?? parameter?.quellen?.rohr);
        if (!ur) throw new Error('kanalgraben: Quellgelände fehlt');
        if (!rohre.length) throw new Error('kanalgraben: Rohrachse fehlt');
        if (!kernel) throw new Error('kanalgraben: kein Kernel');
        const warnungen = [];
        const befunde = [];
        const w = _kanalgrabenWerte(parameter, rohre[0]);
        const wand = wandFuer({ wandform: w.wandform, boden: w.boden, winkelGrad: w.winkelGrad });
        const hoeheAn = (x, z) => { const h = rasterAbtasten(rechen, x, z); return Number.isFinite(h) ? h : rasterAbtasten(ur, x, z); };

        const ops = [];
        let laenge = 0, tiefeMax = 0, rohrVolumen = 0;
        const breiten = [];
        const gruende = new Set();
        const rohrKoerper = [];
        const rohrEnden = [];                            // Anschlusssohlen für die Schachtbaugruben
        const bezuege = new Set();
        let ueberdeckungMin = Infinity;
        for (const [ri, rohr] of rohre.entries()) {
            const pts = (rohr?.punkte ?? []).map(p => ({ x: Number(p.x), y: Number(p.y), z: Number(p.z) }));
            if (pts.length < 2) throw new Error(`kanalgraben: Rohrachse ${ri + 1} fehlt`);
            if (pts.some(p => !Number.isFinite(p.y))) throw new Error(`kanalgraben: Rohrachse ${ri + 1} ohne Höhe`);
            const dn = w.dnFest || Number(rohr?.dn) || w.dn;
            const r = dn / 2000;
            // WO DIE ACHSE LIEGT (Teil XXI, E4): das Formular sagt es, sonst
            // die Quelle. Vorher rechnete diese Stelle FEST mit der Rohrmitte,
            // während der Längsschnitt dieselbe Höhe als Sohle las — bei
            // isyifc-Achsen grub der Graben DN/2 zu tief.
            const bezug = bezugWaehlen(w.achsbezug, rohr?.achsbezug);
            const rohrBezug = { achsbezug: bezug, dn };
            bezuege.add(bezug);

            // DIE STATIONEN: Sohle der Haltung, alle `KANALGRABEN_STATION` m
            // plus jeder Knickpunkt. Die Grabensohle liegt um die Bettung
            // darunter, die Tiefe misst sich am Gelände GENAU DORT.
            const roh = _stationenEntlang(pts, KANALGRABEN_STATION);
            const stationen = roh.map(s => {
                const grabensohle = rohrsohle(s.y, rohrBezug) - w.bettung;
                const h = hoeheAn(s.x, s.z);
                return { x: s.x, y: grabensohle, z: s.z,
                         tiefe: Number.isFinite(h) ? Math.max(0, h - grabensohle) : 0 };
            });
            // DIE SOHLBREITE JE TEILSTRECKE: DIN EN 1610 Tabelle 2 ist eine
            // Stufenfunktion der Tiefe — je Teilstrecke die grössere ihrer
            // beiden Tiefen, nicht eine Breite für die ganze Haltung.
            for (let i = 0; i + 1 < stationen.length; i++) {
                const tiefe = Math.max(stationen[i].tiefe, stationen[i + 1].tiefe);
                tiefeMax = Math.max(tiefeMax, tiefe);
                const gb = grabenbreite({ dn, wanddickeMm: w.wanddickeMm, tiefe, wand, eigene: w.breite });
                stationen[i].sohlbreite = gb.sohlbreite;
                breiten.push(gb.sohlbreite);
                gruende.add(gb.grund);
                for (const hinweis of gb.hinweise) warnungen.push(`grabenbreite: ${hinweis}`);
            }
            stationen[stationen.length - 1].sohlbreite = stationen[stationen.length - 2].sohlbreite;
            for (let i = 0; i + 1 < pts.length; i++) {
                laenge += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y, pts[i + 1].z - pts[i].z);
            }
            // EINE Operation je Haltung — Stirnseiten damit nur an den echten Enden.
            ops.push({ art: 'gerinne', parameter: {
                stationen: stationen.map(s => ({ x: s.x, y: s.y, z: s.z, sohlbreite: s.sohlbreite })),
                boeschung: wand.n,
                sohlbreite: Math.max(...stationen.map(s => s.sohlbreite ?? 0)),
            } });
            for (const p of [pts[0], pts[pts.length - 1]]) {
                rohrEnden.push({ x: p.x, z: p.z, sohle: rohrsohle(p.y, rohrBezug) });
            }

            // ÜBERDECKUNG je Rohr: Rohrscheitel gegen das Gelände VOR DIESEM
            // GRABEN — also den Stand nach allen Vorgängern. Dieselbe Aussage
            // steht im Text und in `quelle`; vorher sagten Kommentar
            // („Ur-Gelände"), Text („Fertiggelände") und Rechnung Verschiedenes.
            let deckungMin = Infinity;
            const probe = (x, y, z) => {
                const h = hoeheAn(x, z);
                if (Number.isFinite(h)) deckungMin = Math.min(deckungMin, h - rohrscheitel(y, rohrBezug));
            };
            for (let i = 0; i < pts.length; i++) {
                probe(pts[i].x, pts[i].y, pts[i].z);
                if (i + 1 < pts.length) probe((pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2, (pts[i].z + pts[i + 1].z) / 2);
            }
            if (Number.isFinite(deckungMin)) ueberdeckungMin = Math.min(ueberdeckungMin, deckungMin);
            if (Number.isFinite(deckungMin) && deckungMin < MINDEST_UEBERDECKUNG) {
                befunde.push({ regel: 'ueberdeckung_gering', schwere: 'warnung',
                    globalId: rohrGids[ri] ?? null,
                    text: `Überdeckung ${deckungMin.toFixed(2)} m unter ${MINDEST_UEBERDECKUNG.toFixed(1)} m (Rohrscheitel gegen das Gelände vor diesem Graben${rohre.length > 1 ? `, Rohr ${ri + 1} von ${rohre.length}` : ''})`,
                    wert: `${deckungMin.toFixed(2)} m`, grenze: `mindestens ${MINDEST_UEBERDECKUNG.toFixed(2)} m`,
                    quelle: 'Kanalgraben-Ableitung (Gelände vor diesem Graben)' });
            }
            // DER ROHRKÖRPER — geschlossener Sweep UM DIE ROHRMITTE; fällt er
            // aus, gilt die Formel.
            const mitte = pts.map(p => ({ ...p, y: rohrmitte(p.y, rohrBezug) }));
            let seg = 0;
            for (let i = 0; i + 1 < mitte.length; i++) seg += Math.hypot(mitte[i + 1].x - mitte[i].x, mitte[i + 1].y - mitte[i].y, mitte[i + 1].z - mitte[i].z);
            const sw = await kernel.op('sweep', { profil: kreisProfil(r, 12), achse: { punkte: mitte } });
            if (sw.ergebnis?.closed) { rohrVolumen += sw.ergebnis.volumen; rohrKoerper.push(sw.ergebnis); }
            else { rohrVolumen += Math.PI * r * r * seg; warnungen.push(`rohrvolumen_analytisch: Rohr ${ri + 1} nicht geschlossen — π·r²·L`); }
        }

        // DIE SCHACHTBAUGRUBEN — ECKIG (nie rund), Kantenlänge = Aussenmass +
        // 2 · Arbeitsraum, ausgerichtet entlang der anschliessenden Haltung,
        // Sohle = Schachtsohle − Bettung, Wand wie der Graben.
        const bm = baugrubenmass({ aussenmass: w.schachtMass, wand });
        for (const s of schaechte) {
            if (!Number.isFinite(s?.x) || !Number.isFinite(s?.z) || !Number.isFinite(s?.y)) continue;
            // DIE BAUGRUBE REICHT BIS UNTER DEN SCHACHT (Teil XXI, P2c).
            //
            // Vorher: `s.y − Bettung`, und `s.y` ist die PLATZIERUNG, nicht die
            // Schachtsohle. Die Grabensohle daneben liegt bei
            // `Rohrsohle − Bettung` — beides klaffte um den Rohrhalbmesser
            // auseinander, bei DN 300 fünfzehn Zentimeter, in `b3.test.js`
            // sogar festgeschrieben. Jetzt zählt der TIEFSTE der drei
            // belegbaren Punkte: die Unterkante der Hülle, die Platzierung und
            // die Sohlen der anschliessenden Haltungen.
            const anschluesse = rohrEnden
                .filter(e => Math.hypot(e.x - s.x, e.z - s.z) <= KANALGRABEN_ANSCHLUSS)
                .map(e => e.sohle);
            const unten = Math.min(Number.isFinite(s.unterkante) ? s.unterkante : s.y, ...anschluesse);
            const sohle = unten - w.bettung;
            const h = hoeheAn(s.x, s.z);
            if (Number.isFinite(h)) tiefeMax = Math.max(tiefeMax, h - sohle);
            const richtung = baugrubenRichtung(s, rohre);
            ops.push({ art: 'baugrube', parameter: { mitte: { x: s.x, z: s.z }, laenge: bm.laenge, breite: bm.breite, richtung, sohle, neigung: wand.n } });
        }
        if (schaechte.length) gruende.add(`Baugrube ${bm.grund}`);

        befunde.push(...pruefeGraben({ wand, tiefeMax }));

        // Rechnen auf dem FEINEN Korridor; das sichtbare DGM bekommt dieselben Ops auf dem vollen Raster.
        const { raster: neuFein, warnungen: w1 } = formeNach(rechen, ops);
        warnungen.push(...w1);
        const neu = fein ? formeNach(ur, ops).raster : neuFein;
        const massen = massenAus(rechen, neuFein) ?? { aushub: 0, auftrag: 0 };

        // ── DER GRABENKÖRPER (Teil XXI, P6) ──────────────────────────────────
        //
        // Ein Graben ist ein Trapez aus der Norm, kein Abdruck des Geländes.
        // Aus Rasterknoten gebaut wackelt seine Sohle um eine Zellweite, und
        // bei SENKRECHTEN Wänden — `wandform: 'verbau'`, die Vorgabe — ist
        // auch die Masse unbrauchbar: gemessen +38,6 % gegen die Handrechnung
        // (`geometrie/ops/Graben.js` nennt die ganze Messreihe). Deshalb aus
        // QUERPROFILEN, wo es geht.
        //
        // Es geht, wenn dieser Vorgang aus GENAU EINEM Graben besteht. Zwei
        // Haltungen oder eine Schachtbaugrube daneben durchdringen einander;
        // zwei überlappende Schalen wären keine Menge mehr, und die
        // 3D-Vereinigung dafür rechnet auf dem Server (G7). Dann bleibt es
        // beim Rasterkörper — und der sagt es.
        const gerinneOps = ops.filter(o => o.art === 'gerinne');
        const profilFaehig = ops.length === 1 && gerinneOps.length === 1;
        let graben = null, koerperArt = 'raster', koerperGrund = null;
        if (profilFaehig) {
            const pk = await kernel.op('grabenkoerper', { raster: rechen }, {
                stationen: gerinneOps[0].parameter.stationen,
                boeschung: wand.n,
                // Ein Strang kann hunderte Meter lang werden (Fabio, 2026-09-17):
                // die Profilzahl ist gedeckelt, der Schritt wächst mit der Länge.
                schritt: Math.max(GRABEN_SCHRITT, laenge / KANALGRABEN_PROFILE_MAX),
                quer: Math.max(rechen.cell, GRABEN_QUER),
            });
            if (pk.ergebnis?.closed) { graben = pk; koerperArt = 'profil'; }
            else {
                koerperGrund = pk.warnungen.join('; ') || 'kein geschlossener Profilkörper';
                warnungen.push(`grabenkoerper_raster: ${koerperGrund}`);
            }
        } else {
            koerperGrund = ops.length > 1
                ? `${gerinneOps.length} Graben und ${ops.length - gerinneOps.length} Baugrube(n) in einem Vorgang — sie durchdringen einander`
                : 'kein Graben in diesem Vorgang';
        }
        if (!graben) graben = await kernel.op('koerperZwischenRastern', { oben: rechen, unten: neuFein });

        // DIE MASSE: der Profilkörper, wenn es ihn gibt — sonst das Raster.
        // EINE Zahl trägt die Menge (`aushubMasse`), die beiden Wege stehen
        // daneben, und `massenQuelle` sagt, welcher gezählt hat.
        const aushubMasse = koerperArt === 'profil' ? graben.ergebnis.volumen : massen.aushub;
        const abwGraben = koerperArt === 'profil'
            ? _profilGegenprobe(graben.ergebnis, massen.aushub, wand, befunde)
            : _gegenprobe('Graben', graben.ergebnis, massen.aushub, befunde, warnungen);
        if (koerperArt !== 'profil' && !(wand.n > 0) && massen.aushub > GEGENPROBE_MINDEST_M3) {
            // Kein Profilkörper UND senkrechte Wände: die Masse kommt aus dem
            // Raster, und das kann eine Sprungfunktion nicht messen. Laut
            // statt tot (Gesetz 10) — die Grössenordnung steht dabei.
            const b = breiten.length ? Math.min(...breiten) : 0;
            befunde.push({ regel: 'masse_senkrecht_raster', schwere: 'warnung',
                text: `Senkrechte Wände auf ${rechen.cell.toFixed(2)} m Raster: die Aushubmasse kann um rund ${b > 0 ? (100 * rechen.cell / b).toFixed(0) : '50'} % danebenliegen${koerperGrund ? ` (kein Profilkörper: ${koerperGrund})` : ''}`,
                wert: `${massen.aushub.toFixed(1)} m³ aus dem Raster`,
                quelle: 'Kanalgraben-Ableitung (Teil XXI, P6)' });
        }
        const faktor = auflockerungOder(parameter?.auflockerung, auflockerungFuer(w.boden));
        const verfuellung = Math.max(0, aushubMasse - rohrVolumen);

        // DER VERFÜLLUNGSKÖRPER (G7): Graben minus ALLE Rohre — EINE 3D-Differenz
        // auf dem Server, die Rohre als Liste. Vorher lief je Rohr eine
        // Rundreise, und das Ergebnis der ersten kam als „kein geschlossener
        // Körper" zurück: manifold lässt Splitter unter 1 mm an der Schnittkurve,
        // die das Verschmelzen beim Wiederlesen zu Nullflächen macht (B3-
        // Nachprüfung 2026-09-09). Der Server kettet jetzt in-process.
        let verfuellungKoerper = null;
        if (graben.ergebnis && rohrKoerper.length === rohre.length) {
            const vf = await kernel.op('booleDifferenz', { a: graben.ergebnis, b: rohrKoerper });
            if (vf.ergebnis) verfuellungKoerper = vf.ergebnis;
            else warnungen.push(`verfuellung_koerper_fehlt: ${vf.warnungen.join('; ') || 'kein Ergebnis'}`);
        } else {
            warnungen.push('verfuellung_koerper_fehlt: Graben oder Rohrkörper fehlt');
        }

        const { kanten, bild, warnungen: w3 } = await _kantenUndBild(kernel, rechen, neuFein, ops);
        warnungen.push(...w3);
        return {
            teile: {
                graben: graben.ergebnis ? { form: 'koerper', daten: graben.ergebnis } : null,
                verfuellung: verfuellungKoerper ? { form: 'koerper', daten: verfuellungKoerper } : null,
                dgm: { form: 'raster', daten: neu },
            },
            kennzahlen: {
                zellweite: rechen.cell, zellweiteDgm: ur.cell, korridor: !!fein,
                aushubRaster: massen.aushub, aushubKoerper: graben.ergebnis?.volumen ?? 0,
                auftragRaster: 0, auftragKoerper: 0,
                // WELCHE ZAHL GILT (Teil XXI, P6) — und warum diese.
                aushubMasse, koerperArt, koerperGrund,
                massenQuelle: koerperArt === 'profil' ? 'Querprofile' : 'Raster',
                rohrVolumen, verfuellung, verfuellungKoerper: verfuellungKoerper?.volumen ?? null,
                // Auflockerung (Teil XXI, P4): Vorgabe aus der Bodenklasse, die
                // der Graben ohnehin führt — im Formular änderbar.
                auflockerung: faktor,
                aushubLose: aushubMasse * faktor,
                gegenprobeAushub: abwGraben,
                laenge, dn: w.dnFest || (rohre.length === 1 ? (Number(rohre[0]?.dn) || w.dn) : null),
                // WORAUF SICH DIE HÖHEN BEZIEHEN (E4) — sichtbar, nicht angenommen.
                achsbezug: bezuege.size === 1 ? [...bezuege][0] : [...bezuege].sort().join('+'),
                achsbezugWahl: w.achsbezug,
                stationen: KANALGRABEN_STATION,
                sohlbreite: breiten.length ? Math.max(...breiten) : null,
                sohlbreiteMin: breiten.length ? Math.min(...breiten) : null,
                ueberdeckungMin: Number.isFinite(ueberdeckungMin) ? ueberdeckungMin : null,
                tiefeMax, rohre: rohre.length, schaechte: schaechte.length,
                wandform: wand.wandform, winkelGrad: wand.winkelGrad, neigung: wand.n,
                regel: GRABENREGELN.quelle, gruende: [...gruende],
                operationen: ops.length,
                reihe: stapel?.reihe ?? 0,
                kanten: kantenUebersicht(kanten),
            },
            befunde, warnungen, bild, kanten,
            ops,
        };
    },

    /**
     * Vorschau (S2/B3): der Graben als Trapez-Sweep an der Rohrachse des
     * SUBJEKTS — beim Strang an jeder Haltung der Kette, dazu ein Zylinder je
     * Schacht. Sohlbreite und Wand nach denselben Regeln wie im Lauf; die
     * Tiefe kommt vom Sampler.
     */
    vorschau(parameter, { subjekt = null, hoeheAn = null, farben = {} } = {}) {
        const farbe = farben.warn ?? '#ffb74d';
        const w = _kanalgrabenWerte(parameter, { dn: subjekt?.achse?.dn ?? null });
        const wand = wandFuer({ wandform: w.wandform, boden: w.boden, winkelGrad: w.winkelGrad });
        const achse = subjekt?.achse ?? null;
        const stuetz = achse?.polyline ?? achse?.punkte;
        const roh = Array.isArray(stuetz) && stuetz.length >= 2 ? stuetz : (achse?.anfang && achse?.ende ? [achse.anfang, achse.ende] : []);
        const eigen = roh.map(p => ({ x: Number(p.x), y: Number(p.y), z: Number(p.z) })).filter(p => [p.x, p.y, p.z].every(Number.isFinite));
        if (eigen.length < 2) return { primitive: [], chips: [{ art: 'vorschau', text: 'Kanalgraben — Achse fehlt' }], hinweise: [] };
        // Die Läufe: das Subjekt, beim Strang die ganze Kette (Anfang → Ende je Haltung).
        // DIESELBE STELLE WIE IM LAUF (Teil XXI, E4): was das Formular sagt,
        // sonst der Bezug der Quelle. Eine Vorschau, die anders rechnet als das
        // Übernehmen, ist schlimmer als keine.
        const laeufe = [{ punkte: eigen, dn: w.dnFest || achse?.dn || w.dn, achsbezug: bezugWaehlen(w.achsbezug, achse?.achsbezug) }];
        if (w.umfang === 'strang') {
            for (const k of (subjekt?.strang ?? [])) {
                if (k?.globalId === subjekt?.globalId || !k?.anfang || !k?.ende) continue;
                laeufe.push({ punkte: [k.anfang, k.ende].map(p => ({ x: Number(p.x), y: Number(p.y), z: Number(p.z) })),
                              dn: w.dnFest || k.dn || w.dn, achsbezug: bezugWaehlen(w.achsbezug, k.achsbezug ?? achse?.achsbezug) });
            }
        }
        const primitive = [];
        let deckung = Infinity, breiteMax = 0, tiefeMax = 0;
        for (const l of laeufe) {
            const r = l.dn / 2000;
            const bezug = { achsbezug: l.achsbezug, dn: l.dn };
            const sohle = l.punkte.map(p => ({ x: p.x, y: rohrsohle(p.y, bezug) - w.bettung, z: p.z }));
            const tiefe = _tiefeUeber(hoeheAn, sohle, 2 * r + w.bettung + 1);
            tiefeMax = Math.max(tiefeMax, tiefe);
            const gb = grabenbreite({ dn: l.dn, wanddickeMm: w.wanddickeMm, tiefe, wand, eigene: w.breite });
            breiteMax = Math.max(breiteMax, gb.sohlbreite);
            primitive.push(..._grabenGeist(sohle, { sohlbreite: gb.sohlbreite, boeschung: wand.n, tiefe }, farbe));
            for (const p of l.punkte) { const h = hoeheAn?.(p.x, p.z); if (Number.isFinite(h)) deckung = Math.min(deckung, h - rohrscheitel(p.y, bezug)); }
        }
        // Die Schächte am Strang: ein Zylinder je Baugrube.
        const kanten = w.umfang === 'strang' ? [{ anfang: eigen[0], ende: eigen[eigen.length - 1] }, ...(subjekt?.strang ?? [])] : [{ anfang: eigen[0], ende: eigen[eigen.length - 1] }];
        const schaechte = schaechteAnKanten(kanten, subjekt?.schachtKnoten ?? []);
        const bm = baugrubenmass({ aussenmass: w.schachtMass, wand });
        // Die Anschlusssohlen wie im Lauf — sonst zeigt die Vorschau eine
        // Baugrube, die flacher endet als die, die entsteht (P2c).
        const vorschauEnden = laeufe.flatMap(l => {
            const bezug = { achsbezug: l.achsbezug, dn: l.dn };
            return [l.punkte[0], l.punkte[l.punkte.length - 1]]
                .map(q => ({ x: q.x, z: q.z, sohle: rohrsohle(q.y, bezug) }));
        });
        for (const s of schaechte) {
            const p = s.punkt ?? s;
            const nah = vorschauEnden.filter(e => Math.hypot(e.x - p.x, e.z - p.z) <= KANALGRABEN_ANSCHLUSS).map(e => e.sohle);
            const sohle = Math.min(p.y, ...nah) - w.bettung;
            const h = hoeheAn?.(p.x, p.z);
            const oben = Number.isFinite(h) ? h : sohle + 2;
            const richtung = baugrubenRichtung(p, kanten);
            const tiefe = oben - sohle;
            const r = tiefe * wand.n;
            const unten = rechteckUmriss(p, bm.laenge, bm.breite, richtung).map(q => ({ x: q.x, y: sohle, z: q.z }));
            const deckel = rechteckUmriss(p, bm.laenge + 2 * r, bm.breite + 2 * r, richtung).map(q => ({ x: q.x, y: oben, z: q.z }));
            primitive.push(_kastenGeist(unten, deckel, farbe));
            tiefeMax = Math.max(tiefeMax, tiefe);
        }
        const chips = [{ art: 'vorschau', text: `Graben ${WANDFORMEN[wand.wandform]?.titel ?? wand.wandform}${wand.n > 0 ? ` ${wand.winkelGrad}° (auch Stirnseiten)` : ''} · Sohlbreite bis ${breiteMax.toFixed(2)} m (DIN EN 1610)${laeufe.length > 1 ? ` · Strang: ${laeufe.length} Haltungen` : ''}${schaechte.length ? ` · ${schaechte.length} Baugrube${schaechte.length === 1 ? '' : 'n'}` : ''}` }];
        // WAS HIER ANGENOMMEN WIRD, STEHT DA (E4): die Achshöhe verschiebt den
        // ganzen Graben um DN/2 — das darf keine unsichtbare Annahme sein.
        chips.push({ art: 'vorschau',
                     text: bezugTitel(laeufe[0].achsbezug, { quelle: achse?.quelle, ausQuelle: w.achsbezug === 'quelle' }) });
        for (const b of pruefeGraben({ wand, tiefeMax })) chips.push({ art: 'warnung', text: b.text });
        if (Number.isFinite(deckung)) {
            chips.push({ art: deckung < MINDEST_UEBERDECKUNG ? 'warnung' : 'vorschau',
                         text: `Überdeckung ≥ ${deckung.toFixed(2)} m${deckung < MINDEST_UEBERDECKUNG ? ` — unter ${MINDEST_UEBERDECKUNG} m` : ''}` });
        }
        return { primitive, chips, hinweise: [] };
    },

    /** Der Bauplan trägt keine Punkte — die Quellen wandern selbst mit dem Rahmen. */
    verschiebe: (parameter) => parameter,

    fachmodell: (globalId, plan) => (plan?.rolle === 'dgm'
        ? { gelaende: [globalId] }
        : { koerper: [globalId] }),

    beschreibe: (nachher) => {
        const p = nachher?.parameter ?? {};
        const w = _kanalgrabenWerte(p, null);
        const rolle = { graben: 'Graben', verfuellung: 'Verfüllung', dgm: 'DGM' }[nachher?.rolle] ?? nachher?.rolle ?? '';
        const rohre = _liste(p.quellen?.rohre ?? p.quellen?.rohr).length;
        const schaechte = _liste(p.quellen?.schaechte).length;
        const umfang = rohre > 1 ? `Strang (${rohre} Haltungen${schaechte ? `, ${schaechte} Schächte` : ''})` : 'Haltung';
        const wand = WANDFORMEN[w.wandform]?.titel ?? w.wandform;
        const breite = w.breite ? `Sohlbreite ${w.breite.toFixed(2)} m` : 'Sohlbreite nach DIN EN 1610';
        const dn = w.dnFest ? `DN ${w.dnFest}` : 'DN aus Rohr';
        // Der Achsbezug gehört in die Beschreibung: er verschiebt jede Höhe des
        // Grabens um DN/2, und im Verlauf muss man sehen, was galt (E4).
        const bezug = w.achsbezug === 'quelle' ? 'Achse aus der Quelle' : bezugTitel(w.achsbezug);
        return `Kanalgraben · ${rolle} · ${dn} · ${umfang} · ${wand} · ${breite} · ${bezug}`;
    },
};

/**
 * DIE AUSSPARUNG (Teil XIV, G7) — der zweite Server-Verbraucher: ein
 * Bauwerkskörper minus ein eigener Körper (Aushub, Graben, Rohr, Schacht).
 * Das Ergebnis ist eine KOPIE des Bauwerks mit dem Abzug; das gelieferte
 * Original wird ausgeblendet (Gesetz 8: das Autorenmodell bleibt unberührt,
 * die Aussparung ist eine Forderung, die man sehen kann).
 *
 * Ohne Server-Kernel gibt es KEIN halbes Ding: `leite` wirft mit dem Grund,
 * der Lauf meldet den Misserfolg, „zurück" räumt den Vorgang.
 */
/**
 * BAUWERKSGRUBE (Teil XIX) — das Gelände passt sich an ein vorhandenes
 * Bauteil an, statt an einen gezeichneten Umriss.
 *
 * DER FALL: ein Fundament, ein Schacht, ein Widerlager oder eine
 * Trafostation steht im Gelände. Die Grube dafür ist kein Freihandpolygon,
 * sie folgt dem Bauwerk: Grundriss plus Arbeitsraum nach Norm, Sohle auf
 * der Gründungstiefe, Böschung nach aussen bis ans gewachsene Gelände.
 *
 * KEINE DATEN GEHEN VERLOREN. Das Bauwerk wird nicht angefasst — es ist die
 * QUELLE, nicht das Ergebnis. Das Ur-Gelände wird verborgen (nie gelöscht,
 * siehe IfcAutor), und die Subtraktion entsteht als eigenes
 * `IfcEarthworksCut`. Was der Planer geliefert hat, bleibt.
 *
 * NACH NORM: der Arbeitsraum kommt aus DIN 4124 (0,50 m geböscht, 0,60 m
 * verbaut — dieselbe Tabelle, die schon die Schachtbaugruben des
 * Kanalgrabens masst), der Böschungswinkel aus der Bodenklasse. Beides ist
 * überschreibbar, und `pruefeGraben` berät wie beim Graben: senkrecht ohne
 * Verbau über 1,25 m und Böschungen steiler als der Bodenwinkel werden
 * gemeldet — gebaut wird trotzdem (Gesetz 6).
 *
 * NICHT in dieser Fassung: die Rückverfüllung des Arbeitsraums. Sie ist
 * Grube minus Bauwerkskörper und bräuchte das Bauteil ein zweites Mal als
 * `koerper` — dafür fehlt der Anlass, solange niemand die Menge braucht.
 */
const BAUWERKSGRUBE = {
    id: 'bauwerksgrube',
    titel: 'Bauwerksgrube',
    icon: 'ausheben',
    erdbau: true,
    bauform: 'koerper',
    kategorieVorgabe: 'IFCEARTHWORKSCUT',
    mindestPunkte: 0,
    geschlossen: false,
    felder: [],
    braucht: { bauteil: ['koerper', 'flaeche+dicke', 'netz', 'punkt', 'flaeche'], gelaende: ['hoehenfeld'] },
    formen:  { bauteil: 'umriss', gelaende: 'raster' },
    teile: [
        { rolle: 'grube', kategorie: 'IFCEARTHWORKSCUT', bauform: 'koerper', form: 'koerper',
          predefinedType: 'EXCAVATION', name: (q) => `${q} · Baugrube`,
          menge: { undisturbedVolume: 'aushubRaster', looseVolume: 'aushubLose' } },   // Menge (Stufe 2) — siehe erdbau
        // kein `dgm`-Teil mehr (Stufe 1) — siehe erdbau; `leite` liefert es weiter.
    ],
    hoehenFelder: ERDBAU_HOEHENFELDER,

    async leite(parameter, quellen, { kernel, hoehenversatz = 0, stapel = null } = {}) {
        const ur = quellen?.gelaende;                    // nach allen Vorgängern (Stapel)
        const grundriss = quellen?.bauteil;
        if (!ur) throw new Error('bauwerksgrube: Quellgelände fehlt');
        if (!grundriss?.ring?.length) throw new Error('bauwerksgrube: kein Grundriss des Bauteils');
        if (!kernel) throw new Error('bauwerksgrube: kein Kernel');

        const warnungen = [];
        const befunde = [];
        const w = _grubenWand(parameter);
        const arbeitsraum = _arbeitsraumFuer(parameter, w);

        // DER UMRISS NACH AUSSEN: der Grundriss des Bauwerks plus Arbeitsraum.
        // „Aussen" wird an der FLÄCHE abgelesen, nicht an der Wicklung
        // vorausgesetzt — dieselbe Probe wie beim Versetzen einer Fläche.
        const aussen = _nachAussen(grundriss.ring, arbeitsraum);
        if (!aussen) throw new Error('bauwerksgrube: der Grundriss lässt sich nicht versetzen');

        // DIE SOHLE: getippt, sonst die Unterkante des Bauwerks. Sie steht im
        // Journal in m NN und wandert hier — wie überall — nach Welt-Y.
        const sohleNn = _grubenWerte(parameter).sohle;
        const sohle = Number.isFinite(sohleNn) ? weltAusNn(sohleNn, hoehenversatz) : grundriss.unterkante;
        if (!Number.isFinite(sohle)) throw new Error('bauwerksgrube: keine Sohle (weder getippt noch aus dem Bauteil)');

        const ops = [{ art: 'planum', parameter: { umriss: aussen, hoehe: sohle } }];
        if (w.n > 0) ops.push({ art: 'boeschung', parameter: { umriss: aussen, hoehe: sohle, neigung: w.n } });

        const { raster: neu, warnungen: w1 } = formeNach(ur, ops);
        warnungen.push(...w1);

        const grube = await kernel.op('koerperZwischenRastern', { oben: ur, unten: neu });
        const massen = massenAus(ur, neu) ?? { aushub: 0, auftrag: 0 };
        const abwGrube = _gegenprobe('Baugrube', grube.ergebnis, massen.aushub, befunde, warnungen);
        const faktorGrube = auflockerungOder(parameter?.auflockerung, auflockerungFuer(w.boden));

        // Die Tiefe: vom höchsten Geländepunkt über der Grube bis zur Sohle.
        const tiefe = _grubenTiefe(ur, aussen, sohle);
        for (const b of pruefeGraben({ wand: w, tiefeMax: tiefe })) befunde.push(b);
        if (arbeitsraum <= 0) {
            warnungen.push('arbeitsraum_null: ohne Arbeitsraum liegt die Grubenwand am Bauwerk');
        }

        const { kanten, bild, warnungen: wK } = await _kantenUndBild(kernel, ur, neu, ops);
        warnungen.push(...wK);

        return {
            teile: {
                grube: grube.ergebnis ? { form: 'koerper', daten: grube.ergebnis } : null,
                dgm: { form: 'raster', daten: neu },
            },
            kennzahlen: {
                aushubRaster: massen.aushub,
                aushubKoerper: grube.ergebnis?.volumen ?? 0,
                auflockerung: faktorGrube,
                aushubLose: massen.aushub * faktorGrube,
                gegenprobeAushub: abwGrube,
                grundflaeche: umrissFlaeche(grundriss.ring),
                grubenflaeche: umrissFlaeche(aussen),
                arbeitsraum,
                tiefeMax: tiefe,
                wandform: w.wandform,
                boeschung: w.n,
                reihe: stapel?.reihe ?? 0,
                kanten: kantenUebersicht(kanten),
            },
            befunde,
            warnungen,
            bild,
            kanten,
            ops,
        };
    },

    /** Der Umriss wandert mit dem Gelände — die Grube liegt am Bauwerk, nicht im Raum. */
    verschiebe: (parameter, delta) => ({
        ...parameter,
        operationen: verschiebeOperationen(parameter?.operationen ?? [], delta),
    }),

    fachmodell: (globalIds) => ({ kanten: [], knoten: [], koerper: [globalIds.grube].filter(Boolean),
                                  gelaende: [globalIds.dgm].filter(Boolean) }),

    beschreibe: (nachher) => {
        const w = _grubenWerte(nachher?.parameter ?? {});
        const teile = ['Bauwerksgrube'];
        if (Number.isFinite(w.arbeitsraum)) teile.push(`Arbeitsraum ${w.arbeitsraum.toFixed(2).replace('.', ',')} m`);
        teile.push(WANDFORMEN[w.wandform]?.titel ?? w.wandform);
        return teile.join(' · ');
    },

    /**
     * VORSCHAU: der versetzte Umriss als Kasten von der Sohle bis zum
     * höchsten Geländepunkt darüber — sofort, ohne Rasterlauf.
     */
    vorschau: (parameter, { subjekt, hoeheAn, hoehenversatz = 0 } = {}) => {
        const ring = subjekt?.grundriss?.ring ?? null;
        if (!ring?.length) return { primitive: [], chips: ['Baugrube — Grundriss wird beim Übernehmen gelesen'] };
        const w = _grubenWand(parameter);
        const aussen = _nachAussen(ring, _arbeitsraumFuer(parameter, w));
        if (!aussen) return { primitive: [], chips: [] };
        const sohleNn = _grubenWerte(parameter).sohle;
        const sohle = Number.isFinite(sohleNn) ? weltAusNn(sohleNn, hoehenversatz) : (subjekt?.grundriss?.unterkante ?? 0);
        let oben = sohle;
        for (const p of aussen) {
            const h = hoeheAn?.(p.x, p.z);
            if (Number.isFinite(h) && h > oben) oben = h;
        }
        const chips = [`Arbeitsraum ${_arbeitsraumFuer(parameter, w).toFixed(2).replace('.', ',')} m`,
                       WANDFORMEN[w.wandform]?.titel ?? w.wandform];
        return { primitive: [{ art: 'umriss', punkte: aussen.map(p => ({ x: p.x, y: oben, z: p.z })), geschlossen: true }], chips };
    },
};

/**
 * Die Werte der Grube stehen — wie beim Kanalgraben — in IHRER Operation,
 * nicht direkt am Bauplan: der trägt Quellen, Prüfmass, Zellweite und die
 * Operationsliste. Ein Weg, ein Ort.
 */
function _grubenWerte(parameter) {
    const g = (parameter?.operationen ?? []).find(o => o?.art === 'bauwerksgrube')?.parameter ?? {};
    const zahl = (v, vorgabe = null) => (v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : vorgabe);
    const wandform = WANDFORMEN[g.wandform] ? g.wandform : 'boeschung';
    return {
        wandform,
        boden: g.boden ?? 'nichtbindig',
        winkelGrad: zahl(g.winkelGrad),
        arbeitsraum: zahl(g.arbeitsraum),
        sohle: zahl(g.sohle),
    };
}

/** Die Grubenwand nach DIN 4124 — dieselbe Regel wie beim Graben. */
function _grubenWand(parameter) {
    const w = _grubenWerte(parameter);
    return wandFuer({ wandform: w.wandform, boden: w.boden, winkelGrad: w.winkelGrad });
}

/** Der Arbeitsraum: getippt, sonst nach Norm (DIN 4124, geböscht 0,50 / verbaut 0,60). */
function _arbeitsraumFuer(parameter, wand) {
    const eigen = _grubenWerte(parameter).arbeitsraum;
    if (Number.isFinite(eigen) && eigen >= 0) return eigen;
    return baugrubenmass({ aussenmass: 0, wand }).arbeitsraum;
}

/**
 * Einen Ring nach AUSSEN versetzen — das Vorzeichen folgt der Fläche, nicht
 * der Wicklung (dieselbe Probe wie beim Versetzen einer eigenen Fläche).
 */
function _nachAussen(ring, abstand) {
    if (!Array.isArray(ring) || ring.length < 3) return null;
    if (!(abstand > 0)) return ring.map(p => ({ x: p.x, z: p.z }));
    const a0 = ringFlaeche(ring);
    const plus = versetztePunkte(ring, abstand, { geschlossen: true });
    if (ringFlaeche(plus) >= a0) return plus;
    return versetztePunkte(ring, -abstand, { geschlossen: true });
}

/** Wie tief die Grube am tiefsten wird: höchster Geländepunkt über ihr bis zur Sohle. */
function _grubenTiefe(raster, umriss, sohle) {
    let oben = -Infinity;
    for (const p of umriss) {
        const h = rasterAbtasten(raster, p.x, p.z);
        if (Number.isFinite(h) && h > oben) oben = h;
    }
    return Number.isFinite(oben) ? Math.max(0, oben - sohle) : 0;
}

ABLEITUNGEN_ERWEITERT.bauwerksgrube = BAUWERKSGRUBE;

/**
 * DIE ANZEIGEFORM (Stufe 1 des Aushub-Fachmodells, 2026-09-10).
 *
 * Je Ur-Gelände GENAU EINE: die geformte Fläche nach ALLEN Erdbau-Vorgängen,
 * in der Reihenfolge, die der Planer in `vorgaenge` festgelegt hat. Sie ist
 * KEIN Bauteil — der Raum braucht sie, weil fragments nicht schneiden kann;
 * in IFC ist der Aushub ein `IfcEarthworksCut` am Ur-Gelände, und eine zweite
 * TERRAIN-Fläche am selben Ort wäre eine Dopplung (bSI: „no CSG operation is
 * expected to be performed on import"). Deshalb `export: false`.
 *
 * Vorher trug JEDER Vorgang seine eigene Geländekopie und kettete sich an die
 * des vorigen — drei Vorgänge, drei TERRAIN, zwei davon verborgen, 6,5 MB
 * Paket fast nur Gelände. Jetzt: ein Ur-Gelände, ein Stapel, eine Anzeige.
 *
 * `vorgaenge` ist eine ENTSCHEIDUNG (Reihenfolge, Titel), nichts Gerechnetes
 * — deshalb steht sie im Bauplan. Die Faltung selbst rechnet der Stapel im
 * Ableitungslauf; dieses Rezept nimmt nur entgegen, was er liefert.
 */
ABLEITUNGEN_ERWEITERT.anzeige = {
    id: 'anzeige',
    titel: 'Gelände (Anzeige)',
    icon: 'terrain',
    bauform: 'hoehenfeld',
    kategorieVorgabe: 'IFCGEOGRAPHICELEMENT',
    mindestPunkte: 0,
    geschlossen: false,
    felder: [],
    braucht: { gelaende: ['hoehenfeld'] },
    formen:  { gelaende: 'raster' },
    teile: [
        { rolle: 'anzeige', kategorie: 'IFCGEOGRAPHICELEMENT', bauform: 'hoehenfeld', form: 'raster',
          predefinedType: 'TERRAIN', export: false, name: (q) => `${q} (Anzeige)` },
    ],

    /** @param quellen.gelaende  vom Stapel: das Ur-Gelände nach ALLEN Vorgängen */
    async leite(parameter, quellen, { stapel = null } = {}) {
        const stand = quellen?.gelaende;
        if (!stand) throw new Error('anzeige: Quellgelände fehlt');
        const ur = stapel?.urRaster ?? stand;
        // GESAMT IST DIE SUMME DER VORGÄNGE (Teil XXI, P1b), nicht eine zweite
        // Rechnung auf dem groben Raster: jeder Vorgang misst auf seinem feinen
        // Korridor, und genau seine Zahl steht im Mengenreiter und im IFC.
        // Aus dem groben Stand kam eine dritte Zahl (gemessen: 0,4 % daneben),
        // die niemand einlösen konnte. Der Rückfall bleibt für den Fall, dass
        // ein Vorgang keine Massen melden konnte — dann sagt es die Kennzahl.
        const grob = massenAus(ur, stand) ?? { aushub: 0, auftrag: 0 };
        const je = stapel?.massenJeVorgang?.() ?? [];
        const ausVorgaengen = je.length > 0 && je.every(m => m.gemessen);
        const massen = ausVorgaengen
            ? { aushub: je.reduce((s, m) => s + m.aushub, 0), auftrag: je.reduce((s, m) => s + m.auftrag, 0) }
            : grob;
        // FEINE FLICKEN (Teil XX, 2026-09-11): im 2-m-Raster verschmierte eine
        // Böschungskante über eine Zelle (im Browser 1,3 m zu tief an der
        // Linie). Wo Operationen wirken, wird die Anzeige so fein wie der
        // Korridor der Massen — mit denselben zwei Zahlen.
        // Das Ur im Flicken kommt aus DERSELBEN Quelle wie der Korridor der
        // Erdkörper (Teil XXI) — sonst zeigen Körper und Gelände zwei fast
        // gleiche Flächen, und die durchdringen sich sichtbar.
        //
        // DIE LIEFERUNG, WO NICHTS GEÄNDERT IST (Teil XXII, Fabio 2026-09-18:
        // „das Gelände verschiebt sich an Stellen, wo keine Editierung
        // stattfindet"). Die Anzeige war überall ein Raster und schnitt die
        // Knicke der Lieferung ab — bis 48 cm fern jeder Bearbeitung. Jetzt
        // zeigt sie das gelieferte Netz und nur in den veränderten Zellen das
        // geformte Raster (`Anzeigenetz`). Das Raster bleibt der Rückfall:
        // ohne Netz (eigenes Raster-Gelände), bei zu grossem Netz, oder wenn
        // ein Flicken sein Ur nicht aus der Lieferung bekam (dann passte die
        // Naht nicht).
        const ops = stapel?.opsVor ?? [];
        let urNetz = null;
        try { urNetz = (await stapel?.urNetz?.()) ?? null; } catch { urNetz = null; }
        const netzTaugt = urNetz?.triCount > 0 && urNetz.triCount <= ANZEIGE_URNETZ_MAX;
        const flickenOpt = { zelle: ERDBAU_ZELLE, budget: ERDBAU_ZELLBUDGET, feinesUr: stapel?.feinesUr ?? null };
        let { flicken, zelle, warnungen } = await anzeigeFlicken(ur, stand, ops,
            netzTaugt ? { ...flickenOpt, randAufGrob: false, rand: 1 } : flickenOpt);
        let netz = null;
        if (urNetz?.triCount > ANZEIGE_URNETZ_MAX) {
            warnungen.push(`anzeige_raster: das Gelände hat ${urNetz.triCount} Dreiecke — angezeigt als Raster (Grenze ${ANZEIGE_URNETZ_MAX})`);
        } else if (netzTaugt && flicken.some(f => !f.urAusQuelle)) {
            // Die Naht passt nur an ein Ur aus der Lieferung. Ohne: das Bild
            // wie bisher — Flicken mit Rand auf dem groben Raster.
            ({ flicken, zelle, warnungen } = await anzeigeFlicken(ur, stand, ops, flickenOpt));
            warnungen.push('anzeige_raster: das feine Gelände kam nicht aus der Lieferung — angezeigt als Raster');
        } else if (netzTaugt) {
            netz = anzeigeNetz({
                urNetz,
                flaechen: flicken.length ? flicken.map(f => ({ raster: f.raster, ur: f.ur })) : [{ raster: stand, ur }],
            });
        }
        const teil = netz
            ? { form: 'raster', daten: stand, anzeigeNetz: netz }
            : { form: 'raster', daten: stand, flicken };
        return {
            teile: { anzeige: teil },
            kennzahlen: {
                aushubGesamt: massen.aushub, auftragGesamt: massen.auftrag,
                gesamtQuelle: ausVorgaengen ? 'vorgaenge' : 'raster',
                vorgaenge: ops.length ? (parameter?.vorgaenge ?? []).length : 0,
                operationen: ops.length,
                zellweite: stand.cell,
                flicken: flicken.length, flickenZelle: zelle,
                // Was im Raum steht: die Lieferung mit Aussparung oder ein Raster.
                anzeigeArt: netz ? 'netz' : 'raster',
                ...(netz ? { anzeigeNetz: netz.kennzahlen } : {}),
            },
            befunde: [], warnungen, bild: [], ops: [],
        };
    },

    /** Die Anzeige hat keine eigenen Punkte — Quelle und Vorgänge wandern selbst. */
    verschiebe: (parameter) => parameter,
    fachmodell: (globalId) => ({ gelaende: [globalId] }),
    beschreibe: (nachher) => {
        const n = (nachher?.parameter?.vorgaenge ?? []).length;
        return `Gelände-Anzeige · ${n} ${n === 1 ? 'Vorgang' : 'Vorgänge'}`;
    },
};

ABLEITUNGEN_ERWEITERT.aussparung = {
    id: 'aussparung',
    titel: 'Aussparung',
    icon: 'schnitt',
    bauform: 'koerper',
    kategorieVorgabe: 'IFCBUILDINGELEMENTPROXY',
    mindestPunkte: 0,
    geschlossen: false,
    felder: [],
    /**
     * WELCHE BAUFORMEN TRAGEN EIN VOLUMEN? — die Frage, die hier zählt.
     *
     * `['koerper']` allein war zu eng, und das fiel bis zum 2026-09-03 nicht
     * auf, weil das Gate nirgends gelesen wurde. Der Beweis steht im eigenen
     * Test: das Bauwerk ist eine `IFCWALL`, und eine Wand hat die Bauform
     * `flaeche+dicke` (Typprofile.js) — die Aussparung an einer Wand, also der
     * Regelfall schlechthin, wäre abgewiesen worden.
     *
     * BAUFORM ist nicht KERNEL-FORM: ein Rohr hat die Bauform `achse+profil`
     * und liefert trotzdem einen geschlossenen Körper (`rohrKoerper`, G6) —
     * eine Rohrdurchführung ist das kanonische Werkzeug einer Aussparung.
     * Ausgeschlossen bleiben damit genau die Formen OHNE Volumen: `punkt`,
     * `linie`, `flaeche`, `hoehenfeld`. Ein Gelände ist kein Stemmeisen.
     */
    braucht: { bauwerk: KOERPERHAFT, werkzeug: KOERPERHAFT },
    formen:  { bauwerk: 'koerper', werkzeug: 'koerper' },
    teile: [
        // Der IFC-Typ folgt dem BAUWERK, nicht dem Rezept: eine ausgesparte
        // Wand bleibt eine Wand.
        { rolle: 'koerper', bauform: 'koerper', form: 'koerper',
          kategorie: (parameter) => (parameter?.operationen ?? []).find(o => o?.art === 'aussparung')?.parameter?.kategorie
              || 'IFCBUILDINGELEMENTPROXY',
          predefinedType: null, name: (q) => `${q} (mit Aussparung)` },
    ],

    async leite(parameter, quellen, { kernel } = {}) {
        const bauwerk = quellen?.bauwerk;
        const werkzeug = quellen?.werkzeug;
        if (!bauwerk) throw new Error('aussparung: Bauwerkskörper fehlt');
        if (!werkzeug) throw new Error('aussparung: Werkzeugkörper fehlt');
        if (!kernel) throw new Error('aussparung: kein Kernel');
        const warnungen = [];
        const befunde = [];
        if (!bauwerk.closed) throw new Error('aussparung: Bauwerkskörper ist nicht geschlossen — der Server rechnet nur Volumen');
        if (!werkzeug.closed) throw new Error('aussparung: Werkzeugkörper ist nicht geschlossen');
        const r = await kernel.op('booleDifferenz', { a: bauwerk, b: werkzeug });
        if (!r.ergebnis) throw new Error(`aussparung: ${r.warnungen.join('; ') || 'kein Ergebnis'}`);
        warnungen.push(...r.warnungen);
        const abgezogen = Math.max(0, bauwerk.volumen - r.ergebnis.volumen);
        if (abgezogen < 1e-6) {
            befunde.push({ regel: 'aussparung_leer', schwere: 'hinweis',
                           text: 'Die Körper berühren sich nicht — die Aussparung nimmt nichts weg' });
        }
        return {
            teile: { koerper: { form: 'koerper', daten: r.ergebnis } },
            kennzahlen: { vorher: bauwerk.volumen, nachher: r.ergebnis.volumen, abgezogen },
            befunde, warnungen, bild: [],
        };
    },

    /** Vorschau (S2): das Werkzeug wird als ZIEL gefärbt — die Differenz rechnet erst der Server. */
    vorschau(parameter) {
        const q = parameter?.quellen ?? {};
        const faerbungen = q.werkzeug ? [{ globalId: q.werkzeug, rolle: 'ziel' }] : [];
        return { primitive: [], faerbungen,
                 chips: [{ art: 'vorschau', text: 'Aussparung: Bauwerk minus gefärbter Körper — Ergebnis nach Übernehmen' }],
                 hinweise: [] };
    },

    verschiebe: (parameter) => parameter,
    fachmodell: (globalId) => ({ koerper: [globalId] }),
    beschreibe: (nachher) => `Aussparung · ${String(nachher?.kategorie ?? '').replace(/^IFC/, '') || 'Körper'} minus eigener Körper`,
};

export const ABLEITUNGEN = Object.freeze(ABLEITUNGEN_ERWEITERT);

/** Ein Rezept aus dem Register, oder null. */
export function ableitungNach(id) {
    return ABLEITUNGEN[String(id ?? '')] ?? null;
}
