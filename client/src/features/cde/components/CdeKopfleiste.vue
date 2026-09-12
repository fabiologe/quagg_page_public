<template>
  <!-- Oben steht nur, WO man ist und WAS man hinausgibt (Kassensturz H1).
       Vorher 21 Bedienelemente, 11 davon nur ein Symbol. -->
  <header ref="leiste" class="cde-bar">
    <!-- Projekt: Stammdaten zum Nachlesen, gepflegt wird in der Akte -->
    <div v-if="cde.auftrag" class="kl-anker">
      <button
        class="kl-knopf kl-projekt"
        aria-haspopup="true"
        :aria-expanded="offen === 'projekt'"
        :title="`Projekt ${cde.auftrag.nummer} — Stammdaten und Akte`"
        @click="umschalten('projekt')"
      >
        <CdeIcon name="project" :size="14" />
        <span class="kl-projekt-text">{{ cde.auftrag.nummer }} · {{ cde.auftrag.name }}</span>
        <CdeIcon name="chevron-down" :size="12" />
      </button>
      <div v-if="offen === 'projekt'" class="kl-menue" role="dialog" aria-label="Projekt">
        <dl class="kl-stamm">
          <dt>Nummer</dt><dd>{{ cde.auftrag.nummer }}</dd>
          <dt>Bezeichnung</dt><dd>{{ cde.auftrag.name || '—' }}</dd>
          <dt>Bauherr</dt><dd>{{ cde.auftrag.bauherr || '—' }}</dd>
          <dt>Leistungsphase</dt><dd>{{ cde.auftrag.lph || '—' }}</dd>
        </dl>
        <p class="kl-hinweis">Geändert wird in der Projekt-Akte.</p>
        <a
          class="kl-eintrag"
          :href="`/intern/projects?projekt=${cde.auftrag.id}`"
          target="_blank"
          rel="noopener"
          @click="schliessen"
        ><CdeIcon name="extern" :size="13" /> Zur Projekt-Akte</a>
      </div>
    </div>
    <span v-else class="kl-ohne">Kein Projekt</span>

    <!-- Satz: wählen, anlegen, umbenennen, löschen — ein Menü statt vier Knöpfe -->
    <div v-if="cde.auftrag" class="kl-anker">
      <button
        class="kl-knopf kl-satz"
        aria-haspopup="menu"
        :aria-expanded="offen === 'satz'"
        title="Satz — eine benannte Auswahl der Modelle"
        @click="umschalten('satz')"
      >
        <span class="kl-etikett">Satz</span>
        <strong class="kl-satz-name">{{ cde.aktiverSatz?.name ?? 'ohne Satz' }}</strong>
        <CdeIcon name="chevron-down" :size="12" />
      </button>
      <div v-if="offen === 'satz'" class="kl-menue" role="menu" aria-label="Satz">
        <button
          v-for="s in cde.saetze"
          :key="s.id"
          class="kl-eintrag"
          :class="{ an: s.id === cde.aktiverSatzId }"
          role="menuitemradio"
          :aria-checked="s.id === cde.aktiverSatzId"
          @click="waehle(s.id)"
        >
          <CdeIcon name="check" :size="13" class="kl-haken" />
          <span>{{ s.name }}</span>
          <small v-if="s.zweck && s.zweck !== 'variante'" class="kl-zweck">{{ s.zweck }}</small>
        </button>
        <button
          class="kl-eintrag"
          :class="{ an: !cde.aktiverSatzId }"
          role="menuitemradio"
          :aria-checked="!cde.aktiverSatzId"
          title="Ohne Satz gelten die Schritte für das ganze Projekt"
          @click="waehle(null)"
        >
          <CdeIcon name="check" :size="13" class="kl-haken" />
          <span>ohne Satz</span>
        </button>
        <div class="kl-trenner" role="separator"></div>
        <button class="kl-eintrag" role="menuitem" @click="aktion('satz-neu')">
          <CdeIcon name="add" :size="13" /> Neuer Satz …
        </button>
        <button class="kl-eintrag" role="menuitem" :disabled="!cde.aktiverSatz" @click="aktion('satz-umbenennen')">
          <CdeIcon name="text" :size="13" /> Umbenennen …
        </button>
        <button class="kl-eintrag" role="menuitem" :disabled="!cde.aktiverSatz" @click="aktion('satz-loeschen')">
          <CdeIcon name="delete" :size="13" /> Löschen …
        </button>
      </div>
    </div>

    <span class="cde-spacer" />

    <!-- Ansicht: der Modus-Katalog ist die eine Quelle (Umschalter, Palette, Hilfe) -->
    <nav class="kl-ansichten" aria-label="Ansicht">
      <button
        v-for="m in modi"
        :key="m.id"
        class="kl-ansicht"
        :class="{ an: ansicht.modus === m.id }"
        :aria-pressed="ansicht.modus === m.id"
        :disabled="!moeglich(m.id)"
        :title="modusTitel(m)"
        @click="ansicht.setzeModus(m.id)"
      >
        <CdeIcon :name="m.icon" :size="13" />
        <span>{{ m.kurz }}</span>
        <small v-if="m.id === 'dokumente' && cde.dokumente.length" class="kl-zahl">{{ cde.dokumente.length }}</small>
      </button>
    </nav>

    <span class="cde-spacer" />

    <button class="kl-knopf kl-ausgeben" :disabled="!ausgebenMoeglich" :title="ausgebenTitel" @click="aktion('ausgeben')">
      <CdeIcon name="ausgeben" :size="14" /> Ausgeben
    </button>

    <!-- Was man einmal im Projekt braucht, bekommt keinen Dauerplatz -->
    <div class="kl-anker">
      <button
        class="kl-knopf kl-mehr"
        aria-haspopup="menu"
        :aria-expanded="offen === 'mehr'"
        title="Mehr"
        aria-label="Mehr"
        @click="umschalten('mehr')"
      >
        <CdeIcon name="mehr" :size="16" />
      </button>
      <div v-if="offen === 'mehr'" class="kl-menue kl-menue--rechts" role="menu" aria-label="Mehr">
        <button class="kl-eintrag" role="menuitem" @click="aktion('bauformen')">
          <CdeIcon name="bauform" :size="13" /> Bauformen zuordnen …
        </button>
        <button
          class="kl-eintrag"
          :class="{ an: farbmodus.hell }"
          role="menuitemcheckbox"
          :aria-checked="farbmodus.hell"
          title="Helle Oberfläche im Stil von Quagg-PDF — gilt für dieses Gerät"
          @click="farbmodusUmschalten"
        >
          <CdeIcon name="farbmodus" :size="13" /> Heller Modus
          <CdeIcon name="check" :size="13" class="kl-haken kl-haken--rechts" />
        </button>
        <button class="kl-eintrag" role="menuitem" @click="aktion('hilfe')">
          <CdeIcon name="help" :size="13" /> Tastenkürzel <kbd>?</kbd>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
