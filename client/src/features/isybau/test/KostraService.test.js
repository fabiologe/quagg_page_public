import { describe, it, expect } from 'vitest';
import { detectCRS } from '../utils/KostraService.js';

describe('detectCRS', () => {
    it('erkennt WGS84 (Lat/Lon)', () => {
        expect(detectCRS(7.77, 49.44)).toBe('EPSG:4326');
        expect(detectCRS(-122.4, 37.7)).toBe('EPSG:4326');
    });

    it('erkennt Gauss-Krüger Zonen anhand der führenden Ziffer', () => {
        expect(detectCRS(2579000, 5540000)).toBe('EPSG:31466'); // GK2
        expect(detectCRS(3456000, 5540000)).toBe('EPSG:31467'); // GK3
        expect(detectCRS(4456000, 5540000)).toBe('EPSG:31468'); // GK4
        expect(detectCRS(5456000, 5540000)).toBe('EPSG:31469'); // GK5
    });

    it('erkennt ETRS89/UTM32N am 8-stelligen Rechtswert', () => {
        expect(detectCRS(32456000, 5540000)).toBe('EPSG:25832');
    });

    it('fällt auf UTM32N zurück, wenn nichts eindeutig passt', () => {
        expect(detectCRS(999999999, 1)).toBe('EPSG:25832');
    });
});
