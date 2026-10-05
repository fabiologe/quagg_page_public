/**
 * MUSTER · Normschacht — aus den ISYBAU-Daten eines Schachts seine Bauteilkette.
 *
 * ISYBAU sagt: Deckel auf 105,00, Sohle auf 102,00, Konus ja, DN 1000. Es sagt
 * NICHT, wie viele Ringe darin stecken, wie hoch der Konus ist oder wo die
 * Steigeisen sitzen. Das Muster schliesst die Lücke mit den Normen
 * (DIN 4034-1, DWA-A 157, DIN EN 124) — und sagt bei jedem Mass, woher es kam:
 *
 *   isybau         aus der Datei
 *   norm           Normwert, mit Beleg
 *   norm-pruefen   Normwert, dessen Lesung am Original zu prüfen ist
 *   annahme        keine Norm im Bestand — ein Faustwert mit Grund
 *
 * DIE HÖHENKETTE GEHT AUF. Gemessen sind Deckel und Sohle (Vermessung). Von
 * oben: Abdeckung, Auflageringe, Hals; von unten: Unterteil. Dazwischen
 * Ringe aus Regel- und Ausgleichshöhen, und was übrig bleibt, nehmen die
 * Auflageringe (60/80/100 mm, zusammen ≤ 240 mm). Geht es nicht auf, steht
 * der Rest als Befund da — nie still verschluckt.
 *
 * Dieses Modul baut KEINE Geometrie. Es liefert die Teile als Daten
 * (Höhen in m NN, Durchmesser in m); die Körper baut der Rezeptweg.
 *
 * Rein: Zahlen hinein, Zahlen heraus.
 */
import {
    ABDECKPLATTE, ABDECKUNGSKLASSEN, AUFLAGERINGE, AUFTRITT, B, HALS, RING_HOEHEN, RING_WANDDICKE,
    SCHACHT_NENNWEITEN, STEIG, UEBERGANGSPLATTE, UNTERTEIL_BODEN, WAND_UEBER_SCHEITEL,
} from './Normwerte.js';
import { herleitung as H } from './Rohrwand.js';

const _fin = (v) => typeof v === 'number' && Number.isFinite(v);
const _r3 = (v) => Math.round(v * 1000) / 1000;
/** Toleranz der Höhenkette: Mörtelfugen und Grenzabmasse (±10 mm je Bauteil, DIN 4034-1, 4.3.3.1). */
export const KETTE_TOLERANZ_M = 0.02;

/** Annahmen ohne Norm im Bestand — an EINER Stelle, damit sie ersetzbar bleiben. */
export const ANNAHMEN = Object.freeze({
    // DIN 19584 (Kanaldeckel D 400) fehlt im Bestand — die Rahmenhöhe ist nicht belegt.
    rahmenhoehe: Object.freeze({ schwer: 0.16, leicht: 0.1, text: 'Rahmenhöhe: DIN 19584 fehlt im Bestand' }),
    // Kein Anschluss bekannt — eine Haltung DN 300 als Bemessung des Unterteils.
    anschlussDn: Object.freeze({ wert: 0.3, text: 'kein Anschluss bekannt — DN 300 angenommen' }),
    // Erster Auftritt über der Standfläche: Mitte des Normbereichs 250–500 mm.
    ersterAuftritt: Object.freeze({ wert: 0.4, text: 'Mitte des Bereichs 250–500 mm' }),
    // Abstand des obersten Steigeisens unter dem Austritt.
    obersterAbstand: Object.freeze({ wert: 0.25, text: 'unter einem Steigabstand' }),
    // Lage des Steiggangs im Grundriss — die Norm legt sie nicht fest.
    steigRichtung: Object.freeze({ wert: 0, text: 'Steiggang nach Norden (Richtung nicht in ISYBAU)' }),
});

