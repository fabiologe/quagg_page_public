<template>
  <InternLayout>
    <div class="library-container">
      <div class="library-header">
        <div>
          <h1>Bibliothek</h1>
          <p v-if="status.available" class="header-sub">
            {{ status.document_count.toLocaleString('de-DE') }} Dokumente im Volltext
            · {{ status.year_min }}–{{ status.year_max }}
            · {{ status.with_norm_number.toLocaleString('de-DE') }} mit Norm-Nummer
          </p>
        </div>
        <button @click="scanLibrary" class="btn-primary" :disabled="scanning">
          <span v-if="scanning" class="spinner">↻</span>
          {{ scanning ? 'Aktualisiere...' : 'Bibliothek aktualisieren' }}
        </button>
      </div>

      <div class="library-content">
        <!-- Sidebar -->
        <div class="sidebar">
          <div v-if="mode === 'titel'" class="card">
            <h3>Gewerke</h3>
            <div class="filter-list">
              <label class="filter-item">
                <input type="radio" v-model="selectedCategory" :value="null">
                <span>Alle</span>
              </label>
              <label v-for="cat in categories" :key="cat" class="filter-item">
                <input type="radio" v-model="selectedCategory" :value="cat">
                <span>{{ cat }}</span>
              </label>
            </div>
          </div>

          <div v-else class="card">
            <h3>Eingrenzen</h3>
            <label class="field-label">Herausgeber</label>
            <select v-model="ftPublisher" class="field" @change="runFulltext">
              <option :value="null">Alle</option>
              <option v-for="p in facets.publishers" :key="p.name" :value="p.name">
                {{ p.name }} ({{ p.count }})
              </option>
            </select>

            <label class="field-label">Jahr von / bis</label>
            <div class="year-row">
              <input v-model.number="ftYearFrom" class="field" type="number"
                     :placeholder="String(facets.year_min || '')" @change="runFulltext">
              <input v-model.number="ftYearTo" class="field" type="number"
                     :placeholder="String(facets.year_max || '')" @change="runFulltext">
            </div>

            <label class="filter-item norm-toggle">
              <input type="checkbox" v-model="ftNormOnly" @change="runFulltext">
              <span>Nur Dokumente mit Norm-Nummer</span>
            </label>

            <button v-if="hasFilters" class="btn-reset" @click="resetFilters">
              Eingrenzung aufheben
            </button>
          </div>

          <div class="card hinweis" v-if="status.available">
            <h3>Zum Index</h3>
            <p>
              Die Volltextsuche durchsucht den gesamten Literaturbestand, auch
              Dokumente ohne Bibliothekseintrag.
            </p>
            <p v-if="status.without_text">
              {{ status.without_text }} Dokumente haben keine Textebene und sind
              nur über den Titel auffindbar.
            </p>
            <p v-if="status.vector_search && !status.vector_search.available" class="gedaempft">
              Semantische Suche: nicht verfügbar. {{ status.vector_search.reason }}
            </p>
          </div>
        </div>

        <!-- Hauptbereich -->
        <div class="main-area">
          <div class="search-bar">
            <div class="mode-switch">
              <button :class="{ active: mode === 'titel' }" @click="setMode('titel')">Titel</button>
              <button :class="{ active: mode === 'volltext' }" @click="setMode('volltext')">Volltext</button>
            </div>
            <input
              v-model="searchQuery"
              @input="onSearchInput"
              @keyup.enter="runSearch"
              type="text"
              :placeholder="mode === 'titel'
                ? 'Nach Dateinamen suchen …'
                : 'Im Volltext suchen, z. B. Rueckstauebene oder Böschung Verbau …'"
            >
          </div>

          <div v-if="loading" class="loading-state">
            <div class="spinner large">↻</div>
            <p>{{ mode === 'titel' ? 'Lade Dokumente...' : 'Durchsuche den Volltext...' }}</p>
          </div>

          <div v-else-if="fehler" class="empty-state fehler">
            <p>{{ fehler }}</p>
          </div>

          <!-- Titelsuche: bestehende Kachelansicht -->
          <template v-else-if="mode === 'titel'">
            <div v-if="documents.length === 0" class="empty-state">
              <p>Keine Dokumente gefunden.</p>
            </div>
            <div v-else class="document-grid">
              <div v-for="doc in documents" :key="doc.id" class="document-card">
                <div class="card-header">
                  <div class="icon-pdf">PDF</div>
                  <div class="card-info">
                    <h4 :title="doc.title">{{ doc.title }}</h4>
                    <p>{{ doc.category }}</p>
                  </div>
                </div>
                <div class="card-footer">
                  <span>{{ formatSize(doc.size_bytes) }}</span>
                  <a href="#" @click.prevent="openById(doc.id)" class="link-open">Öffnen ↗</a>
                </div>
              </div>
            </div>
          </template>

          <!-- Volltextsuche: Trefferliste mit Fundstellen -->
          <template v-else>
            <div v-if="!searchQuery.trim()" class="empty-state">
              <p>Suchbegriff eingeben, um den Volltext zu durchsuchen.</p>
            </div>
            <div v-else-if="hits.length === 0" class="empty-state">
              <p>Keine Fundstellen für „{{ searchQuery }}".</p>
            </div>
            <div v-else class="hit-list">
              <p class="hit-count">{{ hits.length }} Treffer</p>
              <div v-for="hit in hits" :key="hit.filename" class="hit">
                <div class="hit-head">
                  <h4>{{ hit.title }}</h4>
                  <a href="#" @click.prevent="openHit(hit)" class="link-open">Öffnen ↗</a>
                </div>

                <div class="badges">
                  <span v-if="hit.norm_number" class="badge norm">{{ hit.norm_number }}</span>
                  <span v-if="hit.publisher" class="badge">{{ hit.publisher }}</span>
                  <span v-if="hit.year" class="badge">{{ hit.year }}</span>
                  <span v-if="hit.page_count" class="badge">{{ hit.page_count }} S.</span>
                  <span v-if="hit.is_draft" class="badge entwurf">Entwurf</span>
                  <span v-if="hit.category" class="badge gewerk">{{ hit.category }}</span>
                  <span v-else class="badge extern" title="Nicht im Bibliotheksbestand erfasst">
                    nur im Volltext
                  </span>
                </div>

                <p v-if="hit.best_snippet" class="snippet" v-html="renderSnippet(hit.best_snippet)"></p>

                <div v-if="extraSnippets[hit.filename]" class="more-snippets">
                  <p v-for="(s, i) in extraSnippets[hit.filename]" :key="i"
                     class="snippet" v-html="renderSnippet(s)"></p>
                </div>

                <a v-if="hit.best_snippet && !extraSnippets[hit.filename]"
                   href="#" class="link-more" @click.prevent="loadSnippets(hit)">
                  {{ loadingSnippets === hit.filename ? 'Lade …' : 'Weitere Fundstellen' }}
                </a>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </InternLayout>
