// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseIsybauXML } from '../utils/xmlParser.js';

const here = dirname(fileURLToPath(import.meta.url));
const testXml = readFileSync(join(here, 'test.xml'), 'utf8');

describe('parseIsybauXML (Fixture test.xml)', () => {
    const parsed = parseIsybauXML(testXml);

    it('liefert network/inspections/hydraulics', () => {
        expect(parsed.network.nodes.size).toBeGreaterThan(0);
        expect(parsed.network.edges.size).toBeGreaterThan(0);
        expect(Array.isArray(parsed.inspections)).toBe(true);
        expect(parsed.hydraulics).toHaveProperty('areas');
        expect(parsed.hydraulics).toHaveProperty('catchments');
    });

    it('Knoten haben numerische Sohlhöhen nach Interpolation', () => {
        for (const n of parsed.network.nodes.values()) {
            expect(typeof n.z).toBe('number');
            expect(Number.isNaN(n.z)).toBe(false);
        }
    });

    it('Entwaesserungsart (KM/KR/KS) wird an Knoten UND Kanten geparst', () => {
        expect(parsed.network.nodes.get('FK008')?.entwaesserungsart).toBe('KR');
        expect(parsed.network.edges.get('BE008')?.entwaesserungsart).toBe('KM');
    });
});

describe('parseIsybauXML (Synthetik: z=0 bleibt erhalten)', () => {
    const makeXml = (nodes, edges = '') => `<?xml version="1.0" encoding="UTF-8"?>
<Identifikation>
  <Datenkollektive>
    <Stammdatenkollektiv>
      <AbwassertechnischeAnlage/>
    </Stammdatenkollektiv>
  </Datenkollektive>
  ${nodes}
  ${edges}
</Identifikation>`;

    const nodeXml = (id, z) => `
  <AbwassertechnischeAnlage>
    <Objektbezeichnung>${id}</Objektbezeichnung>
    <Knoten>
      <Schacht><Schachttiefe>2.0</Schachttiefe></Schacht>
      <Geometrie>
        <Punkt>
          <PunktattributAbwasser>SMP</PunktattributAbwasser>
          <Rechtswert>100.0</Rechtswert>
          <Hochwert>200.0</Hochwert>
          ${z !== null ? `<Punkthoehe>${z}</Punkthoehe>` : ''}
        </Punkt>
      </Geometrie>
    </Knoten>
  </AbwassertechnischeAnlage>`;

    it('echtes z=0 wird NICHT als fehlend überschrieben', () => {
        const parsed = parseIsybauXML(makeXml(nodeXml('S0', 0.0) + nodeXml('S1', 5.0)));
        const n0 = [...parsed.network.nodes.values()].find(n => n.id === 'S0');
        expect(n0.z).toBe(0);
    });

    it('fehlendes z wird auf 0 gesetzt, wenn keine Nachbarn bekannt', () => {
        const parsed = parseIsybauXML(makeXml(nodeXml('S2', null)));
        const n = [...parsed.network.nodes.values()].find(node => node.id === 'S2');
        expect(typeof n.z).toBe('number');
        expect(Number.isNaN(n.z)).toBe(false);
    });
});

// P3: stille Ersatzwerte des Parsers werden gemeldet (Import-Sammelbericht)
describe('Parser-Hinweise', () => {
    it('IGBWEST: Sohle 0 m unter hohem Deckel und fehlende Profilhöhe werden genannt, nichts erfunden', () => {
        const p = parseIsybauXML(readFileSync(join(here, '9161_IGBWEST_Hydraulik.xml'), 'latin1'));
        const text = p.warnings.join('\n');
        expect(text).toMatch(/Sohlhöhe 0 m, aber Deckelhöhe über 20 m/);
        expect(text).toMatch(/Haltung FK001: Profilhöhe fehlt/);
        expect(p.network.edges.get('FK001').profile.height).toBe(0); // vorher still 0,3 m
    });
    it('saubere Datei: keine Hinweise', () => {
        const p = parseIsybauXML(testXml);
        expect(p.warnings).toEqual([]);
    });
});

describe('Abflussbeiwert der Flächen (Befund 8)', () => {
    // test.xml hat bei keiner Fläche ein <Abflussbeiwert>. Vorher wurde daraus
    // 0 — „kein Abfluss“ —, und die Programmvorgabe in Area griff nicht, weil
    // 0 als bewusst gesetzt galt. Jetzt: fehlt = null, Area setzt die Vorgabe.
    const flaechen = parseIsybauXML(testXml).hydraulics.areas;

    it('fehlender Abflussbeiwert wird null, nicht 0', () => {
        expect(flaechen.length).toBeGreaterThan(0);
        expect(flaechen.every(a => a.runoffCoeff === null)).toBe(true);
    });

    it('ein eingetragener Wert — auch 0 — bleibt', () => {
        const xml = testXml.replace(/(<Flaechengroesse>[^<]*<\/Flaechengroesse>)/, '$1<Abflussbeiwert>0</Abflussbeiwert>');
        const erste = parseIsybauXML(xml).hydraulics.areas.find(a => a.runoffCoeff !== null);
        expect(erste?.runoffCoeff).toBe(0);
    });
});
