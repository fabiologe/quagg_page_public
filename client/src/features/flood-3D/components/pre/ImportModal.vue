<template>
  <div class="f3d-imp-backdrop" @click.self="close">
    <section class="f3d-imp">
      <header class="f3d-imp-head">
        <h2>Geometrie importieren</h2>
        <button class="f3d-imp-x" @click="close">✕</button>
      </header>

      <!-- Schritt 1: Datei wählen -->
      <div v-if="!manifest" class="f3d-imp-drop"
           :class="{ over: dragOver }"
           @dragover.prevent="dragOver = true"
           @dragleave="dragOver = false"
           @drop.prevent="onDrop">
        <p v-if="loading" class="f3d-muted">Datei wird analysiert …</p>
        <template v-else>
          <p><strong>DXF, STL oder OBJ</strong> hierher ziehen</p>
          <p class="f3d-muted f3d-small">
            oder <label class="f3d-link">auswählen<input type="file"
              accept=".dxf,.stl,.obj,.asc,.xyz" hidden @change="onPick" /></label>
          </p>
          <p class="f3d-muted f3d-small f3d-imp-tip">
            DXF: Gelände-TIN als 3DFACE/POLYFACE, Bauwerke vorher mit
            <code>CONVTOMESH</code> aus Volumenkörpern erzeugen (rohe
            3DSOLID/ACIS lassen sich nicht lesen). Layer werden zu Objekten.
          </p>
          <p class="f3d-muted f3d-small f3d-imp-samples">
            Zum Ausprobieren:
            <a v-for="s in SAMPLES" :key="s.file"
               :href="`/beispiele/${s.file}`" :download="s.file"
               :title="s.hint">{{ s.label }}</a>
          </p>
        </template>
      </div>

      <!-- Schritt 2: Deklaration -->
      <template v-else>
        <div class="f3d-imp-global">
          <div class="f3d-field">
            <label>Einheiten</label>
            <select v-model.number="unitFactor" class="f3d-select">
              <option :value="1">Meter (1:1)</option>
              <option :value="0.001">Millimeter → m</option>
              <option :value="0.01">Zentimeter → m</option>
              <option :value="0.3048">Fuß → m</option>
            </select>
            <p v-if="manifest.unit_suspect && unitFactor === 1"
               class="f3d-warn f3d-small">
              ⚠ Ausdehnung {{ fmt(spanX) }} × {{ fmt(spanY) }} — sehr groß für
              Meter. Millimeter?
            </p>
          </div>
          <div class="f3d-field">
            <label>Ursprung verschieben (x, y)</label>
            <div class="f3d-imp-offset">
              <input type="number" step="any" class="f3d-num" v-model.number="offX" />
              <input type="number" step="any" class="f3d-num" v-model.number="offY" />
              <button class="f3d-btn" @click="suggestOffset">Vorschlag</button>
              <button class="f3d-btn" @click="offX = 0; offY = 0">0</button>
            </div>
            <p v-if="manifest.offset_suggest" class="f3d-muted f3d-small">
              Landeskoordinaten erkannt — Verschieben empfohlen, sonst
              rechnen Viewer und Vernetzer mit 7-stelligen Zahlen. Der Wert
              wird im Fall gespeichert.
            </p>
          </div>
          <label class="f3d-check">
            <input type="checkbox" v-model="deriveDomain" />
            Modellgebiet aus dem Gelände ableiten
          </label>
          <div class="f3d-row">
            <span class="f3d-lbl">Modell drehen</span>
            <input type="number" step="1" v-model.number="rotation"
                   class="f3d-num" />
            <span class="f3d-lbl">°</span>
          </div>
          <p class="f3d-muted f3d-small">
            Das Rechengebiet ist ein achsparalleler Quader. Liegt das Bauwerk
            schräg im Landessystem, dreht diese Angabe beim Import einmal
            alles — Gelände, Kanten, Bauwerke — in ein lokales System, in dem
            es gerade steht. Der Quader passt dann eng darum und man rechnet
            keine leeren Ecken mit. Der Winkel wird im Fall gespeichert.
          </p>
          <label class="f3d-check" v-if="hatKanten">
            <input type="checkbox" v-model="terrainAusLinien"
                   @change="kantenKaestchenGesetzt = true" />
            Gelände aus den Kanten vermaschen
          </label>
          <p v-if="hatKanten" class="f3d-muted f3d-small">
            Ohne Gelände-Layer bilden die Kanten selbst das Gelände: die
            Stützpunkte werden vermascht, zwischen weit auseinanderliegenden
            Kanten wird nichts erfunden — dort führt die nächstgelegene Höhe
            weiter. Mit Gelände-Layer bleibt dieses maßgeblich und die Kanten
            ändern es nur örtlich.
          </p>
        </div>

        <div class="f3d-imp-table-wrap">
          <table class="f3d-table f3d-imp-table">
            <thead>
              <tr>
                <th>Objekt</th><th>Umfang</th><th>Ausdehnung (m)</th>
                <th>Rolle</th><th>Name</th><th>Material</th>
              </tr>
            </thead>
            <tbody>
              <!-- Beide Zeilen gehören in DIESELBE Schleife: die Warnzeile
                   stand einmal daneben, dort ist `c` nicht definiert — der
                   ganze Dialog brach beim Rendern ab, sobald eine Datei
                   analysiert war. -->
              <template v-for="c in manifest.candidates" :key="c.id">
              <tr :class="{ skip: pick[c.id]?.role === 'ignorieren' }">
                <td>
                  <div class="f3d-imp-name">{{ c.name }}</div>
                  <div class="f3d-muted f3d-small">{{ KIND[c.kind] ?? c.kind }}</div>
                  <div v-if="c.hint" class="f3d-warn f3d-small">{{ c.hint }}</div>
                </td>
                <td class="f3d-num-cell">
                  <template v-if="c.kind === 'mesh'">
                    {{ c.stats.n_triangles }} △
                    <div class="f3d-muted f3d-small">
                      {{ c.stats.watertight ? 'geschlossen' : 'offen' }}
                    </div>
                  </template>
                  <template v-else-if="c.kind === 'polyline'">
                    {{ c.stats.n_points }} Punkte
                  </template>
                  <template v-else>{{ c.stats.n_solids }} Körper</template>
                </td>
                <td class="f3d-num-cell">
                  <template v-if="c.kind === 'mesh'">
                    {{ fmt(c.stats.span_xy[0] * unitFactor) }} ×
                    {{ fmt(c.stats.span_xy[1] * unitFactor) }}
                    <div class="f3d-muted f3d-small">
                      z {{ fmt(c.stats.z_range[0] * unitFactor) }} …
                      {{ fmt(c.stats.z_range[1] * unitFactor) }}
                    </div>
                  </template>
                  <template v-else-if="c.kind === 'polyline'">
                    {{ fmt(c.stats.length * unitFactor) }} lang
                  </template>
                  <template v-else>–</template>
                </td>
                <td>
                  <select v-model="pick[c.id].role" class="f3d-select"
                          :disabled="c.kind === 'acis'">
                    <optgroup v-for="g in rolesFor(c)" :key="g.titel"
                              :label="g.titel">
                      <option v-for="r in g.rollen" :key="r" :value="r">
                        {{ ROLE_LABELS[r] }}
                      </option>
                    </optgroup>
                  </select>
                </td>
                <td>
                  <input v-if="usesName(c.id)" type="text" class="f3d-num f3d-imp-id"
                         v-model="pick[c.id].patch" />
                  <span v-else class="f3d-muted">–</span>
                </td>
                <td>
                  <select v-if="usesName(c.id)" v-model="pick[c.id].material"
                          class="f3d-select">
                    <option value="">— glatt —</option>
                    <option v-for="m in MATERIALS" :key="m" :value="m">{{ m }}</option>
                  </select>
                  <span v-else class="f3d-muted">–</span>
                </td>
              </tr>
              <tr v-if="pick[c.id]?.role === 'gelaende_koerper'
                        && c.stats.watertight === false">
                <td colspan="6" class="f3d-warn f3d-small">
                  „{{ c.name }}“ ist nicht geschlossen — als Volumengelände
                  kann der Vernetzer daran nicht entscheiden, was Erdreich
                  ist. Der Import versucht die Löcher zu schließen; gelingt
                  das nicht, meldet es die Prüfung.
                </td>
              </tr>
              </template>
            </tbody>
          </table>
          <p class="f3d-muted f3d-small">
            <strong>Gelände (Höhenfläche)</strong> wird zu einem Höhenraster
            verrechnet — eine Höhe je Punkt, schnell und für offenes Gelände
            richtig. <strong>Gelände als Volumenkörper</strong> gibt den
            Körper unverändert an den Vernetzer weiter: nur so kann das
            Gelände Hohlräume haben (Rohr durch den Damm, Kanal unter der
            Sohle). Der Körper muss geschlossen sein; das Höhenraster für
            Prüfung und Anzeige leitet der Import aus seiner Oberseite ab.
          </p>
        </div>

        <p v-if="error" class="f3d-error">{{ error }}</p>
        <div v-if="report.length" class="f3d-imp-report">
          <p v-for="(r, i) in report" :key="i">✓ {{ r }}</p>
        </div>

        <footer class="f3d-imp-foot">
          <span class="f3d-muted f3d-small">
            {{ nAktiv }} von {{ manifest.candidates.length }} Objekten werden
            übernommen
          </span>
          <span class="f3d-imp-actions">
            <button class="f3d-btn" @click="manifest = null">andere Datei</button>
            <button class="f3d-btn f3d-cta" :disabled="!nAktiv || applying"
                    @click="apply">
              {{ applying ? 'übernehme …' : 'Übernehmen' }}
            </button>
          </span>
        </footer>
      </template>
    </section>
  </div>
