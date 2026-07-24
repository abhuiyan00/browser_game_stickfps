/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    // e2e/ holds Playwright specs (real browser, real server) — a different test runner/API,
    // not vitest's jsdom unit tests.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
})