</template>

<script setup>
import InternLayout from '@/components/layout/InternLayout.vue'
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'

const router = useRouter()

const mode = ref('titel')
const searchQuery = ref('')
const loading = ref(false)
const scanning = ref(false)
const fehler = ref(null)

// Titelsuche
const documents = ref([])
const categories = ref([])
const selectedCategory = ref(null)

// Volltextsuche
const hits = ref([])
const status = reactive({ available: false })
const facets = reactive({ publishers: [], year_min: null, year_max: null })
const ftPublisher = ref(null)
const ftYearFrom = ref(null)
const ftYearTo = ref(null)
const ftNormOnly = ref(false)
const extraSnippets = reactive({})
const loadingSnippets = ref(null)

const hasFilters = computed(
  () => ftPublisher.value || ftYearFrom.value || ftYearTo.value || ftNormOnly.value
)

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  )

// Das Suchmodul markiert Fundstellen mit « ». Erst escapen, dann die Marken
// durch <mark> ersetzen – so kann aus dem Dokumenttext kein HTML entstehen.
const renderSnippet = (s) =>
  escapeHtml(s || '').replaceAll('«', '<mark>').replaceAll('»', '</mark>')

const fetchCategories = async () => {
  try {
    const res = await api.get('/library/categories')
    categories.value = res.data
  } catch (err) {
    console.error('Failed to fetch categories', err)
  }
}

const fetchStatus = async () => {
  try {
    const res = await api.get('/library/fulltext/status')
    Object.assign(status, res.data)
    if (res.data.available) {
      const f = await api.get('/library/fulltext/facets')
      Object.assign(facets, f.data)
    }
  } catch (err) {
    console.error('Failed to fetch fulltext status', err)
  }
}

const fetchDocuments = async () => {
  loading.value = true
  fehler.value = null
  try {
    const params = {}
    if (selectedCategory.value) params.category = selectedCategory.value
    if (searchQuery.value) params.search = searchQuery.value
    const res = await api.get('/library/documents', { params })
    documents.value = res.data
  } catch (err) {
    console.error('Failed to fetch documents', err)
    fehler.value = 'Dokumente konnten nicht geladen werden.'
  } finally {
    loading.value = false
  }
}

