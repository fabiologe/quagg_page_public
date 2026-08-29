<template>
  <div class="pdfed-auswahl">
    <!-- Die gewählten Objekte selbst — als SVG in Seitenkoordinaten, damit
         Verschieben/Skalieren live und billig als CSS-Transform läuft.
         (Das Annotations-Canvas blendet sie derweil aus.) -->
    <svg
      class="pdfed-auswahl-svg"
      :viewBox="`0 0 ${breitePt} ${hoehePt}`"
      preserveAspectRatio="none"
    >
      <g :transform="svgTransform">
        <!-- Bilder zuerst — sie liegen wie im Painter unter allem -->
        <template v-for="b in svgBilder" :key="b.id">
          <image
            v-if="b.href"
            :href="b.href"
            :x="b.x" :y="b.y" :width="b.w" :height="b.h"
            preserveAspectRatio="none"
          />
          <rect
            v-else
            :x="b.x" :y="b.y" :width="b.w" :height="b.h"
            fill="none" stroke="#9aa1a9" stroke-width="0.8" stroke-dasharray="4 3"
          />
        </template>
        <path
          v-for="(p, i) in svgPfade"
          :key="i"
          :d="p.d"
          :fill="p.farbe"
          :fill-opacity="p.deckkraft"
          :style="p.blend === 'multiply' ? 'mix-blend-mode: multiply' : ''"
        />
        <g v-for="t in svgTextfelder" :key="t.id">
          <rect
            v-if="t.hintergrund"
            :x="t.x" :y="t.y" :width="t.breite" :height="t.hoehe"
            :fill="t.hintergrund"
          />
          <text
            v-for="(zeile, zi) in t.zeilen"
            :key="zi"
            :x="t.textX"
            :y="t.textYs[zi]"
            :font-size="t.groesse"
            :fill="t.farbe"
            font-family="Helvetica, Arial, sans-serif"
          >{{ zeile }}</text>
        </g>
        <g
          v-for="st in svgStempel"
          :key="st.id"
          :transform="st.transform"
          opacity="0.85"
        >
          <rect
            :x="-st.halbBreite" :y="-st.halbHoehe"
            :width="st.halbBreite * 2" :height="st.halbHoehe * 2"
            fill="none" :stroke="st.farbe" stroke-width="1.4"
          />
          <text
            x="0" :y="st.textY"
            :font-size="st.groesse" :fill="st.farbe"
            font-weight="600" text-anchor="middle" dominant-baseline="central"
            font-family="Helvetica, Arial, sans-serif"
          >{{ st.text }}</text>
          <text
            v-if="st.datum"
            x="0" :y="st.datumY"
            :font-size="st.groesse * 0.5" :fill="st.farbe"
            font-weight="600" text-anchor="middle" dominant-baseline="central"
            font-family="Helvetica, Arial, sans-serif"
          >{{ st.datum }}</text>
        </g>
      </g>
    </svg>

    <!-- Rahmen + Aktionen -->
    <div
      class="pdfed-auswahl-box"
      :style="boxStil"
      @pointerdown.stop="starteVerschieben"
      @pointermove="bewege"
      @pointerup="beende"
      @pointercancel="beende"
    >
      <div
        class="pdfed-auswahl-aktionen"
        :style="{ transform: `translateX(-50%) rotate(${-viewStore.drehung}deg)` }"
        @pointerdown.stop
      >
        <button class="pdfed-btn pdfed-auswahl-btn" title="Auswahl löschen" @click="annotStore.loescheAuswahl()">
          <PdfIcon name="loeschen" :size="16" />
        </button>
        <button class="pdfed-btn pdfed-auswahl-btn" title="Auswahl aufheben" @click="annotStore.leereAuswahl()">
          <PdfIcon name="schliessen" :size="16" />
        </button>
      </div>
      <div
        v-if="kannSkalieren"
        class="pdfed-auswahl-griff"
        title="Größe ändern"
        @pointerdown.stop="starteSkalieren"
        @pointermove="bewege"
        @pointerup="beende"
        @pointercancel="beende"
      ></div>
    </div>
  </div>
</template>

