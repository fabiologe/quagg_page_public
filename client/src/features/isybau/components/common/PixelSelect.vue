<!--
  Auswahlfeld des Moduls — mit eigener Liste statt der des Betriebssystems.

  Warum ueberhaupt: die Liste eines nativen <select> zeichnet der Browser
  ausserhalb der Seite. Kein CSS des Dokuments erreicht sie — weder Farbe noch
  Rahmen noch der eigene Zeiger. Chromium kann das seit Version 135 mit
  `appearance: base-select` abstellen, Firefox und Safari koennen es nicht (in
  Firefox lief es bis 2026 nur hinter einem Flag in Nightly). Genau dort
  arbeitet der Nutzer — fuer ihn war deshalb KEINE Liste im Modul eingekleidet.

  Also die Liste selbst zeichnen: ein Feld (role="combobox") und eine Liste
  (role="listbox"), beide aus gewoehnlichem DOM. Das sieht in jedem Browser
  gleich aus und traegt Pixel-Rahmen, Papierflaeche und den eigenen Zeiger.

  Der Fokus bleibt waehrend der ganzen Bedienung auf dem FELD; welcher Eintrag
  gerade dran ist, sagt aria-activedescendant. Das ist das Muster, das
  Screenreader von einer Combobox erwarten — und es erspart das Zurueckgeben
  des Fokus beim Schliessen.

  Die Liste haengt per <Teleport> an <body> und liegt fix positioniert ueber
  allem: in der Datenmaske sitzt sie sonst im scrollenden Tabellenkasten und
  wuerde an dessen Kante abgeschnitten.
-->
<template>
  <span
    ref="feld"
    class="isy-select"
    :class="{ 'isy-select--offen': offen, 'isy-select--leer': gewaehlteOption === null }"
    role="combobox"
    :tabindex="disabled ? -1 : 0"
    :aria-expanded="offen"
    :aria-controls="offen ? listenId : undefined"
    :aria-activedescendant="offen && aktiverIndex >= 0 ? eintragId(aktiverIndex) : undefined"
    :aria-disabled="disabled || undefined"
    aria-haspopup="listbox"
    @click.stop="umschalten"
    @keydown="aufTaste"
    @blur="schliessen"
  >
    <span class="isy-select__text">{{ anzeige }}</span>

    <!-- Die Liste steht IM Feld-Element (nur ein Wurzelknoten!), landet per
         Teleport aber an <body>. Mit zwei Wurzelknoten koennte Vue `class`
         und `title` der Aufrufstelle nicht mehr automatisch durchreichen —
         die Groessenklassen (.small-select, .form-select ...) kaemen dann
         nirgends an. Zurueck bleibt hier nur ein Kommentarknoten. -->
    <Teleport to="body">
      <div
        v-if="offen"
        :id="listenId"
        ref="liste"
        class="isy-select-liste"
        :style="listenStil"
        role="listbox"
        @mousedown.prevent
      >
      <div
        v-for="(o, i) in options"
        :id="eintragId(i)"
        :key="`${i}-${String(o.value)}`"
        class="isy-select-liste__eintrag"
        :class="{
          'ist-aktiv': i === aktiverIndex,
          'ist-gewaehlt': istGewaehlt(o),
          'ist-gesperrt': o.disabled,
        }"
        role="option"
        :aria-selected="istGewaehlt(o)"
        :aria-disabled="o.disabled || undefined"
        @mouseenter="aktiverIndex = i"
        @click="waehlen(o)"
      >{{ o.label }}</div>
      </div>
    </Teleport>
  </span>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';