const runFulltext = async () => {
  if (!searchQuery.value.trim()) {
    hits.value = []
    return
  }
  loading.value = true
  fehler.value = null
  Object.keys(extraSnippets).forEach((k) => delete extraSnippets[k])
  try {
    const res = await api.get('/library/fulltext/search', {
      params: {
        q: searchQuery.value,
        top_k: 25,
        publisher: ftPublisher.value || undefined,
        year_from: ftYearFrom.value || undefined,
        year_to: ftYearTo.value || undefined,
        norm_only: ftNormOnly.value || undefined
      }
    })
    hits.value = res.data.results
  } catch (err) {
    console.error('Fulltext search failed', err)
    fehler.value =
      err.response?.status === 503
        ? 'Der Volltextindex ist derzeit nicht verfügbar.'
        : 'Die Suche ist fehlgeschlagen.'
    hits.value = []
  } finally {
    loading.value = false
  }
}

const runSearch = () => (mode.value === 'titel' ? fetchDocuments() : runFulltext())

let debounceTimeout
const onSearchInput = () => {
  clearTimeout(debounceTimeout)
  debounceTimeout = setTimeout(runSearch, 350)
}

const setMode = (m) => {
  if (mode.value === m) return
  mode.value = m
  fehler.value = null
  runSearch()
}

const resetFilters = () => {
  ftPublisher.value = null
  ftYearFrom.value = null
  ftYearTo.value = null
  ftNormOnly.value = false
  runFulltext()
}

const loadSnippets = async (hit) => {
  loadingSnippets.value = hit.filename
  try {
    const res = await api.get('/library/fulltext/snippets', {
      params: { filename: hit.filename, q: searchQuery.value, max_snippets: 5 }
    })
    extraSnippets[hit.filename] = res.data.snippets.filter((s) => s !== hit.best_snippet)
  } catch (err) {
    console.error('Failed to load snippets', err)
  } finally {
    loadingSnippets.value = null
  }
}

const oeffneFenster = (href) => {
  const width = window.screen.width * 0.9
  const height = window.screen.height * 0.9
  const left = (window.screen.width - width) / 2
  const top = (window.screen.height - height) / 2
  // Ein Quagg-PDF-Fenster für alle Bibliotheks-PDFs: jedes weitere Öffnen
  // landet dort als zusätzlicher Tab (DocumentView übergibt an den Editor).
  window.open(
    href,
    'QuaggPdf',
    `popup=yes,width=${width},height=${height},top=${top},left=${left},toolbar=no,menubar=no,location=no,status=no`
  )
}

const openById = (id) =>
  oeffneFenster(router.resolve({ name: 'document-view', params: { id } }).href)

// Volltexttreffer immer ueber den Dateinamen oeffnen, auch mit doc_id: der
// Volltextindex ist aktuell, die Pfade der Bibliothekseintraege oft nicht
// (gemessen 2026-09-12 an vier Suchen: per doc_id oeffneten 32 von 66
// Treffern, per Dateiname 66 von 66).
const openHit = (hit) =>
  oeffneFenster(
    router.resolve({ name: 'document-view-file', query: { file: hit.filename } }).href
  )

const scanLibrary = async () => {
  scanning.value = true
  try {
    await api.post('/library/scan')
    await fetchCategories()
    await fetchDocuments()
  } catch (err) {
    alert('Scan failed: ' + (err.response?.data?.detail || err.message))
  } finally {
    scanning.value = false
  }
}

const formatSize = (bytes) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

watch(selectedCategory, () => {
  if (mode.value === 'titel') fetchDocuments()
})

onMounted(() => {
  fetchCategories()
  fetchDocuments()
  fetchStatus()
})
</script>

<style scoped>
.library-container {
  max-width: 1200px;
  margin: 0 auto;
}

.library-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
  gap: 1rem;
}

.library-header h1 {
  font-size: 1.8rem;
  color: #2c3e50;
}

.header-sub {
  margin-top: 0.25rem;
  font-size: 0.85rem;
  color: #7f8c8d;
}

