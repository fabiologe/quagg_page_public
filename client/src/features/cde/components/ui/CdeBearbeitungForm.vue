<template>
  <form class="bearb-form" @submit.prevent="$emit('uebernehmen')">
    <label v-for="f in felder" :key="f.name" class="bearb-feld">
      <span>{{ f.label || f.titel || f.name }}<template v-if="f.einheit"> [{{ f.einheit }}]</template></span>
      <select
        v-if="f.typ === 'auswahl'"
        :value="werte[f.name] ?? ''"
        @change="$emit('setzeWert', f.name, $event.target.value)"
      >
        <option v-if="f.leerErlaubt" value="">— nach Regel —</option>
        <option v-for="o in (f.optionen ?? [])" :key="o.wert" :value="o.wert">{{ o.titel }}</option>
      </select>
      <input
        v-else
        :type="f.typ === 'zahl' ? 'number' : 'text'"
        :value="werte[f.name] ?? ''"
        step="any"
        @input="$emit('setzeWert', f.name, f.typ === 'zahl' ? Number($event.target.value) : $event.target.value)"
      >
    </label>

    <p v-if="fehler.length" class="bearb-fehler">{{ fehler[0] }}</p>
    <p v-else-if="hinweis" class="bearb-hinweis">{{ hinweis }}</p>

    <div class="bearb-tasten">
      <button type="submit" class="bearb-ok" :disabled="!bereit">{{ okText }}</button>
      <button type="button" class="bearb-ab" @click="$emit('abbrechen')">Abbrechen</button>
    </div>
  </form>
</template>

<script setup>
/**
 * Das Formular einer Bearbeitung (Stufe 9.4).
 *
 * Herausgelöst aus `CdeHudLayer`, weil es ab jetzt an ZWEI Stellen steht: am
 * Bauteil in der Raumansicht und beim Zeichnen im Lageplan. Zwei Kopien
 * desselben Formulars wären die Fehlerklasse, die dieses Feature schon zweimal
 * getroffen hat — zwei Dokumentregister (Stufe 3), zwei Messungslisten
 * (Sprint U). Eine davon bekommt irgendwann ein Feld, das der anderen fehlt,
 * und niemand merkt es, weil beide für sich richtig aussehen.
 *
 * Rein darstellend: keine Store-Zugriffe, kein Katalogwissen. Die Felder kommen
 * aufgelöst herein (`felderFuer` hat das Typprofil schon angewandt), und alles,
 * was der Nutzer tut, geht als Ereignis zurück. Damit bleibt die Frage „welche
 * Bearbeitung ist scharf?" beim Aufrufer, wo sie hingehört.
 */
defineProps({
  /** Aufgelöste Felder aus `felderFuer` — mit Beschriftung, Einheit, Grenzen. */
  felder: { type: Array, default: () => [] },
  /** Formularwerte, Name → Wert. */
  werte: { type: Object, default: () => ({}) },
  /** Prüfmeldungen aus `pruefe`; die erste wird gezeigt. */
  fehler: { type: Array, default: () => [] },
  /** Zusatzhinweis (z. B. Güte der Einordnung), nur wenn kein Fehler ansteht. */
  hinweis: { type: String, default: '' },
  bereit: { type: Boolean, default: false },
  okText: { type: String, default: 'Übernehmen' },
});

defineEmits(['setzeWert', 'uebernehmen', 'abbrechen']);
</script>

<style scoped>
/* Unverändert aus CdeHudLayer übernommen — nur die Klassennamen verlieren das
   `hud-`, weil das Formular nicht mehr nur dort steht. Alle Farben über
   Tokens; das Formular funktioniert damit in beiden Themen und an jeder
   Stelle, an der es künftig auftaucht. */
.bearb-form { display: flex; flex-direction: column; gap: 0.3rem; }
.bearb-feld { display: flex; flex-direction: column; gap: 0.12rem; font-size: var(--cde-font-xs); }
.bearb-feld > span { color: var(--cde-text-dim); }
.bearb-feld select,
.bearb-feld input {
  background: var(--cde-fill); color: var(--cde-text);
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm);
  padding: 0.22rem 0.3rem; font-size: var(--cde-font-xs);
}
.bearb-fehler  { margin: 0; font-size: var(--cde-font-xs); color: var(--cde-danger); }
.bearb-hinweis { margin: 0; font-size: var(--cde-font-xs); color: var(--cde-warn); }

.bearb-tasten { display: flex; gap: 0.25rem; }
.bearb-ok, .bearb-ab {
  flex: 1; padding: 0.24rem 0.3rem;
  border-radius: var(--cde-radius-sm); cursor: pointer;
  font-size: var(--cde-font-xs);
  border: 1px solid var(--cde-line); background: var(--cde-fill); color: var(--cde-text);
}
.bearb-ok { border-color: var(--cde-accent-line); color: var(--cde-accent); }
.bearb-ok:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
