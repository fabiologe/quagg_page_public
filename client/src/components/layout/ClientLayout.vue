<template>
  <div class="client-layout">
    <header class="client-header">
      <div class="header-left">
        <h1>Quagg - Kundenbereich</h1>
        <nav class="client-nav">
          <router-link to="/client" class="nav-link">Projekte</router-link>
          <router-link to="/library" class="nav-link">Bibliothek</router-link>
        </nav>
      </div>
      <div class="client-user">
        <span>{{ user?.name || 'Kunde' }}</span>
        <button @click="handleLogout">Abmelden</button>
      </div>
    </header>
    <main class="client-main">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'

const router = useRouter()
const authStore = useAuthStore()

const user = computed(() => authStore.user)

function handleLogout() {
  authStore.clearAuth()
  router.push('/login')
}
</script>

<style scoped>
.client-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.client-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 2rem;
  background-color: #3498db;
  color: white;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 2rem;
}

.client-nav {
  display: flex;
  gap: 1.5rem;
}

.nav-link {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s;
}

.nav-link:hover, .nav-link.router-link-active {
  color: white;
}

.client-user {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.client-user button {
  padding: 0.5rem 1rem;
  background-color: #e74c3c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.client-main {
  flex: 1;
  padding: 2rem;
  background-color: #f5f5f5;
}
</style>

