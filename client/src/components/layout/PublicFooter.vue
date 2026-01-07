<template>
  <footer class="landing-footer">
    <div class="container">
      <p>&copy; {{ new Date().getFullYear() }} Quagg Engineering. Alle Rechte vorbehalten.</p>
      
      <!-- Debug / Dev Tools (kept discreetly) -->
      <div class="dev-tools">
        <button @click="testBackendConnection" class="text-link">
          System Status prüfen
        </button>
        <span v-if="pingResult" class="status-msg">{{ pingResult }}</span>
      </div>
    </div>
  </footer>
</template>

<script setup>
import { ref } from 'vue'
import api from '@/services/api'

const pingResult = ref('')

async function testBackendConnection() {
  pingResult.value = '...'
  try {
    const response = await api.get('/api/ping')
    pingResult.value = `✅ ${response.data.message}`
    setTimeout(() => { pingResult.value = '' }, 3000)
  } catch (error) {
    pingResult.value = `❌ Offline`
    console.error(error)
  }
}
</script>

<style scoped>
.landing-footer {
  padding: 2rem 0;
  background: #1a252f;
  color: #7f8c8d;
  text-align: center;
  font-size: 0.9rem;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

.dev-tools {
  margin-top: 1rem;
  display: flex;
  justify-content: center;
  gap: 1rem;
  align-items: center;
}

.text-link {
  background: none;
  border: none;
  color: #7f8c8d;
  cursor: pointer;
  font-size: 0.8rem;
  text-decoration: underline;
}

.text-link:hover {
  color: white;
}

.status-msg {
  font-size: 0.8rem;
  color: #2ecc71;
}
</style>
