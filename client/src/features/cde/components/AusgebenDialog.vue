<template>
  <!-- Ausgeben (Fahrplan „Klare Abläufe“, S4 neu; Kassensturz E10): ein Auswahlbaum
       wie die Bauwerksstruktur — Häkchen an Modellen und Eigenbau-Vorgängen —,
       Autor, Organisation und Bezugssystem, EINE Zeile Stand und beim ersten
       Problem genau EIN Satz mit Knöpfen. Alles Weitere unter „Details“.
       Vorher (Template 2026-09-12): bis zu 9 Textblöcke vor dem Start, keine Wahl
       außer „Eigenbau live mitnehmen“ und zwei Startknöpfen. -->
  <CdeDialog :offen="offen" titel="Ausgeben" icon="ausgeben" @close="schliessen">
    <template v-if="!lauf">
      <div class="ag-art" role="radiogroup" aria-label="Was entsteht">
        <button v-for="a in ARTEN" :key="a.id" type="button" role="radio" class="ag-art-knopf"
                :class="{ aktiv: art === a.id }" :aria-checked="art === a.id" :title="a.titel" @click="art = a.id">
          <CdeIcon :name="a.icon" :size="13" /> {{ a.text }}
        </button>
      </div>

      <ul v-if="!baumLeer" class="ag-baum" role="tree" aria-label="Was in die Datei kommt">
        <template v-if="art === 'verbund'">
          <li v-for="m in baum.modelle" :key="m.sha256" role="treeitem" class="ag-knoten">
            <label class="ag-zeile" :class="{ aus: modelleAus.has(m.sha256) || m.stecktIn }">
              <input type="checkbox" :checked="!modelleAus.has(m.sha256) && !m.stecktIn" :disabled="!!m.stecktIn"
                     @change="umschalten(modelleAus, m.sha256)" />
              <CdeIcon name="bim" :size="13" />
              <span class="ag-name">{{ m.name }}</span>
              <span class="ag-meta">{{ m.stecktIn ? `fällt weg — steckt in ${m.stecktIn}` : `R${m.revision ?? '–'} · ${m.status}` }}</span>
            </label>
          </li>
          <li v-if="!baum.modelle.length" class="ag-knoten ag-leer">Der Satz enthält kein Modell.</li>
        </template>
        <li v-if="baum.gruppen.length" role="treeitem" aria-expanded="true" class="ag-knoten">
          <label class="ag-zeile" :class="{ aus: !teileAn }">
            <input type="checkbox" :checked="eigenbauGanz" :indeterminate="eigenbauTeils" @change="eigenbauUmschalten" />
            <CdeIcon name="tree" :size="13" />
            <span class="ag-name">Eigenbau</span>
            <span class="ag-meta">{{ teileAn }} von {{ zahl(teileAlle, 'Teil', 'Teilen') }}</span>
          </label>
          <ul role="group" class="ag-kinder">
            <li v-for="g in baum.gruppen" :key="g.schluessel" role="treeitem" class="ag-knoten">
              <label class="ag-zeile" :class="{ aus: !gruppeAn(g.schluessel), fehlt: g.fehlt.length && gruppeAn(g.schluessel) }">
                <input type="checkbox" :checked="gruppeAn(g.schluessel)" @change="gruppeUmschalten(g.schluessel)" />
                <CdeIcon :name="g.schluessel === EINZELN ? 'element' : 'terrain'" :size="13" />
                <span class="ag-name">{{ g.titel }}</span>
                <span class="ag-meta">{{ zahl(g.teile, 'Teil', 'Teile') }}<template v-if="g.fehlt.length"> · {{ g.fehlt.length }} nicht baubar</template></span>
              </label>
            </li>
          </ul>
        </li>
        <li v-else-if="probeFehler" class="ag-knoten ag-leer">{{ probeFehler }}</li>
        <li v-if="art === 'erdbau' && erdbauQuellen.length" class="ag-knoten ag-leer">
          Gelände aus {{ erdbauQuellen.join(', ') }}
        </li>
      </ul>

      <div class="ag-angaben">
        <label class="ag-feld"><span>Autor</span>
          <input v-model.trim="autor" maxlength="200" autocomplete="name" /></label>
        <label class="ag-feld"><span>Organisation</span>
          <input v-model.trim="organisation" maxlength="200" placeholder="quagg engineering" autocomplete="organization" /></label>
        <label class="ag-feld ag-feld--breit"><span>Bezugssystem</span>
          <select v-model="epsg">
            <option value="">Wie ermittelt{{ probe?.crs ? ` — ${probe.crs}` : ' — aus den Quellen' }}</option>
            <option v-for="s in SYSTEME" :key="s.epsg" :value="s.epsg">{{ s.epsg }} · {{ s.name }}</option>
          </select>
        </label>
      </div>

      <p class="ag-stand" :class="{ bereit: stand.ok && !wartet }">
        <CdeIcon :name="wartet ? 'busy' : stand.ok ? 'status-ok' : 'status-warn'" :size="13" />
        {{ wartet ? (wartetAuf || 'Prüft, was in die Datei kommt …') : stand.zeile }}
      </p>
      <p v-if="stand.satz && !wartet" class="ag-satz">
        {{ stand.satz }}
        <span class="ag-knoepfe">
          <button v-for="k in stand.knoepfe" :key="k.art" type="button" class="ag-btn klein ag-knopf" @click="knopf(k)">{{ k.text }}</button>
        </span>
      </p>

      <details class="ag-details">
        <summary>Details</summary>
        <p v-for="(d, i) in details" :key="i" class="ag-detail">{{ d }}</p>
      </details>
    </template>

    <template v-else>
      <p class="ag-stand" :class="{ bereit: lauf.zustand === 'geprueft' }">
        <CdeIcon :name="laufSymbol" :size="13" />
        <b>{{ laufZeile(lauf) }}</b>
        <template v-if="laeuft"> — {{ lauf.schritt || 'wartet auf den Server' }}</template>
      </p>
      <p v-if="ablehnung" class="ag-satz">{{ ablehnung }}</p>
      <details v-if="!laeuft" class="ag-details">
        <summary>Details</summary>
        <p v-if="lauf.bericht?.crs" class="ag-detail">Bezugssystem {{ lauf.bericht.crs }} — {{ lauf.bericht.crs_herkunft }}</p>
        <p v-for="l in eigenbauLuecken" :key="l.art" class="ag-detail">Eigenbau, nicht in der Datei ({{ l.text }}): {{ l.anzahl }}</p>
        <p v-for="w in lauf.bericht?.nachbearbeitung?.wirte?.fehlende_wirte ?? []" :key="`fehlt-${w}`" class="ag-detail ag-warn">
          Aushub ohne sein Gelände ({{ w }}) — das gelieferte Gelände in den Satz aufnehmen
        </p>
        <p v-for="w in lauf.bericht?.nachbearbeitung?.wirte?.ohne_wirtangabe ?? []" :key="`ohne-${w}`" class="ag-detail ag-warn">
          Aushub {{ w }} nennt kein Gelände — im Verlauf fehlt seine Quelle
        </p>
        <p v-for="w in lauf.weggelassen ?? []" :key="`weg-${w.datei}`" class="ag-detail">{{ w.datei }} — {{ w.grund }}</p>
        <p v-if="lauf.abgewaehlt?.length" class="ag-detail">Abgewählt: {{ lauf.abgewaehlt.join(', ') }}</p>
        <PruefberichtPanel v-if="lauf.befunde?.length" :befunde="lauf.befunde" :kopf="lauf.bericht" herunterladbar
                           @herunterladen="emit('bericht', lauf.lauf_id, lauf.dokument?.datei)" />
        <template v-for="q in lauf.quellen_bericht ?? []" :key="q.name">
          <p class="ag-detail"><b>{{ q.name }}</b> · {{ q.schema }} · Faktor {{ q.einheit_faktor }} · {{ q.uebernommen }} Bauteile</p>
          <p v-for="(w, i) in q.warnungen ?? []" :key="`${q.name}-${i}`" class="ag-detail ag-warn">{{ w }}</p>
        </template>
      </details>
    </template>

    <p v-if="meldung" class="ag-meldung"><CdeIcon name="warn" :size="12" /> {{ meldung }}</p>

    <template #fuss>
      <button class="ag-btn" @click="schliessen">{{ lauf ? 'Schließen' : 'Abbrechen' }}</button>
      <button v-if="!lauf" class="ag-btn primaer ag-start" :disabled="startet || wartet || !stand.ok" @click="starten">
        <CdeIcon :name="art === 'erdbau' ? 'terrain' : 'ausgeben'" :size="13" />
        {{ startet ? 'Startet …' : ungesichert ? 'Sichern und ausgeben' : art === 'erdbau' ? 'Erdbau-Dokument ausgeben' : 'Verbund ausgeben' }}
      </button>
      <button v-else-if="lauf.dokument" class="ag-btn primaer" @click="herunterladen">
        <CdeIcon name="download" :size="13" /> Herunterladen
      </button>
    </template>
  </CdeDialog>
