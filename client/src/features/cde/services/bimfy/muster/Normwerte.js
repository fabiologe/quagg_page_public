/**
 * Normwerte für die Muster — jede Zahl mit ihrem Beleg.
 *
 * Gelesen aus der Normenbibliothek (NormRAG), Stand 2026-10-05. Ein Wert,
 * dessen Lesung unsicher ist (OCR, rekonstruierte Tabelle), trägt
 * `pruefen: true` und wird in der Herleitung so genannt. Was keine Norm im
 * Bestand hergibt, steht NICHT hier, sondern als Annahme im Muster.
 *
 * Masse in Metern, wenn nicht anders gesagt.
 */

/** Ein Beleg: Norm, Stelle, und ob am Original zu prüfen. */
const beleg = (norm, stelle, pruefen = false) => Object.freeze({ norm, stelle, ...(pruefen ? { pruefen: true } : {}) });

export const B = Object.freeze({
    ring: beleg('DIN 4034-1:2020-04', '4.3.3.8.4'),
    strassenablauf: beleg('REwS 2021', '5.6.3 (Unterteile für Straßenabläufe)'),
    grundstueckSchacht: beleg('DIN 1986-100:2016-12', 'Tabelle 3 (Einsteigschächte und Inspektionsöffnungen)'),
    ringStoss: beleg('DIN V 4034-1:2004-08', 'Tabelle 5 (Schachtring mit Muffe SR-M)'),
    ringWand: beleg('DIN 4034-1:2020-04', 'Tabelle 10'),
    nennweiten: beleg('DIN 4034-1:2020-04', 'Abschnitt 1'),
    hals: beleg('DIN 4034-1:2020-04', '4.3.3.8.6 und Tabelle 8'),
    abdeckplatte: beleg('DIN 4034-1:2020-04', '4.3.3.8.7 und Tabelle 9'),
    uebergangsplatte: beleg('DIN 4034-1:2020-04', '4.3.3.8.5'),
    fussauflagering: beleg('DIN 4034-1:2020-04', '4.3.3.8.3'),
    auflagering: beleg('DIN 4034-1:2020-04', '4.3.3.8.8'),
    auflageringSumme: beleg('DWA-A 157:2020-12', '9.2.2'),
    unterteil: beleg('DIN 4034-1:2020-04', 'Tabelle 4', true),
    wandUeberScheitel: beleg('DWA-A 157:2020-12', '5.2.7'),
    auftritt: beleg('DWA-A 157:2020-12', '9.2.2'),
    steig: beleg('DIN 4034-1:2020-04', 'Anhang C'),
    steigZweilaeufig: beleg('DIN 4034-1:2020-04', 'Anhang C'),
    einstieg: beleg('DWA-A 157:2020-12', '9.2.2'),
    abdeckungKlasse: beleg('DIN EN 124-1:2015-09', '4.1 und 4.2'),
    abdeckungEinlegetiefe: beleg('DIN EN 124-1:2015-09', 'Anforderung Einlegetiefe'),
    pvc: beleg('DIN EN 1401-1:2019-09', '3.11 (SDR) und 3.12 (SN)'),
    pvcMuffe: beleg('DIN EN 1401-1:2019-09', 'Tabellen 7 und 8 (Steckmuffe)'),
    pvcBogen: beleg('DIN EN 1401-1:2009-07', 'Formstücke, Bögen: 15°, 30°, 45°, 67°30\' oder 87°30\' bis 90°'),
    ppBogen: beleg('DIN EN 1852-1:2018-03', 'Formstücke, Bögen: 15°, 30°, 45°, 87,5° bis 90°'),
    abwinkelung: beleg('DIN EN 1401-1:2009-07', 'Dichtheit der Verbindung (EN 1277, Bedingung B): Abwinkelung 2° bei dn ≤ 315 mm'),
    richtungswechsel: beleg('DIN 1986-100:2016-12', 'Reinigungsöffnungen bei Richtungsänderungen von Grundleitungen > 30°'),
    pp: beleg('DIN EN 1852-1:2018-03', '3.10 (SDR) und Tabelle 4'),
    ppMuffe: beleg('DIN EN 1852-1:2018-03', 'Tabelle 6 (Steckmuffe, Fussnote a: Baulänge 6 m)'),
    pe: beleg('DIN EN 12666-1:2011-11', '3.1.2.10 (SDR) und Tabelle 3'),
    peMuffe: beleg('DIN EN 12666-1:2011-11', 'Tabelle 4 (Formeln für dn > 630, Fussnote a: Baulänge 6 m)'),
    alteDn: beleg('DIN 19534-1', 'Tabellen 4 und 5 (alte DN-Reihe der KG-Rohre → Aussendurchmesser)'),
    dnBezug: beleg('DWA-A 139:2019', '3.9 (DN/ID oder DN/OD)'),
    betonDn: beleg('DIN EN 1916', '3.1.16 (DN = Innendurchmesser)'),
    betonWand: beleg('DIN EN 1916', '4.3.3.1 (Wanddicke nach Werksunterlagen)'),
    betonSpitzende: beleg('DIN V 1201:2004-08', 'Tabelle 7 (Spitzenden-Aussendurchmesser, Empfehlung)'),
    betonMuffe: beleg('DIN V 1201:2004-08', 'Tabellen 3 und 7 (Glockenmuffe)'),
    betonBaulaenge: beleg('DIN V 1201:2004-08', '4.3.3.1 und Tabelle 2 (Bezeichnungsbeispiele)'),
    steinzeugWand: beleg('DIN EN 295-1:2013-05', 'Anhang B.3 (Wanddicke vom Hersteller)'),
    steinzeugDi: beleg('DIN EN 295-1:2013-05', 'Tabelle 1'),
    steinzeugVerbindung: beleg('DIN EN 295-1:2013-05', 'Tabellen 13 und 14 (Verbindungsmasse)'),
    steinzeugBaulaenge: beleg('DIN EN 295-1:2013-05', 'Tabelle 2 (bevorzugte Baulängen)'),
    gussWand: beleg('DWA-A 161:2014', 'Tabelle 19 (Mindest-Gusswanddicke)'),
    gussAussen: beleg('DIN EN 545', 'Tabelle 17 (Aussendurchmesser DE, aus Herstellerkatalog)'),
});

