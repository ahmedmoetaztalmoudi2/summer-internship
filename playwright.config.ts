import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/generated',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'playwright-report.json' }]],
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
