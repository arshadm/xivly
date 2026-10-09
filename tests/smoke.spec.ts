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

/** A new library with the test paper in it, and the paper's reader tab (adding it by a click opens it). */
async function addPaper(page: Page, context: BrowserContext) {
	await startLibrary(page);
	await page.getByRole('button', { name: 'Add papers' }).click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: /Drop PDF files/ }).click();
	await (await chooser).setFiles(`${test.info().project.testDir}/fixtures/paper.pdf`);
	await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
	return readerTab(context);
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
	const reader = await addPaper(page, context);
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
	const reader = await addPaper(page, context);
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

test('one reader per paper: a second tab takes it over, annotations and notes kept', async ({ page, context }) => {
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
	// And notes, typed just now (not written yet).
	await first.keyboard.press('ControlOrMeta+e');
	await first.getByRole('textbox', { name: 'Notes' }).click();
	await first.keyboard.type('Handed over');

	// A second reader of the same paper (a link, a restored tab) doesn't load it…
	const second = await context.newPage();
	await second.goto(first.url());
	await expect(second.getByText('This paper is open in another tab.')).toBeVisible();
	await expect(second.locator('[data-pdf-page]')).toHaveCount(0);
	// …until it takes it over: the first saves and lets go, the second shows the saved annotation.
	await second.getByRole('button', { name: 'Read it here' }).click();
	await expect(second.locator('[data-pdf-page]').first().locator('[data-pdf-annotation]')).toHaveCount(1);
	await expect(second.getByRole('textbox', { name: 'Notes' })).toContainText('Handed over');
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
	const reader = await addPaper(page, context);
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
	const reader = await addPaper(page, context);
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

test('the notes pane: ⌘E opens it, its edge resizes it, and it stays as it was after a reload', async ({ page, context }) => {
	const reader = await addPaper(page, context);
	await reader.setViewportSize({ width: 1280, height: 800 });
	const errs = errors(reader);
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-canvas]')).toBeVisible();

	const edge = reader.getByRole('separator', { name: 'Resize the notes pane' });
	await expect(edge).toBeHidden();
	await reader.keyboard.press('ControlOrMeta+e');
	await expect(edge).toBeVisible();
	await expect(edge).toHaveAttribute('aria-valuenow', '420');

	// Drag the edge 100px to the left: 100px wider.
	const box = (await edge.boundingBox())!;
	await reader.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await reader.mouse.down();
	await reader.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2, { steps: 5 });
	await reader.mouse.up();
	await expect(edge).toHaveAttribute('aria-valuenow', '520');
	// Keys too: ← widens by 20px.
	await edge.focus();
	await reader.keyboard.press('ArrowLeft');
	await expect(edge).toHaveAttribute('aria-valuenow', '540');

	await reader.reload();
	await expect(edge).toHaveAttribute('aria-valuenow', '540');
	await reader.getByRole('button', { name: 'Hide notes' }).last().click();
	await expect(edge).toBeHidden();
	expect(errs).toEqual([]);
});

test('notes: rich text typed in the pane; its keys never reach the reader', async ({ page, context }) => {
	const reader = await addPaper(page, context);
	const errs = errors(reader);
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-canvas]')).toBeVisible();

	await reader.keyboard.press('ControlOrMeta+e');
	const notes = reader.getByRole('textbox', { name: 'Notes' });
	await notes.click();
	// Markdown shortcuts: "## " makes a heading, "- " a list. Letters and digits that are
	// reader shortcuts (h, v, 1…) are just text here.
	await reader.keyboard.type('## Method highlights\n');
	await reader.keyboard.type('- uses 1 trick\nvery handy');
	// Enter on an empty item leaves the list.
	await reader.keyboard.press('Enter');
	await reader.keyboard.press('Enter');
	await expect(notes.locator('h2')).toHaveText('Method highlights');
	await expect(notes.locator('ul > li')).toHaveCount(2);
	await expect(reader.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('data-active');

	// ⌘B is bold here, not the side panel.
	await reader.keyboard.press('ControlOrMeta+b');
	await reader.keyboard.type('key idea');
	await expect(notes.locator('strong')).toHaveText('key idea');
	await expect(reader.getByRole('tablist')).toBeHidden();

	// Saved a moment after typing: still there after hiding the pane, and after a reload.
	await expect(reader.getByText('Saved', { exact: true })).toBeVisible();
	// …and it stays saved: nothing writes again until the next edit.
	await reader.waitForTimeout(1500);
	await expect(reader.getByText('Saved', { exact: true })).toBeVisible();
	await reader.keyboard.press('ControlOrMeta+e');
	await expect(notes).toBeHidden();
	await reader.keyboard.press('ControlOrMeta+e');
	await expect(notes.locator('h2')).toHaveText('Method highlights');
	await reader.reload();
	await expect(notes.locator('h2')).toHaveText('Method highlights');
	await expect(notes.locator('strong')).toHaveText('key idea');

	// Hiding the pane right after typing still saves.
	await notes.click();
	await reader.keyboard.press('ControlOrMeta+End');
	await reader.keyboard.type(' and more');
	await reader.keyboard.press('ControlOrMeta+e');
	await expect(notes).toBeHidden();
	const writing = async () => {
		const { held = [], pending = [] } = await navigator.locks.query();
		return [...held, ...pending].filter((l) => l.name?.startsWith('xivly:papers/')).length;
	};
	await expect.poll(() => reader.evaluate(writing)).toBe(0);
	await reader.reload();
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-canvas]')).toBeVisible();
	await reader.keyboard.press('ControlOrMeta+e');
	await expect(notes).toContainText('key idea and more');
	expect(errs).toEqual([]);
});

