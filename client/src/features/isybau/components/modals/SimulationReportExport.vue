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
import { ref, computed } from 'vue';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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
});

const exporting = ref(false);

// ─── Internal computed ────────────────────────────────────────────────────────
const rainSeries = computed(() => props.rain?.activeModelRain?.series || []);
const rainInterval = computed(() => rainSeries.value.length > 1
  ? rainSeries.value[1].time - rainSeries.value[0].time : 5);

const runoffBilanz = computed(() => {
  const areaHa = props.totalCatchmentAreaHa;
  const r = props.systemStats?.runoff || {};
  const toMm = (vol) => areaHa > 0 ? (vol / areaHa) * 1000 : (r.precipMm > 0 ? vol / (r.precip || 1) * r.precipMm : 0);
  return {
    precipMm:       areaHa > 0 ? toMm(r.precip || 0)       : (r.precipMm       || 0),
    evapMm:         areaHa > 0 ? toMm(r.evap || 0)         : (r.evapMm         || 0),
    infilMm:        areaHa > 0 ? toMm(r.infil || 0)        : (r.infilMm        || 0),
    runoffMm:       areaHa > 0 ? toMm(r.runoff || 0)       : (r.runoffMm       || 0),
    finalStorageMm: areaHa > 0 ? toMm(r.finalStorage || 0) : (r.finalStorageMm || 0),
    psi: (r.precip > 0) ? (r.runoff / r.precip) : 0,
  };
});

// ─── Design constants (mm, RGB) ───────────────────────────────────────────────
const A4W = 210, A4H = 297;
const ML = 14, MR = 14, MT = 12;
const CW = A4W - ML - MR;

const C = {
  navy:   [4, 6, 71],
  purple: [89, 68, 145],
  purpleL:[174, 173, 210],
  green:  [46, 204, 113],
  blue:   [52, 152, 219],
  red:    [231, 76, 60],
  orange: [243, 156, 18],
  bg:     [248, 249, 252],
  border: [220, 218, 240],
  text:   [51, 51, 51],
  muted:  [130, 130, 140],
  white:  [255, 255, 255],
};

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt  = (v, d = 2) => (typeof v === 'number' ? v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) : (v ?? '—'));
const fmtV = (ham)      => fmt((ham || 0) * 10000); // ha·m → m³

