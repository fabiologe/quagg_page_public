<template>
  <div class="qn">
    <label class="qn-station">
      <span>Station</span>
      <input v-model.number="station" type="range" min="0" :max="laenge" :step="schrittweite" :aria-label="`Station 0 bis ${zahl(laenge)} m`" />
      <input v-model.number="station" class="qn-zahl" type="number" min="0" :max="laenge" :step="schrittweite" aria-label="Station in m" />
      <small>von {{ zahl(laenge) }} m</small>
    </label>

    <p v-if="!schnitt" class="qn-leer">{{ urFehlt ? 'Das Urgelände ist nicht geladen — ohne es gibt es keinen Schnitt.' : 'Urgelände wird gelesen …' }}</p>
    <figure v-else class="qn-bild">
      <svg :viewBox="viewBox" class="qn-svg" preserveAspectRatio="xMidYMid meet" role="img" :aria-label="beschreibung">
        <title>{{ beschreibung }}</title>
        <polyline class="qn-ur" :points="pfad(schnitt.ur)" />
        <polyline v-if="schnitt.ist.length" class="qn-ist" :points="pfad(schnitt.ist)" />
        <polyline class="qn-soll" :points="pfad(schnitt.soll)" />
        <line class="qn-achse" :x1="x(0)" :y1="y(schnitt.sohle)" :x2="x(0)" :y2="y(obenY)" />
      </svg>
      <figcaption class="qn-legende">
        <span class="qn-l qn-l--ur">Urgelände</span>
        <span v-if="schnitt.ist.length" class="qn-l qn-l--ist">Gelände jetzt</span>
        <span class="qn-l qn-l--soll">Soll</span>
        <span v-if="ueberhoehung > 1" class="qn-ueber">Überhöhung {{ ueberhoehung }}×</span>
      </figcaption>
    </figure>
    <dl v-if="schnitt" class="qn-zahlen">
      <dt>Sohle</dt><dd>{{ zahl(schnitt.sohle) }} m NN</dd>
      <dt>Tiefe</dt><dd>{{ schnitt.tiefe === null ? '—' : `${zahl(schnitt.tiefe)} m` }}</dd>
      <dt>Sohlbreite</dt><dd>{{ zahl(schnitt.sohlbreite) }} m</dd>
      <dt>oben</dt><dd>{{ zahl(schnitt.obenBreite) }} m{{ schnitt.offen ? ' (ohne Anschnitt)' : '' }}</dd>
      <dt>Böschung</dt><dd>{{ schnitt.neigung > 0 ? `1 : ${zahl(schnitt.neigung, 2)}` : 'senkrecht' }}</dd>
    </dl>
  </div>
</template>

<script setup>
/**
 * DER GERINNE-SCHNITT (Teil XX, Stufe D — 2026-09-19).
 *
 * An einer Station quer zur Achse: das Urgelände (die Lieferung), das Gelände
 * jetzt (nach allen Vorgängen) und das Soll-Trapez — Sohle, Sohlbreite,
 * Böschung bis ans Urgelände. Wie der Querschnitt in SaintV-2D, hier
 * NACHGEBAUT (kein Import aus flood-2D) und mit dem Gelände dahinter. Die
 * Station läuft im Grundriss; im Raum steht die Querlinie an ihr. Kein
 * Wasserspiegel — die CDE rechnet keine Hydraulik.
 *
 * Masstab 1 : 1; ist der Schnitt sehr flach, wird er überhöht — und das steht
 * in der Legende.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useViewerApi } from '../composables/viewerApi.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { schnittachseVon, schnittSicht } from '../services/QuerschnittSicht.js';

const props = defineProps({
  /** Das gewählte Bauteil (bearbeitung.bauteil) — ein Teil des Vorgangs. */
  subjekt: { type: Object, default: null },
});

const api = useViewerApi();
const ifc = useIfcStore();

const plan = computed(() => props.subjekt?.stand?.bauplan ?? null);
const hv = computed(() => props.subjekt?.hoehenversatz ?? 0);
// Nach jedem Neuaufbau neu: der Lauf (Kanalgraben) und das Gelände jetzt.
const achse = computed(() => {
  void ifc.geometrieStand;
  return schnittachseVon(plan.value, { lauf: api.laufVon?.(plan.value?.ableitung) ?? null, hoehenversatz: hv.value });
});

const station = ref(0);
const laenge = computed(() => {
  const a = achse.value?.achse ?? [];
  let l = 0;
  for (let i = 1; i < a.length; i++) l += Math.hypot(a[i].x - a[i - 1].x, a[i].z - a[i - 1].z);
  return Math.round(l * 100) / 100;
});
const schrittweite = computed(() => (laenge.value > 200 ? 1 : 0.5));
watch(laenge, (l) => { if (station.value > l || station.value === 0) station.value = Math.round(l / 2 * 2) / 2; }, { immediate: true });