</template>

<script setup>
/**
 * Der Ausgeben-Dialog (Fahrplan „Klare Abläufe“, S4 neu; Kassensturz E10).
 *
 * Beim Öffnen entsteht EIN Probe-Paket (`IfcViewer.eigenbauPaket`). Daraus
 * der Baum; die Häkchen filtern genau dieses Paket (`Ausgabe.paketAuswahl`),
 * und das geht an den Server. Die Regeln stehen rein in `services/Ausgabe.js`.
 *
 * K8: Ist die Bearbeitung nicht gesichert, heisst der Knopf „Sichern und
 * ausgeben“ — erst der Sichern-Dialog, danach geht es von selbst weiter.
 * Weglassen gilt je Ausgabe (K7): es steht in der Datei, nicht im Verlauf.
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import CdeDialog from './ui/CdeDialog.vue';
import CdeIcon from './ui/CdeIcon.vue';
import PruefberichtPanel from './PruefberichtPanel.vue';
import { useCdeStore } from '../stores/useCdeStore.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { useViewerApi } from '../composables/viewerApi.js';
import { AuftragApi } from '../services/AuftragApi.js';
import { EINZELN, ausgabeBaum, bereitschaft, ladbarFuer, laufSatz, laufZeile, paketAuswahl } from '../services/Ausgabe.js';
import { satzModelle } from '../services/SatzAnsicht.js';
import { imErdbauEnthalten, quellenVeraltet } from '../services/Herkunft.js';
import { aushubFehlt, eigenbauDiagnose } from '../services/EigenbauDiagnose.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { verdeckteAus } from '../services/CdeAchsen.js';
import { SYSTEME, pruefeEtikett } from '../services/Koordinatensysteme.js';

const emit = defineEmits(['laden', 'bericht']);
const cde = useCdeStore();
const aenderungen = useAenderungen();
const bearbeitung = useBearbeitung();
const ifc = useIfcStore();
const api = useViewerApi();

const ARTEN = [
  { id: 'erdbau', text: 'Erdbau-Dokument', icon: 'terrain',
    titel: 'Das gelieferte Gelände unverändert, je Vorgang Aushub und Auftrag mit Mengen — Erdbau_<Satz>_R<nn>.ifc' },
  { id: 'verbund', text: 'Verbund', icon: 'ausgeben',
    titel: 'Die angehakten Modelle des Satzes und der Eigenbau in einer Datei — Verbund_<Satz>_R<nn>.ifc' },
];
const MERK = 'cde-ausgeben';
const WORT = { misserfolge: 'nicht baubar', leer: 'leer', verborgen: 'ausgeblendet', ausgelassen: 'weggelassen' };
const zahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;

const offen = ref(false);
const art = ref('verbund');
const probe = ref(null);
const probeFehler = ref(null);
const probeLaeuft = ref(false);
const wartetAuf = ref('');
const aus = reactive(new Set());            // abgewählte Knoten des Eigenbaus
const modelleAus = reactive(new Set());     // abgewählte Modelle (sha256)
const eigenbauAn = ref(true);
const autor = ref('');
const organisation = ref('');
const epsg = ref('');
const startet = ref(false);
const lauf = ref(null);
const meldung = ref('');
let uhr = null;
let probeGen = 0;
let nachSichern = false;

try {
  const m = JSON.parse(localStorage.getItem(MERK) ?? '{}');
  if (m.art === 'erdbau' || m.art === 'verbund') art.value = m.art;
  autor.value = m.autor ?? '';
  organisation.value = m.organisation ?? '';
} catch { /* ohne Speicher gilt die Vorgabe */ }
function merke() {
  try {
    localStorage.setItem(MERK, JSON.stringify({ art: art.value, autor: autor.value, organisation: organisation.value }));
    if (cde.auftrag?.id) localStorage.setItem(`${MERK}-epsg:${cde.auftrag.id}`, epsg.value);
  } catch { /* egal */ }
}

