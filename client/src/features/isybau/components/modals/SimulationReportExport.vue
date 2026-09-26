<template>
  <button
    class="pdf-export-btn"
    @click="exportPDF"
    :disabled="exporting"
    title="Simulationsbericht als PDF exportieren (A4)"
  >
    <img src="/saintv1d/icons/Content-Files-Pdf--Streamline-Pixel.svg" class="pdf-icon" :style="{ opacity: exporting ? 0.4 : 1 }" />
    <span>{{ exporting ? 'Generiere…' : 'PDF' }}</span>
  </button>
</template>

<script setup>
// PDF-Texte nur mit Zeichen der jsPDF-Standardschrift (WinAnsi): kein Ψ/Δ — kamen als „¨" bzw. „"t" an
// (Browserprüfung 2026-09-26, test/anzeige.test.js).
import { ref, computed } from 'vue';
import { useIsybauStore } from '../../store/index.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { resolveSubcatchmentSize } from '../../utils/subcatchmentSize.js';
import { summarizeOutfallCatchments } from '../../utils/outfallCatchments.js';
import { AUSLASTUNG_STUFEN, haltungsZustand, knotenZustand } from '../../utils/typPalette.js';
import { niederschlagsBilanz, spitzeAusGanglinie, faktorZuLs } from '../../utils/swmm/niederschlagsBilanz.js';
import { parseInpSubcatchments } from '../../utils/resultsExport.js';

const store = useIsybauStore();

const props = defineProps({
  nodes:               { type: Map,    default: () => new Map() },
  edges:               { type: Map,    default: () => new Map() },
  areas:               { type: [Map, Array], default: () => [] },
  edgeResults:         { type: Map,    default: () => new Map() },
  nodeResults:         { type: Map,    default: () => new Map() },
  areaResults:         { type: Map,    default: () => new Map() },
  systemStats:         { type: Object, default: () => ({}) },
  rain:                { type: Object, default: null },
  totalCatchmentAreaHa:{ type: Number, default: 0 },
  timeSeries:          { type: Array,  default: () => [] },
  inp:                 { type: String, default: '' },
});

const exporting = ref(false);

// ─── Internal computed ────────────────────────────────────────────────────────
const rainSeries = computed(() => props.rain?.activeModelRain?.series || []);
const rainInterval = computed(() => rainSeries.value.length > 1
  ? rainSeries.value[1].time - rainSeries.value[0].time : 5);

// mm aus SWMMs eigener Spalte, gleiche Quelle wie der Ergebnisreiter
const runoffBilanz = computed(() => niederschlagsBilanz(props.systemStats?.runoff, props.totalCatchmentAreaHa));

// ─── Design constants (mm, RGB) ───────────────────────────────────────────────
const A4W = 210, A4H = 297;
const ML = 14, MR = 14, MT = 12;
const CW = A4W - ML - MR;

// Palette an das App-weite "Retro-Office"-Theme angeglichen (theme.css) — war
// vorher Navy/Lila/Lavendel (siehe git-history), jetzt dieselbe gedeckte
// Graubeige+Grün-Familie wie der Rest der App, für einen 1990er-Amtsbericht-
// Look statt modernem Lila-Gradient. Namen (navy/purple/...) bewusst
// beibehalten, um den Rest der Funktion unverändert zu lassen.
const C = {
  navy:   [74, 72, 68],    // war Navy-Blau — jetzt --isy-pixel-border (dunkles Graubeige)
  purple: [101, 98, 92],   // war Lila — jetzt --isy-pixel-border-hover (helleres Graubeige)
  purpleL:[157, 152, 142], // war helles Lavendel — jetzt --isy-pixel-bevel-light (Beige-Grau)
  green:  [33, 150, 83],   // nachgedunkeltes --isy-pixel-green
  blue:   [52, 152, 219],  // unverändert (--isy-pixel-info)
  red:    [231, 76, 60],   // unverändert (--isy-pixel-danger)
  weinrot:[123, 30, 58],   // Überstau (= typPalette KNOTEN_ZUSTAND.ueberstau), nicht das Rot von „Überlastet"
  orange: [243, 156, 18],  // unverändert (--isy-pixel-warning)
  bg:     [245, 242, 234], // war blasses Lavendel-Weiß — jetzt warmes Papier-Beige
  border: [200, 194, 178], // war helles Lavendel — jetzt gedecktes Beige-Grau
  text:   [51, 51, 51],
  muted:  [120, 117, 108], // war lila-stichiges Grau — jetzt neutrales Warmgrau
  white:  [255, 255, 255],
};

// Die jsPDF-Standardschrift kann nur WinAnsi (cp1252): ≤/≥ kamen verstümmelt an
const winAnsi = (t) => String(t).replace(/≤/g, 'bis').replace(/≥/g, 'ab');

