<template>
  <div class="ae-tab cde-card">
    <CdeCardHeader
      icon="verlauf"
      titel="Versionen"
      :zusatz="ae.anzahl ? bauteileText(ae.beruehrteBauteile) : ''"
    >
      <CdeIconButton
        icon="export"
        titel="Änderungsbericht als PDF — die Forderung an den Planer (ISO 19650)"
        :disabled="!ae.anzahl"
        @click="berichtErzeugen"
      />
      <CdeIconButton
        icon="undo"
        titel="Rückgängig — der letzte Schritt der Bearbeitung, sonst die neueste Version"
        :disabled="!ae.kannZurueck"
        @click="zurueck"
      />
    </CdeCardHeader>

    <!-- Mehrbenutzer-Wächter (Lücke ⑥): das Sichern wurde verweigert, weil
         auf dem Server ein neuerer, FREMDER Stand liegt. Nichts wurde
         überschrieben — weder die fremde Arbeit noch die eigene; die eigene
         lebt nur noch lokal, bis neu geladen wird. -->
    <div v-if="ae.schreibKonflikt" class="ae-schreibkonflikt">
      <CdeIcon name="warn" :size="14" />
      <div>
        <strong>Nicht gesichert:</strong>
        {{ ae.schreibKonflikt.wer || 'Jemand anderes' }} hat den Verlauf inzwischen
        geändert<template v-if="ae.schreibKonflikt.wann"> ({{ relativ(ae.schreibKonflikt.wann) }})</template>.
        Deine weiteren Schritte bleiben nur lokal — Seite neu laden, dann auf dem
        aktuellen Stand weiterarbeiten.
      </div>
    </div>

    <!-- Gescheitertes Speichern (Abnahme 2026-09-12): der Server war nicht
         erreichbar — der Verlauf lebt nur in diesem Fenster. -->
    <div v-if="ae.sicherFehler" class="ae-schreibkonflikt">
      <CdeIcon name="warn" :size="14" />
      <div>
        <strong>Nicht gespeichert:</strong>
        der Verlauf liegt nur in diesem Browserfenster<template v-if="ae.sicherFehler.grund"> ({{ ae.sicherFehler.grund }})</template>.
        Fenster offen lassen — der nächste Schritt versucht es erneut.
      </div>
    </div>

    <div v-if="!ae.anzahl && !konflikte.length" class="cde-state-msg">
      <CdeIcon name="undo" :size="22" />
      Noch nichts geändert. Jede gesicherte Bearbeitung steht hier als Version —
      wer, wann, was; rückgängig bis zu jedem Punkt.
    </div>

    <template v-else>
      <!-- Herkunft auf einen Blick (Stufe 9.6): wer erzeugt, muss trennen
           können, was geliefert war und was von hier stammt. -->
      <div class="ae-chips">
        <span class="ae-chip">{{ ae.vorgaenge.length }} {{ ae.vorgaenge.length === 1 ? 'Vorgang' : 'Vorgänge' }}</span>
        <span class="ae-chip">{{ bauteileText(ae.beruehrteBauteile) }}</span>
        <span v-if="eigene" class="ae-chip eigen">Eigenbau · {{ bauteileText(eigene) }}</span>
        <span v-if="konflikte.length" class="ae-chip konflikt">
          {{ konflikte.length }} Konflikt{{ konflikte.length === 1 ? '' : 'e' }}
        </span>
        <!-- Teil XIV: was voneinander abhängt — abgeleitet aus dem Stand, nie gespeichert. -->
        <span v-if="abhaengig.length" class="ae-chip" :title="abhaengig.join('\n')">
          {{ abhaengig.length }} Ableitung{{ abhaengig.length === 1 ? '' : 'en' }}
        </span>
        <span v-if="hinweise.length" class="ae-chip konflikt" :title="hinweise.map(h => h.grund).join('\n')">
          {{ hinweise.length }} × Quelle geändert
        </span>
      </div>

      <!-- ── Zuordnen (Stufe 5 des Aushub-Fachmodells): eine neue Revision ist
           geladen, der Verlauf hängt an der alten. Vorschläge, bestätigen,
           zuordnen — eine eigene Version, jederzeit rückgängig. ── -->
      <section v-if="rebase.zeilen.length" class="ae-rebase">
        <h4 class="ae-abschnitt">
          <template v-if="rebase.hinweis?.wechsel">{{ ohneEndung(rebase.hinweis.wechsel.nach.name) }} ist geladen, {{ bauteileText(rebase.zeilen.length) }} {{ rebase.zeilen.length === 1 ? 'gehört' : 'gehören' }} noch zu {{ revisionKurz(rebase.hinweis.wechsel.von) }}</template>
          <template v-else>{{ bauteileText(rebase.zeilen.length) }} des Verlaufs {{ rebase.zeilen.length === 1 ? 'fehlt' : 'fehlen' }} im Modell</template>
        </h4>
        <p class="ae-rtext">Wähle je Zeile dasselbe Bauteil im Modell. „Zuordnen" sichert das als eigene Version.</p>
        <div v-for="z in rebase.zeilen" :key="z.alt" class="ae-rzeile">
          <span class="ae-ralt" :title="z.alt">{{ z.name || kurz(z.alt) }}</span>
          <select v-model="z.neu" class="ae-rwahl">
            <option :value="null">— nicht zuordnen —</option>
            <option v-for="k in z.auswahl" :key="k.globalId" :value="k.globalId">{{ k.name || kurz(k.globalId) }} · {{ kurz(k.globalId) }}</option>
          </select>
          <em>{{ GRUND_TEXT[z.grund] ?? '' }}</em>
        </div>
        <div class="ae-kaktionen">
          <button class="ae-btn" :disabled="rebase.laeuft || !rebase.zeilen.some(z => z.neu)" @click="umhaengen">
            Zuordnen ({{ rebase.zeilen.filter(z => z.neu).length }})
          </button>
        </div>
      </section>

      <!-- ── Konfliktklärung (Stufe 9.9): der Modellvergleich mit
           Entscheidungen. Drei Verben, mehr gibt es nicht. ── -->
      <section v-if="konflikte.length" class="ae-konflikte">
        <h4 class="ae-abschnitt">Nicht angewandt</h4>
        <article v-for="k in konflikte" :key="k.eintrag?.id ?? k.globalId" class="ae-kkarte">
          <header>
            <CdeIcon name="warn" :size="13" />
            <strong>{{ kurz(k.globalId) }}</strong>
            <span>{{ ARTEN[k.art]?.titel ?? k.art }}</span>
            <em :title="k.zustand === 'fehlgeschlagen' ? (k.grund || '') : ''">{{ zustandText(k) }}</em>
          </header>
          <p class="ae-kwerte">
            <span>Dein Wert: <strong>{{ beschreibeWert(k.art, k.eintrag?.nachher, k.eintrag?.basis) }}</strong></span>
            <span v-if="k.istWert !== undefined && k.istWert !== null">
              Wert des Planers: <strong>{{ beschreibeWert(k.art, k.istWert, k.eintrag?.basis) }}</strong>
            </span>
          </p>
          <div class="ae-kaktionen">
            <button
              class="ae-btn"
              :disabled="k.zustand === 'fehlt'"
              :title="k.zustand === 'fehlt'
                ? 'Das Bauteil fehlt im Modell — es gibt keinen Wert des Planers'
                : 'Dein Wert gilt weiter — auch gegen den neuen Wert des Planers'"
              @click="uebernehmen(k)"
            >Meiner gilt</button>
            <button
              class="ae-btn"
              title="Der Wert des Planers gilt — dein Schritt wird zurückgenommen, er bleibt im Verlauf"
              @click="verwerfen(k)"
            >Planer gilt</button>
            <button
              class="ae-btn"
              :disabled="!auswahlGlobalId || auswahlGlobalId === k.globalId"
              :title="auswahlGlobalId
                ? `Dein Wert gilt für das gewählte Bauteil (${kurz(auswahlGlobalId)})`
                : 'Erst im Modell das Ziel-Bauteil wählen'"
              @click="uebertragen(k)"
            >Auf Auswahl</button>
          </div>
        </article>
      </section>

      <!-- ── Satz-Vergleich (Lücke ⑦ / 9.9): Nord gegen Süd — dieselbe
           Ableitung wie die Konfliktklärung, nur mit zwei Satzebenen. ── -->
      <section v-if="andereSaetze.length" class="ae-vergleich">
        <h4 class="ae-abschnitt">Satz-Vergleich</h4>
        <div class="ae-vgl-kopf">
          <span class="ae-vgl-hier" title="Der gerade aktive Satz">
            {{ cde.aktiverSatz?.name ?? 'Aktueller Stand' }}
          </span>
          <span class="ae-vgl-gegen">gegen</span>
          <select v-model="vergleichSatzId" class="ae-vgl-wahl">
            <option value="" disabled>Satz wählen …</option>
            <option v-for="s in andereSaetze" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <button class="ae-btn" :disabled="!vergleichSatzId || vergleichLaeuft" @click="vergleiche">
            {{ vergleichLaeuft ? 'Lädt …' : 'Vergleichen' }}
          </button>
        </div>
        <p v-if="vergleichZeilen && !vergleichZeilen.length" class="ae-vgl-leer">
          Kein Unterschied — beide Sätze legen dasselbe fest.
        </p>
        <ul v-else-if="vergleichZeilen" class="ae-vgl-liste">
          <li v-for="z in vergleichZeilen" :key="`${z.art}|${z.globalId}`">
            <span class="ae-vgl-zustand" :class="z.zustand">{{ VGL_TITEL[z.zustand] }}</span>
            <strong :title="z.globalId">{{ kurz(z.globalId) }}</strong>
            <span class="ae-vgl-art">{{ ARTEN[z.art]?.titel ?? z.art }}</span>
            <em class="ae-vgl-werte">
              <template v-if="z.zustand !== 'nur_dort'">hier {{ beschreibeWert(z.art, z.hier) }}</template>
              <template v-if="z.zustand === 'verschieden'"> · </template>
              <template v-if="z.zustand !== 'nur_hier'">dort {{ beschreibeWert(z.art, z.dort) }}</template>
            </em>
          </li>
        </ul>
      </section>

      <!-- ── Der Versionsverlauf (U3): Commits — Nachricht · wer · wann;
           die offene Sitzung obenauf als „unversioniert". ── -->
      <ol class="ae-zeit">
        <li
          v-for="v in ae.commitZeitleiste"
          :key="v.id"
          class="ae-vorgang"
          :class="{ ruecknahme: v.typ === 'revert', zurueckgenommen: v.zurueckgenommen,
                    unversioniert: v.typ === 'sitzung' }"
        >
          <span class="ae-punkt" aria-hidden="true"></span>
          <div class="ae-karte">
            <header class="ae-kopf" @click="aufgeklappt = aufgeklappt === v.id ? null : v.id">
              <span class="ae-avatar" :title="v.wer || 'ohne Namen'">{{ initialen(v.wer) }}</span>
              <div class="ae-titelblock">
                <strong class="ae-titel">{{ v.titel }}</strong>
                <small class="ae-meta">
                  {{ v.wer || '—' }} · {{ v.vorgaenge.length }}
                  Schritt{{ v.vorgaenge.length === 1 ? '' : 'e' }}
                  <template v-if="v.zurueckgenommen"> · zurückgenommen</template>
                </small>
              </div>
              <time class="ae-zeitpunkt" :title="absolut(v.wann)">{{ relativ(v.wann) }}</time>
              <CdeIcon :name="aufgeklappt === v.id ? 'chevron-down' : 'chevron-right'" :size="12" />
            </header>

            <div class="ae-bauteile">
              <span v-for="gid in v.bauteile.slice(0, 3)" :key="gid" class="ae-gid mono" :title="gid">
                {{ kurz(gid) }}
              </span>
              <span v-if="v.bauteile.length > 3" class="ae-gid mehr">+{{ v.bauteile.length - 3 }}</span>
            </div>

            <ul v-if="aufgeklappt === v.id" class="ae-schritte">
              <template v-for="vg in v.vorgaenge" :key="vg.schluessel">
                <li v-for="e in vg.zeilen" :key="e.id">
                  <CdeIcon :name="ARTEN[e.art]?.icon ?? 'info'" :size="11" />
                  <span class="ae-schritt-art">{{ ARTEN[e.art]?.titel ?? e.art }}</span>
                  <span class="mono" :title="e.globalId">{{ kurz(e.globalId) }}</span>
                  <span class="ae-schritt-wert">{{ beschreibeWert(e.art, e.nachher, e.basis) }}</span>
                </li>
              </template>
            </ul>

            <div v-if="v.typ === 'sitzung'" class="ae-aktionen">
              <button class="ae-btn klein" title="Bearbeitung sichern — mit Beschreibung und Schrittliste"
                @click="bearbeitung.commitDialogOffen = true"
              ><CdeIcon name="check" :size="11" /> Sichern …</button>
            </div>
            <div v-else-if="v.typ === 'commit' && !v.zurueckgenommen" class="ae-aktionen">
              <button
                v-if="istNeuesterOffener(v)"
                class="ae-btn klein"
                title="Diese Version rückgängig machen — als neue Version, die Spur bleibt"
                @click="versionRueckgaengig(v)"
              ><CdeIcon name="undo" :size="11" /> Rückgängig</button>
              <button
                v-else
                class="ae-btn klein"
                title="Von der neuesten bis einschließlich dieser Version alles rückgängig machen — die Spur bleibt"
                @click="bisHierZurueck(v)"
              ><CdeIcon name="undo" :size="11" /> Bis hierher zurück</button>
            </div>
          </div>
        </li>
      </ol>
    </template>
  </div>
