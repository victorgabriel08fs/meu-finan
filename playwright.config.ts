import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the production build and the local demo database.
// Run with `npm run test:e2e` (resets the demo data, builds, then tests).
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [{ name: "celular", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/manifest.webmanifest`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: "pglite:.data/pglite",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
    },
  },
});