// Hex (typPalette) → RGB für jsPDF: dieselben Auslastungsfarben wie Karte und 3D
const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt  = (v, d = 2) => (typeof v === 'number' ? v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) : (v ?? '—'));
const fmtV = (ham)      => fmt((ham || 0) * 10000); // ha·m → m³

// ─── Pixel font via canvas (uses Press Start 2P if loaded in browser) ─────────
// Returns the rendered width in mm so callers can offset subsequent content.
function drawPixelHeading(doc, text, x, y, heightMm, colorArr = C.navy, maxWidthMm = Infinity) {
  try {
    // 48 px Schrifthöhe reichen für 4,5–7 mm hohe Überschriften (≈ 170–270 dpi); mit 100 px
    // und ohne Kompression wog der Bericht 13,9 MB (Browserprüfung 2026-09-26, P1.10).
    const PX = 48;
    const tmpCtx = document.createElement('canvas').getContext('2d');
    tmpCtx.font = `${PX}px "Press Start 2P", monospace`;
    const measW = tmpCtx.measureText(text).width;

    const canvas = document.createElement('canvas');
    canvas.width  = Math.ceil(measW) + 12;
    canvas.height = Math.ceil(PX * 1.4);

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${PX}px "Press Start 2P", monospace`;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = `rgb(${colorArr[0]},${colorArr[1]},${colorArr[2]})`;
    ctx.fillText(text, 6, PX * 1.05);

    // Zu breit für die Spalte → proportional verkleinern (Seite 1: „Niederschlagsbilanz
    // (Runoff)" lief in die Überschrift der rechten Spalte, Browserprüfung 2026-09-26).
    let h = heightMm;
    let widthMm = (canvas.width / canvas.height) * h;
    if (widthMm > maxWidthMm) { h *= maxWidthMm / widthMm; widthMm = maxWidthMm; }
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, y + (heightMm - h) / 2, widthMm, h, undefined, 'FAST');
    return widthMm;
  } catch (_) {
    // Fallback: standard helvetica
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(heightMm * 2.3);
    doc.setTextColor(...colorArr);
    doc.text(text, x, y + heightMm * 0.85);
    return text.length * heightMm * 0.65;
  }
}

// ─── Page decorations ─────────────────────────────────────────────────────────
function pageHeader(doc) {
  doc.setFillColor(...C.navy);
  doc.rect(0, 0, A4W, 15, 'F');
  doc.setFillColor(...C.purple);
  doc.rect(0, 15, A4W, 1.2, 'F');

  const titleW = drawPixelHeading(doc, 'SAINTV-1D', ML, 3.5, 7, C.green);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(...C.purpleL);
  doc.text('Hydraulische Kanalnetz-Simulation', ML + titleW + 3, 10);

  doc.setTextColor(...C.purpleL);
  doc.text('made by quagg-engineering.org', A4W - MR, 7, { align: 'right' });
  doc.text(new Date().toLocaleDateString('de-DE'), A4W - MR, 12, { align: 'right' });
}

function pageFooter(doc, pageNum) {
  const y = A4H - 9;
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(ML, y, A4W - MR, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.muted);
  doc.text('SaintV-1D Simulationsbericht · quagg-engineering.org', ML, y + 4);
  doc.text(`Seite ${pageNum}`, A4W - MR, y + 4, { align: 'right' });
}

// ─── Section title ────────────────────────────────────────────────────────────
function sectionTitle(doc, y, text, x = ML, maxWidthMm = Infinity) {
  doc.setFillColor(...C.purple);
  doc.rect(x, y, 2.5, 5.5, 'F');
  drawPixelHeading(doc, text, x + 5, y + 0.5, 4.5, C.navy, maxWidthMm - 5);
  return y + 11;
}

// ─── KPI box ─────────────────────────────────────────────────────────────────
function kpiBox(doc, x, y, w, h, lines, value, unit, color) {
  doc.setFillColor(...C.bg);
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD');

  // Accent strip at top
  doc.setFillColor(...(color || C.navy));
  doc.roundedRect(x, y, w, 2, 1.5, 0, 'F');

  // Label: support 1 or 2 lines (pass array or string)
  const labelLines = Array.isArray(lines) ? lines : [lines];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(...C.muted);
  if (labelLines.length === 1) {
    doc.text(labelLines[0], x + w / 2, y + 7.5, { align: 'center' });
  } else {
    doc.text(labelLines[0], x + w / 2, y + 6,   { align: 'center' });
    doc.text(labelLines[1], x + w / 2, y + 9,   { align: 'center' });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...(color || C.navy));
  doc.text(String(value), x + w / 2, y + 17, { align: 'center' });

  if (unit) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(...C.muted);
    doc.text(unit, x + w / 2, y + 21.5, { align: 'center' });
  }
}

// ─── Rain Bar Chart (drawn via jsPDF primitives) ──────────────────────────────
function drawRainChart(doc, x, y, w, h, series, interval) {
  if (!series?.length) return y;

  const maxI   = Math.max(...series.map(s => s.intensity || 0)) || 1;
  let cumMm    = 0;
  const cumArr = series.map(s => { cumMm += (s.height_mm ?? s.intensity * interval * 0.006); return cumMm; });
  const maxCum = cumArr[cumArr.length - 1] || 1;
  const chartH = h - 8;
  const barW   = w / series.length;

  // Background + border
  doc.setFillColor(250, 248, 243);
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, chartH, 'FD');

  // Horizontal guide lines
  doc.setDrawColor(225, 220, 208);
  doc.setLineWidth(0.15);
  [0.25, 0.5, 0.75].forEach(f => {
    const gy = y + chartH * (1 - f);
    doc.line(x, gy, x + w, gy);
  });

  // Bars — intensity
  series.forEach((s, i) => {
    const bh = (s.intensity / maxI) * chartH;
    doc.setFillColor(52, 152, 219);
    doc.rect(x + i * barW + 0.2, y + chartH - bh, barW - 0.4, bh, 'F');
  });

  // Cumulative line — red
  doc.setDrawColor(...C.red);
  doc.setLineWidth(0.7);
  for (let i = 1; i < cumArr.length; i++) {
    const x1 = x + (i - 1) * barW + barW / 2;
    const y1 = y + chartH - (cumArr[i - 1] / maxCum) * chartH;
    const x2 = x + i * barW + barW / 2;
    const y2 = y + chartH - (cumArr[i] / maxCum) * chartH;
    doc.line(x1, y1, x2, y2);
  }

  // Axis labels
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);

  // Y left
  doc.setTextColor(...C.blue);
  doc.text(`${fmt(maxI, 0)} l/s·ha`, x - 1, y + 3, { align: 'right' });
  doc.text('0', x - 1, y + chartH - 0.5, { align: 'right' });

  // Y right
  doc.setTextColor(...C.red);
  doc.text(`${fmt(maxCum, 1)} mm`, x + w + 1, y + 3);

  // X axis
  doc.setTextColor(...C.muted);
  const n = series.length;
  [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor(n * 3 / 4), n - 1].forEach(i => {
    if (series[i]) doc.text(`${series[i].time}'`, x + i * barW + barW / 2, y + chartH + 4, { align: 'center' });
  });

  // Legend (shifted down to avoid X-label overlap)
  doc.setFillColor(...C.blue);
  doc.rect(x, y + chartH + 9, 5, 2, 'F');
  doc.setTextColor(...C.muted);
  doc.text('Intensität (l/s·ha)', x + 6, y + chartH + 10.5);
  doc.setDrawColor(...C.red);
  doc.setLineWidth(0.7);
  doc.line(x + 40, y + chartH + 10, x + 45, y + chartH + 10);
  doc.text('kumuliert (mm)', x + 46, y + chartH + 10.5);

  return y + h + 6;
}

