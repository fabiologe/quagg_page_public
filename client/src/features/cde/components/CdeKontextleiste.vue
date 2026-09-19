<template>
  <div class="modus-leiste" :class="{ 'modus-leiste--werkzeug': !!bearbeitung.scharf && !tipp }">
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
      </div>
      <!-- Eine laufende GESTE (S3): der nächste Tipp füllt ein Feld -->
      <div v-if="geste" class="kl-geste-hinweis">
        <CdeIcon name="pointer" :size="13" />
        <span>{{ gesteText }}</span>
        <button class="kl-zu" title="Geste abbrechen" aria-label="Geste abbrechen" @click="$emit('geste-ab')">
          <CdeIcon name="close" :size="11" />
        </button>
      </div>
      <CdeBearbeitungForm
        v-else
        :felder="bearbeitung.felder"
        :werte="bearbeitung.werte"
        :fehler="fehler"
        :hinweis="hinweis"
        :bereit="bereit"
        :ok-text="okText"
        @setze-wert="bearbeitung.setzeWert"
        @uebernehmen="$emit('uebernehmen')"
        @abbrechen="bearbeitung.abbrechen()"
      />
      <!-- Felder, die sich ZEIGEN lassen (S3): Station auf der Achse, Gelände im Raum -->
      <div v-if="!geste && gesten.length" class="kl-gesten">
        <button v-for="g in gesten" :key="g.name" class="kl-geste" :title="g.titel" @click="$emit('geste', g.name)">
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
    </template>

    <!-- Nach dem Übernehmen: was passiert ist, und „Nochmal" -->
    <template v-else-if="rueckmeldung">
      <CdeIcon name="check" :size="14" />
      <span>{{ rueckmeldung.text }}</span>
      <button v-if="rueckmeldung.werkzeugId" class="modus-fertig" title="Dasselbe Werkzeug noch einmal"
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
import CdeBearbeitungForm from './ui/CdeBearbeitungForm.vue';
import CdeQuerprofilSkizze from './CdeQuerprofilSkizze.vue';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { eingabeArt, schreibtAmBauplan } from '../services/Bearbeitungen.js';
import { hatHoehenbezug } from '../services/Hoehenbezug.js';

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
});
defineEmits(['fertig', 'uebernehmen', 'nochmal', 'rueckmeldung-zu', 'geste', 'geste-ab']);

const bearbeitung = useBearbeitung();

/** Läuft ein Zug im Motor? Dann führt er Hinweis, Fehler und Knopf. */
const zugLaeuft = computed(() => !!props.motor?.aktiv?.value && !!props.motor?.zug?.value);
const geste = computed(() => props.motor?.geste?.value ?? null);
const gesteText = computed(() => {
  const g = geste.value;
  if (!g) return '';
  return g.art === 'auswahl' ? 'Bauteil im Raum antippen — Esc bricht die Geste ab'
    : g.auf === 'achse' ? 'Ort auf der Achse antippen — Esc bricht die Geste ab'
    : 'Ort auf dem Bauteil antippen — Esc bricht die Geste ab';
});
/** Felder mit Geste — als Knöpfe „Zeigen". */
// Aus `gestenFelder` (scharfe Bearbeitung, auch ohne laufenden Zug) — `eingaben`
// kennt das Werkzeug erst, wenn der Motor sammelt, und der Knopf ist es, der
// das Sammeln beginnt.
const gesten = computed(() => (props.motor?.gestenFelder?.value ?? props.motor?.eingaben?.value?.felderMitGeste ?? []).map(g => ({
  name: g.name,
  text: g.geste === 'auswahl' ? `${feldTitel(g.name)}: im Raum antippen` : `${feldTitel(g.name)}: auf der Achse zeigen`,
  titel: `Das Feld „${feldTitel(g.name)}" per Tipp füllen`,
})));
function feldTitel(name) {
  const f = (bearbeitung.felder ?? []).find(x => x.name === name);
  return f?.label || f?.titel || name;
}
const bereit = computed(() => (zugLaeuft.value ? bearbeitung.bereit && !!props.motor.genug.value : bearbeitung.bereit));
const okText = computed(() => {
  if (!zugLaeuft.value) return 'Übernehmen';
  const m = props.motor;
  if (m.genug.value) return 'Übernehmen';
  const fehlt = m.mindestPunkte.value - m.punkte.value.length;
  return `Noch ${fehlt} ${fehlt === 1 ? 'Punkt' : 'Punkte'}`;
});
const fehler = computed(() => (zugLaeuft.value && props.motor.grund?.value
  ? [props.motor.grund.value, ...bearbeitung.fehler] : bearbeitung.fehler));

const subjektName = computed(() => {
  const b = bearbeitung.bauteil;
  if (!b || bearbeitung.scharf?.gruppe === 'erzeugen') return '';
  return b.name || String(b.category ?? b.type ?? '').replace(/^IFC/, '') || '';
});

/**
 * Was der nächste Schritt ist — oder was das Werkzeug NICHT tut. Derselbe
 * Wortlaut wie in der Toolbox (`festlegungsHinweis`): Zug/Umriss kommen
 * aus dem Raum (E8); Forderungen bleiben beim Planer; ohne
 * Höhenbezug zählt der Wert ab Modellursprung.
 */
const hinweis = computed(() => {
  // Eine überschrittene FACHGRENZE (K10, Fabios E5) sperrt nicht mehr — sie
  // wird hier gesagt, vor dem nächsten Schritt, und am Eintrag markiert.
  const grenze = bearbeitung.grenzhinweise?.[0]?.text ?? '';
  const weiter = naechsterSchritt();
  return grenze && weiter ? `${grenze} · ${weiter}` : (grenze || weiter);
});
function naechsterSchritt() {
  const s = bearbeitung.scharf;
  if (!s) return '';
  const art = eingabeArt(s);
  if (art === 'zug' || art === 'umriss') {
    // Der Motor sagt, was fehlt — gesetzt wird im Raum (E8: der Lageplan ist das Blatt).
    if (props.motor?.hinweis?.value) return props.motor.hinweis.value;
    return `${art === 'zug' ? 'Zug' : 'Umriss'} im Bild setzen — Punkte anklicken, Enter schliesst ab.`;
  }
  // Am EIGENEN Bauteil wird der Bauplan fortgeschrieben (Teil XXIV, K4) — dort
  // ist es keine Forderung, und der Hinweis wäre falsch.
  if (s.nurFestlegung && !schreibtAmBauplan(s, bearbeitung.bauteil)) return 'Wird als Forderung an den Planer geführt — die Geometrie bleibt bei ihm.';
  if (s.brauchtRolle === 'sohlhoehe' && !hatHoehenbezug(bearbeitung.bauteil?.hoehenversatz)) {
    return 'Kein Höhenbezug im Modell — der Wert zählt ab Modellursprung, nicht ab NN.';
  }
  const e = bearbeitung.einordnung;
  if (e && e.guete !== 'gemessen') return `Form nur ${e.guete} — Wert prüfen.`;
  return '';
}
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
.kl-kopf strong { font-weight: 600; }
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
