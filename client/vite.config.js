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
        }
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
    host: '0.0.0.0', // <--- Hinzufügen: Erlaubt Zugriff von außen/durch Tunnel
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
  }
}
)