test('notes link to the paper: quote a selection, link the page, click a chip to jump there', async ({ page, context }) => {
	const reader = await addPaper(page, context);
	const errs = errors(reader);
	const firstPage = reader.locator('[data-pdf-page]').first();
	await expect(firstPage.locator('[data-pdf-canvas]')).toBeVisible();

	// Select a line, right-click it: "Quote in notes" opens the (hidden) notes with the quote.
	const line = (await firstPage.getByText(/Reading papers should be calm/).first().boundingBox())!;
	await reader.mouse.move(line.x + 2, line.y + line.height / 2);
	await reader.mouse.down();
	await reader.mouse.move(line.x + line.width - 2, line.y + line.height / 2, { steps: 8 });
	await reader.mouse.up();
	await reader.mouse.click(line.x + line.width / 2, line.y + line.height / 2, { button: 'right' });
	await reader.getByRole('menuitem', { name: 'Quote in notes' }).click();
	const notes = reader.getByRole('textbox', { name: 'Notes' });
	await expect(notes.locator('blockquote')).toContainText('Reading papers should be calm');
	const chip = notes.locator('blockquote [data-paper-link]');
	await expect(chip).toHaveText('p. 1');

	// The bar's "link to the page you're reading" adds a chip where you're typing.
	await reader.keyboard.type('See also');
	await reader.getByRole('button', { name: 'Link to the page you’re reading' }).click();
	await expect(notes.locator('p [data-paper-link]')).toHaveCount(2);

	// A chip jumps to its place: Back appears.
	await chip.click();
	await expect(reader.getByRole('group', { name: 'Back' })).toBeVisible();
	await expect(reader.getByText('Saved', { exact: true })).toBeVisible();
	expect(errs).toEqual([]);
});

