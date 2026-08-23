<template>
  <Teleport to="body">
    <div class="pdfed-sig-hintergrund" @pointerdown.self="$emit('schliessen')">
      <div class="pdfed-sig-dialog">
        <header class="pdfed-sig-kopf">
          <PdfIcon name="signatur" :size="20" />
          <span>Signatur</span>
          <button class="pdfed-btn" title="Schließen" @click="$emit('schliessen')">
            <PdfIcon name="schliessen" />
          </button>
        </header>

        <div class="pdfed-sig-pad-rahmen">
          <canvas
            ref="padEl"
            class="pdfed-sig-pad"
            @pointerdown="starteStrich"
            @pointermove="bewegeStrich"
            @pointerup="beendeStrich"
            @pointercancel="beendeStrich"
          ></canvas>
          <span v-if="!strokes.length && !aktiverStrich" class="pdfed-sig-hinweis">
            Hier mit Stift oder Finger unterschreiben
          </span>
        </div>

        <div class="pdfed-sig-leiste">
          <button
            v-for="f in FARBEN"
            :key="f"
            class="pdfed-sig-farbe"
            :class="{ 'ist-aktiv': farbe === f }"
            :style="{ background: f }"
            @click="farbe = f"
          ></button>
          <span class="pdfed-sig-frei"></span>
          <button class="pdfed-btn" title="Letzten Strich zurücknehmen" :disabled="!strokes.length" @click="strokes.pop()">
            <PdfIcon name="undo" />
          </button>
          <button class="pdfed-btn" title="Pad leeren" :disabled="!strokes.length" @click="strokes = []">
            <PdfIcon name="loeschen" />
          </button>
        </div>

        <div class="pdfed-sig-aktionen">
          <button class="pdfed-btn" :disabled="!strokes.length" @click="speichereInBibliothek">
            <PdfIcon name="speichern" /> Merken
          </button>
          <button class="pdfed-btn ist-primaer" :disabled="!strokes.length" @click="platziere()">
            <PdfIcon name="ok" /> Platzieren
          </button>
        </div>

        <section v-if="bibliothek.length" class="pdfed-sig-bibliothek">
          <h3 class="pdfed-sig-titel">Gespeicherte Signaturen</h3>
          <ul class="pdfed-sig-liste">
            <li v-for="s in bibliothek" :key="s.id">
              <button class="pdfed-sig-karte" :title="`„${s.name}“ platzieren`" @click="platziere(s)">
                <svg :viewBox="`0 0 1 ${s.seitenverhaeltnis}`" class="pdfed-sig-vorschau">
                  <polyline
                    v-for="(st, i) in s.strokes"
                    :key="i"
                    :points="st.map(p => `${p[0]},${p[1] * s.seitenverhaeltnis}`).join(' ')"
                    fill="none"
                    :stroke="s.farbe"
                    stroke-width="0.015"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <span>{{ s.name }}</span>
              </button>
              <button class="pdfed-btn pdfed-sig-loeschen" :title="`„${s.name}“ löschen`" @click="loescheAusBibliothek(s.id)">
                <PdfIcon name="loeschen" :size="15" />
              </button>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * SignatureDialog — Unterschrift zeichnen (druckempfindlich, gleiche
 * Ink-Pipeline wie die Seite), als Vektor in der Bibliothek merken und
 * per Tipp auf der Seite platzieren. Strokes werden auf den 0..1-Raum
 * normiert — Skalieren auf der Seite bleibt damit verlustfrei.
 */
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import PdfIcon from './PdfIcon.vue';
import { useToolStore } from '../stores/useToolStore';
import { repo } from '../services/PdfRepo';
import { strichUmriss } from '../services/InkGeometry';
import { SIGNATUR_REFERENZ_BREITE_PT } from '../services/AnnotationPainter';

const FARBEN = ['#1e3a8a', '#111827'];
const PAD_STRICH_PX = 3;

const emit = defineEmits(['schliessen', 'platziert']);
const toolStore = useToolStore();

const padEl = ref(null);
const strokes = ref([]);        // [[x, y, druck], ...] je Strich, Pad-Pixel
const farbe = ref(FARBEN[0]);
const bibliothek = ref([]);
let aktiverStrich = null;       // { pointerId, punkte }

// ── Pad-Zeichnung ───────────────────────────────────────────────────────────

