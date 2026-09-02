<template>
  <div class="tb">
    <!-- GEOREFERENZ (Stufe 13.1). Ganz oben und IMMER sichtbar, weil sie am
         MODELL hängt und nicht an der Auswahl — und weil sie erklärt, worauf
         sich jede Höhe und jede Koordinate darunter bezieht. -->
    <details v-if="georeferenz" class="tb-geo">
      <summary>
        Georeferenz
        <span :class="['tb-stufe', 'tb-stufe--' + (georeferenz.stufe.wert >= 40 ? 'gut' : georeferenz.stufe.wert > 0 ? 'teil' : 'keine')]">
          {{ georeferenz.stufe.wert }}
        </span>
      </summary>
      <dl class="tb-kette">
        <dt>Lage</dt>
        <dd>{{ georeferenz.stufe.text }}</dd>

        <template v-if="georeferenz.crs">
          <dt>System</dt>
          <dd>
            <code>{{ georeferenz.crs.name || 'unbenannt' }}</code>
            <span class="tb-dim">{{ georeferenz.crs.beschreibung }}</span>
          </dd>
        </template>

        <template v-if="georeferenz.kartenbezug">
          <dt>Ursprung</dt>
          <dd class="tb-dim">
            O {{ georeferenz.kartenbezug.ost.toFixed(2) }} ·
            N {{ georeferenz.kartenbezug.nord.toFixed(2) }} ·
            H {{ georeferenz.kartenbezug.hoehe.toFixed(2) }}
          </dd>
        </template>

        <dt>Nord</dt>
        <dd class="tb-dim">
          {{ nordGrad }}° ({{ georeferenz.nordrichtung.quelle === 'TrueNorth' ? 'aus der Datei' : 'Vorgabe der Norm' }})
        </dd>

        <dt>Höhe</dt>
        <dd :class="hoehenbezug.warnung ? 'tb-warnung' : 'tb-dim'">
          {{ hoehenbezug.text }}
          <template v-if="hoehenbezug.raeume"><br>{{ hoehenbezug.raeume }}</template>
        </dd>

        <dt>Einheit</dt>
        <dd class="tb-dim">
          {{ georeferenz.einheit.name }}<template v-if="georeferenz.einheit.faktor !== 1"> × {{ georeferenz.einheit.faktor }}</template>
          <span v-if="georeferenz.einheit.quelle === 'angenommen'"> — nicht in der Datei</span>
        </dd>
      </dl>
      <p v-for="(b, i) in georeferenz.befunde" :key="i" class="tb-warnung">
        <CdeIcon name="warn" :size="12" /> {{ b.text ?? b }}
      </p>
    </details>

    <!-- DER MODUS. Er steht ganz oben und immer, weil er die Antwort auf
         „warum tut hier nichts etwas?" ist. Ausserhalb des Modus zeigt die
         Toolbox trotzdem die HERLEITUNG weiter — was an einem Bauteil möglich
         WÄRE, ist auch beim reinen Ansehen die interessanteste Auskunft. -->
    <button
      type="button"
      :class="['tb-modus', bearbeitung.modusAn && 'tb-modus--an']"
      @click="api.bearbeitenUmschalten?.()"
    >
      <CdeIcon :name="bearbeitung.modusAn ? 'edit' : 'visible'" :size="14" />
      <span class="tb-modus-text">
        <strong>{{ bearbeitung.modusAn ? 'Bearbeiten läuft' : 'Nur ansehen' }}</strong>
        <small>{{ bearbeitung.modusAn
          ? 'Änderungen gehen ins Journal. E beendet.'
          : 'Nichts ändert das Modell. E schaltet ein.' }}</small>
      </span>
    </button>

    <!-- OHNE AUSWAHL: was man ohne Subjekt tun kann. Eine leere Toolbox wäre
         die schlechteste Antwort — sie sähe kaputt aus. -->
    <template v-if="!bearbeitung.bauteil">
      <p class="tb-leer">
        Kein Bauteil gewählt. Anklicken zeigt, was daran möglich ist — und woher
        die CDE das weiß.
      </p>
      <!-- X3: Die toten Erzeugen-Kacheln sind gefallen — ein Satz genügt,
           die Knöpfe wohnen im Lageplan unter „Zeichnen". -->
      <h4 class="tb-kopf">Erzeugen</h4>
      <p class="tb-warum">
        Braucht kein Bauteil: im <strong>Lageplan</strong> unter
        „Zeichnen"{{ bearbeitung.modusAn ? '.' : ' — sobald Bearbeiten läuft.' }}
      </p>
    </template>

    <template v-else>
      <!-- Kopf: was ist das hier? -->
      <div class="tb-titel">
        <strong>{{ bearbeitung.bauteil.name || '(ohne Namen)' }}</strong>
        <code>{{ herleitung.kategorie }}</code>
      </div>

      <!-- WORAUF SICH DER KLICK BEZIEHT. Bei einer Rahmenauswahl ändert eine
           Bearbeitung womöglich fünfzehn Bauteile — das muss dastehen, bevor
           man klickt, nicht danach im Journal. -->
      <p v-if="mehrfach" class="tb-mehrfach">
        <CdeIcon name="layers" :size="12" />
        <span>
          <strong>{{ mehrfach.anzahl }} Bauteile gewählt.</strong>
          {{ mehrfach.text }}
        </span>
      </p>

      <!-- WAS DIE ACHSE SAGT (Stufe 14.2). Steht auch ohne Bearbeiten-Modus
           da: Sohlhöhen, Gefälle, Länge und DN sind beim reinen Ansehen die
           interessantesten Zahlen an einer Haltung — und bis eben gab es sie
           nirgends, weil die Achse gar nicht ankam. -->
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

      <!-- BEFUNDE (Stufe 14.4). Sie halten nichts auf — sie beraten. Deshalb
           stehen sie neben den Bearbeitungen, nicht davor, und auch ausserhalb
           des Bearbeiten-Modus: „das Gefälle läuft bergauf" ist beim reinen
           Ansehen genauso wichtig. -->
      <ul v-if="bearbeitung.befunde.length" class="tb-befunde">
        <li v-for="(b, i) in bearbeitung.befunde" :key="i" :class="'tb-b--' + b.schwere">
          <CdeIcon :name="b.schwere === 'warnung' ? 'warn' : 'info'" :size="12" />
          <span>
            {{ b.text }}
            <em class="tb-dim">
              {{ b.wert }}<template v-if="b.grenze"> · {{ b.grenze }}</template>
              <template v-if="b.quelle"> · {{ b.quelle }}</template>
            </em>
            <!-- DIE KUR. Wo ein Befund seine Antwort kennt, soll ein Klick
                 genügen — aus der Liste wird eine Arbeitsliste. Gesperrt
                 ausserhalb des Bearbeiten-Modus, wie jeder andere Knopf. -->
            <button
              v-if="b.kur && kurTitel(b)"
              class="tb-kur"
              :disabled="!bearbeitung.modusAn"
              :title="bearbeitung.modusAn ? 'Diese Bearbeitung scharf schalten'
                : 'Bearbeiten ist aus — oben einschalten (oder E)'"
              @click="bearbeitung.starteMitVorschlag(b.kur.bearbeitung, b.kur.werte ?? {})"
            >
              <CdeIcon name="edit" :size="11" /> {{ kurTitel(b) }}
            </button>
          </span>
        </li>
      </ul>

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
          <dd v-if="!herleitung.imWoerterbuch" class="tb-dim">
            nicht im IFC-4.3-Wörterbuch — die Vererbung greift hier nicht
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
        <p v-if="rueckmeldung" class="tb-rueckmeldung">{{ rueckmeldung }}</p>
        <section v-for="g in herleitung.gruppen" :key="g.art" class="tb-gruppe">
          <h4 class="tb-kopf">{{ g.titel }}</h4>
          <p class="tb-warum">{{ g.warum }}</p>
          <div class="tb-liste">
            <button
              v-for="b in g.eintraege"
              :key="b.id"
              class="tb-btn"
              :disabled="!bearbeitung.modusAn"
              :title="!bearbeitung.modusAn ? 'Bearbeiten ist aus — oben einschalten (oder E)'
                : b.nurFestlegung ? 'Wird als Festlegung geführt — die Geometrie bleibt beim Planer'
                : b.titel"
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
import { computed, ref } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import CdeBearbeitungForm from './ui/CdeBearbeitungForm.vue';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { useViewerApi } from '../composables/viewerApi.js';
import { herleite } from '../services/Herleitung.js';
import { ausGruppe, nachId, eingabeArt } from '../services/Bearbeitungen.js';
import { hatHoehenbezug, nnAusWelt } from '../services/Hoehenbezug.js';
import { formatGefaelle } from '../services/AxisAnnotations.js';
import { modellHerkunft } from '../services/IfcAutor.js';