/** Die Normnennweite zu einem Mass, wenn es höchstens 2 cm daneben liegt — sonst null. */
export function normNennweite(d) {
    if (!_fin(d)) return null;
    return SCHACHT_NENNWEITEN.find(n => Math.abs(n - d) <= 0.02) ?? null;
}

/**
 * Ringe und Auflageringe für eine Höhe.
 *
 * Gesucht wird die Zusammenstellung mit dem kleinsten Rest; bei gleichem Rest
 * die mit weniger Ausgleichsringen, dann weniger Auflageringen. Sind die
 * Auflageringe gegeben (ISYBAU), füllen nur die Ringe.
 *
 * @returns {{ringe: number[], auflageringe: number[], rest: number}}
 */
export function fuelleHoehe(R, { auflageringeGegeben = null } = {}) {
    const arListen = auflageringeGegeben !== null ? [[]] : _auflageringListen();
    const arFest = auflageringeGegeben ?? 0;
    let beste = null;
    const nMax = Math.max(0, Math.ceil(R / RING_HOEHEN.regel) + 1);
    for (let k1 = 0; k1 <= nMax; k1++) {
        for (let k75 = 0; k75 <= 2; k75++) {
            for (let k50 = 0; k50 <= 2; k50++) {
                for (const ar of arListen) {
                    const summe = k1 * RING_HOEHEN.regel + k75 * 0.75 + k50 * 0.5 + ar.reduce((a, b) => a + b, 0) + arFest;
                    const rest = R - summe;
                    const kandidat = { k1, k75, k50, ar, rest };
                    if (!beste || _besser(kandidat, beste)) beste = kandidat;
                }
            }
        }
    }
    const ringe = [...Array(beste.k1).fill(1.0), ...Array(beste.k75).fill(0.75), ...Array(beste.k50).fill(0.5)];
    return { ringe, auflageringe: beste.ar, rest: _r3(beste.rest) };
}

function _besser(a, b) {
    const ea = Math.abs(a.rest), eb = Math.abs(b.rest);
    if (Math.abs(ea - eb) > 1e-6) return ea < eb;
    const ausA = a.k75 + a.k50, ausB = b.k75 + b.k50;
    if (ausA !== ausB) return ausA < ausB;
    return a.ar.length < b.ar.length;
}

/** Alle Stapel aus 1 bis 3 Auflageringen (60/80/100 mm) mit Summe ≤ 240 mm. */
function _auflageringListen() {
    const h = AUFLAGERINGE.hoehen, aus = [];
    for (const a of h) {
        aus.push([a]);
        for (const b of h) if (b <= a) {
            if (a + b <= AUFLAGERINGE.summeMax + 1e-9) aus.push([a, b]);
            for (const c of h) if (c <= b && a + b + c <= AUFLAGERINGE.summeMax + 1e-9) aus.push([a, b, c]);
        }
    }
    return aus;
}

/** Positionen der Steigeisen zwischen Standfläche und Austritt (DIN 4034-1, Anhang C). */
export function steigeisenHoehen(zStand, zAustritt) {
    const hoehe = zAustritt - zStand;
    const erster = Math.min(ANNAHMEN.ersterAuftritt.wert, Math.max(STEIG.ersterMin, hoehe - ANNAHMEN.obersterAbstand.wert));
    const spanne = hoehe - erster - ANNAHMEN.obersterAbstand.wert;
    if (hoehe < STEIG.ersterMin || spanne < 0) return { hoehen: [], abstand: null };
    const n = Math.ceil(spanne / STEIG.abstandMax - 1e-9);
    const abstand = n > 0 ? spanne / n : null;
    const hoehen = [];
    for (let i = 0; i <= n; i++) hoehen.push(_r3(zStand + erster + i * (abstand ?? 0)));
    return { hoehen, abstand: abstand === null ? null : _r3(abstand) };
}

