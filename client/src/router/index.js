import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/home'
    },
    {
      path: '/home',
      name: 'home',
      component: () => import('@/views/HomeView.vue')
    },
    {
      path: '/projects',
      name: 'projects',
      component: () => import('@/views/public/pages/ProjectsView.vue')
    },
    {
      path: '/contact',
      name: 'contact',
      component: () => import('@/views/public/pages/ContactView.vue')
    },
    {
      path: '/tools',
      name: 'tools',
      component: () => import('@/views/public/tools/ToolsDashboard.vue')
    },
    {
      path: '/tools/flood-check',
      name: 'flood-check',
      component: () => import('@/features/flood-check/views/FloodCheckView.vue'),
      meta: { layout: 'public' }
    },
    {
      path: '/tools/flood-wave',
      name: 'flood-wave',
      component: () => import('@/features/flood-wave/views/FloodWaveView.vue'),
      meta: { layout: 'public' }
    },
    {
      path: '/tools/mass-calculator',
      name: 'mass-calculator',
      component: () => import('@/features/mass-calculator/views/MassCalculatorView.vue'),
      meta: { layout: 'public' }
    },
    {
      path: '/tools/pipe-hydraulics',
      name: 'pipe-hydraulics',
      component: () => import('@/features/PipeHydraulics/views/PipeHydraulicsView.vue'),
      meta: { layout: 'public' }
    },
    {
      path: '/tools/isybau',
      name: 'isybau',
      component: () => import('@/features/isybau/views/IsybauMain.vue'),
      meta: { layout: 'public' }
    },
    {
      path: '/tools/flood-2d',
      name: 'Flood2D',
      component: () => import('@/features/flood-2D/views/Flood2DMain.vue'),
      meta: { layout: 'public' }
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/features/auth/LoginView.vue'),
      meta: { layout: 'public' }
    },
    {
      path: '/intern',
      name: 'intern',
      component: () => import('@/views/intern/InternDashboardView.vue'),
      meta: { layout: 'intern', requiresAuth: true, role: 'INTERNAL' }
    },
    {
      path: '/client',
      name: 'client',
      component: () => import('@/views/client/ClientProjectsView.vue'),
      meta: { layout: 'client', requiresAuth: true, role: 'CLIENT' }
    },
    {
      path: '/intern/library',
      name: 'library',
      component: () => import('@/views/intern/LibraryView.vue'),
      meta: { layout: 'intern', requiresAuth: true, role: 'INTERNAL' }
    },
    {
      path: '/intern/library/view/:id',
      name: 'document-view',
      component: () => import('@/views/intern/DocumentView.vue'),
      meta: { layout: 'empty', requiresAuth: true, role: 'INTERNAL' }
    },
    {
      path: '/intern/projects',
      name: 'intern-projects',
      component: () => import('@/views/intern/ProjectsView.vue'),
      meta: { layout: 'intern', requiresAuth: true, role: 'INTERNAL' }
    },
    {
      path: '/intern/communication',
      name: 'communication-dashboard',
      component: () => import('@/views/intern/CommunicationDashboard.vue'),
      meta: { layout: 'intern', requiresAuth: true, role: 'INTERNAL' }
    },
    {
      path: '/projects/:id',
      name: 'project-detail',
      component: () => import('@/views/shared/ProjectDetailView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/hybrid-workspace',
      name: 'hybrid-workspace',
      component: () => import('@/features/projects/ProjectWorkspace.vue'),
      meta: { layout: 'intern', requiresAuth: true }
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue')
    }
  ]
})

// Navigation Guards
router.beforeEach((to, from, next) => {
  try {
    const authStore = useAuthStore()

    // Prüfe ob Route Auth benötigt
    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
      next({ name: 'login', query: { redirect: to.fullPath } })
      return
    }

    // Prüfe ob spezifische Rolle benötigt wird
    if (to.meta.role && authStore.user?.role !== to.meta.role) {
      next({ name: 'home' })
      return
    }

    next()
  } catch (error) {
    console.error('Router guard error:', error)
    next()
  }
})

export default router