const bearbeitung = useBearbeitung();
const cde = useCdeStore();
const ifc = useIfcStore();
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

/**
 * Die Georeferenz des geladenen Modells.
 *
 * Der Bezug auf `ifc.modelList` ist KEIN Zierrat: ohne eine reaktive
 * Abhängigkeit würde dieses `computed` genau einmal ausgewertet — womöglich
 * bevor überhaupt ein Modell geladen ist — und danach nie wieder. Es zeigte
 * dann für immer „keine Georeferenz".
 *
 * Bei mehreren Modellen die des ersten; welches „das" Bezugssystem ist,
 * entscheidet heute die Ladereihenfolge (bekannte Schwäche, Koordinaten.js).
 */
const georeferenz = computed(() => {
  void ifc.modelList.length;                       // reaktiver Anker
  const alle = api.getGeoreferenzen?.() ?? {};
  return Object.values(alle)[0] ?? null;
});

/**
 * Woher der Höhenversatz kommt — und ob er überhaupt gemessen wurde.
 *
 * Der Versatz entscheidet, ob die Leiste „H" als Höhe über NN oder als
 * Three-Welt-Y zeigt. Er wurde zweimal still falsch bestimmt, beide Male ohne
 * dass es der Anzeige anzusehen war. Deshalb steht hier, was passiert ist.
 */
