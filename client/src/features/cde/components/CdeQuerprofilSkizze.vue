<template>
  <figure class="qs" :aria-label="beschreibung">
    <svg :viewBox="viewBox" class="qs-svg" preserveAspectRatio="xMidYMid meet" role="img">
      <title>{{ beschreibung }}</title>
      <line class="qs-gelaende" :x1="-rahmen" y1="0" :x2="rahmen" y2="0" />
      <polygon class="qs-flaeche" :points="punkte" />
      <polyline class="qs-profil" :points="punkte" />
    </svg>
    <figcaption class="qs-text">
      <strong>{{ profil.titel }}</strong>
      <span>Sohle {{ zahl(b) }} m</span>
      <span>oben {{ zahl(oben) }} m</span>
      <span v-if="t !== null">Tiefe {{ zahl(t) }} m</span>
      <span>{{ n > 0 ? `1 : ${zahl(n, 1)}` : 'senkrecht' }}</span>
    </figcaption>
  </figure>
</template>

<script setup>
/**
 * Das Querprofil als Skizze im Formular (Teil XX, Stufe D).
 *
 * Wie in SaintV-2D (`ChannelSectionModal`) — dort Form, Sohlbreite, Tiefe,
 * 1 : n als Bild neben dem Formular. Hier NACHGEBAUT, nicht importiert (kein
 * Feature importiert aus einem anderen), und aus der Vorschau gespeist: die
 * Zahlen sind die, mit denen die Operation rechnet — die Tiefe am Gelände,
 * die Sohlbreite nach Norm, wo das Formular leer ist. Masstäblich (1 : 1),
 * Gelände als Linie oben.
 */
import { computed } from 'vue';

const props = defineProps({
  /** {titel, sohlbreite, neigung, tiefe} */
  profil: { type: Object, required: true },
});

const b = computed(() => Math.max(0, Number(props.profil.sohlbreite) || 0));
const n = computed(() => Math.max(0, Number(props.profil.neigung) || 0));
const t = computed(() => (Number.isFinite(Number(props.profil.tiefe)) && Number(props.profil.tiefe) > 0 ? Number(props.profil.tiefe) : null));
/** Ohne Tiefe (noch kein Gelände) eine nominelle — das Bild zeigt die Form, die Zahl fehlt. */
const tBild = computed(() => t.value ?? Math.max(1, b.value / 2));
const oben = computed(() => b.value + 2 * tBild.value * n.value);
const rahmen = computed(() => Math.max(oben.value / 2 + 0.6, 1));
const punkte = computed(() => {
  const b2 = b.value / 2, o2 = oben.value / 2, h = tBild.value;
  return `${-o2},0 ${-b2},${h} ${b2},${h} ${o2},0`;
});
const viewBox = computed(() => {
  const w = 2 * rahmen.value, h = tBild.value;
  const rand = Math.max(0.2, 0.08 * Math.max(w, h));
  return `${-rahmen.value} ${-rand} ${w} ${h + 2 * rand}`;
});
const zahl = (v, st = 2) => Number(v).toFixed(st).replace('.', ',');
const beschreibung = computed(() => `${props.profil.titel ?? 'Profil'}: Sohle ${zahl(b.value)} m, oben ${zahl(oben.value)} m`
  + `${t.value !== null ? `, Tiefe ${zahl(t.value)} m` : ''}, ${n.value > 0 ? `Böschung 1 : ${zahl(n.value, 1)}` : 'senkrecht'}`);
</script>

<style scoped>
.qs { display: flex; align-items: center; gap: 0.6rem; margin: 0; }
.qs-svg { width: 132px; height: 56px; flex: none; }
.qs-gelaende { stroke: var(--cde-terrain); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.qs-flaeche { fill: var(--cde-accent-soft); stroke: none; }
.qs-profil { fill: none; stroke: var(--cde-accent); stroke-width: 1.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.qs-text { display: flex; flex-wrap: wrap; gap: 0.1rem 0.6rem; font-size: var(--cde-font-xs); color: var(--cde-text-dim); }
.qs-text strong { color: var(--cde-text); width: 100%; }
</style>
