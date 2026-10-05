/**
 * MUSTER · Rohrwand — aus Nennweite und Werkstoff: Durchmesser, Wand,
 * Verbindung (Muffe) und Baulänge.
 *
 * ISYBAU kennt keine Wanddicke (kein Stammdatenfeld, AH15 Tab. A-7-15/16/18).
 * Was die Nennweite meint und wie dick die Wand ist, sagt die Produktnorm des
 * Werkstoffs (DWA-A 139, 3.9: DN/ID oder DN/OD):
 *
 *   Kunststoff (PVC-U, PP, PE)   DN/OD = AUSSENdurchmesser, Wand aus SDR
 *   Beton, Steinzeug, GFK, …      DN ≈ INNENdurchmesser, Wand vom Hersteller
 *   Guss                          DN nominell, Aussendurchmesser DE aus der Reihe
 *
 * Wo die Norm nur Stützwerte gibt, steht hier eine FORMEL, die sie trifft —
 * die Tabellen selbst gehören nicht in diesen öffentlichen Repo. Wo keine
 * Norm im Bestand ist, steht eine ANNAHME mit dem Satz, warum. Jedes Mass
 * trägt seine Herleitung: `isybau`, `norm` (mit Beleg), `annahme`.
 *
 * Rein: Zahlen hinein, Zahlen heraus. Meter.
 */
import { B, PVC_SDR, PVC_EMIN_UNTEN, PP_SDR, PE_SDR, ALTE_DN_NACH_OD, OD_REIHE_MM, STEINZEUG_DI_MIN_ANTEIL } from './Normwerte.js';
import { herleitung } from './Herleitung.js';
// Die Herleitung wohnt in `Herleitung.js`; hier weitergereicht für bestehende Aufrufer.
export { herleitung };

const _r4 = (v) => Math.round(v * 10000) / 10000;
/** Auf 0,1 mm aufrunden (Meter hinein, Meter heraus) — die Rundung der Rohrreihen. */
const _aufZehntelMm = (m) => Math.ceil(m * 10000 - 1e-6) / 10000;
const H = herleitung;

/**
 * DIE WERKSTOFFE. Je Gruppe: Bezug der Nennweite, Wand, Verbindung, Baulänge.
 * `wand(dn, e)` → {t, h}; `verbindung(dn, d)` → {art, innen, aussen, tiefe, h} | null
 * (d: die Durchmesser des Schafts); `baulaenge(dn)` → {l, h} | null.
 */
const KUNSTSTOFF = {
    PVC: {
        name: 'PVC-U', bezug: 'aussen', beleg: B.pvc,
        sdr: (sn) => [PVC_SDR[sn] ?? PVC_SDR.SN8, PVC_SDR[sn] ? sn : 'SN8'], emin: PVC_EMIN_UNTEN,
        // Einstecktiefe L1: Faustformel, trifft DIN EN 1401-1 Tab. 7 auf ±20 mm (DN/OD 315: 132 mm).
        tiefe: (dn) => [0.2 * dn + 0.055, H('annahme', 'Einstecktiefe ≈ 0,2·dn + 55 mm (gestützt auf DIN EN 1401-1, Tab. 7; DN/OD 315: 132 mm)', B.pvcMuffe)],
        baulaenge: () => ({ l: 5, h: H('annahme', 'Baulänge 5 m — die Norm überlässt sie dem Hersteller (DIN EN 1401-1, 7.2.3)', B.pvc) }),
    },
    PP: {
        name: 'PP', bezug: 'aussen', beleg: B.pp,
        sdr: (sn) => [PP_SDR[sn] ?? PP_SDR.SN8, PP_SDR[sn] ? sn : 'SN8'], emin: 0,
        tiefe: (dn) => [0.4 * dn + 0.018, H('norm', 'Einstecktiefe L1 = 0,4·dn + 18 mm (trifft Tab. 6)', B.ppMuffe)],
        baulaenge: () => ({ l: 6, h: H('norm', 'Baulänge 6 m — dafür sind die Muffen ausgelegt', B.ppMuffe) }),
    },
    PE: {
        name: 'PE-HD', bezug: 'aussen', beleg: B.pe,
        sdr: (sn) => [PE_SDR[sn] ?? PE_SDR.SN8, PE_SDR[sn] ? sn : 'SN8'], emin: 0,
        tiefe: (dn) => [0.4 * dn + 0.018, H('norm', 'Einstecktiefe L1 = 0,4·dn + 18 mm', B.peMuffe)],
        baulaenge: () => ({ l: 6, h: H('norm', 'Baulänge 6 m — dafür sind die Muffen ausgelegt', B.peMuffe) }),
    },
};
KUNSTSTOFF.PVCU = KUNSTSTOFF.PVC;
KUNSTSTOFF.PEHD = KUNSTSTOFF.PE;

