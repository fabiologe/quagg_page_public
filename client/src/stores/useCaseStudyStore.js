import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useCaseStudyStore = defineStore('caseStudy', () => {
  
  // Hard hydro-data decoupled from UI
  const studies = ref([
    {
      id: 'logistik-sued',
      title: 'Logistikzentrum Süd (Anonymisiert)',
      initialState: 'Bestandsentwässerung auf Mischsystem ausgelegt. Häufiger Rückstau bei Starkregenereignissen. Erhebliche Überflutungsgefahr für Rampenanlagen.',
      loadCase: 'r(5,100) = 385 l/(s*ha), Dauerstufe D=60min',
      measures: [
        'Abkopplung von 1.2ha Dachfläche',
        'Bau einer unterirdischen Rohrrigole (V=450m³)',
        'Gedrosselter Ablauf Q_DR = 12 l/s'
      ],
      stats: {
        'Fläche': '3.4 ha',
        'Volumen': '450 m³',
        'Drossel': '12 l/s'
      },
      // URL for the 3D model (GLTF/GLB). Leave empty to use fallback pit visualization.
      modelUrl: '', 
      // Time series data for runoff hydrographs
      hydrographData: {
        labels: ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90'],
        datasets: [
          {
            label: 'Zufluss (Ist-Zustand) [l/s]',
            backgroundColor: 'rgba(231, 76, 60, 0.2)',
            borderColor: '#e74c3c',
            data: [0, 150, 450, 800, 1200, 950, 400, 150, 50, 0],
            fill: true,
            tension: 0.4
          },
          {
            label: 'Abfluss (Plan-Zustand gedrosselt) [l/s]',
            backgroundColor: 'rgba(46, 204, 113, 0.2)',
            borderColor: '#2ecc71',
            data: [0, 10, 12, 12, 12, 12, 12, 12, 10, 0],
            fill: true,
            tension: 0.1
          }
        ]
      }
    }
  ])

  const activeStudyId = ref('logistik-sued')

  const activeStudy = computed(() => {
    return studies.value.find(s => s.id === activeStudyId.value) || studies.value[0]
  })

  function setActiveStudy(id) {
    activeStudyId.value = id
  }

  return {
    studies,
    activeStudyId,
    activeStudy,
    setActiveStudy
  }
})
