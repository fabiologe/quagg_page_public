// Farbe und Transparenz der Erdbau-Elemente (2026-09-09).
//
// Drei Aussagen, die keine Geschmacksfrage sind:
//   1. Ein Aushub SCHEINT DURCH — er ist ein Void, und in ihm liegt das,
//      wofür er ausgehoben wurde. Ein Auftrag ist Material und deckt.
//   2. Keine Farbe ÜBERSTRAHLT unter der Hausbeleuchtung — eine geclippte
//      Fläche zeigt keine Neigung mehr, und Neigungen sind der Zweck.
//   3. Was der Planer selbst gefärbt hat, wird nicht übermalt.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    BAUTEILFARBEN, CLIP_RESERVE, LICHT_MAX, eigeneFarbe, farbeFuer,
    kanaele, materialWerte, ueberstrahlt,
} from '../services/Bauteilfarben.js';
import { BELEUCHTUNG } from '../services/IfcBeleuchtung.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { erdbauRolle, faerbeStilFuer } from '../services/IfcEngine.js';
import { FAERBE_FARBEN, FAERBE_ROLLEN } from '../services/Vorschau.js';
import { AUSWAHL_FARBE } from '../services/GelaendeKanten.js';

describe('der Katalog', () => {
    it('kennt Aushub, Auftrag und Gelände', () => {
        expect(farbeFuer('IFCEARTHWORKSCUT')).toBeTruthy();
        expect(farbeFuer('IFCEARTHWORKSFILL')).toBeTruthy();
        expect(farbeFuer('IFCGEOGRAPHICELEMENT')).toBeTruthy();
    });

    it('nimmt Kleinschreibung und Leerraum an', () => {
        expect(farbeFuer(' ifcearthworkscut ')).toBe(BAUTEILFARBEN.IFCEARTHWORKSCUT);
    });

    it('das Gelände ist leichtes Beige — Braun trägt nur der Aushub (Abnahme 2026-09-12, P4 und K4)', () => {
        // Die Grösse, an der Fabio es sah: der Farbstich. P4: warmes Hellbeige
        // (Spanne 0,086) las sich unter dem Hauptlicht als braunes Gelände —
        // danach Grau. K4: „reicht nicht das leichte Beige?" — ein Hauch Wärme,
        // gut halb so viel Stich wie vor P4.
        const spanne = (k) => { const c = kanaele(farbeFuer(k).farbe); return Math.max(...c) - Math.min(...c); };
        expect(spanne('IFCGEOGRAPHICELEMENT')).toBeGreaterThan(0.03);        // Grau (P4) war 0,016
        expect(spanne('IFCGEOGRAPHICELEMENT')).toBeLessThan(0.06);           // vor P4 0,086
        expect(spanne('IFCEARTHWORKSELEMENT')).toBeLessThan(0.06);
        expect(spanne('IFCEARTHWORKSCUT')).toBeGreaterThan(0.2);             // der Aushub bleibt braun
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

describe('Die Erdkörper scheinen durch, das Gelände gewinnt', () => {
    it('der Aushub ist transparent — ein Void zeigt seinen Inhalt', () => {
        const m = materialWerte(farbeFuer('IFCEARTHWORKSCUT'));
        expect(m.transparent).toBe(true);
        expect(m.opacity).toBeGreaterThan(0.3);
        expect(m.opacity).toBeLessThan(0.8);
    });

    it('der Auftrag ebenso (E2, 2026-09-17) — sein Deckel IST die Geländeanzeige', () => {
        // Fachlich ist er Material; im Bild verdeckt er aber nicht Erde, sondern
        // die Fläche, die ihn beschreibt — zwei deckende Flächen am selben Ort
        // flimmern. Deshalb dieselbe Deckkraft wie der Aushub.
        const m = materialWerte(farbeFuer('IFCEARTHWORKSFILL'));
        expect(m.transparent).toBe(true);
        expect(m.opacity).toBe(materialWerte(farbeFuer('IFCEARTHWORKSCUT')).opacity);
    });

    it('das Gelände ist solide und schreibt Tiefe — es trägt das Bild', () => {
        const m = materialWerte(farbeFuer('IFCGEOGRAPHICELEMENT'));
        expect(m.transparent).toBe(false);
        expect(m.depthWrite).toBe(true);
    });

    it('`depthWrite` folgt der Deckkraft — an EINER Stelle, für Material und Färbe-Stapel', () => {
        expect(materialWerte({ farbe: 0x808080, deckkraft: 1 }).depthWrite).toBe(true);
        expect(materialWerte({ farbe: 0x808080, deckkraft: 0.55 }).depthWrite).toBe(false);
        // Ein durchscheinendes Volumen, das Tiefe schreibt, verdeckt seinen Inhalt.
        for (const typ of ['IFCEARTHWORKSCUT', 'IFCEARTHWORKSFILL']) {
            const stil = faerbeStilFuer(erdbauRolle(typ));
            const m = materialWerte(farbeFuer(typ));
            expect({ typ, o: stil.opacity, t: stil.transparent, d: stil.depthWrite })
                .toEqual({ typ, o: m.opacity, t: m.transparent, d: m.depthWrite });
        }
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

    it('ein Auftrag bekommt durchscheinendes Material ohne Tiefe (E2) — das Gelände gewinnt', () => {
        const m = autor._materialFuer('IFCEARTHWORKSFILL');
        expect(m.transparent).toBe(true);
        expect(m.depthWrite).toBe(false);
        // Das Gelände selbst bleibt solide und schreibt Tiefe.
        const g = autor._materialFuer('IFCGEOGRAPHICELEMENT');
        expect({ t: g.transparent, d: g.depthWrite }).toEqual({ t: false, d: true });
    });

    // Abnahme 2026-09-12 (K4): der Editor speichert `255 · color.r` und liest es als sRGB
    // zurück. Gemessen in 42069: Geländekopie 5e5a50 statt a4a198, Aushub 402a0f statt 8a7145.
    it('der Editor bekommt die Farbe in sRGB — so kommt der Katalogton im Bild an', () => {
        const byte = (m) => [m.color.r, m.color.g, m.color.b].map(x => Math.round(255 * x));   // wie `createMaterial`
        expect(byte(autor._fuerEditor(autor._materialFuer('IFCGEOGRAPHICELEMENT')))).toEqual([0xa4, 0xa1, 0x98]);
        const aushub = autor._fuerEditor(autor._materialFuer('IFCEARTHWORKSCUT'));
        expect(byte(aushub)).toEqual([0x8a, 0x71, 0x45]);
        expect(aushub.transparent).toBe(true);                                          // alles andere bleibt
        expect(autor._materialFuer('IFCGEOGRAPHICELEMENT').color.getHex()).toBe(0xa4a198);  // das Original unberührt
    });

    it('jeder Auftrag an den Editor geht durch diese Umrechnung', () => {
        const quelle = readFileSync(new URL('../services/IfcAutor.js', import.meta.url), 'utf8');
        expect(quelle).toContain('material: this._fuerEditor(bauteil.material ?? this._materialFuer(bauteil.kategorie))');
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

describe('eine Rolle, eine Farbe (2026-09-17)', () => {
    /**
     * Gemessen in three r181 mit ColorManagement: ein Float-Tripel gilt als
     * LINEAR. `new THREE.Color(0.31, 0.76, 0.97)` — aus `#4fc3f7` gerechnet —
     * erschien deshalb als `#97e2fc`, während der Geist derselben Bearbeitung
     * mit `#4fc3f7` gezeichnet wurde. Gemessen wird hier dieselbe Grösse wie
     * im Bild: die sRGB-Darstellung der Farbe.
     */
    it('die Färbe-Rollen der Engine zeigen genau die Farbe, die der Geist zeichnet', () => {
        for (const rolle of FAERBE_ROLLEN) {
            const stil = faerbeStilFuer(rolle);
            expect(`#${stil.color.getHexString()}`, rolle).toBe(FAERBE_FARBEN[rolle]);
        }
        expect(FAERBE_FARBEN.kandidat).toBe(AUSWAHL_FARBE);          // Akzent von Geist, Zeiger und Kanten
    });

    it('kein Float-Tripel mehr im Färbe-Stapel — sonst kommt die Gammastufe zurück', () => {
        const quelle = readFileSync(new URL('../services/IfcEngine.js', import.meta.url), 'utf8');
        const stapel = quelle.slice(quelle.indexOf('const FAERBE_STILE'), quelle.indexOf('const VORSCHAU_RANG'));
        expect(stapel).not.toMatch(/new THREE\.Color\(\s*[01]?\.\d/);
    });

    it('der Erdbau-Katalog ging diesen Weg immer — Hex hinein, Hex heraus', () => {
        const stil = faerbeStilFuer(erdbauRolle('IFCEARTHWORKSCUT'));
        expect(`#${stil.color.getHexString()}`).toBe(`#${BAUTEILFARBEN.IFCEARTHWORKSCUT.farbe.toString(16)}`);
    });
});