/** Nennweiten der Schachtfertigteile (DIN 4034-1, Abschnitt 1). */
export const SCHACHT_NENNWEITEN = Object.freeze([0.8, 1.0, 1.2, 1.5, 2.0]);

/** Mindestwanddicke der Schachtringe je DN (DIN 4034-1, Tabelle 10). */
export const RING_WANDDICKE = Object.freeze({ 0.8: 0.12, 1.0: 0.12, 1.2: 0.135, 1.5: 0.15, 2.0: 0.15 });

/**
 * DER STOSS DER SCHACHTRINGE (Muffe SR-M, DIN V 4034-1:2004, Tabelle 5) als Formeln,
 * die die Stützwerte treffen — DN 1000: Spitzende aussen 1090 mm, 65 mm hoch,
 * Muffe 70 mm tief; DN 1200: 1300/75/80; DN 1500: 1620/85/90.
 * Wand am Spitzende 0,03·DN + 15 mm, Spitzende hoch 0,04·DN + 25 mm, Muffe 5 mm tiefer.
 * NICHT im Bestand: die Muffenspaltweite (Tabelle 7) — 10 mm angenommen.
 * @returns {{spitzende, spitzendeHoehe, muffe, muffeTiefe}} Durchmesser und Höhen in m
 */
export function ringStoss(dn, wanddicke) {
    const wandSp = Math.min(0.03 * dn + 0.015, wanddicke - 0.03);
    const spitzende = dn + 2 * wandSp;
    const spitzendeHoehe = 0.04 * dn + 0.025;
    const r = (v) => Math.round(v * 10000) / 10000;
    return { spitzende: r(spitzende), spitzendeHoehe: r(spitzendeHoehe), muffe: r(spitzende + 2 * RING_MUFFENSPALT), muffeTiefe: r(spitzendeHoehe + 0.005) };
}
/** Muffenspalt der Schachtringe — Annahme (DIN V 4034-1, Tabelle 7 nicht im Bestand). */
export const RING_MUFFENSPALT = 0.01;

/**
 * Schächte der Grundstücksentwässerung (DIN 1986-100:2016, Tab. 3): besteigbar in der Regel
 * ab DN/ID 1000, DN/ID 800 nur „in Ausnahmesituationen … bis 3 000 mm Tiefe"; nicht besteigbare
 * Inspektionsöffnungen DN/ID 300–<400 bis 1,5 m, 400–<800 bis 3,0 m tief.
 */
export const GRUNDSTUECK_SCHACHT = Object.freeze({ besteigbarDi: 1.0, ausnahmeDi: 0.8, ausnahmeBisTiefe: 3.0,
                                                   inspektion: Object.freeze([{ diAb: 0.3, bisTiefe: 1.5 }, { diAb: 0.4, bisTiefe: 3.0 }]) });

/** Bauhöhen der Schachtringe: Regel 1000 mm, Ausgleich 750 und 500 mm (DIN 4034-1, 4.3.3.8.4). */
export const RING_HOEHEN = Object.freeze({ regel: 1.0, ausgleich: Object.freeze([0.75, 0.5]) });

/** Schachthals: Bauhöhe 600 mm, obere Öffnung 625 oder 800 mm (DIN 4034-1, 4.3.3.8.6, Tabelle 8). */
export const HALS = Object.freeze({ hoehe: 0.6, oeffnungen: Object.freeze([0.625, 0.8]) });

/** Abdeckplatte statt Hals bei niedriger Bauhöhe: 200 mm (DIN 4034-1, 4.3.3.8.7). */
export const ABDECKPLATTE = Object.freeze({ hoehe: 0.2 });

/** Übergangsplatte 250 mm (4.3.3.8.5), Fussauflagering 250 mm (4.3.3.8.3). */
export const UEBERGANGSPLATTE = Object.freeze({ hoehe: 0.25 });
export const FUSSAUFLAGERING = Object.freeze({ hoehe: 0.25 });