<script setup>
/**
 * SelectionBox — die Lasso-Auswahl einer Seite: Rahmen, Live-Verschieben,
 * Löschen; bei genau EINER Signatur zusätzlich proportionales Skalieren
 * über den Eckgriff. Commit erst am Zugende als EIN Undo-Schritt.
 */
import { ref, computed, watch } from 'vue';
import PdfIcon from './PdfIcon.vue';
import { useAnnotStore } from '../stores/useAnnotStore';
import { useViewStore } from '../stores/useViewStore';
import { useDocStore } from '../stores/useDocStore';
import { holeBildUrl, ladeBildUrl } from '../services/BildAblage';
import { drehDelta } from '../services/AnsichtRotation';
import { strichUmrissGecacht, strichUmriss, begrenzungsBox } from '@/services/tinte/InkGeometry';
import { SIGNATUR_REFERENZ_BREITE_PT, stempelMasse } from '../services/AnnotationPainter';
import { textboxMasse, messeTextBreitePt, TEXTBOX_POLSTER_PT, TEXTBOX_ZEILENHOEHE } from '../services/TextboxMasse';

const props = defineProps({
  index:    { type: Number, required: true },
  zoom:     { type: Number, required: true },   // CSS-px je Seitenpunkt
  breitePt: { type: Number, required: true },
  hoehePt:  { type: Number, required: true },
});

const annotStore = useAnnotStore();
const viewStore = useViewStore();
const docStore = useDocStore();

const items = computed(() =>
  annotStore.auswahlItems.filter(a => a.page === props.index));

// ── Bilder in der Auswahl: SVG <image> über Object-URLs der BildAblage ──────
// Die URLs gehören der Ablage (eine je Blob, Revoke beim Schließen des
// Dokuments) — die Komponente erzeugt und revoked nie selbst.
const bildUrls = ref({});
watch(items, (liste) => {
  for (const a of liste) {
    if (a.type !== 'bild' || bildUrls.value[a.bildKey]) continue;
    const sofort = holeBildUrl(docStore.dokId, a.bildKey);
    if (sofort) { bildUrls.value = { ...bildUrls.value, [a.bildKey]: sofort }; continue; }
    ladeBildUrl(docStore.dokId, a.bildKey).then((url) => {
      if (url) bildUrls.value = { ...bildUrls.value, [a.bildKey]: url };
    });
  }
}, { immediate: true });

const svgBilder = computed(() =>
  items.value.filter(a => a.type === 'bild').map(a => ({
    id: a.id, x: a.x, y: a.y, w: a.w, h: a.h,
    href: bildUrls.value[a.bildKey] ?? null,
  })));

// Skalieren (proportional über den Eckgriff): genau EINE Signatur oder EIN Bild.
const kannSkalieren = computed(() =>
  items.value.length === 1 && (items.value[0].type === 'signature' || items.value[0].type === 'bild'));

// ── Geometrie ───────────────────────────────────────────────────────────────

const POLSTER_PT = 6;

const bbox = computed(() => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const a of items.value) {
    if (a.type === 'ink') {
      const b = begrenzungsBox(a.points);
      const rand = a.breitePt / 2;
      minX = Math.min(minX, b.minX - rand);
      minY = Math.min(minY, b.minY - rand);
      maxX = Math.max(maxX, b.maxX + rand);
      maxY = Math.max(maxY, b.maxY + rand);
    } else if (a.type === 'signature' || a.type === 'bild') {
      minX = Math.min(minX, a.x);
      minY = Math.min(minY, a.y);
      maxX = Math.max(maxX, a.x + a.w);
      maxY = Math.max(maxY, a.y + a.h);
    } else if (a.type === 'textbox') {
      const m = textboxMasse(a);
      minX = Math.min(minX, a.x);
      minY = Math.min(minY, a.y);
      maxX = Math.max(maxX, a.x + m.breite);
      maxY = Math.max(maxY, a.y + m.hoehe);
    } else if (a.type === 'stempel') {
      // Achsen-Hülle der GEDREHTEN Stempelbox um den Mittelpunkt (x, y).
      const m = stempelMasse(a, messeTextBreitePt);
      const rad = ((a.winkelGrad ?? 12) * Math.PI) / 180;
      const hb = (m.breite / 2) * Math.abs(Math.cos(rad)) + (m.hoehe / 2) * Math.abs(Math.sin(rad));
      const hh = (m.breite / 2) * Math.abs(Math.sin(rad)) + (m.hoehe / 2) * Math.abs(Math.cos(rad));
      minX = Math.min(minX, a.x - hb);
      minY = Math.min(minY, a.y - hh);
      maxX = Math.max(maxX, a.x + hb);
      maxY = Math.max(maxY, a.y + hh);
    }
  }
  if (!isFinite(minX)) return null;
  return {
    x: minX - POLSTER_PT, y: minY - POLSTER_PT,
    w: maxX - minX + 2 * POLSTER_PT, h: maxY - minY + 2 * POLSTER_PT,
  };
});