</template>

<script setup>
import { fehlendeAusJournal, schlageVor } from '../services/GlobalIdAbbildung.js';
import { revisionsHinweis } from '../services/RevisionHinweis.js';
/**
 * Die Zeitleiste der Änderungen (Stufe 9, komplett).
 *
 * Aus der Tabelle von Sprint I ist die VERSIONSLISTE geworden: je VORGANG
 * eine Karte (wann · wer · was), aufklappbar bis auf den einzelnen Schritt,
 * mit „Bis hierher zurück" als append-only-Reset — und darüber die
 * KONFLIKTKLÄRUNG (9.9): der Modellvergleich mit den drei Entscheidungen
 * Übernehmen / Verwerfen / Übertragen. Alles, was das Modell berührt, geht
 * durch DENSELBEN `wendeEintragAn` wie jede Bearbeitung.
 */
import { computed, ref, watch, reactive } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import CdeCardHeader from './ui/CdeCardHeader.vue';
import CdeIconButton from './ui/CdeIconButton.vue';
import { useAenderungen, AENDERUNGS_ARTEN, beschreibeWert } from '../stores/useAenderungen.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { baueBericht } from '../services/Aenderungsbericht.js';
import { schreibeBericht } from '../services/AenderungsberichtPdf.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import { useViewerApi } from '../composables/viewerApi.js';
import { repo } from '../services/RepoFacade.js';
import { flacheAusNutzlast, vergleicheStaende } from '../services/Standvergleich.js';
import { abhaengige } from '../services/ableitung/Bezuege.js';

