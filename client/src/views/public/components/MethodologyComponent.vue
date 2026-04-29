<template>
  <section class="methodology">
    <div class="container">
      <h2 class="section-title">Unsere Methodik</h2>
      
      <div class="tabs">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          :class="['tab-btn', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          {{ tab.title }}
        </button>
      </div>

      <div class="tab-content-wrapper">
        <transition name="fade-slide" mode="out-in">
          <div :key="activeTab" class="tab-content">
            <div class="content-text">
              <h3>{{ currentTab.title }}</h3>
              <p>{{ currentTab.description }}</p>
              <ul class="feature-list">
                <li v-for="(feature, index) in currentTab.features" :key="index">
                  <span class="check">✓</span> {{ feature }}
                </li>
              </ul>
            </div>
            <div class="content-visual">
              <div class="visual-placeholder" :class="currentTab.iconClass">
                <i :class="currentTab.icon"></i>
                <span class="visual-label">{{ currentTab.visualLabel }}</span>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue'

const tabs = [
  {
    id: 'din1986',
    title: 'DIN 1986-100 Nachweise',
    description: 'Wir führen detaillierte Starkregennachweise nach DIN 1986-100 durch, um die Überflutungssicherheit Ihres Grundstücks zu garantieren. Dabei berechnen wir erforderliche Retentionsvolumina und Drosselabflüsse präzise.',
    features: [
      'Berechnung des maßgebenden Bemessungsregens',
      'Ermittlung von Abflussbeiwerten und befestigten Flächen',
      'Dimensionierung von Notüberläufen und Rückhaltesystemen'
    ],
    iconClass: 'bg-blue',
    icon: 'fas fa-file-contract',
    visualLabel: 'Auswertung & Nachweisführung'
  },
  {
    id: '1d2d',
    title: 'Kanalnetzberechnung (1D/2D)',
    description: 'Durch die Koppelung von 1D-Kanalnetzmodellen und hydrodynamischen 2D-Oberflächenmodellen machen wir Fließwege sichtbar. So erkennen Sie genau, wo Wasser bei extremen Ereignissen aus dem Netz austritt und sich auf der Oberfläche verteilt.',
    features: [
      'Gekoppelte 1D/2D-Simulationen mit modernster Software',
      'Visualisierung von Wassertiefen und Fließgeschwindigkeiten',
      'Identifikation von Gefährdungs-Hotspots'
    ],
    iconClass: 'bg-teal',
    icon: 'fas fa-network-wired',
    visualLabel: 'Hydrodynamische Simulation'
  },
  {
    id: 'sanierung',
    title: 'Sanierungsplanung',
    description: 'Wir entwickeln wirtschaftliche und nachhaltige Sanierungskonzepte für überlastete Entwässerungssysteme. Von der Retentionsbodenfilteranlage bis zur unterirdischen Rohrrigole.',
    features: [
      'Variantenuntersuchung und Wirtschaftlichkeitsvergleiche',
      'Kombination von grauer und grüner Infrastruktur (Sponge City)',
      'Begleitung durch alle Leistungsphasen (LPH 1-4)'
    ],
    iconClass: 'bg-green',
    icon: 'fas fa-tools',
    visualLabel: 'Konzeptentwicklung'
  }
]

const activeTab = ref(tabs[0].id)

const currentTab = computed(() => {
  return tabs.find(t => t.id === activeTab.value) || tabs[0]
})
</script>

<style scoped>
.methodology {
  padding: 6rem 0;
  background-color: #f8f9fa;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

.section-title {
  text-align: center;
  font-size: 2.5rem;
  color: var(--secondary, #2c3e50);
  margin-bottom: 3rem;
}

.tabs {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 3rem;
  flex-wrap: wrap;
}

.tab-btn {
  padding: 1rem 2rem;
  background: white;
  border: 2px solid transparent;
  border-radius: 30px;
  font-size: 1.1rem;
  font-weight: 600;
  color: #555;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
}

.tab-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(0,0,0,0.1);
}

.tab-btn.active {
  background: var(--primary, #3498db);
  color: white;
  border-color: var(--primary, #3498db);
}

.tab-content-wrapper {
  background: white;
  border-radius: 16px;
  padding: 3rem;
  box-shadow: 0 10px 30px rgba(0,0,0,0.08);
  min-height: 400px;
}

.tab-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rem;
  align-items: center;
}

.content-text h3 {
  font-size: 2rem;
  color: var(--secondary, #2c3e50);
  margin-bottom: 1.5rem;
}

.content-text p {
  font-size: 1.1rem;
  line-height: 1.8;
  color: #666;
  margin-bottom: 2rem;
}

.feature-list {
  list-style: none;
  padding: 0;
}

.feature-list li {
  font-size: 1.1rem;
  color: #444;
  margin-bottom: 1rem;
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.check {
  color: #2ecc71;
  font-weight: bold;
  font-size: 1.2rem;
}

.visual-placeholder {
  width: 100%;
  height: 350px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: white;
  font-size: 1.5rem;
  font-weight: bold;
  text-align: center;
}

.bg-blue { background: linear-gradient(135deg, #3498db, #2980b9); }
.bg-teal { background: linear-gradient(135deg, #1abc9c, #16a085); }
.bg-green { background: linear-gradient(135deg, #2ecc71, #27ae60); }

/* Vue Transitions */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.4s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

@media (max-width: 900px) {
  .section-title {
    font-size: 2rem;
    margin-bottom: 2rem;
  }

  .tabs {
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 2rem;
  }

  .tab-btn {
    width: 100%;
    padding: 1rem;
    font-size: 1rem;
    white-space: normal; /* Erlaubt Zeilenumbrüche bei langen Wörtern wie Kanalnetzberechnung */
  }

  .tab-content-wrapper {
    padding: 1.5rem;
  }

  .tab-content {
    grid-template-columns: 1fr;
    gap: 2rem;
  }

  .content-text h3 {
    font-size: 1.5rem;
  }

  .content-text p, .feature-list li {
    font-size: 1rem;
  }

  .visual-placeholder {
    height: 200px;
    font-size: 1.2rem;
  }
}
</style>
