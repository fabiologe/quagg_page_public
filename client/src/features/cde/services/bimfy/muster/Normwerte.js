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
    pp: beleg('DIN EN 1852-1:2018-03', '3.10 (SDR)'),
    pe: beleg('DIN EN 12666-1:2011-11', '3.1.2.10 (SDR)'),
    betonDn: beleg('DIN EN 1916', '3.1.16 (DN = Innendurchmesser)'),
    betonWand: beleg('DIN EN 1916', '4.3.3.1 (Wanddicke nach Werksunterlagen)'),
    steinzeugWand: beleg('DIN EN 295-1:2013-05', 'Anhang B.3 (Wanddicke vom Hersteller)'),
    steinzeugDi: beleg('DIN EN 295-1:2013-05', 'Tabelle 1'),
});

/** Nennweiten der Schachtfertigteile (DIN 4034-1, Abschnitt 1). */
export const SCHACHT_NENNWEITEN = Object.freeze([0.8, 1.0, 1.2, 1.5, 2.0]);

/** Mindestwanddicke der Schachtringe je DN (DIN 4034-1, Tabelle 10). */
export const RING_WANDDICKE = Object.freeze({ 0.8: 0.12, 1.0: 0.12, 1.2: 0.135, 1.5: 0.15, 2.0: 0.15 });

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

/** Steinzeug: Mindest-Innendurchmesser in mm je DN (DIN EN 295-1:2013, Tabelle 1). */
export const STEINZEUG_DI_MIN = Object.freeze({
    100: 96, 125: 121, 150: 146, 200: 195, 225: 219, 250: 244, 300: 293, 350: 341, 400: 390, 450: 439,
    500: 487, 600: 585, 700: 682, 800: 780, 900: 878, 1000: 975, 1200: 1170, 1400: 1365,
});
