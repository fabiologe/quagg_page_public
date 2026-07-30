<template>
  <div class="f3d-body">
    <RunListPanel class="f3d-sidebar" />
    <main class="f3d-content f3d-ergebnis">
      <nav class="f3d-tabs f3d-ergebnis-tabs">
        <button v-for="tab in VIEWER_TABS" :key="tab.id"
                class="f3d-tab" :class="{ active: post.activeTab === tab.id }"
                @click="post.activeTab = tab.id">
          {{ tab.label }}
        </button>
      </nav>

      <TargetsPanel v-if="post.activeTab === 'nachweis'" />
      <QualityPanel v-else-if="post.activeTab === 'qualitaet'" />
      <TimeSeriesPanel v-else-if="post.activeTab === 'zeitreihen'" />
      <GrundrissPanel v-else-if="post.activeTab === 'grundriss'" />
      <Raum3DPanel v-else-if="post.activeTab === 'raum'" />
      <ExtremesTable v-else-if="post.activeTab === 'extremwerte'" />
      <FiguresPanel v-else-if="post.activeTab === 'abbildungen'" />
      <RunLogPanel v-else-if="post.activeTab === 'lauf'" />
    </main>
  </div>
</template>

<script setup>
// Phase „Ergebnis" des Projekt-Arbeitsbereichs (Spez. Kap. 8): der frühere
// eigenständige Nachweis-Viewer, jetzt auf die Läufe des aktiven Falls
// gefiltert. Die Nachweisübersicht ist bewusst der Start-Tab.
import { onMounted } from 'vue'
import { usePostStore, VIEWER_TABS } from '../../stores/usePostStore'
import { usePreStore } from '../../stores/usePreStore'
import ExtremesTable from '../post/ExtremesTable.vue'
import FiguresPanel from '../post/FiguresPanel.vue'
import GrundrissPanel from '../post/GrundrissPanel.vue'
import QualityPanel from '../post/QualityPanel.vue'
import Raum3DPanel from '../post/Raum3DPanel.vue'
import RunListPanel from '../post/RunListPanel.vue'
import RunLogPanel from '../post/RunLogPanel.vue'
import TargetsPanel from '../post/TargetsPanel.vue'
import TimeSeriesPanel from '../post/TimeSeriesPanel.vue'

const post = usePostStore()
const pre = usePreStore()

onMounted(() => {
  post.caseFilter = pre.activeCaseId || ''
  post.loadRuns()
})
</script>

<style scoped>
.f3d-ergebnis { display: flex; flex-direction: column; gap: 12px; }
.f3d-ergebnis-tabs { flex-shrink: 0; }
</style>