// Das Urgelände — einmal je Gelände gelesen.
const ur = ref(null);
const urFehlt = ref(false);
const urGid = computed(() => plan.value?.parameter?.quellen?.gelaende ?? null);
watch(urGid, async (gid) => {
  ur.value = null; urFehlt.value = false;
  if (!gid) { urFehlt.value = true; return; }
  try {
    await api.bereiteGelaendeVor?.();
    const s = await api.urSampler?.(gid);
    if (urGid.value !== gid) return;
    ur.value = s ?? null;
    urFehlt.value = !s;
  } catch (fehler) {
    console.error('cde: querschnitt urgelände', fehler);
    urFehlt.value = true;
  }
}, { immediate: true });

const schnitt = computed(() => {
  void ifc.geometrieStand;
  if (!achse.value || !ur.value) return null;
  return schnittSicht(achse.value, station.value, {
    urAn: (x, z) => ur.value.sample(x, z),
    istAn: (x, z) => api.hoeheAn?.(x, z) ?? null,
    hoehenversatz: hv.value,
  });
});

// Die Querlinie im Raum folgt der Station.
watch(schnitt, (s) => api.zeigeQuerlinie?.(s?.linie ?? null));
onBeforeUnmount(() => api.zeigeQuerlinie?.(null));

// ── Zeichnen (SVG: x = Abstand quer, y nach unten) ─────────────────────────
const obenY = computed(() => {
  const s = schnitt.value;
  if (!s) return 0;
  return Math.max(...[...s.ur, ...s.ist, ...s.soll].map(p => p.y));
});
const untenY = computed(() => (schnitt.value ? Math.min(schnitt.value.sohle, ...schnitt.value.ur.map(p => p.y)) : 0));
/** Überhöhung: ein flacher Schnitt (breit, wenig tief) wird lesbar, höchstens fünffach. */
const ueberhoehung = computed(() => {
  const s = schnitt.value;
  if (!s) return 1;
  const h = Math.max(0.1, obenY.value - untenY.value), w = 2 * s.halb;
  return Math.max(1, Math.min(5, Math.round((0.35 * w) / h)));
});
const x = (d) => d;
const y = (hoehe) => -(hoehe - untenY.value) * ueberhoehung.value;
const pfad = (l) => l.map(p => `${x(p.d)},${y(p.y)}`).join(' ');
const viewBox = computed(() => {
  const s = schnitt.value;
  if (!s) return '0 0 1 1';
  const h = (obenY.value - untenY.value) * ueberhoehung.value;
  const rand = 0.06 * 2 * s.halb;
  return `${-s.halb - rand} ${-h - rand} ${2 * s.halb + 2 * rand} ${h + 2 * rand}`;
});
const zahl = (v, st = 2) => (Number.isFinite(v) ? Number(v).toFixed(st).replace('.', ',') : '—');
const beschreibung = computed(() => (schnitt.value
  ? `Querschnitt bei Station ${zahl(schnitt.value.station)} m: Sohle ${zahl(schnitt.value.sohle)} m NN, Sohlbreite ${zahl(schnitt.value.sohlbreite)} m, oben ${zahl(schnitt.value.obenBreite)} m`
  : 'Querschnitt'));
</script>

<style scoped>
.qn { display: flex; flex-direction: column; gap: 0.4rem; }
.qn-station { display: flex; align-items: center; gap: 0.4rem; font-size: var(--cde-font-xs); color: var(--cde-text-dim); }
.qn-station input[type='range'] { flex: 1; min-width: 0; accent-color: var(--cde-accent); }
.qn-zahl {
  width: 4.6rem; padding: 0.2rem 0.3rem; font: inherit; color: var(--cde-text);
  background: var(--cde-surface); border: 1px solid var(--cde-line-strong); border-radius: var(--cde-radius-sm);
}
.qn-leer { margin: 0; font-size: var(--cde-font-xs); color: var(--cde-text-dim); }
.qn-bild { margin: 0; display: flex; flex-direction: column; gap: 0.2rem; }
.qn-svg { width: 100%; height: 150px; background: var(--cde-sunken); border-radius: var(--cde-radius-sm); }
.qn-ur { fill: none; stroke: var(--cde-terrain-soft); stroke-width: 1.5; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; }
.qn-ist { fill: none; stroke: var(--cde-terrain); stroke-width: 2; vector-effect: non-scaling-stroke; }
.qn-soll { fill: none; stroke: var(--cde-accent); stroke-width: 2; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.qn-achse { stroke: var(--cde-text-faint); stroke-width: 1; stroke-dasharray: 2 3; vector-effect: non-scaling-stroke; }
.qn-legende { display: flex; flex-wrap: wrap; gap: 0.2rem 0.7rem; font-size: var(--cde-font-xs); color: var(--cde-text-dim); }
.qn-l::before { content: ''; display: inline-block; width: 14px; height: 0; margin-right: 0.3rem; vertical-align: middle; border-top: 2px solid currentColor; }
.qn-l--ur::before { border-top: 2px dashed var(--cde-terrain-soft); }
.qn-l--ist::before { border-top-color: var(--cde-terrain); }
.qn-l--soll::before { border-top-color: var(--cde-accent); }
.qn-zahlen { display: grid; grid-template-columns: auto 1fr; gap: 0.1rem 0.6rem; margin: 0; font-size: var(--cde-font-xs); }
.qn-zahlen dt { color: var(--cde-text-dim); }
.qn-zahlen dd { margin: 0; color: var(--cde-text); font-variant-numeric: tabular-nums; }
</style>
