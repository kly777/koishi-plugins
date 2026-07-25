import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['external/*/src/__tests__/**/*.spec.ts'],
    testTimeout: 10000,
    server: {
      deps: {
        inline: [
          'koishi',
          '@koishijs/loader',
          '@koishijs/core',
          '@cordisjs/core',
          'cosmokit',
          'satoria',
        ],
      },
    },
  },
})
