import { defineConfig, devices } from '@playwright/test';

// EquitySight smoke-test config.
// Use BASE_URL env var to target a deploy preview or production.
//   npm test                       # default https://equitysight.app
//   BASE_URL=http://localhost:8888 npm test
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.BASE_URL || 'https://equitysight.app',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
  ],
});
