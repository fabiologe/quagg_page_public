<template>
  <div class="survey-tab">

    <p class="description">
      Terrestrische Vermessungspunkte laden (Sohlgeometrie).<br>
      <small>Unterstützt: .xyz · .asc · .csv · .geojson</small>
    </p>

    <!-- Drop-Zone -->
    <label class="drop-zone" :class="{ 'is-loading': loading, 'is-loaded': store.surveyPoints.length > 0 }">
      <input
        type="file"
        accept=".xyz,.asc,.txt,.csv,.json,.geojson"
        @change="onFile"
        :disabled="loading"
      />

      <template v-if="loading">
        <div class="spinner"></div>
        <span>Lade...</span>
      </template>

      <template v-else-if="store.surveyPoints.length > 0">
        <span class="loaded-icon">✓</span>
        <span class="loaded-name">{{ store.surveyFileName }}</span>
        <span class="loaded-meta">{{ store.surveyPoints.length }} Punkte geladen</span>
        <span class="replace-hint">Andere Datei wählen um zu ersetzen</span>
      </template>

      <template v-else>
        <span class="drop-icon">⬆</span>
        <span>Datei wählen oder hier ablegen</span>
        <span class="formats">.xyz · .asc · .csv · .geojson</span>
      </template>
    </label>

    <!-- Fehler -->
    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- Vorschau: erste Punkte -->
    <div v-if="store.surveyPoints.length > 0" class="preview">
      <div class="preview-header">
        <span>Vorschau (erste 5 Punkte)</span>
        <button class="btn-clear" @click="store.reset()">Löschen</button>
      </div>
      <table class="preview-table">
        <thead>
          <tr><th>X</th><th>Y</th><th>Z</th><th>Label</th></tr>
        </thead>
        <tbody>
          <tr v-for="(pt, i) in store.surveyPoints.slice(0, 5)" :key="i">
            <td>{{ pt.x.toFixed(2) }}</td>
            <td>{{ pt.y.toFixed(2) }}</td>
            <td>{{ pt.z.toFixed(3) }}</td>
            <td>{{ pt.label ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p class="hint">
        Zur Validierung & Preprocessing: Werkzeugkasten → <strong>Bathymetrie</strong>
      </p>
    </div>

  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useBathymetryStore } from '@/features/flood-2D/stores/useBathymetryStore.js';
import { parseSurveyFile } from '@/features/flood-2D/middleware/importers/SurveyPointParser.js';

const store   = useBathymetryStore();
const loading = ref(false);
const error   = ref(null);

async function onFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';
    error.value = null;
    loading.value = true;

    try {
        const text   = await file.text();
        const points = parseSurveyFile(text, file.name);
        store.setSurveyPoints(points, file.name);
    } catch (e) {
        error.value = e.message;
    } finally {
        loading.value = false;
    }
}
</script>

<style scoped>
.survey-tab {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.description {
    margin: 0;
    color: #bdc3c7;
    line-height: 1.5;
    font-size: 0.9rem;
}
.description small { color: #7f8c8d; }

/* Drop-Zone */
.drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-height: 120px;
    padding: 1.25rem;
    border: 2px dashed #465c71;
    border-radius: 8px;
    background: #34495e;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
    font-size: 0.85rem;
    color: #bdc3c7;
}
.drop-zone:hover       { border-color: #3498db; background: #3b536b; }
.drop-zone.is-loaded   { border-color: #27ae60; border-style: solid; }
.drop-zone.is-loading  { cursor: default; }
.drop-zone input       { display: none; }

.drop-icon    { font-size: 1.6rem; color: #7f8c8d; }
.formats      { font-size: 0.75rem; color: #7f8c8d; }
.loaded-icon  { font-size: 1.4rem; color: #27ae60; }
.loaded-name  { font-weight: 700; color: #ecf0f1; word-break: break-all; }
.loaded-meta  { color: #2ecc71; font-weight: 600; }
.replace-hint { font-size: 0.75rem; color: #7f8c8d; margin-top: 0.25rem; }

/* Fehler */
.error-msg {
    padding: 0.65rem 0.9rem;
    background: rgba(231, 76, 60, 0.15);
    border: 1px solid #e74c3c;
    border-radius: 6px;
    color: #e74c3c;
    font-size: 0.82rem;
    white-space: pre-wrap;
}

/* Vorschau-Tabelle */
.preview {
    border: 1px solid #3d5166;
    border-radius: 6px;
    overflow: hidden;
}
.preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: #1e2d3d;
    font-size: 0.8rem;
    color: #95a5a6;
}
.btn-clear {
    padding: 0.2rem 0.6rem;
    border: 1px solid #e74c3c;
    border-radius: 4px;
    background: transparent;
    color: #e74c3c;
    font-size: 0.75rem;
    cursor: pointer;
}
.btn-clear:hover { background: rgba(231, 76, 60, 0.15); }

.preview-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
}
.preview-table th {
    padding: 0.35rem 0.6rem;
    background: #233140;
    color: #7f8c8d;
    text-align: right;
    font-weight: 600;
}
.preview-table th:first-child,
.preview-table td:first-child { text-align: left; }
.preview-table td {
    padding: 0.35rem 0.6rem;
    color: #bdc3c7;
    text-align: right;
    border-top: 1px solid #2c3e50;
    font-family: monospace;
}
.hint {
    margin: 0;
    padding: 0.5rem 0.75rem;
    background: rgba(52, 152, 219, 0.1);
    color: #7f8c8d;
    font-size: 0.78rem;
}
.hint strong { color: #3498db; }

/* Spinner */
.spinner {
    width: 22px; height: 22px;
    border: 3px solid #465c71;
    border-top-color: #3498db;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
