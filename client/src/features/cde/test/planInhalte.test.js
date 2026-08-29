// @vitest-environment jsdom
/**
 * Gesetzte Planinhalte (Sprint I, Stufe 7).
 *
 * Beschriftungen und Symbole, die jemand IM Plan gesetzt hat — im Unterschied
 * zu dem, was aus dem Modell abgeleitet wird. Die Unterscheidung trägt die
 * ganze Gestaltung: abgeleitete Bauteilbeschriftung wird bei jedem
 * Maßstabswechsel neu gerechnet und darf weggelassen werden, wenn kein Platz
 * ist. Was hier liegt, hat jemand hingesetzt und bleibt.
 *
 * Deshalb Weltkoordinaten — dieselbe Entscheidung wie bei der Bemaßung.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { usePlanInhalt, TEXT_GROESSE_MM } from '../stores/usePlanInhalt';
import { drawVectorPlan } from '../services/IfcVectorPlotter';
import { erstelleMockDoc } from './helpers/mockDoc';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('usePlanInhalt', () => {
  it('setzt Beschriftung an einem Weltpunkt', async () => {
    const s = usePlanInhalt();
    await s.bereit;
    const e = s.addText({ x: 12, z: -4 }, '  RW-Kanal DN 300  ');
    expect(e).toMatchObject({ art: 'text', x: 12, z: -4, text: 'RW-Kanal DN 300' });
    expect(e.groesse).toBe(TEXT_GROESSE_MM);
    expect(s.anzahl).toBe(1);
  });

  it('legt keine leere Beschriftung an', async () => {
    // Eine leere Marke wäre unsichtbar und ließe sich nicht mehr anklicken,
    // um sie loszuwerden.
    const s = usePlanInhalt();
    await s.bereit;
    expect(s.addText({ x: 0, z: 0 }, '')).toBeNull();
    expect(s.addText({ x: 0, z: 0 }, '   ')).toBeNull();
    expect(s.anzahl).toBe(0);
  });

  it('nimmt nur Symbole, die es gibt', async () => {
    const s = usePlanInhalt();
    await s.bereit;
    expect(s.addSymbol({ x: 0, z: 0 }, 'schacht')).toMatchObject({ art: 'symbol', symbol: 'schacht' });
    expect(s.addSymbol({ x: 0, z: 0 }, 'gibtsnicht')).toBeNull();
    expect(s.anzahl).toBe(1);
  });

  it('verschiebt und entfernt einzeln', async () => {
    const s = usePlanInhalt();
    await s.bereit;
    const e = s.addSymbol({ x: 1, z: 1 }, 'pumpe');
    expect(s.verschiebe(e.id, { x: 5, z: 6 })).toBe(true);
    expect(s.inhalte[0]).toMatchObject({ x: 5, z: 6 });
    expect(s.verschiebe('gibtsnicht', { x: 0, z: 0 })).toBe(false);
    s.entferne(e.id);
    expect(s.anzahl).toBe(0);
  });

  it('findet den nächstgelegenen Inhalt im Radius', async () => {
    // Der Radius kommt in WELTMETERN herein: was „nah" heißt, hängt vom
    // Maßstab ab — bei 1:1000 sind 6 Papier-mm sechs Meter.
    const s = usePlanInhalt();
    await s.bereit;
    const nah = s.addSymbol({ x: 10, z: 10 }, 'schacht');
    s.addSymbol({ x: 40, z: 40 }, 'hydrant');

    expect(s.treffer({ x: 11, z: 10 }, 3)?.id).toBe(nah.id);
    expect(s.treffer({ x: 25, z: 25 }, 3)).toBeNull();
    // Bei zwei Kandidaten gewinnt der nähere.
    const naeher = s.addSymbol({ x: 10.2, z: 10 }, 'armatur');
    expect(s.treffer({ x: 10.3, z: 10 }, 3)?.id).toBe(naeher.id);
  });

  it('überlebt einen Neustart', async () => {
    const s = usePlanInhalt();
    await s.bereit;
    s.addText({ x: 3, z: 4 }, 'Bestand');
    await new Promise((r) => setTimeout(r, 300));   // Entprellung abwarten

    setActivePinia(createPinia());
    const zweiter = usePlanInhalt();
    await zweiter.bereit;
    expect(zweiter.inhalte).toHaveLength(1);
    expect(zweiter.inhalte[0].text).toBe('Bestand');
  });
});

describe('Planinhalte im Plan', () => {
  const M = 10, DW = 100, DH = 100;
  const KAMERA = {
    left: -50, right: 50, top: 50, bottom: -50, zoom: 1,
    position: { x: 0, y: 100, z: 0 },
  };
  const pX = (wx) => wx + 60;
  const pY = (wz) => wz + 60;

  function zeichne(opts) {
    const doc = erstelleMockDoc();
    drawVectorPlan(doc, KAMERA, M, DW, DH, opts);
    return doc;
  }

  it('schreibt die Beschriftung an ihren Weltpunkt', () => {
    const texte = zeichne({
      planInhalte: [{ id: 'a', art: 'text', x: -10, z: 5, text: 'Schacht 12', groesse: 2.5 }],
    }).nur('text').filter((c) => c.args[0] === 'Schacht 12');
    // Vier Halo-Kopien + die eigentliche Schrift.
    expect(texte).toHaveLength(5);
    expect(texte[4].args[1]).toBeCloseTo(pX(-10), 6);
    expect(texte[4].args[2]).toBeCloseTo(pY(5), 6);
  });

  it('zeichnet ein Symbol als Symbol, nicht als Text', () => {
    // Der Schacht ist Kreis + Diagonalkreuz — zwei Striche und ein Kreis.
    const doc = zeichne({
      planInhalte: [{ id: 'b', art: 'symbol', x: 0, z: 0, symbol: 'schacht', groesse: 4 }],
    });
    expect(doc.nur('circle')).toHaveLength(1);
    expect(doc.nur('line')).toHaveLength(2);
    expect(doc.nur('text')).toHaveLength(0);
  });

  it('lässt weg, was außerhalb des Blattes liegt', () => {
    expect(zeichne({
      planInhalte: [{ id: 'c', art: 'text', x: 9000, z: 9000, text: 'weit weg' }],
    }).nur('text')).toHaveLength(0);
  });

  it('zeichnet nichts ohne Inhalte', () => {
    expect(zeichne({}).calls).toHaveLength(0);
    expect(zeichne({ planInhalte: [] }).calls).toHaveLength(0);
  });

  it('liegt über der Bemaßung', () => {
    // Reihenfolge ist Bedeutung: was jemand gesetzt hat, soll nicht von einer
    // Maßlinie durchkreuzt werden.
    const doc = zeichne({
      dimensions: [{ id: 'd', p1: { x: -10, z: 0 }, p2: { x: 10, z: 0 }, dist: 20 }],
      planInhalte: [{ id: 'a', art: 'text', x: 0, z: 0, text: 'oben drauf' }],
    });
    const letzterMass = doc.calls.map((c) => c.args[0]).lastIndexOf('20.00 m');
    const ersterInhalt = doc.calls.map((c) => c.args[0]).indexOf('oben drauf');
    expect(ersterInhalt).toBeGreaterThan(letzterMass);
  });
});
