<template>
  <canvas
    ref="canvasEl"
    class="pdfed-wet"
    :style="{
      width: breite + 'px',
      height: hoehe + 'px',
      mixBlendMode: blend,
    }"
  ></canvas>
</template>

<script setup>
/**
 * WetInkLayer — das viewport-weite Canvas für den NASSEN Strich.
 *
 * Nur der gerade entstehende Strich lebt hier: jedes Pointer-Paket (inkl.
 * coalesced Events) hängt Punkte an, gezeichnet wird rAF-koalesziert, die
 * vorhergesagten Punkte (getPredictedEvents) werden mitgezeichnet, aber nie
 * committet — das kaschiert die Eingabelatenz (OneNote-Gefühl). Erst bei
 * pointerup wandert der Strich in den Store und das Seiten-Canvas zeichnet
 * EINMAL neu; der teure Voll-Redraw bleibt aus der Stiftschleife heraus.
 *
 * Während eines Strichs wird nicht gescrollt/gezoomt (Konfliktregeln), die
 * Abbildung Seite→Viewport ist deshalb je Strich konstant (ursprung, zoom).
 */
import { ref, watch, onMounted } from 'vue';
import { strichUmriss } from '../services/InkGeometry';

const props = defineProps({
  breite: { type: Number, required: true },
  hoehe: { type: Number, required: true },
});

const canvasEl = ref(null);
const blend = ref('normal');

let kontext = null;       // { tool, farbe, breitePt, deckkraft, echterDruck, ursprung:{x,y}, zoom, seitenIndex, breiteSeitePt, hoeheSeitePt }
let punkte = [];          // committete Punkte [[xPt, yPt, druck]]
let vorhersage = [];      // nur Anzeige
let radiererKreis = null;  // { x, y, r } Viewport-px — der sichtbare Radiergummi
let markerVorschau = null; // { x, y, breitePx, farbe } — Markerstrich am Cursor
let rafGeplant = false;

function _ctx() {
  return canvasEl.value?.getContext('2d');
}