/** Auflageringe 60, 80, 100 mm (DIN 4034-1, 4.3.3.8.8), zusammen höchstens 240 mm, mindestens einer (DWA-A 157, 9.2.2). */
export const AUFLAGERINGE = Object.freeze({ hoehen: Object.freeze([0.06, 0.08, 0.1]), summeMax: 0.24, mindestens: 1 });

/**
 * Bodendicke t3 des Unterteils (DIN 4034-1, Tabelle 4 — aus OCR rekonstruiert,
 * am Original zu prüfen). DN 1000 und 1200 sind in der Lesung eingeschätzt.
 */
export const UNTERTEIL_BODEN = Object.freeze({ 0.8: 0.15, 1.0: 0.15, 1.2: 0.15, 1.5: 0.2, 2.0: 0.2 });

/** Wand des Unterteils über dem höchsten Rohrscheitel: ≤ DN 250 → 350 mm, ≥ DN 300 → 400 mm (DWA-A 157, 5.2.7). */
export const WAND_UEBER_SCHEITEL = Object.freeze({ bisDn250: 0.35, abDn300: 0.4 });

/** Auftritt: bis DN 500 auf Scheitelhöhe, darüber mindestens 500 mm über Sohle; Neigung ≤ 5 % (DWA-A 157, 9.2.2). */
export const AUFTRITT = Object.freeze({ grenzeDn: 0.5, mindestHoehe: 0.5, neigungMax: 0.05 });

/**
 * Steighilfen (DIN 4034-1, Anhang C): Steigmass 250–333 mm, unterster Auftritt
 * 250–500 mm über der Standfläche, zweiläufig nur bis Schacht-Ø 1,2 m.
 */
export const STEIG = Object.freeze({ abstandMin: 0.25, abstandMax: 0.333, ersterMin: 0.25, ersterMax: 0.5, zweilaeufigBisDn: 1.2 });

/** Klassen der Abdeckungen (DIN EN 124-1:2015, 4.1/4.2): Prüfkraft in kN, Einbaustellen-Gruppe. */
export const ABDECKUNGSKLASSEN = Object.freeze({
    A: { titel: 'A 15', pruefkraftKn: 15, gruppe: 1 },
    B: { titel: 'B 125', pruefkraftKn: 125, gruppe: 2 },
    C: { titel: 'C 250', pruefkraftKn: 250, gruppe: 3 },
    D: { titel: 'D 400', pruefkraftKn: 400, gruppe: 4 },
    E: { titel: 'E 600', pruefkraftKn: 600, gruppe: 5 },
    F: { titel: 'F 900', pruefkraftKn: 900, gruppe: 6 },
});

/**
 * Kunststoffrohre: die Wanddicke folgt aus der Definition SDR ≈ dn / e
 * (DIN EN 1401-1:2019, 3.11; DIN EN 1852-1:2018, 3.10; DIN EN 12666-1, 3.1.2.10),
 * aufgerundet auf 0,1 mm. Die Tabellen der Normen stehen bewusst NICHT hier
 * (öffentlicher Repo) — die Formel trifft sie auf ±0,2 mm.
 *
 * PVC-U: Steifigkeitsklasse → SDR wie in DIN EN 1401-1 gelesen. Für PP ist die
 * Zuordnung SN → SDR im Bestand nicht belegt.
 */
export const PVC_SDR = Object.freeze({ SN2: 51, SN4: 41, SN8: 34, SN16: 27.6 });
/** Kleinste Wanddicke kleiner Nennweiten (DIN EN 1401-1, Tabelle 6, Fussnote b: 3,2 mm). */
export const PVC_EMIN_UNTEN = 0.0032;

/** Steinzeug: Mindest-Innendurchmesser 97,5 % der Nennweite (DIN EN 295-1:2013, Tabelle 1 und Regel darunter). */
export const STEINZEUG_DI_MIN_ANTEIL = 0.975;

/** Kunststoff: Steifigkeitsklasse → SDR (DIN EN 1852-1, Tabelle 4; DIN EN 12666-1, Tabelle 3). */
export const PP_SDR = Object.freeze({ SN4: 33, SN8: 29, SN16: 22 });
export const PE_SDR = Object.freeze({ SN4: 26, SN8: 21, SN16: 17 });

/**
 * Alte DN-Reihe der KG-Rohre (DIN 19534) → Aussendurchmesser, nur wo sie abweicht:
 * DN 100 → 110, 150 → 160, 300 → 315, 600 → 630 (Meter). „PVC DN 150" in Bestandsdaten ist DN/OD 160.
 */
export const ALTE_DN_NACH_OD = Object.freeze({ 0.1: 0.11, 0.15: 0.16, 0.3: 0.315, 0.6: 0.63 });

/** Aussendurchmesser-Reihe der Kunststoff-Kanalrohre in mm (DIN EN 1401-1, 1852-1, 12666-1). */
export const OD_REIHE_MM = Object.freeze([110, 125, 160, 200, 250, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000, 1200, 1400, 1600]);