// EIN Ort für „welche Dokumente eines Satzes sind Modelle“ (S3) — dieselbe Liste zeigt der Viewer.
const modelle = computed(() => satzModelle(cde.aktiverSatz, cde.dokumente));
const baum = computed(() => ausgabeBaum({ paket: probe.value, modelle: modelle.value,
                                          stecktIn: imErdbauEnthalten(modelle.value) }));
const eigenbauAktiv = computed(() => art.value === 'erdbau' || eigenbauAn.value);
const gruppeAn = (schluessel) => eigenbauAktiv.value && !aus.has(schluessel);
const teileAlle = computed(() => baum.value.gruppen.reduce((n, g) => n + g.teile, 0));
const teileAn = computed(() => baum.value.gruppen.filter(g => gruppeAn(g.schluessel)).reduce((n, g) => n + g.teile, 0));
const eigenbauGanz = computed(() => baum.value.gruppen.every(g => gruppeAn(g.schluessel)));
const eigenbauTeils = computed(() => !eigenbauGanz.value && baum.value.gruppen.some(g => gruppeAn(g.schluessel)));
const ungesichert = computed(() => (aenderungen.sitzungSchritte?.length ?? 0) > 0);
const wartet = computed(() => probeLaeuft.value || !!wartetAuf.value);