/**
 * Die Kopfleiste der CDE (Kassensturz H1, 2026-09-12).
 *
 * Fünf Dinge: Projekt, Satz, Ansicht, Ausgeben und ein Menü für das Seltene.
 * Die Tafel-Knöpfe wohnen in den Reiterleisten an den Seiten
 * (`CdeReiterleiste.vue`), die Stammdaten im Projekt-Knopf, das Register in
 * der Ansicht „Dokumente".
 *
 * Die Leiste entscheidet nichts selbst: Satzwechsel, Anlegen, Löschen und
 * Ausgeben meldet sie der Schale — die kennt die Rückfragen und die Sperre
 * bei offener Bearbeitung.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import { useCdeStore } from '../stores/useCdeStore.js';
import { useAnsicht } from '../stores/useAnsicht.js';
import { useFarbmodus } from '../stores/useFarbmodus.js';
import { modusListe, istVerfuegbar } from '../services/ViewModes.js';
import { repo } from '../services/RepoFacade.js';

const emit = defineEmits([
  'satz-waehlen', 'satz-neu', 'satz-umbenennen', 'satz-loeschen',
  'ausgeben', 'bauformen', 'hilfe',
]);

const cde = useCdeStore();
const ansicht = useAnsicht();
const farbmodus = useFarbmodus();
const modi = modusListe();

const leiste = ref(null);
/** Welches Menü offen ist — höchstens eines. */
const offen = ref(null);

