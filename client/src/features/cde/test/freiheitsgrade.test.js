/**
 * Freiheitsgrade beim Ziehen (Stufe 9.3) — der Zahltag der Bauform-Schicht.
 *
 * Der Zwang kommt aus der BAUFORM, nicht aus dem IFC-Typ. „Entlang der Achse"
 * gilt damit für Rohr, Kanal, Bordstein — und für den Typ, den noch niemand
 * gesehen hat. Genau dafür wurde die Schicht gebaut, und hier zahlt sie.
 *
 * Der zweite Teil ist wichtiger als der erste: eine aus dem Netz GESCHÄTZTE
 * Achse taugt zum Anzeigen, aber nicht als Richtung, entlang der man ein
 * Bauteil verschiebt und das Ergebnis festschreibt. Wer auf schlechten Daten
 * zieht, bekommt ein Ergebnis, das genauso aussieht wie ein gutes — und das ist
 * schlimmer, als gar nicht ziehen zu können.
 */
import { describe, expect, it } from 'vitest';
import { BAUFORMEN } from '../services/bauform/Bauformen.js';
import {
    RASTER_M, darfZiehen, freiheitsgradeFuer, grundOhneZiehen,
} from '../services/Freiheitsgrade.js';

const gemessen = (bauform) => ({ bauform, guete: 'gemessen' });

describe('freiheitsgradeFuer', () => {
    it('lässt ein lineares Bauteil ENTLANG seiner Achse und in der Höhe', () => {
        const fg = freiheitsgradeFuer(gemessen('achse+profil'));
        expect(fg).toMatchObject({ x: true, y: true, z: false, space: 'local' });
    });

    it('arbeitet dafür im LOKALEN Raum — dort ist X die Bauteilachse', () => {
        // Im Weltraum wäre X eine Himmelsrichtung und hätte mit dem Rohr
        // nichts zu tun.
        expect(freiheitsgradeFuer(gemessen('achse+profil')).space).toBe('local');
        expect(freiheitsgradeFuer(gemessen('koerper')).space).toBe('world');
    });

    it('lässt einen Schacht im Grundriss UND in der Höhe', () => {
        expect(freiheitsgradeFuer(gemessen('koerper'))).toMatchObject({ x: true, y: true, z: true });
    });

    it('hält eine Wand in der Höhe fest — die kommt vom Geschoss', () => {
        expect(freiheitsgradeFuer(gemessen('flaeche+dicke'))).toMatchObject({ x: true, y: false, z: true });
    });

    it('lässt Gelände gar nicht ziehen — es wird geformt', () => {
        expect(freiheitsgradeFuer(gemessen('hoehenfeld'))).toBe(null);
    });

    it('lässt Linien und Flächen nicht als Ganzes ziehen', () => {
        // Sie werden an den Stützpunkten bearbeitet — eigenes Werkzeug (9.4).
        expect(freiheitsgradeFuer(gemessen('linie'))).toBe(null);
        expect(freiheitsgradeFuer(gemessen('flaeche'))).toBe(null);
    });

    it('bietet für Freiform keinen Zwang an, den man rechtfertigen könnte', () => {
        expect(freiheitsgradeFuer(gemessen('netz'))).toBe(null);
        expect(freiheitsgradeFuer(null)).toBe(null);
    });

    it('fängt auf ein Rastermass, statt frei laufen zu lassen', () => {
        expect(freiheitsgradeFuer(gemessen('koerper')).raster).toBe(RASTER_M);
        expect(RASTER_M).toBeGreaterThan(0);
    });

    it('kennt jede Bauform — auch die, die nicht ziehbar sind', () => {
        // Sonst fiele eine neue Bauform still in den Vorgabezweig und wäre
        // nicht ziehbar, ohne dass jemand es entschieden hätte.
        for (const bauform of Object.keys(BAUFORMEN)) {
            const fg = freiheitsgradeFuer(gemessen(bauform));
            expect(fg === null || typeof fg.space === 'string', bauform).toBe(true);
        }
    });
});

describe('darfZiehen — die Güte zählt mit', () => {
    it('lässt an einer GEMESSENEN Achse ziehen', () => {
        expect(darfZiehen({ bauform: 'achse+profil', guete: 'gemessen' })).toBe(true);
    });

    it('VERWEIGERT an einer geschätzten Achse', () => {
        // Eine Skelettachse bekommt man auch aus einem Würfel. Entlang ihr zu
        // verschieben und das festzuschreiben wäre geraten — und sähe aus wie
        // gemessen.
        expect(darfZiehen({ bauform: 'achse+profil', guete: 'geschaetzt' })).toBe(false);
        expect(darfZiehen({ bauform: 'achse+profil', guete: 'unbekannt' })).toBe(false);
    });

    it('ist bei einem Körper nicht so streng — seine Hülle ist die Hülle', () => {
        // Der Anker eines Körpers ist die Mitte seiner Hülle. Die ist nicht
        // geschätzt, sie ist gemessen — egal wie gut das Bauteil modelliert ist.
        expect(darfZiehen({ bauform: 'koerper', guete: 'geschaetzt' })).toBe(true);
    });
});

describe('grundOhneZiehen — „geht nicht" ohne Grund ist die schlechteste Antwort', () => {
    it('schweigt, wenn es geht', () => {
        expect(grundOhneZiehen(gemessen('koerper'))).toBe('');
    });

    it('nennt bei geschätzter Achse genau das', () => {
        expect(grundOhneZiehen({ bauform: 'achse+profil', guete: 'geschaetzt' })).toMatch(/geschätzt/);
    });

    it('erklärt Gelände und Linien', () => {
        expect(grundOhneZiehen(gemessen('hoehenfeld'))).toMatch(/geformt/);
        expect(grundOhneZiehen(gemessen('linie'))).toMatch(/Stützpunkten/);
    });

    it('gibt auch für Unbekanntes einen Satz, nicht nur ein Nein', () => {
        expect(grundOhneZiehen(gemessen('netz'))).toBeTruthy();
        expect(grundOhneZiehen(null)).toBeTruthy();
    });
});
