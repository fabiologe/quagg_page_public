import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || null)
  const userStr = localStorage.getItem('user')
  const user = ref(userStr ? JSON.parse(userStr) : null)

  const isAuthenticated = computed(() => !!token.value)
  const userRole = computed(() => user.value?.role || null)

  // -- RBAC Getters --
  // Dürfen globale, nicht zugewiesene E-Mails sehen (info@quagg-engineering.org) und zuweisen
  const canManageGlobalInbox = computed(() => ['ADMIN', 'INTERNAL_LEAD', 'INTERNAL'].includes(userRole.value))
  
  // Dürfen E-Mails innerhalb spezifischer Projekte sehen
  const canViewAssignedEmails = computed(() => ['ADMIN', 'INTERNAL_LEAD', 'INTERNAL', 'STUDENT', 'CLIENT'].includes(userRole.value))


  function setAuth(newToken, newUser) {
    token.value = newToken
    user.value = newUser
    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(newUser))
  }

  function clearAuth() {
    token.value = null
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  return {
    token,
    user,
    isAuthenticated,
    userRole,
    canManageGlobalInbox,
    canViewAssignedEmails,
    setAuth,
    clearAuth
  }
})