const BETON = new Set(['B', 'SB', 'SFB', 'SPB', 'PCC']);
const OHNE_ROHR = new Set(['OB', 'BS', 'MA', 'ZG', 'SZB', 'BOD', 'RAS', 'PFL', 'MIX', 'W']);

/** Die Aussenreihe trifft ein Durchmesser, wenn er höchstens 1 mm daneben liegt. */
const _inOdReihe = (dnM) => OD_REIHE_MM.some(k => Math.abs(k - dnM * 1000) <= 1);
const _alteDn = (dnM) => {
    const k = Object.keys(ALTE_DN_NACH_OD).find(z => Math.abs(Number(z) - dnM) < 0.0015);
    return k ? ALTE_DN_NACH_OD[k] : null;
};

/** Kunststoff mit DN/OD: Aussendurchmesser, Wand e = dn/SDR, Steckmuffe. */
function _kunststoff(w, dn, { sn, sdr, wanddicke }, hinweise, { annahmeWerkstoff = null } = {}) {
    // DIE ALTE DN-REIHE (DIN 19534): „DN 150" in Bestandsdaten ist DN/OD 160.
    let da = dn;
    let hD = H('norm', `${w.name}: DN/OD ist der Aussendurchmesser`, w.beleg);
    const alt = !_inOdReihe(dn) ? _alteDn(dn) : null;
    if (alt) {
        da = alt;
        hD = H('norm', `DN ${Math.round(dn * 1000)} ist die alte KG-Reihe → DN/OD ${Math.round(alt * 1000)}`, B.alteDn);
        hinweise.push(`DN ${Math.round(dn * 1000)} als DN/OD ${Math.round(alt * 1000)} gelesen (alte DN-Reihe, DIN 19534)`);
    } else if (!_inOdReihe(dn)) {
        hinweise.push(`DN ${Math.round(dn * 1000)} liegt nicht in der Aussenreihe der Kunststoffrohre — als Aussendurchmesser genommen`);
    }
    if (annahmeWerkstoff) hD = H('annahme', `${annahmeWerkstoff}: wie ${w.name} gebaut, DN/OD`, w.beleg);

    let t, hT;
    if (Number.isFinite(wanddicke) && wanddicke > 0) {
        t = wanddicke; hT = H('isybau', 'Wanddicke angegeben');
    } else {
        const [s, klasse] = sdr ? [sdr, null] : w.sdr(sn);
        t = Math.max(w.emin, _aufZehntelMm(da / s));
        hT = H(annahmeWerkstoff ? 'annahme' : 'norm',
               `e = dn / SDR ${s}${klasse ? ` (${klasse}${sn ? '' : ', angenommen'})` : ''}, aufgerundet auf 0,1 mm`, w.beleg);
        if (!sn && !sdr) hinweise.push('Steifigkeitsklasse fehlt in ISYBAU — SN 8 angenommen');
    }
    // DIE STECKMUFFE: innen der Rohr-Aussendurchmesser, Wand e2 ≈ 0,9·e (DIN EN 1401-1, Tab. 8 — für PP und PE übernommen).
    const [tiefe, hTiefe] = w.tiefe(da);
    const e2 = Math.max(0.9 * t, 0.002);
    const verbindung = {
        art: 'steckmuffe', innen: _r4(da), aussen: _r4(da + 2 * e2), tiefe: _r4(tiefe),
        herleitung: { tiefe: hTiefe, wand: H(w === KUNSTSTOFF.PVC ? 'norm' : 'annahme', 'Muffenwand e2 ≈ 0,9·e', B.pvcMuffe) },
    };
    const bl = w.baulaenge();
    return { dInnen: da - 2 * t, dAussen: da, t, bezug: 'aussen', hD, hT, verbindung, baulaenge: bl };
}