const props = defineProps({
  modelValue: { type: null, default: null },
  /** [{ value, label, disabled? }] — Reihenfolge wie angezeigt. */
  options: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  /** Text, solange nichts Passendes gewaehlt ist. */
  placeholder: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue', 'change']);

let zaehler = 0;
const eigeneNummer = `isy-select-${Date.now().toString(36)}-${(zaehler += 1)}-${Math.random().toString(36).slice(2, 7)}`;
const listenId = `${eigeneNummer}-liste`;
const eintragId = (i) => `${eigeneNummer}-${i}`;

const feld = ref(null);
const liste = ref(null);
const offen = ref(false);
const aktiverIndex = ref(-1);
const listenStil = ref({});

const gewaehlteOption = computed(() =>
  props.options.find(o => o.value === props.modelValue) ?? null);
const anzeige = computed(() => gewaehlteOption.value?.label ?? props.placeholder);
const istGewaehlt = (o) => o.value === props.modelValue;

/**
 * Liste unter dem Feld ausrichten. Fix positioniert (nicht absolut), damit sie
 * weder vom scrollenden Tabellenkasten abgeschnitten noch von einem
 * verschobenen Modal mitgezogen wird. Passt unten nichts mehr hin, klappt sie
 * nach oben — sonst haengt die Haelfte unter dem Fensterrand.
 */
const MAX_HOEHE = 320;
function positionieren() {
  const el = feld.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const platzUnten = window.innerHeight - r.bottom - 8;
  const platzOben = r.top - 8;
  const nachOben = platzUnten < Math.min(MAX_HOEHE, 160) && platzOben > platzUnten;
  const hoehe = Math.max(80, Math.min(MAX_HOEHE, nachOben ? platzOben : platzUnten));
  listenStil.value = {
    position: 'fixed',
    left: `${Math.max(4, Math.min(r.left, window.innerWidth - r.width - 4))}px`,
    top: nachOben ? 'auto' : `${r.bottom}px`,
    bottom: nachOben ? `${window.innerHeight - r.top}px` : 'auto',
    minWidth: `${r.width}px`,
    maxWidth: `${Math.max(r.width, Math.min(520, window.innerWidth - 16))}px`,
    maxHeight: `${hoehe}px`,
  };
}

function oeffnen() {
  if (props.disabled || offen.value) return;
  const gewaehlt = props.options.findIndex(o => o.value === props.modelValue);
  aktiverIndex.value = gewaehlt >= 0 ? gewaehlt : ersterWaehlbarer(0, 1);
  offen.value = true;
  positionieren();
  // Erst anmelden, dann scrollen: was danach kommt, darf das Anmelden nicht
  // mehr verhindern (ein Fehler im Scrollen liess die Liste sonst offen, ohne
  // dass Escape oder ein Klick daneben sie noch schliessen konnten).
  //
  // Capture-Phase beim Escape, weil IsybauModals.vue dort ebenfalls lauscht
  // und sonst gleich das ganze Fenster schloesse, waehrend nur die Liste offen
  // sein sollte.
  window.addEventListener('keydown', aufEscapeVorher, true);
  window.addEventListener('scroll', positionieren, true);
  window.addEventListener('resize', positionieren);
  document.addEventListener('pointerdown', aufKlickDraussen, true);
  nextTick(inSichtScrollen);
}

function schliessen() {
  if (!offen.value) return;
  offen.value = false;
  aktiverIndex.value = -1;
  window.removeEventListener('keydown', aufEscapeVorher, true);
  window.removeEventListener('scroll', positionieren, true);
  window.removeEventListener('resize', positionieren);
  document.removeEventListener('pointerdown', aufKlickDraussen, true);
}
onBeforeUnmount(schliessen);

// Ein Klick ausserhalb schliesst. pointerdown statt click, damit die Liste
// auch dann weicht, wenn der Klick auf einem Element landet, das sich beim
// Loslassen schon wieder abgemeldet hat.
function aufKlickDraussen(e) {
  if (feld.value?.contains(e.target) || liste.value?.contains(e.target)) return;
  schliessen();
}

function aufEscapeVorher(e) {
  if (e.key !== 'Escape' || !offen.value) return;
  schliessen();
  e.stopImmediatePropagation();
  e.preventDefault();
  feld.value?.focus({ preventScroll: true });
}

function umschalten() {
  if (props.disabled) return;
  if (offen.value) schliessen();
  else { feld.value?.focus({ preventScroll: true }); oeffnen(); }
}

function waehlen(o) {
  if (o.disabled) return;
  schliessen();
  feld.value?.focus({ preventScroll: true });
  if (o.value === props.modelValue) return;
  // Erst der Modellwert, dann `change` — in dieser Reihenfolge sieht ein
  // @change-Handler des Aufrufers den NEUEN Wert, genau wie beim nativen
  // <select>.
  emit('update:modelValue', o.value);
  emit('change', o.value);
}

/** Naechster waehlbarer Eintrag ab `von` in Richtung `schritt` (ohne Umlauf). */
function ersterWaehlbarer(von, schritt) {
  for (let i = von; i >= 0 && i < props.options.length; i += schritt) {
    if (!props.options[i]?.disabled) return i;
  }
  return aktiverIndex.value;
}

function bewegen(schritt) {
  if (!offen.value) { oeffnen(); return; }
  const start = aktiverIndex.value < 0 ? (schritt > 0 ? -1 : props.options.length) : aktiverIndex.value;
  const ziel = ersterWaehlbarer(start + schritt, schritt);
  if (ziel !== aktiverIndex.value) {
    aktiverIndex.value = ziel;
    nextTick(inSichtScrollen);
  }
}

function inSichtScrollen() {
  const eintrag = liste.value?.querySelector('.ist-aktiv');
  // Der Typcheck ist kein Zierrat: in jsdom (Tests) gibt es die Methode nicht.
  if (typeof eintrag?.scrollIntoView === 'function') eintrag.scrollIntoView({ block: 'nearest' });
}

// Tippen springt zum Eintrag — dieselbe Erwartung wie beim nativen Feld.
let tippPuffer = '';
let tippUhr = null;
function tippSprung(zeichen) {
  clearTimeout(tippUhr);
  tippPuffer += zeichen.toLowerCase();
  tippUhr = setTimeout(() => { tippPuffer = ''; }, 700);
  const treffer = props.options.findIndex(o =>
    !o.disabled && String(o.label).toLowerCase().startsWith(tippPuffer));
  if (treffer < 0) return;
  if (!offen.value) oeffnen();
  aktiverIndex.value = treffer;
  nextTick(inSichtScrollen);
}

function aufTaste(e) {
  if (props.disabled) return;
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); bewegen(1); break;
    case 'ArrowUp': e.preventDefault(); bewegen(-1); break;
    case 'Home': if (offen.value) { e.preventDefault(); aktiverIndex.value = ersterWaehlbarer(0, 1); nextTick(inSichtScrollen); } break;
    case 'End': if (offen.value) { e.preventDefault(); aktiverIndex.value = ersterWaehlbarer(props.options.length - 1, -1); nextTick(inSichtScrollen); } break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      if (offen.value && aktiverIndex.value >= 0) waehlen(props.options[aktiverIndex.value]);
      else oeffnen();
      break;
    case 'Escape': if (offen.value) { e.preventDefault(); schliessen(); } break;
    case 'Tab': schliessen(); break;
    default:
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) tippSprung(e.key);
  }
}

// Verschwindet der gewaehlte Eintrag (die Liste haengt oft am Zustand des
// Formulars), soll die offene Liste nicht auf einen Index zeigen, den es nicht
// mehr gibt.
watch(() => props.options.length, () => {
  if (offen.value && aktiverIndex.value >= props.options.length) {
    aktiverIndex.value = ersterWaehlbarer(props.options.length - 1, -1);
  }
});
watch(() => props.disabled, (d) => { if (d) schliessen(); });
</script>

<style scoped>
/* Die FELD-Form (Bevel, Pixel-Ecken, Fokusring, Pfeil) kommt aus theme.css —
   dort steht `.isy-select` in denselben Regeln wie `select`, damit beide
   garantiert gleich aussehen. Hier nur, was das Feld zum Feld macht. */
.isy-select {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  min-height: 1.6em;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
}

.isy-select__text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.isy-select--leer .isy-select__text {
  opacity: 0.7;
}
</style>
