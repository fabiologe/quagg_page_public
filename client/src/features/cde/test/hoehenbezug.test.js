/**
 * Höhenbezug (Stufe 12.0c).
 *
 * Fabios Meldung: „die Höhe ist irgendwie bei −17,4 bei Elementen — die
 * relativen Höhenverhältnisse sind richtig, aber das gesamte Modell liegt nicht
 * auf den realen Höhen."
 *
 * Das ist die Handschrift von `COORDINATE_TO_ORIGIN`: der Loader verschiebt das
 * Modell zum Ursprung, damit die Float32-Puffer von three.js nicht an
 * Gauss-Krüger-Grössenordnungen zerbrechen — bei einem Rechtswert von 2.577.000
 * verlöre man rund 3 cm allein durch die Rundung. Richtig so. Nur ist die Höhe
 * damit ebenfalls verschoben.
 *
 * DER EIGENTLICHE FEHLER war nicht die Verschiebung, sondern dass die
 * Rückrechnung `m NN = welt.y + offset.y` im Haus zwar aufgeschrieben stand
 * (`LaengsschnittBuilder.js`), aber NUR DORT angewandt wurde. Der Längsschnitt
 * zeigte richtige Sohlhöhen, die Bearbeitung zeigte Three-Koordinaten. Dieselbe
 * Grösse, zwei Systeme, kein Hinweis darauf.
 *
 * Die Zahlen unten stammen aus Fabios echter Datei: die Bauteile liegen dort
 * auf 267,78 bis 320,10 m NN, das erste auf 318,40.
 */
import { describe, expect, it } from 'vitest';
import { beschreibeHoehe, hatHoehenbezug, nnAusWelt, weltAusNn } from '../services/Hoehenbezug.js';
import { nachId } from '../services/Bearbeitungen.js';

const VERSATZ = 318.4;

describe('Umrechnung in beide Richtungen', () => {
    it('macht aus −17,4 die wirkliche Höhe', () => {
        expect(nnAusWelt(-17.4, VERSATZ)).toBeCloseTo(301.0, 6);
    });

    it('rechnet eine eingegebene Höhe zurück in die Three-Welt', () => {
        expect(weltAusNn(301.0, VERSATZ)).toBeCloseTo(-17.4, 6);
    });

    it('ist in sich geschlossen — hin und zurück ergibt den Ausgangswert', () => {
        for (const y of [-50.62, -17.4, 0, 1.7]) {
            expect(weltAusNn(nnAusWelt(y, VERSATZ), VERSATZ)).toBeCloseTo(y, 9);
        }
    });

    it('lässt Werte unberührt, wenn es keinen Höhenbezug gibt', () => {
        expect(hatHoehenbezug(0)).toBe(false);
        expect(hatHoehenbezug(undefined)).toBe(false);
        expect(nnAusWelt(-17.4, 0)).toBe(-17.4);
    });

    it('sagt bei fehlendem Bezug, dass es keiner ist — statt „m NN" zu behaupten', () => {
        // Eine Zahl mit falscher Einheit ist schlimmer als eine ohne: sie wird
        // geglaubt und in einen Plan übernommen.
        expect(beschreibeHoehe(-17.4, VERSATZ)).toBe('301.000 m NN');
        expect(beschreibeHoehe(-17.4, 0)).toMatch(/ohne Höhenbezug/);
    });
});

describe('Die Bezugshöhe rechnet mit wirklichen Höhen', () => {
    const ROHR = {
        globalId: 'H12',
        anker: { x: 5, y: -17.25, z: 2 },   // Hüllenmitte, Three-Welt
        bezugshoehe: -17.4,                 // Unterkante, Three-Welt
        hoehenversatz: VERSATZ,
    };
    const b = () => nachId('bezugshoehe-setzen');

    it('zeigt im Formular die wirkliche Höhe, nicht die Three-Koordinate', () => {
        expect(b().vorbelegung(ROHR).hoehe).toBeCloseTo(301.0, 3);
    });

    it('legt eine eingegebene NN-Höhe an der richtigen Stelle ab', () => {
        // Ohne Rückrechnung würde „302,0" das Rohr um 319 m nach oben werfen.
        const nachher = b().anwenden(ROHR, { hoehe: 302.0 }).nachher;
        expect(nachher.y).toBeCloseTo(-16.25, 6);      // 1,00 m höher, nicht 319
        expect(nachher.x).toBe(5);
        expect(nachher.z).toBe(2);
    });

    it('verschiebt weiterhin um die DIFFERENZ, nicht auf den Wert', () => {
        const nachher = b().anwenden(ROHR, { hoehe: 301.0 }).nachher;
        expect(nachher.y).toBeCloseTo(-17.25, 6);      // unverändert
    });

    it('bleibt ohne Höhenbezug bei der Rohzahl — kein stiller Versatz', () => {
        const ohne = { ...ROHR, hoehenversatz: 0 };
        expect(b().vorbelegung(ohne).hoehe).toBeCloseTo(-17.4, 3);
        expect(b().anwenden(ohne, { hoehe: -16.4 }).nachher.y).toBeCloseTo(-16.25, 6);
    });
});

describe('Das Feld sagt, welche Höhe gemeint ist', () => {
    it('trägt die Einheit m NN, nicht m', async () => {
        // „Sohlhöhe [m]" liesse offen, worauf sie sich bezieht. Genau diese
        // Offenheit hat den Fehler unsichtbar gemacht.
        const { EINGEBAUTE_PROFILE, profilFuer } = await import('../services/bauform/Typprofile.js');
        const profil = profilFuer('IFCPIPESEGMENT', EINGEBAUTE_PROFILE);
        expect(profil.felder.sohlhoehe.einheit).toBe('m NN');
    });
});