const erdbauQuellen = computed(() => (paketAuswahl(probe.value, aus)?.quellDokumente ?? [])
  .map(q => q.datei ?? `${String(q.sha256 ?? '?').slice(0, 8)}…`));
// Ohne Eigenbau sagt der Satz darunter, was fehlt — ein leerer Kasten darüber sagte es doppelt (Probe 42069).
const baumLeer = computed(() => art.value === 'erdbau' && !baum.value.gruppen.length
  && !erdbauQuellen.value.length && !probeFehler.value);
const ladbar = computed(() => ladbarFuer({
  gruppen: baum.value.gruppen, eintraege: aenderungen.eintraege ?? [],
  satzShas: cde.aktiverSatz?.enthaelt ?? [], dokumente: cde.dokumente ?? [],
}));
// Ein gewähltes System, in dem die Koordinaten nicht liegen, sagt der Dialog
// vorher — der Server lehnte es sonst nach dem Hochladen ab (`_bezug_pruefen`).
const crsPruefung = computed(() => {
  if (!epsg.value) return null;
  const ost = probe.value?.bauteile?.find(b => Number.isFinite(b?.ursprung?.[0]))?.ursprung?.[0];
  return Number.isFinite(ost) ? pruefeEtikett(epsg.value, ost) : null;
});
const veraltet = computed(() => modelle.value
  .filter(d => d.herkunft?.art === 'erdbau' && !modelleAus.has(d.sha256))
  .flatMap(d => quellenVeraltet(d, cde.dokumente)
    .map(v => `${d.datei ?? d.name} wurde aus ${v.quelle} gebaut — ${v.neu} ist neuer: das Erdbau-Dokument neu ausgeben.`)));