const hoehenbezug = computed(() => {
  void ifc.modelList.length;                       // reaktiver Anker, wie oben
  const b = Object.values(api.getHoehenBefunde?.() ?? {})[0] ?? null;
  if (!b) return { text: 'nicht bestimmt', warnung: true };
  if (b.art === 'gemessen') {
    return {
      text: `Versatz ${b.wert.toFixed(3)} m — ${b.text}`,
      // Beide Räume, damit eine Höhe in der Leiste, die zu keinem passt,
      // sofort als anderes Problem erkennbar ist.
      raeume: `Datei ${b.datei.min.toFixed(1)}…${b.datei.max.toFixed(1)} m · `
            + `Viewer ${b.welt.min.toFixed(1)}…${b.welt.max.toFixed(1)} m`,
      warnung: false,
    };
  }
  return { text: `nicht bestimmt (${b.text})`, warnung: true };
});

/**
 * Was die Achse des gewählten Bauteils sagt — fertig formatiert.
 *
 * Die Rechnung gehört nicht in die Vorlage, und die Umrechnung nach m NN läuft
 * über dieselbe Stelle wie überall (`Hoehenbezug`). „Anfang" und „Ende" sind
 * nur bei einer EXAKTEN Achse belastbar; bei einer skelettierten ist die
 * Reihenfolge willkürlich, deshalb steht die Herkunft dabei.
 */
const achse = computed(() => {
  const roh = bearbeitung.bauteil?.achse;
  if (!roh?.anfang || !roh?.ende) return null;
  // Eine festgelegte Fliessrichtung gilt auch für die Anzeige — sonst stünde
  // hier weiter „läuft bergauf", während der Befund daneben verschwunden ist.
  const umgekehrt = bearbeitung.bauteil?.stand?.fliessrichtung === 'umgekehrt';
  const a = umgekehrt ? { ...roh, anfang: roh.ende, ende: roh.anfang } : roh;
  const v = bearbeitung.bauteil?.hoehenversatz ?? 0;
  const nn = (y) => nnAusWelt(y, v).toFixed(2);
  const gefaelle = umgekehrt && roh.gefaelle != null ? -roh.gefaelle : roh.gefaelle;
  return {
    umgekehrt,
    anfangNn: nn(a.anfang.y),
    endeNn: nn(a.ende.y),
    gefaelle: gefaelle == null ? 'waagerecht' : formatGefaelle(gefaelle),
    laenge: a.laenge?.toFixed(2) ?? '—',
    dn: a.dn ?? null,
    herkunft: a.quelle === 'extrusion' ? 'aus der Extrusion' : 'aus der Achs-Repräsentation',
  };
});

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
  const viele = herleitung.gruppen
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
const nordGrad = computed(() =>
  ((georeferenz.value?.nordrichtung?.rad ?? 0) * 180 / Math.PI).toFixed(2));