function umschalten(name) { offen.value = offen.value === name ? null : name; }
function schliessen() { offen.value = null; }
function aktion(name) { schliessen(); emit(name); }
/** Heller Modus (H6) — gilt sofort und je Gerät; die Schale braucht davon nichts zu wissen. */
function farbmodusUmschalten() { farbmodus.umschalten(); schliessen(); }
function waehle(id) {
  schliessen();
  if ((id ?? null) !== (cde.aktiverSatzId ?? null)) emit('satz-waehlen', id ?? null);
}

function moeglich(id) { return istVerfuegbar(id, ansicht.stand); }
function modusTitel(m) {
  if (moeglich(m.id)) return `${m.titel} [${m.taste}]`;
  if (m.id === 'dokumente') return `${m.titel} — nur in einem Projekt`;
  if (m.id === 'laengsschnitt' && ansicht.stand.hatModell) return `${m.titel} — das Modell hat keine Haltungsachsen`;
  return `${m.titel} — erst mit einem geladenen Modell`;
}

const ausgebenMoeglich = computed(() => !!cde.aktiverSatz && !!repo.remote);
const ausgebenTitel = computed(() => {
  if (!repo.remote) return 'Ausgeben braucht den Projektordner — die CDE aus der Projekt-Akte öffnen';
  if (!cde.aktiverSatz) return 'Erst einen Satz wählen';
  return `„${cde.aktiverSatz.name}“ ausgeben — als Erdbau-Dokument oder Verbund, geprüft ins Register`;
});

// Ein offenes Menü schliesst ein Tipp daneben und Esc. Esc hält es dabei an,
// damit nicht zugleich ein Werkzeug im Bild abbricht.
function draussen(e) {
  if (offen.value && leiste.value && !leiste.value.contains(e.target)) schliessen();
}
function taste(e) {
  if (offen.value && e.key === 'Escape') { e.stopPropagation(); schliessen(); }
}
onMounted(() => {
  document.addEventListener('pointerdown', draussen, true);
  document.addEventListener('keydown', taste, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', draussen, true);
  document.removeEventListener('keydown', taste, true);
});
</script>

<style scoped>
.cde-bar {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.8rem;
  background: var(--cde-bg-alt);
  border-bottom: 1px solid var(--cde-tint);
  flex-shrink: 0;
  position: relative;
  z-index: 40;
}
.cde-spacer { flex: 1; }

.kl-anker { position: relative; display: flex; }
.kl-knopf {
  display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.3rem 0.6rem;
  background: var(--cde-tint-weak);
  border: 1px solid var(--cde-tint-max);
  border-radius: var(--cde-radius-sm);
  color: var(--cde-text);
  font-size: var(--cde-font-sm);
  cursor: pointer;
  white-space: nowrap;
  touch-action: manipulation;
}
.kl-knopf:hover:not(:disabled) { background: var(--cde-fill-hover); color: var(--cde-text-bright); }
.kl-knopf[aria-expanded="true"] { border-color: var(--cde-accent-line); color: var(--cde-text-bright); }
.kl-knopf:disabled { opacity: 0.45; cursor: default; }
.kl-knopf:focus-visible, .kl-ansicht:focus-visible, .kl-eintrag:focus-visible { outline: 2px solid var(--cde-accent-line); outline-offset: 1px; }

.kl-projekt { color: var(--cde-text-bright); max-width: 32ch; }
.kl-projekt-text { overflow: hidden; text-overflow: ellipsis; }
.kl-ohne { color: var(--cde-text-dim); font-size: var(--cde-font-sm); }
.kl-etikett { color: var(--cde-text-dim); }
.kl-satz-name { color: var(--cde-text-bright); font-weight: 600; max-width: 24ch; overflow: hidden; text-overflow: ellipsis; }

.kl-ausgeben {
  background: var(--cde-accent);
  border-color: var(--cde-accent);
  /* Schrift auf kräftiger Farbfläche: im Dunkeln der tiefe Grund, im Hellen Weiß. */
  color: var(--cde-text-auf-farbe);
  font-weight: 700;
}
.kl-ausgeben:hover:not(:disabled) { background: var(--cde-accent); color: var(--cde-text-auf-farbe); filter: brightness(1.08); }
.kl-mehr { padding: 0.3rem 0.45rem; }

.kl-ansichten {
  display: flex; gap: 2px; padding: 2px;
  background: var(--cde-fill);
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius);
}
.kl-ansicht {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.25rem 0.65rem;
  background: none; border: none;
  border-radius: var(--cde-radius-sm);
  color: var(--cde-text-dim);
  font-size: var(--cde-font-sm);
  cursor: pointer; white-space: nowrap;
  touch-action: manipulation;
}
.kl-ansicht:hover:not(:disabled) { background: var(--cde-fill-hover); color: var(--cde-text); }
.kl-ansicht.an { background: var(--cde-accent-fill-hi); color: var(--cde-accent); }
.kl-ansicht:disabled { opacity: 0.4; cursor: default; }
.kl-zahl { color: var(--cde-text-dim); font-size: var(--cde-font-xs); font-variant-numeric: tabular-nums; }

