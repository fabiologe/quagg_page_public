<template>
  <section class="partners">
    <div class="container">
      <h2>Was unsere Partner sagen</h2>
      <div class="testimonials-grid">
        <div class="testimonial">
          <blockquote>
            "Die Zusammenarbeit mit Quagg Engineering ist geprägt von absoluter Lösungsorientierung und technischer Exzellenz. Ein Partner, auf den man bauen kann."
          </blockquote>
          <cite>- Architekturbüro Müller & Co.</cite>
        </div>
        <div class="testimonial">
          <blockquote>
            "Verlässliche Pläne, schnelle Reaktionen und immer ein offenes Ohr für Optimierungen. So macht Tiefbau Spaß."
          </blockquote>
          <cite>- Bauunternehmung Schmidt GmbH</cite>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.partners {
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

.partners h2 {
  text-align: center;
  font-size: 2.5rem;
  margin-bottom: 4rem;
  color: var(--secondary);
}

.testimonials-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 3rem;
  max-width: 900px;
  margin: 0 auto;
}

.testimonial {
  text-align: center;
  padding: 2rem;
  background: var(--bg-light);
  border-radius: 12px;
  position: relative;
}

.testimonial blockquote {
  font-size: 1.1rem;
  font-style: italic;
  color: #555;
  margin-bottom: 1.5rem;
  line-height: 1.6;
}

.testimonial cite {
  font-weight: bold;
  color: var(--secondary);
  font-style: normal;
}
</style>
