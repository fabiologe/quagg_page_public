<template>
  <div class="sig-vorschau">
    <div class="sig-vorschau-kopf">
      <strong>Vorschau</strong>
      <span class="sig-vorschau-stand">{{ veraltet ? 'nicht gespeicherte Änderungen — Vorschau zeigt den gespeicherten Stand' : 'gespeicherter Stand' }}</span>
    </div>
    <p v-if="!vorschau?.aktiv" class="sig-hinweis">
      Es wird keine Signatur angehängt — der Firmenblock ist leer oder abgeschaltet.
    </p>
    <template v-else>
      <iframe class="sig-rahmen" :srcdoc="srcdoc" sandbox="" title="Signatur-Vorschau" />
      <details class="sig-text">
        <summary>Textfassung (für Empfänger ohne HTML)</summary>
        <pre>{{ vorschau.text }}</pre>
      </details>
    </template>
  </div>
</template>

<script setup>
/**
 * MailSignaturVorschau — zeigt die vom Server gerenderte Signatur.
 *
 * Bewusst serverseitig gerendert: die Zusammenbau-Logik (Reihenfolge, leere
 * Felder, Escaping) darf es nur EINMAL geben, sonst weicht die Vorschau
 * irgendwann von der wirklich versendeten Mail ab. Darstellung im sandboxed
 * iframe wie im Lesebereich.
 */
import { computed } from 'vue'
import { baueSrcdoc, sanitizeMailHtml } from '../services/MailHtml'

const props = defineProps({
  vorschau: { type: Object, default: null },
  veraltet: { type: Boolean, default: false },
})

const srcdoc = computed(() => {
  if (!props.vorschau?.html) return ''
  // Eigene Ausgabe, trotzdem durch den Sanitizer — kostet nichts und deckt ab,
  // falls je unescapter Freitext den Weg hierher findet.
  const { html } = sanitizeMailHtml(props.vorschau.html, { bilderLaden: true })
  return baueSrcdoc(html)
})
</script>

<style scoped>
.sig-vorschau { display: flex; flex-direction: column; gap: 6px; }
.sig-vorschau-kopf { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.sig-vorschau-stand { font-size: 12px; color: var(--mail-text-dim, #6d757e); }
.sig-rahmen {
  width: 100%;
  height: 190px;
  border: 1px solid var(--mail-rand, #d6d3cc);
  border-radius: var(--mail-radius-klein, 6px);
  background: var(--mail-papier, #fff);
}
.sig-text summary { cursor: pointer; font-size: 13px; color: var(--mail-text-dim, #6d757e); }
.sig-text pre {
  margin: 6px 0 0;
  padding: 8px;
  border-radius: var(--mail-radius-klein, 6px);
  background: var(--mail-flaeche-2, #f1efeb);
  font-family: var(--mail-schrift-mono, monospace);
  font-size: 12px;
  white-space: pre-wrap;
}
.sig-hinweis {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--mail-radius-klein, 6px);
  background: var(--mail-warn-weich, rgba(180, 83, 9, .12));
  color: var(--mail-warn, #b45309);
  font-size: 13px;
}
</style>
