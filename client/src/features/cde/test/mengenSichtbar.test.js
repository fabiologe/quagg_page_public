/**
 * Die m³ werden sichtbar (Teil XX, Fabio 2026-09-10: „es fehlen nur die
 * Volumen in m³"): nach dem Übernehmen in der Kontextleiste, am Cut/Fill im
 * Eigenschaftsfenster — mit DENSELBEN Kennzahlen wie Mengen-Reiter und
 * IFC-Qto. Eine zweite Rechnung gäbe irgendwann eine zweite Zahl.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { m3, mengenZeile, erdbauAbleitungenAus } from '../services/Mengenzeile.js';

const lies = (p) => readFileSync(resolve(process.cwd(), 'src/features/cde', p), 'utf8');

describe('Die Mengenzeile', () => {
    it('deutsch: ab 10 m³ ganze Zahlen, darunter eine Stelle', () => {
        expect(m3(1240.4)).toBe('1.240 m³');
        expect(m3(4.46)).toBe('4,5 m³');
    });

    it('Aushub und Auftrag, beim Kanalgraben die Verfüllung statt des Auftrags', () => {
        expect(mengenZeile([{ aushubRaster: 1240, auftragRaster: 80 }])).toBe('Aushub 1.240 m³ · Auftrag 80 m³');
        expect(mengenZeile([{ aushubRaster: 97, auftragRaster: 0, verfuellung: 60 }])).toBe('Aushub 97 m³ · Verfüllung 60 m³');
        expect(mengenZeile([{ aushubRaster: 0.01, auftragRaster: 0 }])).toBe('keine Erdmassen');
        expect(mengenZeile([null])).toBe('');                  // nicht gebaut: nichts behaupten
    });

    it('nur die Erdbau-Vorgänge der geschriebenen Einträge zählen — die Anzeige nicht', () => {
        const e = [
            { art: 'geloescht', globalId: 'DGM1' },
            { art: 'erzeugt', nachher: { rezept: 'anzeige', ableitung: 'ab-a' } },
            { art: 'erzeugt', nachher: { rezept: 'erdbau', ableitung: 'ab-1' } },
            { art: 'erzeugt', nachher: { rezept: 'erdbau', ableitung: 'ab-1' } },
        ];
        expect(erdbauAbleitungenAus(e, (r) => r === 'erdbau')).toEqual(['ab-1']);
        expect(erdbauAbleitungenAus(e[2], (r) => r === 'erdbau')).toEqual(['ab-1']);   // ein einzelner Eintrag
    });
});

describe('Wächter: die m³ stehen nach dem Übernehmen und am Cut/Fill', () => {
    it('beide Übernehmen-Wege hängen die Mengen an; das Eigenschaftsfenster liest mengenVon über kennzahlenVon', () => {
        const v = lies('components/IfcViewer.vue');
        expect((v.match(/_mitMengen\(/g) ?? []).length).toBeGreaterThanOrEqual(3);   // Definition + Motor + Formular
        expect(v).toMatch(/kennzahlenVon:/);
        const w = lies('components/IfcSemanticWindow.vue');
        expect(w).toMatch(/mengenVon\(plan, k\)/);
        expect(w).toMatch(/api\.kennzahlenVon/);
    });
});