function _zeichneMarkerVorschau(ctx, dpr) {
  if (!markerVorschau) return;
  const { x, y, breitePx, farbe } = markerVorschau;
  // Kleine Textmarker-SPITZE am Cursor: kurzer schräger Keil, der an beiden
  // Enden spitz zuläuft — der Druckverlauf (fast 0 an den Enden) lässt
  // perfect-freehand die Kontur dort zusammenlaufen.
  const halb = Math.max(5, breitePx * 0.55);
  const punkte = [
    [x - halb, y + halb * 0.55, 0.03],
    [x - halb * 0.35, y + halb * 0.19, 0.8],
    [x + halb * 0.35, y - halb * 0.19, 0.8],
    [x + halb, y - halb * 0.55, 0.03],
  ];
  const umriss = strichUmriss(
    {
      points: punkte, breitePt: Math.max(3, breitePx * 0.5),
      tool: 'stift', stiftArt: 'bleistift', echterDruck: true,
    },
    { laufend: false },
  );
  if (umriss.length < 3) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Etwas kräftiger als der echte Strich (0,4) — die Vorschau muss auch
  // auf weißem Papier sofort ins Auge fallen.
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = farbe;
  ctx.beginPath();
  ctx.moveTo(umriss[0][0], umriss[0][1]);
  for (let i = 1; i < umriss.length; i++) ctx.lineTo(umriss[i][0], umriss[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function _zeichneRadiererKreis(ctx, dpr) {
  if (!radiererKreis) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.beginPath();
  ctx.arc(radiererKreis.x, radiererKreis.y, Math.max(3, radiererKreis.r), 0, Math.PI * 2);
  // heller Kern + dunkler Rand — sichtbar auf Papier UND auf Tinte
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(60, 64, 70, 0.9)';
  ctx.lineWidth = 1.25;
  ctx.stroke();
}

function _zeichne() {
  rafGeplant = false;
  const ctx = _ctx();
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvasEl.value.width, canvasEl.value.height);
  if (!kontext || punkte.length === 0) {
    _zeichneRadiererKreis(ctx, dpr);
    _zeichneMarkerVorschau(ctx, dpr);
    return;
  }

  // Lasso: gestrichelter Linienzug statt gefüllter Tinte.
  if (kontext.tool === 'lasso') {
    const { ursprung, zoom } = kontext;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = kontext.farbe;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(ursprung.x + punkte[0][0] * zoom, ursprung.y + punkte[0][1] * zoom);
    for (let i = 1; i < punkte.length; i++) {
      ctx.lineTo(ursprung.x + punkte[i][0] * zoom, ursprung.y + punkte[i][1] * zoom);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  const alle = vorhersage.length ? punkte.concat(vorhersage) : punkte;
  const umriss = strichUmriss(
    {
      points: alle, breitePt: kontext.breitePt, tool: kontext.tool,
      stiftArt: kontext.stiftArt, echterDruck: kontext.echterDruck,
    },
    { laufend: true },
  );
  if (umriss.length < 3) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = kontext.deckkraft ?? 1;
  ctx.fillStyle = kontext.farbe;
  const { ursprung, zoom } = kontext;
  ctx.beginPath();
  ctx.moveTo(ursprung.x + umriss[0][0] * zoom, ursprung.y + umriss[0][1] * zoom);
  for (let i = 1; i < umriss.length; i++) {
    ctx.lineTo(ursprung.x + umriss[i][0] * zoom, ursprung.y + umriss[i][1] * zoom);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function _planeZeichnen() {
  if (rafGeplant) return;
  rafGeplant = true;
  requestAnimationFrame(_zeichne);
}

// ── API für usePointerTools ─────────────────────────────────────────────────

function starte(neuerKontext) {
  kontext = neuerKontext;
  punkte = [];
  vorhersage = [];
  // Marker mischen multiplikativ mit dem Seiteninhalt darunter — per CSS,
  // weil der nasse Strich auf einem eigenen, transparenten Canvas liegt.
  blend.value = neuerKontext.tool === 'textmarker' ? 'multiply' : 'normal';
}

function punkt(xPt, yPt, druck) {
  if (!kontext) return;
  punkte.push([xPt, yPt, druck]);
  _planeZeichnen();
}

function zeigeVorhersage(punkteListe) {
  if (!kontext) return;
  vorhersage = punkteListe;
  _planeZeichnen();
}

/** @returns {{points: number[][]}|null} die committeten Punkte des Strichs */
function beende() {
  if (!kontext) return null;
  const ergebnis = punkte.length ? { points: punkte } : null;
  kontext = null;
  punkte = [];
  vorhersage = [];
  _planeZeichnen();
  return ergebnis;
}

function brich() {
  kontext = null;
  punkte = [];
  vorhersage = [];
  _planeZeichnen();
}

function istAktiv() { return kontext != null; }

function anzahlPunkte() { return punkte.length; }

/** Radiergummi-Kreis anzeigen (Viewport-px) — folgt dem Zeiger beim Radieren. */
function zeigeRadierer(x, y, r) {
  radiererKreis = { x, y, r };
  markerVorschau = null;
  // Ein Marker-Strich hinterlässt mix-blend-mode multiply auf dem Canvas —
  // damit wäre der weiße Kreisrand unsichtbar.
  if (!kontext) blend.value = 'normal';
  _planeZeichnen();
}

/** Marker-Vorschau am Cursor (Viewport-px) — zeigt Farbe und Breite. */
function zeigeMarkerVorschau(x, y, breitePx, farbe) {
  markerVorschau = { x, y, breitePx, farbe };
  radiererKreis = null;
  // Multiply wie ein echter Markerstrich über dem Seiteninhalt.
  if (!kontext) blend.value = 'multiply';
  _planeZeichnen();
}

function versteckeRadierer() {
  if (!radiererKreis && !markerVorschau) return;
  radiererKreis = null;
  markerVorschau = null;
  _planeZeichnen();
}

defineExpose({
  starte, punkt, zeigeVorhersage, beende, brich, istAktiv, anzahlPunkte,
  zeigeRadierer, zeigeMarkerVorschau, versteckeRadierer,
});

// ── Canvas-Größe an den Viewport koppeln (DPR-scharf) ───────────────────────

function _passeGroesseAn() {
  const dpr = window.devicePixelRatio || 1;
  if (!canvasEl.value) return;
  canvasEl.value.width = Math.max(1, Math.round(props.breite * dpr));
  canvasEl.value.height = Math.max(1, Math.round(props.hoehe * dpr));
  _planeZeichnen();
}

watch(() => [props.breite, props.hoehe], _passeGroesseAn);
onMounted(_passeGroesseAn);
</script>

<style scoped>
.pdfed-wet {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}
</style>
