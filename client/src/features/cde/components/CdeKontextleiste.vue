<template>
  <div class="modus-leiste" :class="{ 'modus-leiste--werkzeug': !!bearbeitung.scharf && !tipp && !kompakt }">
    <!-- Ein Tipp-Werkzeug (Messen, Notiz): was der nächste Tipp tut + Fertig -->
    <template v-if="tipp">
      <CdeIcon :name="tipp.icon" :size="14" />
      <span>{{ tipp.hinweis }}</span>
      <button class="modus-fertig" :title="tipp.titel" @click="$emit('fertig')">
        <CdeIcon name="check" :size="12" /> Fertig
      </button>
    </template>

    <!-- Eine scharfe Bearbeitung: Werkzeug, Schritt, Formular, Vorschau-Chips, Übernehmen/Abbrechen -->
    <template v-else-if="bearbeitung.scharf">
      <div class="kl-kopf">
        <CdeIcon :name="bearbeitung.scharf.icon" :size="14" />
        <strong>{{ bearbeitung.scharf.titel }}</strong>
        <span v-if="subjektName" class="kl-subjekt" :title="subjektName">{{ subjektName }}</span>
        <!-- WAS EBEN PASSIERT IST, in der Werkzeugkarte (K5): in einer Serie
             bleibt das Werkzeug scharf, und die Rückmeldung stand bis dahin nur
             im Zweig OHNE scharfes Werkzeug — nach einem Griffzug sah sie
             niemand. Hier steht sie, solange sie zu DIESEM Werkzeug gehört. -->
        <span v-if="serienmeldung" class="kl-serie" :title="serienmeldung">
          <CdeIcon name="check" :size="12" /> {{ serienmeldung }}
        </span>
      </div>
      <!-- DAS BILD GEHÖRT DEM ZEICHNEN (Teil XXX, B1 — Fabios E-B1): ist die Tafel „Bauteil" offen, steht das Formular
           DORT; hier bleibt eine Zeile — nächster Schritt, Übernehmen, Abbrechen. Vorher stand die Karte mit elf
           Feldern mitten über dem Gelände (Messlauf B0: 85,7 % des mittleren Bilddrittels verdeckt). -->
      <div v-if="kompakt" class="kl-zeile">
        <span class="kl-schritt" :class="{ 'kl-schritt--fehler': karte.fehler.value.length }"
              :title="karte.fehler.value[0] || karte.hinweis.value">{{ karte.fehler.value[0] || karte.geste.value && karte.gesteText.value || karte.hinweis.value || 'Formular in der Tafel rechts' }}</span>
        <button class="modus-fertig" :disabled="!karte.bereit.value" @click="$emit('uebernehmen')">
          <CdeIcon name="check" :size="12" /> {{ karte.okText.value }}
        </button>
        <button class="kl-zu" title="Abbrechen (Esc)" aria-label="Abbrechen" @click="bearbeitung.abbrechen()">
          <CdeIcon name="close" :size="11" />
        </button>
      </div>
      <CdeWerkzeugKarte v-else :motor="motor" :chips="chips" :profile="profile"
                        @uebernehmen="$emit('uebernehmen')" @geste="(f) => $emit('geste', f)" @geste-ab="$emit('geste-ab')" />
    </template>

    <!-- Nach dem Übernehmen: was passiert ist, und „Nochmal" -->
    <template v-else-if="rueckmeldung">
      <CdeIcon name="check" :size="14" />
      <span>{{ rueckmeldung.text }}</span>
      <button v-if="rueckmeldung.rueckgaengig" class="modus-fertig" title="Zurücknehmen (Strg+Z)" @click="$emit('rueckgaengig')">
        Rückgängig
      </button>
      <button v-else-if="rueckmeldung.werkzeugId" class="modus-fertig" title="Dasselbe Werkzeug noch einmal"
              @click="$emit('nochmal', rueckmeldung.werkzeugId)">
        Nochmal
      </button>
      <button class="kl-zu" title="Ausblenden" aria-label="Ausblenden" @click="$emit('rueckmeldung-zu')">
        <CdeIcon name="close" :size="11" />
      </button>
    </template>
  </div>
</template>

<script setup>
/**
 * CdeKontextleiste — die Modus-Schale des Raums (Teil XVI, S2).
 *
 * Ersetzt die Modus-Leiste aus T3 und erweitert sie um die scharfe
 * Bearbeitung: Vorher lebte ihr Formular nur im HUD-Kontextmenü (das an der
 * Auswahl klebt und bei jedem Kamerazug wandert) und in der Toolbox (die
 * angedockt ist und die Bühne nicht sieht). Hier steht es unten in der
 * Mitte, wo auch Messen und Notiz ihren Hinweis zeigen — EIN Ort für
 * „was tue ich gerade, und was tut der nächste Tipp" (Muster: flood-3D
 * Editor3D, Kontextleiste je Modus mit sichtbarem Ausgang).
 *
 * Die CHIPS kommen aus der Vorschau: „Forderung — die Geometrie bleibt beim
 * Planer", „Gerinne · Sohle 301,20 → 300,80", „Massen nach Übernehmen".
 * Der Nutzer sieht, was „Übernehmen" tun WIRD, bevor er es tut.
 *
 * Der Store wird direkt gelesen (wie im HUD) — acht Props durch den Viewer
 * zu fädeln war die Zeremonie, die ihn einmal auf 1.400 Zeilen gebracht hat.
 */
import { computed } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import CdeWerkzeugKarte from './CdeWerkzeugKarte.vue';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useWerkzeugKarte } from '../composables/useWerkzeugKarte.js';

