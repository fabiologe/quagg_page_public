<template>
  <section id="services" class="services">
    <div class="container">
      <h2>Unsere Leistungen</h2>
      <div class="services-grid">
        <div class="service-card">
          <div class="icon">💧</div>
          <h3>Entwässerungsplanung</h3>
          <p>Nachhaltige Konzepte für Regen- und Schmutzwasser. Wir planen zukunftssicher und effizient.</p>
        </div>
        <div class="service-card">
          <div class="icon">🏗️</div>
          <h3>Tiefbauplanung</h3>
          <p>Professionelle Planung für Ihre Infrastrukturprojekte. Von der ersten Idee bis zur Genehmigung.</p>
        </div>
        <div class="service-card">
          <div class="icon">📋</div>
          <h3>LPH 1-4</h3>
          <p>Wir begleiten Sie durch die Grundlagenermittlung, Vorplanung, Entwurfsplanung und Genehmigungsplanung.</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.services {
  padding: 6rem 0;
  background: white;
  --secondary: #2c3e50;
  --bg-light: #f8f9fa;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

.services h2 {
  text-align: center;
  font-size: 2.5rem;
  margin-bottom: 4rem;
  color: var(--secondary);
}

.services-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}

.service-card {
  background: var(--bg-light);
  padding: 2.5rem;
  border-radius: 12px;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  border: 1px solid rgba(0,0,0,0.05);
}

.service-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
}

.service-card .icon {
  font-size: 3rem;
  margin-bottom: 1.5rem;
}

.service-card h3 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: var(--secondary);
}

.service-card p {
  color: #666;
  line-height: 1.6;
}
</style>
