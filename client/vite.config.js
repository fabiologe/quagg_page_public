import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { templateCompilerOptions } from '@tresjs/core'
import { fileURLToPath, URL } from 'node:url'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(templateCompilerOptions),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/web-ifc/*.wasm',
          dest: ''
        },
        {
          src: 'node_modules/@thatopen/fragments/dist/Worker/worker.mjs',
          dest: ''
        },
        // Middleware-Dateien die vom BMI-Worker zur Laufzeit per fetch() geladen werden.
        // Sie liegen im gleichen assets/-Verzeichnis wie der Worker-Bundle.
        // KEIN Vite-Bundle: werden 1:1 kopiert damit der Worker sie per URL finden kann.
        {
          src: 'src/features/flood-2D/middleware/OutputProcessor.js',
          dest: 'assets'
        },
        {
          src: 'src/features/flood-2D/middleware/InputGenerator.js',
          dest: 'assets'
        },
        {
          src: 'src/features/flood-2D/middleware/Rasterizer.js',
          dest: 'assets'
        },
        {
          src: 'src/features/flood-2D/middleware/BoundaryTools.js',
          dest: 'assets'
        },
        {
          src: 'src/features/flood-2D/middleware/Hydraulics.js',
          dest: 'assets'
        },
        {
          src: 'src/features/flood-2D/middleware/ASCParser.js',
          dest: 'assets'
        },
      ]
    }),
    // PWA NUR für den PDF-Editor: Scope /pdf-editor, handgeschriebener
    // Mini-SW (injectManifest), Registrierung ausschließlich in
    // PdfEditorView — die übrige Site wird nie vom Service Worker
    // kontrolliert (kein Stale-Index-Risiko für die anderen Tools).
    // Precache bewusst winzig; die schweren IFC-/Flood-Chunks kommen
    // NIE ins Precache-Manifest.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/features/pdfeditor/pwa',
      filename: 'sw.js',
      injectRegister: null,
      manifest: {
        id: '/pdf-editor',
        name: 'Quagg PDF',
        short_name: 'Quagg PDF',
        description: 'PDF ansehen, zeichnen, messen, kommentieren und signieren - auch offline.',
        lang: 'de',
        start_url: '/pdf-editor',
        scope: '/pdf-editor',
        display: 'standalone',
        background_color: '#e9e7e2',
        theme_color: '#0f766e',
        icons: [
          { src: '/icons/pdf-editor/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pdf-editor/icon-256.png', sizes: '256x256', type: 'image/png' },
          { src: '/icons/pdf-editor/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/pdf-editor/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Installierte App als PDF-Handler des Betriebssystems (Chromium).
        // Die HANDLER-Icons sind Pflicht fürs Explorer-DATEISYMBOL: Windows
        // baut das .pdf-Icon aus dieser Reihe (16/32/48/256) — ohne sie
        // zeigen zugewiesene PDFs nur ein weißes Blatt.
        file_handlers: [
          {
            action: '/pdf-editor',
            accept: { 'application/pdf': ['.pdf'] },
            icons: [
              { src: '/icons/pdf-editor/icon-16.png', sizes: '16x16', type: 'image/png' },
              { src: '/icons/pdf-editor/icon-32.png', sizes: '32x32', type: 'image/png' },
              { src: '/icons/pdf-editor/icon-48.png', sizes: '48x48', type: 'image/png' },
              { src: '/icons/pdf-editor/icon-256.png', sizes: '256x256', type: 'image/png' },
            ],
          },
        ],
        // Doppelklick auf eine weitere PDF → neuer TAB im laufenden Fenster.
        // 'focus-existing' (NICHT 'navigate-existing'!): navigate-existing
        // lädt das Fenster auf die Start-URL NEU — der offene Editor samt
        // Tabs wird abgeräumt, was wie „die App schließt sich" aussieht.
        // focus-existing holt das Fenster nur nach vorn und liefert die
        // Datei an den laufenden launchQueue-Consumer → neuer Tab, kein
        // Reload, nichts geht verloren.
        launch_handler: { client_mode: 'focus-existing' },
        // Android: „Teilen → Quagg PDF" schickt die PDF per POST an den
        // Service Worker (Empfänger in pwa/sw.js, Abholung GeteilteDatei.js).
        share_target: {
          action: '/pdf-editor/teilen',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [{ name: 'pdf', accept: ['application/pdf'] }],
          },
        },
      },
      injectManifest: {
        globPatterns: ['index.html', 'manifest.webmanifest', 'icons/pdf-editor/*.png'],
      },
      devOptions: { enabled: false },
    })
  ],
  assetsInclude: ['**/*.ifc'],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    // Build-Verzeichnisse nicht beobachten. Ein Produktionsbau schreibt
    // nach dist_neu und legt es dann über dist um — der Dev-Server hat
    // daraufhin bei jeder dieser Dateibewegungen die Seite im Browser neu
    // geladen („page reload dist_neu/index.html"), mitten in der Arbeit.
    watch: {
      ignored: ['**/dist/**', '**/dist_neu/**', '**/dist_alt/**']
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/FastAPI')
      },
      '/FastAPI': {
        target: 'http://localhost:8001',
        changeOrigin: true
      },
      // Flood2D-Solver-API (quagg-api): gleicher Weg wie in Prod über nginx
      '/flood2dpod': {
        target: 'http://localhost:8001',
        changeOrigin: true
      },
      '/kostra-api': {
        target: 'https://dva3.de/kostra-rest',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kostra-api/, '')
      }
    }
  },
  /* console.log und console.debug werden beim Bauen entfernt, console.warn und
     console.error NICHT.
     Warum die Trennung: im isybau-Modul stehen achtzehn bewusste Diagnose-
     Ausgaben - der SWMM-Lauf, der Binaerparser der .out-Datei, der KOSTRA-
     Abruf. Die sind im Betrieb Rauschen. Warnungen und Fehler dagegen sind das
     Einzige, was bei einem Problem beim Nutzer noch Auskunft gibt; wer sie
     mitentfernt, macht jede Ferndiagnose unmoeglich.
     `pure` statt `drop`: esbuild darf die Aufrufe als nebenwirkungsfrei
     ansehen und beim Minimieren wegfallen lassen. `drop: ['console']` haette
     ALLE entfernt, auch error. */
  esbuild: {
    pure: ['console.log', 'console.debug'],
  },
  worker: {
    format: 'es',
  }
}
)
