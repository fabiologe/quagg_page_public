<template>
  <PublicLayout>
    <div class="contact-page">
      <div class="container">
        <div class="contact-grid">
          <div class="contact-info">
            <h1>Kontaktieren Sie uns</h1>
            <p class="subtitle">Wir freuen uns auf Ihr Projekt.</p>
            
            <div class="info-item">
              <h3>📍 Adresse</h3>
              <p>Quagg Engineering<br>Musterstraße 123<br>12345 Musterstadt</p>
            </div>
            
            <div class="info-item">
              <h3>📧 E-Mail</h3>
              <p><a href="mailto:info@quagg.engineering">info@quagg.engineering</a></p>
            </div>
            
            <div class="info-item">
              <h3>📞 Telefon</h3>
              <p><a href="tel:+491234567890">+49 123 456 7890</a></p>
            </div>
          </div>
          
          <div class="contact-form-wrapper">
            <form @submit.prevent="submitForm" class="contact-form">
              <div class="form-group">
                <label for="name">Name</label>
                <input type="text" id="name" v-model="form.name" required placeholder="Ihr Name">
              </div>
              
              <div class="form-group">
                <label for="email">E-Mail</label>
                <input type="email" id="email" v-model="form.email" required placeholder="ihre@email.de">
              </div>
              
              <div class="form-group">
                <label for="message">Nachricht</label>
                <textarea id="message" v-model="form.message" required rows="5" placeholder="Wie können wir Ihnen helfen?"></textarea>
              </div>
              
              <BaseButton type="submit" :disabled="isSubmitting">
                {{ isSubmitting ? 'Wird gesendet...' : 'Nachricht senden' }}
              </BaseButton>
              
              <p v-if="submitStatus" :class="['status-msg', submitStatus.type]">
                {{ submitStatus.text }}
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  </PublicLayout>
</template>

<script setup>
import { ref, reactive } from 'vue'
import PublicLayout from '@/components/layout/PublicLayout.vue'
import BaseButton from '@/components/base/BaseButton.vue'

const form = reactive({
  name: '',
  email: '',
  message: ''
})

const isSubmitting = ref(false)
const submitStatus = ref(null)

async function submitForm() {
  isSubmitting.value = true
  submitStatus.value = null
  
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 1500))
  
  isSubmitting.value = false
  submitStatus.value = { type: 'success', text: 'Vielen Dank! Wir melden uns in Kürze.' }
  form.name = ''
  form.email = ''
  form.message = ''
}
</script>

<style scoped>
.contact-page {
  padding: 4rem 0;
  background-color: #f8f9fa;
  min-height: calc(100vh - 64px - 200px);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

.contact-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 4rem;
}

@media (min-width: 768px) {
  .contact-grid {
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
}

.contact-info h1 {
  font-size: 2.5rem;
  color: var(--secondary, #2c3e50);
  margin-bottom: 0.5rem;
}

.subtitle {
  font-size: 1.2rem;
  color: #666;
  margin-bottom: 3rem;
}

.info-item {
  margin-bottom: 2rem;
}

.info-item h3 {
  font-size: 1.1rem;
  color: var(--primary, #3498db);
  margin-bottom: 0.5rem;
}

.info-item p, .info-item a {
  color: #444;
  font-size: 1.1rem;
  line-height: 1.6;
  text-decoration: none;
}

.info-item a:hover {
  color: var(--primary, #3498db);
}

.contact-form-wrapper {
  background: white;
  padding: 2.5rem;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.05);
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--secondary, #2c3e50);
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 0.8rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-family: inherit;
  font-size: 1rem;
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--primary, #3498db);
}

.status-msg {
  margin-top: 1rem;
  padding: 0.8rem;
  border-radius: 6px;
  text-align: center;
}

.status-msg.success {
  background-color: #d4edda;
  color: #155724;
}
</style>