test('export as Markdown: the title, your notes, then the highlights', async ({ page, context }) => {
	const reader = await addPaper(page, context);
	const errs = errors(reader);
	const firstPage = reader.locator('[data-pdf-page]').first();
	await expect(firstPage.locator('[data-pdf-canvas]')).toBeVisible();

	// A highlight (the highlighter), then notes with a heading, a quote of it and a chip.
	await reader.getByRole('button', { name: 'Highlight', exact: true }).click();
	const line = (await firstPage.getByText(/Reading papers should be calm/).first().boundingBox())!;
	await reader.mouse.move(line.x + 2, line.y + line.height / 2);
	await reader.mouse.down();
	await reader.mouse.move(line.x + line.width - 2, line.y + line.height / 2, { steps: 8 });
	await reader.mouse.up();
	await expect(firstPage.locator('[data-pdf-annotation]')).toHaveCount(1);
	await reader.keyboard.press('Escape');
	await reader.keyboard.press('ControlOrMeta+e');
	await reader.getByRole('textbox', { name: 'Notes' }).click();
	await reader.keyboard.type('# Takeaway\nCalm reading, see ');
	await reader.getByRole('button', { name: 'Link to the page you’re reading' }).click();

	// Paper info › Export notes (back on the page first: in the notes, ⌘I is italic).
	await firstPage.click({ position: { x: 20, y: 20 } });
	await reader.keyboard.press('ControlOrMeta+i');
	const download = reader.waitForEvent('download');
	await reader.getByRole('button', { name: 'Export notes' }).click();
	const file = await download;
	const chunks: Uint8Array[] = [];
	for await (const chunk of await file.createReadStream()) chunks.push(chunk as Uint8Array);
	const md = new TextDecoder().decode(new Uint8Array(chunks.flatMap((c) => [...c])));
	expect(md).toMatch(/^# A Tiny Paper for End-to-End Tests\n\n## Notes\n\n### Takeaway\n\nCalm reading, see \(p\. 1\)/);
	expect(md).toContain('Reading papers should be calm');
	expect(md.indexOf('## Notes')).toBeLessThan(md.indexOf('Reading papers should be calm'));
	expect(errs).toEqual([]);
});

test('search: ⌘F in the notes finds in them; the library finds a paper by its notes', async ({ page, context }) => {
	const reader = await addPaper(page, context);
	const errs = errors(reader);
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-canvas]')).toBeVisible();
	await reader.keyboard.press('ControlOrMeta+e');
	const notes = reader.getByRole('textbox', { name: 'Notes' });
	await notes.click();
	await reader.keyboard.type('Zebra one.\nA second ZEBRA, and a zebra again.');
	await expect(reader.getByText('Saved', { exact: true })).toBeVisible();

	// ⌘F in the notes: their find bar, not the paper's.
	await reader.keyboard.press('ControlOrMeta+f');
	const find = reader.getByRole('textbox', { name: 'Find in notes' });
	await expect(find).toBeFocused();
	await find.fill('zebra');
	await expect(find.locator('xpath=..')).toContainText('1/3');
	await expect(notes.locator('.notes-match')).toHaveCount(3);
	await find.press('Enter');
	await expect(find.locator('xpath=..')).toContainText('2/3');
	await find.press('Shift+Enter');
	await expect(find.locator('xpath=..')).toContainText('1/3');
	await find.press('Escape');
	await expect(find).toBeHidden();
	await expect(notes.locator('.notes-match')).toHaveCount(0);
	// On the page, ⌘F is the paper's find.
	await reader.locator('[data-pdf-page]').first().click({ position: { x: 20, y: 20 } });
	await reader.keyboard.press('ControlOrMeta+f');
	await expect(reader.getByPlaceholder('Find in paper')).toBeFocused();

	// The library: a word only the notes have finds the paper.
	await page.bringToFront();
	const search = page.getByRole('textbox', { name: 'Search papers' });
	const card = page.getByRole('button', { name: new RegExp(title) });
	await search.fill('zebra');
	await expect(card).toBeVisible();
	await search.fill('okapi');
	await expect(card).toBeHidden();
	expect(errs).toEqual([]);
});

/** The test paper's reader with its notes pane open, the cursor in the notes. */
async function openNotes(page: Page, context: BrowserContext) {
	const reader = await addPaper(page, context);
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-canvas]')).toBeVisible();
	await reader.keyboard.press('ControlOrMeta+e');
	const notes = reader.getByRole('textbox', { name: 'Notes' });
	await notes.click();
	return { reader, notes };
}

/** Reload once the notes are written (their Web Lock released), and reopen the notes. */
async function reloadNotes(reader: Page) {
	await expect(reader.getByText('Saved', { exact: true })).toBeVisible();
	await reader.reload();
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-canvas]')).toBeVisible();
	return reader.getByRole('textbox', { name: 'Notes' });
}

test('notes: checklists — "[ ] " starts one, a click ticks it, and it stays ticked', async ({ page, context }) => {
	const { reader, notes } = await openNotes(page, context);
	const errs = errors(reader);
	await reader.keyboard.type('[ ] read the paper\nreproduce figure 2');
	const boxes = notes.getByRole('checkbox');
	await expect(boxes).toHaveCount(2);
	await boxes.first().click();
	await expect(notes.locator('li[data-checked="true"] > div')).toHaveText('read the paper');
	const reloaded = await reloadNotes(reader);
	await expect(reloaded.getByRole('checkbox').first()).toBeChecked();
	await expect(reloaded.getByRole('checkbox').last()).not.toBeChecked();
	expect(errs).toEqual([]);
});

