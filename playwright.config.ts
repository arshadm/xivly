// End-to-end smoke test (bun run test:e2e): the web build (`bun run build:web`),
// served by `vite preview`, in Chromium. pdf.js 6 needs Chrome 145+: Playwright's
// own Chromium is recent enough; XIVLY_E2E_BROWSER points at another Chromium
// (e.g. Brave) instead.
import { defineConfig } from '@playwright/test';

const port = 1483;
const executablePath = process.env.XIVLY_E2E_BROWSER || undefined;

export default defineConfig({
	testDir: 'tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	timeout: 30_000,
	// Several readers render PDFs at once (one per worker): a reload can take a while.
	expect: { timeout: 10_000 },
	use: {
		baseURL: `http://localhost:${port}/xivly/`,
		trace: 'retain-on-failure'
	},
	// The host's own user agent (no device preset): the app picks ⌘ or Ctrl from it, as
	// does ControlOrMeta.
	projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: { executablePath } } }],
	webServer: {
		// The same base path as the build (`bun run build:web`).
		command: `vite preview --port ${port} --strictPort`,
		env: { BASE_PATH: '/xivly', XIVLY_WEB: '1' },
		url: `http://localhost:${port}/xivly/`,
		reuseExistingServer: false
	}
});
