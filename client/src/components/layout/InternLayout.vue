<template>
  <div class="intern-layout">
    <header class="intern-header">
      <h1>Quagg - Intern</h1>
      <nav class="intern-nav">
        <router-link to="/intern">Dashboard</router-link>
        <router-link to="/intern/projects">Projekte</router-link>
        <router-link to="/intern/library">Bibliothek</router-link>
        <router-link to="/intern/communication">Kommunikation</router-link>
      </nav>
      <div class="intern-user">
        <span>{{ user?.name || 'Benutzer' }}</span>
        <button @click="handleLogout">Abmelden</button>
      </div>
    </header>
    <main class="intern-main">
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
.intern-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.intern-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 2rem;
  background-color: #2c3e50;
  color: white;
}

.intern-nav {
  display: flex;
  gap: 2rem;
}

.intern-nav a {
  color: white;
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.intern-nav a:hover,
.intern-nav a.router-link-active {
  background-color: rgba(255, 255, 255, 0.1);
}

.intern-user {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.intern-user button {
  padding: 0.5rem 1rem;
  background-color: #e74c3c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.intern-main {
  flex: 1;
  padding: 2rem;
  background-color: #f5f5f5;
}

@media (max-width: 768px) {
  .intern-header {
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }

  .intern-nav {
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }

  .intern-user {
    width: 100%;
    justify-content: center;
  }

  .intern-main {
    padding: 1rem;
  }
}
</style>