const stand = computed(() => bereitschaft({
  art: art.value, baum: baum.value, paket: probe.value, probeFehler: probeFehler.value, aus, modelleAus,
  eigenbauAn: eigenbauAn.value,
  aushubGanzFehlt: art.value === 'erdbau' && probe.value ? aushubFehlt(probe.value, { satz: cde.aktiverSatz?.name }) : null,
  ladbar: ladbar.value, crsWahl: epsg.value, crsPruefung: crsPruefung.value,
  hinweis: art.value === 'verbund' ? veraltet.value[0] ?? null : null,
}));

// Was sonst noch gilt — zugeklappt. Gerechnet nur, solange der Dialog offen ist.
const diagnose = computed(() => {
  if (!offen.value || lauf.value) return { toteQuellen: [], unloesbar: [], verdraengteAnzeigen: [] };
  return eigenbauDiagnose({
    stand: aenderungen.wirksamerStand('erzeugt'), historie: aenderungen.historischerStand('erzeugt'),
    rezeptNach, verdeckt: verdeckteAus(aenderungen.wirksamerStand('geloescht')),
  });
});
const details = computed(() => {
  const d = [];
  const geheilt = diagnose.value.toteQuellen.filter(t => t.loesbar);
  if (geheilt.length) d.push(`${geheilt.length} Schritte nennen ein zurückgenommenes Gelände — gebaut wird am gelieferten Gelände ${geheilt[0].ur}.`);
  for (const t of diagnose.value.unloesbar) d.push(`${t.name || t.globalId} hängt an ${t.quelle}, das im Verlauf nicht mehr steht.`);
  if (diagnose.value.verdraengteAnzeigen.length) d.push(`${diagnose.value.verdraengteAnzeigen.length} × dasselbe Gelände doppelt — es wird nur einmal gebaut.`);
  if (probe.value?.crsHerkunft) d.push(`Bezugssystem: ${probe.value.crsHerkunft}.`);
  d.push('Nur was die Prüfung besteht, kommt als neues Dokument (WIP) ins Register.');
  return d;
});

const laeuft = computed(() => ['wartet', 'laeuft'].includes(lauf.value?.zustand));
const laufSymbol = computed(() => ({
  geprueft: 'status-ok', abgelehnt: 'status-error', fehler: 'status-error', abgebrochen: 'status-warn',
})[lauf.value?.zustand] ?? 'busy');
const ablehnung = computed(() => laufSatz(lauf.value));
// Für die Schale: „Neu ausgeben“ im Register wartet, solange ein Lauf startet oder rechnet.
const beschaeftigt = computed(() => laeuft.value || startet.value);
const eigenbauLuecken = computed(() =>
  Object.entries(lauf.value?.bericht?.eigenbau?.nicht_im_paket ?? {})
    .map(([k, liste]) => ({ art: k, text: WORT[k] ?? k, anzahl: Array.isArray(liste) ? liste.length : Number(liste) || 0 }))
    .filter(l => l.anzahl > 0));

function umschalten(menge, schluessel) {
  if (menge.has(schluessel)) menge.delete(schluessel);
  else menge.add(schluessel);
}
function gruppeUmschalten(schluessel) {
  if (!eigenbauAktiv.value) {                  // Verbund ohne Eigenbau: nur diesen Knoten dazunehmen
    eigenbauAn.value = true;
    aus.clear();
    for (const g of baum.value.gruppen) if (g.schluessel !== schluessel) aus.add(g.schluessel);
    return;
  }
  umschalten(aus, schluessel);
}
function eigenbauUmschalten() {
  if (eigenbauGanz.value) {
    if (art.value === 'verbund') eigenbauAn.value = false;
    else for (const g of baum.value.gruppen) aus.add(g.schluessel);
    return;
  }
  eigenbauAn.value = true;
  aus.clear();
}
function knopf(k) {
  if (k.art === 'weglassen') aus.add(k.schluessel);
  else if (k.art === 'anhaken') { eigenbauAn.value = true; aus.delete(k.schluessel); }
  else if (k.art === 'eigenbau-aus') eigenbauAn.value = false;
  else if (k.art === 'crs-auto') epsg.value = '';
  else if (k.art === 'laden') {
    // Die Schale nimmt das Modell in den Satz und zeigt es (S3); danach prüft der Dialog neu.
    wartetAuf.value = 'Das Modell kommt in den Satz …';
    emit('laden', k.sha256);
  }
}

