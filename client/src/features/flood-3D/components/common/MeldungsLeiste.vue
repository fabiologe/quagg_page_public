<template>
  <div v-if="store.meldungen.length" class="f3d-meldungen">
    <p v-for="m in store.meldungen" :key="m.id"
       class="f3d-meldung" :class="m.art" role="status">
      <span class="f3d-meldung-icon">{{ ICON[m.art] }}</span>
      <span class="f3d-meldung-text">{{ m.text }}</span>
      <button class="f3d-meldung-weg" title="Meldung schließen"
              @click="store.meldungWeg(m.id)">✕</button>
    </p>
  </div>
</template>

<script setup>
// Der eine Meldungsweg des Werkzeugs.
//
// Vorher liefen neun nebeneinander: `store.error` (an 17 Stellen gesetzt,
// an vier angezeigt — in der Phase „Ergebnis" nirgends, dort waren Fehler
// unsichtbar), `postStore.runsError`, `parseError`, `uebernommen`,
// `hinweis`, `rezeptMeldungen`, `meldungen` im Prüfpanel, sechs lokale
// `error`-refs und ein natives `window.confirm`. Jeder mit eigener Farbe,
// eigener Lebensdauer und eigenem Ort auf dem Schirm.
//
// Erfolg verschwindet nach 4 s, Hinweise nach 10 s, Fehler bleiben stehen,
// bis sie weggeklickt werden — eine Fehlermeldung mit Selbstzerstörung hat
// der Bearbeiter unter Umständen nie gesehen.
import { usePreStore } from '../../stores/usePreStore'

const store = usePreStore()
const ICON = { erfolg: '✓', hinweis: 'ℹ', fehler: '✗' }
</script>

<style scoped>
.f3d-meldungen {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 12px 0;
}
.f3d-meldung {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 6px 10px;
  border: 1px solid var(--f3d-border);
  border-left-width: 3px;
  border-radius: 6px;
  background: var(--f3d-bg-alt);
  font-size: 0.76rem;
  line-height: 1.4;
}
.f3d-meldung.erfolg { border-left-color: var(--f3d-good); }
.f3d-meldung.hinweis { border-left-color: var(--f3d-warn); }
.f3d-meldung.fehler { border-left-color: var(--f3d-bad); }
.f3d-meldung-icon { flex: none; }
.f3d-meldung.erfolg .f3d-meldung-icon { color: var(--f3d-good); }
.f3d-meldung.hinweis .f3d-meldung-icon { color: var(--f3d-warn); }
.f3d-meldung.fehler .f3d-meldung-icon { color: var(--f3d-bad); }
.f3d-meldung-text { flex: 1 1 auto; }
.f3d-meldung-weg {
  flex: none;
  background: none;
  border: none;
  color: var(--f3d-text-2);
  cursor: pointer;
  font-size: 0.8rem;
  line-height: 1;
  padding: 0 2px;
}
.f3d-meldung-weg:hover { color: var(--f3d-text); }
</style>
