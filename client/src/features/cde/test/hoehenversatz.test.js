// Der Höhenversatz — und die drei Anläufe, die er gekostet hat (Stufe 13.3).
//
//   1. Messung lief VOR `while (model.isBusy)` — `getPositions` gab auf dem
//      untesselierten Modell nichts zurück, die Funktion kehrte still um.
//   2. Null sah aus wie ein gültiges Ergebnis: „nicht gemessen" war von
//      „gemessen: 0" nicht unterscheidbar. Seitdem gibt es den Befund.
//   3. Der eigentliche Fehler: verglichen wurde die IFC-PLATZIERUNG mit
//      `model.getPositions()` — zwei verschiedene Punkte. `getPositions`
//      liefert die MITTE, die Platzierung einen Bezugspunkt des Autors.
//      Am echten Netz 6275_ENQUIER sitzt der bei 27 Schächten exakt auf der
//      Unterkante und bei 24 Haltungen am oberen Ende; die Differenz streute
//      dadurch um 10,21 m — genau die Zahl, die die Anzeige gemeldet hat.
//
// Deshalb vergleicht die Messung jetzt HÜLLE gegen HÜLLE: beide Seiten
// beschreiben denselben Körper, und dass Unter- und Oberkante denselben
// Versatz ergeben, ist der eingebaute Beweis, dass nur verschoben wurde.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { IfcEngine } from '../services/IfcEngine.js';

/** Höhenhüllen aus dem echten Netz (web-ifc, absolute Dateikoordinaten). */
const DATEI = new Map([
  [47, { min: 318.4, max: 318.9 }],    // IfcDistributionChamberElement
  [71, { min: 302.5, max: 303.1 }],
  [94, { min: 301.5, max: 303.0 }],
  [117, { min: 310.6, max: 310.9 }],
  [140, { min: 305.6, max: 305.9 }],
  [163, { min: 291.9, max: 292.5 }],
]);
const DATEI_MIN = 291.9, DATEI_MAX = 318.9;

function quelleMit(huellen, { lebt = true } = {}) {
  return {
    lebt: () => lebt,
    ids: () => [...huellen.keys()],
    hoehenHuellen: (ids) => new Map(ids.filter(i => huellen.has(i)).map(i => [i, huellen.get(i)])),
  };
}

/** Ein Modell, dessen Welthülle um `versatz` nach unten verschoben ist. */
function modellMit({ min, max } = {}) {
  return {
    modelId: 'm1',
    getMergedBox: async () => (min === undefined ? null : new THREE.Box3(
      new THREE.Vector3(0, min, 0), new THREE.Vector3(1, max, 1))),
  };
}

/** Engine-Hülle ohne Konstruktor — der bräuchte WebGL. */
function engineHuelle() {
  const e = Object.create(IfcEngine.prototype);
  e._coordOffsets = new Map();
  e._hoehenBefund = new Map();
  e._coordinationOffset = new THREE.Vector3();
  return e;
}

