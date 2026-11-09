import { defineConfig, devices } from "@playwright/test";

// Browser tests run against the static export, served by scripts/serve.mjs. The project tests
// exercise the real applications inside the workspace, served by their demo services (demos/aiws,
// demos/qrs). Build the site with NEXT_PUBLIC_AIWS_STUDIO_URL=http://localhost:8790 and
// NEXT_PUBLIC_QRS_STUDIO_URL=http://localhost:8766; with AIWS_DIR and QRS_DIR set, the services are
// started here too. Without them, the tests that need an application are skipped. Site and studios
// share the hostname localhost, so they are the same site and the session cookies work in the frame.
const SITE_PORT = 4173;
const STUDIO_PORT = 8790;
const QRS_PORT = 8766;
const CRITERIA_PORT = 8777;

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  timeout: 60_000,
  use: { baseURL: `http://localhost:${SITE_PORT}`, acceptDownloads: true },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    // Firefox and WebKit, where they are installed (Playwright's own image has them): ALL_BROWSERS=1.
    // Devices are emulated: a viewport, touch and a user agent, not the real phone or its browser.
    ...(process.env.ALL_BROWSERS
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } } },
          { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
          { name: "mobile-webkit", use: { ...devices["iPhone 15"] } },
        ]
      : []),
  ],
  webServer: [
    ...(process.env.AIWS_DIR
      ? [
          {
            command: "node demos/aiws/gateway.mjs",
            url: `http://127.0.0.1:${STUDIO_PORT}/healthz`,
            env: { PORT: String(STUDIO_PORT), AIWS_FRAME_ANCESTORS: `http://localhost:${SITE_PORT}`, AIWS_DEMO_POSTS_PER_CLIENT: "300", AIWS_DEMO_RUNS_PER_CLIENT: "3000" },
            reuseExistingServer: !process.env.CI,
          },
        ]
      : []),
    // Quant Research Studio: QRS_DIR is a checkout at demos/qrs/COMMIT, set up (demos/qrs/README.md).
    // Every test is a new visitor, all from one address, so the service runs with more sessions, and
    // more per client, than in production.
    ...(process.env.QRS_DIR
      ? [
          {
            command: `${process.env.QRS_DIR}/.venv/bin/python demos/qrs/server.py`,
            url: `http://127.0.0.1:${QRS_PORT}/healthz`,
            env: { PORT: String(QRS_PORT), QRS_FRAME_ANCESTORS: `http://localhost:${SITE_PORT}`, QRS_DEMO_SESSIONS: "60", QRS_DEMO_SESSIONS_PER_CLIENT: "60" },
            reuseExistingServer: !process.env.CI,
          },
        ]
      : []),
    // Criteria Chat: CRITERIA_SITE is the build from demos/criteria/build.sh.
    ...(process.env.CRITERIA_SITE
      ? [
          {
            command: "node demos/criteria/server.mjs",
            url: `http://127.0.0.1:${CRITERIA_PORT}/healthz`,
            env: { PORT: String(CRITERIA_PORT), CRITERIA_SITE: process.env.CRITERIA_SITE, CRITERIA_FRAME_ANCESTORS: `http://localhost:${SITE_PORT}` },
            reuseExistingServer: !process.env.CI,
          },
        ]
      : []),
    { command: "node scripts/serve.mjs", url: `http://127.0.0.1:${SITE_PORT}/`, env: { PORT: String(SITE_PORT) }, reuseExistingServer: !process.env.CI },
  ],
});