function _umrissZuPfad(umriss) {
  if (umriss.length < 3) return '';
  let d = `M ${umriss[0][0].toFixed(2)} ${umriss[0][1].toFixed(2)}`;
  for (let i = 1; i < umriss.length; i++) {
    d += ` L ${umriss[i][0].toFixed(2)} ${umriss[i][1].toFixed(2)}`;
  }
  return d + ' Z';
}

const svgPfade = computed(() => {
  const pfade = [];
  for (const a of items.value) {
    if (a.type === 'ink') {
      pfade.push({
        d: _umrissZuPfad(strichUmrissGecacht(a)),
        farbe: a.farbe,
        deckkraft: a.tool === 'textmarker' ? (a.deckkraft ?? 0.4) : (a.deckkraft ?? 1),
        blend: a.tool === 'textmarker' ? 'multiply' : 'normal',
      });
    } else if (a.type === 'signature') {
      const skala = a.w / SIGNATUR_REFERENZ_BREITE_PT;
      for (const stroke of a.strokes) {
        const points = stroke.map(([nx, ny, p]) => [a.x + nx * a.w, a.y + ny * a.h, p]);
        pfade.push({
          d: _umrissZuPfad(strichUmriss({
            points, breitePt: (a.strichBreitePt ?? 2) * skala,
            tool: 'stift', echterDruck: a.echterDruck ?? true,
          })),
          farbe: a.farbe ?? '#1e3a8a',
          deckkraft: 1,
          blend: 'normal',
        });
      }
    }
  }
  return pfade;
});

const svgTextfelder = computed(() =>
  items.value.filter(a => a.type === 'textbox').map((a) => {
    const m = textboxMasse(a);
    const g = a.schriftGroessePt ?? 12;
    const zh = g * TEXTBOX_ZEILENHOEHE;
    return {
      id: a.id,
      x: a.x, y: a.y, breite: m.breite, hoehe: m.hoehe,
      hintergrund: a.hintergrundFarbe !== 'transparent' ? a.hintergrundFarbe : null,
      zeilen: m.zeilen,
      groesse: g,
      farbe: a.textFarbe ?? '#111827',
      textX: a.x + TEXTBOX_POLSTER_PT,
      // Grundlinie je Zeile wie im Painter: Oberkante + 0,78 em
      textYs: m.zeilen.map((_, i) =>
        a.y + TEXTBOX_POLSTER_PT + i * zh + (zh - g) / 2 + g * 0.78),
    };
  }));

const svgStempel = computed(() =>
  items.value.filter(a => a.type === 'stempel').map((a) => {
    const m = stempelMasse(a, messeTextBreitePt);
    const g = a.groessePt ?? 18;
    const textY = m.datumsZeile ? -m.datumsZeile / 2 : 0;
    return {
      id: a.id,
      // SVG rotiert im Uhrzeigersinn — der Painter dreht am Canvas mit
      // -winkel (Lese-Konvention), hier also ebenfalls negieren.
      transform: `translate(${a.x} ${a.y}) rotate(${-(a.winkelGrad ?? 12)})`,
      halbBreite: m.breite / 2, halbHoehe: m.hoehe / 2,
      farbe: a.farbe, text: a.text, groesse: g,
      textY,
      datum: a.mitDatum && a.datum ? a.datum : null,
      datumY: textY + g * 0.95,
    };
  }));