const emit = defineEmits(['geaendert']);

const ae = useAenderungen();
const cde = useCdeStore();
const api = useViewerApi();
const ifc = useIfcStore();
const bearbeitung = useBearbeitung();
const ARTEN = AENDERUNGS_ARTEN;

const aufgeklappt = ref(null);
/** Konflikte des letzten Nachspielens — lokal gespiegelt, damit eine
 *  Entscheidung die Karte sofort räumt, ohne aufs nächste Laden zu warten. */
const konflikte = ref(api.getKonflikte?.() ?? []);
watch(() => ifc.geometrieStand, () => { konflikte.value = api.getKonflikte?.() ?? []; });

const auswahlGlobalId = computed(() => ifc.selectedElement?.globalId ?? null);
const eigene = computed(() => ae.wirksamerStand('erzeugt').size);

// Teil XIV: der Rückwärtsindex „wer hängt an wem" — je Quelle eine Zeile.
const abhaengig = computed(() => {
  const stand = ae.wirksamerStand('erzeugt');
  return [...abhaengige(stand)].map(([quelle, menge]) =>
    `${kurz(quelle)} ← ${[...menge].map(kurz).join(', ')}`);
});
const hinweise = ref(api.getHinweise?.() ?? []);
watch(() => ifc.geometrieStand, () => { hinweise.value = api.getHinweise?.() ?? []; });

