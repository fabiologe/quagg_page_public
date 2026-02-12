<template>
  <div class="audit-modal-overlay" @click.self="$emit('close')">
    <div class="audit-modal">
      <header class="modal-header">
        <h2>Audit der Berechnung (DIN 1986-100)</h2>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </header>
      
      <div class="modal-content">
        <section>
          <h3>1. Grundlegende Parameter</h3>
          <ul>
            <li><strong>Regendaten:</strong> KOSTRA-DWD 2020 (Importiert via API).</li>
            <li><strong>Flächen (A):</strong>
              <ul>
                <li><code>A_ges</code>: Summe aller Teilflächen.</li>
                <li><code>A_u</code> (Spitzenabfluss): Summe (Fläche × C<sub>s</sub>).</li>
                <li><code>A_u,mean</code> (Mittlerer Abfluss): Summe (Fläche × C<sub>m</sub>).</li>
              </ul>
            </li>
            <li><strong>Dauerstufen (D):</strong> Die Iteration erfolgt über alle relevanten Dauerstufen (z.B. 5 min bis 72 h).</li>
          </ul>
        </section>

        <section>
          <h3>2. Standard-Nachweis (Formel 20)</h3>
          <p>Vergleich des Zuflusses (T=30a) mit dem maximal zulässigen Abfluss über den Notüberlauf/Kanal (T=2a).</p>
          <div class="formula-box">
            <p><strong>Q<sub>in</sub></strong> = (r<sub>D,30</sub> × A<sub>u</sub>) / 10000 [l/s]</p>
            <p><strong>Q<sub>out</sub></strong> = (r<sub>D,2</sub> × A<sub>u</sub>) / 10000 [l/s]</p>
            <p><strong>V<sub>erf</sub></strong> = (Q<sub>in</sub> - Q<sub>out</sub>) × D × 60 / 1000 [m³]</p>
          </div>
          <p class="note">Es wird das Maximum aus den Berechnungen für 5, 10 und 15 Minuten gewählt.</p>
        </section>

        <section>
          <h3>3. Hydraulischer Nachweis (Formel 21)</h3>
          <p>Vergleich des Zuflusses (T=30a) mit der vorhandenen Rohrleitungskapazität (Q<sub>voll</sub>).</p>
          <div class="formula-box">
            <p><strong>Q<sub>in</sub></strong> = (r<sub>D,30</sub> × A<sub>u</sub>) / 10000 [l/s]</p>
            <p><strong>Q<sub>out</sub></strong> = Q<sub>voll</sub> (Usereingabe) [l/s]</p>
            <p><strong>V<sub>erf</sub></strong> = (Q<sub>in</sub> - Q<sub>out</sub>) × D × 60 / 1000 [m³]</p>
          </div>
          <p class="note">Iteration über alle Dauerstufen (5 min - 72 h) um das absolute Maximum zu finden.</p>
        </section>

        <section>
          <h3>4. Drossel-Nachweis (RRR / Formel 22)</h3>
          <p>Rückhaltemengenermittlung bei behördlich vorgegebener Drossel (Q<sub>Dr</sub>). Verwendet mittlere Abflussbeiwerte (C<sub>m</sub>).</p>
          <div class="formula-box">
            <p><strong>Q<sub>in</sub></strong> = (r<sub>D,T</sub> × A<sub>u,mean</sub>) / 10000 [l/s]</p>
            <p><strong>V<sub>erf</sub></strong> = (Q<sub>in</sub> - Q<sub>Dr</sub>) × D × 60 × f<sub>Z</sub> / 1000 [m³]</p>
          </div>
          <p class="note">
            <strong>Hinweis zur Anzeige:</strong> Um die Berechnung konsistent darzustellen, beinhalten die in der Tabelle angezeigten "Zufluss"- und "Abfluss"-Werte bereits den Sicherheitsfaktor f<sub>Z</sub>:
            <br>Zu = (Q<sub>in</sub> × D × 60 × f<sub>Z</sub>) / 1000
            <br>Ab = (Q<sub>Dr</sub> × D × 60 × f<sub>Z</sub>) / 1000
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
defineEmits(['close'])
</script>

<style scoped>
.audit-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.audit-modal {
  background: white;
  width: 90%;
  max-width: 700px;
  max-height: 85vh;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}

.modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.4rem;
  color: #2c3e50;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #7f8c8d;
}

.modal-content {
  padding: 1.5rem;
  overflow-y: auto;
  line-height: 1.6;
}

section {
  margin-bottom: 2rem;
}

h3 {
  color: #2980b9;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
}

ul {
  padding-left: 1.5rem;
  color: #34495e;
}

li {
  margin-bottom: 0.5rem;
}

.formula-box {
  background: #f8f9fa;
  padding: 1rem;
  border-left: 4px solid #3498db;
  border-radius: 4px;
  margin: 1rem 0;
  font-family: 'Courier New', monospace;
  color: #2c3e50;
}

.formula-box p {
  margin: 0.5rem 0;
}

.note {
  font-size: 0.9rem;
  color: #7f8c8d;
  font-style: italic;
  background: #fff8e1;
  padding: 0.5rem;
  border-radius: 4px;
}
</style>
