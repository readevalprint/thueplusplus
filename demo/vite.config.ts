// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: '/',
  plugins: [vue(), tailwindcss()],
  publicDir: '../build',
  build: {
    assetsInlineLimit: 0,
    target: 'es2022',
    modulePreload: {
      resolveDependencies(_url, deps) {
        return deps.filter(dep => !dep.includes('editor-monaco'))
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/monaco-editor')) return 'editor-monaco'
          if (id.includes('node_modules/@vueuse') || id.includes('node_modules/reka-ui')) return 'ui-vendor'
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
  test: {
    environment: 'jsdom',
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
