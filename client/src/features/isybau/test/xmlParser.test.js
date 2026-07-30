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
