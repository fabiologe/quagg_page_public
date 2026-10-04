<template>
  <div class="wk">
    <!-- Eine laufende GESTE (S3): der nächste Tipp füllt ein Feld -->
    <div v-if="k.geste.value" class="kl-geste-hinweis">
      <CdeIcon name="pointer" :size="13" />
      <span>{{ k.gesteText.value }}</span>
      <button class="kl-zu" title="Geste abbrechen" aria-label="Geste abbrechen" @click="$emit('geste-ab')">
        <CdeIcon name="close" :size="11" />
      </button>
    </div>
    <CdeBearbeitungForm
      v-else
      :felder="bearbeitung.felder"
      :werte="bearbeitung.werte"
      :fehler="k.fehler.value"
      :hinweis="k.hinweis.value"
      :bereit="k.bereit.value"
      :ok-text="k.okText.value"
      @setze-wert="bearbeitung.setzeWert"
      @uebernehmen="$emit('uebernehmen')"
      @abbrechen="bearbeitung.abbrechen()"
    />
    <!-- Felder, die sich ZEIGEN lassen (S3): Station auf der Achse, Gelände im Raum -->
    <div v-if="!k.geste.value && k.gesten.value.length" class="kl-gesten">
      <button v-for="g in k.gesten.value" :key="g.name" class="kl-geste" :title="g.titel" @click="$emit('geste', g.name)">
        <CdeIcon name="pointer" :size="12" /> {{ g.text }}
      </button>
    </div>
    <!-- Das Querprofil als Skizze (Teil XX, Stufe D): Gerinne, Graben. -->
    <div v-if="profile.length" class="kl-profile">
      <CdeQuerprofilSkizze v-for="(p, i) in profile" :key="i" :profil="p" />
    </div>
    <div v-if="chips.length" class="kl-chips">
      <span v-for="(c, i) in chips" :key="i" class="kl-chip" :class="`kl-chip--${c.art}`">{{ c.text }}</span>
    </div>
  </div>
</template>

<script setup>
/**
 * CdeWerkzeugKarte — Formular, Gesten, Querprofil und Vorschau-Chips einer scharfen Bearbeitung (Teil XXX, B1).
 *
 * Steht in der Tafel „Bauteil" rechts, wenn sie offen ist (Fabios E-B1: das Bild gehört dem Zeichnen), sonst in der
 * Kontextleiste unter dem Bild wie bisher. Gerechnet wird in `useWerkzeugKarte` — die schmale Leiste liest dasselbe.
 */
import CdeIcon from './ui/CdeIcon.vue';
import CdeBearbeitungForm from './ui/CdeBearbeitungForm.vue';
import CdeQuerprofilSkizze from './CdeQuerprofilSkizze.vue';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useWerkzeugKarte } from '../composables/useWerkzeugKarte.js';

const props = defineProps({
  /** Der Eingabe-Motor des Raums (useEingabe) — Zug, Gesten, Enter-Regel */
  motor:   { type: Object, default: null },
  /** [{ art, text }] aus der Vorschau */
  chips:   { type: Array, default: () => [] },
  /** Querprofile der Vorschau */
  profile: { type: Array, default: () => [] },
});
defineEmits(['uebernehmen', 'geste', 'geste-ab']);

const bearbeitung = useBearbeitung();
const k = useWerkzeugKarte(() => props.motor);
</script>

<style scoped>
.wk { display: flex; flex-direction: column; gap: 0.35rem; }
.kl-chips, .kl-gesten { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.kl-profile { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.kl-geste {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.2rem 0.5rem; cursor: pointer;
  background: var(--cde-fill); border: 1px solid var(--cde-line);
  border-radius: 999px; color: var(--cde-text);
  font-size: var(--cde-font-xs); touch-action: manipulation;
}
.kl-geste:hover { background: var(--cde-accent-fill-hi); color: var(--cde-accent); }
.kl-geste-hinweis {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.3rem 0.45rem;
  border: 1px dashed var(--cde-accent-line); border-radius: var(--cde-radius-sm);
  color: var(--cde-accent-soft); font-size: var(--cde-font-xs);
}
.kl-zu {
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; color: var(--cde-text-mute); cursor: pointer;
  padding: 0.2rem; touch-action: manipulation;
}
.kl-zu:hover { color: var(--cde-danger); }
.kl-chip {
  display: inline-block; padding: 0.08rem 0.45rem;
  border-radius: 999px; font-size: var(--cde-font-xs);
  background: var(--cde-accent-fill); color: var(--cde-accent-soft);
  border: 1px solid var(--cde-accent-line);
}
.kl-chip--forderung, .kl-chip--warnung { background: color-mix(in srgb, var(--cde-warn) 16%, transparent); color: var(--cde-warn-soft); border-color: color-mix(in srgb, var(--cde-warn) 45%, transparent); }
.kl-chip--festlegung, .kl-chip--einfach { background: var(--cde-fill); color: var(--cde-text-dim); border-color: var(--cde-line); }
.kl-chip--ableitung, .kl-chip--neu { background: color-mix(in srgb, var(--cde-success-strong) 16%, transparent); color: var(--cde-success); border-color: color-mix(in srgb, var(--cde-success-strong) 40%, transparent); }
@media (pointer: coarse) {
  .kl-geste { min-height: 40px; padding: 0.4rem 0.8rem; }
  .kl-zu { position: relative; }
  .kl-zu::after { content: ''; position: absolute; inset: -10px; }
}
</style>