</template>

<script setup>
// Import-Dialog (Spez.: Geometrie-Import). Die Datei wird serverseitig in
// Kandidaten zerlegt (DXF je Layer, STL je Komponente); hier wird nur noch
// DEKLARIERT, was was ist. Die Rollen-Vorschläge kommen aus der Heuristik
// des Analyzers — der Nutzer bestätigt oder korrigiert.
import { computed, reactive, ref, watch } from 'vue'
import { flood3dApi } from '../../services/api'
import { usePreStore } from '../../stores/usePreStore'

const emit = defineEmits(['close'])
const store = usePreStore()

const manifest = ref(null)
const pick = reactive({})
const loading = ref(false)
const applying = ref(false)
const dragOver = ref(false)
const error = ref('')
const report = ref([])
const unitFactor = ref(1)
const offX = ref(0)
const offY = ref(0)
const deriveDomain = ref(false)
const terrainAusLinien = ref(false)
const rotation = ref(0)
// merkt sich, ob der Nutzer das Kästchen selbst gesetzt hat — sonst folgt
// es der Rollenwahl (Gelände-Layer vorhanden? dann bleibt der maßgeblich)
const kantenKaestchenGesetzt = ref(false)

const KIND = { mesh: 'Netz', polyline: 'Polylinie', acis: 'ACIS-Körper',
  raster: 'Höhenraster', hinweis: 'Hinweis', kreis: 'Rohrmündung' }
