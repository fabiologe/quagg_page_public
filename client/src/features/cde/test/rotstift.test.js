// @vitest-environment jsdom
/**
 * Rotstift auf dem Plan (Sprint I, Stufe 7).
 *
 * Was auf einem ausgedruckten Plan der rote Kugelschreiber macht: einkringeln,
 * durchstreichen, Pfeil dazu. Fachlich etwas anderes als ein Issue (das hängt
 * an einem Bauteil, hat Status und Zuständigkeit) und als eine Beschriftung
 * (die gehört zum Plan und geht als Planinhalt mit).
 *
 * Die Strichgeometrie ist GETEILT mit dem PDF-Editor, nicht kopiert
 * (`@/services/tinte/InkGeometry`). Sie rechnet in dem Einheitsraum, in dem
 * die Punkte liegen — dort PDF-Punkte, hier Weltmeter. Genau daran hängt die
 * heikelste Stelle dieser Runde: die Strichbreite.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  useRotstift, alsTinte, mmZuWelt, STIFT_BREITE_MM, STIFT_FARBEN,
} from '../stores/useRotstift';
import { drawVectorPlan } from '../services/IfcVectorPlotter';
import { erstelleMockDoc } from './helpers/mockDoc';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('Strichbreite ist maßstabsUNabhängig', () => {
  it('rechnet Papier-Millimeter in Weltmeter um', () => {
    // 0,6 mm auf dem Blatt sind bei 1:100 sechs Zentimeter in der Welt,
    // bei 1:1000 sechzig. Führte man die Breite in Weltmetern, wäre derselbe
    // Strich bei 1:1000 zwanzigmal dicker als bei 1:50.
    expect(mmZuWelt(0.6, 100)).toBeCloseTo(0.06, 9);
    expect(mmZuWelt(0.6, 1000)).toBeCloseTo(0.6, 9);
    expect(mmZuWelt(0.6, 50)).toBeCloseTo(0.03, 9);
  });

  it('setzt breitePt für das Tintenmodul, ohne breiteMm zu verlieren', () => {
    // `strichUmriss` und `trifftStrich` lesen `breitePt` — die dauerhafte
    // Wahrheit bleibt `breiteMm`.
    const s = { id: 'a', breiteMm: 0.6, points: [[0, 0, 0.5]] };
    const t = alsTinte(s, 200);
    expect(t.breitePt).toBeCloseTo(0.12, 9);
    expect(t.breiteMm).toBe(0.6);
  });

  it('fällt auf die Vorgabe zurück, wenn nichts gesetzt ist', () => {
    expect(alsTinte({ points: [] }, 100).breitePt).toBeCloseTo(mmZuWelt(STIFT_BREITE_MM, 100), 9);
  });
});

describe('useRotstift', () => {
  it('legt einen Strich aus Weltpunkten an', async () => {
    const r = useRotstift();
    await r.bereit;
    const s = r.addStrich([[0, 0, 0.5], [1, 1, 0.6], [2, 0, 0.4]]);
    expect(s.points).toHaveLength(3);
    expect(s.farbe).toBe(STIFT_FARBEN[0]);      // Rot ist die Vorgabe
    expect(s.breiteMm).toBe(STIFT_BREITE_MM);
    expect(r.anzahl).toBe(1);
  });

  it('macht aus einem Antippen keinen Strich', async () => {
    // Ein unsichtbarer Fleck ließe sich nicht mehr wegradieren.
    const r = useRotstift();
    await r.bereit;
    expect(r.addStrich([[0, 0, 0.5]])).toBeNull();
    expect(r.addStrich([])).toBeNull();
    expect(r.anzahl).toBe(0);
  });

  it('ergänzt fehlenden Druck', async () => {
    const r = useRotstift();
    await r.bereit;
    const s = r.addStrich([[0, 0], [1, 1]]);
    expect(s.points[0][2]).toBe(0.5);
  });
});

describe('Radieren', () => {
  it('schneidet heraus, statt den ganzen Strich zu löschen', async () => {
    // Das ist der Unterschied zwischen Radiergummi und Papierkorb.
    const r = useRotstift();
    await r.bereit;
    // Waagerechter Strich von 0 bis 10, in der Mitte radiert.
    r.addStrich([[0, 0, 0.5], [3, 0, 0.5], [5, 0, 0.5], [7, 0, 0.5], [10, 0, 0.5]]);
    expect(r.radiere(5, 0, 1.5, 100)).toBe(true);

    // Zwei Reststücke, links und rechts der Lücke.
    expect(r.anzahl).toBe(2);
    const [links, rechts] = r.striche;
    expect(Math.max(...links.points.map(p => p[0]))).toBeLessThan(5);
    expect(Math.min(...rechts.points.map(p => p[0]))).toBeGreaterThan(5);
  });

  it('meldet false, wenn nichts getroffen wurde', async () => {
    const r = useRotstift();
    await r.bereit;
    r.addStrich([[0, 0, 0.5], [1, 0, 0.5]]);
    expect(r.radiere(100, 100, 1, 100)).toBe(false);
    expect(r.anzahl).toBe(1);
  });

  it('nimmt beim Strich-Radierer den ganzen Strich', async () => {
    const r = useRotstift();
    await r.bereit;
    r.addStrich([[0, 0, 0.5], [10, 0, 0.5]]);
    r.addStrich([[0, 50, 0.5], [10, 50, 0.5]]);
    expect(r.radiereGanz(5, 0, 1, 100)).toBe(true);
    expect(r.anzahl).toBe(1);
  });

  it('berücksichtigt die Strichbreite beim Treffer', async () => {
    // Ein dicker Strich ist leichter zu treffen als ein dünner — das steckt
    // in `trifftStrich`, und dafür muss breitePt richtig gesetzt sein.
    const r = useRotstift();
    await r.bereit;
    r.addStrich([[0, 0, 0.5], [10, 0, 0.5]], { breiteMm: 20 });
    // Bei 1:1000 sind 20 mm zwanzig Meter Breite — ein Treffer aus fünf
    // Metern Abstand ist dann noch drin.
    expect(r.radiereGanz(5, 5, 0.1, 1000)).toBe(true);
  });
});

describe('Rotstift im Plan', () => {
  const M = 10, DW = 100, DH = 100;
  const KAMERA = {
    left: -50, right: 50, top: 50, bottom: -50, zoom: 1,
    position: { x: 0, y: 100, z: 0 },
  };

  function zeichne(opts) {
    const doc = erstelleMockDoc();
    drawVectorPlan(doc, KAMERA, M, DW, DH, { scaleRatio: 100, ...opts });
    return doc;
  }

  it('zeichnet den Umriss als gefüllte Fläche, nicht als Linie', () => {
    // Der Unterschied zwischen Kugelschreiber und druckempfindlichem Stift:
    // perfect-freehand verbreitert und verjüngt die Kontur entlang des Zugs.
    const doc = zeichne({
      rotstift: [{
        id: 'a', farbe: '#d32f2f', breiteMm: 0.6, echterDruck: false,
        points: [[-10, 0, 0.5], [0, 2, 0.7], [10, 0, 0.5]],
      }],
    });
    const flaechen = doc.nur('lines');
    expect(flaechen).toHaveLength(1);
    expect(flaechen[0].args[4]).toBe('F');        // gefüllt
    expect(flaechen[0].args[5]).toBe(true);       // geschlossen
    expect(doc.nur('line')).toHaveLength(0);      // keine Mittellinie
  });

  it('nimmt die Stiftfarbe', () => {
    const doc = zeichne({
      rotstift: [{ id: 'a', farbe: '#1976d2', breiteMm: 0.6, points: [[0, 0, 0.5], [5, 5, 0.5]] }],
    });
    const gesetzt = doc.calls.filter((c) => c.name === 'setFillColor');
    expect(gesetzt.some((c) => c.args[0] === 0x19 && c.args[1] === 0x76 && c.args[2] === 0xd2)).toBe(true);
  });

  it('lässt Striche außerhalb des Blattes weg', () => {
    expect(zeichne({
      rotstift: [{ id: 'a', farbe: '#d32f2f', breiteMm: 0.6, points: [[9000, 9000, 0.5], [9010, 9000, 0.5]] }],
    }).nur('lines')).toHaveLength(0);
  });

  it('liegt über den Planinhalten', () => {
    // Eine Anmerkung ZUM Plan gehört über den Plan — sonst kringelt man
    // etwas ein und die Beschriftung liegt darüber.
    const doc = zeichne({
      planInhalte: [{ id: 'p', art: 'text', x: 0, z: 0, text: 'darunter' }],
      rotstift: [{ id: 'a', farbe: '#d32f2f', breiteMm: 0.6, points: [[0, 0, 0.5], [5, 5, 0.5]] }],
    });
    const namen = doc.calls.map((c) => c.name);
    expect(namen.lastIndexOf('lines')).toBeGreaterThan(namen.lastIndexOf('text'));
  });
});
