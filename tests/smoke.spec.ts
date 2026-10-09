// Smoke test of the web app: start a library, add a paper, annotate it, save,
// reload, and the annotation is still there (saved inside the PDF).
import { expect, test, type BrowserContext, type ConsoleMessage, type Page } from '@playwright/test';

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

/**
 * The paper's reader tab. Adding a paper opens it already (when the add is a
 * click), and opening the paper again from the library focuses that tab.
 */
async function readerTab(context: BrowserContext) {
	await expect.poll(() => context.pages().filter((p) => /read\?id=/.test(p.url())).length).toBe(1);
	return context.pages().find((p) => /read\?id=/.test(p.url()))!;
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

	// Each paper reads in its own tab.
	await card.click();
	const reader = await readerTab(context);
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
	// A new box asks for a note (focused): type one, then save right from the field.
	await expect(reader.getByRole('dialog', { name: 'Annotation' }).getByRole('textbox', { name: 'Add a note…' })).toBeFocused();
	await reader.keyboard.type('Checked by the smoke test');
	await expect(reader.getByRole('button', { name: 'Unsaved changes: save now' })).toBeVisible();
	await reader.keyboard.press('ControlOrMeta+s');
	await expect(reader.getByRole('button', { name: 'Annotations are saved in the PDF' })).toBeVisible();

	await reader.reload();
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-annotation]')).toHaveCount(1);
	await expect(reader.getByText('Checked by the smoke test').first()).toBeAttached();
	expect(errs).toEqual([]);
});

test('a note keeps its emoji: key 4 with the note tool, save, reload', async ({ page, context }) => {
	await startLibrary(page);
	await page.getByRole('button', { name: 'Add papers' }).click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: /Drop PDF files/ }).click();
	await (await chooser).setFiles(`${test.info().project.testDir}/fixtures/paper.pdf`);
	await page.getByRole('button', { name: new RegExp(title) }).click();
	const reader = await readerTab(context);
	const errs = errors(reader);
	const firstPage = reader.locator('[data-pdf-page]').first();
	await expect(firstPage.locator('[data-pdf-canvas]')).toBeVisible();

	// With the note tool, 4 picks 🤯 (not the 4th color); the new note shows it.
	await reader.getByRole('button', { name: 'Note', exact: true }).click();
	await reader.keyboard.press('4');
	const box = (await firstPage.boundingBox())!;
	await reader.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.2);
	const marker = firstPage.locator('[data-pdf-annotation-note] [data-part=emoji]');
	await expect(marker).toHaveText('🤯');
	await reader.keyboard.type('Big if true');
	await reader.keyboard.press('Enter');
	await reader.keyboard.press('ControlOrMeta+s');
	await expect(reader.getByRole('button', { name: 'Annotations are saved in the PDF' })).toBeVisible();

	await reader.reload();
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-annotation-note] [data-part=emoji]')).toHaveText('🤯');
	expect(errs).toEqual([]);
});

test('a text box is handwritten by default, and stays so after save and reload', async ({ page, context }) => {
	await startLibrary(page);
	await page.getByRole('button', { name: 'Add papers' }).click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: /Drop PDF files/ }).click();
	await (await chooser).setFiles(`${test.info().project.testDir}/fixtures/paper.pdf`);
	await page.getByRole('button', { name: new RegExp(title) }).click();
	const reader = await readerTab(context);
	const errs = errors(reader);
	const firstPage = reader.locator('[data-pdf-page]').first();
	await expect(firstPage.locator('[data-pdf-canvas]')).toBeVisible();

	await reader.getByRole('button', { name: 'Text', exact: true }).click();
	const box = (await firstPage.boundingBox())!;
	await reader.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.3);
	await reader.keyboard.type('Why does this work?');
	await reader.keyboard.press('ControlOrMeta+Enter');
	await reader.keyboard.press('ControlOrMeta+s');
	await expect(reader.getByRole('button', { name: 'Annotations are saved in the PDF' })).toBeVisible();

	await reader.reload();
	const text = reader.locator('[data-pdf-page]').first().locator('[data-pdf-annotation-freetext]');
	await expect(text).toHaveText('Why does this work?');
	await expect(text).toHaveAttribute('data-font', 'Handwritten');
	expect(await text.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"Shantell Sans"/);
	// The bundled file is served (under the base path) and used.
	const loaded = () => reader.evaluate(() => [...document.fonts].some((f) => f.family.replaceAll('"', '') === 'Shantell Sans' && f.status === 'loaded'));
	await expect.poll(loaded).toBe(true);
	expect(errs).toEqual([]);
});

