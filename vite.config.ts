import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { configDefaults } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    test: {
      exclude: [...configDefaults.exclude, '**/.worktrees/**', '**/.codex-test-tmp/**'],
    },
    build: {
      assetsInlineLimit: 4096,
      chunkSizeWarningLimit: 1500,
    },
  }
})
