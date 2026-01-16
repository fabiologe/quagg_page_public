<template>
  <PublicLayout>
    <div class="tools-dashboard">
      <div class="container">
        <div class="header">
          <h1>Taschenrechner & Tools</h1>
          <p>Nützliche Werkzeuge für Ihre tägliche Arbeit.</p>
        </div>
        
        <div class="tools-grid">
          <!-- Flood Check Tool Card -->
          <div class="tool-card" @click="$router.push('/tools/flood-check')">
            <div class="icon">🌊</div>
            <div class="content">
              <h3>Überflutungsnachweis</h3>
              <p>Schnelle Berechnung und Nachweis nach DIN 1986-100.</p>
              <span class="link-text">Zum Tool &rarr;</span>
            </div>
          </div>

          <!-- Flood Wave Tool Card -->
          <div class="tool-card" @click="$router.push('/tools/flood-wave')">
            <div class="icon">📈</div>
            <div class="content">
              <h3>Hochwasserwelle HQ100</h3>
              <p>Berechnung der Welle und des Rückhaltevolumens.</p>
              <span class="link-text">Zum Tool &rarr;</span>
            </div>
          </div>

          <!-- Mass Calculator Tool Card -->
          <div class="tool-card" @click="$router.push('/tools/mass-calculator')">
            <div class="icon">🏗️</div>
            <div class="content">
              <h3>Massenermittlung</h3>
              <p>Volumenberechnung für Baugruben und Pyramidenstümpfe.</p>
              <span class="link-text">Zum Tool &rarr;</span>
            </div>
          </div>

          <!-- ISYBAU Tool Card -->
          <div class="tool-card" @click="$router.push('/tools/isybau')">
            <div class="icon">🚇</div>
            <div class="content">
              <h3>ISYBAU Import & Analyse</h3>
              <p>Import, Visualisierung und hydraulische Berechnung von ISYBAU-XML Dateien.</p>
              <span class="link-text">Zum Tool &rarr;</span>
            </div>
          </div>

          <!-- ISYIFC Tool Card (Viewer Only) -->
          <div class="tool-card" @click="$router.push('/tools/isyifc')">
            <div class="icon">👀</div>
            <div class="content">
              <h3>ISYIFC Viewer</h3>
              <p>3D-Viewer und IFC-Konverter ohne Simulationsfunktionen.</p>
              <span class="link-text">Zum Tool &rarr;</span>
            </div>
          </div>


          <!-- Flood 2D Tool Card -->
          <div class="tool-card" @click="$router.push({ name: 'Flood2D' })">
            <div class="icon">🌊</div>
            <div class="content">
              <h3>Flood 2D Simulation</h3>
              <p>Experimentelle 2D-Strömungssimulation (WASM).</p>
              <span class="link-text">Zum Tool &rarr;</span>
            </div>
          </div>

          <!-- Pipe Hydraulics Tool Card -->
          <div class="tool-card" @click="$router.push('/tools/pipe-hydraulics')">
            <div class="icon">💧</div>
            <div class="content">
              <h3>Rohrhydraulik</h3>
              <p>Nachweis nach Manning-Strickler für Kreis-, Ei- und Rechteckprofile.</p>
              <span class="link-text">Zum Tool &rarr;</span>
            </div>
          </div>

          <!-- Placeholder: Versickerung -->
          <div class="tool-card disabled">
            <div class="icon">🌱</div>
            <div class="content">
              <h3>Versickerung</h3>
              <p>Auslegung von Versickerungsanlagen nach DWA-A 138.</p>
              <span class="status">Demnächst</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </PublicLayout>
</template>

<script setup>
import PublicLayout from '@/components/layout/PublicLayout.vue'
</script>

<style scoped>
.tools-dashboard {
  padding: 4rem 0;
  background-color: #f8f9fa;
  min-height: calc(100vh - 64px - 200px); /* Adjust based on header/footer */
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

.header {
  text-align: center;
  margin-bottom: 4rem;
}

.header h1 {
  font-size: 2.5rem;
  color: var(--secondary, #2c3e50);
  margin-bottom: 1rem;
}

.header p {
  color: #666;
  font-size: 1.2rem;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}

.tool-card {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  border: 1px solid rgba(0,0,0,0.05);
}

.tool-card:hover:not(.disabled) {
  transform: translateY(-5px);
  box-shadow: 0 10px 20px rgba(0,0,0,0.1);
}

.tool-card.disabled {
  opacity: 0.7;
  cursor: default;
  background: #f1f1f1;
}

.icon {
  font-size: 3rem;
  margin-bottom: 1.5rem;
}

.content h3 {
  color: var(--secondary, #2c3e50);
  margin-bottom: 0.5rem;
}

.content p {
  color: #666;
  margin-bottom: 1.5rem;
  font-size: 0.95rem;
}

.link-text {
  color: var(--primary, #3498db);
  font-weight: 600;
}

.status {
  background: #95a5a6;
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
}
</style>