// Beispieldateien (client/public/beispiele, erzeugt von make_beispiele.py)
const SAMPLES = [
  { file: 'gelaende_bauwerke.dxf', label: 'DXF-Beispiel',
    hint: 'Gelände-TIN mit Gerinne, 2 Mauern, 2 Pfeiler, Wehr, 2 Trassen — je eigener Layer' },
  { file: 'koerper.stl', label: 'STL-Beispiel',
    hint: 'Mehrkörper: 3 eckige Pfeiler, runder Pfeiler, Wand, Beckenring' },
  { file: 'boeschungskanten.dxf', label: 'Böschungskanten',
    hint: 'Gelände-TIN + Ober-/Unterkante als 3D-Polylinie + Grabensohle' },
  { file: 'problemfall.dxf', label: 'Problemfall',
    hint: 'Millimeter + Landeskoordinaten + roher 3DSOLID — zeigt die Warnungen' },
]
const ROLE_LABELS = {
  gelaende: 'Gelände (Höhenfläche)',
  gelaende_koerper: 'Gelände als Volumenkörper',
  wand: 'Wand', pfeiler: 'Pfeiler', wehr: 'Wehr',
  becken: 'Becken', bauwerk: 'Bauwerk', querschnitt: 'Querschnitt',
  boeschung_ok: 'Böschungsoberkante', boeschung_uk: 'Böschungsunterkante',
  bruchkante: 'Bruchkante (Gelände)',
  sohle: 'Sohle (Ankerfläche)', beckenrand: 'Beckenrand', krone: 'Krone',
  mauer: 'Mauerkrone → Wand', wehrkrone: 'Überfallkante → Wehr',
  zusatzraster: 'Zusatzraster (Bereich ersetzen)',
  zulaufrohr: 'Rohr am Zulauf', ablaufrohr: 'Rohr am Ablauf',
  ignorieren: '— ignorieren —',
}
const MESH_ROLES = ['gelaende', 'gelaende_koerper', 'wand', 'pfeiler',
  'wehr', 'becken', 'bauwerk', 'ignorieren']
