<template>
  <!-- Die Tafel „Bauteil“ (Kassensturz H2). Vorher zwei Tafeln — „Toolbox“ und
       „Eigenschaften“ —, die sich gegenseitig aus der Leiste verdrängten.
       Reihenfolge nach der Regel „erst die Handlung, dann die Erklärung“:
       Werkzeuge, Achse, Befunde, Merkmale; „Warum?“ und das Modell zugeklappt. -->
  <div class="tb">
    <!-- OHNE AUSWAHL: was man ohne Subjekt tun kann. Eine leere Tafel sähe kaputt aus. -->
    <template v-if="!bearbeitung.bauteil">
      <!-- Ein Zeichenwerkzeug läuft ohne Auswahl: was es tut, und der Ausgang. -->
      <div v-if="bearbeitung.scharf" class="tb-scharf">
        <p class="tb-scharf-titel">
          <CdeIcon :name="bearbeitung.scharf.icon || 'edit'" :size="13" /> {{ bearbeitung.scharf.titel }}
        </p>
        <p class="tb-warum">Punkte ins Gelände setzen — Enter schliesst ab, Esc bricht ab. Die Felder stehen unten in der Leiste.</p>
        <p v-if="rueckmeldung" class="tb-rueckmeldung">{{ rueckmeldung }}</p>
        <button v-if="bearbeitung.scharf.rezept" class="tb-btn" type="button" @click="vorlageSichern">
          <CdeIcon name="save" :size="13" /> <span>Als Vorlage sichern …</span>
        </button>
        <button class="tb-btn tb-btn--aus" type="button" @click="bearbeitung.abbrechen()">Abbrechen</button>
      </div>
      <template v-else>
        <p class="tb-leer">
          Kein Bauteil gewählt. Ein Klick ins Modell zeigt, was daran möglich ist.
        </p>
        <!-- ERZEUGEN (Abnahme 2026-09-12, E8): gezeichnet wird im 3D, auf dem
             Gelände in der Draufsicht — der Lageplan ist das Blatt. -->
        <h4 class="tb-kopf">Erzeugen</h4>
        <p class="tb-warum">Im Bild auf das Gelände: Punkte anklicken, Enter schliesst ab. Das Bild geht dafür in die Draufsicht.</p>
        <p v-if="rueckmeldung" class="tb-rueckmeldung">{{ rueckmeldung }}</p>
        <p v-if="sperrgrund" class="tb-sperre">
          <CdeIcon name="warn" :size="12" /> {{ sperrgrund }}
        </p>
        <div class="tb-liste">
          <button
            v-for="b in zeichenWerkzeuge"
            :key="b.id"
            class="tb-btn"
            :disabled="!!sperrgrund"
            :title="sperrgrund || b.titel"
            @click="zeichnen(b.id)"
          >
            <CdeIcon :name="b.icon" :size="13" />
            <span>{{ b.titel }}</span>
          </button>
        </div>
        <!-- Bauteilbibliothek (Lücke ⑨): Vorlagen = Rezept + vorbelegte Werte.
             Projekt schlägt Büro schlägt eingebauten Satz. -->
        <template v-if="vorlagen.length">
          <h4 class="tb-kopf">Vorlagen</h4>
          <div class="tb-liste">
            <div v-for="v in vorlagen" :key="v.id" class="tb-vorlage">
              <button
                class="tb-btn"
                :disabled="!!sperrgrund"
                :title="sperrgrund || `${v.name} — ${VORLAGE_HERKUNFT[v.herkunft] ?? 'Vorlage'}`"
                @click="vorlageZeichnen(v)"
              >
                <CdeIcon :name="rezeptNach(v.rezept)?.icon ?? 'route'" :size="13" />
                <span>{{ v.name }}</span>
              </button>
              <button
                v-if="v.herkunft !== 'eingebaut'"
                class="tb-vorlage-weg"
                type="button"
                :title="`Vorlage löschen (${v.herkunft === 'buero' ? 'Büro' : 'Projekt'})`"
                aria-label="Vorlage löschen"
                @click="vorlageEntfernen(v)"
              ><CdeIcon name="delete" :size="11" /></button>
            </div>
          </div>
        </template>
        <!-- KATALOG (Teil XXIII, A5): was aus Büro oder Projekt NICHT gilt, weil
             es die Prüfung nicht besteht — sonst wirkte es still als
             „Werkzeug erscheint nie". -->
        <template v-if="bearbeitung.katalogBefunde.length">
          <h4 class="tb-kopf">Katalog</h4>
          <p class="tb-warum">Diese Einträge gelten nicht — sie sind fehlerhaft:</p>
          <ul class="tb-katalog">
            <li v-for="(b, i) in bearbeitung.katalogBefunde" :key="`${b.art}|${b.id}|${i}`">
              <strong>{{ KATALOG_ART[b.art] ?? b.art }} „{{ b.id ?? '?' }}"</strong>
              <span class="tb-katalog-ebene">{{ KATALOG_EBENE[b.ebene] ?? 'Büro oder Projekt' }}</span>
              — {{ b.fehler.join(' ') }}
            </li>
          </ul>
        </template>
      </template>
    </template>

    <template v-else>
      <!-- Kopf: was ist das hier? -->
      <div class="tb-titel">
        <strong>{{ bearbeitung.bauteil.name || '(ohne Namen)' }}</strong>
        <code>{{ herleitung.kategorie }}</code>
      </div>

      <!-- WORAUF SICH DER KLICK BEZIEHT. Bei einer Rahmenauswahl ändert eine
           Bearbeitung womöglich fünfzehn Bauteile — das muss dastehen, bevor
           man klickt, nicht danach im Verlauf. -->
      <p v-if="mehrfach" class="tb-mehrfach">
        <CdeIcon name="layers" :size="12" />
        <span>
          <strong>{{ mehrfach.anzahl }} Bauteile gewählt.</strong>
          {{ mehrfach.text }}
        </span>
      </p>

      <!-- Die scharfe Bearbeitung verdrängt die Liste — ihr FORMULAR steht nur
           in der Kontextleiste unter dem Bild (Teil XVI, S6). Hier bleibt, was
           die Tafel weiss: was die Bearbeitung bewirkt, und der Ausgang. -->
      <div v-if="bearbeitung.scharf" class="tb-scharf">
        <p class="tb-scharf-titel">
          <CdeIcon :name="bearbeitung.scharf.icon || 'edit'" :size="13" /> {{ bearbeitung.scharf.titel }}
          <span v-if="bearbeitung.bauteil?.name" class="tb-scharf-subjekt">{{ bearbeitung.bauteil.name }}</span>
        </p>
        <p v-if="festlegungsHinweis" class="tb-hinweis">{{ festlegungsHinweis }}</p>
        <p class="tb-warum">Eingabe unten in der Leiste — Griffe im Bild ziehen dieselben Felder.</p>
        <p v-if="rueckmeldung" class="tb-rueckmeldung">{{ rueckmeldung }}</p>
        <button v-if="bearbeitung.scharf.rezept" class="tb-btn" type="button" @click="vorlageSichern">
          <CdeIcon name="save" :size="13" /> <span>Als Vorlage sichern …</span>
        </button>
        <button class="tb-btn tb-btn--aus" type="button" @click="bearbeitung.abbrechen()">Abbrechen</button>
      </div>

      <!-- DIE WERKZEUGE ZUERST. Ein Werkzeug wählen heißt bearbeiten (E4):
           grau ist ein Knopf nur mit einem echten Grund — und der steht da. -->
      <template v-else>
        <p v-if="rueckmeldung" class="tb-rueckmeldung">{{ rueckmeldung }}</p>
        <p v-if="sperrgrund" class="tb-sperre">
          <CdeIcon name="warn" :size="12" /> {{ sperrgrund }}
        </p>
        <!-- ECKEN ZIEHEN (Teil XXII, Fabio 2026-09-18: „nur in der Bearbeitung,
             nur als Knopf, dann an allen Ecken"): ohne diesen Knopf trägt ein
             Erdkörper keine Griffe. -->
        <section v-if="eckenMoeglich" class="tb-gruppe">
          <h4 class="tb-kopf" title="Oberkante, Sohle bzw. Fuss und Krone — jede Ecke mit Führungslinien">Ecken</h4>
          <div class="tb-liste">
            <button v-if="!eckenAktiv" class="tb-btn" :disabled="!!sperrgrund" :title="sperrgrund || 'Griffe an allen Ecken dieses Körpers'"
                    @click="eckenZiehen">
              <CdeIcon name="pointer" :size="13" /> <span>Ecken ziehen</span>
            </button>
            <button v-else class="tb-btn tb-btn--aus" type="button" @click="bearbeitung.eckenBeenden()">
              <CdeIcon name="check" :size="13" /> <span>Fertig</span>
            </button>
          </div>
          <p v-if="eckenAktiv" class="tb-warum">
            Jede Ecke im Bild ziehen — die Linien fangen an Kanten, rechten Winkeln und Fluchten. Der kleine Griff daneben ändert die Höhe; an der Sohle (Krone) gilt sie für den ganzen Körper.
          </p>
        </section>
        <section v-for="g in herleitung.gruppen" :key="g.art" class="tb-gruppe">
          <h4 class="tb-kopf" :title="g.warum">{{ g.titel }}</h4>
          <div class="tb-liste">
            <button
              v-for="b in g.eintraege"
              :key="b.id"
              class="tb-btn"
              :disabled="!!sperrgrund"
              :title="sperrgrund || (b.nurFestlegung ? 'Geht als Forderung an den Planer — die Geometrie bleibt bei ihm' : b.titel)"
              @click="werkzeug(b.id)"
            >
              <CdeIcon :name="b.icon" :size="13" />
              <span>{{ b.titel }}</span>
              <!-- Die Beschriftung, die DIESER Typ dem Feld gibt: „DN“ am Rohr,
                   „Profilreihe“ am Träger — das Vokabular kommt aus Daten. -->
              <em v-if="b.felder.length" class="tb-feld">{{ b.felder.map(f => f.label).join(', ') }}</em>
              <CdeIcon v-if="b.nurFestlegung" name="documents" :size="11" class="tb-nurfest" />
            </button>
          </div>
        </section>
      </template>

      <!-- WAS DIE ACHSE SAGT (Stufe 14.2): Sohlhöhen, Gefälle, Länge und DN —
           beim reinen Ansehen die interessantesten Zahlen an einer Haltung. -->
      <dl v-if="achse" class="tb-kette tb-achse">
        <dt>Sohle</dt>
        <dd>
          <b>{{ achse.anfangNn }}</b> → <b>{{ achse.endeNn }}</b> m NN
          <span class="tb-dim">({{ achse.gefaelle }})</span>
        </dd>
        <dt>Länge</dt>
        <dd class="tb-dim">
          {{ achse.laenge }} m<template v-if="achse.dn"> · DN {{ achse.dn }}</template>
          <span class="tb-dim"> — {{ achse.herkunft }}</span>
          <template v-if="achse.umgekehrt"><br>Fliessrichtung umgekehrt festgelegt</template>
        </dd>
      </dl>

      <!-- BEFUNDE (Stufe 14.4). Sie beraten; wo einer seine Kur kennt, genügt
           ein Klick — aus der Liste wird eine Arbeitsliste. -->
      <ul v-if="bearbeitung.befunde.length" class="tb-befunde">
        <li v-for="(b, i) in bearbeitung.befunde" :key="i" :class="'tb-b--' + b.schwere">
          <CdeIcon :name="b.schwere === 'warnung' ? 'warn' : 'info'" :size="12" />
          <span>
            {{ b.text }}
            <em class="tb-dim">
              {{ b.wert }}<template v-if="b.grenze"> · {{ b.grenze }}</template>
              <template v-if="b.quelle"> · {{ b.quelle }}</template>
            </em>
            <button
              v-if="b.kur && kurTitel(b)"
              class="tb-kur"
              :disabled="!!sperrgrund"
              :title="sperrgrund || 'Diese Bearbeitung starten'"
              @click="kur(b)"
            >
              <CdeIcon name="edit" :size="11" /> {{ kurTitel(b) }}
            </button>
          </span>
        </li>
      </ul>

      <!-- MERKMALE — vorher eine eigene Tafel („Eigenschaften“). -->
      <details class="tb-merkmale" open>
        <summary>Merkmale</summary>
        <IfcSemanticWindow eingebettet />
      </details>

      <!-- WARUM? Die Herleitung beantwortet „woher weiß die CDE, was hier geht?“ —
           zugeklappt, weil sie erklärt und nicht handelt. -->
      <details class="tb-herleitung">
        <summary>Warum diese Werkzeuge?</summary>

        <dl class="tb-kette">
          <dt>Form</dt>
          <dd>
            <strong>{{ herleitung.bauformTitel }}</strong>
            <span class="tb-dim">aus {{ QUELLE_TEXT[herleitung.quelle] ?? herleitung.quelle }}</span>
            <span v-if="herleitung.regel" class="tb-dim">· Regel „{{ herleitung.regel }}“</span>
          </dd>

          <dt>Güte</dt>
          <dd>
            <span :class="['tb-guete', 'tb-guete--' + herleitung.guete]">{{ herleitung.guete }}</span>
            <span class="tb-dim">{{ GUETE_TEXT[herleitung.guete] }}</span>
          </dd>

          <!-- WAS GEMESSEN WURDE: ohne Deklaration schlägt die Formsignatur vor;
               ein Klick macht den Vorschlag zur Auslegung. -->
          <template v-if="herleitung.grund && (herleitung.quelle === 'geometrie' || herleitung.quelle === 'rueckfall')">
            <dt>Gemessen</dt>
            <dd>
              <span class="tb-dim">{{ herleitung.grund }}</span>
              <button
                v-if="herleitung.quelle === 'geometrie'"
                class="tb-kur tb-bestaetigen"
                :disabled="!!sperrgrund"
                :title="sperrgrund || `Als Auslegung übernehmen — ab dann gilt ${herleitung.bauformTitel} für dieses Bauteil`"
                @click="auslegen"
              >
                <CdeIcon name="bauform" :size="11" /> Als Auslegung übernehmen
              </button>
            </dd>
          </template>

          <dt>Typprofil</dt>
          <dd v-if="herleitung.profilAus">
            <code>{{ herleitung.profilAus }}</code>
            <span v-if="herleitung.profilUeberVererbung" class="tb-erbt">geerbt</span>
            <span class="tb-dim">kennt {{ herleitung.rollen.join(', ') }}</span>
          </dd>
          <dd v-else class="tb-dim">keins — es gelten nur die allgemeinen Bearbeitungen</dd>
          <!-- ENTWURF aus den bSI-Vorlagen (Teil XXIII, A5, S6): Rollen, die das
               geltende Profil nicht kennt. Wirkt erst nach dem Übernehmen. -->
          <dd v-if="entwurf" class="tb-entwurf">
            <span class="tb-dim">Entwurf aus den bSI-Vorlagen:</span>
            <span v-for="(f, rolle) in entwurf.felder" :key="rolle" class="tb-entwurf-feld" :title="f.quelle">
              {{ f.label }} <code>{{ f.quelle }}</code>
            </span>
            <button
              class="tb-kur tb-bestaetigen"
              type="button"
              :disabled="entwurfLaeuft"
              :title="`Als Typprofil für ${entwurf.kategorie} übernehmen — ab dann fragen die Werkzeuge danach`"
              @click="entwurfUebernehmen"
            ><CdeIcon name="check" :size="11" /> Übernehmen</button>
            <span v-if="entwurfMeldung" class="tb-dim">{{ entwurfMeldung }}</span>
          </dd>

          <dt>Vererbung</dt>
          <dd v-if="!herleitung.imWoerterbuch" class="tb-dim">
            in keinem IFC-Schema (2x3, 4, 4.3) — die Vererbung greift hier nicht
          </dd>
          <dd v-else class="tb-hierarchie">
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

      <details v-if="herleitung.gesperrt.length" class="tb-gesperrt">
        <summary>Hier nicht möglich ({{ herleitung.gesperrt.length }})</summary>
        <!-- „Steht nicht in der Liste“ ist die schlechteste Rückmeldung: der
             Nutzer weiß nicht, ob das Werkzeug fehlt, sein Modell zu schlecht
             ist oder er etwas falsch macht. -->
        <div v-for="b in herleitung.gesperrt" :key="b.id" class="tb-nein">
          <span>{{ b.titel }}</span>
          <em>{{ b.warum }}</em>
        </div>
      </details>
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
 *   Weil das Bauteil es hat        → Typprofil, Rezept oder Regel nennen die Eigenschaft (Daten)
 *
 * Die Rechnung selbst steht in `services/Herleitung.js` und ist rein — diese
 * Datei zeigt sie nur an. Das ist Absicht: die Antwort auf „woher weiß das
 * Programm das" darf nicht in einer Vorlage stehen, sonst lässt sie sich nicht
 * prüfen.
 */
import { computed, onMounted, ref, watch } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { useViewerApi } from '../composables/viewerApi.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import { repo } from '../services/RepoFacade.js';
import { ladeVorlagen, speichereVorlage, loescheVorlage } from '../services/Bibliothek.js';
import { entwurfFuer } from '../services/bauform/Typprofilentwurf.js';
import { herleite } from '../services/Herleitung.js';
import { ausGruppe, nachId, eingabeArt } from '../services/Bearbeitungen.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { hatHoehenbezug } from '../services/Hoehenbezug.js';
import { achsAnzeige } from '../services/Achsanzeige.js';
import { hatErdbauEcken } from '../services/Griffe.js';
import IfcSemanticWindow from './IfcSemanticWindow.vue';

const bearbeitung = useBearbeitung();
const ifc = useIfcStore();
const api = useViewerApi();

// Der Katalog lebt: ein Rezept aus der Bibliothek bringt sein Zeichenwerkzeug
// mit (Teil XXIII, A5). `katalogStand` wandert mit jeder Registrierung.
const zeichenWerkzeuge = computed(() => (void bearbeitung.katalogStand, ausGruppe('erzeugen')));

/** Was beim Katalogladen abgewiesen wurde — gemeldet, nicht still verworfen (A5, S8). */
const KATALOG_ART = Object.freeze({ rezept: 'Rezept', typprofil: 'Typprofil', bauformregel: 'Bauformregel', vorlage: 'Vorlage',
                                   symbol: 'Plansymbol', regel: 'Regelwerk' });
const KATALOG_EBENE = Object.freeze({ buero: 'Büro', projekt: 'Projekt' });

const QUELLE_TEXT = Object.freeze({
  bauplan:    'dem eigenen Rezept',
  einzelfall: 'einer Auslegung für dieses Bauteil',
  regel:      'einer Büroregel',
  typprofil:  'dem Typprofil',
  geometrie:  'der Geometrie',
  rueckfall:  'keiner Angabe (Rückfall)',
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

/**
 * Was die Achse des gewählten Bauteils sagt — fertig formatiert.
 *
 * Die Rechnung gehört nicht in die Vorlage, und die Umrechnung nach m NN läuft
 * über dieselbe Stelle wie überall (`Hoehenbezug`). „Anfang" und „Ende" sind
 * nur bei einer EXAKTEN Achse belastbar; bei einer skelettierten ist die
 * Reihenfolge willkürlich, deshalb steht die Herkunft dabei.
 */
const achse = computed(() => achsAnzeige(bearbeitung.bauteil?.achse, {
  // Eine festgelegte Fliessrichtung gilt auch für die Anzeige — sonst stünde
  // hier weiter „läuft bergauf", während der Befund daneben verschwunden ist.
  umgekehrt: bearbeitung.bauteil?.stand?.fliessrichtung === 'umgekehrt',
  hoehenversatz: bearbeitung.bauteil?.hoehenversatz ?? 0,
}));

/**
 * Wie die Kur eines Befunds heisst — aus dem KATALOG, nicht aus der Tabelle.
 *
 * Die Zuordnung in `Befunde.js` nennt nur die Id; der Titel steht dort, wo die
 * Bearbeitung lebt. Zwei Stellen mit demselben Namen liefen auseinander, und
 * dann hiesse derselbe Knopf an zwei Orten verschieden. Kennt der Katalog die
 * Id nicht, entfällt der Knopf — ein Werkzeug, das es nicht gibt, wird nicht
 * angeboten.
 */
function kurTitel(befund) {
  return nachId(befund?.kur?.bearbeitung)?.titel ?? null;
}

/**
 * Die Auskunft zur Mehrfachauswahl — und welche Werkzeuge sie überhaupt trifft.
 *
 * Nicht jede Bearbeitung darf auf viele: fünf Schächte auf denselben
 * Rechtswert zu schieben legt sie übereinander. Der Katalog sagt mit
 * `mehrfach`, welche es dürfen; hier wird es gezählt und benannt, damit
 * niemand raten muss, was ein Klick anrichtet.
 */
const mehrfach = computed(() => {
  const n = bearbeitung.bauteile.length;
  if (n < 2) return null;
  // `herleitung` ist eine Computed — im Skript braucht sie `.value` (im
  // Template nicht). Ohne stand hier `undefined.flatMap`: JEDE Mehrfachauswahl
  // riss seit 14.10 die Toolbox beim Rendern (Headless-Befund B2, 2026-09-08).
  const viele = (herleitung.value?.gruppen ?? [])
    .flatMap(g => g.eintraege)
    .filter(e => nachId(e.id)?.mehrfach)
    .map(e => e.titel);
  return {
    anzahl: n,
    text: viele.length
      ? `Auf alle wirken: ${viele.join(', ')}. Alles Übrige nur auf „${bearbeitung.bauteil.name || 'das erste'}".`
      : 'Keines der angebotenen Werkzeuge wirkt auf mehrere — jedes trifft nur das erste.',
  };
});

/** Nordrichtung in Grad — die Umrechnung gehört nicht in die Vorlage. */

/** Der Typprofil-Entwurf für die Klasse des gewählten Bauteils — oder null (A5, S6). */
const entwurf = computed(() => (bearbeitung.bauteil
  ? entwurfFuer(herleitung.value.kategorie ?? bearbeitung.bauteil.category, bearbeitung.profilSatz) : null));
const entwurfLaeuft = ref(false);
const entwurfMeldung = ref('');
async function entwurfUebernehmen() {
  if (!entwurf.value) return;
  entwurfLaeuft.value = true;
  try {
    const r = await bearbeitung.entwurfUebernehmen(entwurf.value.kategorie);
    entwurfMeldung.value = r.ok ? `übernommen (${r.ebene === 'projekt' ? 'Projekt' : 'Büro'})` : r.grund;
  } finally {
    entwurfLaeuft.value = false;
  }
}

const herleitung = computed(() => herleite({
  el: bearbeitung.bauteil,
  einordnung: bearbeitung.einordnung,
  profilSatz: bearbeitung.profilSatz,
  // Derselbe Kontext wie `bearbeitung.moeglich` — sonst zeigte die Toolbox
  // einen Knopf, den der Store dann ablehnt (AE).
  kontext: bearbeitung.passendeKontext,
}));

/**
 * Was die scharfe Bearbeitung bewirkt — und was nicht.
 *
 * Der Höhenhinweis ist kein Beiwerk: ein Feld „Sohlhöhe [m NN]" behauptet einen
 * Höhenbezug. Hat das Modell keinen (Versatz 0), ist der Wert eine Zahl über
 * dem Modellursprung und nicht über NN — das muss dastehen, sonst trägt jemand
 * eine Planhöhe ein und wundert sich.
 */
const festlegungsHinweis = computed(() => {
  // Zug- und Umriss-Bearbeitungen werden im BILD gefüttert — das Formular
  // hier kann sie nicht abschliessen. Ohne den Hinweis sähe der Kur-Knopf zu
  // `loses_ende` aus wie ein toter Knopf (Gesetz 10). (Bis `c8ce9c4` stand
  // hier „im Lageplan"; gezeichnet wird seitdem nur im 3D.)
  const art = eingabeArt(bearbeitung.scharf);
  if (art === 'zug') return 'Im Bild auf das Gelände tippen — dort wird diese Bearbeitung abgeschlossen.';
  if (art === 'umriss') return 'Im Bild den Umriss zeichnen — der erste Punkt schliesst ihn.';
  if (bearbeitung.scharf?.nurFestlegung) {
    return 'Wird als Forderung an den Planer geführt und geht in den Änderungsbericht — die Geometrie bleibt bei ihm.';
  }
  const brauchtHoehe = bearbeitung.scharf?.brauchtRolle === 'sohlhoehe';
  if (brauchtHoehe && !hatHoehenbezug(bearbeitung.bauteil?.hoehenversatz)) {
    return 'Kein Höhenbezug im Modell — der Wert zählt ab Modellursprung, nicht ab NN.';
  }
  return '';
});

/** Was die letzte Bearbeitung bewirkt hat — der Nutzer muss es SEHEN. */
const rueckmeldung = ref('');

/**
 * Warum ein Werkzeug gerade nicht startet — nur ein ECHTER Grund: kein
 * Modell, Millimeter, ein Published-Stand. „Bearbeiten ist aus“ ist keiner
 * mehr (Kassensturz E4): ein Werkzeug wählen schaltet die Bearbeitung ein.
 */
const sperrgrund = computed(() => (bearbeitung.modusAn ? null : (api.bearbeitenSperrgrund?.() ?? null)));

/** Ein Werkzeug starten — über den Viewer, der die Bearbeitung einschaltet. */
function werkzeug(id, vorschlag = null) {
  rueckmeldung.value = '';
  const ok = api.werkzeugStarten?.(id, vorschlag ? { vorschlag } : {});
  if (ok !== undefined) return ok;
  // Ohne Viewer (früher Aufbau, Tests): der Store allein — ohne Modus weist er ab.
  return vorschlag ? bearbeitung.starteMitVorschlag(id, vorschlag) : bearbeitung.starte(id);
}
function kur(befund) { return werkzeug(befund.kur.bearbeitung, befund.kur.werte ?? {}); }

/** „Ecken ziehen" (Teil XXII): nur an Erdkörpern mit Ecken, nur über diesen Knopf. */
const eckenMoeglich = computed(() => hatErdbauEcken(bearbeitung.bauteil?.stand?.bauplan));
const eckenAktiv = computed(() => !!bearbeitung.eckenFuer && bearbeitung.eckenFuer === bearbeitung.bauteil?.globalId);
function eckenZiehen() {
  rueckmeldung.value = '';
  const ok = api.eckenZiehen?.() ?? bearbeitung.eckenStarten(bearbeitung.bauteil?.globalId);
  if (!ok) rueckmeldung.value = bearbeitung.letzterGrund || 'Ecken ziehen liess sich gerade nicht starten.';
}
function auslegen() { return werkzeug('bauform-auslegen', { bauform: herleitung.value.bauform }); }

// ── Erzeugen im 3D (Abnahme 2026-09-12, E8) ────────────────────────────────
/** Ein Zeichenwerkzeug starten — über den Motor im Raum; Vorlagen belegen vor. */
function zeichnen(id, { vorlage = null } = {}) {
  rueckmeldung.value = '';
  const b = nachId(id);
  if (!b || !['zug', 'umriss'].includes(eingabeArt(b))) return werkzeug(id);
  const ok = api.zeichnenStarten?.(id, vorlage ? { vorlage } : {});
  if (ok === false) rueckmeldung.value = bearbeitung.letzterGrund || 'Zeichnen liess sich gerade nicht starten.';
  return ok;
}

// Bauteilbibliothek (Lücke ⑨ / Stufe 9.8) — zog mit dem Zeichnen aus dem Lageplan hierher.
const cde = useCdeStore();
const VORLAGE_HERKUNFT = Object.freeze({ eingebaut: 'eingebaute Vorlage', buero: 'Büro-Vorlage', projekt: 'Projekt-Vorlage' });
const vorlagen = ref([]);
async function vorlagenLaden() {
  try { vorlagen.value = await ladeVorlagen(repo); }
  catch (fehler) { console.warn('cde: vorlagen laden', fehler?.message ?? fehler); }
}
// Die Bibliothek hängt am Repo — das Backend steht erst nach der Auftragswahl fest.
onMounted(vorlagenLaden);
watch(() => cde.auftrag?.id, vorlagenLaden);
// Eine Vorlage kann ein Rezept der Bibliothek nennen — gültig erst, wenn es registriert ist.
watch(() => bearbeitung.katalogStand, vorlagenLaden);
function vorlageZeichnen(v) { return zeichnen(`${v.rezept}-zeichnen`, { vorlage: v }); }

/**
 * Die WERTE des scharfen Zeichenwerkzeugs als Vorlage sichern. Bezeichnung
 * und Höhe bleiben draußen — sie gehören zum einzelnen Bauteil, nicht zur
 * Vorlage (ein „Schacht DN 1000" hat keine feste Sohlhöhe).
 */
async function vorlageSichern() {
  const scharf = bearbeitung.scharf;
  if (!scharf?.rezept) return;
  const name = prompt('Name der Vorlage:', scharf.titel?.replace(' zeichnen', '') ?? '');
  if (!name?.trim()) return;
  const vorgaben = {};
  for (const [feld, wert] of Object.entries(bearbeitung.werte ?? {})) {
    // `vorlage` ist die HERKUNFT des gerade Gezeichneten (A1), keine Vorgabe —
    // eine neue Vorlage darf nicht auf die alte zeigen.
    if (feld === 'name' || feld === 'hoehe' || feld === 'vorlage') continue;
    if (['string', 'number', 'boolean'].includes(typeof wert) && wert !== '') vorgaben[feld] = wert;
  }
  const ebene = repo.buero && confirm('Für ALLE Projekte sichern (Büro-Ebene)?\n„Abbrechen" sichert nur in diesem Projekt.')
    ? 'buero' : 'projekt';
  const r = await speichereVorlage(repo, { name: name.trim(), rezept: scharf.rezept, vorgaben }, { ebene });
  if (!r.ok) console.warn('cde: vorlage sichern', r.grund);
  await vorlagenLaden();
}

async function vorlageEntfernen(v) {
  if (v.herkunft === 'eingebaut') return;
  if (!confirm(`Vorlage „${v.name}" löschen?`)) return;
  await loescheVorlage(repo, v.id, { ebene: v.herkunft });
  await vorlagenLaden();
}

</script>

<style scoped>
.tb { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.2rem 0 0.6rem; }

/* Kassensturz H2: ein echter Sperrgrund steht als Zeile da, nicht nur im Tooltip. */
.tb-sperre {
  display: flex; align-items: flex-start; gap: 0.35rem;
  margin: 0; padding: 0.35rem 0.5rem;
  border-radius: var(--cde-radius-sm);
  background: color-mix(in srgb, var(--cde-warn) 12%, transparent);
  color: var(--cde-warn-soft);
  font-size: var(--cde-font-sm);
}
/* Die Merkmale — vorher eine eigene Tafel. */
.tb-merkmale { border-top: 1px solid var(--cde-line); padding-top: 0.35rem; }
.tb-merkmale > summary {
  cursor: pointer; padding: 0.2rem 0;
  font-size: var(--cde-font-sm); font-weight: 600; color: var(--cde-text-bright);
}


/* Ausserhalb des Modus bleiben die Bearbeitungen sichtbar — die Herleitung ist
   auch beim reinen Ansehen die interessanteste Auskunft. Sie sehen aber
   gesperrt aus, statt beim Klick eine Absage zu erzeugen. */
.tb-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Die Achszahlen stehen dicht am Kopf — sie beschreiben das Bauteil, nicht
   eine Bearbeitung. */
/* Die Mehrfach-Auskunft steht dicht am Kopf und ist ruhig — sie warnt nicht,
   sie sagt Bescheid. */
.tb-mehrfach {
  display: flex; gap: 0.35rem; align-items: flex-start; margin: 0;
  padding: 0.3rem 0.45rem; border-radius: var(--cde-radius-sm);
  background: var(--cde-accent-fill); font-size: var(--cde-font-xs); line-height: 1.35;
}

.tb-achse { margin: 0.1rem 0 0.2rem; }
.tb-achse b { font-weight: 600; }

/* Befunde: sichtbar, aber nicht laut. Sie beraten — wer ein Gefälle unter
   Mindestmass braucht, soll es setzen können, ohne angeschrien zu werden. */
.tb-befunde { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.tb-befunde li {
  display: flex; gap: 0.35rem; align-items: flex-start;
  padding: 0.3rem 0.4rem; border-radius: var(--cde-radius-sm);
  font-size: var(--cde-font-xs); line-height: 1.35;
  border-left: 2px solid var(--cde-line-strong);
  background: var(--cde-fill);
}
.tb-befunde em { display: block; font-style: normal; }
.tb-b--warnung { border-left-color: var(--cde-amber); }
.tb-b--hinweis { border-left-color: var(--cde-line-strong); }
.tb-kur {
  display: inline-flex; align-items: center; gap: 0.2rem; margin-top: 0.25rem;
  padding: 0.15rem 0.4rem; cursor: pointer;
  border: 1px solid var(--cde-line-strong); border-radius: var(--cde-radius-sm);
  background: var(--cde-fill); color: var(--cde-text); font: inherit;
  font-size: var(--cde-font-xs);
}
.tb-kur:hover:not(:disabled) { background: var(--cde-fill-hover); }
.tb-kur:disabled { opacity: 0.5; cursor: not-allowed; }
.tb-bestaetigen { margin-top: 0.25rem; }

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

.tb-rueckmeldung {
  margin: 0; padding: 0.3rem 0.4rem;
  font-size: var(--cde-font-xs); color: var(--cde-accent);
  background: var(--cde-accent-fill); border-radius: var(--cde-radius-sm);
}

/* ── Gruppen ───────────────────────────────────────────────────────────── */
.tb-gruppe { display: flex; flex-direction: column; gap: 0.2rem; }
.tb-kopf {
  margin: 0; font-size: var(--cde-font-xs); text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--cde-text-dim);
}
.tb-warum { margin: 0; font-size: 0.68rem; color: var(--cde-text-dim); }
.tb-katalog {
  margin: 0; padding-left: 1rem; font-size: 0.68rem; color: var(--cde-warn-soft);
  display: flex; flex-direction: column; gap: 0.2rem;
}
.tb-katalog-ebene { color: var(--cde-text-dim); }
.tb-entwurf { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; }
.tb-entwurf-feld { font-size: 0.68rem; color: var(--cde-text); }
.tb-vorlage { display: flex; align-items: center; gap: 0.2rem; }
.tb-vorlage > .tb-btn { flex: 1; min-width: 0; }
.tb-vorlage-weg {
  background: none; border: none; border-radius: var(--cde-radius-sm);
  padding: 0.3rem; color: var(--cde-text-dim); cursor: pointer;
  touch-action: manipulation;
}
.tb-vorlage-weg:hover { color: var(--cde-danger); background: var(--cde-fill); }
/* Die scharfe Bearbeitung — ohne Formular (das steht in der Leiste). */
.tb-scharf { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.4rem 0; }
.tb-scharf-titel { margin: 0; display: flex; align-items: center; gap: 0.35rem; font-weight: 600; color: var(--cde-text); }
.tb-scharf-subjekt { color: var(--cde-text-dim); font-weight: 400; }
.tb-btn--aus { align-self: flex-start; }
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

/* T1 (Tablet-Pass): Fingerziele — Listenzeilen wachsen WIRKLICH (die Spalte
   scrollt ohnehin). Unsichtbare Trefferflächen wären hier falsch: in einer
   dichten Liste überlappten sie, und der untere Knopf gewönne jeden Streit. */
.tb-btn, .tb-kur, .tb-modus { touch-action: manipulation; }
@media (pointer: coarse) {
  .tb-btn { padding: 0.6rem 0.5rem; }
  .tb-kur { padding: 0.45rem 0.6rem; }
}
</style>
