/**
 * Fanglinien für den Schacht-Griff (G1, 2026-09-02).
 *
 * Der Dienst ist rein und wird rein geprüft: bekannte Geometrien, erwartete
 * Fangpunkte. Der wichtigste Fall ist die STÄRKEN-ORDNUNG — zwei Linien
 * (Eckfang) schlagen eine Linie, eine Linie schlägt das Raster, und das
 * Raster wirkt immer, wenn nichts anderes greift. Ohne diese Ordnung springt
 * der Griff beim Ziehen zwischen den Fängen hin und her.
 */
import { describe, expect, it } from 'vitest';
import {
    fanglinienFuer, fange, abstandZurLinie, fusspunkt, schnittpunkt,
    rasterFuerMassstab,
} from '../services/Fanglinien.js';

describe('fanglinienFuer', () => {
    it('baut je Anschluss Verlängerung UND Querlinie, je Nachbar zwei Fluchten', () => {
        const linien = fanglinienFuer({
            ausgang: { ost: 10, nord: 0 },
            anschluesse: [{ globalId: 'H1', name: 'H-001', fern: { ost: 0, nord: 0 } }],
            nachbarn: [{ globalId: 'S7', name: 'S7', ost: 20, nord: 8 }],
        });
        expect(linien.map(l => l.art).sort()).toEqual(['flucht', 'flucht', 'quer', 'verlaengerung']);

        const v = linien.find(l => l.art === 'verlaengerung');
        // durch das FERNE Ende, Richtung zum Ausgang
        expect(v.punkt).toEqual({ ost: 0, nord: 0 });
        expect(v.richtung).toEqual({ ost: 1, nord: 0 });

        const q = linien.find(l => l.art === 'quer');
        // durch den AUSGANG, rechtwinklig zur Haltung
        expect(q.punkt).toEqual({ ost: 10, nord: 0 });
        expect(Math.abs(q.richtung.nord)).toBe(1);
    });

    it('eine Haltung ohne Länge (fern == ausgang) liefert KEINE Führung', () => {
        const linien = fanglinienFuer({
            ausgang: { ost: 5, nord: 5 },
            anschluesse: [{ globalId: 'H1', fern: { ost: 5, nord: 5 } }],
        });
        expect(linien).toEqual([]);
    });
});