.kl-menue {
  position: absolute; top: calc(100% + 6px); left: 0;
  z-index: 200;
  min-width: 230px;
  display: flex; flex-direction: column; gap: 1px;
  padding: 0.3rem;
  background: var(--cde-float);
  border: 1px solid var(--cde-line-strong);
  border-radius: var(--cde-radius);
  box-shadow: var(--cde-shadow-float);
}
.kl-menue--rechts { left: auto; right: 0; }
.kl-eintrag {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.55rem;
  background: none; border: none;
  border-radius: var(--cde-radius-sm);
  color: var(--cde-text);
  font-size: var(--cde-font-sm);
  text-align: left; text-decoration: none;
  cursor: pointer; white-space: nowrap;
  touch-action: manipulation;
}
.kl-eintrag:hover:not(:disabled) { background: var(--cde-fill-hover); color: var(--cde-text-bright); }
.kl-eintrag:disabled { opacity: 0.45; cursor: default; }
.kl-eintrag.an { color: var(--cde-text-bright); }
.kl-haken { visibility: hidden; color: var(--cde-accent); }
.kl-eintrag.an .kl-haken { visibility: visible; }
.kl-haken--rechts { margin-left: auto; }
.kl-zweck { margin-left: auto; color: var(--cde-text-dim); font-size: var(--cde-font-xs); }
.kl-trenner { height: 1px; margin: 0.25rem 0; background: var(--cde-line); }
.kl-eintrag kbd {
  margin-left: auto;
  padding: 0 0.3rem;
  border: 1px solid var(--cde-line-strong); border-radius: 3px;
  color: var(--cde-text-dim); font-size: var(--cde-font-xs);
}
.kl-stamm {
  display: grid; grid-template-columns: auto 1fr; gap: 0.2rem 0.8rem;
  margin: 0.2rem 0.4rem 0.3rem;
  font-size: var(--cde-font-sm);
}
.kl-stamm dt { color: var(--cde-text-dim); }
.kl-stamm dd { margin: 0; color: var(--cde-text-bright); }
.kl-hinweis { margin: 0 0.4rem 0.3rem; color: var(--cde-text-dim); font-size: var(--cde-font-xs); }

/* Auf dem Finger: jedes Ziel 40 × 40 (Tablet-Rezept R3) — auch quer. */
@media (pointer: coarse) {
  .kl-knopf, .kl-ansicht, .kl-eintrag { min-height: 40px; }
  .kl-mehr { min-width: 40px; justify-content: center; }
}

/* Hochkant (Breakpoint wie CdePanel und CdeView): die Leiste bricht um,
   statt Knöpfe aus dem Bild zu schieben; der Abstandhalter fällt weg,
   weil `flex: 1` die Zeile füllt und den Umbruch verhindert. */
@media (max-width: 900px) {
  .cde-bar { flex-wrap: wrap; row-gap: 0.35rem; }
  .cde-spacer { display: none; }
  .cde-bar button,
  .cde-bar .kl-eintrag { min-height: 40px; }
  .cde-bar button { min-width: 40px; }
  .kl-projekt { max-width: 46vw; }
}
</style>