test('notes: tables — insert one, Tab from cell to cell, add a row, and it stays', async ({ page, context }) => {
	const { reader, notes } = await openNotes(page, context);
	const errs = errors(reader);
	await reader.getByRole('button', { name: 'Table', exact: true }).click();
	await expect(notes.locator('table tr')).toHaveCount(3);
	await expect(notes.locator('table th')).toHaveCount(3);
	// The cursor starts in the first header cell.
	for (const [i, cell] of ['Model', 'Score', 'Notes', 'ResNet', '0.76', 'baseline'].entries()) {
		if (i) await reader.keyboard.press('Tab');
		await reader.keyboard.type(cell);
	}
	const tableBar = reader.getByRole('toolbar', { name: 'Table' });
	await expect(tableBar).toBeVisible();
	await tableBar.getByRole('button', { name: 'Add a row below' }).click();
	await expect(notes.locator('table tr')).toHaveCount(4);
	await expect(notes.locator('table tr').nth(1)).toHaveText('ResNet0.76baseline');

	const reloaded = await reloadNotes(reader);
	await expect(reloaded.locator('table th').first()).toHaveText('Model');
	await expect(reloaded.locator('table tr')).toHaveCount(4);
	expect(errs).toEqual([]);
});

test('notes: maths — $x$ inline and $$x$$ blocks rendered by KaTeX, click to edit, kept', async ({ page, context }) => {
	const { reader, notes } = await openNotes(page, context);
	const errs = errors(reader);
	await reader.keyboard.type('Energy $E=mc^2$ and a price of $5 or $6.\n$$\\int_0^1 x\\,dx$$');
	const inline = notes.locator('[data-type="inline-math"]');
	await expect(inline).toHaveCount(1);
	await expect(inline.locator('.katex')).toBeVisible();
	await expect(notes).toContainText('a price of $5 or $6.');
	await expect(notes.locator('[data-type="block-math"] .katex-display')).toBeVisible();

	// Click a formula: its LaTeX, to edit.
	await inline.click();
	const ask = reader.getByRole('dialog', { name: 'Edit equation' }).getByRole('textbox');
	await expect(ask).toHaveValue('E=mc^2');
	await ask.fill('E=mc^3');
	await ask.press('Enter');
	await expect(inline).toHaveAttribute('data-latex', 'E=mc^3');

	const reloaded = await reloadNotes(reader);
	await expect(reloaded.locator('[data-type="inline-math"]')).toHaveAttribute('data-latex', 'E=mc^3');
	await expect(reloaded.locator('[data-type="block-math"]')).toHaveAttribute('data-latex', '\\int_0^1 x\\,dx');
	expect(errs).toEqual([]);
});

test('notes: images — a pasted image is kept next to the paper and shown again after a reload', async ({ page, context }) => {
	const { reader, notes } = await openNotes(page, context);
	const errs = errors(reader);
	await reader.keyboard.type('A figure I drew:');
	await reader.keyboard.press('Enter');
	// Paste a 40×20 red PNG.
	await notes.evaluate(async (el) => {
		const canvas = Object.assign(document.createElement('canvas'), { width: 40, height: 20 });
		const g = canvas.getContext('2d')!;
		g.fillStyle = '#e11';
		g.fillRect(0, 0, 40, 20);
		const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
		const data = new DataTransfer();
		data.items.add(new File([blob], 'red square.png', { type: 'image/png' }));
		el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
	});
	const shown = (n: typeof notes) => n.locator('img.notes-image').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth);
	await expect.poll(() => shown(notes)).toBe(40);
	await expect(notes.locator('img.notes-image')).toHaveAttribute('alt', 'red square');

	const reloaded = await reloadNotes(reader);
	await expect.poll(() => shown(reloaded)).toBe(40);
	expect(errs).toEqual([]);
});

test('page width uses the whole view, leaving room on the right for side notes only once there are some', async ({ page, context }) => {
	const reader = await addPaper(page, context);
	await reader.setViewportSize({ width: 1280, height: 800 });
	const errs = errors(reader);
	const firstPage = reader.locator('[data-pdf-page]').first();
	await expect(firstPage.locator('[data-pdf-canvas]')).toBeVisible();
	const viewport = reader.locator('[data-pdf-viewport]');
	/** The page's width as a share of the view (less its padding). */
	const share = async () => {
		const [p, v] = await Promise.all([firstPage.boundingBox(), viewport.evaluate((el) => el.clientWidth)]);
		return p!.width / (v - 56);
	};
	await expect.poll(share).toBeGreaterThan(0.97);

	// With the notes pane open too.
	await reader.keyboard.press('ControlOrMeta+e');
	await expect(reader.getByRole('textbox', { name: 'Notes' })).toBeVisible();
	await expect.poll(share).toBeGreaterThan(0.97);
	await reader.keyboard.press('ControlOrMeta+e');

	// A box with a note: now there's a note for the margin, and room for it.
	await reader.getByRole('button', { name: 'Box a region' }).click();
	const box = (await firstPage.boundingBox())!;
	await reader.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.06);
	await reader.mouse.down();
	await reader.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.12, { steps: 5 });
	await reader.mouse.up();
	await reader.keyboard.type('A note for the margin');
	await reader.keyboard.press('Enter');
	// The room is on the right only (where the notes go): the page keeps the left edge.
	await expect.poll(share).toBeLessThan(0.85);
	const [p, v] = await Promise.all([firstPage.boundingBox(), viewport.boundingBox()]);
	expect(p!.x - v!.x).toBeCloseTo(28, 0);
	expect(v!.x + v!.width - (p!.x + p!.width)).toBeGreaterThan(250);
	await expect(reader.locator('[data-pdf-page]').first().getByText('A note for the margin')).toBeVisible();
	expect(errs).toEqual([]);
});

