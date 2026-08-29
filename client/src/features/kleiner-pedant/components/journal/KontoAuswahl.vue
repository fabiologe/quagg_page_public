<template>
  <div class="ped-konto">
    <input
      class="ped-konto-feld"
      type="text"
      :value="anzeige"
      :placeholder="platzhalter"
      @input="suchen($event.target.value)"
      @focus="offen = true"
      @blur="schliessenVerzoegert"
    />
    <ul v-if="offen && treffer.length" class="ped-konto-liste">
      <li
        v-for="konto in treffer"
        :key="konto.kontonr"
        @mousedown.prevent="waehle(konto)"
      >
        <span class="ped-konto-nr">{{ konto.kontonr }}</span>
        {{ konto.bezeichnung }}
      </li>
    </ul>
  </div>
</template>

<script setup>
// KontoAuswahl — SKR04-Suchfeld: tippen nach Nummer oder Name, klicken waehlt.
// modelValue ist IMMER die Kontonummer (oder ''), nie der Anzeigetext.
import { computed, ref } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  konten: { type: Array, required: true },   // [{kontonr, bezeichnung}]
  platzhalter: { type: String, default: 'Konto suchen…' },
});
const emit = defineEmits(['update:modelValue']);

const offen = ref(false);
const suchtext = ref(null);   // null = keine aktive Suche, Anzeige folgt modelValue

const gewaehlt = computed(() =>
  props.konten.find((konto) => konto.kontonr === props.modelValue));

const anzeige = computed(() => {
  if (suchtext.value !== null) return suchtext.value;
  return gewaehlt.value
    ? `${gewaehlt.value.kontonr} ${gewaehlt.value.bezeichnung}`
    : '';
});

const treffer = computed(() => {
  const frage = (suchtext.value || '').trim().toLowerCase();
  const quelle = frage
    ? props.konten.filter((konto) =>
        konto.kontonr.startsWith(frage)
        || konto.bezeichnung.toLowerCase().includes(frage))
    : props.konten;
  return quelle.slice(0, 8);
});

function suchen(text) {
  suchtext.value = text;
  offen.value = true;
  if (!text.trim()) emit('update:modelValue', '');
}

function waehle(konto) {
  emit('update:modelValue', konto.kontonr);
  suchtext.value = null;
  offen.value = false;
}

function schliessenVerzoegert() {
  // mousedown auf der Liste feuert vor blur — kurz warten, dann aufraeumen.
  setTimeout(() => {
    offen.value = false;
    suchtext.value = null;
  }, 150);
}
</script>

<style scoped>
.ped-konto {
  position: relative;
}
.ped-konto-feld {
  width: 100%;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--ped-rand-stark);
  border-radius: 6px;
  background: var(--ped-flaeche);
  color: var(--ped-text);
  font-size: 0.82rem;
}
.ped-konto-feld:focus {
  outline: 2px solid var(--ped-akzent-weich);
  border-color: var(--ped-akzent);
}
.ped-konto-liste {
  position: absolute;
  z-index: 20;
  inset-inline: 0;
  top: calc(100% + 2px);
  margin: 0;
  padding: 0.2rem;
  list-style: none;
  background: var(--ped-flaeche);
  border: 1px solid var(--ped-rand-stark);
  border-radius: 6px;
  box-shadow: var(--ped-schatten);
  max-height: 14rem;
  overflow-y: auto;
}
.ped-konto-liste li {
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  color: var(--ped-text);
  cursor: pointer;
}
.ped-konto-liste li:hover {
  background: var(--ped-akzent-weich);
}
.ped-konto-nr {
  font-family: var(--ped-mono);
  margin-right: 0.4rem;
  color: var(--ped-akzent);
}
</style>
