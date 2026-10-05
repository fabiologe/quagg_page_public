// @vitest-environment jsdom
/**
 * BIMFY — Geometrie (2D/3D) → IFC-Elemente.
 *
 * Geprüft wird an der ECHTEN Schnittstelle: die Leser liefern Geometrie, der
 * Übersetzer baut Kommandos, `fuehreAus` schreibt sie ins Journal (dieselbe
 * Engstelle wie jedes Zeichenwerkzeug), der Autor baut aus dem Journalstand,
 * und der Paketbauer verpackt — derselbe Weg wie „Ausgeben". Eine Zahl am Ende
 * (Volumen, Klasse, Lage) misst, was ein Planer im IFC wiederfände.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { KOMMANDO_SCHEMA, SAMMLUNG, pruefeKommando } from '../services/kommando/Kommando.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';
import { liesGeometrien, liesDxf, liesGeoJson, liesObj, liesStl, liesIsybau, liesPunktliste } from '../services/bimfy/Geometrieleser.js';
import { koerperform, formklasse, konvexeHuelle } from '../services/bimfy/Koerperform.js';
import { bimfyRezepte, gruppiere, kommandoFuer, kommandosFuer, rezepteFuer, rezepteFuerZeile, vorschlagFuer }
    from '../services/bimfy/Uebersetzer.js';
import { PANEL_DEFS } from '../stores/usePanels.js';

class Speicher {
    constructor() { this.daten = new Map(); }
    async get(k) { return this.daten.has(k) ? JSON.parse(this.daten.get(k)) : null; }
    async set(k, v) { this.daten.set(k, JSON.stringify(v)); return true; }
    async delete(k) { this.daten.delete(k); return true; }
    async listKeys(p) { return [...this.daten.keys()].filter(k => k.startsWith(p)); }
    async getBlob() { return null; }
    async setBlob() { return false; }
    async deleteBlob() { return false; }
    async listBlobs() { return []; }
}

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

const r3 = (v) => Math.round(v * 1000) / 1000;

/** Eine ASCII-DXF aus Elementen — Gruppencode, Wert, Gruppencode, Wert … */
function dxf(elemente, { einheit = 6 } = {}) {
    const z = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', String(einheit), '0', 'ENDSEC',
               '0', 'SECTION', '2', 'ENTITIES'];
    for (const e of elemente) z.push(...e.map(String));
    z.push('0', 'ENDSEC', '0', 'EOF');
    return z.join('\n');
}
const LINE = (ebene, x1, y1, x2, y2, z = 0) => ['0', 'LINE', '8', ebene, '10', x1, '20', y1, '30', z, '11', x2, '21', y2, '31', z];
const LWPOLY = (ebene, punkte, zu = false) => ['0', 'LWPOLYLINE', '8', ebene, '90', punkte.length, '70', zu ? 1 : 0,
                                               ...punkte.flatMap(([x, y]) => ['10', x, '20', y])];
const CIRCLE = (ebene, x, y, r, z = 0) => ['0', 'CIRCLE', '8', ebene, '10', x, '20', y, '30', z, '40', r];

/** Ein Quader als OBJ (Y-oben), Ecken (x0..x1, y0..y1 Höhe, z0..z1). */
function quaderObj(name, [x0, x1], [y0, y1], [z0, z1]) {
    const v = [];
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) v.push(`v ${x} ${y} ${z}`);
    return [`o ${name}`, ...v, 'f 1 2 4 3', 'f 5 6 8 7', 'f 1 2 6 5', 'f 3 4 8 7', 'f 1 3 7 5', 'f 2 4 8 6'].join('\n');
}

let n = 0;
const vollesKommando = (k) => ({ schema: KOMMANDO_SCHEMA, id: `ko-bimfy-${++n}`, ziel: [], wer: 'test', wann: '2026-10-05T12:00:00Z', ...k });

