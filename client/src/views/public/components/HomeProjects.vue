<template>
  <section id="projects" class="projects">
    <div class="container">
      <h2>Ausgewählte Projekte</h2>
      <div class="projects-grid">
        <div class="project-card">
          <div class="project-image project-1"></div>
          <div class="project-content">
            <h3>Wohnquartier "Grüne Aue"</h3>
            <p class="project-desc">
              Ein Leuchtturmprojekt für nachhaltiges Wohnen. 45 Wohneinheiten mit komplexer Regenwasserbewirtschaftung und Retentionsdächern.
              Hier haben wir gezeigt, wie moderne Entwässerung das Mikroklima positiv beeinflusst.
            </p>
            <span class="tag">Entwässerung</span>
          </div>
        </div>
        <div class="project-card">
          <div class="project-image project-2"></div>
          <div class="project-content">
            <h3>Gewerbepark "Süd-West"</h3>
            <p class="project-desc">
              Erschließung von 12 Hektar Industriegebiet. Wir haben innovative Versickerungskonzepte entwickelt, die Ökologie und Wirtschaftlichkeit vereinen.
              Effizienz trifft auf Umweltbewusstsein.
            </p>
            <span class="tag">Tiefbau</span>
          </div>
        </div>
        <div class="project-card">
          <div class="project-image project-3"></div>
          <div class="project-content">
            <h3>Straßensanierung B42</h3>
            <p class="project-desc">
              3km Vollausbau unter laufendem Verkehr. Eine logistische Meisterleistung, die wir mit Präzision und Leidenschaft geplant haben.
              Termingerecht und budgettreu.
            </p>
            <span class="tag">Infrastruktur</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.projects {
  padding: 6rem 0;
  background: #f8f9fa;
  --primary: #3498db;
  --secondary: #2c3e50;
  --bg-light: #f8f9fa;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

.projects h2 {
  text-align: center;
  font-size: 2.5rem;
  margin-bottom: 4rem;
  color: var(--secondary);
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}

.project-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 5px 15px rgba(0,0,0,0.05);
  transition: transform 0.3s ease;
}

.project-card:hover {
  transform: translateY(-5px);
}

.project-image {
  height: 200px;
  background-color: #ddd;
  background-size: cover;
  background-position: center;
}

/* Placeholder gradients for project images */
.project-1 { background: linear-gradient(45deg, #3498db, #2c3e50); }
.project-2 { background: linear-gradient(45deg, #2ecc71, #27ae60); }
.project-3 { background: linear-gradient(45deg, #e67e22, #d35400); }

.project-content {
  padding: 1.5rem;
}

.project-content h3 {
  margin-bottom: 0.5rem;
  color: var(--secondary);
}

.project-desc {
  font-size: 0.95rem;
  color: #666;
  margin-bottom: 1rem;
  line-height: 1.5;
}

.tag {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: var(--bg-light);
  color: var(--primary);
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
}
</style>
