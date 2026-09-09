// Farbe und Transparenz der Erdbau-Elemente (2026-09-09).
//
// Drei Aussagen, die keine Geschmacksfrage sind:
//   1. Ein Aushub SCHEINT DURCH — er ist ein Void, und in ihm liegt das,
//      wofür er ausgehoben wurde. Ein Auftrag ist Material und deckt.
//   2. Keine Farbe ÜBERSTRAHLT unter der Hausbeleuchtung — eine geclippte
//      Fläche zeigt keine Neigung mehr, und Neigungen sind der Zweck.
//   3. Was der Planer selbst gefärbt hat, wird nicht übermalt.

import { describe, expect, it } from 'vitest';
import {
    BAUTEILFARBEN, CLIP_RESERVE, LICHT_MAX, eigeneFarbe, farbeFuer,
    kanaele, materialWerte, ueberstrahlt,
} from '../services/Bauteilfarben.js';
import { BELEUCHTUNG } from '../services/IfcBeleuchtung.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { erdbauRolle } from '../services/IfcEngine.js';

describe('der Katalog', () => {
    it('kennt Aushub, Auftrag und Gelände', () => {
        expect(farbeFuer('IFCEARTHWORKSCUT')).toBeTruthy();
        expect(farbeFuer('IFCEARTHWORKSFILL')).toBeTruthy();
        expect(farbeFuer('IFCGEOGRAPHICELEMENT')).toBeTruthy();
    });

    it('nimmt Kleinschreibung und Leerraum an', () => {
        expect(farbeFuer(' ifcearthworkscut ')).toBe(BAUTEILFARBEN.IFCEARTHWORKSCUT);
    });

    it('erfindet für Unbekanntes nichts', () => {
        expect(farbeFuer('IFCPIPESEGMENT')).toBeNull();
        expect(farbeFuer(null)).toBeNull();
        expect(materialWerte(null)).toBeNull();
    });

    it('ein Bürodatensatz schlägt den eingebauten', () => {
        const eigen = { IFCEARTHWORKSCUT: { farbe: 0x112233, deckkraft: 0.2 } };
        expect(farbeFuer('IFCEARTHWORKSCUT', eigen).farbe).toBe(0x112233);
    });
});

describe('Aushub scheint durch, Auftrag deckt', () => {
    it('der Aushub ist transparent — ein Void zeigt seinen Inhalt', () => {
        const m = materialWerte(farbeFuer('IFCEARTHWORKSCUT'));
        expect(m.transparent).toBe(true);
        expect(m.opacity).toBeGreaterThan(0.3);
        expect(m.opacity).toBeLessThan(0.8);
    });

    it('der Auftrag ist solide — er IST Material', () => {
        const m = materialWerte(farbeFuer('IFCEARTHWORKSFILL'));
        expect(m.transparent).toBe(false);
        expect(m.opacity).toBe(1);
    });

    it('das Gelände ist solide', () => {
        expect(materialWerte(farbeFuer('IFCGEOGRAPHICELEMENT')).transparent).toBe(false);
    });

    it('Deckkraft 1 meldet NICHT transparent — sonst kostet es Sortierung ohne Gewinn', () => {
        expect(materialWerte({ farbe: 0x808080, deckkraft: 1 }).transparent).toBe(false);
        expect(materialWerte({ farbe: 0x808080 }).transparent).toBe(false);
    });
});

describe('keine Farbe überstrahlt', () => {
    // Die Grenze ist gerechnet, nicht gefühlt: eine dem Hauptlicht
    // zugewandte Fläche bekommt Umgebung + Haupt + Himmel.
    it('LICHT_MAX deckt die Hausbeleuchtung ab', () => {
        const schlimmst = BELEUCHTUNG.umgebung + BELEUCHTUNG.haupt + BELEUCHTUNG.himmel;
        expect(LICHT_MAX).toBeGreaterThanOrEqual(schlimmst);
    });

    for (const [typ, eintrag] of Object.entries(BAUTEILFARBEN)) {
        it(`„${typ}" bleibt unter der Clipping-Grenze`, () => {
            expect(ueberstrahlt(eintrag)).toBe(false);
            const hell = Math.max(...kanaele(eintrag.farbe)) * LICHT_MAX;
            expect(hell).toBeLessThanOrEqual(CLIP_RESERVE);
        });
    }

    it('reines Weiss würde überstrahlen — der Wächter greift wirklich', () => {
        expect(ueberstrahlt({ farbe: 0xffffff, deckkraft: 1 })).toBe(true);
    });
});

