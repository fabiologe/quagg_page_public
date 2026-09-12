import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'
import { entscheide } from './guard'

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
      path: '/tools/afs63',
      name: 'afs63',
      component: () => import('@/features/afs63/views/Afs63View.vue'),
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
      path: '/tools/saintv-1d',
      name: 'saintv-1d',
      component: () => import('@/features/isybau/views/IsybauMain.vue'),
      meta: { layout: 'public' }
    },
    {
      path: '/tools/isyifc',
      name: 'isyifc',
      component: () => import('@/features/isyifc/views/IsyIfcMain.vue'),
      meta: { layout: 'public' }
    },
    {
      path: '/tools/flood-2d',
      name: 'Flood2D',
      component: () => import('@/features/flood-2D/views/Flood2DMain.vue'),
      meta: { layout: 'public' }
    },
    {
      path: '/tools/flood-2d/viewer',
      name: 'Flood2DViewer',
      component: () => import('@/features/flood-2D/views/ResultViewerMain.vue'),
      meta: { layout: 'empty' }
    },
    {
      path: '/tools/flood-3d',
      name: 'Flood3D',
      component: () => import('@/features/flood-3D/views/Flood3DPreMain.vue'),
      meta: { layout: 'empty' }
    },
    {
      // alte Viewer-/Editor-Deeplinks (?runs=…, ?case=…) weiterleiten —
      // der Nachweis-Viewer lebt jetzt als Phase „Ergebnis" im Projekt
      path: '/tools/flood-3d/viewer',
      redirect: (to) => ({ path: '/tools/flood-3d', query: to.query })
    },
    {
      path: '/tools/flood-3d/editor',
      redirect: (to) => ({ path: '/tools/flood-3d', query: to.query })
    },
    {
      // CDE: intern. Bis 31.08.2026 lag die Route OHNE Guard und stand zugleich
      // auf dem oeffentlichen /tools-Dashboard — sie zeigt aber Projektakten,
      // Dokumentregister, Mengen und Kosten. Ohne Anmeldung lieferte der Server
      // zwar nur 401, doch die Seite tat so, als koennte sie etwas, und schwieg
      // dazu. Mit Guard ist die Rollenfrage ueberhaupt erst stellbar
      // (Kunde / Werkstudent / interner Bearbeiter).
      // WERKSTUDENT wie /mail und die uebrigen internen Werkzeuge; EXTERN
      // (Kunden) bleibt vorerst aussen vor — das Kundenportal ist ein eigener
      // Weg, und Lockern ist leichter als Zurueckziehen.
      path: '/cde',
      name: 'cde',
      component: () => import('@/features/cde/views/CdeView.vue'),
      meta: { layout: 'empty', requiresAuth: true, minRole: 'WERKSTUDENT' }
    },
    {
      path: '/isyscan',
      name: 'isyscan-poc',
      component: () => import('@/features/isyscan/views/IsyScanView.vue'),
      meta: { layout: 'public' }
    },
    {
      // Standalone-PDF-Editor: eigener Tab ohne App-Chrome (Muster /cde).
      // :docId? erlaubt Deeplinks auf ein in IndexedDB liegendes Dokument.
      path: '/pdf-editor/:docId?',
      name: 'pdf-editor',
      component: () => import('@/features/pdfeditor/views/PdfEditorView.vue'),
      meta: { layout: 'empty' }
    },
    {
      // Standalone-Mail-Client: eigener Vollbild-Tab ohne App-Chrome (Muster
      // /pdf-editor), aber auth-geschützt wie /office. Keine PWA.
      path: '/mail',
      name: 'mail',
      component: () => import('@/features/mailclient/views/MailClientView.vue'),
      meta: { layout: 'empty', requiresAuth: true, minRole: 'WERKSTUDENT' }
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
      meta: { layout: 'intern', requiresAuth: true, minRole: 'WERKSTUDENT' }
    },
    {
      path: '/client',
      name: 'client',
      component: () => import('@/views/client/ClientProjectsView.vue'),
      meta: { layout: 'client', requiresAuth: true, minRole: 'EXTERN' }
    },
    {
      path: '/intern/library',
      name: 'library',
      component: () => import('@/views/intern/LibraryView.vue'),
      meta: { layout: 'intern', requiresAuth: true, minRole: 'WERKSTUDENT' }
    },
    {
      path: '/intern/library/view/:id',
      name: 'document-view',
      component: () => import('@/views/intern/DocumentView.vue'),
      meta: { layout: 'empty', requiresAuth: true, minRole: 'WERKSTUDENT' }
    },
    {
      // Volltexttreffer werden über ihren Dateinamen geöffnet statt über eine
      // doc_id — der Volltextindex ist aktuell, die Bibliothekspfade oft nicht.
      path: '/intern/library/file',
      name: 'document-view-file',
      component: () => import('@/views/intern/DocumentView.vue'),
      meta: { layout: 'empty', requiresAuth: true, minRole: 'WERKSTUDENT' }
    },
    {
      // Alte Triage-Inbox — vom Mail-Client (/mail, Ordner „Nicht zugewiesen") abgelöst
      path: '/intern/inbox',
      redirect: '/mail'
    },
    {
      path: '/intern/projects',
      name: 'intern-projects',
      component: () => import('@/views/intern/ProjectsView.vue'),
      meta: { layout: 'intern', requiresAuth: true, minRole: 'WERKSTUDENT' }
    },
    {
      path: '/office',
      name: 'office',
      component: () => import('@/features/projects/views/OfficeView.vue'),
      meta: { layout: 'empty', requiresAuth: true, minRole: 'WERKSTUDENT' }
    },
    {
      path: '/intern/projects/:id(\\d+)',
      name: 'intern-projekt-akte',
      component: () => import('@/features/projects/views/ProjektAkteView.vue'),
      meta: { layout: 'intern', requiresAuth: true, minRole: 'WERKSTUDENT' }
    },
    {
      // Altes Kommunikations-Dashboard (Mock-Daten) — abgelöst durch /mail
      path: '/intern/communication',
      redirect: '/mail'
    },
    {
      path: '/intern/pedant',
      name: 'intern-pedant',
      component: () => import('@/features/kleiner-pedant/views/PedantView.vue'),
      // Buchhaltung: nur ADMIN (das Backend-Gate ist der Türsteher, hier nur Kosmetik)
      meta: { layout: 'intern', requiresAuth: true, minRole: 'ADMIN' }
    },
    {
      path: '/intern/kalender',
      name: 'intern-kalender',
      component: () => import('@/features/kalender/views/KalenderView.vue'),
      meta: { layout: 'intern', requiresAuth: true, minRole: 'WERKSTUDENT' }
    },
    {
      path: '/intern/nutzer',
      name: 'intern-nutzer',
      component: () => import('@/features/nutzer/views/NutzerView.vue'),
      meta: { layout: 'intern', requiresAuth: true, minRole: 'ADMIN' }
    },
    {
      // Eigenes Konto (Passwort ändern) — für jede Rolle, auch EXTERN
      path: '/konto',
      name: 'konto',
      component: () => import('@/features/auth/views/KontoView.vue'),
      meta: { requiresAuth: true, minRole: 'EXTERN' }
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue')
    }
  ]
})

// Navigation Guard — Logik in ./guard.js (rein, getestet)
router.beforeEach((to, from, next) => {
  try {
    const ziel = entscheide(to, useAuthStore())
    if (ziel) next(ziel)
    else next()
  } catch (error) {
    console.error('Router guard error:', error)
    next()
  }
})

export default router

