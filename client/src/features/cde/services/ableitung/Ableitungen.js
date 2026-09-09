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
import { formeNach, massenAus, verschiebeOperationen } from '../gelaende/Operationen.js';
import { GRABENREGELN, wandFuer, grabenbreite, baugrubenmass, rechteckUmriss, baugrubenRichtung, pruefeGraben, schaechteAnKanten, WANDFORMEN } from '../gelaende/Grabenregeln.js';
import { weltAusNn } from '../Hoehenbezug.js';
import { rasterAbtasten } from '../geometrie/ops/Raster.js';
import { kreisProfil, trapezProfil, sweep, extrudiere } from '../geometrie/ops/Sweep.js';
import { versetztePunkte, ringFlaeche } from '../geometrie/ops/Linien.js';
import { umrissFlaeche } from '../geometrie/ops/Umriss.js';

/** Welche Op-Parameter Höhen in m NN sind — und deshalb an der Grenze in Welt-Y wandern. */
export const ERDBAU_HOEHENFELDER = Object.freeze({
    gerinne:   ['sohleAnfang', 'sohleEnde'],
    planum:    ['hoehe'],
    boeschung: ['hoehe'],
    baugrube:  ['sohle'],
    // Die Bauwerksgrube trägt ihre Sohle in m NN (leer = Unterkante des Bauteils).
    bauwerksgrube: ['sohle'],
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
 * Das PLANBILD (G5): die Nulllinie der Differenz ist die Böschungsoberkante
 * — je eine Isolinie knapp unter und über null, damit Rauschen keine
 * Konfetti-Linien erzeugt.
 */
async function _planbild(kernel, ur, neu) {
    const differenz = await kernel.op('rasterDifferenz', { a: ur, b: neu });
    const bild = [];
    if (!differenz.ergebnis) return bild;
    for (const w of [-BILD_SCHWELLE, BILD_SCHWELLE]) {
        const iso = await kernel.op('isolinie', { raster: differenz.ergebnis }, { wert: w });
        for (const l of iso.ergebnis ?? []) {
            if (l.punkte.length >= 2) bild.push({ punkte: l.punkte, geschlossen: l.geschlossen });
        }
    }
    return bild;
}

function _opsInWelt(operationen, versatz) {
    return (operationen ?? []).map(op => {
        const felder = ERDBAU_HOEHENFELDER[op.art] ?? [];
        if (!felder.length) return op;
        const p = { ...op.parameter };
        for (const f of felder) {
            if (Number.isFinite(Number(p[f]))) p[f] = weltAusNn(Number(p[f]), versatz);
        }
        return { ...op, parameter: p };
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
    if (!koerper) return;
    if (!koerper.closed) warnungen.push(`${rolle}: Körper nicht geschlossen — Volumen unsicher`);
    const bezug = Math.max(rasterWert, 1e-6);
    const abweichung = Math.abs(koerper.volumen - rasterWert) / bezug;
    if (Math.max(rasterWert, koerper.volumen) < GEGENPROBE_MINDEST_M3) return;
    if (abweichung > GEGENPROBE_TOLERANZ) {
        befunde.push({
            regel: 'aushub_gegenprobe', schwere: 'warnung',
            text: `${rolle}: Körper ${koerper.volumen.toFixed(1)} m³ gegen Raster ${rasterWert.toFixed(1)} m³ — ${(abweichung * 100).toFixed(1)} % Abweichung`,
        });
    }
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
            },
            {
                rolle: 'auftrag', kategorie: 'IFCEARTHWORKSFILL', bauform: 'koerper', form: 'koerper',
                predefinedType: 'EMBANKMENT',
                name: (q) => `${q} · Auftrag`,
            },
            {
                rolle: 'dgm', kategorie: 'IFCGEOGRAPHICELEMENT', bauform: 'hoehenfeld', form: 'raster',
                predefinedType: 'TERRAIN',
                name: (q) => `${q} (geformt)`,
            },
        ],
        hoehenFelder: ERDBAU_HOEHENFELDER,

        /**
         * @param {object} parameter  {quellen, quellBasis, raster:{cell}, operationen}
         * @param {object} quellen    {gelaende: raster} — vom Lauf aufgelöst
         * @param {object} kontext    {kernel, hoehenversatz}
         */
        async leite(parameter, quellen, { kernel, hoehenversatz = 0 } = {}) {
            const ur = quellen?.gelaende;
            if (!ur) throw new Error('erdbau: Quellgelände fehlt');
            if (!kernel) throw new Error('erdbau: kein Kernel');
            const warnungen = [];
            const befunde = [];
            const ops = _opsInWelt(parameter?.operationen ?? [], hoehenversatz);
            if (!ops.length) throw new Error('erdbau: keine Operationen');
            const { raster: neu, warnungen: w1 } = formeNach(ur, ops);
            warnungen.push(...w1);

            const aushub = await kernel.op('koerperZwischenRastern', { oben: ur, unten: neu });
            const auftrag = await kernel.op('koerperZwischenRastern', { oben: neu, unten: ur });
            const massen = massenAus(ur, neu) ?? { aushub: 0, auftrag: 0 };
            _gegenprobe('Aushub', aushub.ergebnis, massen.aushub, befunde, warnungen);
            _gegenprobe('Auftrag', auftrag.ergebnis, massen.auftrag, befunde, warnungen);

            const bild = await _planbild(kernel, ur, neu);

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
                    operationen: ops.length,
                },
                befunde,
                warnungen,
                bild,
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
export const KANALGRABEN_ZELLE = 0.5;
export const KANALGRABEN_KORRIDOR_RAND = 12;

ABLEITUNGEN_ERWEITERT.kanalgraben = {
    id: 'kanalgraben',
    titel: 'Kanalgraben',
    icon: 'gerinne',
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
          predefinedType: 'TRENCH', name: (q) => `${q} · Graben` },
        { rolle: 'verfuellung', kategorie: 'IFCEARTHWORKSFILL', bauform: 'koerper', form: 'koerper',
          predefinedType: 'BACKFILL', name: (q) => `${q} · Verfüllung` },
        { rolle: 'dgm', kategorie: 'IFCGEOGRAPHICELEMENT', bauform: 'hoehenfeld', form: 'raster',
          predefinedType: 'TERRAIN', name: (q) => `${q} (mit Graben)` },
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
        const grob = Number(parameter?.raster?.cell) || 1;
        return { gelaendeFein: { gid, form: 'raster', opts: {
            cell: Math.min(grob, KANALGRABEN_ZELLE),
            bereich: { minX: Math.min(...xs) - rand, maxX: Math.max(...xs) + rand, minZ: Math.min(...zs) - rand, maxZ: Math.max(...zs) + rand },
        } } };
    },

    async leite(parameter, quellen, { kernel } = {}) {
        const ur = quellen?.gelaende;
        const fein = quellen?.gelaendeFein ?? null;
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
        let ueberdeckungMin = Infinity;
        for (const [ri, rohr] of rohre.entries()) {
            const pts = (rohr?.punkte ?? []).map(p => ({ x: Number(p.x), y: Number(p.y), z: Number(p.z) }));
            if (pts.length < 2) throw new Error(`kanalgraben: Rohrachse ${ri + 1} fehlt`);
            if (pts.some(p => !Number.isFinite(p.y))) throw new Error(`kanalgraben: Rohrachse ${ri + 1} ohne Höhe`);
            const dn = w.dnFest || Number(rohr?.dn) || w.dn;
            const r = dn / 2000;
            let deckungMin = Infinity;
            for (let i = 0; i + 1 < pts.length; i++) {
                const a = pts[i], b = pts[i + 1];
                laenge += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
                const sohleA = a.y - r - w.bettung, sohleB = b.y - r - w.bettung;
                // Grabentiefe je Segment: Gelände an beiden Enden gegen die Sohle.
                let tiefe = 0;
                for (const [p, so] of [[a, sohleA], [b, sohleB]]) {
                    const h = hoeheAn(p.x, p.z);
                    if (Number.isFinite(h)) tiefe = Math.max(tiefe, h - so);
                }
                tiefeMax = Math.max(tiefeMax, tiefe);
                const gb = grabenbreite({ dn, wanddickeMm: w.wanddickeMm, tiefe, wand, eigene: w.breite });
                breiten.push(gb.sohlbreite);
                gruende.add(gb.grund);
                for (const h of gb.hinweise) warnungen.push(`grabenbreite: ${h}`);
                ops.push({ art: 'gerinne', parameter: {
                    achse: [{ x: a.x, z: a.z }, { x: b.x, z: b.z }],
                    sohlbreite: gb.sohlbreite, boeschung: wand.n,
                    sohleAnfang: sohleA, sohleEnde: sohleB,
                } });
            }
            // ÜBERDECKUNG je Rohr: Scheitel gegen das Ur-Gelände.
            const probe = (x, y, z) => { const h = hoeheAn(x, z); if (Number.isFinite(h)) deckungMin = Math.min(deckungMin, h - (y + r)); };
            for (let i = 0; i < pts.length; i++) {
                probe(pts[i].x, pts[i].y, pts[i].z);
                if (i + 1 < pts.length) probe((pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2, (pts[i].z + pts[i + 1].z) / 2);
            }
            if (Number.isFinite(deckungMin)) ueberdeckungMin = Math.min(ueberdeckungMin, deckungMin);
            if (Number.isFinite(deckungMin) && deckungMin < MINDEST_UEBERDECKUNG) {
                befunde.push({ regel: 'ueberdeckung_gering', schwere: 'warnung',
                    globalId: rohrGids[ri] ?? null,
                    text: `Überdeckung ${deckungMin.toFixed(2)} m unter ${MINDEST_UEBERDECKUNG.toFixed(1)} m (Rohrscheitel gegen das Fertiggelände${rohre.length > 1 ? `, Rohr ${ri + 1} von ${rohre.length}` : ''})`,
                    wert: `${deckungMin.toFixed(2)} m`, grenze: `mindestens ${MINDEST_UEBERDECKUNG.toFixed(2)} m`, quelle: 'Kanalgraben-Ableitung (Ur-Gelände)' });
            }
            // DER ROHRKÖRPER — geschlossener Sweep; fällt er aus, gilt die Formel.
            let seg = 0;
            for (let i = 0; i + 1 < pts.length; i++) seg += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y, pts[i + 1].z - pts[i].z);
            const sw = await kernel.op('sweep', { profil: kreisProfil(r, 12), achse: { punkte: pts } });
            if (sw.ergebnis?.closed) { rohrVolumen += sw.ergebnis.volumen; rohrKoerper.push(sw.ergebnis); }
            else { rohrVolumen += Math.PI * r * r * seg; warnungen.push(`rohrvolumen_analytisch: Rohr ${ri + 1} nicht geschlossen — π·r²·L`); }
        }

        // DIE SCHACHTBAUGRUBEN — ECKIG (nie rund), Kantenlänge = Aussenmass +
        // 2 · Arbeitsraum, ausgerichtet entlang der anschliessenden Haltung,
        // Sohle = Schachtsohle − Bettung, Wand wie der Graben.
        const bm = baugrubenmass({ aussenmass: w.schachtMass, wand });
        for (const s of schaechte) {
            if (!Number.isFinite(s?.x) || !Number.isFinite(s?.z) || !Number.isFinite(s?.y)) continue;
            const sohle = s.y - w.bettung;
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
        const graben = await kernel.op('koerperZwischenRastern', { oben: rechen, unten: neuFein });
        const massen = massenAus(rechen, neuFein) ?? { aushub: 0, auftrag: 0 };
        _gegenprobe('Graben', graben.ergebnis, massen.aushub, befunde, warnungen);
        const verfuellung = Math.max(0, massen.aushub - rohrVolumen);

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

        const bild = await _planbild(kernel, rechen, neuFein);
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
                rohrVolumen, verfuellung, verfuellungKoerper: verfuellungKoerper?.volumen ?? null,
                laenge, dn: w.dnFest || (rohre.length === 1 ? (Number(rohre[0]?.dn) || w.dn) : null),
                sohlbreite: breiten.length ? Math.max(...breiten) : null,
                sohlbreiteMin: breiten.length ? Math.min(...breiten) : null,
                ueberdeckungMin: Number.isFinite(ueberdeckungMin) ? ueberdeckungMin : null,
                tiefeMax, rohre: rohre.length, schaechte: schaechte.length,
                wandform: wand.wandform, winkelGrad: wand.winkelGrad, neigung: wand.n,
                regel: GRABENREGELN.quelle, gruende: [...gruende],
                operationen: ops.length,
            },
            befunde, warnungen, bild,
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
        const laeufe = [{ punkte: eigen, dn: w.dnFest || achse?.dn || w.dn }];
        if (w.umfang === 'strang') {
            for (const k of (subjekt?.strang ?? [])) {
                if (k?.globalId === subjekt?.globalId || !k?.anfang || !k?.ende) continue;
                laeufe.push({ punkte: [k.anfang, k.ende].map(p => ({ x: Number(p.x), y: Number(p.y), z: Number(p.z) })), dn: w.dnFest || k.dn || w.dn });
            }
        }
        const primitive = [];
        let deckung = Infinity, breiteMax = 0, tiefeMax = 0;
        for (const l of laeufe) {
            const r = l.dn / 2000;
            const sohle = l.punkte.map(p => ({ x: p.x, y: p.y - r - w.bettung, z: p.z }));
            const tiefe = _tiefeUeber(hoeheAn, sohle, 2 * r + w.bettung + 1);
            tiefeMax = Math.max(tiefeMax, tiefe);
            const gb = grabenbreite({ dn: l.dn, wanddickeMm: w.wanddickeMm, tiefe, wand, eigene: w.breite });
            breiteMax = Math.max(breiteMax, gb.sohlbreite);
            primitive.push(..._grabenGeist(sohle, { sohlbreite: gb.sohlbreite, boeschung: wand.n, tiefe }, farbe));
            for (const p of l.punkte) { const h = hoeheAn?.(p.x, p.z); if (Number.isFinite(h)) deckung = Math.min(deckung, h - (p.y + r)); }
        }
        // Die Schächte am Strang: ein Zylinder je Baugrube.
        const kanten = w.umfang === 'strang' ? [{ anfang: eigen[0], ende: eigen[eigen.length - 1] }, ...(subjekt?.strang ?? [])] : [{ anfang: eigen[0], ende: eigen[eigen.length - 1] }];
        const schaechte = schaechteAnKanten(kanten, subjekt?.schachtKnoten ?? []);
        const bm = baugrubenmass({ aussenmass: w.schachtMass, wand });
        for (const s of schaechte) {
            const p = s.punkt ?? s;
            const sohle = p.y - w.bettung;
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
        return `Kanalgraben · ${rolle} · ${dn} · ${umfang} · ${wand} · ${breite}`;
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
    bauform: 'koerper',
    kategorieVorgabe: 'IFCEARTHWORKSCUT',
    mindestPunkte: 0,
    geschlossen: false,
    felder: [],
    braucht: { bauteil: ['koerper', 'flaeche+dicke', 'netz', 'punkt', 'flaeche'], gelaende: ['hoehenfeld'] },
    formen:  { bauteil: 'umriss', gelaende: 'raster' },
    teile: [
        { rolle: 'grube', kategorie: 'IFCEARTHWORKSCUT', bauform: 'koerper', form: 'koerper',
          predefinedType: 'EXCAVATION', name: (q) => `${q} · Baugrube` },
        { rolle: 'dgm', kategorie: 'IFCGEOGRAPHICELEMENT', bauform: 'hoehenfeld', form: 'raster',
          predefinedType: 'TERRAIN', name: (q) => `${q} (mit Baugrube)` },
    ],
    hoehenFelder: ERDBAU_HOEHENFELDER,

    async leite(parameter, quellen, { kernel, hoehenversatz = 0 } = {}) {
        const ur = quellen?.gelaende;
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
        _gegenprobe('Baugrube', grube.ergebnis, massen.aushub, befunde, warnungen);

        // Die Tiefe: vom höchsten Geländepunkt über der Grube bis zur Sohle.
        const tiefe = _grubenTiefe(ur, aussen, sohle);
        for (const b of pruefeGraben({ wand: w, tiefeMax: tiefe })) befunde.push(b);
        if (arbeitsraum <= 0) {
            warnungen.push('arbeitsraum_null: ohne Arbeitsraum liegt die Grubenwand am Bauwerk');
        }

        const bild = await _planbild(kernel, ur, neu);

        return {
            teile: {
                grube: grube.ergebnis ? { form: 'koerper', daten: grube.ergebnis } : null,
                dgm: { form: 'raster', daten: neu },
            },
            kennzahlen: {
                aushubRaster: massen.aushub,
                aushubKoerper: grube.ergebnis?.volumen ?? 0,
                grundflaeche: umrissFlaeche(grundriss.ring),
                grubenflaeche: umrissFlaeche(aussen),
                arbeitsraum,
                tiefeMax: tiefe,
                wandform: w.wandform,
                boeschung: w.n,
            },
            befunde,
            warnungen,
            bild,
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
