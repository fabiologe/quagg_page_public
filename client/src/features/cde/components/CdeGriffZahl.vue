<template>
  <!-- Die Zahl am Griff (Teil XXXI, T8): neben dem angetippten Griff, ein Feld je Grösse. Enter übernimmt, Esc schliesst. -->
  <form ref="formular" class="gz" :style="lage" role="dialog" :aria-label="zahl.titel"
        @submit.prevent="uebernehmen" @keydown.esc.prevent="$emit('schliessen')"
        @pointerdown.stop @pointerup.stop @click.stop @wheel.stop>
    <div class="gz-kopf">{{ zahl.titel }}</div>
    <label v-for="(f, i) in zahl.felder" :key="f.name" class="gz-feld">
      <span class="gz-titel">{{ f.titel }}</span>
      <input :ref="(el) => { if (i === 0) erstes = el; }" v-model="text[f.name]" class="gz-eingabe"
             :class="{ falsch: text[f.name] !== '' && liesZahl(text[f.name]) === null }"
             type="text" inputmode="decimal" autocomplete="off" :aria-label="f.titel" />
      <span class="gz-einheit">{{ f.einheit }}</span>
    </label>
    <div class="gz-knoepfe">
      <button type="button" class="gz-knopf" @click="$emit('schliessen')">Abbrechen</button>
      <button type="submit" class="gz-knopf gz-ja" :disabled="!gueltig">Übernehmen</button>
    </div>
  </form>
</template>

<script setup>
/**
 * CdeGriffZahl — die genaue Zahl am Griff (Teil XXXI, T8; Konzept H8).
 *
 * Bis hierher gab es eine genaue Zahl nur im Formular der Tafel — hochkant eingeklappt (T5), also zwei Tipps und ein
 * Blick weg vom Griff. Jetzt: ein Tipp auf den Griff (ohne Ziehen) öffnet dieses Feld daneben; `useGriffe.zahl` sagt,
 * welche Grössen der Griff setzt und was sie jetzt sind. Die Tastatur auf dem Tablet ist die Zahlentastatur
 * (`inputmode="decimal"`); Komma oder Punkt (`liesZahl`, wie beim Zeichnen, B5).
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { liesZahl, zahlText } from '../services/Zeichenhilfe.js';

const props = defineProps({
  /** `{ titel, x, y, felder: [{ name, titel, einheit, wert, stellen }] }` */
  zahl: { type: Object, required: true },
});
const emit = defineEmits(['uebernehmen', 'schliessen']);

const text = reactive({});
// Rechts vom Griff — passt es dort nicht in die Zeichenfläche, links davon (am rechten Bildrand lief es hinaus).
const formular = ref(null);
const links = ref(false);
function pruefeRand() {
  const f = formular.value, eltern = f?.offsetParent;
  if (!f || !eltern) return;
  links.value = props.zahl.x + 18 + f.offsetWidth > eltern.clientWidth && props.zahl.x - 18 - f.offsetWidth >= 0;
}
const lage = computed(() => (links.value
  ? { left: `${props.zahl.x - 18}px`, top: `${props.zahl.y - 12}px`, transform: 'translateX(-100%)' }
  : { left: `${props.zahl.x + 18}px`, top: `${props.zahl.y - 12}px` }));
let erstes = null;
function belegen() {
  for (const k of Object.keys(text)) delete text[k];
  for (const f of props.zahl.felder) text[f.name] = zahlText(f.wert, f.stellen ?? 2);
}
belegen();
watch(() => props.zahl, () => { belegen(); nextTick(() => { pruefeRand(); erstes?.select?.(); }); });
// Den Fokus NACH dem Klick, den der Browser dem Loslassen folgen lässt — sonst nimmt der ihn wieder weg (Tabletlauf T8:
// das Feld stand da, ohne Fokus). Auf dem iPad öffnet Safari die Tastatur trotzdem erst beim Tipp ins Feld: ein Fokus
// ohne Fingertipp darf dort keine Tastatur zeigen.
onMounted(() => { pruefeRand(); setTimeout(() => { erstes?.focus?.(); erstes?.select?.(); }, 80); });

const gueltig = computed(() => props.zahl.felder.every(f => liesZahl(text[f.name]) !== null));
function uebernehmen() {
  if (!gueltig.value) return;
  emit('uebernehmen', Object.fromEntries(props.zahl.felder.map(f => [f.name, liesZahl(text[f.name])])));
}
</script>

<style scoped>
.gz {
  position: absolute; z-index: 25; min-width: 210px;
  display: flex; flex-direction: column; gap: 0.35rem; padding: 0.5rem 0.6rem;
  background: var(--cde-surface-raised); border: 1px solid var(--cde-accent-line); border-radius: var(--cde-radius-sm);
  color: var(--cde-text); font-size: var(--cde-font-sm); box-shadow: var(--cde-shadow-float);
}
.gz-kopf { font-weight: 600; color: var(--cde-text-bright); }
.gz-feld { display: grid; grid-template-columns: 5.5rem 1fr auto; align-items: center; gap: 0.4rem; }
.gz-titel { color: var(--cde-text-dim); }
.gz-eingabe {
  min-height: 36px; width: 100%; padding: 0 0.4rem; text-align: right;
  background: var(--cde-bg); color: var(--cde-text-bright); border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm);
  font: inherit;
}
.gz-eingabe.falsch { border-color: var(--cde-danger); }
.gz-einheit { color: var(--cde-text-mute); min-width: 2.2rem; }
.gz-knoepfe { display: flex; gap: 0.4rem; justify-content: flex-end; }
.gz-knopf {
  min-height: 36px; padding: 0 0.7rem; border-radius: var(--cde-radius-sm);
  background: var(--cde-fill); color: var(--cde-text); border: 1px solid var(--cde-line); cursor: pointer; font: inherit;
}
.gz-ja { background: var(--cde-accent-fill-hi); color: var(--cde-accent); border-color: var(--cde-accent-line); }
.gz-knopf:disabled { opacity: 0.5; cursor: default; }
/* Auf dem Finger: Ziele ≥ 44 px (Tablet-Rezept, Regel 3). */
@media (pointer: coarse) {
  .gz-eingabe, .gz-knopf { min-height: 44px; }
}
</style>