// ── Satz-Vergleich (Lücke ⑦ / 9.9) ─────────────────────────────────────────
const VGL_TITEL = { nur_hier: 'nur hier', nur_dort: 'nur dort', verschieden: 'verschieden' };
const vergleichSatzId = ref('');
/** null = noch nicht verglichen; [] = verglichen, kein Unterschied. */
const vergleichZeilen = ref(null);
const vergleichLaeuft = ref(false);
const andereSaetze = computed(() =>
  (cde.saetze ?? []).filter(s => s.id !== cde.aktiverSatzId));

async function vergleiche() {
  if (!vergleichSatzId.value) return;
  vergleichLaeuft.value = true;
  try {
    // Der fremde Satz wird aus SEINER Ablage gelesen — dieselbe Nutzlast,
    // die `_uebernimmV2` beim Satzwechsel läse; nur ohne den Wechsel.
    const roh = await repo.withScope(`stand:${vergleichSatzId.value}`).get('aenderungen');
    vergleichZeilen.value = vergleicheStaende({
      auftrag: ae.auftragsEintraege,
      hier: ae.standEintraege,
      dort: flacheAusNutzlast(roh),
    });
  } catch (fehler) {
    console.error('cde: satzvergleich', fehler);
    vergleichZeilen.value = [];
  } finally {
    vergleichLaeuft.value = false;
  }
}

