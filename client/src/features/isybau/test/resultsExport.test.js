import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  parseInpSubcatchments,
  buildSubcatchmentProvenance,
  buildResultsExport,
} from '../utils/resultsExport.js';

// Ausschnitt aus dem echten Export (simulation_results_2026-08-18.json),
// der den Fehlalarm "jedes Teilgebiet doppelt" ausgelöst hat.
const INP = `
[SUBCATCHMENTS]
;;Subcatchment   RainGage         Outlet           Area       %Imperv    Width      %Slope     CurbLen
FK001.1          RG1              FK001            0.028      30.000     16.613     7.000      0
FK001.1_2        RG1              RRB              0.028      30.000     16.613     7.000      0
FK003.1          RG1              FK003            0.703      30.000     83.848     20.000     0
FK003.1_2        RG1              FK001            0.703      30.000     83.848     20.000     0
Direkt.1         RG1              K9               1.500      30.000     83.848     20.000     0

[SUBAREAS]
;;Subcatchment   N-Imperv
FK001.1          0.01
`;

describe('parseInpSubcatchments', () => {
  it('liest Name, Outlet und Fläche aus der [SUBCATCHMENTS]-Sektion', () => {
    const subs = parseInpSubcatchments(INP);
    expect(subs).toHaveLength(5);
    expect(subs[0]).toMatchObject({ name: 'FK001.1', outlet: 'FK001', areaHa: 0.028 });
  });

  it('hört bei der nächsten Sektion auf und ignoriert Kommentarzeilen', () => {
    const names = parseInpSubcatchments(INP).map(s => s.name);
    expect(names).not.toContain(';;Subcatchment');
    expect(names.filter(n => n === 'FK001.1')).toHaveLength(1); // nicht aus [SUBAREAS]
  });

  it('ist robust gegen leere/ungültige Eingaben', () => {
    expect(parseInpSubcatchments('')).toEqual([]);
    expect(parseInpSubcatchments(null)).toEqual([]);
  });
});

describe('buildSubcatchmentProvenance — Nachweis gegen Doppelzählung', () => {
  const areas = [
    { id: 'FK001.1', size: 0.0552 },
    { id: 'FK003.1', size: 1.4061 },
    { id: 'Direkt.1', size: 1.5 },
  ];

  it('weist die beiden Hälften als EINE Quellfläche aus', () => {
    const rows = buildSubcatchmentProvenance(INP, areas);
    const fk001 = rows.find(r => r.quellflaeche === 'FK001.1');
    expect(fk001.aufgeteilt).toBe(true);
    expect(fk001.teilgebiete.map(t => t.name)).toEqual(['FK001.1', 'FK001.1_2']);
  });

  it('belegt, dass die Summe der Teilflächen die Quellfläche ergibt', () => {
    const rows = buildSubcatchmentProvenance(INP, areas);
    for (const id of ['FK001.1', 'FK003.1']) {
      const row = rows.find(r => r.quellflaeche === id);
      expect(row.summeStimmtMitQuellflaeche).toBe(true);
    }
  });

  it('markiert ungeteilte Flächen nicht als aufgeteilt', () => {
    const rows = buildSubcatchmentProvenance(INP, areas);
    const direkt = rows.find(r => r.quellflaeche === 'Direkt.1');
    expect(direkt.aufgeteilt).toBe(false);
    expect(direkt.teilgebiete).toHaveLength(1);
  });

  it('ordnet "_2" nicht versehentlich einer kürzer benannten Fläche zu', () => {
    // Falle: Fläche "FK001" existiert zusätzlich — "FK001.1_2" darf NICHT dort landen.
    const rows = buildSubcatchmentProvenance(INP, [...areas, { id: 'FK001', size: 9 }]);
    const fk001Kurz = rows.find(r => r.quellflaeche === 'FK001');
    expect(fk001Kurz).toBeUndefined();
  });

  it('meldet Teilgebiete, die keiner Quellfläche zuzuordnen sind', () => {
    const rows = buildSubcatchmentProvenance(INP, [{ id: 'FK001.1', size: 0.0552 }]);
    const rest = rows.find(r => r._nichtZugeordneteTeilgebiete);
    expect(rest._nichtZugeordneteTeilgebiete).toContain('Direkt.1');
  });
});

describe('buildSubcatchmentProvenance — gegen die echte Projektdatei', () => {
  it('bestätigt für ALLE Flächen der 9161-Datei: Summe == Quellfläche', () => {
    // Ground truth: der Export, der den Fehlalarm ausgelöst hat.
    const jsonPath = path.resolve(__dirname, 'simulation_results_2026-08-18.json');
    if (!fs.existsSync(jsonPath)) return; // Datei optional (gross)
    const results = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const subs = parseInpSubcatchments(results.input);
    expect(subs.length).toBeGreaterThan(0);

    // Quellflächen aus den INP-Hälften rekonstruieren: jede Basis kommt 1x oder 2x vor.
    const bases = new Map();
    for (const s of subs) {
      const base = s.name.replace(/_2$/, '');
      bases.set(base, (bases.get(base) || 0) + (s.areaHa || 0));
    }
    const areas = Array.from(bases, ([id, sum]) => ({ id, size: sum }));

    const rows = buildSubcatchmentProvenance(results.input, areas);
    const fehlerhaft = rows.filter(r => r.summeStimmtMitQuellflaeche === false);
    expect(fehlerhaft).toEqual([]);
  });
});