describe('_hoehenversatzMessen', () => {
  it('misst den Versatz aus Unter- UND Oberkante', async () => {
    // Das Bild aus Fabios Screenshot: der Viewer zeigt −16,851 statt ~271,
    // das Modell liegt also rund 288 m zu tief.
    const C = 287.8;
    const e = engineHuelle();
    const off = new THREE.Vector3(-2577200, 0, 5465600);

    const b = await e._hoehenversatzMessen(
      modellMit({ min: DATEI_MIN - C, max: DATEI_MAX - C }), quelleMit(DATEI), off);

    expect(b.art).toBe('gemessen');
    expect(b.wert).toBeCloseTo(C, 6);
    expect(b.n).toBe(6);
    expect(off.y).toBeCloseTo(C, 6);
    expect(e._coordOffsets.get('m1')).toBe(off);
    // Die Lage stimmte bereits — die Höhenmessung darf sie nicht anfassen.
    expect(off.x).toBe(-2577200);
    expect(off.z).toBe(5465600);
  });

  it('setzt auch dann, wenn das Modell gar nicht verschoben ist', async () => {
    // Sonst wäre „unverschoben" von „nicht gemessen" nicht unterscheidbar —
    // und genau diese Verwechslung hat Anlauf 2 gekostet.
    const e = engineHuelle();
    const off = new THREE.Vector3();
    const b = await e._hoehenversatzMessen(
      modellMit({ min: DATEI_MIN, max: DATEI_MAX }), quelleMit(DATEI), off);
    expect(b.art).toBe('gemessen');
    expect(b.wert).toBeCloseTo(0, 6);
  });

  it('setzt NICHTS, wenn Unter- und Oberkante sich widersprechen', async () => {
    // Gestauchtes Modell: die Hülle ist nicht nur verschoben, sondern anders
    // hoch. Ein Mittelwert daraus stimmte für kein einziges Bauteil.
    const e = engineHuelle();
    const off = new THREE.Vector3();
    const b = await e._hoehenversatzMessen(
      modellMit({ min: DATEI_MIN - 287.8, max: DATEI_MAX - 280 }), quelleMit(DATEI), off);

    expect(b.art).toBe('uneinheitlich');
    expect(b.text).toMatch(/keine reine Verschiebung/);
    expect(off.y).toBe(0);
    expect(e._coordOffsets.has('m1')).toBe(false);
  });

  it('meldet, statt still 0 stehen zu lassen, wenn die Weltlage fehlt', async () => {
    // Anlauf 1: vor der Tessellierung gibt das Modell nichts her.
    const e = engineHuelle();
    const off = new THREE.Vector3();
    const b = await e._hoehenversatzMessen(modellMit({}), quelleMit(DATEI), off);

    expect(b.art).toBe('keine-weltlage');
    expect(off.y).toBe(0);
    expect(e.hoehenBefund('m1').text).toMatch(/nicht lesbar/);
  });

  it('vergleicht nur Bauteile, die BEIDE Seiten kennen', async () => {
    // Deckten die zwei Hüllen verschiedene Körper ab, wäre die Differenz die
    // Auswahl und nicht der Versatz. Hier liefert die Datei zu einem Bauteil
    // nichts — die Welthülle muss dann ebenfalls ohne dieses gebildet werden.
    const luecke = new Map(DATEI); luecke.delete(47);       // die höchste Kante
    const C = 287.8;
    const e = engineHuelle();
    const off = new THREE.Vector3();
    let gefragt = null;
    const model = { modelId: 'm1', getMergedBox: async (ids) => { gefragt = ids;
      return new THREE.Box3(new THREE.Vector3(0, DATEI_MIN - C, 0),
                            new THREE.Vector3(1, 310.9 - C, 1)); } };

    const b = await e._hoehenversatzMessen(model, quelleMit(luecke), off);
    expect(gefragt).not.toContain(47);
    expect(b.art).toBe('gemessen');
    expect(b.wert).toBeCloseTo(C, 6);
  });

  it('meldet eine tote Quelle, eine leere Datei und fehlende Geometrie', async () => {
    const e = engineHuelle();
    expect((await e._hoehenversatzMessen(modellMit({ min: 0, max: 1 }),
      quelleMit(DATEI, { lebt: false }), new THREE.Vector3())).art).toBe('ohne-quelle');
    expect((await e._hoehenversatzMessen(modellMit({ min: 0, max: 1 }),
      null, new THREE.Vector3())).art).toBe('ohne-quelle');
    expect((await e._hoehenversatzMessen(modellMit({ min: 0, max: 1 }),
      quelleMit(new Map()), new THREE.Vector3())).art).toBe('keine-bauteile');
    // Bauteile da, aber keines mit auswertbarer Geometrie
    const ohneGeo = { lebt: () => true, ids: () => [1, 2, 3], hoehenHuellen: () => new Map() };
    expect((await e._hoehenversatzMessen(modellMit({ min: 0, max: 1 }),
      ohneGeo, new THREE.Vector3())).art).toBe('keine-geometrie');
  });
});

describe('der Befund erreicht die Anzeige', () => {
  it('alleHoehenBefunde gibt je Modell Auskunft', async () => {
    const e = engineHuelle();
    await e._hoehenversatzMessen(
      modellMit({ min: DATEI_MIN - 287.8, max: DATEI_MAX - 287.8 }),
      quelleMit(DATEI), new THREE.Vector3());
    expect(Object.keys(e.alleHoehenBefunde())).toEqual(['m1']);
    expect(e.alleHoehenBefunde().m1.wert).toBeCloseTo(287.8, 6);
  });
});
