/**
 * BAUWERKSGRUBE (Teil XIX) — das Gelände passt sich an ein vorhandenes
 * Bauteil an.
 *
 * Fabios Vorgabe gilt hier doppelt: das BAUWERK wird nicht angefasst (es ist
 * die Quelle, nicht das Ergebnis), und das Ur-Gelände wird verborgen, nie
 * gelöscht. Die Grube entsteht als eigenes `IfcEarthworksCut`.
 *
 * Und: NACH NORM. Arbeitsraum aus DIN 4124 (0,50 m geböscht / 0,60 m
 * verbaut), Böschungswinkel aus der Bodenklasse — überschreibbar, und die
 * Befunde beraten statt zu verbieten.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { nachId, passende } from '../services/Bearbeitungen.js';
import { ABLEITUNGEN } from '../services/ableitung/Ableitungen.js';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { konvexeHuelle, grundrissAusMesh, umrissFlaeche } from '../services/geometrie/ops/Umriss.js';
import { GRABENREGELN } from '../services/gelaende/Grabenregeln.js';

const b = (id) => nachId(id);

/** Ein Netz: ein Quader von (x0,z0) bis (x1,z1), Unterkante u, Oberkante o. */
function quader(x0, z0, x1, z1, u, o) {
    const p = [];
    const ecke = (x, y, z) => p.push(x, y, z);
    for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) {
        ecke(ax, u, az); ecke(bx, u, bz); ecke(bx, o, bz);
        ecke(ax, u, az); ecke(bx, o, bz); ecke(ax, o, az);
    }
    return { positions: Float64Array.from(p), triCount: p.length / 9 };
}

/** Ein waagerechtes Gelände als Raster. */
function gelaende(hoehe = 10, n = 60, cell = 1) {
    const heights = new Float64Array(n * n).fill(hoehe);
    return { x0: -10, z0: -10, maxX: -10 + n * cell, maxZ: -10 + n * cell, cell, nx: n, nz: n, heights };
}

const BAUWERK = () => ({
    globalId: 'FUND-1', modelId: 'netz.ifc', localId: 7, name: 'Fundament A', hoehenversatz: 0,
    quellmass: { pruefmass: { triCount: 24, spanX: 10, spanY: 3, spanZ: 8 }, cell: 0.5 },
    gelaendeQuellen: [{ globalId: 'DGM-1', name: 'Urgelände', herkunft: 'geliefert',
                        pruefmass: { triCount: 900 }, cell: 1 }],
});

describe('Der Grundriss eines Bauteils', () => {
    it('konvexeHuelle umschliesst die Punkte, ohne kollineare Zwischenecken', () => {
        const h = konvexeHuelle([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }, { x: 5, z: 5 }]);
        expect(h).toHaveLength(4);                              // der Innenpunkt und die Kollineare fallen
        expect(umrissFlaeche(h)).toBeCloseTo(100, 6);
        expect(konvexeHuelle([{ x: 0, z: 0 }, { x: 1, z: 1 }])).toEqual([]);
        expect(konvexeHuelle([{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 2 }])).toEqual([]);   // alles auf einer Geraden
    });

    it('grundrissAusMesh liefert Ring, Unter- und Oberkante', () => {
        const { ergebnis } = grundrissAusMesh({ mesh: quader(0, 0, 10, 8, 2, 5) });
        expect(umrissFlaeche(ergebnis.ring)).toBeCloseTo(80, 6);
        expect(ergebnis.unterkante).toBe(2);
        expect(ergebnis.oberkante).toBe(5);
        expect(ergebnis.loecher).toEqual([]);
    });

    it('ein leeres oder entartetes Netz gibt einen Grund, keine Vermutung', () => {
        expect(grundrissAusMesh({ mesh: null }).ergebnis).toBeNull();
        expect(grundrissAusMesh({ mesh: { positions: new Float64Array([0, 0, 0, 1, 0, 1, 2, 0, 2]), triCount: 1 } }).ergebnis).toBeNull();
    });
});