// Ein veralteter Vergleich ist schlimmer als keiner: jede Journalbewegung
// und jeder Satzwechsel entwerten das Ergebnis, nicht nur die Auswahl.
watch(() => [ae.anzahl, cde.aktiverSatzId], () => { vergleichZeilen.value = null; });

/** GlobalIds sind 22 Zeichen — sichtbar sind die letzten sechs. */
function kurz(globalId) {
  return globalId ? `…${String(globalId).slice(-6)}` : '—';
}

/** Einzahl und Mehrzahl richtig (R7). */
function bauteileText(n) {
  return `${n} ${n === 1 ? 'Bauteil' : 'Bauteile'}`;
}

function ohneEndung(name) {
  return String(name ?? '').replace(/\.ifc$/i, '');
}

/** „R01" aus der Revisionsnummer — ohne Nummer der Dateiname. */
function revisionKurz(r) {
  return r?.revision ? `R${String(r.revision).padStart(2, '0')}` : ohneEndung(r?.name);
}

/** Der Zustand eines Konflikts in Worten — kein Schlüssel wie `keine_localId` (R4). */
function zustandText(k) {
  if (k.zustand === 'fehlt') return 'Bauteil nicht mehr im Modell';
  if (k.zustand === 'konflikt') return 'auch vom Planer geändert';
  if (k.zustand === 'fehlgeschlagen' && k.art === 'erzeugt') return 'nicht gebaut';
  return 'nicht angewandt';
}

function initialen(wer) {
  const teile = String(wer ?? '').trim().split(/\s+/).filter(Boolean);
  if (!teile.length) return '?';
  return (teile[0][0] + (teile[1]?.[0] ?? '')).toUpperCase();
}