// ─── Network Diagram ──────────────────────────────────────────────────────────
function drawNetwork(doc, x, y, w, h) {
  const nodes   = props.nodes;
  const edges   = props.edges;
  const areas   = props.areas;
  const edgeRes = props.edgeResults;
  const nodeRes = props.nodeResults;
  const areaRes = props.areaResults;

  // Background
  doc.setFillColor(244, 241, 234);
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h, 'FD');

  if (!nodes?.size) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text('Keine Netzdaten vorhanden', x + w / 2, y + h / 2, { align: 'center' });
    return;
  }

  // ── Bounding box aus Knoten + Flächen-Punkten ──
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const expandBB = (px, py) => {
    if (!isFinite(px) || !isFinite(py)) return;
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  };
  for (const n of nodes.values()) expandBB(n.x, n.y);
  const areaArr = Array.isArray(areas) ? areas : (areas instanceof Map ? Array.from(areas.values()) : Object.values(areas || {}));
  for (const a of areaArr) for (const pt of (a.points || [])) expandBB(pt.x, pt.y);
  if (!isFinite(minX)) return;

  const pad    = 8;
  const legendH = 9;
  const drawH  = h - legendH;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale  = Math.min((w - pad * 2) / rangeX, (drawH - pad * 2) / rangeY);
  const offX   = x + pad + (w - pad * 2 - rangeX * scale) / 2;
  const offY   = y + drawH - pad;

  const toP = (nx, ny) => [offX + (nx - minX) * scale, offY - (ny - minY) * scale];

  // Clip to diagram area
  doc.saveGraphicsState();
  doc.rect(x, y, w, drawH); // will be used as clip — jsPDF does not support real clipping, just visual

  // ── 1. Flächen als gefüllte Polygone (wie Ergebnisansicht) ──
  for (const area of areaArr) {
    if (!area.points?.length) continue;
    const pts = area.points.map(pt => { const [px, py] = toP(pt.x, pt.y); return { x: px, y: py }; });

    // Color by runoff result: runoffMm → blue gradient, or by Ψ
    const res  = areaRes instanceof Map ? areaRes.get(area.id) : (areaRes || {})[area.id];
    const psi  = res?.runoffCoeff ?? area.runoffCoeff ?? 0;
    // Low Ψ = green, high Ψ = orange/red (matches viewer color scale)
    let fill;
    if (psi < 0.2)       fill = [209, 250, 229]; // light green
    else if (psi < 0.4)  fill = [167, 243, 208];
    else if (psi < 0.6)  fill = [253, 230, 138]; // yellow
    else if (psi < 0.8)  fill = [253, 186, 116]; // orange
    else                 fill = [252, 165, 165]; // red

    doc.setFillColor(...fill);
    doc.setDrawColor(180, 176, 164);
    doc.setLineWidth(0.15);

    // Draw polygon via lines (jsPDF has no polygon fill natively, use moveTo/lineTo)
    if (pts.length >= 3) {
      doc.lines(
        pts.slice(1).map((p, i) => [p.x - pts[i].x, p.y - pts[i].y]),
        pts[0].x, pts[0].y, [1, 1], 'FD', true
      );
    }
  }

  // ── 2. Haltungen (Edges) — farbig nach Auslastung ──
  for (const edge of (edges?.values() || [])) {
    // FIX: korrekte Feldnamen aus Edge Domain Model
    const fn = nodes.get(edge.fromNodeId);
    const tn = nodes.get(edge.toNodeId);
    if (!fn || !tn) continue;

    // Q/Qvoll-Stufe wie 2D/3D (typPalette.haltungsZustand); Wehr/Drossel ohne Qvoll grau
    const z   = haltungsZustand(edgeRes?.get(edge.id));
    const i   = z.stufe ? AUSLASTUNG_STUFEN.indexOf(z.stufe) : -1;
    const col = z.farbe ? rgb(z.farbe) : C.purple;
    const lw  = i === 0 ? 0.9 : i === 1 ? 0.7 : 0.45;

    const strecke = () => {
      // Nutze coords (Polylinie) wenn vorhanden, sonst gerade Linie
      if (edge.coords?.length >= 2) {
        for (let k = 1; k < edge.coords.length; k++) {
          const [x1, y1] = toP(edge.coords[k-1].x, edge.coords[k-1].y);
          const [x2, y2] = toP(edge.coords[k].x,   edge.coords[k].y);
          doc.line(x1, y1, x2, y2);
        }
      } else {
        const [x1, y1] = toP(fn.x, fn.y);
        const [x2, y2] = toP(tn.x, tn.y);
        doc.line(x1, y1, x2, y2);
      }
    };
    doc.setDrawColor(...col);
    doc.setLineWidth(lw);
    strecke();
    // Eingestaut (h/hvoll ≥ 0,99): gestrichelt darüber, wie in der 2D-Karte
    if (z.eingestaut) {
      doc.setDrawColor(...C.text);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([0.8, 0.8], 0);
      strecke();
      doc.setLineDashPattern([], 0);
    }
  }

  // ── 3. Knoten als Kreise — nach Status ──
  for (const node of nodes.values()) {
    if (!isFinite(node.x) || !isFinite(node.y)) continue;
    const [px, py] = toP(node.x, node.y);
    const res        = nodeRes?.get(node.id);
    const isOutfall  = ['OUTFALL', 'Outfall'].includes(node.type);
    const zustand    = knotenZustand(res);
    const flooded    = zustand === 'überstaut';
    const surcharged = zustand === 'eingestaut';

    if (isOutfall) {
      // Dreieck für Auslass
      doc.setFillColor(...C.green);
      doc.setDrawColor(...C.green);
      doc.triangle(px, py - 2, px - 1.5, py + 1, px + 1.5, py + 1, 'F');
    } else {
      const col = flooded ? C.weinrot : surcharged ? C.orange : C.navy;
      doc.setFillColor(...col);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.circle(px, py, flooded ? 1.4 : 1.0, 'FD');
    }
  }

  doc.restoreGraphicsState();

  // ── Legende ──
  const ly0 = y + drawH + 1;
  const items = [
    ...[...AUSLASTUNG_STUFEN].reverse().map(st => ({ type: 'line', c: rgb(st.farbe), l: winAnsi(st.text) })),
    { type: 'dash', c: C.text,   l: 'eingestaut (h/hvoll ab 0,99)' },
    { type: 'dot',  c: C.navy,   l: 'Schacht' },
    { type: 'dot',  c: C.orange, l: 'Schacht eingestaut' },
    { type: 'dot',  c: C.weinrot, l: 'Schacht überstaut' },
    { type: 'tri',  c: C.green,  l: 'Auslass' },
    { type: 'fill', c: [167,243,208], l: 'Fläche, niedriger Abflussbeiwert' },
    { type: 'fill', c: [253,186,116], l: 'Fläche, hoher Abflussbeiwert' },
  ];
  // Breite je Eintrag gemessen, bei Platzmangel zweite Zeile (legendH = 9 mm reicht
  // für zwei). Vorher fester 24-mm-Schritt mit `break` — der letzte Eintrag
  // („Fläche, hoher Abflussbeiwert") fiel still weg (Browserprüfung 2026-09-26).
  let lx = x + 1;
  let ly = ly0;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.5);
  for (const { type, c, l } of items) {
    const breite = 5.5 + doc.getTextWidth(l) + 3;
    if (lx + breite > x + w && lx > x + 1) { lx = x + 1; ly += 4.5; }
    doc.setFillColor(...c);
    doc.setDrawColor(...c);
    if (type === 'line') {
      doc.setLineWidth(1.2);
      doc.line(lx, ly + 2, lx + 4, ly + 2);
    } else if (type === 'dash') {
      doc.setLineWidth(0.3);
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.line(lx, ly + 2, lx + 4, ly + 2);
      doc.setLineDashPattern([], 0);
    } else if (type === 'dot') {
      doc.circle(lx + 2, ly + 2, 1.2, 'F');
    } else if (type === 'tri') {
      doc.triangle(lx + 2, ly, lx + 0.5, ly + 3.5, lx + 3.5, ly + 3.5, 'F');
    } else {
      doc.setDrawColor(180, 176, 164);
      doc.setLineWidth(0.15);
      doc.rect(lx, ly + 0.5, 4, 3, 'FD');
    }
    doc.setTextColor(...C.muted);
    doc.text(l, lx + 5.5, ly + 3);
    lx += breite;
  }
}