const MATERIALS = ['stahl', 'beton_glatt', 'beton', 'mauerwerk', 'holz',
  'erde', 'steinschuettung']
const SOLID_ROLES = new Set(['wand', 'pfeiler', 'wehr', 'becken', 'bauwerk'])

const fmt = (v) => (v == null ? '–' : Number(v).toFixed(2))
const spanX = computed(() => (manifest.value?.bbox
  ? manifest.value.bbox[1][0] - manifest.value.bbox[0][0] : 0))
const spanY = computed(() => (manifest.value?.bbox
  ? manifest.value.bbox[1][1] - manifest.value.bbox[0][1] : 0))
// Rollen, aus denen ein GELÄNDE entstehen kann. Mauerkrone und
// Überfallkante gehören ausdrücklich nicht dazu: sie werden Bauteile, und
// aus ihnen allein ließe sich kein Gelände bilden.
const KANTEN_ROLLEN = new Set(['bruchkante', 'boeschung_ok', 'boeschung_uk',
  'sohle', 'beckenrand', 'krone'])
const hatKanten = computed(() => Object.entries(pick)
  .some(([, p]) => KANTEN_ROLLEN.has(p.role))
  || (manifest.value?.candidates ?? []).some(
    (c) => KANTEN_ROLLEN.has(c.role_guess)))
const GELAENDE_ROLLEN = new Set(['gelaende', 'gelaende_koerper'])
const hatGelaendeLayer = computed(() => Object.values(pick)
  .some((p) => GELAENDE_ROLLEN.has(p.role)))
// Ohne Gelände-Layer sind die Kanten der einzige Weg zu einem Gelände.
// Das Kästchen folgt der Rollenwahl, bis der Nutzer es selbst anfasst.
watch([hatKanten, hatGelaendeLayer], ([kanten, gelaende]) => {
  if (!kantenKaestchenGesetzt.value) {
    terrainAusLinien.value = kanten && !gelaende
  }
}, { immediate: true })

const nAktiv = computed(() => Object.values(pick)
  .filter((p) => p.role !== 'ignorieren').length)

// Nach WIRKUNG gruppiert, nicht alphabetisch: eine Linie formt entweder
// das Gelände, oder sie wird ein Bauteil, das umströmt wird. Genau diese
// Unterscheidung ist die Entscheidung, die hier zu treffen ist — flach
// untereinander gelistet sähe „Beckenrand" aus wie „Mauerkrone".
const LINIEN_ROLLEN = [
  { titel: 'formt das Gelände',
    rollen: ['bruchkante', 'boeschung_ok', 'boeschung_uk', 'sohle',
      'beckenrand', 'krone'] },
  { titel: 'wird ein Bauteil (umströmt)', rollen: ['mauer', 'wehrkrone'] },
  { titel: 'sonstiges', rollen: ['querschnitt', 'ignorieren'] },
]
const RASTER_ROLLEN = [{ titel: 'Höhendaten',
  rollen: ['gelaende', 'zusatzraster', 'ignorieren'] }]
const ROHR_ROLLEN = [{ titel: 'Rohrmündung',
  rollen: ['zulaufrohr', 'ablaufrohr', 'ignorieren'] }]
const NETZ_ROLLEN = [
  { titel: 'Gelände', rollen: ['gelaende', 'gelaende_koerper'] },
  { titel: 'Bauteil', rollen: MESH_ROLES.filter((r) => SOLID_ROLES.has(r)) },
  { titel: 'sonstiges', rollen: ['ignorieren'] },
]
const NUR_IGNORIEREN = [{ titel: 'sonstiges', rollen: ['ignorieren'] }]
const rolesFor = (c) => (c.kind === 'polyline' ? LINIEN_ROLLEN
  : c.kind === 'raster' ? RASTER_ROLLEN
    : c.kind === 'kreis' ? ROHR_ROLLEN
      : (c.kind === 'acis' || c.kind === 'hinweis') ? NUR_IGNORIEREN
        : NETZ_ROLLEN)
const usesName = (id) => SOLID_ROLES.has(pick[id]?.role)

function close() { emit('close') }

function suggestOffset() {
  const s = manifest.value?.offset_suggest ?? manifest.value?.bbox?.[0]
  if (!s) return
  // Offset gilt in der ZIELeinheit (nach der Umrechnung)
  offX.value = Math.round(s[0] * unitFactor.value * 100) / 100
  offY.value = Math.round(s[1] * unitFactor.value * 100) / 100
}

