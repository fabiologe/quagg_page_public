<template>
  <InternLayout>
    <div class="intern-dashboard">
      <h1>Interner Bereich</h1>
      <p>Wähle einen Arbeitsbereich.</p>
      <nav class="bereiche" aria-label="Arbeitsbereiche">
        <router-link v-for="b in bereiche" :key="b.pfad" :to="b.pfad" class="bereich">
          <strong>{{ b.titel }}</strong>
          <span>{{ b.text }}</span>
        </router-link>
      </nav>
    </div>
  </InternLayout>
</template>

<script setup>
import { computed } from 'vue'
import InternLayout from '@/components/layout/InternLayout.vue'
import { useAuthStore } from '@/stores/useAuthStore'

const authStore = useAuthStore()

const ALLE_BEREICHE = [
  { pfad: '/intern/projects', titel: 'Projekte', text: 'Portfolio, Projektakten, Leistungsstand', minRole: 'WERKSTUDENT' },
  { pfad: '/mail', titel: 'Mail', text: 'Posteingang, Antworten, Zuordnung zu Projekten', minRole: 'WERKSTUDENT' },
  { pfad: '/intern/kalender', titel: 'Kalender', text: 'Termine, Einladungen, Fristen, Abo für Outlook/Google', minRole: 'WERKSTUDENT' },
  { pfad: '/intern/pedant', titel: 'kleiner Pedant', text: 'Belege, Rechnungen, Bank, DATEV', minRole: 'ADMIN' },
  { pfad: '/intern/library', titel: 'Bibliothek', text: 'Normen und Literatur', minRole: 'WERKSTUDENT' },
  { pfad: '/intern/nutzer', titel: 'Nutzer', text: 'Konten, Rollen, Passwörter', minRole: 'ADMIN' },
]

const bereiche = computed(() => ALLE_BEREICHE.filter(b => authStore.hatMindestens(b.minRole)))
</script>

<style scoped>
.intern-dashboard { max-width: 1200px; margin: 0 auto; }
.bereiche { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; margin-top: 1.5rem; }
.bereich { display: flex; flex-direction: column; gap: .3rem; padding: 1rem 1.1rem; border: 1px solid currentColor; border-radius: 6px; text-decoration: none; color: inherit; }
.bereich span { opacity: .75; font-size: .92rem; }
</style>