function _zeichnePad() {
  const canvas = padEl.value;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = farbe.value;
  const alle = aktiverStrich ? [...strokes.value, aktiverStrich.punkte] : strokes.value;
  for (const punkte of alle) {
    if (punkte.length < 1) continue;
    const umriss = strichUmriss(
      { points: punkte, breitePt: PAD_STRICH_PX, tool: 'stift', echterDruck: true },
      { laufend: punkte === aktiverStrich?.punkte },
    );
    if (umriss.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(umriss[0][0], umriss[0][1]);
    for (let i = 1; i < umriss.length; i++) ctx.lineTo(umriss[i][0], umriss[i][1]);
    ctx.closePath();
    ctx.fill();
  }
}

watch([strokes, farbe], _zeichnePad, { deep: true });

function _padKoord(ev) {
  const r = padEl.value.getBoundingClientRect();
  return [ev.clientX - r.left, ev.clientY - r.top, ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.5];
}

function starteStrich(ev) {
  if (ev.button === 2 || aktiverStrich) return;
  padEl.value.setPointerCapture(ev.pointerId);
  aktiverStrich = { pointerId: ev.pointerId, punkte: [_padKoord(ev)] };
  _zeichnePad();
}

function bewegeStrich(ev) {
  if (!aktiverStrich || aktiverStrich.pointerId !== ev.pointerId) return;
  for (const e of ev.getCoalescedEvents?.() ?? [ev]) {
    aktiverStrich.punkte.push(_padKoord(e));
  }
  _zeichnePad();
}

function beendeStrich(ev) {
  if (!aktiverStrich || aktiverStrich.pointerId !== ev.pointerId) return;
  if (aktiverStrich.punkte.length > 1) strokes.value.push(aktiverStrich.punkte);
  aktiverStrich = null;
  _zeichnePad();
}

// ── Normierung & Bibliothek ─────────────────────────────────────────────────

function _normiere() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes.value) {
    for (const [x, y] of s) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const w = maxX - minX, h = maxY - minY;
  if (!(w > 5) || !(h > 2)) return null;
  return {
    strokes: strokes.value.map(s => s.map(([x, y, p]) => [(x - minX) / w, (y - minY) / h, p])),
    seitenverhaeltnis: h / w,
    strichBreitePt: (PAD_STRICH_PX / w) * SIGNATUR_REFERENZ_BREITE_PT,
    farbe: farbe.value,
    echterDruck: true,
  };
}

async function _ladeBibliothek() {
  bibliothek.value = (await repo.get('signatures')) ?? [];
}

async function speichereInBibliothek() {
  const vorlage = _normiere();
  if (!vorlage) return;
  bibliothek.value.push({
    id: crypto.randomUUID(),
    name: `Signatur ${bibliothek.value.length + 1}`,
    ...vorlage,
  });
  await repo.set('signatures', JSON.parse(JSON.stringify(bibliothek.value)));
}

async function loescheAusBibliothek(id) {
  bibliothek.value = bibliothek.value.filter(s => s.id !== id);
  await repo.set('signatures', JSON.parse(JSON.stringify(bibliothek.value)));
}

function platziere(vorlage = null) {
  const v = vorlage ?? _normiere();
  if (!v) return;
  toolStore.signaturZumPlatzieren = v;
  toolStore.waehleWerkzeug('signatur');
  emit('platziert');
  emit('schliessen');
}

// ── Aufbau ──────────────────────────────────────────────────────────────────

function _passePadAn() {
  const canvas = padEl.value;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  _zeichnePad();
}

let resizeObserver = null;
onMounted(async () => {
  _passePadAn();
  resizeObserver = new ResizeObserver(_passePadAn);
  resizeObserver.observe(padEl.value);
  await _ladeBibliothek();
});
onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<style scoped>
.pdfed-sig-hintergrund {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 17, 20, 0.45);
}
.pdfed-sig-dialog {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: var(--pdf-flaeche);
  color: var(--pdf-text);
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius);
  box-shadow: var(--pdf-schatten);
  font-family: var(--pdf-schrift);
}
.pdfed-sig-kopf {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 650;
}
.pdfed-sig-kopf > button { margin-left: auto; }

.pdfed-sig-pad-rahmen {
  position: relative;
  border: 1.5px dashed var(--pdf-rand-stark);
  border-radius: var(--pdf-radius-klein);
  background: #ffffff;
}
.pdfed-sig-pad {
  display: block;
  width: 100%;
  height: 220px;
  touch-action: none;
}
.pdfed-sig-hinweis {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9aa1a9;
  pointer-events: none;
}

.pdfed-sig-leiste,
.pdfed-sig-aktionen {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pdfed-sig-aktionen { justify-content: flex-end; }
.pdfed-sig-frei { flex: 1; }
.pdfed-sig-farbe {
  width: 30px;
  height: 30px;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  padding: 0;
}
.pdfed-sig-farbe.ist-aktiv { border-color: var(--pdf-akzent); }

.pdfed-sig-titel {
  margin: 4px 0 6px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--pdf-text-dim);
}
.pdfed-sig-liste {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}
.pdfed-sig-liste li { position: relative; }
.pdfed-sig-karte {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius-klein);
  background: #ffffff;
  color: var(--pdf-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.pdfed-sig-karte:hover { border-color: var(--pdf-akzent); }
.pdfed-sig-karte span { color: #4b5563; }
.pdfed-sig-vorschau { width: 100%; height: 44px; }
.pdfed-sig-loeschen {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 30px;
  min-height: 30px;
  padding: 0;
  color: var(--pdf-text-dim);
}
.pdfed-sig-loeschen:hover { color: var(--pdf-fehler); }
</style>