/** Write files into the browser-storage library (OPFS), as if synced from elsewhere. */
async function writeLibraryFiles(page: Page, files: Record<string, unknown>) {
	await page.evaluate(async (files) => {
		for (const [path, value] of Object.entries(files)) {
			const parts = path.split('/');
			let dir = await navigator.storage.getDirectory();
			for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
			const w = await (await dir.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
			await w.write(JSON.stringify(value));
			await w.close();
		}
	}, files);
}

test('the arXiv feed: P1–P3 by default, newest day first, chips, search, abstracts, dismissed ones apart', async ({ page }) => {
	const errs = errors(page);
	await startLibrary(page);
	const fp = (id: string, published: string, priority: number | null, topics: string[], extra: object = {}) => ({ id, title: `Paper ${id}`, authors: ['Ada Lovelace'], abstract: `Abstract of ${id}.`, categories: ['cs.PL'], topics, published, priority, rationale: priority ? `Why P${priority}` : undefined, firstSeen: '2026-10-02T00:00:00Z', ...extra });
	await writeLibraryFiles(page, {
		'.xivly/feed/papers/2026-10.json': {
			version: 1,
			papers: Object.fromEntries(
				[fp('2610.00001', '2026-10-02', 1, ['mlir']), fp('2610.00002', '2026-10-02', 3, ['risc-v']), fp('2610.00003', '2026-10-01', 2, ['mlir', 'risc-v']), fp('2610.00004', '2026-10-01', 5, ['mlir']), fp('2610.00005', '2026-10-01', 1, ['mlir'], { dismissed: '2026-10-03T00:00:00Z' })].map((p) => [p.id, p])
			)
		}
	});
	await page.reload();
	const feedLink = page.getByRole('button', { name: /arXiv feed/ });
	await expect(feedLink).toContainText('3');
	await feedLink.click();
	const cards = page.locator('article.feed-card');
	await expect(cards).toHaveCount(3);
	// Newest day first, then by priority.
	await expect(cards.locator('h3')).toHaveText(['Paper 2610.00001', 'Paper 2610.00002', 'Paper 2610.00003']);
	await expect(page.getByRole('button', { name: 'P5 1' })).toHaveAttribute('aria-pressed', 'false');

	// Chips: P5 on; a topic narrows.
	await page.getByRole('button', { name: 'P5 1' }).click();
	await expect(cards).toHaveCount(4);
	await page.getByRole('button', { name: 'risc-v', exact: true }).click();
	await expect(cards.locator('h3')).toHaveText(['Paper 2610.00002', 'Paper 2610.00003']);
	await page.getByRole('button', { name: 'risc-v', exact: true }).click();

	// Search (the reason counts), sort by priority, abstracts on demand.
	await page.getByRole('textbox', { name: 'Search the feed' }).fill('why p3');
	await expect(cards.locator('h3')).toHaveText(['Paper 2610.00002']);
	await page.getByRole('textbox', { name: 'Search the feed' }).fill('');
	await page.getByRole('radio', { name: 'Priority' }).click();
	await expect(cards.first().locator('h3')).toHaveText('Paper 2610.00001');
	await expect(cards.last().locator('h3')).toHaveText('Paper 2610.00004');
	await cards.first().getByRole('button', { name: 'Abstract' }).click();
	await expect(cards.first()).toContainText('Abstract of 2610.00001.');

	// The dismissed one, apart.
	await page.getByRole('button', { name: /Dismissed 1/ }).click();
	await expect(cards.locator('h3')).toHaveText(['Paper 2610.00005']);
	expect(errs).toEqual([]);
});