// ─── Main Export ─────────────────────────────────────────────────────────────
async function exportPDF() {
  exporting.value = true;
  try {
    // Pre-load pixel font so canvas rendering uses it (not fallback monospace)
    try { await document.fonts.load("10px 'Press Start 2P'"); } catch (_) {}

    const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const stats = props.systemStats || {};
    const rb    = runoffBilanz.value;
    const series = rainSeries.value;
    const interval = rainInterval.value;

    const contErr = Math.abs(stats.flow?.error || 0);
    const errColor = contErr < 1 ? C.green : contErr < 5 ? C.orange : C.red;

    // tableDefaults — no didDrawPage; headers/footers are applied in a final pass
    const tableDefaults = (extra = {}) => ({
      styles:          { fontSize: 6.5, cellPadding: 1.5 },
      headStyles:      { fillColor: C.navy, textColor: C.white, fontSize: 7, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 241, 233] },
      margin:          { left: ML, right: MR, top: 20, bottom: 12 },
      ...extra,
    });

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 1 — Zusammenfassung
    // ════════════════════════════════════════════════════════════════════════
    let cy = 20;

    // Report title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...C.navy);
    doc.text('Hydraulischer Simulationsbericht', ML, cy);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text(`Erstellt: ${new Date().toLocaleString('de-DE')}  ·  Einzugsgebiet: ${(props.totalCatchmentAreaHa || 0).toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ha  ·  ${props.nodes?.size || 0} Schächte  ·  ${props.edges?.size || 0} Haltungen`, ML, cy + 5.5);
    if (rb.quelle !== 'swmm') {
      doc.text('Hinweis: Der SWMM-Bericht enthält keine mm-Werte — mm aus Volumen / Bezugsfläche gerechnet.', ML, cy + 9);
      cy += 4;
    }
    cy += 12;

    // KPI boxes
    const kW = (CW - 9) / 4;
    kpiBox(doc, ML,                cy, kW, 24, ['Niederschlag', '(Gesamthöhe)'],    `${fmt(rb.precipMm, 1)}`,              'mm', C.blue);
    kpiBox(doc, ML + kW + 3,      cy, kW, 24, ['Oberfl.', 'Abfluss'],              `${fmt(rb.runoffMm, 1)}`,              'mm', C.purple);
    kpiBox(doc, ML + (kW + 3) * 2,cy, kW, 24, ['Abfluss-', 'beiwert'],          `${fmt(rb.psi, 3)}`,                   '',   C.navy);
    kpiBox(doc, ML + (kW + 3) * 3,cy, kW, 24, ['Kontinuitäts-', 'fehler Flow'],   `${fmt(stats.flow?.error || 0, 2)}`, '%',  errColor);
    cy += 28;

    // Two-column layout: Niederschlagsbilanz | Simulations-Parameter
    const colW = (CW - 6) / 2;
    const col2x = ML + colW + 6;
    let cyL = sectionTitle(doc, cy, 'Niederschlagsbilanz (Runoff)', ML, colW);
    let cyR = sectionTitle(doc, cy, 'Simulations-Parameter', col2x, colW);

    // Area badge
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(187, 247, 208);
    doc.setLineWidth(0.2);
    doc.roundedRect(ML, cyL, colW, 7, 1, 1, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(107, 114, 128);
    doc.text('Bezugsfläche:', ML + 2, cyL + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(21, 128, 61);
    doc.text(`${(props.totalCatchmentAreaHa || 0).toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ha`, ML + 24, cyL + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175);
    doc.text(`= ${((props.totalCatchmentAreaHa || 0) * 10000).toLocaleString('de-DE')} m²`, ML + colW - 2, cyL + 4.5, { align: 'right' });
    cyL += 9;

    autoTable(doc, {
      ...tableDefaults({ margin: { left: ML, right: col2x - 1, top: 20, bottom: 12 } }),
      startY: cyL,
      head:   [['Posten', 'mm', 'm³']],
      body:   [
        ['Niederschlag',      fmt(rb.precipMm, 2),       fmtV(stats.runoff?.precip)],
        ['Verdunstung',       fmt(rb.evapMm, 2),         fmtV(stats.runoff?.evap)],
        ['Infiltration',      fmt(rb.infilMm, 2),        fmtV(stats.runoff?.infil)],
        ['Oberfl.-Abfluss',   fmt(rb.runoffMm, 2),       fmtV(stats.runoff?.runoff)],
        ['Endspeicherung',    fmt(rb.finalStorageMm, 3), fmtV(stats.runoff?.finalStorage)],
        ['Abflussbeiwert',    fmt(rb.psi, 3),            ''],
        ['Kont.-Fehler Runoff',`${fmt(stats.runoff?.error || 0, 3)} %`, ''],
      ],
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    });
    const afterBilanz = doc.lastAutoTable.finalY;

    autoTable(doc, {
      ...tableDefaults({ margin: { left: col2x, right: MR, top: 20, bottom: 12 } }),
      startY: cyR,
      head:   [['Parameter', 'Wert']],
      body:   [
        ['Einheiten',        stats.analysisOptions?.flowUnits            || '—'],
        ['Infiltration',     stats.analysisOptions?.infiltrationMethod   || '—'],
        ['Routing',          stats.analysisOptions?.flowRoutingMethod    || '—'],
        ['Überstau',         (stats.analysisOptions?.surchargeMethod || '—') + (stats.ueberstauWahl ? ' (Automatik)' : '')],
        ...(stats.ueberstauWahl ? [['Wahl', stats.ueberstauWahl.grund]] : []),
        ['Start',            stats.analysisOptions?.startDate            || '—'],
        ['Ende',             stats.analysisOptions?.endDate              || '—'],
        ['Zeitschritt',      Number.isFinite(parseFloat(stats.analysisOptions?.routingTimeStep)) ? `${fmt(parseFloat(stats.analysisOptions.routingTimeStep), 2)} s` : '—'],
        ['Kont.-Fehler Flow',`${fmt(stats.flow?.error || 0, 3)} %`],
      ],
    });
    const afterParams = doc.lastAutoTable.finalY;

    cy = Math.max(afterBilanz, afterParams) + 5;

    // Rain Chart
    if (series.length > 0) {
      cy = sectionTitle(doc, cy, `Modellregen — ${props.rain?.activeModelRain?.type === 'euler2' ? 'Euler Typ II' : 'Blockregen'}`);
      const totalMm = series.reduce((s, p) => s + (p.height_mm ?? p.intensity * interval * 0.006), 0);
      const peakI   = Math.max(...series.map(s => s.intensity || 0));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...C.muted);
      doc.text(
        `Gesamt: ${fmt(totalMm, 1)} mm  ·  Spitze: ${fmt(peakI, 1)} l/s·ha  ·  Intervall: ${interval} min  ·  Dauer: ${series.length * interval} min`,
        ML, cy
      );
      cy += 4;
      cy = drawRainChart(doc, ML + 8, cy, CW - 10, 48, series, interval);
    }

    // Ausleitungen
    if (stats.outfallLoading?.length) {
      cy = sectionTitle(doc, cy + 2, `Ausleitungen (${stats.outfallLoading.length})`);
      autoTable(doc, {
        ...tableDefaults(),
        startY: cy,
        head:   [['ID', 'Häufigkeit (%)', 'Mittel (L/s)', 'Max (L/s)', 'Vol (m³)']],
        body:   stats.outfallLoading.map(o => [
          o.id, fmt(o.freq, 1),
          fmt((o.avgFlow || 0) * 1000, 1),
          fmt((o.maxFlow || 0) * 1000, 1),
          fmt((o.totalVol || 0) * 1000, 1),
        ]),
      });
      cy = doc.lastAutoTable.finalY + 4;
    }

    // Ausleitungen — angeschlossene Einzugsgebiete (Netz-Herkunft, nicht
    // Hydraulik): welche Flächen entwässern über das Kanalnetz zu welcher
    // Ausleitung, siehe outfallCatchments.js für die (vereinfachte) Herleitung.
    const outfallCatchments = summarizeOutfallCatchments(props.areas, props.nodes, props.edges);
    if (outfallCatchments.length) {
      cy = sectionTitle(doc, cy + 2, `Ausleitungen — angeschlossene Einzugsgebiete (${outfallCatchments.length})`);
      autoTable(doc, {
        ...tableDefaults(),
        startY: cy,
        head:   [['Outfall', 'Angeschlossene Fläche (ha)', 'Mittl. Abflussbeiwert', 'Befestigte Fläche (ha)']],
        body:   outfallCatchments.map(o => [
          o.outfallId,
          fmt(o.totalAreaHa, 4),
          fmt(o.avgRunoffCoeff, 3),
          fmt(o.impervAreaHa, 4),
        ]),
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 2 — Netzwerk + Haltungen
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage();
    cy = 20;

    cy = sectionTitle(doc, cy, 'Netzwerk-Übersicht');
    drawNetwork(doc, ML, cy, CW, 78);
    cy += 83;

    // Haltungen = Kanäle (CONDUIT). Pumpen/Wehre/Drosseln haben kein Qvoll bzw. andere
    // Kenngrößen und stehen in einer eigenen Tabelle (vorher „Pumpwerk" als Haltung).
    const istSonderbauwerk = (res) => !!res?.type && res.type !== 'CONDUIT';
    const edgeRows = [];
    const sonderRows = [];
    const ART = { PUMP: 'Pumpe', WEIR: 'Wehr', ORIFICE: 'Drossel/Schieber', OUTLET: 'Auslass (Kennlinie)' };
    for (const [id] of (props.edges?.entries() || [])) {
      const res = props.edgeResults?.get(id);
      if (istSonderbauwerk(res)) {
        const pumpe = props.systemStats?.pumpingSummary?.find(p => p.id === id);
        sonderRows.push([
          id,
          ART[res.type] ?? res.type,
          fmt(res.maxFlow, 1),
          pumpe ? fmt(pumpe.totalVol * 1000, 0) : '—',   // 10^6 l → m³
          pumpe ? fmt(pumpe.percentUtilized, 1) : '—',
          pumpe ? String(pumpe.startUps) : '—',
          res.timeOfMaxFlow || '—',
        ]);
        continue;
      }
      const z = haltungsZustand(res);
      edgeRows.push([
        id,
        fmt(res?.maxFlow, 1),
        fmt(res?.capacity, 1),
        z.auslastung == null ? '—' : fmt(z.auslastung / 100, 2),
        res?.depthRatio == null ? '—' : fmt(res.depthRatio, 2),
        fmt(res?.maxVelocity, 2),
        res?.timeOfMaxFlow || '—',
        // wie der Reiter: überlastet / eingestaut / > 90 % / OK
        z.status === 'überlastet' ? 'ÜBERLASTET' : z.status === 'eingestaut' ? 'EINGESTAUT'
          : z.status === '> 90 %' ? '> 90 %' : z.status === '–' ? '—' : 'OK',
      ]);
    }

    cy = sectionTitle(doc, cy, `Haltungen (${edgeRows.length}) — Auslastung Q/Qvoll, Einstau h/hvoll`);
    autoTable(doc, {
      ...tableDefaults(),
      startY: cy,
      head:   [['ID', 'Max Q (l/s)', 'Qvoll (l/s)', 'Q/Qvoll', 'h/hvoll', 'v_max (m/s)', 't_max', 'Status']],
      body:   edgeRows,
      didParseCell: (data) => {
        if (data.column.index === 7 && data.section === 'body') {
          const v = data.cell.raw;
          if (v === 'ÜBERLASTET') data.cell.styles.textColor = C.red;
          else if (v === 'EINGESTAUT' || v === '> 90 %') data.cell.styles.textColor = C.orange;
          else data.cell.styles.textColor = [5, 150, 105];
        }
      },
    });

    if (sonderRows.length) {
      let y0 = doc.lastAutoTable.finalY + 6;
      if (y0 > 255) { doc.addPage(); y0 = 20; } // Überschrift nicht allein unten auf der Seite
      cy = sectionTitle(doc, y0, `Pumpen und Sonderbauwerke (${sonderRows.length})`);
      autoTable(doc, {
        ...tableDefaults(),
        startY: cy,
        head:   [['ID', 'Art', 'Max Q (l/s)', 'Fördervol. (m³)', 'Laufzeit (%)', 'Starts', 't_max']],
        body:   sonderRows,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 3 — Schächte & Bauwerke
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage();
    cy = 20;
    cy = sectionTitle(doc, cy, `Schächte & Bauwerke (${props.nodes?.size || 0})`);

    const nodeRows = [];
    for (const [id, node] of (props.nodes?.entries() || [])) {
      const res    = props.nodeResults?.get(id) || {};
      const zustand= knotenZustand(res);
      const status = zustand === 'überstaut' ? 'ÜBERSTAUT' : zustand === 'eingestaut' ? 'EINGESTAUT' : 'OK';
      nodeRows.push([
        id,
        fmt(node.z, 2),
        fmt(res.maxDepth, 2),
        fmt(res.maxHGL, 2),
        fmt(res.floodingVolume || 0, 0),   // SWMM-Auflösung 1 m³
        res.timeOfMaxDepth || '—',
        status,
      ]);
    }

    autoTable(doc, {
      ...tableDefaults(),
      startY: cy,
      head:   [['ID', 'Sohle (m)', 'Max h (m)', 'Max HGL (m)', 'Überstauvol. (m³)', 't_max', 'Status']],
      body:   nodeRows,
      didParseCell: (data) => {
        if (data.column.index === 6 && data.section === 'body') {
          const v = data.cell.raw;
          if (v === 'ÜBERSTAUT')  data.cell.styles.textColor = C.weinrot;
          else if (v === 'EINGESTAUT') data.cell.styles.textColor = C.orange;
          else data.cell.styles.textColor = [5, 150, 105];
        }
      },
    });

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 4 — Teilflächen
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage();
    cy = 20;
    cy = sectionTitle(doc, cy, 'Teilflächen (Subcatchments)');

    const flaecheGerechnet = new Map(parseInpSubcatchments(props.inp).map(t => [t.name, t]));
    const areaEntries = props.areaResults instanceof Map
      ? Array.from(props.areaResults.entries())
      : Object.entries(props.areaResults || {});

    autoTable(doc, {
      ...tableDefaults(),
      startY: cy,
      head:   [['ID', 'Fläche (ha)', 'N (mm)', 'Infil. (mm)', 'Abfl. (mm)', 'Abfl.-beiw.', 'Q_peak (l/s)']],
      body:   areaEntries.map(([id, d]) => [
        id,
        // Fläche wie gerechnet (.inp des Laufs); ohne .inp aus der Eingabe-Fläche
        // (Split-/".1"-Suffix-Auflösung, subcatchmentSize.js).
        fmt(flaecheGerechnet.get(id)?.areaHa ?? resolveSubcatchmentSize(id, props.areas), 4),
        fmt(d.precip ?? 0, 2),
        fmt(d.totalInfil ?? 0, 2),
        fmt(d.totalRunoffMm ?? d.runoffMm ?? 0, 2),
        fmt(d.runoffCoeff ?? 0, 3),
        // Spitze aus der Ganglinie (l/s), nicht aus SWMMs zweistelliger CMS-Spalte
        fmt(spitzeAusGanglinie(props.timeSeries, id, faktorZuLs(props.systemStats)) ?? d.peakRunoff ?? 0, 1),
      ]),
    });

    // ─── Decorate all pages exactly once with correct sequential page numbers ──
    const totalPages = doc.internal.getNumberOfPages();
    for (let pg = 1; pg <= totalPages; pg++) {
      doc.setPage(pg);
      pageHeader(doc);
      pageFooter(doc, pg);
    }

    // ─── Save ─────────────────────────────────────────────────────────────────
    const date = new Date().toISOString().slice(0, 10);
    doc.save(`SaintV1D_Bericht_${date}.pdf`);

  } catch (err) {
    console.error('[PDF Export]', err);
    store.melde('Fehler beim PDF-Export:\n' + err.message, 'fehler');
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.pdf-export-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--isy-space-2);
  padding: var(--isy-space-1) var(--isy-space-3);
  background: var(--isy-pixel-bg);
  color: var(--isy-pixel-text);
  border: none;
  border-radius: var(--isy-radius-sm);
  cursor: var(--isy-cursor-hand);
  font-size: var(--isy-fs-sm);
  font-weight: 600;
  font-family: var(--isy-pixel-font);
  letter-spacing: 0.04em;
  transition: background 0.15s, opacity 0.15s;
}
.pdf-export-btn:hover:not(:disabled) { background: var(--isy-pixel-border); }
.pdf-export-btn:disabled { opacity: 0.5; cursor: var(--isy-cursor-zeiger); }
.pdf-icon {
  width: 18px;
  height: 18px;
  filter: invert(1);
}
</style>