function absolut(ms) {
  return ms ? new Date(ms).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

/** „vor 5 min" liest sich; das Genaue steht im title. */
function relativ(ms) {
  if (!ms) return '—';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.floor(s / 60)} min`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std`;
  if (s < 7 * 86400) return `vor ${Math.floor(s / 86400)} T`;
  return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Alles Modellberührende geht durch DENSELBEN Weg wie jede Bearbeitung. */
async function anwenden(eintraege) {
  try {
    const liste = (Array.isArray(eintraege) ? eintraege : [eintraege]).filter(Boolean);
    if (liste.length) await api.wendeEintragAn?.(liste.length > 1 ? liste : liste[0]);
  } catch (fehler) {
    console.error('cde: anwenden (zeitleiste)', fehler);   // Gesetz 10
  }
  emit('geaendert');
}

async function zurueck() {
  await anwenden(await ae.zurueck(cde.bearbeiter || ''));
}

/** Ist dieser Commit der neueste, der noch offen ist? Nur er darf einzeln
 *  revertiert werden — mitten hinein überschriebe spätere Arbeit. */
function istNeuesterOffener(v) {
  const erster = ae.commitZeitleiste.find(x => x.typ === 'commit' && !x.zurueckgenommen);
  return erster?.id === v.id;
}

async function versionRueckgaengig(v) {
  await anwenden(await ae.revertiereCommit(v.id, cde.bearbeiter || ''));
}

async function bisHierZurueck(v) {
  await anwenden(await ae.zurueckBisCommit(v.id, cde.bearbeiter || ''));
}

// ── Rebase (Stufe 5 des Aushub-Fachmodells) ─────────────────────────────────
// Die fehlenden Kennungen kommen aus den Konflikten („Bauteil nicht mehr im
// Modell"), die Kandidaten aus den geladenen Dateien, der Vorschlag aus
// `schlageVor`. Entschieden wird in der Tabelle — nie auf Verdacht.
const GRUND_TEXT = {
  gleich: 'gleiche GlobalId', 'name+kategorie': 'gleicher Name', pruefmass: 'gleiche Form',
  mehrdeutig: 'mehrdeutig — bitte wählen', keiner: 'kein Vorschlag',
};
const rebase = reactive({ zeilen: [], hinweis: null, laeuft: false });

async function rebaseVorbereiten() {
  const fehlend = fehlendeAusJournal({ konflikte: konflikte.value, erzeugtStand: ae.wirksamerStand('erzeugt') });
  if (!fehlend.length) { rebase.zeilen = []; rebase.hinweis = null; return; }
  const kategorien = [...new Set(fehlend.map(f => f.kategorie).filter(Boolean))];
  const kandidaten = api.bauteileDerKategorie?.(kategorien) ?? [];
  // Das Prüfmass nur für die, deren Kategorie passt — der Resolver ist nicht umsonst.
  for (const k of kandidaten) k.pruefmass = await api.pruefmassVon?.(k.globalId) ?? null;
  const vorschlaege = schlageVor({ fehlend, kandidaten });
  rebase.zeilen = vorschlaege.map(v => {
    const f = fehlend.find(x => x.gid === v.alt);
    const auswahl = kandidaten.filter(k => !f?.kategorie || String(k.kategorie).toUpperCase() === String(f.kategorie).toUpperCase());
    return { alt: v.alt, name: f?.name ?? null, neu: v.neu, grund: v.grund, auswahl };
  });
  rebase.hinweis = revisionsHinweis({ fehlend, vorschlaege, geladen: api.geladeneModelle?.() ?? [], register: cde.dokumente });
}
watch(konflikte, rebaseVorbereiten, { immediate: true });

async function umhaengen() {
  const abbildung = new Map(rebase.zeilen.filter(z => z.neu).map(z => [z.alt, z.neu]));
  if (!abbildung.size) return;
  rebase.laeuft = true;
  try {
    // Die GELIEFERTE Lage der neuen Kennungen einfrieren, BEVOR das Umhängen
    // sie bewegt — das Journal nannte sie beim Laden noch nicht, ohne das
    // trügen ihre Einträge keine `basis` (im Browser gefunden, 2026-09-10).
    const eingefroren = await api.friereLieferstandEin?.([...abbildung.values()]) ?? new Map();
    const basisIst = new Map();
    const quellmasse = new Map();
    for (const neu of abbildung.values()) {
      const b = api.lieferstandVon?.(neu) ?? eingefroren.get(neu);
      if (b) basisIst.set(neu, b);
      const m = await api.pruefmassVon?.(neu);
      if (m) quellmasse.set(neu, m);
    }
    const w = rebase.hinweis?.wechsel ?? null;
    const { schritte } = await ae.rebaseAuf({ abbildung, basisIst, quellmasse, wer: cde.bearbeiter || '',
                                              von: w?.von ?? null, nach: w?.nach ?? null });
    await anwenden(schritte);
    // Was das Umhängen erledigt hat, räumt das Nachspielen selbst
    // (`konflikteNachJournal`) — hier nur neu lesen. Vorher filterte der Reiter
    // nur seine KOPIE, und der nächste Geometriestand holte die alte Liste zurück.
    konflikte.value = api.getKonflikte?.() ?? [];
  } finally {
    rebase.laeuft = false;
  }
}

// ── Die drei Konflikt-Verben (9.9) ──────────────────────────────────────────
function _raeume(k) {
  konflikte.value = konflikte.value.filter(x => x !== k);
}

async function uebernehmen(k) {
  if (!k.eintrag?.id || k.istWert === undefined) return;
  await ae.hebeBasisAn(k.eintrag.id, k.istWert, cde.bearbeiter || '');
  _raeume(k);
  // Jetzt ist die Basis der Planerstand — der Eintrag ist wieder anwendbar.
  await anwenden(k.eintrag);
}

async function verwerfen(k) {
  if (!k.eintrag?.id) return;
  const gegen = await ae.verwerfeEinen(k.eintrag.id, cde.bearbeiter || '');
  _raeume(k);
  await anwenden(gegen);
}

async function uebertragen(k) {
  const ziel = auswahlGlobalId.value;
  if (!k.eintrag?.id || !ziel) return;
  const beide = await ae.uebertrageAuf(k.eintrag.id, ziel, {
    wer: cde.bearbeiter || '',
    basis: api.lieferstandVon?.(ziel),
    modell: k.eintrag.modell,
  });
  _raeume(k);
  await anwenden(beide);
}

/**
 * Der Änderungsbericht (Stufe 9.5): das Journal als Dokument — der
 * ISO-19650-Ausgang. Die CDE ändert das Autorenmodell nicht; DIES ist die
 * Form, in der die Forderung den Planer erreicht.
 */
function berichtErzeugen() {
  const bericht = baueBericht({
    eintraege: ae.eintraege,
    zeitleiste: ae.commitZeitleiste,
    konflikte: konflikte.value,
    meta: {
      projekt: cde.auftrag?.name ?? cde.auftrag?.id ?? '',
      // Alle geladenen Dateien (Stufe 4, nachgereicht) — der Bericht betrifft die Modellmenge.
      modelle: api.geladeneModelle?.() ?? [],
    },
  });
  const stempel = new Date().toISOString().slice(0, 10);
  schreibeBericht(bericht).save(`aenderungsbericht-${stempel}.pdf`);
}
</script>

<style scoped>
.ae-tab { display: flex; flex-direction: column; gap: 0.6rem; }

/* ── Herkunfts-Chips ── */
.ae-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.ae-chip {
  padding: 0.15rem 0.55rem; border-radius: 999px;
  background: var(--cde-fill); border: 1px solid var(--cde-line);
  color: var(--cde-text-dim); font-size: var(--cde-font-xs);
}
.ae-chip.eigen { border-color: var(--cde-accent-line); color: var(--cde-accent); }
.ae-chip.konflikt {
  border-color: color-mix(in srgb, var(--cde-warn) 55%, transparent);
  color: var(--cde-warn); font-weight: 600;
}

/* ── Konfliktklärung ── */
.ae-abschnitt {
  margin: 0; font-size: var(--cde-font-xs); text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--cde-text-dim);
}
.ae-konflikte { display: flex; flex-direction: column; gap: 0.4rem; }
/* ── Rebase (Stufe 5) ── */
.ae-rebase { display: flex; flex-direction: column; gap: 0.35rem; }
.ae-rtext { margin: 0; color: var(--cde-text-dim); font-size: var(--cde-font-xs); }
.ae-rzeile { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto; gap: 0.4rem; align-items: center; }
.ae-ralt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ae-rwahl { min-width: 0; }
.ae-rzeile em { color: var(--cde-text-dim); font-size: var(--cde-font-xs); white-space: nowrap; }
.ae-kkarte {
  border: 1px solid color-mix(in srgb, var(--cde-warn) 45%, transparent);
  border-radius: var(--cde-radius);
  background: color-mix(in srgb, var(--cde-warn) 7%, transparent);
  padding: 0.45rem 0.55rem;
  display: flex; flex-direction: column; gap: 0.35rem;
}
/* Satz-Vergleich (Lücke ⑦) */
.ae-vergleich { padding: 0 0.6rem; }
.ae-vgl-kopf {
  display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;
  font-size: var(--cde-font-sm); color: var(--cde-text);
}
.ae-vgl-hier { font-weight: 600; color: var(--cde-text-bright); }
.ae-vgl-gegen { color: var(--cde-text-dim); }
.ae-vgl-wahl {
  flex: 1; min-width: 120px;
  background: var(--cde-fill); color: var(--cde-text);
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm);
  padding: 0.25rem 0.4rem; font-size: var(--cde-font-sm);
}
.ae-vgl-leer {
  margin: 0.45rem 0 0; font-size: var(--cde-font-sm); color: var(--cde-text-dim);
}
.ae-vgl-liste {
  list-style: none; margin: 0.45rem 0 0; padding: 0;
  display: flex; flex-direction: column; gap: 0.3rem;
}
.ae-vgl-liste li {
  display: flex; align-items: baseline; gap: 0.4rem; flex-wrap: wrap;
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--cde-tint-weak); border-radius: var(--cde-radius-sm);
  font-size: var(--cde-font-sm);
}
.ae-vgl-zustand {
  padding: 0.05rem 0.4rem; border-radius: 999px;
  font-size: var(--cde-font-xs); font-weight: 600;
  background: var(--cde-fill); color: var(--cde-text-dim);
}
.ae-vgl-zustand.verschieden {
  background: color-mix(in srgb, var(--cde-warn) 16%, transparent);
  color: var(--cde-warn);
}
.ae-vgl-zustand.nur_hier {
  background: color-mix(in srgb, var(--cde-accent) 14%, transparent);
  color: var(--cde-accent);
}
.ae-vgl-art { color: var(--cde-text-dim); }
.ae-vgl-werte { color: var(--cde-text); font-style: normal; }

