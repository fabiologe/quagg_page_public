<template>
  <div class="tb">
    <!-- OHNE AUSWAHL: was man ohne Subjekt tun kann. Eine leere Toolbox wäre
         die schlechteste Antwort — sie sähe kaputt aus. -->
    <template v-if="!bearbeitung.bauteil">
      <p class="tb-leer">
        Kein Bauteil gewählt. Anklicken zeigt, was daran möglich ist — und woher
        die CDE das weiß.
      </p>
      <h4 class="tb-kopf">Erzeugen</h4>
      <p class="tb-warum">Braucht kein Bauteil. Gezeichnet wird im Lageplan.</p>
      <div class="tb-liste">
        <div v-for="z in zeichenWerkzeuge" :key="z.id" class="tb-btn tb-btn--aus">
          <CdeIcon :name="z.icon" :size="13" />
          <span>{{ z.titel }}</span>
        </div>
      </div>
      <p class="tb-fuss">Im Lageplan liegen sie als Knöpfe in der Werkzeugleiste.</p>
    </template>

    <template v-else>
      <!-- Kopf: was ist das hier? -->
      <div class="tb-titel">
        <strong>{{ bearbeitung.bauteil.name || '(ohne Namen)' }}</strong>
        <code>{{ herleitung.kategorie }}</code>
      </div>

      <!-- DIE HERLEITUNG. Der Grund, warum es diese Toolbox gibt. -->
      <details class="tb-herleitung" open>
        <summary>Woher die CDE weiß, was hier geht</summary>

        <dl class="tb-kette">
          <dt>Form</dt>
          <dd>
            <strong>{{ herleitung.bauformTitel }}</strong>
            <span class="tb-dim">aus {{ QUELLE_TEXT[herleitung.quelle] ?? herleitung.quelle }}</span>
            <span v-if="herleitung.regel" class="tb-dim">· Regel „{{ herleitung.regel }}"</span>
          </dd>

          <dt>Güte</dt>
          <dd>
            <span :class="['tb-guete', 'tb-guete--' + herleitung.guete]">{{ herleitung.guete }}</span>
            <span class="tb-dim">{{ GUETE_TEXT[herleitung.guete] }}</span>
          </dd>

          <dt>Typprofil</dt>
          <dd v-if="herleitung.profilAus">
            <code>{{ herleitung.profilAus }}</code>
            <span v-if="herleitung.profilUeberVererbung" class="tb-erbt">geerbt</span>
            <span class="tb-dim">kennt {{ herleitung.rollen.join(', ') }}</span>
          </dd>
          <dd v-else class="tb-dim">keins — es gelten nur die allgemeinen Bearbeitungen</dd>

          <dt>Vererbung</dt>
          <dd class="tb-hierarchie">
            <span
              v-for="stufe in herleitung.kette"
              :key="stufe"
              :class="{ treffer: stufe === herleitung.profilAus }"
            >{{ stufe }}</span>
          </dd>
        </dl>

        <p v-if="herleitung.luecke" class="tb-luecke">
          <CdeIcon name="info" :size="12" /> {{ herleitung.luecke.text }}
        </p>
        <p v-for="w in herleitung.warnungen" :key="w" class="tb-warnung">
          <CdeIcon name="warn" :size="12" /> {{ WARNUNG_TEXT[w] ?? w }}
        </p>
      </details>

      <!-- Das Formular der scharfen Bearbeitung verdrängt die Liste. -->
      <CdeBearbeitungForm
        v-if="bearbeitung.scharf"
        :felder="bearbeitung.felder"
        :werte="bearbeitung.werte"
        :fehler="bearbeitung.fehler"
        :hinweis="festlegungsHinweis"
        :bereit="bearbeitung.bereit"
        @setze-wert="bearbeitung.setzeWert"
        @uebernehmen="uebernehmen"
        @abbrechen="bearbeitung.abbrechen()"
      />

      <template v-else>
        <section v-for="g in herleitung.gruppen" :key="g.art" class="tb-gruppe">
          <h4 class="tb-kopf">{{ g.titel }}</h4>
          <p class="tb-warum">{{ g.warum }}</p>
          <div class="tb-liste">
            <button
              v-for="b in g.eintraege"
              :key="b.id"
              class="tb-btn"
              :title="b.nurFestlegung ? 'Wird als Festlegung geführt — die Geometrie bleibt beim Planer' : b.titel"
              @click="bearbeitung.starte(b.id)"
            >
              <CdeIcon :name="b.icon" :size="13" />
              <span>{{ b.titel }}</span>
              <!-- Die Beschriftung, die DIESER Typ dem Feld gibt: „DN" am Rohr,
                   „Profilreihe" am Träger. Sie ist der sichtbare Beweis, dass
                   das Vokabular aus Daten kommt und nicht aus dem Programm. -->
              <em v-if="b.felder.length" class="tb-feld">{{ b.felder.map(f => f.label).join(', ') }}</em>
              <CdeIcon v-if="b.nurFestlegung" name="documents" :size="11" class="tb-nurfest" />
            </button>
          </div>
        </section>

        <details v-if="herleitung.gesperrt.length" class="tb-gesperrt">
          <summary>Hier nicht möglich ({{ herleitung.gesperrt.length }})</summary>
          <!-- „Steht nicht in der Liste" ist die schlechteste Rückmeldung: der
               Nutzer weiß nicht, ob das Werkzeug fehlt, sein Modell zu schlecht
               ist oder er etwas falsch macht. -->
          <div v-for="b in herleitung.gesperrt" :key="b.id" class="tb-nein">
            <span>{{ b.titel }}</span>
            <em>{{ b.warum }}</em>
          </div>
        </details>
      </template>
    </template>
  </div>