/** Beton und Stahlbeton (DIN EN 1916, DIN V 1201): DN innen, Glockenmuffe. */
function _beton(dn, mat) {
    const dnMm = dn * 1000;
    // Wand aus dem empfohlenen Spitzenden-Aussendurchmesser dsp (Tab. 7, unbewehrt):
    // dsp = 1,18·DN + 18 mm trifft DN 600–1500 genau, 1,1·DN + 56 mm DN 300–500.
    // Daraus t = max(0,09·DN + 9 mm, 0,05·DN + 28 mm).
    const t = Math.max(0.09 * dn + 0.009, 0.05 * dn + 0.028);
    const imBereich = dnMm >= 300 && dnMm <= 1500;
    const hT = H(imBereich ? 'norm' : 'annahme',
                 `t = max(0,09·DN + 9 mm, 0,05·DN + 28 mm) aus dsp${imBereich ? '' : ' — fortgeschrieben ausserhalb DN 300–1500'}; Stützwert DN 1000: dsp 1198 mm`,
                 B.betonSpitzende);
    const dAussen = dn + 2 * t;
    // Glockenmuffe (Tab. 3 und 7, als Formeln, die die Stützwerte auf wenige mm treffen):
    // Spaltweite w ≈ 0,0055·DN + 6 mm, Muffenwand t4 ≈ 0,08·DN + 25 mm, Muffenlänge ≈ 0,025·DN + 72 mm.
    const spalt = 0.0055 * dn + 0.006;
    const t4 = 0.08 * dn + 0.025;
    const innen = dAussen + 2 * spalt;
    const verbindung = {
        art: 'glockenmuffe', innen: _r4(innen), aussen: _r4(innen + 2 * t4), tiefe: _r4(0.025 * dn + 0.072),
        herleitung: {
            spalt: H('norm', 'Muffenspalt w ≈ 0,0055·DN + 6 mm (DN 300: 7,8 mm)', B.betonMuffe),
            wand: H('norm', 'Muffenwand t4 ≈ 0,08·DN + 25 mm (DN 300: 50 mm)', B.betonMuffe),
            tiefe: H('norm', 'Muffenlänge ≈ 0,025·DN + 72 mm (DN 300: 80 mm)', B.betonMuffe),
        },
    };
    const l = dnMm <= 500 ? 2.5 : 3.0;
    return {
        dInnen: dn, dAussen, t, bezug: 'innen',
        hD: H('norm', 'DN ist der Innendurchmesser', B.betonDn), hT, verbindung,
        baulaenge: { l, h: H('annahme', `Baulänge ${l} m — durch 100 mm teilbar, die Norm nennt 2500 und 3000 mm als Beispiele`, B.betonBaulaenge) },
        ...(mat === 'SB' ? { hinweisWerkstoff: 'Stahlbeton: Wand wie Beton mit unbewehrtem Spitzende — bewehrt ist es bis DN 500 dicker' } : {}),
    };
}

/** Steinzeug (DIN EN 295-1): DN innen, Wand und Muffe vom Hersteller. */
function _steinzeug(dn) {
    const dnMm = dn * 1000;
    // Faustwert aus den Spitzenden-Aussendurchmessern d3 (Tab. 14: DN 150 → 186 mm, DN 200 → 237 mm).
    const t = 0.1 * dn + 0.003;
    const dAussen = dn + 2 * t;
    // Muffe innen d4 ≈ 1,25·DN (Tab. 13: DN 300/160 → 371,5 mm), nie enger als der Schaft.
    const innen = Math.max(1.25 * dn, dAussen + 0.01);
    return {
        dInnen: dn, dAussen, t, bezug: 'innen',
        hD: H('norm', `DN ist der Innendurchmesser, mindestens ${Math.round(dnMm * STEINZEUG_DI_MIN_ANTEIL)} mm`, B.steinzeugDi),
        hT: H('annahme', 'Steinzeug: Wanddicke vom Hersteller — Faustwert 0,1·DN + 3 mm (gestützt auf d3, Tab. 14)', B.steinzeugWand),
        verbindung: {
            art: 'steckmuffe', innen: _r4(innen), aussen: _r4(innen + 2 * t), tiefe: _r4(0.25 * dn + 0.045),
            herleitung: {
                innen: H('annahme', 'Muffe innen ≈ 1,25·DN (gestützt auf d4, Tab. 13)', B.steinzeugVerbindung),
                tiefe: H('annahme', 'Muffentiefe ≈ 0,25·DN + 45 mm — nicht in DIN EN 295-1'),
            },
        },
        baulaenge: dnMm >= 200
            ? { l: 2.5, h: H('norm', 'Baulänge 2,5 m — bevorzugte Baulänge', B.steinzeugBaulaenge) }
            : { l: 2.0, h: H('annahme', 'Baulänge 2,0 m — für DN < 200 nennt Tab. 2 keine') },
    };
}