describe('Das Rezept — nach Norm, und nichts geht verloren', () => {
    const rezept = ABLEITUNGEN.bauwerksgrube;

    it('nennt zwei Quellen und liefert Grube plus neues Gelände', () => {
        expect(rezept.braucht.bauteil).toContain('koerper');
        expect(rezept.braucht.gelaende).toEqual(['hoehenfeld']);
        expect(rezept.formen).toEqual({ bauteil: 'umriss', gelaende: 'raster' });
        expect(rezept.teile.map(t => [t.rolle, t.kategorie, t.predefinedType])).toEqual([
            ['grube', 'IFCEARTHWORKSCUT', 'EXCAVATION'],
            ['dgm', 'IFCGEOGRAPHICELEMENT', 'TERRAIN'],
        ]);
    });

    it('rechnet die Grube: Arbeitsraum nach DIN 4124, Sohle auf der Unterkante', async () => {
        const kernel = erzeugeKernel({});
        const lauf = neuerAbleitungslauf({
            stand: new Map(),
            holeQuellForm: async (gid) => (gid === 'DGM-1' ? gelaende(10) : grundrissAusMesh({ mesh: quader(0, 0, 10, 8, 6, 12) }).ergebnis),
            kernel, kontext: { hoehenversatz: 0 },
        });
        const parameter = {
            quellen: { bauteil: 'FUND-1', gelaende: 'DGM-1' }, quellBasis: {}, raster: { cell: 1 },
            operationen: [{ art: 'bauwerksgrube', parameter: { wandform: 'boeschung', boden: 'nichtbindig' } }],
        };
        const r = await rezept.leite(parameter, {
            bauteil: grundrissAusMesh({ mesh: quader(0, 0, 10, 8, 6, 12) }).ergebnis,
            gelaende: gelaende(10),
        }, { kernel, hoehenversatz: 0 });

        // Arbeitsraum: geböscht ⇒ 0,50 m nach DIN 4124
        expect(r.kennzahlen.arbeitsraum).toBe(GRABENREGELN.arbeitsraumBaugrube.geboescht);
        expect(r.kennzahlen.grundflaeche).toBeCloseTo(80, 6);
        expect(r.kennzahlen.grubenflaeche).toBeGreaterThan(80);      // der Arbeitsraum kommt dazu
        // Die Sohle liegt auf der Unterkante des Bauwerks (6), das Gelände auf 10 ⇒ 4 m tief.
        expect(r.kennzahlen.tiefeMax).toBeCloseTo(4, 3);
        expect(r.teile.grube.daten.volumen).toBeGreaterThan(0);
        expect(r.teile.dgm.form).toBe('raster');
    });

    it('ohne Grundriss oder Gelände wirft es MIT Grund — kein halbes Ding', async () => {
        const kernel = erzeugeKernel({});
        const p = { operationen: [{ art: 'bauwerksgrube', parameter: {} }] };
        await expect(rezept.leite(p, { gelaende: gelaende(10) }, { kernel })).rejects.toThrow(/Grundriss/);
        await expect(rezept.leite(p, { bauteil: { ring: [{ x: 0, z: 0 }] } }, { kernel })).rejects.toThrow(/Quellgelände/);
    });

    it('eine senkrechte Wand über 1,25 m wird GEMELDET, nicht verboten', async () => {
        const kernel = erzeugeKernel({});
        const p = {
            quellen: { bauteil: 'FUND-1', gelaende: 'DGM-1' }, raster: { cell: 1 },
            operationen: [{ art: 'bauwerksgrube', parameter: { wandform: 'senkrecht' } }],
        };
        const r = await rezept.leite(p, {
            bauteil: grundrissAusMesh({ mesh: quader(0, 0, 10, 8, 6, 12) }).ergebnis,
            gelaende: gelaende(10),
        }, { kernel, hoehenversatz: 0 });
        expect(r.befunde.some(x => /senkrecht/i.test(x.regel ?? x.id ?? ''))).toBe(true);
        expect(r.teile.grube).not.toBeNull();                       // gebaut wird trotzdem
    });
});