test('one reader per paper: a second tab takes it over, annotations kept', async ({ page, context }) => {
	await startLibrary(page);
	await page.getByRole('button', { name: 'Add papers' }).click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: /Drop PDF files/ }).click();
	await (await chooser).setFiles(`${test.info().project.testDir}/fixtures/paper.pdf`);
	const card = page.getByRole('button', { name: new RegExp(title) });
	await expect(card).toBeVisible();

	await card.click();
	const first = await readerTab(context);
	const errs = errors(first);
	const firstPage = first.locator('[data-pdf-page]').first();
	await expect(firstPage.locator('[data-pdf-canvas]')).toBeVisible();

	// Opening the paper again finds its tab instead of opening another reader.
	await page.bringToFront();
	await card.click();
	await page.waitForTimeout(500);
	await readerTab(context);

	// An annotation, not saved yet.
	await first.bringToFront();
	await first.getByRole('button', { name: 'Box a region' }).click();
	const box = (await firstPage.boundingBox())!;
	await first.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.06);
	await first.mouse.down();
	await first.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.12, { steps: 5 });
	await first.mouse.up();
	await expect(firstPage.locator('[data-pdf-annotation]')).toHaveCount(1);
	await first.keyboard.type('Not saved yet');
	await first.keyboard.press('Enter');
	await expect(first.getByRole('button', { name: 'Unsaved changes: save now' })).toBeVisible();

	// A second reader of the same paper (a link, a restored tab) doesn't load it…
	const second = await context.newPage();
	await second.goto(first.url());
	await expect(second.getByText('This paper is open in another tab.')).toBeVisible();
	await expect(second.locator('[data-pdf-page]')).toHaveCount(0);
	// …until it takes it over: the first saves and lets go, the second shows the saved annotation.
	await second.getByRole('button', { name: 'Read it here' }).click();
	await expect(second.locator('[data-pdf-page]').first().locator('[data-pdf-annotation]')).toHaveCount(1);
	await expect(first.getByText('This paper is open in another tab.')).toBeVisible();
	expect(errs).toEqual([]);
});

test('a library of 1500 papers stays fast: only the cards on screen are rendered', async ({ page }) => {
	const errs = errors(page);
	await startLibrary(page);
	await page.evaluate(async () => {
		const papers = await (await navigator.storage.getDirectory()).getDirectoryHandle('papers', { create: true });
		await Promise.all(
			Array.from({ length: 1500 }, async (_, i) => {
				const dir = await papers.getDirectoryHandle(`p-${i}`, { create: true });
				const file = await (await dir.getFileHandle('paper.json', { create: true })).createWritable();
				await file.write(JSON.stringify({ title: `Paper ${i}`, authors: ['A. Author'], year: 2000 + (i % 26), tags: [`t${i % 40}`, i % 3 ? 'common' : 'rare'] }));
				await file.close();
			})
		);
	});
	await page.reload();
	const cards = page.locator('ul.grid > li');
	await expect(cards.first()).toBeVisible();
	expect(await cards.count()).toBeLessThan(200);

	const search = page.getByPlaceholder('Search papers');
	const start = Date.now();
	await search.fill('Paper 1499');
	await expect(cards).toHaveCount(1);
	await search.fill('');
	await expect.poll(() => cards.count()).toBeGreaterThan(10);
	// Generous for slow CI machines; the regression it guards against took ~18 s.
	expect(Date.now() - start).toBeLessThan(8000);

	// Tags: the most used first, the rest behind "more".
	await expect(page.locator('nav .flex-wrap > button').first()).toHaveText('#common');
	await expect(page.locator('nav').getByRole('button', { name: /\d+ more/ })).toBeVisible();
	expect(errs).toEqual([]);
});

