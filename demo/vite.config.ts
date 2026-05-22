import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  publicDir: '../build',
  build: {
    assetsInlineLimit: 0,
    target: 'es2022',
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
  test: {
    environment: 'jsdom',
  },
})