const herleitung = computed(() => herleite({
  el: bearbeitung.bauteil,
  einordnung: bearbeitung.einordnung,
  profilSatz: bearbeitung.profilSatz,
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
  // Zug- und Umriss-Bearbeitungen werden im LAGEPLAN gefüttert — das
  // Formular hier kann sie nicht abschliessen. Ohne den Hinweis sähe der
  // Kur-Knopf zu `loses_ende` aus wie ein toter Knopf (Gesetz 10).
  const art = eingabeArt(bearbeitung.scharf);
  if (art === 'zug') return 'Im Lageplan zeichnen/antippen — dort wird diese Bearbeitung abgeschlossen.';
  if (art === 'umriss') return 'Im Lageplan den Umriss zeichnen — dort wird diese Bearbeitung abgeschlossen.';
  if (bearbeitung.scharf?.nurFestlegung) {
    return 'Wird als Festlegung geführt und geht in den Änderungsbericht — die Geometrie bleibt beim Planer.';
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
 * Übernehmen: eintragen UND anwenden.
 *
 * Das Eintragen allein reichte nicht — es schrieb ins Journal, und das Modell
 * rührte sich erst beim nächsten Laden. Eine gesetzte Sohlhöhe sah damit genau
 * so aus wie ein kaputter Knopf.
 *
 * Und die Rückmeldung gehört dazu: eine Festlegung, die das Autorenmodell
 * absichtlich NICHT anfasst (Querschnittsgröße, Stärke), sieht ohne sie
 * ebenfalls aus wie nichts. Richtiges Verhalten darf nicht wie kaputtes
 * aussehen.
 */
async function uebernehmen() {
  rueckmeldung.value = '';
  try {
    // `basis` und `modell` gehören zu jedem Eintrag, der das Modell berührt —
    // ohne sie ist der Drei-Wege-Vergleich abgeschaltet und eine Festlegung auf
    // ein selbst erzeugtes Bauteil unanwendbar.
    const el = bearbeitung.bauteil;
    const eintrag = await bearbeitung.ausfuehren({
      wer: cde.bearbeiter || '',
      modellSha: api.getLoadedModelSha?.() ?? null,
      basis: el?.globalId ? api.lieferstandVon?.(el.globalId) : undefined,
      modell: el ? modellHerkunft(el.modelId) : undefined,
    });
    if (!eintrag) { rueckmeldung.value = bearbeitung.letzterGrund || 'Nichts eingetragen.'; return; }

    const r = await api.wendeEintragAn?.(eintrag);
    rueckmeldung.value = !r ? 'Eingetragen.'
      : r.angewandt ? 'Übernommen.'
      : r.nurFestlegung ? 'Als Festlegung geführt — die Geometrie bleibt beim Planer.'
      : `Eingetragen, aber nicht angewandt: ${r.grund ?? 'unbekannt'}`;
  } catch (fehler) {
    // GESETZ 10: kein stilles Scheitern. Ohne diesen Fänger starb ein
    // geworfener Fehler als unhandled rejection — der Knopf sah tot aus,
    // und genau so wurde er gemeldet (2026-09-02).
    console.error('cde: uebernehmen', fehler);
    rueckmeldung.value = `Fehler: ${fehler?.message ?? fehler}`;
  }
}
</script>

<style scoped>
.tb { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.2rem 0 0.6rem; }

/* Der Modus-Schalter: im Ruhezustand zurückhaltend, im Bearbeiten-Modus
   deutlich — man soll ohne Hinsehen wissen, ob Klicks etwas verändern. */
.tb-modus {
  display: flex; align-items: center; gap: 0.5rem; width: 100%;
  padding: 0.4rem 0.55rem; text-align: left; cursor: pointer;
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm);
  background: var(--cde-fill); color: var(--cde-text);
}
.tb-modus:hover { border-color: var(--cde-line-strong); }
.tb-modus-text { display: flex; flex-direction: column; line-height: 1.25; }
.tb-modus-text strong { font-size: var(--cde-font-sm); }
.tb-modus-text small { font-size: var(--cde-font-xs); color: var(--cde-text-dim); }
.tb-modus--an {
  border-color: var(--cde-accent);
  background: var(--cde-accent-fill);
}
.tb-modus--an .tb-modus-text small { color: var(--cde-text); }

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

.tb-geo {
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius-sm);
  padding: 0.35rem 0.45rem;
  background: var(--cde-fill);
}
.tb-geo > summary {
  cursor: pointer; font-size: var(--cde-font-xs);
  color: var(--cde-text-dim); user-select: none;
  display: flex; align-items: center; gap: 0.35rem;
}
.tb-stufe {
  margin-left: auto; padding: 0 0.3rem;
  border-radius: var(--cde-radius-sm); font-weight: 600;
}
.tb-stufe--gut   { background: var(--cde-accent-fill-hi); color: var(--cde-success-strong); }
.tb-stufe--teil  { background: var(--cde-accent-fill-hi); color: var(--cde-warn); }
.tb-stufe--keine { background: var(--cde-danger-fill); color: var(--cde-danger); }

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
