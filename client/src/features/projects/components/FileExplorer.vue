<template>
  <div class="file-explorer">
    <div class="prj-explorer-kopf">
      <nav class="prj-brotkrumen" aria-label="Pfad">
        <button type="button" class="prj-krume" :class="{ 'prj-krume-aktiv': currentPath === '' }" @click="navigateTo('')">Projekte</button>
        <template v-for="(part, index) in pathParts" :key="index">
          <span class="prj-trenner">/</span>
          <button
            type="button"
            class="prj-krume"
            :class="{ 'prj-krume-aktiv': index === pathParts.length - 1 }"
            @click="navigateTo(getPathUpTo(index))"
          >{{ part }}</button>
        </template>
      </nav>
      <button type="button" class="prj-knopf" title="Aktualisieren" @click="loadContent">
        <ProjektIcon name="aktualisieren" :size="14" />
      </button>
    </div>

    <div v-if="loading" class="prj-explorer-zustand"><ProjektIcon name="laden" :size="16" /> Lade Inhalte…</div>
    <div v-else-if="error" class="prj-fehler">{{ error }}</div>
    <LeerHinweis v-else-if="items.length === 0" text="Dieser Ordner ist leer." />
    <ul v-else class="prj-explorer-liste">
      <li v-for="item in items" :key="item.path">
        <button type="button" class="prj-eintrag" :class="`prj-eintrag-${item.type}`" @click="handleItemClick(item)">
          <ProjektIcon :name="iconFuer(item)" :size="16" />
          <span class="prj-eintrag-name">{{ item.name }}</span>
          <span v-if="item.type === 'file'" class="prj-eintrag-meta">{{ formatSize(item.size) }}</span>
          <ProjektIcon v-else name="weiter" :size="14" class="prj-eintrag-pfeil" />
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup>
// FileExplorer — Ordner-Browser gegen GET /projects/list (relativ zu 1_Projekte).
// Emittiert 'open-file' mit dem Eintrag {name, path, type, size}.
import { computed, onMounted, ref, watch } from 'vue';
import api from '@/services/api';
import LeerHinweis from './ui/LeerHinweis.vue';
import ProjektIcon from './ui/ProjektIcon.vue';

const props = defineProps({
  initialPath: { type: String, default: '' },
});
const emit = defineEmits(['open-file']);

const currentPath = ref(props.initialPath);
const items = ref([]);
const loading = ref(false);
const error = ref(null);

const pathParts = computed(() => (currentPath.value ? currentPath.value.split('/') : []));
const getPathUpTo = (index) => pathParts.value.slice(0, index + 1).join('/');

async function loadContent() {
  loading.value = true;
  error.value = null;
  try {
    const res = await api.get('/projects/list', { params: { path: currentPath.value } });
    items.value = res.data;
  } catch (err) {
    console.warn('projekte explorer:', err);
    error.value = 'Der Ordner konnte nicht geladen werden.';
  } finally {
    loading.value = false;
  }
}

function navigateTo(path) {
  currentPath.value = path;
}

function handleItemClick(item) {
  if (item.type === 'directory') currentPath.value = item.path;
  else emit('open-file', item);
}

function iconFuer(item) {
  if (item.type === 'directory') return 'ordner';
  return item.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'datei';
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

onMounted(loadContent);
watch(currentPath, loadContent);
</script>

<style scoped>
.file-explorer {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--prj-rand);
  border-radius: 8px;
  background: var(--prj-flaeche);
  overflow: hidden;
}
.prj-explorer-kopf {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.7rem;
  background: var(--prj-flaeche-2);
  border-bottom: 1px solid var(--prj-rand);
}
.prj-brotkrumen { display: flex; flex-wrap: wrap; align-items: center; gap: 0.15rem; font-size: 0.82rem; }
.prj-krume {
  border: none;
  background: transparent;
  color: var(--prj-akzent);
  cursor: pointer;
  padding: 0.15rem 0.3rem;
  font-size: inherit;
}
.prj-krume-aktiv { color: var(--prj-text); font-weight: 600; cursor: default; }
.prj-trenner { color: var(--prj-text-dim); }
.prj-explorer-zustand {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 1.2rem;
  color: var(--prj-text-dim);
  font-size: 0.85rem;
}
.prj-fehler { margin: 0.7rem; }
.prj-explorer-liste { list-style: none; margin: 0; padding: 0.3rem; }
.prj-eintrag {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.45rem 0.6rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--prj-text);
  font-size: 0.86rem;
  text-align: left;
  cursor: pointer;
}
.prj-eintrag:hover { background: var(--prj-flaeche-2); }
.prj-eintrag-directory { font-weight: 600; }
.prj-eintrag-name { flex: 1; overflow-wrap: anywhere; }
.prj-eintrag-meta { font-size: 0.76rem; color: var(--prj-text-dim); font-variant-numeric: tabular-nums; }
.prj-eintrag-pfeil { color: var(--prj-text-dim); }
</style>