describe('fange', () => {
    const verlaengerung = { art: 'verlaengerung', name: 'H-001', punkt: { ost: 0, nord: 0 }, richtung: { ost: 1, nord: 0 } };
    const flucht = { art: 'flucht', name: 'S7', punkt: { ost: 20, nord: 8 }, richtung: { ost: 0, nord: 1 } };

    it('eine Linie in Reichweite: der Punkt fällt aufs Lot', () => {
        const r = fange({ punkt: { ost: 15.3, nord: 0.4 }, linien: [verlaengerung], radius: 1 });
        expect(r.punkt).toEqual({ ost: 15.3, nord: 0 });
        expect(r.aktiv.map(l => l.art)).toEqual(['verlaengerung']);
    });

    it('ZWEI nicht-parallele Linien: Eckfang am Schnittpunkt', () => {
        // Verlängerung (nord = 0) × Rechtswert-Flucht (ost = 20) schneiden
        // sich in (20, 0); der Kandidat liegt nahe genug an beiden.
        const r = fange({ punkt: { ost: 19.6, nord: 0.5 }, linien: [verlaengerung, flucht], radius: 1 });
        expect(r.punkt.ost).toBeCloseTo(20, 9);
        expect(r.punkt.nord).toBeCloseTo(0, 9);
        expect(r.aktiv).toHaveLength(2);
    });

    it('der AUSGANG ist keine Ecke: ein Griff, der ihn verlässt, fällt nicht auf ihn zurück', () => {
        // Quer- und Verlängerungslinie schneiden sich im Ausgang (0/0). Ohne
        // `meide` sprang jeder Zug unter 1,5 × Radius auf null zurück.
        const quer = { art: 'quer', name: 'S7', punkt: { ost: 0, nord: 0 }, richtung: { ost: 0, nord: 1 } };
        const laengs = { art: 'verlaengerung', name: 'H1', punkt: { ost: 0, nord: 0 }, richtung: { ost: 1, nord: 0 } };
        const ohne = fange({ punkt: { ost: 0.3, nord: 0.2 }, linien: [quer, laengs], radius: 0.6 });
        expect(ohne.punkt).toEqual({ ost: 0, nord: 0 });
        const mit = fange({ punkt: { ost: 0.3, nord: 0.2 }, linien: [quer, laengs], radius: 0.6, meide: { ost: 0, nord: 0 } });
        expect(mit.punkt).not.toEqual({ ost: 0, nord: 0 });
        expect(mit.aktiv).toHaveLength(1);                      // aufs Lot der näheren Linie
        // Eine ECHTE Ecke abseits des Ausgangs fängt weiter.
        const flucht = { art: 'flucht', name: 'S9', punkt: { ost: 5, nord: 0 }, richtung: { ost: 0, nord: 1 } };
        const ecke = fange({ punkt: { ost: 4.8, nord: 0.1 }, linien: [laengs, flucht], radius: 0.6, meide: { ost: 0, nord: 0 } });
        expect(ecke.punkt).toEqual({ ost: 5, nord: 0 });
    });

    it('ein FERNER Schnittpunkt zieht den Griff nicht übers Blatt', () => {
        // Beide Linien in Reichweite, aber der Schnitt liegt weit weg:
        // fast parallele Linien im engen Winkel. Es gilt die nächste Linie.
        const fastParallel = { art: 'flucht', name: 'S9', punkt: { ost: 0, nord: 0.4 }, richtung: { ost: 0.9999, nord: 0.0141 } };
        const r = fange({ punkt: { ost: 15, nord: 0.3 }, linien: [verlaengerung, fastParallel], radius: 1 });
        expect(r.aktiv).toHaveLength(1);
        expect(r.punkt.nord).toBeCloseTo(0, 9);
    });

    it('keine Linie in Reichweite: das Raster rundet — die schwächste Stufe', () => {
        const r = fange({ punkt: { ost: 7.26, nord: 3.61 }, linien: [verlaengerung], radius: 1, raster: 0.5 });
        expect(r.punkt).toEqual({ ost: 7.5, nord: 3.5 });
        expect(r.aktiv.map(l => l.art)).toEqual(['raster']);
    });

    it('Raster 0 heißt aus: der Punkt bleibt, wo er ist', () => {
        const r = fange({ punkt: { ost: 7.26, nord: 3.61 }, linien: [], radius: 1, raster: 0 });
        expect(r.punkt).toEqual({ ost: 7.26, nord: 3.61 });
        expect(r.aktiv).toEqual([]);
    });

    it('Linien SCHLAGEN das Raster — auch wenn beide greifen würden', () => {
        const r = fange({ punkt: { ost: 15.3, nord: 0.4 }, linien: [verlaengerung], radius: 1, raster: 0.5 });
        expect(r.punkt.nord).toBe(0);
        expect(r.punkt.ost).toBe(15.3);   // NICHT auf 15.5 gerundet
        expect(r.aktiv.map(l => l.art)).toEqual(['verlaengerung']);
    });
});

describe('die Geometrie-Helfer', () => {
    it('Abstand, Lot und Schnitt rechnen konsistent', () => {
        const g = { punkt: { ost: 0, nord: 0 }, richtung: { ost: 0.6, nord: 0.8 } };
        const p = { ost: -4, nord: 3 };
        const fuss = fusspunkt(p, g);
        expect(abstandZurLinie(p, g)).toBeCloseTo(Math.hypot(p.ost - fuss.ost, p.nord - fuss.nord), 9);
        expect(abstandZurLinie(fuss, g)).toBeCloseTo(0, 9);

        const h = { punkt: { ost: 10, nord: -10 }, richtung: { ost: 0, nord: 1 } };
        const s = schnittpunkt(g, h);
        expect(s.ost).toBeCloseTo(10, 9);
        expect(s.nord).toBeCloseTo(10 * 0.8 / 0.6, 6);
        // parallel → null, nicht NaN
        expect(schnittpunkt(g, { punkt: { ost: 1, nord: 1 }, richtung: { ost: 0.6, nord: 0.8 } })).toBeNull();
    });
});

describe('rasterFuerMassstab', () => {
    it('liefert runde Stufen: 1:250 → 0,5 m · 1:500 → 1 m · 1:1000 → 2 m', () => {
        expect(rasterFuerMassstab(250)).toBe(0.5);
        expect(rasterFuerMassstab(500)).toBe(1);
        expect(rasterFuerMassstab(1000)).toBe(2);
        expect(rasterFuerMassstab(undefined)).toBe(1);
    });
});