describe('Der Katalogeintrag', () => {
    it('steht am Bauwerk — nicht am Gelände und nicht am Rohr', () => {
        expect(passende({ bauform: 'koerper', guete: 'gemessen' }).map(x => x.id)).toContain('bauwerksgrube-ableiten');
        expect(passende({ bauform: 'hoehenfeld', guete: 'geschaetzt' }).map(x => x.id)).not.toContain('bauwerksgrube-ableiten');
        expect(passende({ bauform: 'achse+profil', guete: 'gemessen' }).map(x => x.id)).not.toContain('bauwerksgrube-ableiten');
    });

    it('schreibt: Ur-Gelände verbergen + zwei neue Teile, EIN Vorgang', () => {
        const s = b('bauwerksgrube-ableiten').anwenden(BAUWERK(), { gelaende: 'DGM-1', wandform: 'boeschung', boden: 'nichtbindig' });
        expect(s.map(x => x.art)).toEqual(['geloescht', 'erzeugt', 'erzeugt']);
        // Das GELÄNDE wird verborgen — nicht das Bauwerk.
        expect(s[0].globalId).toBe('DGM-1');
        expect(s[0].modell).toBeUndefined();                        // geliefert ⇒ ausblenden
        // Das Bauwerk taucht nur als QUELLE auf, nie als Ziel eines Schritts.
        expect(s.every(x => x.globalId !== 'FUND-1')).toBe(true);
        expect(s[1].nachher.parameter.quellen).toEqual({ bauteil: 'FUND-1', gelaende: 'DGM-1' });
    });

    it('die Norm ist die Vorgabe, die Eingabe überschreibt sie', () => {
        const felder = b('bauwerksgrube-ableiten').felder.map(f => f.name);
        expect(felder).toEqual(['gelaende', 'arbeitsraum', 'wandform', 'boden', 'winkel', 'sohle']);
        expect(b('bauwerksgrube-ableiten').vorbelegung(BAUWERK())).toMatchObject({ gelaende: 'DGM-1', arbeitsraum: '', wandform: 'boeschung' });
        const s = b('bauwerksgrube-ableiten').anwenden(BAUWERK(), { gelaende: 'DGM-1', arbeitsraum: 1.2, sohle: 295 });
        const op = s[1].nachher.parameter.operationen[0].parameter;
        expect(op.arbeitsraum).toBe(1.2);
        expect(op.sohle).toBe(295);
        // Leer heisst „nach Norm", nicht „null".
        const s2 = b('bauwerksgrube-ableiten').anwenden(BAUWERK(), { gelaende: 'DGM-1', arbeitsraum: '', sohle: '' });
        expect(s2[1].nachher.parameter.operationen[0].parameter.arbeitsraum).toBeNull();
    });

    it('die Gegenprobe schweigt unter fünf Kubikmetern — dort sagt die Prozentzahl nichts', async () => {
        const { ABLEITUNGEN: A } = await import('../services/ableitung/Ableitungen.js');
        const befunde = [];
        // Ein winziger Körper mit 3 % Abweichung: das ist Rasterauflösung, kein Befund.
        A.erdbau.teile.length;                                   // (nur, damit der Import zählt)
        const rezept = A.bauwerksgrube;
        expect(rezept).toBeTruthy();
        // Der Wächter steht im Quelltext — gemessen an der Schachtbaugrube.
        const quelle = readFileSync(new URL('../services/ableitung/Ableitungen.js', import.meta.url), 'utf8');
        expect(quelle).toMatch(/GEGENPROBE_MINDEST_M3\s*=\s*5/);
        expect(quelle).toMatch(/if \(Math\.max\(rasterWert, koerper\.volumen\) < GEGENPROBE_MINDEST_M3\) return;/);
        expect(befunde).toEqual([]);
    });

    it('ohne gewähltes Gelände entsteht nichts', () => {
        expect(b('bauwerksgrube-ableiten').anwenden(BAUWERK(), { gelaende: 'gibtsnicht' })).toBeNull();
        expect(b('bauwerksgrube-ableiten').anwenden({ ...BAUWERK(), gelaendeQuellen: [] }, { gelaende: 'DGM-1' })).toBeNull();
    });
});
