// Smoke test of the web app: start a library, add a paper, annotate it, save,
// reload, and the annotation is still there (saved inside the PDF).
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

const title = 'A Tiny Paper for End-to-End Tests';

// The library lives in the browser's private storage (OPFS), as in browsers
// without the File System Access API: a folder picker can't be driven headless.
// On the whole context, since each paper opens in its own tab.
test.beforeEach(async ({ context }) => {
	await context.addInitScript(() => {
		// On the prototype (Chrome) or the window itself (headless shell).
		Reflect.deleteProperty(Window.prototype, 'showDirectoryPicker');
		Reflect.deleteProperty(window, 'showDirectoryPicker');
	});
});

/** Console errors and uncaught exceptions of a page. */
function errors(page: Page) {
	const list: string[] = [];
	page.on('console', (m: ConsoleMessage) => {
		// The example library isn't served by `vite preview` (Pages gets it from a release).
		if (m.type() === 'error' && !m.location().url.includes('/starter/')) list.push(m.text());
	});
	page.on('pageerror', (e) => list.push(String(e)));
	return list;
}

async function startLibrary(page: Page) {
	await page.goto('./');
	await page.getByRole('button', { name: 'Start a library' }).click();
	await page.getByRole('button', { name: 'Start empty' }).click();
}

test('the library loads without console errors', async ({ page }) => {
	const errs = errors(page);
	await startLibrary(page);
	await expect(page.getByRole('button', { name: 'Add papers' })).toBeVisible();
	expect(errs).toEqual([]);
});

test('add a paper, annotate, save, reload: the annotation stays', async ({ page, context }) => {
	await startLibrary(page);

	// Add the PDF through the "+" panel's file picker.
	await page.getByRole('button', { name: 'Add papers' }).click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: /Drop PDF files/ }).click();
	await (await chooser).setFiles(`${test.info().project.testDir}/fixtures/paper.pdf`);
	const card = page.getByRole('button', { name: new RegExp(title) });
	await expect(card).toBeVisible();

	// Opening a paper opens its own tab.
	const tab = context.waitForEvent('page');
	await card.click();
	const reader = await tab;
	const errs = errors(reader);
	const firstPage = reader.locator('[data-pdf-page]').first();
	await expect(firstPage.locator('[data-pdf-canvas]')).toBeVisible();

	// A box, dragged over the title.
	await reader.getByRole('button', { name: 'Box a region' }).click();
	const box = (await firstPage.boundingBox())!;
	await reader.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.06);
	await reader.mouse.down();
	await reader.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.12, { steps: 5 });
	await reader.mouse.up();
	await expect(firstPage.locator('[data-pdf-annotation]')).toHaveCount(1);
	// A new box asks for a note (focused): type one, Enter keeps it.
	await expect(reader.getByRole('dialog', { name: 'Annotation' }).getByRole('textbox', { name: 'Add a note…' })).toBeFocused();
	await reader.keyboard.type('Checked by the smoke test');
	await reader.keyboard.press('Enter');

	await expect(reader.getByRole('button', { name: 'Unsaved changes: save now' })).toBeVisible();
	await reader.keyboard.press('ControlOrMeta+s');
	await expect(reader.getByRole('button', { name: 'Annotations are saved in the PDF' })).toBeVisible();

	await reader.reload();
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-annotation]')).toHaveCount(1);
	await expect(reader.getByText('Checked by the smoke test').first()).toBeAttached();
	expect(errs).toEqual([]);
});