describe('eigene Farbe des Planers', () => {
    const grau = { r: 0.6, g: 0.6, b: 0.6, a: 1 };
    const braun = { r: 0.55, g: 0.35, b: 0.15, a: 1 };

    it('neutrales Grau gilt NICHT als eigene Farbe', () => {
        const el = { samples: { 1: { material: 5 } }, materials: { 5: grau } };
        expect(eigeneFarbe(el).eigen).toBe(false);
    });

    it('ein bunter Anstrich gilt als eigene Farbe', () => {
        const el = { samples: { 1: { material: 5 } }, materials: { 5: braun } };
        expect(eigeneFarbe(el).eigen).toBe(true);
    });

    it('auch Teiltransparenz zählt als eigene Angabe', () => {
        const el = { samples: { 1: { material: 5 } }, materials: { 5: { ...grau, a: 0.4 } } };
        expect(eigeneFarbe(el).eigen).toBe(true);
    });

    it('mehrere Proben: EINE bunte genügt', () => {
        const el = {
            samples: { 1: { material: 5 }, 2: { material: 6 } },
            materials: { 5: grau, 6: braun },
        };
        expect(eigeneFarbe(el).eigen).toBe(true);
        expect(eigeneFarbe(el).farben).toHaveLength(2);
    });

    it('ohne Material: keine eigene Farbe, kein Wurf', () => {
        expect(eigeneFarbe({}).eigen).toBe(false);
        expect(eigeneFarbe(null).eigen).toBe(false);
    });

    it('ohne Proben zählen die Materialien des Elements', () => {
        expect(eigeneFarbe({ materials: { 7: braun } }).eigen).toBe(true);
    });
});

describe('die Verdrahtung', () => {
    // Der Autor baut das Material — nicht die Ansicht. Damit steht die Farbe
    // im Bauteil und überlebt den `.frag`-Export.
    const autor = new IfcAutor({});

    it('ein Aushub bekommt braunes, durchscheinendes Material', () => {
        const m = autor._materialFuer('IFCEARTHWORKSCUT');
        expect(m.color.getHex()).toBe(BAUTEILFARBEN.IFCEARTHWORKSCUT.farbe);
        expect(m.transparent).toBe(true);
        // Ein durchscheinendes Volumen darf nicht verdecken, was in ihm liegt.
        expect(m.depthWrite).toBe(false);
    });

    it('ein Auftrag bekommt solides Material, das Tiefe schreibt', () => {
        const m = autor._materialFuer('IFCEARTHWORKSFILL');
        expect(m.transparent).toBe(false);
        expect(m.depthWrite).toBe(true);
    });

    it('ein unbekannter Typ behält den Standard der Bibliothek', () => {
        const m = autor._materialFuer('IFCPIPESEGMENT');
        expect(m.transparent).toBe(false);
        expect(m.color.getHex()).toBe(0xffffff);
    });

    it('ein Bürodatensatz schlägt den eingebauten', () => {
        const a = new IfcAutor({});
        a.setzeFarbsatz({ IFCEARTHWORKSCUT: { farbe: 0x102030, deckkraft: 1 } });
        expect(a._materialFuer('IFCEARTHWORKSCUT').color.getHex()).toBe(0x102030);
    });

    it('für jeden Katalogeintrag gibt es eine Färbe-Rolle in der Engine', () => {
        // Der Färbe-Stapel ist der EINE Weg — die Rollen kommen aus dem
        // Katalog, damit kein zweiter Weg mit eigenem Stil entsteht.
        for (const typ of Object.keys(BAUTEILFARBEN)) {
            expect(erdbauRolle(typ)).toBe(`erdbau:${typ}`);
        }
    });
});