/* Mehrbenutzer-Wächter (Lücke ⑥) — dringlicher als eine Konflikt-Karte:
   solange er steht, wird NICHTS mehr gesichert. */
.ae-schreibkonflikt {
  display: flex; align-items: flex-start; gap: 0.45rem;
  margin: 0.5rem 0.6rem 0;
  padding: 0.45rem 0.55rem;
  border: 1px solid color-mix(in srgb, var(--cde-danger) 55%, transparent);
  border-radius: var(--cde-radius);
  background: color-mix(in srgb, var(--cde-danger) 9%, transparent);
  color: var(--cde-text-bright);
  font-size: var(--cde-font-sm);
  line-height: 1.45;
}
.ae-schreibkonflikt .cde-icon { color: var(--cde-danger); flex-shrink: 0; margin-top: 0.1rem; }
.ae-kkarte header {
  display: flex; align-items: baseline; gap: 0.4rem;
  color: var(--cde-warn); font-size: var(--cde-font-sm);
}
.ae-kkarte header em { color: var(--cde-text-dim); font-style: normal; font-size: var(--cde-font-xs); }
.ae-kwerte {
  margin: 0; display: flex; flex-direction: column; gap: 0.1rem;
  font-size: var(--cde-font-xs); color: var(--cde-text);
}
.ae-kaktionen { display: flex; flex-wrap: wrap; gap: 0.3rem; }

