<template>
  <section class="case-study">
    <!-- Header with Tabs -->
    <div class="tabs-header">
      <button 
        v-for="(tab, index) in tabs" 
        :key="tab.id"
        :class="['tab-btn', { active: activeTab === index }]"
        @click="activeTab = index"
      >
        {{ tab.shortName }}
      </button>
    </div>

    <!-- Main Content Area -->
    <div class="split-layout">
      <!-- Left side: Information Text -->
      <div class="analytical-pane">
        <h2 class="badge">Anlagenübersicht</h2>
        <h3 class="title">{{ currentStudy.title }}</h3>
        
        <div class="details">
          <div class="detail-section">
            <h4>Beschreibung</h4>
            <p>{{ currentStudy.description }}</p>
          </div>
          
          <div class="stats-grid">
            <div class="stat-card" v-for="(value, label) in currentStudy.stats" :key="label">
              <div class="stat-val">{{ value }}</div>
              <div class="stat-label">{{ label }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right side: Visual Evidence -->
      <div class="visual-pane">
        <div class="visual-header">
          <h4>Interaktives 3D-Modell</h4>
        </div>
        
        <div class="visual-content">
          <!-- Real 3D WebGL Viewer (Lazy Loaded) -->
          <LazyWebGLViewer :key="currentStudy.modelUrl" :model-url="currentStudy.modelUrl" />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue'
import LazyWebGLViewer from './LazyWebGLViewer.vue'

const activeTab = ref(0)

const tabs = [
  {
    id: 'teich',
    title: 'Retentionsbodenfilter',
    shortName: 'Teichanlage',
    description: 'Diese Teichanlage dient dem natürlichen Rückhalt und der biologischen Reinigung von anfallendem Oberflächenwasser. Durch die bepflanzten Uferzonen und die Verweildauer wird eine optimale Sedimentation von Schwebstoffen erreicht.',
    stats: {
      'Volumen': '1,200 m³',
      'Fläche': '450 m²',
      'Reinigungsleistung': 'Hoch'
    },
    modelUrl: '/models/cases/Teich/scene.gltf'
  },
  {
    id: 'lfa',
    title: 'Leichtflüssigabscheider (LFA)',
    shortName: 'LFA',
    description: 'Der Leichtflüssigabscheider trennt mineralische Öle und Leichtflüssigkeiten zuverlässig vom Abwasser. Durch die integrierte Koaleszenzstufe werden auch feinste Öltröpfchen abgeschieden, bevor das Wasser in die Kanalisation eingeleitet wird.',
    stats: {
      'Nenngröße': 'NS 15',
      'Klasse': 'Klasse I',
      'Ölspeichermenge': '580 l'
    },
    // use one of the files from the LFA folder
    modelUrl: '/models/cases/Leichtflüssigabscheider/99610_15B.glb'
  },
  {
    id: 'afs63',
    title: 'AFS63 Beurteilung',
    shortName: 'AFS63 Beurteilung',
    description: 'Grundlage für eine verlässliche Einleiterlaubnis ist der analytische Nachweis des Stoffrückhalts mittels exakter Schmutzfrachtbilanzierung (AFS63). Das Resultat dieser Nachweisführung ist die rechtssichere und wirtschaftlich optimierte Dimensionierung der erforderlichen Regenwasserbehandlungsanlagen (z. B. Sedimentationsbecken oder Filteranlagen)',
    stats: {
  'Leitparameter': 'Ø 63 µm',
  'Zulässige Zielfracht': '≤ 280 kg/(ha·a)',
  'Nachweis': 'DWA vs. REwS',
    },
    modelUrl: '/models/cases/AFS63/scene.gltf'
  }
]

const currentStudy = computed(() => tabs[activeTab.value])
</script>

<style scoped>
.case-study {
  margin: 6rem 0;
  background: white;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0,0,0,0.1);
  max-width: 1400px;
  margin-left: auto;
  margin-right: auto;
  display: flex;
  flex-direction: column;
}

.tabs-header {
  display: flex;
  background: #fdfdfd;
  border-bottom: 1px solid #eee;
}

.tab-btn {
  flex: 1;
  padding: 1.5rem;
  background: transparent;
  border: none;
  font-size: 1.2rem;
  font-weight: 600;
  color: #888;
  cursor: pointer;
  transition: all 0.3s ease;
  border-bottom: 3px solid transparent;
}

.tab-btn:hover {
  color: #3498db;
  background: rgba(52, 152, 219, 0.05);
}

.tab-btn.active {
  color: #3498db;
  border-bottom-color: #3498db;
  background: white;
}

.split-layout {
  display: flex;
  min-height: 500px;
}

.analytical-pane {
  flex: 1;
  padding: 4rem;
  background: #fdfdfd;
  border-right: 1px solid #eee;
}

.visual-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #1a1a24;
  color: white;
}

/* Analytical Pane Styles */
.badge {
  display: inline-block;
  padding: 0.4rem 1rem;
  background: rgba(52, 152, 219, 0.1);
  color: #3498db;
  border-radius: 20px;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 1rem;
}

.title {
  font-size: 2.5rem;
  color: #2c3e50;
  margin-bottom: 3rem;
  line-height: 1.2;
}

.detail-section {
  margin-bottom: 2rem;
}

.detail-section h4 {
  font-size: 1.2rem;
  color: #2c3e50;
  margin-bottom: 0.8rem;
  border-bottom: 2px solid #eee;
  padding-bottom: 0.5rem;
}

.detail-section p {
  color: #555;
  line-height: 1.6;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-top: 3rem;
}

.stat-card {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  text-align: center;
  box-shadow: 0 4px 10px rgba(0,0,0,0.05);
  border: 1px solid #f0f0f0;
}

.stat-val {
  font-size: 1.2rem;
  font-weight: bold;
  color: #3498db;
  margin-bottom: 0.5rem;
}

.stat-label {
  font-size: 0.85rem;
  color: #888;
  text-transform: uppercase;
}

/* Visual Pane Styles */
.visual-header {
  padding: 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.visual-header h4 {
  margin: 0;
  font-size: 1.2rem;
  color: #ddd;
}

.visual-content {
  flex: 1;
  position: relative;
  padding: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 1024px) {
  .split-layout {
    flex-direction: column;
  }
  
  .analytical-pane {
    border-right: none;
    border-bottom: 1px solid #eee;
  }
  
  .visual-pane {
    min-height: 500px;
  }
  
  .tabs-header {
    flex-direction: column;
  }
}
</style>