// ─── Pixel font via canvas (uses Press Start 2P if loaded in browser) ─────────
// Returns the rendered width in mm so callers can offset subsequent content.
function drawPixelHeading(doc, text, x, y, heightMm, colorArr = C.navy) {
  try {
    const PX = 100;
    const tmpCtx = document.createElement('canvas').getContext('2d');
    tmpCtx.font = `${PX}px "Press Start 2P", monospace`;
    const measW = tmpCtx.measureText(text).width;

    const canvas = document.createElement('canvas');
    canvas.width  = Math.ceil(measW) + 12;
    canvas.height = Math.ceil(PX * 1.4);

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${PX}px "Press Start 2P", monospace`;
    ctx.fillStyle = `rgb(${colorArr[0]},${colorArr[1]},${colorArr[2]})`;
    ctx.fillText(text, 6, PX * 1.05);

    const widthMm = (canvas.width / canvas.height) * heightMm;
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, widthMm, heightMm);
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
function sectionTitle(doc, y, text, x = ML) {
  doc.setFillColor(...C.purple);
  doc.rect(x, y, 2.5, 5.5, 'F');
  drawPixelHeading(doc, text, x + 5, y + 0.5, 4.5, C.navy);
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
  doc.setFillColor(250, 250, 253);
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, chartH, 'FD');

  // Horizontal guide lines
  doc.setDrawColor(230, 228, 245);
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
  doc.text(`${maxI.toFixed(0)} l/s·ha`, x - 1, y + 3, { align: 'right' });
  doc.text('0', x - 1, y + chartH - 0.5, { align: 'right' });

  // Y right
  doc.setTextColor(...C.red);
  doc.text(`${maxCum.toFixed(1)} mm`, x + w + 1, y + 3);

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
  doc.setFillColor(240, 244, 248);
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
    doc.setDrawColor(180, 180, 200);
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

    const res   = edgeRes?.get(edge.id);
    const depth = res?.depthRatio || 0;

    let col, lw;
    if (depth > 0.9)      { col = C.red;    lw = 0.9; }
    else if (depth > 0.7) { col = C.orange; lw = 0.7; }
    else                  { col = C.blue;   lw = 0.45; }

    doc.setDrawColor(...col);
    doc.setLineWidth(lw);

    // Nutze coords (Polylinie) wenn vorhanden, sonst gerade Linie
    if (edge.coords?.length >= 2) {
      for (let i = 1; i < edge.coords.length; i++) {
        const [x1, y1] = toP(edge.coords[i-1].x, edge.coords[i-1].y);
        const [x2, y2] = toP(edge.coords[i].x,   edge.coords[i].y);
        doc.line(x1, y1, x2, y2);
      }
    } else {
      const [x1, y1] = toP(fn.x, fn.y);
      const [x2, y2] = toP(tn.x, tn.y);
      doc.line(x1, y1, x2, y2);
    }
  }

  // ── 3. Knoten als Kreise — nach Status ──
  for (const node of nodes.values()) {
    if (!isFinite(node.x) || !isFinite(node.y)) continue;
    const [px, py] = toP(node.x, node.y);
    const res        = nodeRes?.get(node.id);
    const isOutfall  = ['OUTFALL', 'Outfall'].includes(node.type);
    const flooded    = (res?.floodingVolume || 0) > 0.001;
    const surcharged = res?.surcharged;

    if (isOutfall) {
      // Dreieck für Auslass
      doc.setFillColor(...C.green);
      doc.setDrawColor(...C.green);
      doc.triangle(px, py - 2, px - 1.5, py + 1, px + 1.5, py + 1, 'F');
    } else {
      const col = flooded ? C.red : surcharged ? C.orange : C.navy;
      doc.setFillColor(...col);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.circle(px, py, flooded ? 1.4 : 1.0, 'FD');
    }
  }

  doc.restoreGraphicsState();

  // ── Legende ──
  const ly = y + drawH + 1;
  const items = [
    { type: 'line', c: C.blue,   l: 'Haltung OK' },
    { type: 'line', c: C.orange, l: 'Belastet (h/d>70%)' },
    { type: 'line', c: C.red,    l: 'Überlastet' },
    { type: 'dot',  c: C.navy,   l: 'Schacht' },
    { type: 'dot',  c: C.red,    l: 'Überstau/Überflutet' },
    { type: 'tri',  c: C.green,  l: 'Auslass' },
    { type: 'fill', c: [167,243,208], l: 'Fläche niedrig Ψ' },
    { type: 'fill', c: [253,186,116], l: 'Fläche hoch Ψ' },
  ];
  let lx = x + 1;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.5);
  for (const { type, c, l } of items) {
    if (lx + 22 > x + w) break;
    doc.setFillColor(...c);
    doc.setDrawColor(...c);
    if (type === 'line') {
      doc.setLineWidth(1.2);
      doc.line(lx, ly + 2, lx + 4, ly + 2);
    } else if (type === 'dot') {
      doc.circle(lx + 2, ly + 2, 1.2, 'F');
    } else if (type === 'tri') {
      doc.triangle(lx + 2, ly, lx + 0.5, ly + 3.5, lx + 3.5, ly + 3.5, 'F');
    } else {
      doc.setDrawColor(180, 180, 200);
      doc.setLineWidth(0.15);
      doc.rect(lx, ly + 0.5, 4, 3, 'FD');
    }
    doc.setTextColor(...C.muted);
    doc.text(l, lx + 5.5, ly + 3);
    lx += 24;
  }
}

// ─── Main Export ─────────────────────────────────────────────────────────────
async function exportPDF() {
  exporting.value = true;
  try {
    // Pre-load pixel font so canvas rendering uses it (not fallback monospace)
    try { await document.fonts.load("10px 'Press Start 2P'"); } catch (_) {}

    const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
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
      alternateRowStyles: { fillColor: [248, 249, 255] },
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
    doc.text(`Erstellt: ${new Date().toLocaleString('de-DE')}  ·  Einzugsgebiet: ${(props.totalCatchmentAreaHa || 0).toFixed(4)} ha  ·  ${props.nodes?.size || 0} Schächte  ·  ${props.edges?.size || 0} Haltungen`, ML, cy + 5.5);
    cy += 12;

    // KPI boxes
    const kW = (CW - 9) / 4;
    kpiBox(doc, ML,                cy, kW, 24, ['Niederschlag', '(Gesamthöhe)'],    `${rb.precipMm.toFixed(1)}`,              'mm', C.blue);
    kpiBox(doc, ML + kW + 3,      cy, kW, 24, ['Oberfl.', 'Abfluss'],              `${rb.runoffMm.toFixed(1)}`,              'mm', C.purple);
    kpiBox(doc, ML + (kW + 3) * 2,cy, kW, 24, ['Abfluss-', 'beiwert Ψ'],          `${rb.psi.toFixed(3)}`,                   '',   C.navy);
    kpiBox(doc, ML + (kW + 3) * 3,cy, kW, 24, ['Kontinuitäts-', 'fehler Flow'],   `${(stats.flow?.error || 0).toFixed(2)}`, '%',  errColor);
    cy += 28;

    // Two-column layout: Niederschlagsbilanz | Simulations-Parameter
    const colW = (CW - 6) / 2;
    const col2x = ML + colW + 6;
    let cyL = sectionTitle(doc, cy, 'Niederschlagsbilanz (Runoff)', ML);
    let cyR = sectionTitle(doc, cy, 'Simulations-Parameter', col2x);

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
    doc.text(`${(props.totalCatchmentAreaHa || 0).toFixed(4)} ha`, ML + 24, cyL + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175);
    doc.text(`= ${((props.totalCatchmentAreaHa || 0) * 10000).toLocaleString('de-DE')} m²`, ML + colW - 2, cyL + 4.5, { align: 'right' });
    cyL += 9;

    autoTable(doc, {
      ...tableDefaults({ margin: { left: ML, right: col2x - 1, top: 20, bottom: 12 } }),
      startY: cyL,
      head:   [['Posten', 'mm', 'm³']],
      body:   [
        ['Niederschlag',      rb.precipMm.toFixed(2),       fmtV(stats.runoff?.precip)],
        ['Verdunstung',       rb.evapMm.toFixed(2),         fmtV(stats.runoff?.evap)],
        ['Infiltration',      rb.infilMm.toFixed(2),        fmtV(stats.runoff?.infil)],
        ['Oberfl.-Abfluss',   rb.runoffMm.toFixed(2),       fmtV(stats.runoff?.runoff)],
        ['Endspeicherung',    rb.finalStorageMm.toFixed(3), fmtV(stats.runoff?.finalStorage)],
        ['Abflussbeiwert Ψ',  rb.psi.toFixed(3),            ''],
        ['Kont.-Fehler Runoff',`${(stats.runoff?.error || 0).toFixed(3)} %`, ''],
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
        ['Start',            stats.analysisOptions?.startDate            || '—'],
        ['Ende',             stats.analysisOptions?.endDate              || '—'],
        ['Zeitschritt',      stats.analysisOptions?.routingTimeStep      || '—'],
        ['Kont.-Fehler Flow',`${(stats.flow?.error || 0).toFixed(3)} %`],
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
        `Gesamt: ${totalMm.toFixed(1)} mm  ·  Spitze: ${peakI.toFixed(1)} l/s·ha  ·  Δt: ${interval} min  ·  Dauer: ${series.length * interval} min`,
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
    }

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 2 — Netzwerk + Haltungen
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage();
    cy = 20;

    cy = sectionTitle(doc, cy, 'Netzwerk-Übersicht');
    drawNetwork(doc, ML, cy, CW, 78);
    cy += 83;

    cy = sectionTitle(doc, cy, `Haltungen (${props.edges?.size || 0})`);

    const edgeRows = [];
    for (const [id, edge] of (props.edges?.entries() || [])) {
      const res = props.edgeResults?.get(id) || {};
      const ratio = res.depthRatio || 0;
      const status = ratio > 0.9 ? 'ÜBERLASTET' : ratio > 0.7 ? 'BELASTET' : 'OK';
      edgeRows.push([
        id,
        fmt(res.maxFlow, 1),
        fmt(res.capacity, 1),
        fmt(res.flowCapacityRatio, 2),
        fmt(res.maxVelocity, 2),
        res.timeOfMaxFlow || '—',
        status,
      ]);
    }

    autoTable(doc, {
      ...tableDefaults(),
      startY: cy,
      head:   [['ID', 'Max Q (l/s)', 'Kap. (l/s)', 'Q/Qvoll', 'v_max (m/s)', 't_max', 'Status']],
      body:   edgeRows,
      didParseCell: (data) => {
        if (data.column.index === 6 && data.section === 'body') {
          const v = data.cell.raw;
          if (v === 'ÜBERLASTET') data.cell.styles.textColor = C.red;
          else if (v === 'BELASTET') data.cell.styles.textColor = C.orange;
          else data.cell.styles.textColor = [5, 150, 105];
        }
      },
    });

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 3 — Schächte & Bauwerke
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage();
    cy = 20;
    cy = sectionTitle(doc, cy, `Schächte & Bauwerke (${props.nodes?.size || 0})`);

    const nodeRows = [];
    for (const [id, node] of (props.nodes?.entries() || [])) {
      const res    = props.nodeResults?.get(id) || {};
      const flooded= (res.floodingVolume || 0) > 0.001;
      const status = flooded ? 'ÜBERFLUTET' : res.surcharged ? 'EINGESTAUT' : 'OK';
      nodeRows.push([
        id,
        fmt(node.z, 2),
        fmt(res.maxDepth, 2),
        fmt(res.maxHGL, 2),
        fmt(res.floodingVolume || 0, 3),
        res.timeOfMaxDepth || '—',
        status,
      ]);
    }

    autoTable(doc, {
      ...tableDefaults(),
      startY: cy,
      head:   [['ID', 'Sohle (m)', 'Max h (m)', 'Max HGL (m)', 'Übfl.-Vol. (m³)', 't_max', 'Status']],
      body:   nodeRows,
      didParseCell: (data) => {
        if (data.column.index === 6 && data.section === 'body') {
          const v = data.cell.raw;
          if (v === 'ÜBERFLUTET')  data.cell.styles.textColor = C.red;
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

    const areaEntries = props.areaResults instanceof Map
      ? Array.from(props.areaResults.entries())
      : Object.entries(props.areaResults || {});

    autoTable(doc, {
      ...tableDefaults(),
      startY: cy,
      head:   [['ID', 'Fläche (ha)', 'N (mm)', 'Infil. (mm)', 'Abfl. (mm)', 'Ψ', 'Q_peak (m³/s)']],
      body:   areaEntries.map(([id, d]) => [
        id,
        fmt(d.size ?? 0, 4),
        fmt(d.precip ?? 0, 2),
        fmt(d.totalInfil ?? 0, 2),
        fmt(d.totalRunoffMm ?? d.runoffMm ?? 0, 2),
        fmt(d.runoffCoeff ?? 0, 3),
        fmt((d.peakRunoff ?? 0) / 1000, 4),
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
    alert('Fehler beim PDF-Export:\n' + err.message);
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.pdf-export-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  background: #040647;
  color: #fff;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 600;
  font-family: 'Press Start 2P', monospace;
  letter-spacing: 0.04em;
  transition: background 0.15s, opacity 0.15s;
}
.pdf-export-btn:hover:not(:disabled) { background: #594491; }
.pdf-export-btn:disabled { opacity: 0.5; cursor: default; }
.pdf-icon {
  width: 18px;
  height: 18px;
  filter: invert(1);
}
</style>