async function neuPruefen() {
  const gen = ++probeGen;
  probeLaeuft.value = true;
  probeFehler.value = null;
  try {
    const p = await api.eigenbauPaket?.();
    if (gen !== probeGen) return;
    probe.value = p ?? null;
  } catch (fehler) {
    if (gen !== probeGen) return;
    probe.value = null;
    probeFehler.value = ifc.modelList.length
      ? `Der Eigenbau ließ sich nicht zusammenstellen: ${fehler?.message ?? fehler}`
      : 'Ohne geladenes Modell gibt es keinen Eigenbau.';
  } finally {
    if (gen === probeGen) { probeLaeuft.value = false; wartetAuf.value = ''; }
  }
}
// Verlauf oder geladene Modelle ändern sich, während der Dialog offen ist: neu prüfen.
watch([() => ifc.modelList.length, () => aenderungen.eintraege?.length], () => {
  if (offen.value && !lauf.value && !startet.value) neuPruefen();
});

async function oeffnen({ art: gewuenscht = null, sofort = false } = {}) {
  // Ein laufender Lauf bleibt stehen: wer schließt und wieder öffnet, sieht den Stand.
  if (!laeuft.value) { lauf.value = null; meldung.value = ''; aus.clear(); modelleAus.clear(); }
  if (gewuenscht) art.value = gewuenscht;
  if (!autor.value) autor.value = cde.bearbeiter ?? '';
  try {
    const v = localStorage.getItem(`${MERK}-epsg:${cde.auftrag?.id}`) ?? '';
    epsg.value = SYSTEME.some(s => s.epsg === v) ? v : '';
  } catch { epsg.value = ''; }
  // Ein Erdbau-Dokument im Satz bringt seinen Aushub mit — der Eigenbau ist dann zunächst ab.
  eigenbauAn.value = !baum.value.modelle.some(m => m.erdbau);
  offen.value = true;
  if (lauf.value) return;
  await neuPruefen();
  if (sofort && stand.value.ok) await starten();
}

function schliessen() { offen.value = false; }

async function starten() {
  const satz = cde.aktiverSatz;
  if (!satz || !cde.auftrag?.id || !stand.value.ok) return;
  if (ungesichert.value) {
    // K8: erst sichern — der Sichern-Dialog steht allein; danach geht es von selbst weiter.
    nachSichern = true;
    offen.value = false;
    bearbeitung.commitDialogOffen = true;
    return;
  }
  startet.value = true;
  meldung.value = '';
  merke();
  const erdbau = art.value === 'erdbau';
  let eigenbau = eigenbauAktiv.value ? paketAuswahl(probe.value, aus) : null;
  if (eigenbau && !(eigenbau.bauteile?.length || eigenbau.misserfolge?.length)) eigenbau = null;
  if (eigenbau) {
    // Angaben des Dialogs auch im Paket: der Schreiber liest sie dort, solange
    // der Server sie noch nicht als eigene Felder kennt (app/ifc/cli._angabe).
    eigenbau = {
      ...eigenbau,
      ...(epsg.value ? { crs: epsg.value, crsHerkunft: 'Angabe beim Ausgeben' } : {}),
      ...(autor.value ? { autor: autor.value } : {}),
      ...(organisation.value ? { organisation: organisation.value } : {}),
    };
  }
  // Abnahme D4: ohne Aushub kein Erdbau-Dokument — EIN Satz, BEVOR hochgeladen wird.
  const fehlt = erdbau ? aushubFehlt(eigenbau, { satz: satz.name }) : null;
  if (fehlt) { meldung.value = fehlt; startet.value = false; return; }
  const gewaehlt = !erdbau && modelleAus.size
    ? baum.value.modelle.filter(m => !modelleAus.has(m.sha256)).map(m => m.sha256) : null;
  try {
    const angenommen = await AuftragApi.verbundStarten(cde.auftrag.id, satz.id, {
      eigenbau, modus: art.value, crs: epsg.value || null, modelle: gewaehlt,
      autor: autor.value || null, organisation: organisation.value || null,
    });
    // Ein Server vor S4 kennt die Auswahl nicht — dann ging der ganze Satz hinein. Gesagt wird es.
    if (gewaehlt && !Array.isArray(angenommen?.abgewaehlt)) {
      meldung.value = 'Der Server kennt die Modellauswahl noch nicht — ausgegeben wird der ganze Satz.';
    }
    lauf.value = { ...angenommen, schritt: '' };
    abholen(angenommen.lauf_id);
  } catch (fehler) {
    meldung.value = fehler?.response?.data?.detail || fehler?.message || 'Die Ausgabe ließ sich nicht starten.';
  } finally {
    startet.value = false;
  }
}

