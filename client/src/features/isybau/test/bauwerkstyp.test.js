// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseIsybauXML } from '../utils/xmlParser.js';
import { Node } from '../core/domain/Node.js';
import {
  resolveNodeUiType,
  syncBauwerkstypFromType,
  getEffectiveBauwerkstyp,
  Bauwerkstyp,
} from '../utils/mappings.js';

const toArr = (c) => !c ? [] : (Array.isArray(c) ? c
  : (c instanceof Map ? Array.from(c.values()) : Object.values(c)));

describe('Bauwerkstyp: Import → UI-Dropdown', () => {
  const xml = fs.readFileSync(
    path.resolve(__dirname, '../../../../public/saintv1d/tutorial/Beispiel_Tutorial.xml'), 'utf-8');
  const parsed = parseIsybauXML(xml);
  const nodes = toArr(parsed.network?.nodes);

  it('erkennt das Pumpwerk aus der Beispiel-XML als Bauwerkstyp 6 (Pumpe)', () => {
    const pump = nodes.find(n => n.id === 'Pumpwerk');
    expect(pump).toBeTruthy();
    expect(pump.bauwerkstyp).toBe(6);
    expect(Bauwerkstyp[pump.bauwerkstyp]).toBe('Pumpe');
  });

  it('löst den UI-Typ zur Pumpe auf statt zum generischen "Bauwerk"', () => {
    // Regression: ElementInfo zeigte für JEDES importierte Bauwerk
    // "Bauwerk (Allgemein)", weil es nur `type` las und `bauwerkstyp` ignorierte.
    const pump = Node.fromRaw(nodes.find(n => n.id === 'Pumpwerk'));
    expect(pump.type).toBe('Bauwerk');       // Rohtyp aus dem Parser
    expect(resolveNodeUiType(pump)).toBe(6); // aufgelöster Dropdown-Wert
  });

  it('gilt für alle Bauwerkstypen, nicht nur für Pumpen', () => {
    for (const btyp of Object.keys(Bauwerkstyp).map(Number)) {
      expect(resolveNodeUiType({ type: 'Bauwerk', bauwerkstyp: btyp })).toBe(btyp);
    }
  });

  it('lässt normale Schächte unangetastet', () => {
    expect(resolveNodeUiType({ type: 'Schacht' })).toBe('Standard');
    expect(resolveNodeUiType({ type: 'Standard' })).toBe('Standard');
    expect(resolveNodeUiType({ type: 'Bauwerk', bauwerkstyp: null })).toBe('Bauwerk');
  });
});

describe('Bauwerkstyp: Typwechsel im UI bleibt konsistent', () => {
  it('zieht bauwerkstyp beim Umstellen des Typs mit', () => {
    // Regression: Dropdowns schreiben nur `type`. Ohne Sync blieb eine
    // importierte Pumpe (bauwerkstyp 6) in SWMM eine Pumpe, obwohl im UI
    // längst "Wehr" (7) stand — getEffectiveBauwerkstyp bevorzugt bauwerkstyp.
    const node = { id: 'PW', type: 'Bauwerk', bauwerkstyp: 6 };
    node.type = 7;
    syncBauwerkstypFromType(node);
    expect(node.bauwerkstyp).toBe(7);
    expect(getEffectiveBauwerkstyp(node)).toBe(7);
  });

  it('räumt bauwerkstyp weg, wenn wieder ein normaler Schacht gewählt wird', () => {
    const node = { id: 'PW', type: 'Bauwerk', bauwerkstyp: 6 };
    node.type = 'Standard';
    syncBauwerkstypFromType(node);
    expect(node.bauwerkstyp).toBeNull();
    expect(getEffectiveBauwerkstyp(node)).toBeNull();
  });
});
