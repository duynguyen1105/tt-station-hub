import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Vercel and CI both run UTC. Pin it so a zone-dependent bug fails here
    // rather than only in CI (see tests/format.test.ts).
    env: { TZ: 'UTC' },
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