describe('buildResultsExport', () => {
  const base = {
    results: { input: INP, systemStats: { flow: { error: 0.1 } } },
    areas: [{ id: 'FK001.1', size: 0.0552, runoffCoeff: 0.3, slope: 3, nodeId: 'FK001', nodeId2: 'RRB', splitRatio: 50 }],
    nodes: [{ id: 'Pumpwerk', type: 'Bauwerk', bauwerkstyp: 6, z: 310.76 }],
    edges: [{ id: 'H1' }],
    metadata: { fileName: 'test.xml' },
    erzeugtAm: '2026-08-20T00:00:00.000Z',
    bauwerkLabel: (n) => (n.bauwerkstyp === 6 ? 'Pumpe' : null),
  };

  it('bettet die Original-Ergebnisse unverändert ein', () => {
    const out = buildResultsExport(base);
    expect(out.ergebnisse).toEqual(base.results);
  });

  it('erklärt die _2-Konvention direkt im Export', () => {
    const out = buildResultsExport(base);
    expect(out._hinweise.teilgebiete).toMatch(/KEINE Duplikate/);
  });

  it('liefert die Eingangsflächen inkl. Aufteilung mit', () => {
    const out = buildResultsExport(base);
    expect(out.eingangsdaten.flaechen[0]).toMatchObject({
      id: 'FK001.1', groesseHa: 0.0552, anschlussKnoten2: 'RRB', aufteilungProzent: 50,
    });
  });

  it('löst den Bauwerkstyp im Klartext auf', () => {
    const out = buildResultsExport(base);
    expect(out.eingangsdaten.knoten[0].bauwerkstypBezeichnung).toBe('Pumpe');
  });

  it('zählt den Umfang korrekt', () => {
    const out = buildResultsExport(base);
    expect(out.umfang).toMatchObject({ schaechteUndBauwerke: 1, haltungen: 1, flaechen: 1 });
  });

  it('funktioniert auch ohne Ergebnisse/INP, ohne zu werfen', () => {
    expect(() => buildResultsExport({})).not.toThrow();
  });
});

// P1.6: mm aus SWMMs Spalte, Bezugsfläche aus der gerechneten .inp — nicht aus der
// aktuellen Editorfläche (die sich nach dem Lauf ändern kann).
describe('Niederschlagsbilanz', async () => {
  const { niederschlagsBilanz, rechenflaecheAusInp } = await import('../utils/swmm/niederschlagsBilanz.js');
  it('nimmt die mm-Spalte von SWMM, auch wenn die Editorfläche abweicht', () => {
    const runoff = { precip: 0.194, precipMm: 43.27, runoff: 0.078, runoffMm: 17.4, infil: 0.091, infilMm: 20.3 };
    const b = niederschlagsBilanz(runoff, 9.9); // Editor: doppelt so viel Fläche
    expect(b.precipMm).toBe(43.27);
    expect(b.runoffMm).toBe(17.4);
    expect(b.psi).toBeCloseTo(0.402, 3);
    expect(b.quelle).toBe('swmm');
  });
  it('Bezugsfläche = Summe [SUBCATCHMENTS] der .inp', () => {
    const inp = '[SUBCATCHMENTS]\n;;Name Rain Outlet Area\nA1 RG N1 0.25 50 10 1 0\nA1_2 RG N2 0.25 50 10 1 0\n\n[SUBAREAS]\nA1 0.01 0.1 1 2 0 OUTLET\n';
    expect(rechenflaecheAusInp(inp)).toBeCloseTo(0.5, 9);
    expect(rechenflaecheAusInp('')).toBe(0);
  });
});

// P1.11: Auswertung je Haltung (Q/Qvoll und Einstau getrennt), gerechneter Regen, Einheiten.
describe('Ergebnisexport: Auswertung und Regen des Laufs', async () => {
  const { buildResultsExport } = await import('../utils/resultsExport.js');
  const results = {
    edges: { R_002: { type: 'CONDUIT', maxFlow: 3, capacity: 242.1, flowCapacityRatio: 0.01, depthRatio: 1 } },
    nodes: { S1: { overflow: true, floodingVolume: 21 } },
    lauf: { regen: { type: 'euler2', series: [{ time: 0, intensity: 100, height_mm: 3 }, { time: 5, intensity: 50, height_mm: 1.5 }], metadata: { duration: 10, interval: 5, returnPeriod: 'RN_003A' } }, dauerH: 2 },
  };
  const ex = buildResultsExport({ results, areas: [], nodes: [], edges: [], rain: { activeModelRain: { type: 'block', series: [] }, duration: 9 }, erzeugtAm: 'x' });
  it('Haltung: Q/Qvoll 1,2 %, Füllung 100 %, eingestaut', () => {
    expect(ex.auswertung.haltungen).toEqual([{ id: 'R_002', auslastungQQvollProzent: 1.2, fuellungsgradHHvollProzent: 100, eingestaut: true, status: 'eingestaut' }]);
    expect(ex.auswertung.knoten).toEqual([{ id: 'S1', zustand: 'überstaut', ueberstauvolumenM3: 21 }]);
  });
  it('Regen = der gerechnete (results.lauf), nicht der danach gesetzte', () => {
    expect(ex.eingangsdaten.regen).toEqual({ typ: 'euler2', quelle: null, dauerMin: 10, intervallMin: 5, wiederkehr: 'RN_003A', stuetzstellen: 2, summeMm: 4.5, simulationsdauerH: 2 });
  });
  it('Einheiten je Feld, kein „utilization" mehr', () => {
    expect(ex._hinweise.einheiten['ergebnisse.edges.*'].capacity).toBe('l/s (Qvoll)');
    expect(JSON.stringify(ex)).not.toContain('utilization');
  });
});