// ── Verschieben / Skalieren ─────────────────────────────────────────────────

let zug = null;   // { art: 'move'|'scale', startX, startY, pointerId, el }
const delta = ref({ dx: 0, dy: 0 });     // Seitenpunkte
const faktor = ref(1);

const svgTransform = computed(() => {
  const teile = [];
  if (delta.value.dx || delta.value.dy) {
    teile.push(`translate(${delta.value.dx} ${delta.value.dy})`);
  }
  if (faktor.value !== 1 && bbox.value) {
    const { x, y } = bbox.value;
    teile.push(`translate(${x} ${y}) scale(${faktor.value}) translate(${-x} ${-y})`);
  }
  return teile.join(' ');
});

const boxStil = computed(() => {
  if (!bbox.value) return { display: 'none' };
  const b = bbox.value;
  const z = props.zoom;
  return {
    left: (b.x + delta.value.dx) * z + 'px',
    top: (b.y + delta.value.dy) * z + 'px',
    width: b.w * faktor.value * z + 'px',
    height: b.h * faktor.value * z + 'px',
  };
});

function starteVerschieben(ev) {
  if (ev.button === 2) return;
  zug = { art: 'move', startX: ev.clientX, startY: ev.clientY, pointerId: ev.pointerId, el: ev.currentTarget };
  ev.currentTarget.setPointerCapture(ev.pointerId);
}

function starteSkalieren(ev) {
  zug = { art: 'scale', startX: ev.clientX, startY: ev.clientY, pointerId: ev.pointerId, el: ev.currentTarget };
  ev.currentTarget.setPointerCapture(ev.pointerId);
}

function bewege(ev) {
  if (!zug || zug.pointerId !== ev.pointerId) return;
  // Bildschirm-Delta → Seitenraum (bei gedrehter Ansicht verdreht sich
  // sonst die Zugrichtung, und der Griff zöge quer).
  const [dxPt, dyPt] = drehDelta(
    (ev.clientX - zug.startX) / props.zoom,
    (ev.clientY - zug.startY) / props.zoom,
    viewStore.drehung,
  );
  if (zug.art === 'move') {
    delta.value = { dx: dxPt, dy: dyPt };
  } else if (bbox.value) {
    const neueBreite = bbox.value.w + dxPt;
    faktor.value = Math.min(5, Math.max(0.2, neueBreite / bbox.value.w));
  }
}

function beende(ev) {
  if (!zug || zug.pointerId !== ev.pointerId) return;
  const { art } = zug;
  zug = null;
  if (art === 'move') {
    const { dx, dy } = delta.value;
    delta.value = { dx: 0, dy: 0 };
    if (Math.hypot(dx, dy) * props.zoom > 2) {
      annotStore.verschiebeAuswahl(dx, dy);
    }
  } else {
    const f = faktor.value;
    faktor.value = 1;
    const a = items.value[0];
    if (a && Math.abs(f - 1) > 0.01) {
      annotStore.aktualisiere([{ id: a.id, patch: { w: a.w * f, h: a.h * f } }]);
    }
  }
}
</script>

<style scoped>
.pdfed-auswahl { position: absolute; inset: 0; pointer-events: none; }
.pdfed-auswahl-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.pdfed-auswahl-box {
  position: absolute;
  border: 1.5px dashed var(--pdf-akzent);
  border-radius: 4px;
  background: var(--pdf-akzent-weich);
  pointer-events: auto;
  touch-action: none;
  cursor: move;
}
.pdfed-auswahl-aktionen {
  position: absolute;
  top: -44px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--pdf-flaeche);
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius-klein);
  box-shadow: var(--pdf-schatten);
}
.pdfed-auswahl-btn {
  min-height: 34px;
  min-width: 34px;
  padding: 0;
}
.pdfed-auswahl-griff {
  position: absolute;
  right: -10px;
  bottom: -10px;
  width: 22px;
  height: 22px;
  border: 2px solid var(--pdf-akzent);
  border-radius: 50%;
  background: var(--pdf-flaeche);
  cursor: nwse-resize;
  touch-action: none;
}
</style>