</template>

<script setup>
/**
 * Toolbox — alle Bearbeitungen eines Bauteils, MIT ihrer Herkunft (Stufe 9.4b).
 *
 * Sie beantwortet eine Frage, die zweimal mündlich erklärt und zweimal nicht
 * angekommen ist: „Da liegt ein IFCElementXYZ — woher weiß die CDE, was ich
 * damit machen kann?" Der Grund, warum die Erklärung nicht trug, war kein
 * Erklärungsproblem: **die Kette war nirgends zu sehen.** Ein Mechanismus, der
 * nichts unterscheidet, lässt sich nicht beobachten.
 *
 * Deshalb gruppiert diese Toolbox nach HERKUNFT und nicht nach Werkzeugart:
 *
 *   Immer möglich                  → `bauform: '*'` — Merkmale, ohne Geometrie
 *   Weil <Bauform>                 → die FORM erlaubt es (acht Formen, fest)
 *   Weil der Typ die Größe kennt   → das TYPPROFIL nennt die Rolle (Daten)
 *
 * Die Rechnung selbst steht in `services/Herleitung.js` und ist rein — diese
 * Datei zeigt sie nur an. Das ist Absicht: die Antwort auf „woher weiß das
 * Programm das" darf nicht in einer Vorlage stehen, sonst lässt sie sich nicht
 * prüfen.
 */
import { computed } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import CdeBearbeitungForm from './ui/CdeBearbeitungForm.vue';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import { useViewerApi } from '../composables/viewerApi.js';
import { herleite } from '../services/Herleitung.js';
import { ausGruppe } from '../services/Bearbeitungen.js';

const bearbeitung = useBearbeitung();
const cde = useCdeStore();
const api = useViewerApi();

const zeichenWerkzeuge = ausGruppe('erzeugen');

const QUELLE_TEXT = Object.freeze({
  regel:     'einer Büroregel',
  typprofil: 'dem Typprofil',
  geometrie: 'der Geometrie',
  rueckfall: 'keiner Angabe (Rückfall)',
});

const GUETE_TEXT = Object.freeze({
  gemessen:   'die Form steht wirklich im Modell',
  geschaetzt: 'aus dem Netz abgeleitet — prüfen',
  unbekannt:  'nicht ableitbar',
});

const WARNUNG_TEXT = Object.freeze({
  achse_nicht_ableitbar:    'Keine Achse im Modell und keine aus dem Netz — Lage nur grob bestimmbar.',
  achse_skelettiert:        'Die Achse ist aus dem Netz geschätzt, nicht vom Planer gezeichnet.',
  kein_koerper:             'Kein Volumen — Mengen und Massen sind hier nicht belastbar.',
  koerper_nicht_geschlossen: 'Das Volumen ist nicht geschlossen — Massen nur näherungsweise.',
});

const herleitung = computed(() => herleite({
  el: bearbeitung.bauteil,
  einordnung: bearbeitung.einordnung,
  profilSatz: bearbeitung.profilSatz,
}));