/**
 * Die Bauteilkette eines Schachts.
 *
 * @param {object} s            ein Schacht aus `liesIsybauDaten` (oder gleich gebaut)
 * @param {object} [kontext]
 * @param {Array<{dn: number, sohle?: number, richtung?: number, art?: 'zulauf'|'ablauf'}>} [kontext.anschluesse]
 *        die Haltungen am Schacht (DN in m; Richtung in Radiant, 0 = Ost, gegen den Uhrzeigersinn)
 * @returns {{teile: object[], befunde: object[], kopf: object}|{teile: [], befunde: object[], kopf: null}}
 */
export function normschacht(s, { anschluesse = [] } = {}) {
    const befunde = [];
    const befund = (regel, text, schwere = 'hinweis') => befunde.push({ regel, schwere, text });
    const ab = s.abdeckung ?? {}, au = s.aufbau ?? {}, uz = s.untereZone ?? null, ut = s.unterteil ?? {};

    // ── Form und Ort ──
    if ([au.form, ut.form, uz?.form].some(f => f === 'E')) {
        befund('form_eckig', 'Eckiger Schacht — das Muster „Normschacht" ist rund; ein Rechteckschacht braucht die Kastenvorlage.', 'warnung');
        return { teile: [], befunde, kopf: null };
    }
    if (ut.form === 'O') befund('ohne_unterteil', 'Schacht ohne Unterteil (Tangentialschacht) — das Unterteil wird trotzdem als Topf gebaut.');
    if (!s.ort) { befund('ohne_lage', 'Der Schacht hat keine Lage.', 'warnung'); return { teile: [], befunde, kopf: null }; }

    // ── Höhen: gemessen ist, was gemessen ist ──
    const zDeckel = s.deckelHoehe;
    const zSohle = s.sohle?.hoehe;
    if (!_fin(zDeckel) || !_fin(zSohle)) {
        befund('ohne_hoehen', 'Deckel- oder Sohlhöhe fehlt — ohne beide geht die Höhenkette nicht auf.', 'warnung');
        return { teile: [], befunde, kopf: null };
    }
    const tiefe = zDeckel - zSohle;
    if (_fin(s.schachttiefe) && Math.abs(s.schachttiefe - tiefe) > 0.05 && s.sohle.quelle !== 'Deckelhöhe − Schachttiefe') {
        befund('tiefe_widerspruch', `Schachttiefe ${s.schachttiefe.toFixed(2)} m, aus Deckel und Sohle ${tiefe.toFixed(2)} m — die Höhen gelten.`);
    }

    // ── Nennweite ──
    // Mit Konus ist `LaengeAufbau` laut Format das Mass „an der Oberkante Konus" —
    // dann ist es die Öffnung, nicht der Ring (AH15 Tab. A-7-26).
    const laengeAufbauIstOeffnung = au.konus === true && _fin(au.laenge) && au.laenge < 0.85;
    const dnRoh = laengeAufbauIstOeffnung ? (ut.laenge ?? null) : (au.laenge ?? ut.laenge ?? null);
    let dn = normNennweite(dnRoh);
    let hDn;
    if (dn !== null) hDn = H('isybau', `DN ${Math.round(dn * 1000)} aus ${laengeAufbauIstOeffnung ? 'LaengeUnterteil' : (au.laenge ? 'LaengeAufbau' : 'LaengeUnterteil')}`);
    else if (_fin(dnRoh)) {
        dn = dnRoh;
        hDn = H('isybau', `Ø ${dnRoh.toFixed(2)} m — keine Normnennweite`);
        befund('keine_normnennweite', `Ø ${dnRoh.toFixed(2)} m ist keine Nennweite nach DIN 4034-1 — Wanddicke der nächsten Nennweite.`);
    } else {
        dn = 1.0;
        hDn = H('annahme', 'keine Nennweite in ISYBAU — DN 1000 (begehbarer Schacht)', B.einstieg);
    }
    const dnTab = SCHACHT_NENNWEITEN.reduce((a, b) => (Math.abs(b - dn) < Math.abs(a - dn) ? b : a));
    const t = RING_WANDDICKE[dnTab];
    const hT = H('norm', `Mindestwanddicke DN ${Math.round(dnTab * 1000)}`, B.ringWand);

    // ── Oben: Abdeckung, Auflageringe, Hals ──
    const klasse = ab.klasse && ABDECKUNGSKLASSEN[ab.klasse] ? ab.klasse : null;
    const leicht = klasse === 'A' || klasse === 'B';
    const hRahmen = leicht ? ANNAHMEN.rahmenhoehe.leicht : ANNAHMEN.rahmenhoehe.schwer;
    const oeffnungIsy = laengeAufbauIstOeffnung ? au.laenge : (_fin(ab.laenge) ? ab.laenge : null);
    const d10 = HALS.oeffnungen.find(o => _fin(oeffnungIsy) && Math.abs(o - oeffnungIsy) <= 0.03) ?? HALS.oeffnungen[0];
    const hD10 = _fin(oeffnungIsy) ? H('isybau', `Öffnung ${Math.round(d10 * 1000)} mm`) : H('norm', 'Öffnung 625 mm (Regel)', B.hals);
    const zRahmenUnten = zDeckel - hRahmen;

    // Hals oder Abdeckplatte: ISYBAU sagt es, sonst der Regelaufbau mit Hals (DIN 4034-1, Bild 1).
    let oberteil = au.abdeckplatte === true || au.konus === false ? 'abdeckplatte' : 'hals';
    const hOberteil = oberteil === 'hals'
        ? (au.konus === true ? H('isybau', 'Konus vorhanden') : H('norm', 'Regelaufbau mit Schachthals', B.hals))
        : H('isybau', au.abdeckplatte ? 'Abdeckplatte vorhanden' : 'kein Konus — Abdeckplatte');

    // ── Unten: Unterteil mit Gerinne ──
    const dR = Math.max(0, ...anschluesse.map(a => a.dn).filter(_fin));
    const dRwert = dR > 0 ? dR : ANNAHMEN.anschlussDn.wert;
    const hDr = dR > 0 ? H('isybau', `grösster Anschluss DN ${Math.round(dR * 1000)}`) : H('annahme', ANNAHMEN.anschlussDn.text);
    const boden = UNTERTEIL_BODEN[dnTab];
    let hUnterteil, hHu;
    if (_fin(ut.hoehe) && ut.hoehe > 0) {
        hUnterteil = ut.hoehe;
        hHu = H('isybau', 'HoeheUnterteil (Sohle bis zum ersten Bauteilwechsel)');
    } else {
        hUnterteil = dRwert + (dRwert <= 0.25 ? WAND_UEBER_SCHEITEL.bisDn250 : WAND_UEBER_SCHEITEL.abDn300);
        hHu = H('norm', `Wand über dem höchsten Scheitel (${dRwert <= 0.25 ? 350 : 400} mm)`, B.wandUeberScheitel);
    }
    const zUnterteilOben = zSohle + hUnterteil;
    const zUnterteilUnten = zSohle - boden;
    const auftritt = dRwert <= AUFTRITT.grenzeDn ? dRwert : AUFTRITT.mindestHoehe;

    // ── Untere Schachtzone (Übergangsplatte) ──
    let zone = null;
    if (uz && (uz.uebergangsplatte || _fin(uz.hoehe))) {
        if (!_fin(uz.hoehe)) befund('zone_ohne_hoehe', 'Untere Schachtzone ohne Höhe — übergangen.', 'warnung');
        else {
            const dnUnten = normNennweite(uz.laenge) ?? uz.laenge ?? dn;
            zone = { dn: dnUnten, hoehe: uz.hoehe, platte: uz.uebergangsplatte !== false };
        }
    }

    // ── Die Ringe dazwischen ──
    const hHals = oberteil === 'hals' ? HALS.hoehe : ABDECKPLATTE.hoehe;
    const zZoneOben = zone ? zUnterteilOben + zone.hoehe : zUnterteilOben;
    const arGegeben = _fin(ab.hoeheAuflageringe) ? ab.hoeheAuflageringe : null;
    let R = zRahmenUnten - hHals - zZoneOben;
    if (R < -KETTE_TOLERANZ_M && oberteil === 'hals') {
        befund('zu_flach_fuer_hals', 'Für einen Schachthals ist der Schacht zu flach — Abdeckplatte nach DIN 4034-1, 4.3.3.8.7.');
        oberteil = 'abdeckplatte';
        R = zRahmenUnten - ABDECKPLATTE.hoehe - zZoneOben;
    }
    const fuell = fuelleHoehe(R, { auflageringeGegeben: arGegeben });
    if (Math.abs(fuell.rest) > KETTE_TOLERANZ_M) {
        befund('kette_offen', `Die Höhenkette geht um ${(fuell.rest * 100).toFixed(1)} cm nicht auf (${fuell.rest > 0 ? 'Lücke' : 'Überstand'}).`, 'warnung');
    }
    if (_fin(au.hoehe)) {
        const ist = fuell.ringe.reduce((a, b) => a + b, 0) + (oberteil === 'hals' ? HALS.hoehe : 0);
        if (Math.abs(ist - au.hoehe) > 0.05) befund('aufbau_widerspruch', `HoeheAufbau ${au.hoehe.toFixed(2)} m, aus der Kette ${ist.toFixed(2)} m — die gemessenen Höhen gelten.`);
    }

    // ── Teile, von unten nach oben ──
    const teile = [];
    const ring = (z0, h, d, name, herk) => ({
        rolle: 'schachtring', name, unten: _r3(z0), oben: _r3(z0 + h), dInnen: d, dAussen: _r3(d + 2 * RING_WANDDICKE[normNennweite(d) ?? dnTab]),
        material: au.material ?? null, herleitung: { hoehe: herk, dInnen: hDn, wanddicke: hT },
    });
    teile.push({
        rolle: 'schachtunterteil', name: `Schachtunterteil DN ${Math.round(dn * 1000)}`,
        unten: _r3(zUnterteilUnten), oben: _r3(zUnterteilOben), dInnen: dn, dAussen: _r3(dn + 2 * t), boden,
        material: ut.material ?? au.material ?? null,
        gerinne: {
            form: ut.gerinneform ?? 0, breite: dRwert,
            // Kreis/Rechteck „bis Kämpfer" = halbe, „bis Scheitel" = ganze Profilhöhe (G309).
            hoehe: [1, 3].includes(ut.gerinneform) ? dRwert : dRwert / 2,
            auftritt, material: ut.materialGerinne ?? null,
            anschluesse: anschluesse.map(a => ({ dn: a.dn, sohle: a.sohle ?? zSohle, richtung: a.richtung ?? null, art: a.art ?? null })),
        },
        herleitung: {
            hoehe: hHu, boden: H('norm-pruefen', `Bodendicke t3 DN ${Math.round(dnTab * 1000)}`, B.unterteil),
            dInnen: hDn, wanddicke: hT, gerinne: ut.gerinneform !== undefined && ut.gerinneform !== null ? H('isybau', 'Gerinneform G309') : H('annahme', 'Gerinneform fehlt — Kreis bis Kämpfer'),
            auftritt: H('norm', dRwert <= AUFTRITT.grenzeDn ? 'Auftritt auf Scheitelhöhe' : 'Auftritt 500 mm über Sohle', B.auftritt),
            anschluss: hDr,
        },
    });
    let z = zUnterteilOben;
    if (zone) {
        const unten = fuelleHoehe(zone.hoehe - (zone.platte ? UEBERGANGSPLATTE.hoehe : 0), { auflageringeGegeben: 0 });
        for (const h of unten.ringe) { teile.push(ring(z, h, zone.dn, `Schachtring DN ${Math.round(zone.dn * 1000)} × ${Math.round(h * 1000)}`, H('norm', 'Ringhöhe der Reihe 1000/750/500', B.ring))); z += h; }
        if (zone.platte) {
            teile.push({ rolle: 'uebergangsplatte', name: `Übergangsplatte DN ${Math.round(zone.dn * 1000)}/${Math.round(dn * 1000)}`,
                unten: _r3(z), oben: _r3(z + UEBERGANGSPLATTE.hoehe), dAussen: _r3(zone.dn + 2 * RING_WANDDICKE[normNennweite(zone.dn) ?? dnTab]),
                dOeffnung: dn, material: uz.material ?? null, herleitung: { hoehe: H('norm', 'Übergangsplatte 250 mm', B.uebergangsplatte) } });
            z += UEBERGANGSPLATTE.hoehe;
        }
        z = zZoneOben;
    }
    // Regelringe unten, Ausgleichsringe oben unter dem Hals (Einbaugewohnheit, keine Norm).
    for (const h of fuell.ringe) {
        teile.push(ring(z, h, dn, `Schachtring DN ${Math.round(dn * 1000)} × ${Math.round(h * 1000)}`,
                        H('norm', h === RING_HOEHEN.regel ? 'Regelbauhöhe 1000 mm' : `Ausgleichsbauhöhe ${Math.round(h * 1000)} mm`, B.ring)));
        z += h;
    }
    if (oberteil === 'hals') {
        teile.push({ rolle: 'schachthals', name: `Schachthals DN ${Math.round(dn * 1000)}/${Math.round(d10 * 1000)}`,
            unten: _r3(z), oben: _r3(z + HALS.hoehe), dUnten: dn, dOben: d10, wanddicke: t,
            // Zentrisch oder exzentrisch regelt keine Norm — exzentrisch ist im Bestand üblich (Annahme).
            exzentrisch: true, steigRichtung: ANNAHMEN.steigRichtung.wert,
            material: au.material ?? null,
            herleitung: { form: hOberteil, hoehe: H('norm', 'Bauhöhe 600 mm', B.hals), dOben: hD10, exzentrisch: H('annahme', 'Konusform nicht genormt — exzentrisch'), wanddicke: hT } });
        z += HALS.hoehe;
    } else {
        teile.push({ rolle: 'abdeckplatte', name: `Abdeckplatte DN ${Math.round(dn * 1000)}/${Math.round(d10 * 1000)}`,
            unten: _r3(z), oben: _r3(z + ABDECKPLATTE.hoehe), dAussen: _r3(dn + 2 * t), dOeffnung: d10, material: au.material ?? null,
            herleitung: { form: hOberteil, hoehe: H('norm', 'Bauhöhe 200 mm', B.abdeckplatte), dOeffnung: hD10 } });
        z += ABDECKPLATTE.hoehe;
    }
    const ars = arGegeben !== null ? _auflageringeAus(arGegeben, ab.anzahlAuflageringe) : fuell.auflageringe;
    for (const h of ars) {
        teile.push({ rolle: 'auflagering', name: `Auflagering ${Math.round(h * 1000)} mm`, unten: _r3(z), oben: _r3(z + h),
            dInnen: d10, dAussen: _r3(d10 + 0.17),
            herleitung: { hoehe: arGegeben !== null ? H('isybau', 'HoeheAuflageringe (cm)') : H('norm', 'Auflageringe 60/80/100 mm, ≤ 240 mm', B.auflageringSumme),
                          dAussen: H('annahme', 'Ringbreite 85 mm') } });
        z += h;
    }
    if (ars.length < AUFLAGERINGE.mindestens) befund('ohne_auflagering', 'Kein Auflagering — DWA-A 157 verlangt mindestens einen.');
    if (ars.reduce((a, b) => a + b, 0) > AUFLAGERINGE.summeMax + 1e-9) befund('auflageringe_zu_hoch', 'Auflageringe zusammen über 240 mm (DWA-A 157, 9.2.2).', 'warnung');
    teile.push({
        rolle: 'abdeckung', name: `Schachtabdeckung${klasse ? ` ${ABDECKUNGSKLASSEN[klasse].titel}` : ''}`,
        unten: _r3(zRahmenUnten), oben: _r3(zDeckel),
        lichteWeite: _fin(ab.laenge) ? ab.laenge : d10, eckig: ab.deckelform === 'E' || ab.deckelform === 'EV',
        breite: ab.breite ?? null, klasse, lueftung: ab.deckeltyp === 1 ? true : ab.deckeltyp === 2 ? false : null,
        verschraubt: ab.deckelform === 'RV' || ab.deckelform === 'EV', material: ab.material ?? null, schmutzfaenger: ab.schmutzfaenger ?? null,
        herleitung: { hoehe: H('annahme', ANNAHMEN.rahmenhoehe.text), lichteWeite: _fin(ab.laenge) ? H('isybau', 'LaengeDeckel') : hD10,
                      klasse: klasse ? H('isybau', 'Abdeckungsklasse G304', B.abdeckungKlasse) : H('annahme', 'Klasse fehlt') },
    });

    // ── Steighilfen ──
    const art = s.artEinstieghilfe;
    if (s.einstieghilfe !== false && art !== 5 && art !== 4) {
        const zStand = zSohle + auftritt;
        if (art === 3) {
            teile.push({ rolle: 'leiter', name: 'Steigleiter', unten: _r3(zStand), oben: _r3(zRahmenUnten), richtung: ANNAHMEN.steigRichtung.wert,
                herleitung: { lage: H('annahme', ANNAHMEN.steigRichtung.text) } });
        } else {
            const zweilaeufig = art === 2;
            if (zweilaeufig && dn > STEIG.zweilaeufigBisDn + 1e-9) befund('zweilaeufig_zu_weit', 'Zweiläufiger Steiggang nur bis Schacht-Ø 1,2 m (DIN 4034-1, Anhang C).', 'warnung');
            const { hoehen, abstand } = steigeisenHoehen(zStand, zRahmenUnten);
            if (abstand !== null && (abstand < STEIG.abstandMin - 1e-6 || abstand > STEIG.abstandMax + 1e-6)) {
                befund('steigmass', `Steigmass ${Math.round(abstand * 1000)} mm ausserhalb 250–333 mm.`);
            }
            teile.push({ rolle: 'steigeisen', name: zweilaeufig ? 'Steigeisengang zweiläufig' : 'Steigeisengang einläufig',
                hoehen, abstand, zweilaeufig, richtung: ANNAHMEN.steigRichtung.wert, material: s.materialSteighilfen ?? null,
                herleitung: { hoehen: H('norm', 'Steigmass 250–333 mm, erster Auftritt 250–500 mm', B.steig),
                              art: art ? H('isybau', 'ArtEinstieghilfe G306') : H('annahme', 'Steighilfe angenommen (keine Angabe)'),
                              lage: H('annahme', ANNAHMEN.steigRichtung.text) } });
        }
    }

    return {
        teile,
        befunde,
        kopf: {
            name: s.name, ort: s.ort, deckel: zDeckel, sohle: zSohle, tiefe: _r3(tiefe), dn, wanddicke: t,
            oeffnung: d10, oberteil, sohleQuelle: s.sohle.quelle, rest: fuell.rest,
        },
    };
}

/** Auflageringe aus ihrer Gesamthöhe (ISYBAU) und Anzahl — gleich hoch verteilt. */
function _auflageringeAus(summe, anzahl) {
    if (!(summe > 0)) return [];
    const n = Number.isInteger(anzahl) && anzahl > 0 ? anzahl : Math.max(1, Math.ceil(summe / 0.1 - 1e-9));
    return Array(n).fill(_r3(summe / n));
}
