<template>
  <div class="pb">
    <div class="pb-summe">
      <span class="cde-badge" :class="z.sperrend ? 'warn' : 'ok'">
        <CdeIcon :name="z.sperrend ? 'status-error' : 'status-ok'" :size="11" />
        {{ z.sperrend ? `${z.sperrend} sperrend` : 'nichts sperrt' }}
      </span>
      <span class="pb-stat">
        {{ z.warnungen }} {{ z.warnungen === 1 ? 'Warnung' : 'Warnungen' }} ·
        {{ z.hinweise }} {{ z.hinweise === 1 ? 'Hinweis' : 'Hinweise' }} ·
        {{ z.bestanden }} bestanden
      </span>
      <span v-if="kopf?.schema" class="pb-stat dim">{{ kopf.schema }}</span>
      <button v-if="herunterladbar" class="cde-btn sm pb-laden" title="Den ganzen Bericht als JSON sichern"
              @click="$emit('herunterladen')">
        <CdeIcon name="download" :size="11" /> Bericht
      </button>
    </div>
    <p v-if="hinweis" class="pb-hinweis">{{ hinweis }}</p>
    <section v-for="g in gruppen" :key="g.stufe" class="pb-stufe" :data-stufe="g.stufe">
      <h4 class="pb-stufe-titel">{{ g.titel }}</h4>
      <div v-for="b in g.befunde" :key="b.id" class="pb-befund" :class="`pb--${ampel(b)}`">
        <button class="pb-kopf" :aria-expanded="auf.has(b.id)" @click="umschalten(b.id)">
          <CdeIcon :name="SYMBOL[ampel(b)]" :size="12" class="pb-symbol" />
          <span class="pb-id">{{ b.id }}</span>
          <span class="pb-titel" :title="b.titel">{{ b.titel }}</span>
          <span v-if="b.ok !== true && b.zahl != null" class="pb-zahl">{{ b.zahl }}</span>
        </button>
        <div v-if="auf.has(b.id)" class="pb-rumpf">
          <p v-if="b.sagt" class="pb-sagt">{{ b.sagt }}</p>
          <p v-if="b.teile" class="pb-teile">
            <span v-for="(n, k) in b.teile" :key="k">{{ k }} {{ n }}</span>
          </p>
          <ul v-if="b.beispiele?.length" class="pb-beispiele" aria-label="Beispiele">
            <li v-for="x in b.beispiele" :key="x"><code>{{ x }}</code></li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
/**
 * PruefberichtPanel — der Bericht des Prüftors (Fahrplan IFC-Konsistenz, Stufe 6).
 *
 * Zeigt, urteilt nicht: Gruppen nach Stufe, Farbe nach Schwere, die Regel
 * „was sperrt" aus services/Pruefbericht.js (dieselbe wie `pruefe.offen`).
 * Sperrendes ist aufgeklappt — der Grund steht ohne Klick da.
 *
 * Nimmt, was es bekommt: den ganzen Bericht (Status des Laufs oder
 * GET …/verbund/{lauf_id}/bericht) oder die Kurzform aus dem Register (ohne
 * Text und Beispiele) — dann sagt `hinweis`, warum es weniger ist.
 */
import { computed, ref, watch } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import { ampel, gruppiere, istOffen, zaehle } from '../services/Pruefbericht.js';

const props = defineProps({
  befunde: { type: Array, required: true },
  kopf: { type: Object, default: null },
  herunterladbar: { type: Boolean, default: false },
  hinweis: { type: String, default: '' },
});
defineEmits(['herunterladen']);

const SYMBOL = Object.freeze({ ok: 'status-ok', fehler: 'status-error', warnung: 'status-warn', hinweis: 'info' });
const gruppen = computed(() => gruppiere(props.befunde));
const z = computed(() => zaehle(props.befunde));

const auf = ref(new Set());
watch(() => props.befunde, (liste) => {
  auf.value = new Set((liste ?? []).filter(istOffen).map(b => b.id));
}, { immediate: true });

function umschalten(id) {
  const neu = new Set(auf.value);
  if (neu.has(id)) neu.delete(id);
  else neu.add(id);
  auf.value = neu;
}
</script>

<style scoped>
/* Bausteine (cde-badge, cde-btn): styles/theme.css. Die Liste folgt IfcQualityTab.vue. */
.pb { display: flex; flex-direction: column; gap: var(--cde-gap-sm); font-size: 0.78rem; color: var(--cde-text); }

.pb-summe {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem;
  padding: 0.45rem 0.6rem;
  background: var(--cde-fill);
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius);
}
.pb-stat { font-size: var(--cde-font-sm); font-variant-numeric: tabular-nums; }
.pb-stat.dim { color: var(--cde-text-dim); }
.pb-laden { margin-left: auto; }
.pb-hinweis { margin: 0; color: var(--cde-text-dim); font-size: 0.7rem; }

.pb-stufe { display: flex; flex-direction: column; gap: var(--cde-gap-xs); }
.pb-stufe-titel { margin: 0.3rem 0 0; font-size: 0.7rem; font-weight: 600; color: var(--cde-text-dim); }

.pb-befund {
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius-sm);
  background: var(--cde-fill);
}
.pb--fehler { border-color: color-mix(in srgb, var(--cde-danger) 28%, transparent); }

.pb-kopf {
  display: flex; align-items: center; gap: var(--cde-gap-sm);
  width: 100%;
  padding: 0.35rem 0.5rem;
  background: none; border: none; cursor: pointer;
  color: var(--cde-text); font-size: 0.75rem; text-align: left;
}
.pb-kopf:hover { background: var(--cde-fill-hover); }
.pb-symbol { flex-shrink: 0; }
.pb--ok .pb-symbol { color: var(--cde-success-strong); }
.pb--fehler .pb-symbol { color: var(--cde-danger); }
.pb--warnung .pb-symbol { color: var(--cde-warn); }
.pb--hinweis .pb-symbol { color: var(--cde-text-mute); }
.pb-id { flex-shrink: 0; color: var(--cde-text-dim); font-variant-numeric: tabular-nums; }
.pb-titel { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-zahl { flex-shrink: 0; font-variant-numeric: tabular-nums; color: var(--cde-danger-soft); }
.pb--warnung .pb-zahl, .pb--hinweis .pb-zahl { color: var(--cde-warn); }

.pb-rumpf { padding: 0.1rem 0.6rem 0.45rem 1.9rem; }
.pb-sagt {
  margin: 0 0 0.25rem;
  color: var(--cde-text-soft); font-size: 0.7rem;
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.pb-teile {
  display: flex; flex-wrap: wrap; gap: 0.6rem;
  margin: 0 0 0.25rem;
  color: var(--cde-text-dim); font-size: 0.68rem; font-variant-numeric: tabular-nums;
}
.pb-beispiele { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0; padding: 0; list-style: none; }
.pb-beispiele code {
  padding: 0 0.25rem;
  border-radius: 3px;
  background: var(--cde-fill-hover);
  color: var(--cde-text-bright); font-size: 0.66rem;
  overflow-wrap: anywhere;
}
</style>
