<template>
  <!--
    DIE KOMMANDO-KONSOLE (Teil XXIV, K9) — Wegwerf-Oberfläche, nur im
    Entwicklungsmodus. Ein Kommando (oder eine Liste) als JSON absetzen, das
    Ergebnis sehen, die Markierungen der eigenen Bauteile lesen. Sie ruft
    NICHTS, was es nicht auch ohne sie gibt: `fuehreAus`, `zurueck`,
    `pruefeEigenes` — die Oberfläche darf hässlich sein, das Modell nicht.
  -->
  <div class="kk">
    <div class="kk-kopf">
      <strong>Kommando</strong>
      <button type="button" @click="beispiel">Beispiel C2</button>
      <button type="button" :disabled="laeuft" @click="absetzen">Ausführen</button>
      <button type="button" :disabled="laeuft" @click="zurueck">Rückgängig</button>
      <button type="button" @click="$emit('zu')">×</button>
    </div>
    <textarea v-model="text" class="kk-text" spellcheck="false" rows="8" />
    <ol v-if="ergebnisse.length" class="kk-liste">
      <li v-for="(e, i) in ergebnisse" :key="i" :class="e.ausgefuehrt ? 'kk-ok' : 'kk-nein'">
        {{ e.id }} · {{ e.werkzeug }} — {{ e.ausgefuehrt ? `ausgeführt (${e.eintraege} Eintr.)` : e.grund }}
      </li>
    </ol>
    <div class="kk-befunde">
      <strong>Markierungen</strong> ({{ markierungen.length }})
      <ul>
        <li v-for="z in markierungen" :key="z.globalId">
          {{ z.name || z.globalId }}: <span v-for="b in z.befunde" :key="b.regel">{{ b.regel }} {{ b.wert ?? '' }} · </span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useBearbeitung } from '../../stores/useBearbeitung.js';
import { useAenderungen } from '../../stores/useAenderungen.js';
import { KOMMANDO_SCHEMA, punktAusWelt, rahmenOhneBezug } from '../../services/kommando/Kommando.js';

const props = defineProps({
  /** Wie der Viewer Einträge ans Modell bringt (`wendeEintragAn`). */
  wendeAn: { type: Function, default: null },
});
defineEmits(['zu']);

const bearbeitung = useBearbeitung();
const aenderungen = useAenderungen();
const text = ref('');
const laeuft = ref(false);
const ergebnisse = ref([]);
const markierungen = ref(bearbeitung.pruefeEigenes());

/** Der Abnahmefall C2 (Schritte 1–5), am Weltursprung des geladenen Modells. */
function beispiel() {
  const r = bearbeitung.rahmen ?? rahmenOhneBezug();
  const o = punktAusWelt({ x: 0, z: 0 }, r);
  const P = (dx, dn, hoehe) => ({ ost: +(o.ost + dx).toFixed(3), nord: +(o.nord + dn).toFixed(3), hoehe });
  const h0 = Math.round((r.hoehenversatz ?? 0) * 100) / 100;
  const k = (id, werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id: `${id}-${Date.now().toString(36)}`, werkzeug, ziel: [],
                                        wer: 'konsole', wann: new Date().toISOString(), ...rest });
  const s = Date.now().toString(36);
  const A = `cde-k-a-${s}`, B = `cde-k-b-${s}`, H = `cde-k-h-${s}`;
  const schacht = { kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1000 };
  text.value = JSON.stringify([
    k('ko-1', 'schacht-zeichnen', { neu: [A], werte: { name: 'A', ...schacht }, eingaben: { zug: [P(0, 0, h0 + 100), P(0, -0.001, h0 + 102.5)] } }),
    k('ko-2', 'schacht-zeichnen', { neu: [B], werte: { name: 'B', ...schacht }, eingaben: { zug: [P(30, 0, h0 + 99.85), P(30, -0.001, h0 + 102.4)] } }),
    k('ko-3', 'rohr-zeichnen', { neu: [H], werte: { name: 'H', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 },
                                 eingaben: { zug: [P(0, 0, h0 + 100), P(30, 0, h0 + 99.85)] } }),
    k('ko-4', 'sohlhoehen-setzen', { ziel: [H], werte: { anfang: h0 + 100, ende: h0 + 99.91 } }),
    k('ko-5', 'sohlhoehen-setzen', { ziel: [H], werte: { anfang: h0 + 100, ende: h0 + 99.88 } }),
  ], null, 1);
}

async function _anwenden(eintraege) {
  if (!eintraege?.length || !props.wendeAn) return;
  try { await props.wendeAn(eintraege.length > 1 ? eintraege : eintraege[0]); }
  catch (fehler) { console.error('cde: konsole anwenden', fehler); }
}

async function absetzen() {
  let liste;
  try { liste = JSON.parse(text.value); }
  catch (fehler) { ergebnisse.value = [{ id: '—', werkzeug: '—', ausgefuehrt: false, grund: `kein JSON: ${fehler.message}` }]; return; }
  laeuft.value = true;
  const aus = [];
  try {
    for (const k of Array.isArray(liste) ? liste : [liste]) {
      const erg = await bearbeitung.fuehreAus(k);
      aus.push({ id: k?.id ?? '—', werkzeug: k?.werkzeug ?? '—', ausgefuehrt: erg.ausgefuehrt, grund: erg.grund, eintraege: erg.eintraege.length });
      if (erg.ausgefuehrt) await _anwenden(erg.eintraege);
      else break;                 // ein abgelehntes Kommando hält die Folge an
    }
  } finally {
    laeuft.value = false;
    ergebnisse.value = aus;
    markierungen.value = bearbeitung.pruefeEigenes();
  }
}

async function zurueck() {
  laeuft.value = true;
  try { await _anwenden(await aenderungen.zurueck('konsole')); }
  finally {
    laeuft.value = false;
    markierungen.value = bearbeitung.pruefeEigenes();
  }
}

defineExpose({ absetzen, zurueck, beispiel, text, ergebnisse, markierungen });
</script>

<style scoped>
.kk {
  position: absolute; left: 12px; bottom: 12px; z-index: 30; width: min(520px, calc(100% - 24px));
  background: var(--cde-surface-raised); border: 1px solid var(--cde-line); border-radius: var(--cde-radius);
  color: var(--cde-text); font-size: var(--cde-font-xs); padding: 8px; box-shadow: var(--cde-shadow);
}
.kk-kopf { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.kk-kopf strong { flex: 1; }
.kk-text { width: 100%; font-family: monospace; font-size: var(--cde-font-xs); background: var(--cde-fill); color: var(--cde-text); border: 1px solid var(--cde-line); }
.kk-liste, .kk-befunde ul { margin: 6px 0 0; padding-left: 18px; max-height: 140px; overflow: auto; }
.kk-ok { color: var(--cde-text); }
.kk-nein { color: var(--cde-danger); }
.kk-befunde { margin-top: 6px; color: var(--cde-text-dim); }
</style>
