import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'https://xn--raunko-j2a.si',
    headless: true,
    screenshot: 'only-on-failure',
  },
})
