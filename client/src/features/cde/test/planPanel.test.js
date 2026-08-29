// @vitest-environment jsdom
/**
 * Plan-Panel, Bemaßung und Ausgabe (Sprint I, AP-9/10/11).
 *
 * Bis hierher lagen die achtzehn Zeichenoptionen als Refs im PDF-Export-Modal
 * und wurden über `localStorage` gesichert. Der Bildschirmplan bekam in
 * `CdeView` eine feste Standardausstattung — zehn Optionen, die
 * `IfcPlanCanvas` längst durchreicht, waren dort still aus: Böschungs-
 * schraffur, Höhenlinien, UTM-Kreuze, Haltungsbeschriftung, Wasserzeichen,
 * Messstrecken, Achsenraster, Bemaßung.
 *
 * Zwei Dinge prüfen diese Tests besonders:
 *
 *  1. Die **Feldnamen** in der Übersetzung zum Exporter (`minSlopeDeg`,
 *     `tickSpacingMm`, `interval`). Ein falscher Name wirft nicht — er
 *     zeichnet still gar nichts, und das fällt erst am gedruckten Blatt auf.
 *  2. Die Bemaßung liegt in **Weltkoordinaten**. Der Exporter verankerte sie
 *     vorher in Prozent der Zeichenfläche: die Maße überlebten Schwenk und
 *     Maßstabswechsel und behaupteten danach an einer anderen Stelle des
 *     Modells weiter ihren alten Wert.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { usePlan, PLAN_VORGABEN } from '../stores/usePlan';
import { useIfcStore } from '../stores/useIfcStore';
import { drawVectorPlan } from '../services/IfcVectorPlotter';
import { erstelleMockDoc } from './helpers/mockDoc';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('Zeichenoptionen', () => {
  it('übersetzt in genau die Feldnamen, die der Exporter liest', async () => {
    const plan = usePlan();
    await plan.bereit;
    plan.setzeOption('slopeHatch', true);
    plan.setzeOption('slopeMinAngle', 27);
    plan.setzeOption('slopeTickMm', 4);
    plan.setzeOption('contours', true);
    plan.setzeOption('contourInterval', 0.25);

    const z = plan.zeichenOptionen;
    // IfcPdfExporter liest `slopeHatch.minSlopeDeg` und `.tickSpacingMm`
    // (nicht minAngleDeg) sowie `contours.interval`.
    expect(z.slopeHatch).toEqual({ enabled: true, minSlopeDeg: 27, tickSpacingMm: 4 });
    expect(z.contours).toEqual({ enabled: true, interval: 0.25 });
  });

  it('macht aus abgeschalteten Paketen `null`, nicht `false`', async () => {
    // Der Exporter prüft auf Wahrheit, aber `collectVectorContent` verzweigt
    // über `slopeHatch?.enabled` — ein `false` wäre zwar auch falsy, `null`
    // ist aber die Form, die der Rest des Hauses führt.
    const plan = usePlan();
    await plan.bereit;
    const z = plan.zeichenOptionen;
    expect(z.slopeHatch).toBeNull();
    expect(z.contours).toBeNull();
    expect(z.utmGrid).toBeNull();
  });

  it('lässt die Engine-Teile offen — der Store kennt sie nicht', async () => {
    // `apis` (web-ifc-Instanzen) und `coordOffsets` weiß nur die Engine.
    // Sie kommen in IfcPlanCanvas bzw. usePlanExport dazu.
    const plan = usePlan();
    await plan.bereit;
    plan.setzeOption('axisLabels', true);
    plan.setzeOption('utmGrid', true);
    expect(plan.zeichenOptionen.axisLabels).toEqual({ enabled: true });
    expect(plan.zeichenOptionen.utmGrid).toEqual({ flipNorth: false });
  });

  it('nimmt keine erfundenen Schlüssel an', async () => {
    const plan = usePlan();
    await plan.bereit;
    expect(plan.setzeOption('gibtsNicht', true)).toBe(false);
    expect('gibtsNicht' in plan.optionen).toBe(false);
  });

  it('überlebt einen gespeicherten Stand ohne die neueste Option', async () => {
    // Wer eine Option ergänzt, soll nicht alle gespeicherten Stände entwerten.
    const plan = usePlan();
    await plan.bereit;
    plan.setzeOption('contours', true);

    setActivePinia(createPinia());
    const zweiter = usePlan();
    await zweiter.bereit;
    expect(zweiter.optionen.contours).toBe(true);
    // Fehlende Schlüssel bekommen die Vorgabe, unbekannte fallen weg.
    expect(Object.keys(zweiter.optionen).sort()).toEqual(Object.keys(PLAN_VORGABEN).sort());
  });
});

describe('Bemaßung liegt in Weltkoordinaten', () => {
  it('speichert Weltpunkte und rechnet die Länge daraus', async () => {
    const ifc = useIfcStore();
    await ifc.ready;
    const d = ifc.addPlanDimension({ x: 10, z: 20 }, { x: 13, z: 24 });
    expect(d.p1).toEqual({ x: 10, z: 20 });
    expect(d.p2).toEqual({ x: 13, z: 24 });
    expect(d.dist).toBeCloseTo(5, 6);          // 3-4-5
  });

  it('legt kein Maß der Länge null an', async () => {
    // Sonst erzeugt ein Doppelklick eine Marke, die man kaum wieder trifft.
    const ifc = useIfcStore();
    await ifc.ready;
    expect(ifc.addPlanDimension({ x: 1, z: 1 }, { x: 1, z: 1 })).toBeNull();
    expect(ifc.planDimensions).toHaveLength(0);
  });

  it('entfernt einzeln und im Ganzen', async () => {
    const ifc = useIfcStore();
    await ifc.ready;
    const a = ifc.addPlanDimension({ x: 0, z: 0 }, { x: 1, z: 0 });
    ifc.addPlanDimension({ x: 0, z: 0 }, { x: 0, z: 2 });
    expect(ifc.planDimensions).toHaveLength(2);
    ifc.removePlanDimension(a.id);
    expect(ifc.planDimensions).toHaveLength(1);
    ifc.clearPlanDimensions();
    expect(ifc.planDimensions).toHaveLength(0);
  });
});

describe('Bemaßung im Plan', () => {
  const M = 10, DW = 100, DH = 100;
  const KAMERA = {
    left: -50, right: 50, top: 50, bottom: -50, zoom: 1,
    position: { x: 0, y: 100, z: 0 },
  };
  // Welt → Papier, wie der Plotter rechnet (siehe vectorPlan.test.js).
  const pX = (wx) => wx + 60;
  const pY = (wz) => wz + 60;

  function zeichne(opts) {
    const doc = erstelleMockDoc();
    drawVectorPlan(doc, KAMERA, M, DW, DH, opts);
    return doc;
  }

  it('zeichnet die Maßlinie an den Weltpunkten', async () => {
    const linien = zeichne({
      dimensions: [{ id: 'a', p1: { x: -10, z: -10 }, p2: { x: 10, z: -10 }, dist: 20 }],
    }).nur('line');
    // Die Maßlinie selbst — Hilfslinien und Endschrägen kommen dazu.
    expect(linien.some((c) =>
      Math.abs(c.args[0] - pX(-10)) < 0.01 && Math.abs(c.args[1] - pY(-10)) < 0.01 &&
      Math.abs(c.args[2] - pX(10)) < 0.01 && Math.abs(c.args[3] - pY(-10)) < 0.01,
    )).toBe(true);
    // Maßhilfslinien + Endschrägen an beiden Enden: fünf Striche insgesamt.
    expect(linien).toHaveLength(5);
  });

  it('schreibt die Länge mittig — mit Halo, damit sie über Linienwerk lesbar bleibt', () => {
    const texte = zeichne({
      dimensions: [{ id: 'a', p1: { x: -10, z: 0 }, p2: { x: 10, z: 0 }, dist: 20 }],
    }).nur('text').filter((c) => c.args[0] === '20.00 m');
    // Vier Halo-Kopien + die eigentliche Zahl.
    expect(texte).toHaveLength(5);
    const mitte = texte[4];
    expect(mitte.args[1]).toBeCloseTo(pX(0), 6);
  });

  it('zeichnet nichts ohne Maße', () => {
    expect(zeichne({}).nur('line')).toHaveLength(0);
    expect(zeichne({ dimensions: [] }).nur('line')).toHaveLength(0);
  });

  it('lässt Maße weg, die ganz außerhalb des Blattes liegen', () => {
    expect(zeichne({
      dimensions: [{ id: 'weit', p1: { x: 9000, z: 9000 }, p2: { x: 9010, z: 9000 }, dist: 10 }],
    }).nur('line')).toHaveLength(0);
  });
});