/** Was die scharfe Bearbeitung bewirkt — und was nicht. */
const festlegungsHinweis = computed(() => (bearbeitung.scharf?.nurFestlegung
  ? 'Wird als Festlegung geführt und geht in den Änderungsbericht — die Geometrie bleibt beim Planer.'
  : ''));

async function uebernehmen() {
  await bearbeitung.ausfuehren({
    wer: cde.bearbeiter || '',
    modellSha: api.getLoadedModelSha?.() ?? null,
  });
}
</script>

<style scoped>
.tb { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.2rem 0 0.6rem; }

.tb-titel { display: flex; flex-direction: column; gap: 0.1rem; }
.tb-titel code { font-size: var(--cde-font-xs); color: var(--cde-text-dim); }

.tb-leer, .tb-fuss { margin: 0; font-size: var(--cde-font-xs); color: var(--cde-text-dim); }

/* ── Herleitung ────────────────────────────────────────────────────────── */
.tb-herleitung {
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius-sm);
  padding: 0.35rem 0.45rem;
  background: var(--cde-fill);
}
.tb-herleitung > summary {
  cursor: pointer; font-size: var(--cde-font-xs);
  color: var(--cde-text-dim); user-select: none;
}
.tb-kette {
  display: grid; grid-template-columns: auto 1fr; gap: 0.15rem 0.5rem;
  margin: 0.4rem 0 0; font-size: var(--cde-font-xs);
}
.tb-kette dt { color: var(--cde-text-dim); }
.tb-kette dd { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.3rem; }
.tb-dim { color: var(--cde-text-dim); }
.tb-erbt {
  padding: 0 0.25rem; border-radius: var(--cde-radius-sm);
  background: var(--cde-accent-fill-hi); color: var(--cde-accent);
}
.tb-guete { font-weight: 600; }
.tb-guete--gemessen   { color: var(--cde-success-strong); }
.tb-guete--geschaetzt { color: var(--cde-warn); }
.tb-guete--unbekannt  { color: var(--cde-danger); }

.tb-hierarchie { flex-wrap: wrap; gap: 0.15rem; }
.tb-hierarchie > span {
  font-size: 0.68rem; color: var(--cde-text-dim);
  padding: 0 0.2rem; border-radius: var(--cde-radius-sm);
}
.tb-hierarchie > span:not(:last-child)::after { content: ' →'; }
.tb-hierarchie > span.treffer {
  background: var(--cde-accent-fill-hi); color: var(--cde-accent); font-weight: 600;
}

.tb-luecke, .tb-warnung {
  margin: 0.4rem 0 0; font-size: var(--cde-font-xs);
  display: flex; gap: 0.3rem; align-items: flex-start;
}
.tb-luecke  { color: var(--cde-text-dim); }
.tb-warnung { color: var(--cde-warn); }

/* ── Gruppen ───────────────────────────────────────────────────────────── */
.tb-gruppe { display: flex; flex-direction: column; gap: 0.2rem; }
.tb-kopf {
  margin: 0; font-size: var(--cde-font-xs); text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--cde-text-dim);
}
.tb-warum { margin: 0; font-size: 0.68rem; color: var(--cde-text-dim); }
.tb-liste { display: flex; flex-direction: column; gap: 0.15rem; margin-top: 0.15rem; }
.tb-btn {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 0.28rem 0.4rem; text-align: left;
  background: var(--cde-fill); color: var(--cde-text);
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm);
  cursor: pointer; font-size: var(--cde-font-xs);
}
.tb-btn:hover { border-color: var(--cde-accent-line); color: var(--cde-accent); }
.tb-btn--aus { opacity: 0.6; cursor: default; }
.tb-btn--aus:hover { border-color: var(--cde-line); color: var(--cde-text); }
.tb-feld { margin-left: auto; font-style: normal; color: var(--cde-text-dim); font-size: 0.68rem; }
.tb-nurfest { color: var(--cde-text-dim); }

.tb-gesperrt > summary {
  cursor: pointer; font-size: var(--cde-font-xs); color: var(--cde-text-dim); user-select: none;
}
.tb-nein {
  display: flex; flex-direction: column;
  padding: 0.25rem 0.4rem; font-size: var(--cde-font-xs); color: var(--cde-text-dim);
}
.tb-nein > em { font-style: normal; font-size: 0.68rem; opacity: 0.8; }
</style>
