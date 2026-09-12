<template>
  <div class="dv-uebergabe">
    <div v-if="!fehler" class="dv-karte" role="status" aria-live="polite">
      <span class="dv-spinner" aria-hidden="true"></span>
      <p class="dv-titel">Dokument wird geladen …</p>
      <p v-if="titel" class="dv-name">{{ titel }}</p>
      <p class="dv-hinweis">Öffnet im Quagg-PDF</p>
    </div>
    <div v-else class="dv-karte ist-fehler" role="alert">
      <p class="dv-titel">{{ fehler }}</p>
      <div class="dv-aktionen">
        <button type="button" class="dv-knopf" @click="lade">Erneut versuchen</button>
        <button type="button" class="dv-knopf ist-primaer" @click="schliesse">Fenster schließen</button>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * DocumentView — Übergabeseite der Bibliothek an Quagg-PDF.
 *
 * Lädt die PDF mit Anmeldung (Bearer über `api`), übergibt sie an den Editor
 * und springt ins Quagg-PDF. Dieselbe Quelle öffnet beim nächsten Mal
 * dasselbe lokale Dokument samt Anmerkungen (keine Dublette, kein erneuter
 * Download). Originale werden nie überschrieben — Anmerkungen leben im
 * Editor, Export über dessen Speichern-Dialog.
 *
 * Volltexttreffer kommen über ihren Dateinamen (`?file=`, der Volltextindex
 * ist aktuell), Kacheln der Titelansicht über die doc_id (`/view/:id`).
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { oeffneQuelle } from '@/features/pdfeditor/services/QuellenUebergabe'

const route = useRoute()
const router = useRouter()
const fehler = ref(null)
const titel = ref('')

const dateiname = computed(() => route.query.file || null)
const quelle = computed(() =>
  dateiname.value ? `literatur:${dateiname.value}` : `bibliothek:${route.params.id}`
)

/** Dateiname aus Content-Disposition — erst filename*=UTF-8'' (Umlaute), dann filename=. */
function nameAusKopf(kopf) {
  if (!kopf) return ''
  const stern = kopf.match(/filename\*\s*=\s*utf-8''([^;]+)/i)
  if (stern) {
    try { return decodeURIComponent(stern[1].trim().replace(/^"|"$/g, '')) } catch { /* weiter unten */ }
  }
  const einfach = kopf.match(/filename\s*=\s*"?([^";]+)"?/i)
  return einfach ? einfach[1].trim() : ''
}

async function holePdf() {
  if (dateiname.value) {
    const res = await api.get('/library/fulltext/file', {
      params: { filename: dateiname.value },
      responseType: 'blob'
    })
    return { blob: res.data, name: dateiname.value }
  }
  const id = route.params.id
  const res = await api.get(`/library/download/${id}`, {
    params: { t: Date.now() },
    responseType: 'blob'
  })
  return { blob: res.data, name: nameAusKopf(res.headers['content-disposition']) || `Dokument ${id}.pdf` }
}

async function lade() {
  fehler.value = null
  titel.value = dateiname.value || ''
  try {
    const { dokId } = await oeffneQuelle(quelle.value, holePdf)
    await router.replace({ name: 'pdf-editor', params: { docId: dokId } })
  } catch (err) {
    console.error('Dokument konnte nicht an Quagg-PDF übergeben werden', err)
    fehler.value = err?.response?.status === 404
      ? 'Die Datei wurde im Literaturbestand nicht gefunden.'
      : 'Dokument konnte nicht geladen werden.'
  }
}

function schliesse() {
  window.close()
}

onMounted(lade)
</script>

<style scoped>
/* Farben wie Quagg-PDF (Petrol auf warmem Grau), damit der Übergang ins
   Editorfenster ruhig bleibt. */
.dv-uebergabe {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100vw;
  height: 100vh;
  background: #e9e7e2;
  font-family: 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif;
}
.dv-karte {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: min(360px, calc(100vw - 32px));
  max-width: calc(100vw - 32px);
  padding: 28px 24px;
  background: #f8f7f4;
  color: #22262b;
  border: 1px solid #d6d3cc;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(25, 28, 32, 0.10), 0 4px 16px rgba(25, 28, 32, 0.08);
  text-align: center;
}
.dv-karte.ist-fehler { border-left: 3px solid #b91c1c; }
.dv-spinner {
  width: 28px;
  height: 28px;
  margin-bottom: 4px;
  border: 3px solid rgba(15, 118, 110, 0.18);
  border-top-color: #0f766e;
  border-radius: 50%;
  animation: dv-drehen 0.9s linear infinite;
}
.dv-titel { margin: 0; font-size: 15px; font-weight: 600; }
.dv-name {
  margin: 0;
  max-width: 100%;
  font-size: 13px;
  color: #6d757e;
  overflow-wrap: anywhere;
}
.dv-hinweis { margin: 0; font-size: 12px; color: #6d757e; }
.dv-aktionen {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
}
.dv-knopf {
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid #d6d3cc;
  border-radius: 6px;
  background: #eeece7;
  color: #22262b;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.dv-knopf:hover { background: #e2dfd9; }
.dv-knopf.ist-primaer {
  border-color: #0f766e;
  background: #0f766e;
  color: #ffffff;
}
.dv-knopf.ist-primaer:hover { background: #0d655e; }
@keyframes dv-drehen { to { transform: rotate(360deg); } }
</style>
