/**
 * P3: Rundreise Import → Store → Bearbeiten → XML-Export → Import. Maßstab ist die
 * Rechnung: dieselbe SWMM-Eingabedatei vorher und nachher. Vorher (2026-09-26) wichen
 * im Übungsnetz 16 Zeilen ab (Aufteilung, Schmutzwasser, konstanter Zufluss,
 * Pumpenschaltpunkte, erfundene Profilhöhe 300 mm) und in IGBWEST fehlende Sohlhöhen → 0 m.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { setActivePinia, createPinia } from 'pinia';
import { JSDOM } from 'jsdom';
globalThis.DOMParser ??= new JSDOM('').window.DOMParser;
const { useIsybauStore } = await import('../store/index.js');
const { parseIsybauXML } = await import('../utils/xmlParser.js');
const { buildIsybauXML } = await import('../utils/xmlExporter.js');
const { dekodiereXml } = await import('../utils/xmlKodierung.js');
const { SwmmBuilder } = await import('../core/services/SwmmBuilder.js');
const inp = (s) => { const pl = JSON.parse(JSON.stringify({ n: s.nodeArray.map(n => n.toJSON()), e: s.edgeArray.map(e => e.toJSON()), a: s.areaArray.map(a => a.toJSON()) }));
  const b = new SwmmBuilder({ get getAllNodes() { return pl.n; }, get getAllEdges() { return pl.e; }, areas: pl.a }); b.setOptions({ durationHours: 1, rainSeries: [{ time: 0, intensity: 100 }], rainInterval: 5 });
  const r = b.build(); return (r.inpContent ?? r.inp ?? r).split('\n'); };
const lies = (p) => dekodiereXml(readFileSync(new URL(p, import.meta.url)));
const laden = (xml) => { setActivePinia(createPinia()); const s = useIsybauStore(); s.loadParsedData(parseIsybauXML(xml)); return s; };
const snap = (s) => ({ n: new Map(s.nodeArray.map(n => [n.id, n.toJSON()])), e: new Map(s.edgeArray.map(e => [e.id, e.toJSON()])), a: new Map(s.areaArray.map(a => [a.id, a.toJSON()])) });
const gleich = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-3);
describe('ISYBAU-Rundreise', () => {
  for (const datei of ['../../../../public/saintv1d/tutorial/Beispiel_Tutorial.xml', './test.xml', './9161_IGBWEST_Hydraulik.xml']) {
   it(`${datei.split('/').pop()}: gleiche SWMM-Eingabe, Nutzerfelder bleiben`, () => {
    const s = laden(lies(datei));
    if (datei.includes('Tutorial')) {
      // typische Bearbeitungen aus Übung und Datenmaske
      const split = s.areaArray.find(a => a.nodeId2 || a.edgeId) ?? s.areaArray[0];
      s.updateArea(split.id, { splitRatio: 30, runoffCoeff: 0.77, slope: 3 });
      const direkt = s.areaArray.find(a => a.id !== split.id);
      s.updateArea(direkt.id, { runoffCoeff: 0.45, schmutzfracht: { einwohnerwerte: 120, einwohnerdichte: 60, wasserverbrauch: 130, tagesspitzenfaktor: 2.1 } });
      // kSt 60 ≠ Materialvorgabe: bewusst gesetzt. (Ein Wert GLEICH der Vorgabe gilt als
      // „automatisch“ — so speicherten ihn alte Projekte mit, utils/rauheit.js rauheitManuell.)
      s.updateEdge('R_010', { roughness: 60, material: 'PVC-U' });
      s.updateEdge('R_011', { profile: { ...s.edges.get('R_011').profile, height: 0.4 } });
      s.updateNode('R_010', { isManhole: false, canOverflow: false }); // druckdicht
      s.updateNode('R_011', { coverZ: s.nodes.get('R_011').coverZ + 0.2, diameter: 1.5 });
      s.updateNode('Pumpwerk', { pumpRate: 40, pumpHead: 6, onDepth: 1.2, offDepth: 0.4 });
      s.updateNode('R_012', { type: 7, weirHeight: 1.1, wehrWidth: 2 });
      s.updateNode('R_013', { constantInflow: 2.5 });
    }
    const vor = snap(s);
    const { xml, warnings } = buildIsybauXML({ nodes: s.nodeArray.map(n => n.toJSON()), edges: s.edgeArray.map(e => e.toJSON()), areas: s.areaArray.map(a => a.toJSON()), metadata: s.metadata });
    const s2 = laden(xml);
    const nach = snap(s2);
    const i1 = inp(s), i2 = inp(s2);
    const m2 = new Set(i2), m1 = new Set(i1);
    const inpDiff = { weg: i1.filter(z => !m2.has(z)).slice(0, 40), neu: i2.filter(z => !m1.has(z)).slice(0, 40), wegAnzahl: i1.filter(z => !m2.has(z)).length };
    const diff = {};
    for (const art of ['n', 'e', 'a']) {
      for (const [id, v] of vor[art]) {
        const w = nach[art].get(id);
        if (!w) { diff[art + ':FEHLT'] = (diff[art + ':FEHLT'] || 0) + 1; continue; }
        for (const k of new Set([...Object.keys(v), ...Object.keys(w)])) {
          if (!gleich(v[k], w[k])) { const key = art + '.' + k; diff[key] = diff[key] || { anzahl: 0, bsp: null }; diff[key].anzahl++; diff[key].bsp ??= { id, vor: JSON.stringify(v[k])?.slice(0, 80), nach: JSON.stringify(w[k])?.slice(0, 80) }; }
        }
      }
      if (nach[art].size !== vor[art].size) diff[art + ':Anzahl'] = vor[art].size + ' -> ' + nach[art].size;
    }
    expect(inpDiff.weg).toEqual([]);
    expect(inpDiff.neu).toEqual([]);
    expect(Object.keys(diff).filter(k => k.includes('FEHLT') || k.includes('Anzahl'))).toEqual([]);
    if (datei.includes('Tutorial')) {
      const g = (id) => s2.nodes.get(id);
      expect([g('R_010').isManhole, g('R_010').canOverflow]).toEqual([false, false]);
      expect(g('R_013').constantInflow).toBe(2.5);
      expect([g('Pumpwerk').pumpRate, g('Pumpwerk').onDepth, g('Pumpwerk').offDepth]).toEqual([40, 1.2, 0.4]);
      const split2 = s2.areas.find(a => a.id === s.areaArray.find(a => a.splitRatio === 30).id);
      expect(split2.splitRatio).toBe(30);
      expect(s2.areas.find(a => a.schmutzfracht?.wasserverbrauch === 130)?.schmutzfracht.tagesspitzenfaktor).toBe(2.1);
      expect(s2.edges.get('R_010').roughness).toBe(60);
    }
    if (datei.includes('IGBWEST')) expect(s2.edges.get('626.32').z1).toBeNull(); // fehlt bleibt fehlt
   });
  }
});