/* ── Die Zeitleiste ── */
.ae-zeit {
  list-style: none; margin: 0; padding: 0 0 0 1.1rem;
  display: flex; flex-direction: column; gap: 0.55rem;
  position: relative;
}
.ae-zeit::before {
  content: ''; position: absolute; left: 0.32rem; top: 0.6rem; bottom: 0.6rem;
  width: 2px; background: var(--cde-line);
}
.ae-vorgang { position: relative; }
.ae-punkt {
  position: absolute; left: -1.1rem; top: 0.75rem;
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--cde-accent); border: 2px solid var(--cde-bg);
  box-shadow: 0 0 0 1px var(--cde-accent);
}
.ae-vorgang.ruecknahme .ae-punkt,
.ae-vorgang.protokoll .ae-punkt {
  background: var(--cde-bg); box-shadow: 0 0 0 1px var(--cde-line-strong);
}
.ae-vorgang.unversioniert .ae-karte {
  border-color: var(--cde-accent-line);
  border-style: dashed;
  background: var(--cde-accent-fill);
}
.ae-vorgang.unversioniert .ae-punkt {
  background: var(--cde-bg); box-shadow: 0 0 0 1px var(--cde-accent);
}
.ae-vorgang.zurueckgenommen .ae-karte { opacity: 0.55; }
.ae-vorgang.zurueckgenommen .ae-titel { text-decoration: line-through; }

.ae-karte {
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius);
  background: var(--cde-surface);
  padding: 0.45rem 0.55rem;
  display: flex; flex-direction: column; gap: 0.3rem;
}
.ae-kopf {
  display: flex; align-items: center; gap: 0.5rem; cursor: pointer;
  color: var(--cde-text);
}
.ae-avatar {
  flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--cde-accent-fill); color: var(--cde-accent);
  border: 1px solid var(--cde-accent-line);
  font-size: 0.68rem; font-weight: 700; letter-spacing: 0.02em;
}
.ae-titelblock { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ae-titel {
  font-size: var(--cde-font-sm);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ae-meta { color: var(--cde-text-dim); font-size: var(--cde-font-xs); }
.ae-zeitpunkt {
  flex-shrink: 0; color: var(--cde-text-dim); font-size: var(--cde-font-xs);
  font-variant-numeric: tabular-nums;
}

.ae-bauteile { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.ae-gid {
  padding: 0.05rem 0.4rem; border-radius: var(--cde-radius-sm);
  background: var(--cde-fill); border: 1px solid var(--cde-line);
  color: var(--cde-text-dim); font-size: 0.66rem;
}
.ae-gid.mehr { border-style: dashed; }

.ae-schritte {
  list-style: none; margin: 0; padding: 0.25rem 0 0;
  border-top: 1px dashed var(--cde-line);
  display: flex; flex-direction: column; gap: 0.2rem;
}
.ae-schritte li {
  display: flex; align-items: baseline; gap: 0.35rem;
  font-size: var(--cde-font-xs); color: var(--cde-text);
}
.ae-schritt-art { color: var(--cde-text-dim); flex-shrink: 0; }
.ae-schritt-wert { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ae-aktionen { display: flex; justify-content: flex-end; }

.ae-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.3rem 0.6rem; cursor: pointer;
  border: 1px solid var(--cde-line-strong); border-radius: var(--cde-radius-sm);
  background: var(--cde-fill); color: var(--cde-text);
  font-size: var(--cde-font-xs);
  touch-action: manipulation;
}
.ae-btn:hover:not(:disabled) { border-color: var(--cde-accent-line); color: var(--cde-accent); }
.ae-btn:disabled { opacity: 0.45; cursor: default; }
.ae-btn.klein { padding: 0.2rem 0.5rem; }

.mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, monospace; }

/* T1-Regel: Listenzeilen wachsen auf groben Zeigern wirklich. */
@media (pointer: coarse) {
  .ae-btn { padding: 0.55rem 0.75rem; }
  .ae-kopf { padding: 0.2rem 0; }
}
</style>