/** Duktiler Guss (DIN EN 598 nicht im Bestand): DE aus der Reihe der EN 545, Wand nach K9. */
function _guss(dn) {
    // DE ≈ 1,03·DN + 15 mm trifft die DE-Reihe auf 3 mm (DN 300: 326 mm).
    const dAussen = 1.03 * dn + 0.015;
    const t = 0.0045 + 0.009 * dn;
    return {
        dInnen: dAussen - 2 * t, dAussen, t, bezug: 'aussen',
        hD: H('annahme', 'Aussendurchmesser DE ≈ 1,03·DN + 15 mm — Reihe der DIN EN 545, für DIN EN 598 angenommen', B.gussAussen),
        hT: H('norm', 'e = 4,5 mm + 0,009·DN (Klasse K9, trifft die Tabelle genau)', B.gussWand),
        verbindung: {
            art: 'steckmuffe', innen: _r4(dAussen), aussen: _r4(dAussen + 0.06 + 0.07 * dn), tiefe: _r4(0.08 + 0.08 * dn),
            herleitung: { aussen: H('annahme', 'TYTON-Muffe: aussen ≈ DE + 60 mm + 0,07·DN, Tiefe ≈ 80 mm + 0,08·DN (Herstellerkatalog)') },
        },
        baulaenge: { l: 6, h: H('annahme', 'Baulänge 6 m (Regel der Hersteller)') },
    };
}

/** Werkstoffe ohne Norm im Bestand: DN innen, Faustwand, Überschiebkupplung. */
const OHNE_NORM = {
    GFK: { t: (dn) => 0.015 * dn + 0.004, text: 'GFK: 0,015·DN + 4 mm (DIN EN 14364 nicht im Bestand)', l: 6, kupplung: true },
    PH: { t: (dn) => 0.015 * dn + 0.004, text: 'Polyesterharz wie GFK', l: 6, kupplung: true },
    PC: { t: (dn) => 0.08 * dn + 0.02, text: 'Polymerbeton: 0,08·DN + 20 mm (DIN EN 14636 nicht im Bestand)', l: 2.5, kupplung: true },
    PHB: { t: (dn) => 0.08 * dn + 0.02, text: 'Polyesterharzbeton wie Polymerbeton', l: 2.5, kupplung: true },
    FZ: { t: (dn) => dn / 12 + 0.005, text: 'Faserzement: DN/12 + 5 mm (DIN 19850-1 nicht im Bestand)', l: 5, kupplung: true },
    AZ: { t: (dn) => dn / 12 + 0.005, text: 'Asbestzement wie Faserzement', l: 5, kupplung: true },
    ST: { t: (dn) => 0.004 + 0.01 * dn, text: 'Stahl: 4 mm + 0,01·DN', l: 6, kupplung: false },
    CNS: { t: (dn) => 0.003 + 0.005 * dn, text: 'Edelstahl: 3 mm + 0,005·DN', l: 6, kupplung: false },
    EIS: { t: (dn) => 0.004 + 0.01 * dn, text: 'Eisen/Stahl: 4 mm + 0,01·DN', l: 6, kupplung: false },
    GG: { guss: true },
    GGG: { guss: true },
};

function _ohneNorm(dn, mat, regel) {
    const t = regel ? regel.t(dn) : Math.max(0.005, dn / 12);
    const dAussen = dn + 2 * t;
    const kupplung = regel?.kupplung
        ? { art: 'kupplung', innen: _r4(dAussen), aussen: _r4(dAussen + 2 * Math.max(t, 0.008)), tiefe: _r4(Math.max(0.15, 0.2 * dn)),
            herleitung: { art: H('annahme', 'Überschiebkupplung, Länge ≈ 0,2·DN, mindestens 150 mm') } }
        : null;
    return {
        dInnen: dn, dAussen, t, bezug: 'innen',
        hD: H('annahme', 'DN als Innendurchmesser genommen', B.dnBezug),
        hT: H('annahme', regel ? regel.text : `Werkstoff „${mat || 'unbekannt'}": keine Norm im Bestand — Faustwert DN/12`),
        verbindung: kupplung,
        baulaenge: regel?.l && !OHNE_ROHR.has(mat) ? { l: regel.l, h: H('annahme', `Baulänge ${regel.l} m (Regel der Hersteller)`) } : null,
    };
}