async function paketAus(ae) {
    const stand = ae.wirksamerStand('erzeugt');
    const autor = new IfcAutor({ getFragments: () => null, holeQuellForm: () => null, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
    const g = await autor.eigenbauGeometrien([...stand].map(([globalId, wert]) => ({ globalId, wert })), { verdeckt: new Set() });
    return baueEigenbauPaket({ teile: g.bauteile, stand, bauwerke: g.bauwerke,
                               nachProjekt: (p) => ({ ost: p.x, nord: -p.z, hoehe: p.y }) });
}

async function uebersetzeUndSchreibe(geometrien, opt = {}) {
    const b = useBearbeitung();
    const { kommandos, fehler } = kommandosFuer(gruppiere(geometrien), opt);
    const ergebnisse = [];
    for (const { kommando } of kommandos) ergebnisse.push(await b.fuehreAus(vollesKommando(kommando), { kennungsgeber: () => `cde-${++n}` }));
    return { kommandos, fehler, ergebnisse };
}

describe('BIMFY · Leser', () => {
    it('DXF: Linie, Polylinie offen und geschlossen, Kreis — 2D bleibt ohne Höhe, die Einheit wird Meter', () => {
        const text = dxf([
            LINE('KANAL_RW', 0, 0, 10000, 0),
            LWPOLY('WAND', [[0, 0], [5000, 0], [5000, 3000]]),
            LWPOLY('Bodenplatte', [[0, 0], [4000, 0], [4000, 3000], [0, 3000]], true),
            CIRCLE('SCHACHT', 10000, 0, 500),
        ], { einheit: 4 });
        const { geometrien, warnungen } = liesDxf(text);
        expect(warnungen).toEqual([]);
        expect(geometrien.map(g => [g.ebene, g.art, g.punkte.length])).toEqual([
            ['KANAL_RW', 'zug', 2], ['WAND', 'zug', 3], ['Bodenplatte', 'umriss', 4], ['SCHACHT', 'punkt', 1]]);
        expect(geometrien[0].punkte[1]).toEqual({ ost: 10, nord: 0 });         // mm → m, Z = 0 heisst 2D
        expect(geometrien[3].durchmesser).toBe(1);
        expect(geometrien.every(g => !g.dreiD)).toBe(true);
    });

    it('DXF: ein geschlossener Zug mit wiederholtem Endpunkt wird ein Umriss, 3D-Linien behalten ihre Höhe', () => {
        const { geometrien } = liesDxf(dxf([
            LWPOLY('X', [[0, 0], [1, 0], [1, 1], [0, 0]]),
            LINE('Y', 0, 0, 3, 4, 101.5),
        ]));
        expect(geometrien[0]).toMatchObject({ art: 'umriss', punkte: [{ ost: 0, nord: 0 }, { ost: 1, nord: 0 }, { ost: 1, nord: 1 }] });
        expect(geometrien[1]).toMatchObject({ art: 'zug', dreiD: true, punkte: [{ hoehe: 101.5 }, { hoehe: 101.5 }] });
    });

    it('DXF: Blöcke werden gezählt und gemeldet, nicht verschluckt', () => {
        const { warnungen } = liesDxf(dxf([['0', 'INSERT', '8', 'X', '2', 'BLOCK1', '10', 0, '20', 0]]));
        expect(warnungen).toEqual(['DXF: 1 × INSERT übergangen (Blöcke bitte vorher auflösen)']);
    });

    it('GeoJSON: Punkt, Linie, Polygon mit Ebene aus den Eigenschaften — Längen/Breiten werden angemahnt', () => {
        const fc = { type: 'FeatureCollection', features: [
            { type: 'Feature', properties: { layer: 'Rohr' }, geometry: { type: 'LineString', coordinates: [[410000, 5460000, 100], [410010, 5460000, 99.9]] } },
            { type: 'Feature', properties: { name: 'Platte A' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] } },
        ] };
        const { geometrien, warnungen } = liesGeoJson(JSON.stringify(fc));
        expect(geometrien.map(g => [g.art, g.ebene, g.name])).toEqual([['zug', 'Rohr', ''], ['umriss', '', 'Platte A']]);
        expect(warnungen).toEqual([]);
        const geo = liesGeoJson(JSON.stringify({ type: 'Point', coordinates: [8.4, 49.0] }));
        expect(geo.warnungen[0]).toMatch(/Längen-\/Breitengrad/);
    });

    it('OBJ (Y-oben) und STL (Z-oben): je Objekt ein Körper mit seinen Höhen', () => {
        const obj = liesObj(quaderObj('Block', [0, 2], [10, 13], [0, -1]));
        expect(obj.geometrien).toHaveLength(1);
        const f = koerperform(obj.geometrien[0].punkte);
        expect([r3(f.laenge), r3(f.breite), f.unten, f.oben]).toEqual([2, 1, 10, 13]);

        const stl = ['solid teil', 'facet normal 0 0 1', 'outer loop',
                     'vertex 0 0 0', 'vertex 1 0 0', 'vertex 1 1 0', 'endloop', 'endfacet',
                     'facet normal 0 0 1', 'outer loop', 'vertex 0 0 2', 'vertex 1 1 2', 'vertex 0 1 2', 'endloop', 'endfacet',
                     'endsolid teil'].join('\n');
        const s = liesStl(stl);
        expect(koerperform(s.geometrien[0].punkte)).toMatchObject({ unten: 0, oben: 2, hoehe: 2 });
    });

    it('unbekanntes Format und kaputte Datei sagen es in einem Satz', () => {
        expect(liesGeometrien('plan.dwg', '').warnungen[0]).toMatch(/liest BIMFY nicht/);
        expect(liesGeometrien('plan.dxf', 'Unsinn\nmehr').warnungen[0]).toMatch(/liess sich nicht lesen/);
        expect(liesGeometrien('stl.stl', 'binär').warnungen[0]).toMatch(/ASCII-STL/);
    });
});

/** Ein kleines ISYBAU-Netz: zwei Schächte (DMP + Tiefe), eine Haltung DN 300 ohne eigene Geometrie. */
const schachtXml = (name, ost, nord, deckel, tiefe) => `
  <AbwassertechnischeAnlage>
    <Objektbezeichnung>${name}</Objektbezeichnung><Objektart>2</Objektart>
    <Geometrie><Geometriedaten><Knoten>
      <Punkt><PunktattributAbwasser>DMP</PunktattributAbwasser><Rechtswert>${ost}</Rechtswert><Hochwert>${nord}</Hochwert><Punkthoehe>${deckel}</Punkthoehe></Punkt>
    </Knoten></Geometriedaten></Geometrie>
    <Knoten><KnotenTyp>0</KnotenTyp><Schacht><Schachttiefe>${tiefe}</Schachttiefe><Aufbau><LaengeAufbau>1,00</LaengeAufbau></Aufbau></Schacht></Knoten>
  </AbwassertechnischeAnlage>`;
const ISYBAU = `<?xml version="1.0" encoding="UTF-8"?>
<Identifikation xmlns="http://www.ofd-hannover.la/Identifikation"><Datenkollektive><Stammdatenkollektiv>
  ${schachtXml('S1', 410000, 5460000, '105,00', '3,00')}
  ${schachtXml('S2', 410040, 5460030, '104,50', '3,20')}
  <AbwassertechnischeAnlage>
    <Objektbezeichnung>H1</Objektbezeichnung><Objektart>1</Objektart>
    <Kante><KnotenZulauf>S1</KnotenZulauf><KnotenAblauf>S2</KnotenAblauf>
      <SohlhoeheZulauf>102,00</SohlhoeheZulauf><SohlhoeheAblauf>101,30</SohlhoeheAblauf>
      <Profil><Profilart>0</Profilart><Profilhoehe>300</Profilhoehe></Profil></Kante>
  </AbwassertechnischeAnlage>
  <AbwassertechnischeAnlage><Objektbezeichnung>A1</Objektbezeichnung><Objektart>2</Objektart>
    <Geometrie><Geometriedaten><Knoten><Punkt><Rechtswert>410001</Rechtswert><Hochwert>5460001</Hochwert></Punkt></Knoten></Geometriedaten></Geometrie>
    <Knoten><KnotenTyp>1</KnotenTyp></Knoten></AbwassertechnischeAnlage>
</Stammdatenkollektiv></Datenkollektive></Identifikation>`;

describe('BIMFY · ISYBAU und Punktdaten', () => {
    it('ISYBAU: Schächte von Sohle bis Deckel, die Haltung mit Sohlhöhen und DN — ein Anschlusspunkt ohne Höhe gemeldet', () => {
        const { geometrien, warnungen } = liesIsybau(ISYBAU);
        expect(geometrien.map(g => [g.ebene, g.name, g.art])).toEqual([
            ['ISYBAU Schacht', 'S1', 'zug'], ['ISYBAU Schacht', 'S2', 'zug'], ['ISYBAU Haltung', 'H1', 'zug']]);
        expect(geometrien[0].punkte.map(p => p.hoehe)).toEqual([102, 105]);
        expect(geometrien[2].punkte).toEqual([{ ost: 410000, nord: 5460000, hoehe: 102 }, { ost: 410040, nord: 5460030, hoehe: 101.3 }]);
        expect(geometrien[2].durchmesser).toBe(0.3);
        // Seit I10 liest BIMFY Anschlusspunkte — dieser hat keine Sohle (Punkt ohne Höhe).
        expect(warnungen).toEqual(['ISYBAU: Anschlusspunkt „A1" ohne Lage oder Sohle übergangen']);
        const zeilen = gruppiere(geometrien);
        // Seit BIMFY I6 wird ein ISYBAU-Schacht der Normschacht — Teil für Teil, nicht ein Zylinder.
        expect(zeilen.map(z => [z.ebene, z.rezept])).toEqual([['ISYBAU Schacht', 'vorlage:normschacht'], ['ISYBAU Haltung', 'rohr']]);
    });

    it('ISYBAU durch den Kommandoweg: Rohr DN 300 mit Wand, zwei Normschächte DN 1000', async () => {
        const { geometrien } = liesIsybau(ISYBAU);
        const { fehler, ergebnisse, kommandos } = await uebersetzeUndSchreibe(geometrien);
        expect(fehler).toEqual([]);
        for (const e of ergebnisse) expect(e.ausgefuehrt, e.grund ?? '').toBe(true);
        expect(kommandos.find(k => k.geo.name === 'H1').kommando.werte.dn).toBe(300);
        expect(kommandos.find(k => k.geo.name === 'S1').kommando).toMatchObject({ werkzeug: 'bauwerk-aus-vorlage-normschacht', werte: { dn: 1 } });
        const paket = await paketAus(useAenderungen());
        expect(paket.bauwerke.map(w => [w.art, w.name]).sort()).toEqual([['schacht', 'S1'], ['schacht', 'S2']]);
        expect(paket.bauteile.filter(t => t.klasse === 'IFCPIPESEGMENT').map(t => t.name)).toEqual(['H1']);
        expect(paket.bauteile.filter(t => t.objektTyp === 'Schachtring').length).toBeGreaterThanOrEqual(4);
    });

    it('XYZ: Nr X Y Z Code mit Dezimalkomma — der Code wird die Ebene', () => {
        const { geometrien, warnungen } = liesPunktliste('Nr;X;Y;Z;Code\n1;410000,10;5460000,20;101,5;SD\n2;410005;5460001;101,4;BA\n');
        expect(warnungen).toEqual([]);
        expect(geometrien.map(g => [g.name, g.ebene, g.punkte[0]])).toEqual([
            ['1', 'SD', { ost: 410000.1, nord: 5460000.2, hoehe: 101.5 }], ['2', 'BA', { ost: 410005, nord: 5460001, hoehe: 101.4 }]]);
    });

    it('XYZ: nackte Koordinaten, und Hochwert vor Rechtswert wird erkannt und gesagt', () => {
        expect(liesPunktliste('410000 5460000 100\n410001 5460002 100.5').geometrien[1].punkte[0]).toEqual({ ost: 410001, nord: 5460002, hoehe: 100.5 });
        const gedreht = liesPunktliste('5460000.0 410000.0 100\n5460002 410001 100.5');
        expect(gedreht.geometrien[0].punkte[0]).toEqual({ ost: 410000, nord: 5460000, hoehe: 100 });
        expect(gedreht.warnungen[0]).toMatch(/Nord\/Ost/);
        expect(liesPunktliste('5460000 410000 100', { reihenfolge: 'ost-nord' }).geometrien[0].punkte[0].ost).toBe(5460000);
    });
});

describe('BIMFY · Körperform', () => {
    it('kleinstes Rechteck auch gedreht: eine 45°-Wand ist 6 m lang und 0,3 m dick', () => {
        const c = Math.SQRT1_2;
        const ecken = [[0, 0], [6, 0], [6, 0.3], [0, 0.3]].map(([u, v]) => ({ ost: u * c - v * c, nord: u * c + v * c }));
        const punkte = [...ecken.map(p => ({ ...p, hoehe: 0 })), ...ecken.map(p => ({ ...p, hoehe: 2.5 }))];
        const f = koerperform(punkte);
        expect([r3(f.laenge), r3(f.breite), f.hoehe]).toEqual([6, 0.3, 2.5]);
        expect(formklasse(f)).toBe('scheibe');
        expect(konvexeHuelle(punkte)).toHaveLength(4);
    });

    it('Formklassen: Stütze, Träger, Platte, Block', () => {
        const box = (l, b, h) => ({ laenge: l, breite: b, hoehe: h });
        expect(formklasse(box(0.4, 0.4, 3))).toBe('stab');
        expect(formklasse(box(8, 0.3, 0.5))).toBe('balken');
        expect(formklasse(box(10, 6, 0.3))).toBe('platte');
        expect(formklasse(box(2, 2, 2))).toBe('block');
    });
});

describe('BIMFY · Übersetzer', () => {
    it('bietet nur Rezepte an, die er füllen kann — die Rigole (Hohlraumanteil) nicht', () => {
        const ids = bimfyRezepte().map(r => r.id);
        expect(ids).toEqual(expect.arrayContaining(['linie', 'flaeche', 'rohr', 'schacht', 'pfosten', 'platte', 'wand', 'streifenfundament', 'raum']));
        expect(ids).not.toContain('rigole');
        expect(ids).not.toContain('bauwerk');
    });

    it('Vorschläge aus Ebene und Form', () => {
        const zug = (ebene) => ({ art: 'zug', ebene, name: '', punkte: [{ ost: 0, nord: 0 }, { ost: 5, nord: 0 }] });
        expect(vorschlagFuer(zug('WAND_AUSSEN'))).toMatchObject({ rezept: 'wand', kategorie: 'IFCWALL' });
        expect(vorschlagFuer(zug('Kanal RW'))).toMatchObject({ rezept: 'rohr', kategorie: 'IFCPIPESEGMENT' });
        expect(vorschlagFuer(zug('Träger'))).toMatchObject({ rezept: 'streifenfundament', kategorie: 'IFCBEAM' });
        expect(vorschlagFuer(zug('0'))).toMatchObject({ rezept: 'linie', grund: 'offener Zug' });
        // Ein „Wand"-Punkt bleibt ein Pfosten — das Stichwort passt nicht zur Form.
        expect(vorschlagFuer({ art: 'punkt', ebene: 'WAND', punkte: [{ ost: 0, nord: 0 }] }).rezept).toBe('pfosten');
        expect(vorschlagFuer({ art: 'punkt', ebene: '', durchmesser: 1, punkte: [{ ost: 0, nord: 0 }] }).rezept).toBe('schacht');
        const senkrecht = { art: 'zug', ebene: '', punkte: [{ ost: 1, nord: 1, hoehe: 100 }, { ost: 1, nord: 1, hoehe: 103 }] };
        expect(vorschlagFuer(senkrecht).rezept).toBe('schacht');
    });

    it('eine Zeile je Ebene und Art — und nur Rezepte, die allen ihren Geometrien passen', () => {
        const { geometrien } = liesDxf(dxf([LINE('A', 0, 0, 1, 0), LINE('A', 0, 1, 1, 1), LWPOLY('A', [[0, 0], [1, 0], [1, 1]], true)]));
        const zeilen = gruppiere(geometrien);
        expect(zeilen.map(z => [z.ebene, z.art, z.geometrien.length])).toEqual([['A', 'zug', 2], ['A', 'umriss', 1]]);
        expect(rezepteFuerZeile(zeilen[1]).every(r => r.geschlossen)).toBe(true);
    });

    it('eine andere Klasse als die Vorgabe leert die Ausführung (kein STRIP_FOOTING am Träger)', () => {
        const geo = { art: 'zug', ebene: '', punkte: [{ ost: 0, nord: 0, hoehe: 5 }, { ost: 6, nord: 0, hoehe: 5 }] };
        const k = kommandoFuer(geo, { rezept: 'streifenfundament', kategorie: 'IFCBEAM' });
        expect(k.werte.predefinedType).toBe('');
        expect(kommandoFuer(geo, { rezept: 'streifenfundament' }).werte.predefinedType).toBe('STRIP_FOOTING');
        expect(kommandoFuer(geo, { rezept: 'platte', kategorie: 'IFCSPACE' }).fehler).toBeTruthy();
        expect(kommandoFuer(geo, { rezept: 'wand', kategorie: 'IFCKEINTYP' }).fehler).toMatch(/kein IFC-Typ/);
    });

    it('lokale Zeichnung: Versatz und Grundhöhe landen in den Punkten', () => {
        const geo = { art: 'zug', ebene: '', punkte: [{ ost: 0, nord: 0 }, { ost: 1, nord: 0 }] };
        const k = kommandoFuer(geo, { rezept: 'linie' }, { versatz: { ost: 410000, nord: 5460000 }, basisHoehe: 101.2 });
        expect(k.eingaben.zug).toEqual([{ ost: 410000, nord: 5460000, hoehe: 101.2 }, { ost: 410001, nord: 5460000, hoehe: 101.2 }]);
        expect(rezepteFuer({ art: 'umriss', punkte: [] }).every(r => r.geschlossen)).toBe(true);
    });
});

describe('BIMFY · durch den Kommandoweg bis ins IFC-Paket', () => {
    it('2D-DXF: Wand, Kanal, Bodenplatte, Schacht — vier Klassen, Volumen nach den Vorgaben', async () => {
        const { geometrien } = liesDxf(dxf([
            LINE('WAND', 0, 0, 6, 0),
            LINE('KANAL', 0, 5, 20, 5),
            LWPOLY('Bodenplatte', [[0, 0], [4, 0], [4, 3], [0, 3]], true),
            CIRCLE('SCHACHT', 20, 5, 0.5),
        ]));
        const { kommandos, fehler, ergebnisse } = await uebersetzeUndSchreibe(geometrien, { basisHoehe: 100 });
        expect(fehler).toEqual([]);
        expect(kommandos.map(k => k.kommando.werkzeug)).toEqual(['wand-zeichnen', 'rohr-zeichnen', 'platte-zeichnen', 'schacht-zeichnen']);
        for (const e of ergebnisse) expect(e.ausgefuehrt, e.grund ?? '').toBe(true);

        const ae = useAenderungen();
        // Jeder Vorgang trägt seinen Beleg — BIMFY ist ein Mensch mit Zeichenwerkzeug.
        expect(ae.eintraege.filter(e => e.kommando?.werkzeug?.endsWith('-zeichnen'))).toHaveLength(4);

        const paket = await paketAus(ae);
        const nachKlasse = Object.fromEntries(paket.bauteile.map(t => [t.klasse, t]));
        expect(Object.keys(nachKlasse).sort()).toEqual(['IFCDISTRIBUTIONCHAMBERELEMENT', 'IFCPIPESEGMENT', 'IFCSLAB', 'IFCWALL']);
        // Wand 6 m × 0,3 m × 2,5 m (Vorgaben des Rezepts) = 4,5 m³; Platte 4 × 3 × 0,2 = 2,4 m³.
        expect(r3(nachKlasse.IFCWALL.mengen.netVolume)).toBe(4.5);
        expect(r3(nachKlasse.IFCSLAB.mengen.netVolume)).toBe(2.4);
        expect(nachKlasse.IFCWALL.name).toBe('WAND 1');
    });

    it('3D-OBJ: eine Wandscheibe wird IfcWall mit ihren echten Massen, ein Block ein Proxy', async () => {
        const text = [quaderObj('Scheibe', [0, 8], [100, 103], [0, -0.25]),
                      quaderObj('Klotz', [20, 22], [100, 102], [0, -2]).replace(/^v /gm, 'v ')].join('\n');
        // Zwei Objekte in einer Datei: die Indizes des zweiten zählen weiter.
        const zweite = text.split('\n');
        let i = 0;
        const korrigiert = zweite.map(z => {
            if (z.startsWith('o Klotz')) i = 8;
            return i && z.startsWith('f ') ? 'f ' + z.slice(2).split(' ').map(x => Number(x) + i).join(' ') : z;
        }).join('\n');
        const { geometrien } = liesGeometrien('modell.obj', korrigiert);
        expect(geometrien.map(g => g.art)).toEqual(['koerper', 'koerper']);
        expect(gruppiere(geometrien).map(z => [z.rezept, z.kategorie])).toEqual([['wand', 'IFCWALL'], ['platte', 'IFCBUILDINGELEMENTPROXY']]);

        const { fehler, ergebnisse } = await uebersetzeUndSchreibe(geometrien);
        expect(fehler).toEqual([]);
        for (const e of ergebnisse) expect(e.ausgefuehrt, e.grund ?? '').toBe(true);
        const paket = await paketAus(useAenderungen());
        const wand = paket.bauteile.find(t => t.klasse === 'IFCWALL');
        const klotz = paket.bauteile.find(t => t.klasse === 'IFCBUILDINGELEMENTPROXY');
        // 8 × 0,25 × 3 = 6 m³ — die Masse des Netzes, nicht die Vorgaben des Rezepts.
        expect(r3(wand.mengen.netVolume)).toBe(6);
        expect(klotz).toBeTruthy();
    });
});

describe('BIMFY · die Tafel', () => {
    it('steht im Katalog direkt unter den Notizen', () => {
        const ids = PANEL_DEFS.map(p => p.id);
        expect(ids.indexOf('bimfy')).toBe(ids.indexOf('issues') + 1);
        expect(PANEL_DEFS.find(p => p.id === 'bimfy')).toMatchObject({ titel: 'BIMFY', seite: 'right' });
    });
});

describe('BIMFY · die Tafel, montiert', () => {
    it('eine DXF hinein: Zeilen je Ebene, Vorschau, Knopf mit Anzahl — ohne Viewer sagt sie, was fehlt', async () => {
        const { mount } = await import('@vue/test-utils');
        const BimfyPanel = (await import('../components/BimfyPanel.vue')).default;
        const w = mount(BimfyPanel, { global: { stubs: { CdeIcon: { template: '<i />' } } } });
        const text = dxf([LINE('WAND', 0, 0, 6, 0), LWPOLY('Bodenplatte', [[0, 0], [4, 0], [4, 3], [0, 3]], true)]);
        // jsdom kennt `arrayBuffer` an File nicht — der Browser schon.
        const datei = Object.assign(new File([text], 'plan.dxf'), { arrayBuffer: async () => new TextEncoder().encode(text).buffer });
        const input = w.find('input[type="file"]');
        Object.defineProperty(input.element, 'files', { value: [datei] });
        await input.trigger('change');
        await new Promise(r => setTimeout(r, 0));
        await w.vm.$nextTick();
        expect(w.findAll('.bf-zeilen tbody tr').map(tr => tr.find('.bf-ebene').text())).toEqual(['WAND', 'Bodenplatte']);
        expect(w.findAll('.bf-zeilen select').map(s => s.element.value)).toEqual(['wand', 'platte']);
        expect(w.findAll('.bf-form')).toHaveLength(2);
        const knopf = w.find('.bf-knopf');
        expect(knopf.text()).toContain('2 Bauteile anlegen');
        expect(knopf.attributes('disabled')).toBeDefined();
        expect(w.text()).toContain('Erst ein Modell im 3D öffnen');
        w.unmount();
    });
});

describe('BIMFY · ein Import, ein Vorgang (I8, Sammlung)', () => {
    it('die Tafel legt über ihren echten Knopf an: ein Vorgang, Kennungen vergibt sie selbst', async () => {
        // Bis I8 gab die Tafel ihren Kommandos KEINE Kennungen — jedes Bauteil
        // wurde abgelehnt („0 neue Kennung(en)"). Die Tests vergaben sie selbst.
        const { mount } = await import('@vue/test-utils');
        const { defineComponent, h } = await import('vue');
        const { provideViewerApi } = await import('../composables/viewerApi.js');
        const BimfyPanel = (await import('../components/BimfyPanel.vue')).default;
        const b = useBearbeitung();
        const ae = useAenderungen();
        const angewandt = [];
        const api = { bearbeitenEin: () => { b.modusSetzen(true); return true; }, wendeEintragAn: async (e) => { angewandt.push(e); },
                      modellShaVon: () => null, getLoadedModelSha: () => 'sha-test' };
        const Huelle = defineComponent({ setup() { provideViewerApi(api); return () => h(BimfyPanel); } });
        const w = mount(Huelle, { global: { stubs: { CdeIcon: { template: '<i />' } } } });
        const text = dxf([LINE('WAND', 0, 0, 6, 0), LWPOLY('Bodenplatte', [[0, 0], [4, 0], [4, 3], [0, 3]], true)]);
        const datei = Object.assign(new File([text], 'plan.dxf'), { arrayBuffer: async () => new TextEncoder().encode(text).buffer });
        const input = w.find('input[type="file"]');
        Object.defineProperty(input.element, 'files', { value: [datei] });
        await input.trigger('change');
        await new Promise(r => setTimeout(r, 0));
        await w.vm.$nextTick();
        const knopf = w.find('.bf-knopf.primaer');
        expect(knopf.attributes('disabled')).toBeUndefined();
        await knopf.trigger('click');
        await new Promise(r => setTimeout(r, 30));
        await w.vm.$nextTick();
        expect(w.text()).toContain('2 Bauteile angelegt');
        expect(ae.wirksamerStand('erzeugt').size).toBe(2);                 // vorher: 0 (abgelehnt)
        expect(new Set(ae.eintraege.map(e => e.vorgang)).size).toBe(1);    // vorher: 2
        expect(ae.eintraege[0].vorgangTitel).toBe('BIMFY: plan.dxf');
        expect(angewandt).toHaveLength(1);
        w.unmount();
    });

    const vier = () => liesDxf(dxf([
        LINE('WAND', 0, 0, 6, 0),
        LINE('KANAL', 0, 5, 20, 5),
        LWPOLY('Bodenplatte', [[0, 0], [4, 0], [4, 3], [0, 3]], true),
        CIRCLE('SCHACHT', 20, 5, 0.5),
    ])).geometrien;
    const sammlung = (teile) => vollesKommando({ werkzeug: SAMMLUNG, werte: { titel: 'BIMFY: test.dxf', teile: teile.map(vollesKommando) } });

    it('vier Kommandos werden EIN Vorgang mit EINEM Beleg — und ein Rückgängig nimmt alles zurück', async () => {
        const { kommandos } = kommandosFuer(gruppiere(vier()), { basisHoehe: 100 });
        const b = useBearbeitung();
        const ae = useAenderungen();
        const erg = await b.fuehreAus(sammlung(kommandos.map(k => k.kommando)), { kennungsgeber: () => `cde-s${++n}` });
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect(erg.abgelehnt).toEqual([]);
        expect(new Set(erg.eintraege.map(e => e.vorgang)).size).toBe(1);
        expect(ae.wirksamerStand('erzeugt').size).toBe(4);
        // Der Beleg ist die Sammlung, ihre Teile stehen ausgewertet darin (mit `neu`).
        const belege = ae.eintraege.filter(e => e.kommando);
        expect(belege).toHaveLength(1);
        expect(belege[0].kommando.werkzeug).toBe(SAMMLUNG);
        expect(belege[0].kommando.werte.teile.map(t => t.werkzeug)).toEqual(['wand-zeichnen', 'rohr-zeichnen', 'platte-zeichnen', 'schacht-zeichnen']);
        expect(belege[0].kommando.werte.teile.every(t => t.neu?.length)).toBe(true);
        expect(belege[0].vorgangTitel).toBe('BIMFY: test.dxf');

        await ae.zurueck('test');                                      // vorher: 4 Klicks
        expect(ae.wirksamerStand('erzeugt').size).toBe(0);
    });

    it('ein abgelehntes Teil fehlt und wird mit seiner Nummer gemeldet, die anderen gelten', async () => {
        const { kommandos } = kommandosFuer(gruppiere(vier()), { basisHoehe: 100 });
        const b = useBearbeitung();
        // Zweimal dieselbe Kennung: das zweite Teil darf sie nicht bekommen (E2 über die Teile).
        const erg = await b.fuehreAus(sammlung(kommandos.slice(0, 2).map(k => k.kommando)), { kennungsgeber: () => 'cde-doppelt' });
        expect(erg.ausgefuehrt).toBe(true);
        expect(erg.abgelehnt).toHaveLength(1);
        expect(erg.abgelehnt[0].index).toBe(1);
        expect(erg.abgelehnt[0].grund).toMatch(/gibt es schon/);
        expect(erg.kommando.werte.teile).toHaveLength(1);
        expect(useAenderungen().wirksamerStand('erzeugt').size).toBe(1);
    });

    it('die Prüfung: kein Ziel, nur Erzeugen, keine Sammlung in der Sammlung', () => {
        expect(pruefeKommando(sammlung([]))).toEqual(['Eine Sammlung braucht Teile (werte.teile)']);
        const innen = sammlung([{ werkzeug: 'wand-zeichnen', eingaben: { zug: [{ ost: 0, nord: 0 }, { ost: 1, nord: 0 }] } }]);
        expect(pruefeKommando(sammlung([innen]))[0]).toMatch(/Sammlung in einer Sammlung/);
        expect(pruefeKommando({ ...innen, ziel: ['cde-x'] })[0]).toMatch(/kein Ziel/);
        expect(pruefeKommando(sammlung([{ werkzeug: 'gibts-nicht' }]))[0]).toMatch(/Teil 1: Das Werkzeug/);
    });
});