const props = defineProps({
  /** { icon, hinweis, titel } eines Tipp-Werkzeugs (Messen/Notiz), oder null */
  tipp:         { type: Object, default: null },
  /** [{ art, text }] aus der Vorschau */
  chips:        { type: Array, default: () => [] },
  /** Querprofile der Vorschau — {titel, sohlbreite, neigung, tiefe} (Teil XX, Stufe D). */
  profile:      { type: Array, default: () => [] },
  /** { text, werkzeugId } nach dem Übernehmen, oder null */
  rueckmeldung: { type: Object, default: null },
  /** Der Eingabe-Motor des Raums (useEingabe) — Zug, Gesten, Enter-Regel (S3) */
  motor:        { type: Object, default: null },
  /** Steht die Werkzeugkarte in der Tafel? Dann hier nur eine Zeile (Teil XXX, B1). */
  kompakt:      { type: Boolean, default: false },
});
defineEmits(['fertig', 'uebernehmen', 'nochmal', 'rueckgaengig', 'rueckmeldung-zu', 'geste', 'geste-ab']);

const bearbeitung = useBearbeitung();

/** Die Rückmeldung DIESES Werkzeugs — in der Serie bleibt sie sichtbar (K5). */
const serienmeldung = computed(() => (props.rueckmeldung?.werkzeugId
  && props.rueckmeldung.werkzeugId === bearbeitung.scharfId) ? props.rueckmeldung.text : null);

/** Was die Werkzeugkarte sagt — EIN Ort für Leiste und Tafel (Teil XXX, B1). */
const karte = useWerkzeugKarte(() => props.motor);

const subjektName = computed(() => {
  const b = bearbeitung.bauteil;
  if (!b || bearbeitung.scharf?.gruppe === 'erzeugen') return '';
  return b.name || String(b.category ?? b.type ?? '').replace(/^IFC/, '') || '';
});

</script>

<style scoped>
.modus-leiste {
  position: absolute; bottom: 1rem; left: 50%; transform: translateX(-50%);
  z-index: 21; display: flex; align-items: center; gap: 0.5rem;
  padding: 0.35rem 0.4rem 0.35rem 0.7rem;
  background: var(--cde-surface-raised);
  border: 1px solid var(--cde-accent-line);
  border-radius: 999px;
  color: var(--cde-text);
  font-size: var(--cde-font-sm);
  box-shadow: var(--cde-shadow);
  white-space: nowrap;
}
/* Mit Formular wird aus der Pille eine Karte. */
.modus-leiste--werkzeug {
  flex-direction: column; align-items: stretch; gap: 0.35rem;
  padding: 0.45rem 0.6rem 0.5rem;
  border-radius: var(--cde-radius);
  min-width: 260px; max-width: min(92vw, 26rem);
  white-space: normal;
}
.kl-kopf { display: flex; align-items: center; gap: 0.4rem; min-width: 0; }
/* Die schmale Zeile (B1): Schritt, Übernehmen, Abbrechen — das Formular steht in der Tafel. */
.kl-zeile { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
.kl-schritt { color: var(--cde-text-dim); font-size: var(--cde-font-xs); overflow: hidden; text-overflow: ellipsis; max-width: 28rem; }
.kl-schritt--fehler { color: var(--cde-warn-soft); }
.modus-fertig:disabled { opacity: 0.5; cursor: default; }
.kl-kopf strong { font-weight: 600; }
.kl-serie {
  margin-left: auto; display: inline-flex; align-items: center; gap: 0.25rem;
  color: var(--cde-success); font-size: 0.78rem; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; max-width: 22rem;
}
.kl-subjekt {
  color: var(--cde-text-dim); font-size: var(--cde-font-xs);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
}
.kl-chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.kl-profile { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.kl-gesten { display: flex; flex-wrap: wrap; gap: 0.25rem; }
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
.kl-chip {
  display: inline-block; padding: 0.08rem 0.45rem;
  border-radius: 999px; font-size: var(--cde-font-xs);
  background: var(--cde-accent-fill); color: var(--cde-accent-soft);
  border: 1px solid var(--cde-accent-line);
}
.kl-chip--forderung, .kl-chip--warnung { background: color-mix(in srgb, var(--cde-warn) 16%, transparent); color: var(--cde-warn-soft); border-color: color-mix(in srgb, var(--cde-warn) 45%, transparent); }
.kl-chip--festlegung, .kl-chip--einfach { background: var(--cde-fill); color: var(--cde-text-dim); border-color: var(--cde-line); }
.kl-chip--ableitung, .kl-chip--neu { background: color-mix(in srgb, var(--cde-success-strong) 16%, transparent); color: var(--cde-success); border-color: color-mix(in srgb, var(--cde-success-strong) 40%, transparent); }

.modus-fertig {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.25rem 0.6rem; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--cde-success-strong) 50%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--cde-success-strong) 18%, transparent);
  color: var(--cde-success);
  font-size: var(--cde-font-xs); font-weight: 600;
  touch-action: manipulation;
}
.modus-fertig:hover { background: color-mix(in srgb, var(--cde-success-strong) 28%, transparent); }
.kl-zu {
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; color: var(--cde-text-mute); cursor: pointer;
  padding: 0.2rem; touch-action: manipulation;
}
.kl-zu:hover { color: var(--cde-danger); }
@media (pointer: coarse) {
  .modus-fertig { min-height: 40px; padding: 0.4rem 0.9rem; }
  .kl-geste { min-height: 40px; padding: 0.4rem 0.8rem; }
  .kl-zu { position: relative; }
  .kl-zu::after { content: ''; position: absolute; inset: -10px; }
}
</style>