// K8: nach dem Sichern-Dialog zurück — gesichert, dann gleich ausgeben.
watch(() => bearbeitung.commitDialogOffen, async (aufDialog) => {
  if (aufDialog || !nachSichern) return;
  nachSichern = false;
  offen.value = true;
  await neuPruefen();
  if (!ungesichert.value && stand.value.ok) await starten();
});

// Gerechnet wird auf dem Server, in einem Unterprozess: anstoßen (202) und alle
// zwei Sekunden abholen, bis ein Endzustand dasteht. Ins Register kommt nur,
// was die Prüfung bestanden hat — das entscheidet der Server, nicht der Dialog.
function abholen(laufId, fehlversuche = 0) {
  clearTimeout(uhr);
  uhr = setTimeout(async () => {
    try {
      const st = await AuftragApi.verbundStatus(cde.auftrag.id, laufId);
      lauf.value = st;
      if (['wartet', 'laeuft'].includes(st.zustand) || (st.zustand === 'geprueft' && !st.dokument)) {
        abholen(laufId);
        return;
      }
      // Das neue Dokument soll im Register stehen, ohne dass jemand neu lädt.
      if (st.dokument) await cde.uebernehmeRegister(await AuftragApi.register(cde.auftrag.id), cde.auftrag.id);
    } catch (fehler) {
      // Ein Aussetzer beim Abholen ist kein Ergebnis — weiterfragen, aber nicht ewig.
      if (fehlversuche < 5) { abholen(laufId, fehlversuche + 1); return; }
      meldung.value = `Abholen misslang: ${fehler?.response?.data?.detail || fehler?.message || fehler}`;
    }
  }, 2000);
}
onBeforeUnmount(() => clearTimeout(uhr));

async function herunterladen() {
  const d = lauf.value?.dokument;
  if (!d) return;
  try {
    const blob = await AuftragApi.datei(d.pfad);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = d.datei;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (fehler) {
    meldung.value = `Herunterladen misslang: ${fehler?.message ?? fehler}`;
  }
}

function melde(text) {
  meldung.value = text;
  wartetAuf.value = '';
}

defineExpose({ oeffnen, neuPruefen, melde, istOffen: () => offen.value, beschaeftigt });
</script>

<style scoped>
.ag-art { display: flex; gap: 0.3rem; margin-bottom: 0.6rem; }
.ag-art-knopf {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;
  padding: 0.4rem 0.6rem;
  background: var(--cde-fill); border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm);
  color: var(--cde-text-dim); font: inherit; font-size: var(--cde-font-sm);
  cursor: pointer; touch-action: manipulation;
}
.ag-art-knopf:hover { background: var(--cde-fill-hover); color: var(--cde-text); }
.ag-art-knopf.aktiv {
  background: var(--cde-accent-fill-hi); border-color: var(--cde-accent-line);
  color: var(--cde-accent); font-weight: 600;
}

