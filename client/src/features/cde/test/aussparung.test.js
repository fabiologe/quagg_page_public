/**
 * Die Aussparung (Teil XIV, G7) — Bauwerkskörper minus eigener Körper, der
 * zweite Verbraucher des Server-Kernels. Ohne Server: kein halbes Ding.
 */
import { describe, expect, it, vi } from 'vitest';
import { nachId, passende, felderFuer } from '../services/Bearbeitungen.js';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { ableitungsSchritte, erzeugtEintrag, rezeptNach } from '../services/Bauteilrezepte.js';
import { rezepteOhneDeklaration } from '../services/JournalVersatz.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { extrudiere } from '../services/geometrie/ops/Sweep.js';

const quadrat = (s, cx = 0, cz = 0) => [{ x: cx - s, z: cz - s }, { x: cx + s, z: cz - s }, { x: cx + s, z: cz + s }, { x: cx - s, z: cz + s }];
const WAND = extrudiere({ umriss: { ring: quadrat(2) } }, { von: 300, bis: 303 }).ergebnis;     // 48 m³
const holeQuellForm = async (gid, form) => (gid === 'WAND1' && form === 'koerper' ? WAND : null);
const standAus = (eintraege) => new Map(eintraege.map(e => [e.globalId, e.nachher]));

const BAUWERK = {
    modelId: 'm1', localId: 9, globalId: 'WAND1', name: 'Widerlager', category: 'IFCWALL',
    quellmass: { pruefmass: { triCount: 12, spanX: 400, spanY: 300, spanZ: 400 } },
    koerperQuellen: [{ globalId: 'cde-graben', name: 'H-001 · Graben', herkunft: 'cde' }, { globalId: 'cde-rohr', name: 'Rohr 1', herkunft: 'cde' }],
};

describe('Der Katalog', () => {
    it('hängt an allem Körperhaften — auch an der Wand; das Werkzeug kommt aus den eigenen Körpern des Subjekts', () => {
        // Das Rezept verlangt `KOERPERHAFT` in beiden Schlitzen; der Katalog liess
        // bis 2026-09-17 nur `koerper` zu, und die Aussparung in einer WAND — der
        // Regelfall schlechthin — erschien nie. Eine Rohrdurchführung ebenso.
        for (const bauform of ['koerper', 'flaeche+dicke', 'achse+profil']) {
            expect(passende({ bauform, guete: 'geschaetzt' }).map(b => b.id), bauform).toContain('aussparung-ableiten');
        }
        // Ein Gelände ist kein Stemmeisen, ein Punkt hat kein Volumen.
        for (const bauform of ['hoehenfeld', 'punkt', 'linie', 'flaeche']) {
            expect(passende({ bauform, guete: 'gemessen' }).map(b => b.id), bauform).not.toContain('aussparung-ableiten');
        }
        const [feld] = felderFuer(nachId('aussparung-ableiten'), null, BAUWERK);
        expect(feld.optionen.map(o => o.titel)).toEqual(['H-001 · Graben', 'Rohr 1']);
        expect(nachId('aussparung-ableiten').vorbelegung(BAUWERK)).toEqual({ werkzeug: 'cde-graben' });
    });

    it('zwei Einträge: Original ausblenden + EIN Teil, das den IFC-Typ des Bauwerks behält', () => {
        const s = nachId('aussparung-ableiten').anwenden(BAUWERK, { werkzeug: 'cde-graben' });
        expect(s).toHaveLength(2);
        expect(s[0]).toEqual({ art: 'geloescht', globalId: 'WAND1', nachher: true });
        expect(s[1].nachher).toMatchObject({ rezept: 'aussparung', rolle: 'koerper', kategorie: 'IFCWALL', bauform: 'koerper', name: 'Widerlager (mit Aussparung)' });
        expect(s[1].nachher.parameter.quellen).toEqual({ bauwerk: 'WAND1', werkzeug: 'cde-graben' });
        expect(s[1].nachher.parameter.quellBasis.bauwerk.triCount).toBe(12);
        expect(nachId('aussparung-ableiten').anwenden(BAUWERK, { werkzeug: 'WAND1' })).toBeNull();     // nicht mit sich selbst
    });

    it('WÄCHTER: das Rezept deklariert verschiebe, fachmodell und beschreibe', () => {
        for (const feld of ['verschiebe', 'fachmodell', 'beschreibe']) expect(rezepteOhneDeklaration(feld)).not.toContain('aussparung');
    });
});

describe('Der Lauf', () => {
    const graben = erzeugtEintrag({ rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: 'Rohr 1', parameter: { punkte: [[-3, 301.5, 0], [3, 301.5, 0]], dn: 500 } });
    const schritte = () => ableitungsSchritte({ rezept: 'aussparung', quellen: { bauwerk: 'WAND1', werkzeug: graben.globalId },
                                                operationen: [{ art: 'aussparung', parameter: { kategorie: 'IFCWALL' } }], name: 'Widerlager' });

    it('mit Server: der Körper entsteht, die Kennzahlen sagen, was abgezogen wurde', async () => {
        const ergebnis = extrudiere({ umriss: { ring: quadrat(2), loecher: [quadrat(0.5)] } }, { von: 300, bis: 303 }).ergebnis;   // 45 m³
        const server = { kann: () => ({ ok: true }), op: vi.fn(async () => ({ ergebnis, warnungen: [] })) };
        const s = schritte();
        const lauf = neuerAbleitungslauf({ stand: standAus([graben, ...s]), rezeptNach, holeQuellForm, kernel: erzeugeKernel({ server }) });
        const r = await lauf.baue(s[0].globalId);
        expect(r.ok && r.teil.form === 'koerper').toBe(true);
        expect(server.op).toHaveBeenCalledWith('booleDifferenz', expect.objectContaining({ a: WAND }), expect.anything());
        const k = lauf.ableitungen.get(s[0].nachher.ableitung).kennzahlen;
        expect(k.vorher).toBeCloseTo(48, 6);
        expect(k.abgezogen).toBeCloseTo(3, 6);
    });

    it('ohne Server: KEIN halbes Ding — der Misserfolg nennt den Grund', async () => {
        const s = schritte();
        const lauf = neuerAbleitungslauf({ stand: standAus([graben, ...s]), rezeptNach, holeQuellForm, kernel: erzeugeKernel() });
        const r = await lauf.baue(s[0].globalId);
        expect(r.ok).toBe(false);
        expect(r.fehler[0]).toMatch(/aussparung: .*Server/);
        expect(lauf.misserfolge).toHaveLength(1);
    });
});