test('bookmarks: add one, see it in the panel after a reload, jump to it from ⌘J', async ({ page, context }) => {
	await startLibrary(page);
	await page.getByRole('button', { name: 'Add papers' }).click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: /Drop PDF files/ }).click();
	await (await chooser).setFiles(`${test.info().project.testDir}/fixtures/paper.pdf`);
	await page.getByRole('button', { name: new RegExp(title) }).click();
	const reader = await readerTab(context);
	const errs = errors(reader);
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-canvas]')).toBeVisible();

	// The toolbar's bookmark button asks for a name too (Cancel adds nothing).
	await reader.getByRole('banner').getByRole('button', { name: 'Bookmark this spot' }).click();
	await reader.getByRole('dialog', { name: 'Add bookmark' }).getByRole('button', { name: 'Cancel' }).click();

	// ⌘D asks for a name, suggesting one.
	await reader.keyboard.press('ControlOrMeta+d');
	const name = reader.getByRole('dialog', { name: 'Add bookmark' }).getByRole('textbox');
	await expect(name).not.toHaveValue('');
	await name.fill('Main results');
	await name.press('Enter');

	await reader.keyboard.press('ControlOrMeta+Alt+6');
	await expect(reader.getByRole('button', { name: /Main results/ })).toBeVisible();
	// Shown at once, written just after (under a Web Lock): reload once it's on disk.
	const writing = async () => {
		const { held = [], pending = [] } = await navigator.locks.query();
		return [...held, ...pending].filter((l) => l.name?.startsWith('xivly:papers/')).length;
	};
	await expect.poll(() => reader.evaluate(writing)).toBe(0);
	await reader.reload();
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-canvas]')).toBeVisible();
	await reader.keyboard.press('ControlOrMeta+Alt+6');
	await expect(reader.getByRole('button', { name: /Main results/ })).toBeVisible();

	// ⌘J: type part of the name, ↵ jumps and closes the picker.
	await reader.keyboard.press('ControlOrMeta+j');
	const picker = reader.getByRole('combobox', { name: 'Bookmark name' });
	await expect(picker).toBeFocused();
	await picker.fill('main');
	await expect(reader.getByRole('option', { name: /Main results/ })).toBeVisible();
	await picker.press('Enter');
	await expect(picker).toBeHidden();

	// Removing asks first: Cancel keeps it, Remove removes it.
	const row = reader.getByRole('button', { name: /Main results/ });
	await row.hover();
	await reader.getByRole('button', { name: 'Remove Main results' }).click();
	const confirm = reader.getByRole('dialog', { name: /Remove the bookmark/ });
	await confirm.getByRole('button', { name: 'Cancel' }).click();
	await expect(row).toBeVisible();
	await row.hover();
	await reader.getByRole('button', { name: 'Remove Main results' }).click();
	await confirm.getByRole('button', { name: 'Remove' }).click();
	await expect(row).toBeHidden();
	expect(errs).toEqual([]);
});

test('the highlighter stays on, highlights selected text at once in its color, and remembers that color', async ({ page, context }) => {
	await startLibrary(page);
	await page.getByRole('button', { name: 'Add papers' }).click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: /Drop PDF files/ }).click();
	await (await chooser).setFiles(`${test.info().project.testDir}/fixtures/paper.pdf`);
	await page.getByRole('button', { name: new RegExp(title) }).click();
	const reader = await readerTab(context);
	const errs = errors(reader);
	const firstPage = reader.locator('[data-pdf-page]').first();
	await expect(firstPage.locator('[data-pdf-canvas]')).toBeVisible();

	const highlighter = reader.getByRole('button', { name: 'Highlight', exact: true });
	const swatch = (name: string) => reader.getByRole('group', { name: 'Color' }).getByRole('button', { name });
	/** Drag across a line of the page's text. */
	async function select(text: RegExp) {
		const box = (await firstPage.getByText(text).first().boundingBox())!;
		await reader.mouse.move(box.x + 2, box.y + box.height / 2);
		await reader.mouse.down();
		await reader.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
		await reader.mouse.up();
	}

	// It starts with its own color (the first one by default); pick another.
	await highlighter.click();
	await expect(swatch('Yellow')).toHaveAttribute('data-active');
	await swatch('Green').click();

	// Two selections, two highlights: no menu, no note to write, the tool stays on.
	await select(/Reading papers should be calm/);
	await expect(firstPage.locator('[data-pdf-annotation]')).toHaveCount(1);
	await select(/This one-page paper exists/);
	await expect(firstPage.locator('[data-pdf-annotation]')).toHaveCount(2);
	await expect(reader.getByRole('dialog', { name: 'Annotation' })).toBeHidden();
	await expect(highlighter).toHaveAttribute('data-active');

	// Esc ends it; next time it starts with the color picked last.
	await reader.keyboard.press('Escape');
	await expect(highlighter).not.toHaveAttribute('data-active');
	await swatch('Blue').click();
	await highlighter.click();
	await expect(swatch('Green')).toHaveAttribute('data-active');
	expect(errs).toEqual([]);
});
