<template>
  <div ref="panelEl" class="pdfed-optionen">
    <template v-if="werkzeug === 'stift' || werkzeug === 'textmarker'">
      <div v-if="werkzeug === 'stift'" class="pdfed-optionen-reihe">
        <button
          v-for="art in STIFT_ARTEN"
          :key="art.id"
          class="pdfed-breite pdfed-stiftart"
          :class="{ 'ist-aktiv': toolStore.stift.art === art.id }"
          :title="art.titel"
          @click="setzeStiftArt(art.id)"
        >
          <PdfIcon :name="art.icon" :size="18" />
        </button>
      </div>
      <div class="pdfed-optionen-reihe">
        <button
          v-for="f in farben"
          :key="f"
          class="pdfed-farbe"
          :class="{ 'ist-aktiv': optionen.farbe === f }"
          :style="{ background: f }"
          :title="f"
          @click="setzeFarbe(f)"
        ></button>
      </div>
      <div class="pdfed-optionen-reihe">
        <button
          v-for="b in breiten"
          :key="b"
          class="pdfed-breite"
          :class="{ 'ist-aktiv': optionen.breitePt === b }"
          :title="`${b} pt`"
          @click="setzeBreite(b)"
        >
          <span
            class="pdfed-breite-punkt"
            :style="{
              width: punktGroesse(b) + 'px',
              height: punktGroesse(b) + 'px',
              background: optionen.farbe,
            }"
          ></span>
        </button>
      </div>
    </template>

    <template v-else-if="werkzeug === 'textfeld'">
      <div class="pdfed-optionen-reihe">
        <button
          v-for="g in TEXT_GROESSEN_PT"
          :key="g"
          class="pdfed-breite pdfed-textgroesse"
          :class="{ 'ist-aktiv': toolStore.textfeld.schriftGroessePt === g }"
          :title="`Schriftgröße ${g} pt`"
          @click="setzeTextfeld({ schriftGroessePt: g })"
        >{{ g }}</button>
      </div>
      <div class="pdfed-optionen-reihe">
        <button
          v-for="f in STIFT_FARBEN"
          :key="f"
          class="pdfed-farbe"
          :class="{ 'ist-aktiv': toolStore.textfeld.textFarbe === f }"
          :style="{ background: f }"
          :title="`Textfarbe ${f}`"
          @click="setzeTextfeld({ textFarbe: f })"
        ></button>
      </div>
      <div class="pdfed-optionen-reihe">
        <button
          v-for="h in TEXT_HINTERGRUENDE"
          :key="h.wert"
          class="pdfed-farbe"
          :class="{
            'ist-aktiv': toolStore.textfeld.hintergrundFarbe === h.wert,
            'ist-transparent': h.wert === 'transparent',
          }"
          :style="h.wert === 'transparent' ? {} : { background: h.wert }"
          :title="h.titel"
          @click="setzeTextfeld({ hintergrundFarbe: h.wert })"
        ></button>
      </div>
    </template>

    <template v-else-if="werkzeug === 'stempel'">
      <div class="pdfed-optionen-reihe pdfed-stempel-texte">
        <button
          v-for="t in STEMPEL_TEXTE"
          :key="t"
          class="pdfed-btn pdfed-stempel-text"
          :class="{ 'ist-aktiv': toolStore.stempel.text === t }"
          @click="setzeStempel({ text: t })"
        >{{ t }}</button>
      </div>
      <div class="pdfed-optionen-reihe">
        <input
          class="pdfed-stempel-frei"
          type="text"
          maxlength="40"
          placeholder="Eigener Text"
          :value="toolStore.stempel.text"
          @change="setzeStempel({ text: $event.target.value.trim() || 'VORABZUG' })"
        />
      </div>
      <div class="pdfed-optionen-reihe">
        <button
          v-for="f in STEMPEL_FARBEN"
          :key="f"
          class="pdfed-farbe"
          :class="{ 'ist-aktiv': toolStore.stempel.farbe === f }"
          :style="{ background: f }"
          :title="f"
          @click="setzeStempel({ farbe: f })"
        ></button>
        <label class="pdfed-stempel-datum">
          <input
            type="checkbox"
            :checked="toolStore.stempel.mitDatum"
            @change="setzeStempel({ mitDatum: $event.target.checked })"
          />
          mit Datum
        </label>
      </div>
    </template>

    <template v-else-if="werkzeug === 'radierer'">
      <div class="pdfed-optionen-reihe">
        <button
          class="pdfed-btn pdfed-radierer-modus"
          :class="{ 'ist-aktiv': toolStore.radierer.modus === 'punkt' }"
          title="Radiert nur den berührten Teil eines Strichs (wie ein Radiergummi)"
          @click="setzeRadiererModus('punkt')"
        >
          <PdfIcon name="radierer" :size="16" /> Punkt
        </button>
        <button
          class="pdfed-btn pdfed-radierer-modus"
          :class="{ 'ist-aktiv': toolStore.radierer.modus === 'strich' }"
          title="Löscht den ganzen Strich bei Berührung"
          @click="setzeRadiererModus('strich')"
        >
          <PdfIcon name="loeschen" :size="16" /> Strich
        </button>
      </div>
      <div class="pdfed-optionen-reihe">
        <button
          v-for="r in RADIERER_RADIEN"
          :key="r"
          class="pdfed-breite"
          :class="{ 'ist-aktiv': toolStore.radierer.radiusPt === r }"
          :title="`Radius ${r} pt`"
          @click="setzeRadiererRadius(r)"
        >
          <span
            class="pdfed-breite-punkt ist-radierer"
            :style="{ width: 6 + r + 'px', height: 6 + r + 'px' }"
          ></span>
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
/**
 * PdfToolOptions — Kontextoptionen des aktiven Werkzeugs (Farbe, Breite,
 * Radierer-Radius). Öffnet als Popover unter der Toolbar; ein Tipp außerhalb
 * schließt es. Änderungen wandern sofort in den Store und werden persistiert.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import PdfIcon from './PdfIcon.vue';
import {
  useToolStore, STIFT_FARBEN, MARKER_FARBEN, STIFT_BREITEN_PT, MARKER_BREITEN_PT,
  STIFT_ARTEN, TEXT_GROESSEN_PT, TEXT_HINTERGRUENDE, STEMPEL_TEXTE, STEMPEL_FARBEN,
} from '../stores/useToolStore';

const RADIERER_RADIEN = [5, 8, 14];

const emit = defineEmits(['schliessen']);
const toolStore = useToolStore();
const panelEl = ref(null);

const werkzeug = computed(() => toolStore.aktivesWerkzeug);
const istMarker = computed(() => werkzeug.value === 'textmarker');
const farben = computed(() => (istMarker.value ? MARKER_FARBEN : STIFT_FARBEN));
const breiten = computed(() => (istMarker.value ? MARKER_BREITEN_PT : STIFT_BREITEN_PT));
const optionen = computed(() => (istMarker.value ? toolStore.textmarker : toolStore.stift));

function setzeFarbe(f) {
  optionen.value.farbe = f;
  toolStore.speichereWerkzeugOptionen();
}
function setzeStiftArt(art) {
  toolStore.stift.art = art;
  toolStore.speichereWerkzeugOptionen();
}
function setzeTextfeld(patch) {
  Object.assign(toolStore.textfeld, patch);
  toolStore.speichereWerkzeugOptionen();
}
function setzeStempel(patch) {
  Object.assign(toolStore.stempel, patch);
  toolStore.speichereWerkzeugOptionen();
}
function setzeRadiererModus(modus) {
  toolStore.radierer.modus = modus;
  toolStore.speichereWerkzeugOptionen();
}
function setzeRadiererRadius(r) {
  toolStore.radierer.radiusPt = r;
  toolStore.speichereWerkzeugOptionen();
}
function setzeBreite(b) {
  optionen.value.breitePt = b;
  toolStore.speichereWerkzeugOptionen();
}
function punktGroesse(b) {
  return Math.min(22, 5 + b * (istMarker.value ? 0.8 : 3));
}

function aufAussenKlick(ev) {
  if (!panelEl.value?.contains(ev.target)) emit('schliessen');
}
onMounted(() => {
  // capture-Phase, damit der Öffnen-Klick selbst das Panel nicht gleich schließt
  setTimeout(() => window.addEventListener('pointerdown', aufAussenKlick, true), 0);
});
onBeforeUnmount(() => window.removeEventListener('pointerdown', aufAussenKlick, true));
</script>

<style scoped>
.pdfed-optionen {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: var(--pdf-flaeche);
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius);
  box-shadow: var(--pdf-schatten);
  z-index: 30;
}
.pdfed-optionen-reihe {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pdfed-farbe {
  width: 34px;
  height: 34px;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  padding: 0;
}
.pdfed-farbe.ist-aktiv {
  border-color: var(--pdf-akzent);
  box-shadow: 0 0 0 2px var(--pdf-akzent-weich);
}
.pdfed-breite {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius-klein);
  background: var(--pdf-flaeche-2);
  cursor: pointer;
  padding: 0;
}
.pdfed-breite.ist-aktiv {
  border-color: var(--pdf-akzent);
  background: var(--pdf-akzent-weich);
}
.pdfed-breite-punkt {
  display: block;
  border-radius: 50%;
}
.pdfed-breite-punkt.ist-radierer {
  background: transparent;
  border: 2px solid var(--pdf-text-dim);
}
.pdfed-stiftart { color: var(--pdf-text); }
.pdfed-radierer-modus {
  min-height: 36px;
  font-size: 13px;
}
.pdfed-textgroesse {
  font-weight: 700;
  font-size: 13px;
  color: var(--pdf-text);
  width: 36px;
}
.pdfed-stempel-texte { flex-wrap: wrap; max-width: 280px; }
.pdfed-stempel-text {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--pdf-rand);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.pdfed-stempel-text.ist-aktiv { border-color: var(--pdf-akzent); }
.pdfed-stempel-frei {
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius-klein);
  background: var(--pdf-flaeche-2);
  color: var(--pdf-text);
  font: inherit;
}
.pdfed-stempel-datum {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 6px;
  font-size: 13px;
  color: var(--pdf-text);
  cursor: pointer;
  user-select: none;
}
.pdfed-farbe.ist-transparent {
  background:
    linear-gradient(to top right,
      transparent calc(50% - 1.5px), var(--pdf-fehler) calc(50% - 1.5px),
      var(--pdf-fehler) calc(50% + 1.5px), transparent calc(50% + 1.5px)),
    var(--pdf-flaeche);
  border-color: var(--pdf-rand-stark);
  border-width: 1px;
  border-style: solid;
}
</style>
