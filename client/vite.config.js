import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { templateCompilerOptions } from '@tresjs/core'
import { fileURLToPath, URL } from 'node:url'
import { viteStaticCopy } from 'vite-plugin-static-copy'

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
    })
  ],
  assetsInclude: ['**/*.ifc'],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
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
      '/kostra-api': {
        target: 'https://dva3.de/kostra-rest',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kostra-api/, '')
      }
    }
  },
  worker: {
    format: 'es',
  }
}
)