.btn-primary {
  background-color: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.btn-primary:hover { background-color: #2980b9; }
.btn-primary:disabled { background-color: #95a5a6; cursor: not-allowed; }

.library-content {
  display: flex;
  gap: 2rem;
}

.sidebar {
  width: 250px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.card h3 {
  margin-bottom: 1rem;
  color: #34495e;
  font-size: 1.1rem;
}

.filter-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  color: #2c3e50;
}

.field-label {
  display: block;
  font-size: 0.8rem;
  color: #7f8c8d;
  margin-bottom: 0.25rem;
}

.field {
  width: 100%;
  padding: 0.4rem 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
  background: white;
  color: #2c3e50;
}

.year-row {
  display: flex;
  gap: 0.5rem;
}

.norm-toggle {
  font-size: 0.85rem;
  margin-top: 0.25rem;
}

.btn-reset {
  margin-top: 0.75rem;
  width: 100%;
  background: none;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0.4rem;
  cursor: pointer;
  color: #7f8c8d;
  font-size: 0.85rem;
}

.btn-reset:hover { border-color: #3498db; color: #3498db; }

.hinweis p {
  font-size: 0.8rem;
  color: #7f8c8d;
  line-height: 1.45;
  margin-bottom: 0.5rem;
}

.hinweis p:last-child { margin-bottom: 0; }
.gedaempft { font-style: italic; }

.main-area { flex: 1; min-width: 0; }

.search-bar {
  margin-bottom: 2rem;
  display: flex;
  gap: 0.75rem;
  align-items: stretch;
}

.mode-switch {
  display: flex;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.mode-switch button {
  background: white;
  border: none;
  padding: 0 1rem;
  cursor: pointer;
  color: #7f8c8d;
  font-size: 0.9rem;
}

.mode-switch button.active {
  background: #3498db;
  color: white;
}

.search-bar input {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;
  min-width: 0;
}

.search-bar input:focus { border-color: #3498db; }

.document-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
}

.document-card {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  border: 1px solid #eee;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s, box-shadow 0.2s;
}

.document-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.card-header { display: flex; gap: 0.75rem; margin-bottom: 1rem; }

.icon-pdf {
  background-color: #ffebee;
  color: #e74c3c;
  padding: 0.5rem;
  border-radius: 4px;
  font-weight: bold;
  font-size: 0.8rem;
  height: fit-content;
}

.card-info { flex: 1; min-width: 0; }

.card-info h4 {
  font-size: 1rem;
  color: #2c3e50;
  margin: 0 0 0.25rem 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-info p { font-size: 0.85rem; color: #7f8c8d; margin: 0; }

.card-footer {
  margin-top: auto;
  padding-top: 0.75rem;
  border-top: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  color: #95a5a6;
}

/* --- Volltext-Trefferliste --- */
.hit-count {
  font-size: 0.85rem;
  color: #7f8c8d;
  margin-bottom: 0.75rem;
}

.hit-list { display: flex; flex-direction: column; gap: 0.75rem; }

.hit {
  background: white;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.hit-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
}

.hit-head h4 {
  font-size: 1rem;
  color: #2c3e50;
  margin: 0;
  overflow-wrap: anywhere;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0.5rem 0;
}

.badge {
  font-size: 0.72rem;
  padding: 0.12rem 0.45rem;
  border-radius: 3px;
  background: #f4f6f7;
  color: #7f8c8d;
  border: 1px solid #eceff1;
}

.badge.norm { background: #eaf4fb; color: #2980b9; border-color: #d4e9f7; }
.badge.gewerk { background: #eef8f0; color: #27ae60; border-color: #d9f0df; }
.badge.extern { background: #fdf6e3; color: #b7950b; border-color: #f7eac8; }
.badge.entwurf { background: #fdedec; color: #c0392b; border-color: #f8d7d4; }

.snippet {
  font-size: 0.88rem;
  color: #4a5a68;
  line-height: 1.5;
  margin: 0.35rem 0 0 0;
  overflow-wrap: anywhere;
}

.snippet :deep(mark) {
  background: #fff3b0;
  color: #2c3e50;
  padding: 0 0.1rem;
  border-radius: 2px;
}

.more-snippets {
  margin-top: 0.5rem;
  padding-left: 0.75rem;
  border-left: 2px solid #f0f0f0;
}

.link-open { color: #3498db; text-decoration: none; font-weight: 500; white-space: nowrap; }
.link-open:hover { text-decoration: underline; }

.link-more {
  display: inline-block;
  margin-top: 0.5rem;
  font-size: 0.82rem;
  color: #7f8c8d;
  text-decoration: none;
}

.link-more:hover { color: #3498db; text-decoration: underline; }

.loading-state, .empty-state {
  text-align: center;
  padding: 3rem;
  color: #7f8c8d;
}

.empty-state.fehler { color: #c0392b; }

.spinner { display: inline-block; animation: spin 1s linear infinite; }

.spinner.large {
  font-size: 2rem;
  margin-bottom: 1rem;
  color: #3498db;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .library-content { flex-direction: column; }
  .sidebar { width: 100%; }
  .search-bar { flex-direction: column; }
  .mode-switch button { padding: 0.6rem 1rem; flex: 1; }
}
</style>
