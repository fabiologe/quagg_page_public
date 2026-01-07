import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

try {
  const app = createApp(App)

  app.use(createPinia())
  app.use(router)

  app.mount('#app')
} catch (error) {
  console.error('Failed to initialize app:', error)
  document.body.innerHTML = `
    <div style="padding: 2rem; text-align: center; font-family: sans-serif;">
      <h1>Fehler beim Laden der Anwendung</h1>
      <p>Bitte laden Sie die Seite neu oder kontaktieren Sie den Support DU DUMMKOPP.</p>
      <pre style="text-align: left; background: #f5f5f5; padding: 1rem; margin-top: 1rem; border-radius: 4px;">${error.message}</pre>
    </div>
  `
}

