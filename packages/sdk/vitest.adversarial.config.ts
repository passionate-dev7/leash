import { defineConfig } from 'vitest/config'

/**
 * The adversarial suite talks to Moderato. It is slow, it costs faucet tokens, and it runs
 * serially because every case shares one access key and one budget.
 */
export default defineConfig({
  test: {
    include: ['test/adversarial/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 300_000,
    fileParallelism: false,
    sequence: { concurrent: false },
    reporters: ['verbose'],
  },
})