function onDrop(e) {
  dragOver.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) upload(f)
}
function onPick(e) {
  const f = e.target.files?.[0]
  if (f) upload(f)
}

async function upload(file) {
  loading.value = true
  error.value = ''
  report.value = []
  try {
    const m = await flood3dApi.importAnalyze(store.activeCaseId, file)
    for (const k of Object.keys(pick)) delete pick[k]
    for (const c of m.candidates) {
      pick[c.id] = {
        role: c.role_guess,
        patch: c.name.toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
        material: '',
      }
    }
    manifest.value = m
    if (m.unit_suspect) unitFactor.value = 0.001
    if (m.offset_suggest) suggestOffset()
    deriveDomain.value = m.candidates.some((c) => c.role_guess === 'gelaende')
    kantenKaestchenGesetzt.value = false
  } catch (e) {
    error.value = e.message
    manifest.value = null
  } finally {
    loading.value = false
  }
}

async function apply() {
  applying.value = true
  error.value = ''
  try {
    const decisions = manifest.value.candidates
      .filter((c) => pick[c.id].role !== 'ignorieren')
      .map((c) => ({
        candidate: c.id,
        role: pick[c.id].role,
        patch: pick[c.id].patch,
        material: pick[c.id].material || undefined,
      }))
    const res = await flood3dApi.importApply(
      store.activeCaseId, manifest.value.import_id, {
        decisions,
        unit_factor: unitFactor.value,
        offset: (offX.value || offY.value) ? [offX.value, offY.value] : null,
        terrain_from_lines: terrainAusLinien.value,
        rotation_deg: rotation.value || 0,
        derive_domain: deriveDomain.value,
      })
    report.value = res.report
    await store.adoptImportedSpec(res.spec)
    setTimeout(close, 1800)      // Bericht kurz stehen lassen
  } catch (e) {
    error.value = e.message
  } finally {
    applying.value = false
  }
}
</script>

<style scoped>
.f3d-imp-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
}
.f3d-imp {
  width: min(1100px, 94vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--f3d-surface);
  border: 1px solid var(--f3d-border);
  border-radius: 10px;
  overflow: hidden;
}
.f3d-imp-head { display: flex; align-items: center; justify-content: space-between; }
.f3d-imp-head h2 { margin: 0; font-size: 1rem; color: var(--f3d-text); }
.f3d-imp-x {
  background: none; border: none; color: var(--f3d-text-2);
  font-size: 1rem; cursor: pointer;
}
.f3d-imp-drop {
  border: 2px dashed var(--f3d-border);
  border-radius: 10px;
  padding: 40px 20px;
  text-align: center;
  color: var(--f3d-text);
}
.f3d-imp-drop.over { border-color: var(--f3d-accent); background: var(--f3d-bg); }
.f3d-imp-tip { margin-top: 14px; line-height: 1.5; }
.f3d-imp-tip code {
  background: var(--f3d-bg); padding: 1px 4px; border-radius: 3px;
}
.f3d-link { color: var(--f3d-text); cursor: pointer; text-decoration: underline; }
.f3d-imp-samples { margin-top: 10px; }
.f3d-imp-samples a {
  color: var(--f3d-text);
  margin: 0 6px;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.f3d-imp-samples a:hover, .f3d-link:hover { color: #fff; }
.f3d-imp-global {
  display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap;
}
.f3d-imp-offset { display: flex; gap: 6px; align-items: center; }
.f3d-imp-offset .f3d-num { width: 100px; }
.f3d-imp-table-wrap { overflow: auto; flex: 1; }
.f3d-imp-table td { vertical-align: top; }
.f3d-imp-table tr.skip { opacity: 0.45; }
.f3d-imp-name { color: var(--f3d-text); font-weight: 600; }
.f3d-imp-id { width: 130px; }
.f3d-num-cell { font-variant-numeric: tabular-nums; white-space: nowrap; }
.f3d-warn { color: var(--f3d-warn, var(--f3d-warn)); }
.f3d-imp-report {
  background: var(--f3d-bg); border-radius: 6px; padding: 8px 10px;
  font-size: 0.75rem; color: var(--f3d-good);
}
.f3d-imp-report p { margin: 2px 0; }
.f3d-imp-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.f3d-imp-actions { display: flex; gap: 8px; }
</style>