/**
 * @param {object} e
 * @param {number} e.dn            Nennweite in m (ISYBAU: Profilhöhe bzw. -breite)
 * @param {string} [e.material]    G102
 * @param {string} [e.sn]          Steifigkeitsklasse, etwa 'SN8' (Kunststoff)
 * @param {number} [e.sdr]         SDR (Kunststoff)
 * @param {number} [e.wanddicke]   bekannt (Herstellerangabe) — dann gilt sie
 * @param {number} [e.baulaenge]   bekannt (ISYBAU `Regeleinzelrohrlaenge`) — dann gilt sie
 * @returns {{dInnen, dAussen, wanddicke, dnBezug: 'innen'|'aussen', dnFeld: number,
 *            verbindung: {art, innen, aussen, tiefe, herleitung}|null, baulaenge: number|null,
 *            herleitung: object, hinweise: string[]}}
 *          `dnFeld`: der Durchmesser, den das Feld DN des Rohres bekommt (der Bezug: innen bzw. aussen).
 */
export function rohrwand({ dn, material = null, sn = null, sdr = null, wanddicke = null, baulaenge = null } = {}) {
    const hinweise = [];
    const mat = String(material ?? '').toUpperCase();
    let r;
    if (KUNSTSTOFF[mat]) r = _kunststoff(KUNSTSTOFF[mat], dn, { sn, sdr, wanddicke }, hinweise);
    else if (mat === 'KST') r = _kunststoff(KUNSTSTOFF.PVC, dn, { sn, sdr, wanddicke }, hinweise, { annahmeWerkstoff: 'Kunststoff ohne Angabe' });
    else if (BETON.has(mat)) r = _beton(dn, mat);
    else if (mat === 'STZ') r = _steinzeug(dn);
    else if (OHNE_NORM[mat]?.guss) r = _guss(dn);
    else r = _ohneNorm(dn, mat, OHNE_NORM[mat] ?? null);
    if (r.hinweisWerkstoff) hinweise.push(r.hinweisWerkstoff);

    // Eine bekannte Wanddicke gilt (Kunststoff hat sie oben schon genommen).
    if (Number.isFinite(wanddicke) && wanddicke > 0 && r.hT.art !== 'isybau') {
        if (r.bezug === 'aussen') r.dInnen = r.dAussen - 2 * wanddicke;
        else r.dAussen = r.dInnen + 2 * wanddicke;
        r.t = wanddicke;
        r.hT = H('isybau', 'Wanddicke angegeben');
    }
    // Die Baulänge aus der Datei (ISYBAU `Regeleinzelrohrlaenge`) geht der Annahme vor.
    let bl = r.baulaenge;
    if (Number.isFinite(baulaenge) && baulaenge > 0) bl = { l: baulaenge, h: H('isybau', 'Regeleinzelrohrlänge') };
    return {
        dInnen: _r4(r.dInnen), dAussen: _r4(r.dAussen), wanddicke: _r4(r.t),
        dnBezug: r.bezug,
        dnFeld: _r4(r.bezug === 'aussen' ? r.dAussen : r.dInnen),
        verbindung: r.verbindung ?? null,
        baulaenge: bl?.l ?? null,
        herleitung: {
            wanddicke: r.hT, durchmesser: r.hD,
            ...(bl ? { baulaenge: bl.h } : {}),
            ...(r.verbindung ? { verbindung: H(r.verbindung.herleitung && Object.values(r.verbindung.herleitung).every(x => x.art === 'norm') ? 'norm' : 'annahme',
                                               `${r.verbindung.art}: innen ${Math.round(r.verbindung.innen * 1000)} mm, aussen ${Math.round(r.verbindung.aussen * 1000)} mm, Tiefe ${Math.round(r.verbindung.tiefe * 1000)} mm`) } : {}),
        },
        hinweise,
    };
}