.ag-baum, .ag-kinder { list-style: none; margin: 0; padding: 0; }
.ag-baum {
  max-height: 40vh; overflow: auto; padding: 0.25rem 0;
  background: var(--cde-float-deeper);
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm);
}
.ag-kinder { padding-left: 1.3rem; }
.ag-zeile {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.22rem 0.55rem; font-size: var(--cde-font-sm); cursor: pointer;
}
.ag-zeile:hover { background: var(--cde-tint-weak); }
.ag-zeile.aus .ag-name { color: var(--cde-text-dimmer); text-decoration: line-through; }
.ag-zeile.fehlt .ag-meta { color: var(--cde-warn); }
.ag-name { flex: 1; min-width: 0; color: var(--cde-text-bright); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ag-meta { color: var(--cde-text-dim); font-size: var(--cde-font-xs); white-space: nowrap; }
.ag-leer { padding: 0.35rem 0.6rem; color: var(--cde-text-dim); font-size: var(--cde-font-sm); }

.ag-angaben { display: grid; grid-template-columns: 1fr 1fr; gap: 0.45rem 0.6rem; margin-top: 0.7rem; }
.ag-feld { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
.ag-feld--breit { grid-column: 1 / -1; }
.ag-feld span { font-size: var(--cde-font-xs); color: var(--cde-text-dim); }
.ag-feld input, .ag-feld select {
  background: var(--cde-fill); color: var(--cde-text);
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm);
  padding: 0.3rem 0.45rem; font: inherit; font-size: var(--cde-font-sm);
}

.ag-stand { display: flex; align-items: center; gap: 0.4rem; margin: 0.8rem 0 0; font-size: var(--cde-font-sm); color: var(--cde-text); }
.ag-stand.bereit { color: var(--cde-success-strong); }
.ag-satz {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 0.5rem;
  margin: 0.35rem 0 0; font-size: var(--cde-font-sm); color: var(--cde-warn);
}
.ag-knoepfe { display: inline-flex; flex-wrap: wrap; gap: 0.35rem; }
/* Knöpfe wie im Sichern-Dialog — die Knopfklasse der Schale ist dort scoped und reicht nicht bis hier. */
.ag-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.4rem 0.75rem; cursor: pointer;
  border: 1px solid var(--cde-line-strong); border-radius: var(--cde-radius-sm);
  background: var(--cde-fill); color: var(--cde-text);
  font: inherit; font-size: var(--cde-font-sm);
  touch-action: manipulation;
}
.ag-btn:hover:not(:disabled) { border-color: var(--cde-accent-line); color: var(--cde-accent); }
.ag-btn:disabled { opacity: 0.5; cursor: default; }
.ag-btn.klein { padding: 0.25rem 0.5rem; }
.ag-btn.primaer {
  background: var(--cde-accent); border-color: var(--cde-accent);
  color: var(--cde-text-auf-farbe); font-weight: 600;
}
.ag-btn.primaer:hover:not(:disabled) { color: var(--cde-text-auf-farbe); filter: brightness(1.1); }
.ag-knopf { padding: 0.15rem 0.5rem; font-size: var(--cde-font-xs); }
.ag-details { margin-top: 0.7rem; font-size: var(--cde-font-xs); color: var(--cde-text-dim); }
.ag-details summary { cursor: pointer; user-select: none; }
.ag-detail { margin: 0.3rem 0 0; }
.ag-warn { color: var(--cde-warn); }
.ag-meldung { display: flex; align-items: center; gap: 0.35rem; margin: 0.5rem 0 0; font-size: var(--cde-font-sm); color: var(--cde-warn); }

@media (max-width: 520px) { .ag-angaben { grid-template-columns: 1fr; } }
@media (pointer: coarse) {
  .ag-zeile, .ag-art-knopf, .ag-btn { min-height: 40px; }
  .ag-feld input, .ag-feld select { min-height: 40px; }
}
</style>
