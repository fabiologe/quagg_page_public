// @vitest-environment jsdom
/**
 * Rahmen-Nachführung des Journals (Lücke ⑤ / Stufe 13.4, 2026-09-02).
 *
 * Die JOURNAL_WARNUNG aus Hoehenbezug.js wird hier zur Mechanik: alle
 * Punktwerte hängen am Ladeversatz des ersten Modells, und eine neue
 * Revision kann ihn verschieben (anderes Bounding-Box-Minimum). Die Nutzlast
 * trägt deshalb den Rahmen (`versatzMerker`); beim Laden mit anderem Rahmen
 * werden die Punktfelder um das Delta gehoben — synchron, VOR dem
 * Nachspielen, und genau einmal (idempotent).
 *
 * Wichtigste Absicherungen:
 *  - WELCHE Felder Punkte sind, deklariert die Quelle (lage-Felder hier,
 *    Bauplan-Parameter am REZEPT) — der Wächter unten fällt, sobald ein
 *    neues Rezept ohne `verschiebe`-Deklaration entsteht.
 *  - Gelände-Sohlen sind m NN und hängen NICHT am Rahmen — sie dürfen beim
 *    Heben NICHT mitwandern.
 *  - Ohne Merker wird NICHT geraten: warnen, ab jetzt stempeln.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
    verschiebeEintrag, verschiebePunkt, deltaZwischen, nennenswert,
    rezepteOhneVerschiebe, rezepteOhneDeklaration,
} from '../services/JournalVersatz.js';
import { useAenderungen } from '../stores/useAenderungen.js';

const DELTA = { x: 10, y: -2, z: 5 };
const SCHLUESSEL = 'ifc-repo:global:aenderungen';

describe('verschiebeEintrag (rein)', () => {
    it('lage: nachher, vorher und basis wandern — alles andere bleibt', () => {
        const e = {
            id: 'e1', art: 'lage', globalId: 'G',
            nachher: { x: 1, y: 2, z: 3 }, vorher: { x: 0, y: 0, z: 0 },
            basis: { x: 4, y: 5, z: 6 }, wer: 'fabio',
        };
        const n = verschiebeEintrag(e, DELTA);
        expect(n.nachher).toEqual({ x: 11, y: 0, z: 8 });
        expect(n.vorher).toEqual({ x: 10, y: -2, z: 5 });
        expect(n.basis).toEqual({ x: 14, y: 3, z: 11 });
        expect(n.wer).toBe('fabio');
        expect(e.nachher).toEqual({ x: 1, y: 2, z: 3 });   // Original unberührt
    });

    it('erzeugt: die Bauplan-Punkte wandern über die Rezept-Deklaration', () => {
        const e = {
            art: 'erzeugt', globalId: 'cde-1',
            nachher: { rezept: 'rohr', parameter: { punkte: [[0, 1, 2], [3, 4, 5]], dn: 300 } },
        };
        const n = verschiebeEintrag(e, DELTA);
        expect(n.nachher.parameter.punkte).toEqual([[10, -1, 7], [13, 2, 10]]);
        expect(n.nachher.parameter.dn).toBe(300);
    });

    it('gelaende: Achse und Umriss wandern im Grundriss — die NN-Sohle NICHT', () => {
        const e = {
            art: 'erzeugt', globalId: 'cde-g',
            nachher: {
                rezept: 'gelaende',
                parameter: {
                    quelle: 'G0',
                    operationen: [
                        { art: 'gerinne', parameter: {
                            achse: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
                            sohleAnfang: 301.5, sohleEnde: 300.9, sohlbreite: 1 } },
                        { art: 'planum', parameter: {
                            umriss: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }], hoehe: 305 } },
                    ],
                },
            },
        };
        const n = verschiebeEintrag(e, DELTA);
        const [gerinne, planum] = n.nachher.parameter.operationen;
        expect(gerinne.parameter.achse).toEqual([{ x: 10, z: 5 }, { x: 20, z: 5 }]);
        expect(gerinne.parameter.sohleAnfang).toBe(301.5);
        expect(planum.parameter.umriss[2]).toEqual({ x: 15, z: 10 });
        expect(planum.parameter.hoehe).toBe(305);
    });

    it('der Bezug wandert mit (zielBasis) — punktlose Arten bleiben DERSELBE Verweis', () => {
        const mitBezug = { art: 'lage', globalId: 'G', nachher: { x: 0, y: 0, z: 0 },
            bezug: { art: 'anschluss', ziel: 'S1', zielBasis: { x: 1, y: 1, z: 1 }, ende: 'a' } };
        const n = verschiebeEintrag(mitBezug, DELTA);
        expect(n.bezug.zielBasis).toEqual({ x: 11, y: -1, z: 6 });
        expect(n.bezug.ziel).toBe('S1');

        const kg = { art: 'kg', globalId: 'G', nachher: '410' };
        expect(verschiebeEintrag(kg, DELTA)).toBe(kg);

        // Eine Bauform-AUSLEGUNG trägt keinen Punkt und darf deshalb keine
        // Deklarationspflicht auslösen — `toBe`, nicht `toEqual`: es muss
        // DASSELBE Objekt zurückkommen, nicht ein gleich aussehendes.
        const auslegung = { art: 'bauform', globalId: 'ERD1', nachher: 'hoehenfeld' };
        expect(verschiebeEintrag(auslegung, DELTA)).toBe(auslegung);
    });

    it('WÄCHTER: jedes Rezept UND jede Ableitung deklariert verschiebe, fachmodell und beschreibe', () => {
        expect(rezepteOhneVerschiebe()).toEqual([]);
        expect(rezepteOhneDeklaration('fachmodell')).toEqual([]);
        // `beschreibe` ist nur bei Ableitungen Pflicht — die Rezepte beschreibt beschreibeWert über die Punkte.
        expect(rezepteOhneDeklaration('beschreibe')).not.toContain('erdbau');
    });

    it('erdbau: Achse und Umriss der Operationen wandern, NN-Sohlen und Prüfmass nicht', () => {
        const e = {
            art: 'erzeugt', globalId: 'cde-a',
            nachher: { rezept: 'erdbau', rolle: 'aushub', ableitung: 'ab-1', parameter: {
                quellen: { gelaende: 'DGM1' }, quellBasis: { gelaende: { triCount: 5, spanX: 1, spanY: 1, spanZ: 1 } },
                raster: { cell: 0.5 },
                operationen: [{ art: 'gerinne', parameter: { achse: [{ x: 0, z: 0 }], sohleAnfang: 301.5 } }],
            } },
        };
        const n = verschiebeEintrag(e, DELTA);
        expect(n.nachher.parameter.operationen[0].parameter.achse).toEqual([{ x: 10, z: 5 }]);
        expect(n.nachher.parameter.operationen[0].parameter.sohleAnfang).toBe(301.5);
        expect(n.nachher.parameter.quellBasis).toEqual(e.nachher.parameter.quellBasis);
        expect(n.nachher.parameter.raster.cell).toBe(0.5);
    });

    it('die Helfer rechnen sauber', () => {
        expect(verschiebePunkt({ x: 1, y: 2, z: 3 }, DELTA)).toEqual({ x: 11, y: 0, z: 8 });
        expect(deltaZwischen({ x: 5, y: 5, z: 5 }, { x: 2, y: 2, z: 2 })).toEqual({ x: 3, y: 3, z: 3 });
        expect(nennenswert({ x: 0, y: 0, z: 0 })).toBe(false);
        expect(nennenswert({ x: 0.001, y: 0, z: 0 })).toBe(true);
    });
});

describe('setzeWeltversatz am Store', () => {
    beforeEach(() => {
        localStorage.clear();
        setActivePinia(createPinia());
    });

    function nutzlast(merker) {
        return {
            version: 2,
            commits: [{
                id: 'c1', nachricht: 'Test', wer: 'fabio', wann: 1, modellSha: 'a',
                schritte: [{ id: 'e1', art: 'lage', globalId: 'G',
                    nachher: { x: 1, y: 2, z: 3 }, basis: { x: 0, y: 0, z: 0 }, vorher: null }],
            }],
            sitzung: null,
            ...(merker ? { versatzMerker: merker } : {}),
        };
    }

    it('anderer Rahmen beim Laden: die Punkte werden gehoben und neu gestempelt', async () => {
        localStorage.setItem(SCHLUESSEL, JSON.stringify(nutzlast({ x: 100, y: 0, z: 50, form: 2 })));
        const ae = useAenderungen();
        await ae.bereit;
        // Revision B lädt mit anderem Koordinationspunkt: Rahmen 90/0/45.
        ae.setzeWeltversatz({ x: 90, y: 0, z: 45 });
        // Δ = alt − neu = +10/+0/+5 — SYNCHRON, vor dem Nachspielen lesbar.
        expect(new Map(ae.wirksamerStand('lage')).get('G')).toEqual({ x: 11, y: 2, z: 8 });
        // Die Neusicherung stempelt den neuen Rahmen.
        await new Promise(r => setTimeout(r, 0));
        const s = JSON.parse(localStorage.getItem(SCHLUESSEL));
        expect(s.versatzMerker).toEqual({ x: 90, y: 0, z: 45, form: 2 });
        expect(s.commits[0].schritte[0].nachher).toEqual({ x: 11, y: 2, z: 8 });
    });

    it('gleicher Rahmen: nichts bewegt sich — und zweimal melden hebt nicht doppelt', async () => {
        localStorage.setItem(SCHLUESSEL, JSON.stringify(nutzlast({ x: 100, y: 0, z: 50, form: 2 })));
        const ae = useAenderungen();
        await ae.bereit;
        ae.setzeWeltversatz({ x: 90, y: 0, z: 45 });
        ae.setzeWeltversatz({ x: 90, y: 0, z: 45 });
        expect(new Map(ae.wirksamerStand('lage')).get('G')).toEqual({ x: 11, y: 2, z: 8 });
    });

    it('ohne Merker wird NICHT geraten: warnen, Werte stehen lassen, ab jetzt stempeln', async () => {
        const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
        localStorage.setItem(SCHLUESSEL, JSON.stringify(nutzlast(null)));
        const ae = useAenderungen();
        await ae.bereit;
        ae.setzeWeltversatz({ x: 90, y: 0, z: 45 });
        expect(new Map(ae.wirksamerStand('lage')).get('G')).toEqual({ x: 1, y: 2, z: 3 });
        expect(warnung).toHaveBeenCalledWith(expect.stringContaining('ohne Rahmen-Versatz'));
        warnung.mockRestore();

        // Die nächste Sicherung trägt den Rahmen.
        await ae.eintragen({ art: 'kg', globalId: 'G2', nachher: '410' });
        const s = JSON.parse(localStorage.getItem(SCHLUESSEL));
        expect(s.versatzMerker).toEqual({ x: 90, y: 0, z: 45, form: 2 });
    });

    it('ein Merker ALTER Form (X/Z war null gebucht) wird nicht nachgeführt, sondern gemeldet und neu gestempelt', async () => {
        // So sieht jedes Journal vor dem 2026-09-08 aus: der Rahmen stand mit
        // X/Z = 0, weil die Engine −object.position las. Die Welt hat sich
        // nicht bewegt — eine Nachführung um −2,5 Mio. m wäre die Katastrophe.
        const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
        localStorage.setItem(SCHLUESSEL, JSON.stringify(nutzlast({ x: 0, y: 318.9, z: 0 })));
        const ae = useAenderungen();
        await ae.bereit;
        ae.setzeWeltversatz({ x: 2577527.421, y: 318.9, z: -5465712.818 });
        expect(new Map(ae.wirksamerStand('lage')).get('G')).toEqual({ x: 1, y: 2, z: 3 });
        expect(warnung).toHaveBeenCalledWith(expect.stringContaining('alter Form'));
        warnung.mockRestore();
        await ae.eintragen({ art: 'kg', globalId: 'G2', nachher: '410' });
        const s = JSON.parse(localStorage.getItem(SCHLUESSEL));
        expect(s.versatzMerker).toEqual({ x: 2577527.421, y: 318.9, z: -5465712.818, form: 2 });
    });

    it('neue Sicherungen tragen den Rahmen von selbst', async () => {
        const ae = useAenderungen();
        await ae.bereit;
        ae.setzeWeltversatz({ x: 7, y: 1, z: -3 });
        await ae.eintragen({ art: 'lage', globalId: 'G', nachher: { x: 1, y: 2, z: 3 } });
        const s = JSON.parse(localStorage.getItem(SCHLUESSEL));
        expect(s.versatzMerker).toEqual({ x: 7, y: 1, z: -3, form: 2 });
    });
});
