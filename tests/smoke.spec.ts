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

/** Wait until the library's file writes are done (they run under Web Locks named after the file). */
async function writesDone(page: Page) {
	const writing = async () => {
		const { held = [], pending = [] } = await navigator.locks.query();
		return [...held, ...pending].filter((l) => l.name?.startsWith('xivly:papers/')).length;
	};
	await expect.poll(() => page.evaluate(writing)).toBe(0);
}

/**
 * A stand-in for the desktop's claude (the web build takes it from `__xivlyTestClaude`):
 * answers "It is about **calm reading** [p. 1]." (or "Still about **calm** reading." when
 * asked "again"), and keeps every request in `__claudeRequests` (across reloads).
 */
async function standInClaude(context: BrowserContext) {
	await context.addInitScript(() => {
		const w = window as unknown as { __xivlyTestClaude: unknown; __claudeRequests: unknown[] };
		w.__claudeRequests = JSON.parse(sessionStorage.getItem('claudeRequests') ?? '[]');
		w.__xivlyTestClaude = {
			locate: async () => ({ path: '/fake/claude', version: 'test' }),
			async run(r: { sessionId: string; prompt: string }, onEvent: (e: unknown) => void) {
				w.__claudeRequests.push(r);
				sessionStorage.setItem('claudeRequests', JSON.stringify(w.__claudeRequests));
				const answer = r.prompt.includes('mind map')
					? '- Calm reading\n  - Annotations in the PDF [p. 1]\n  - One page'
					: r.prompt.includes('again')
						? 'Still about **calm** reading.'
						: 'It is about **calm reading** [p. 1].';
				const events: unknown[] = [{ type: 'system', subtype: 'init', session_id: r.sessionId }, { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'paper.pdf' } }] } }];
				for (const word of answer.split(/(?<= )/)) events.push({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: word } } });
				events.push({ type: 'result', is_error: false, result: answer, session_id: r.sessionId, total_cost_usd: 0.004 }, { type: 'xivly_exit', code: 0, stderr: '' });
				for (const e of events) {
					await new Promise((res) => setTimeout(res, 30));
					onEvent(e);
				}
			},
			cancel: async () => {}
		};
	});
}

/** The prompts Claude was asked so far (with the stand-in). */
const claudeRequests = (page: Page) => page.evaluate(() => (window as unknown as { __claudeRequests: { prompt: string; sessionId: string; resume: boolean; tools: string[] }[] }).__claudeRequests);

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
	// Settings are saved a moment after a change: reload once it's stored.
	await expect.poll(() => reader.evaluate(() => localStorage.getItem('xivly:settings') ?? '')).toContain('"notesPaneWidth":540');

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
	// The side panel's tabs (not the pane's Notes | Chat).
	await expect(reader.getByRole('complementary').getByRole('tab', { name: 'Contents' })).toBeHidden();

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

test('the arXiv feed: dismiss (with undo), and restore from the dismissed ones', async ({ page }) => {
	const errs = errors(page);
	await startLibrary(page);
	const fp = (id: string) => ({ id, title: `Paper ${id}`, authors: [], abstract: '', categories: ['cs.PL'], topics: ['mlir'], published: '2026-10-02', priority: 1, firstSeen: '' });
	await writeLibraryFiles(page, { '.xivly/feed/papers/2026-10.json': { version: 1, papers: { '2610.00001': fp('2610.00001'), '2610.00002': fp('2610.00002') } } });
	await page.reload();
	await page.getByRole('button', { name: /arXiv feed/ }).click();
	const cards = page.locator('article.feed-card');
	await expect(cards).toHaveCount(2);

	await page.getByRole('button', { name: 'Dismiss Paper 2610.00001' }).click();
	await expect(cards).toHaveCount(1);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(cards).toHaveCount(2);

	await page.getByRole('button', { name: 'Dismiss Paper 2610.00001' }).click();
	await expect(cards).toHaveCount(1);
	// Kept after a reload (written to the feed file).
	await page.reload();
	await page.getByRole('button', { name: /arXiv feed/ }).click();
	await expect(cards).toHaveCount(1);
	await page.getByRole('button', { name: /Dismissed 1/ }).click();
	await page.getByRole('button', { name: 'Restore Paper 2610.00001' }).click();
	await expect(cards).toHaveCount(0);
	await page.getByRole('button', { name: /Dismissed/ }).click();
	await expect(cards).toHaveCount(2);
	expect(errs).toEqual([]);
});

test('library as a list: a header switch (kept), rows that open, read marks', async ({ page, context }) => {
	const errs = errors(page);
	const reader = await addPaper(page, context);
	await reader.close();
	await page.bringToFront();
	const cards = page.locator('.card');
	await expect(cards).toHaveCount(1);
	const layout = page.getByRole('group', { name: 'Layout' });
	await expect(layout.getByRole('radio', { name: 'Cards' })).toHaveAttribute('aria-checked', 'true');

	await layout.getByRole('radio', { name: 'List' }).click();
	const row = page.locator('.row');
	await expect(row).toHaveCount(1);
	await expect(cards).toHaveCount(0);
	await expect(row).toContainText(title);
	await expect(row).toContainText('Ada Lovelace, Alan Turing');
	await row.getByRole('button', { name: 'Mark as read' }).click();
	await expect(row).toHaveAttribute('data-read', '');
	await writesDone(page);

	await page.reload();
	await expect(page.locator('.row')).toHaveCount(1);
	await expect(page.locator('.row')).toHaveAttribute('data-read', '');
	// A row opens its paper.
	await page.locator('.row').getByRole('button', { name: new RegExp(title) }).click();
	const again = await readerTab(context);
	await expect(again.locator('[data-pdf-page]').first()).toBeVisible();
	expect(errs).toEqual([]);
});

test('a list of 1500 papers only renders the rows on screen', async ({ page }) => {
	const errs = errors(page);
	await startLibrary(page);
	await page.evaluate(async () => {
		const papers = await (await navigator.storage.getDirectory()).getDirectoryHandle('papers', { create: true });
		await Promise.all(
			Array.from({ length: 1500 }, async (_, i) => {
				const dir = await papers.getDirectoryHandle(`p-${i}`, { create: true });
				const file = await (await dir.getFileHandle('paper.json', { create: true })).createWritable();
				await file.write(JSON.stringify({ title: `Paper ${i}`, authors: ['A. Author'], year: 2000 + (i % 26), added: new Date(1700000000000 + i * 1000).toISOString() }));
				await file.close();
			})
		);
	});
	await page.reload();
	await page.getByRole('group', { name: 'Layout' }).getByRole('radio', { name: 'List' }).click();
	const rows = page.locator('.row');
	await expect(rows.first()).toBeVisible();
	expect(await rows.count()).toBeLessThan(150);
	// Newest added first; scrolling far down brings later rows.
	await expect(rows.first()).toContainText('Paper 1499');
	await page.locator('main .overflow-y-auto').evaluate((el) => (el.scrollTop = el.scrollHeight));
	await expect(rows.getByText('Paper 0', { exact: true })).toBeVisible();
	expect(errs).toEqual([]);
});

test('chat with Claude (a stand-in claude): ⌘⇧E, streamed answers with page links, kept and continued after a reload', async ({ page, context }) => {
	await standInClaude(context);
	const reader = await addPaper(page, context);
	const errs = errors(reader);
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-canvas]')).toBeVisible();

	await reader.keyboard.press('ControlOrMeta+Shift+e');
	await expect(reader.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');
	const box = reader.getByRole('textbox', { name: 'Ask Claude about this paper' });
	await expect(box).toBeFocused();
	await box.fill('What is it about?');
	await box.press('Enter');

	const chat = reader.locator('.chat');
	await expect(chat.locator('strong')).toHaveText('calm reading');
	await expect(chat).toContainText('Reading paper.pdf');
	const cite = chat.getByRole('link', { name: 'p. 1' });
	await cite.click();
	await expect(reader.getByRole('group', { name: 'Back' })).toBeVisible();

	// Kept: after a reload the conversation is there, and a follow-up continues the session.
	await writesDone(reader);
	await reader.reload();
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-canvas]')).toBeVisible();
	await expect(chat).toContainText('What is it about?');
	await expect(chat.locator('strong')).toHaveText('calm reading');
	await box.fill('Tell me again');
	await box.press('Enter');
	await expect(chat.locator('strong').last()).toHaveText('calm');
	const requests = await claudeRequests(reader);
	expect(requests.map((r) => r.resume)).toEqual([false, true]);
	expect(requests[1].sessionId).toBe(requests[0].sessionId);
	expect(requests[0].tools).toEqual(['Read']);

	// The Notes tab is still there, with its save state in the header.
	await reader.getByRole('tab', { name: 'Notes' }).click();
	await reader.getByRole('textbox', { name: 'Notes' }).click();
	await reader.keyboard.type('Noted.');
	await expect(reader.getByText('Saved', { exact: true })).toBeVisible();
	expect(errs).toEqual([]);
});

test('saved prompts: from the ✨ menu, filled in from the paper and the selection; saved from a question', async ({ page, context }) => {
	await standInClaude(context);
	const reader = await addPaper(page, context);
	const errs = errors(reader);
	const firstPage = reader.locator('[data-pdf-page]').first();
	await expect(firstPage.locator('[data-pdf-canvas]')).toBeVisible();
	await reader.keyboard.press('ControlOrMeta+Shift+e');
	const chat = reader.locator('.chat');

	// A default prompt, from the empty chat's suggestions.
	await chat.getByRole('button', { name: 'Summarise this paper in a few bullet points.' }).click();
	await expect(chat.locator('strong')).toHaveText('calm reading');
	expect((await claudeRequests(reader)).at(-1)!.prompt).toBe('Summarise this paper in a few bullet points.');

	// One that needs a selection: off without one, then filled with it.
	const menuButton = reader.getByRole('button', { name: 'Saved prompts' });
	await menuButton.click();
	await expect(reader.getByRole('menuitem', { name: 'Explain the selection (select text first)' })).toHaveAttribute('data-disabled');
	await reader.keyboard.press('Escape');
	const line = (await firstPage.getByText(/Reading papers should be calm/).first().boundingBox())!;
	await reader.mouse.move(line.x + 2, line.y + line.height / 2);
	await reader.mouse.down();
	await reader.mouse.move(line.x + line.width - 2, line.y + line.height / 2, { steps: 8 });
	await reader.mouse.up();
	await menuButton.click();
	await reader.getByRole('menuitem', { name: 'Explain the selection' }).click();
	await expect(chat.locator('strong')).toHaveCount(2);
	expect((await claudeRequests(reader)).at(-1)!.prompt).toMatch(/^Explain this passage[\s\S]*Reading papers should be calm/);

	// A question saved as a prompt, then in the menu and in Settings.
	const box = reader.getByRole('textbox', { name: 'Ask Claude about this paper' });
	await box.fill('List the figures of {{title}}');
	await menuButton.click();
	await reader.getByRole('menuitem', { name: 'Save this question as a prompt…' }).click();
	const name = reader.getByRole('dialog', { name: 'Save as a prompt' }).getByRole('textbox');
	await name.fill('Figures');
	await name.press('Enter');
	await box.fill('');
	await menuButton.click();
	await reader.getByRole('menuitem', { name: 'Figures' }).click();
	await expect(chat.locator('strong')).toHaveCount(3);
	expect((await claudeRequests(reader)).at(-1)!.prompt).toBe(`List the figures of ${title}`);
	await menuButton.click();
	await reader.getByRole('menuitem', { name: 'Edit prompts…' }).click();
	await expect(reader.getByRole('textbox', { name: 'Prompt name' }).last()).toHaveValue('Figures');
	expect(errs).toEqual([]);
});

/** Drag across a line of the first page's text (selecting it). */
async function selectLine(reader: Page, text: RegExp) {
	const line = (await reader.locator('[data-pdf-page]').first().getByText(text).first().boundingBox())!;
	await reader.mouse.move(line.x + 2, line.y + line.height / 2);
	await reader.mouse.down();
	await reader.mouse.move(line.x + line.width - 2, line.y + line.height / 2, { steps: 8 });
	await reader.mouse.up();
	return line;
}

test('ask Claude about a selection: quoted with its page to ask about, or explained at once', async ({ page, context }) => {
	await standInClaude(context);
	const reader = await addPaper(page, context);
	const errs = errors(reader);
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-canvas]')).toBeVisible();

	let line = await selectLine(reader, /Reading papers should be calm/);
	await reader.mouse.click(line.x + line.width / 2, line.y + line.height / 2, { button: 'right' });
	await reader.getByRole('menuitem', { name: 'Ask Claude about this…' }).click();
	const box = reader.getByRole('textbox', { name: 'Ask Claude about this paper' });
	await expect(box).toBeFocused();
	await expect(box).toHaveValue(/^This passage \[p\. 1\]:\n\n> Reading papers should be calm/);
	await reader.keyboard.type('Why does it matter?');
	await reader.keyboard.press('Enter');
	await expect(reader.locator('.chat strong')).toHaveText('calm reading');
	expect((await claudeRequests(reader)).at(-1)!.prompt).toMatch(/> Reading papers should be calm[\s\S]*Why does it matter\?$/);

	line = await selectLine(reader, /This one-page paper exists/);
	await reader.mouse.click(line.x + line.width / 2, line.y + line.height / 2, { button: 'right' });
	await reader.getByRole('menuitem', { name: 'Explain this with Claude' }).click();
	await expect(reader.locator('.chat strong')).toHaveCount(2);
	expect((await claudeRequests(reader)).at(-1)!.prompt).toMatch(/^This passage \[p\. 1\]:\n\n> This one-page paper exists[\s\S]*Explain it in plain terms/);
	expect(errs).toEqual([]);
});

test('an answer into the notes: under the question, its [p. N] as page chips, kept', async ({ page, context }) => {
	await standInClaude(context);
	const reader = await addPaper(page, context);
	const errs = errors(reader);
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-canvas]')).toBeVisible();
	await reader.keyboard.press('ControlOrMeta+Shift+e');
	const box = reader.getByRole('textbox', { name: 'Ask Claude about this paper' });
	await box.fill('What is it about?');
	await box.press('Enter');
	await expect(reader.locator('.chat strong')).toHaveText('calm reading');

	await reader.getByRole('button', { name: 'Add to notes' }).click();
	await reader.getByRole('button', { name: 'Show', exact: true }).click();
	const notes = reader.getByRole('textbox', { name: 'Notes' });
	await expect(notes.locator('em')).toHaveText('Claude, on “What is it about?”:');
	await expect(notes.locator('strong')).toHaveText('calm reading');
	const chip = notes.locator('[data-paper-link]');
	await expect(chip).toHaveText('p. 1');
	await chip.click();
	await expect(reader.getByRole('group', { name: 'Back' })).toBeVisible();

	await expect(reader.getByText('Saved', { exact: true })).toBeVisible();
	await writesDone(reader);
	await reader.reload();
	await expect(notes.locator('[data-paper-link]')).toHaveText('p. 1');
	expect(errs).toEqual([]);
});

test('mind maps in the notes: built with the keyboard, formatted, undone, kept, exported as an outline', async ({ page, context }) => {
	const { reader, notes } = await openNotes(page, context);
	const errs = errors(reader);
	await reader.keyboard.type('My map:');
	await reader.getByRole('button', { name: 'Mind map', exact: true }).click();
	const map = notes.locator('[data-mind-map-canvas]');
	const topics = map.locator('[data-topic]');
	await expect(topics).toHaveText([title]);

	// Tab: a child; Enter: done typing; Enter again: a sibling.
	await topics.first().click();
	await reader.keyboard.press('Tab');
	await reader.keyboard.type('Method');
	await reader.keyboard.press('Enter');
	await reader.keyboard.press('Tab');
	await reader.keyboard.type('Fusion of **kernels**');
	await reader.keyboard.press('Enter');
	await reader.keyboard.press('Enter');
	await reader.keyboard.type('Tiling');
	await reader.keyboard.press('Enter');
	await expect(topics).toHaveText([title, 'Method', 'Fusion of kernels', 'Tiling']);
	// Tab from a topic being typed: the next one under it, the first one kept.
	await topics.filter({ hasText: 'Tiling' }).click();
	await reader.keyboard.press('Tab');
	await reader.keyboard.type('Square tiles');
	await reader.keyboard.press('Tab');
	await reader.keyboard.type('32×32');
	await reader.keyboard.press('Enter');
	await expect(topics).toHaveText([title, 'Method', 'Fusion of kernels', 'Tiling', 'Square tiles', '32×32']);
	await reader.keyboard.press('ControlOrMeta+z');
	await expect(topics).toHaveText([title, 'Method', 'Fusion of kernels', 'Tiling']);
	await expect(map.locator('strong')).toHaveText('kernels');
	const box = async (text: string) => (await topics.filter({ hasText: text }).first().boundingBox())!;
	expect((await box('Tiling')).x).toBeGreaterThan((await box('Method')).x);
	expect((await box('Tiling')).y).toBeGreaterThan((await box('Fusion')).y);

	// A new topic left empty goes away.
	await reader.keyboard.press('Tab');
	await reader.keyboard.press('Enter');
	await expect(topics).toHaveCount(4);

	// ⌘Z undoes a whole new topic (added and typed: one step); ⌘⇧Z brings it back.
	await reader.keyboard.press('ControlOrMeta+z');
	await expect(topics).toHaveText([title, 'Method', 'Fusion of kernels']);
	await reader.keyboard.press('ControlOrMeta+Shift+z');
	await expect(topics).toHaveText([title, 'Method', 'Fusion of kernels', 'Tiling']);
	await reader.keyboard.press('ControlOrMeta+z');
	await expect(topics).toHaveText([title, 'Method', 'Fusion of kernels']);

	// Arrows move between topics.
	await topics.first().click();
	await reader.keyboard.press('ArrowRight');
	await expect(topics.filter({ hasText: 'Method' })).toHaveAttribute('aria-selected', 'true');

	// Kept, and an outline in the Markdown export.
	await expect(reader.getByText('Saved', { exact: true })).toBeVisible();
	await writesDone(reader);
	await reader.reload();
	await expect(notes.locator('[data-mind-map-canvas] [data-topic]')).toHaveText([title, 'Method', 'Fusion of kernels']);
	await reader.locator('[data-pdf-page]').first().click({ position: { x: 20, y: 20 } });
	await reader.keyboard.press('ControlOrMeta+i');
	const download = reader.waitForEvent('download');
	await reader.getByRole('button', { name: 'Export notes' }).click();
	const chunks: Uint8Array[] = [];
	for await (const chunk of await (await download).createReadStream()) chunks.push(chunk as Uint8Array);
	const md = new TextDecoder().decode(new Uint8Array(chunks.flatMap((c) => [...c])));
	expect(md).toContain(`- ${title}\n  - Method\n    - Fusion of **kernels**`);
	expect(errs).toEqual([]);
});

test('the notes toolbar follows: map tools while a mind map is focused, formatting again after Done', async ({ page, context }) => {
	const { reader, notes } = await openNotes(page, context);
	const errs = errors(reader);
	await reader.getByRole('button', { name: 'Mind map', exact: true }).click();
	const map = notes.locator('[data-mind-map-canvas]');
	await map.locator('[data-topic]').first().click();
	const bar = reader.getByRole('toolbar', { name: 'Mind map' });
	await expect(bar).toBeVisible();
	await expect(reader.getByRole('toolbar', { name: 'Formatting' })).toBeHidden();
	await expect(bar.getByRole('button', { name: 'Delete the topic' })).toBeDisabled();

	await bar.getByRole('button', { name: 'Add a topic under it' }).click();
	await reader.keyboard.type('Idea');
	await reader.keyboard.press('Enter');
	const idea = map.locator('[data-topic]', { hasText: 'Idea' });
	await expect(idea).toBeVisible();
	await bar.getByRole('button', { name: 'Bold' }).click();
	await expect(idea.locator('strong')).toHaveText('Idea');
	await bar.getByRole('button', { name: 'Link to the page you’re reading' }).click();
	await idea.getByRole('button', { name: 'Go to page 1' }).click();
	await expect(reader.getByRole('group', { name: 'Back' })).toBeVisible();

	// Done: back to the text after the map, with its formatting bar.
	await map.locator('[data-topic]', { hasText: 'Idea' }).click();
	await bar.getByRole('button', { name: 'Done: back to the text' }).click();
	await expect(reader.getByRole('toolbar', { name: 'Formatting' })).toBeVisible();
	await reader.keyboard.type('After the map');
	await expect(notes.locator('p', { hasText: 'After the map' })).toBeVisible();
	expect(errs).toEqual([]);
});

test('add to mind map: a passage of the paper as a topic with its page (a new map the first time)', async ({ page, context }) => {
	const reader = await addPaper(page, context);
	const errs = errors(reader);
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-canvas]')).toBeVisible();
	const add = async (text: RegExp) => {
		const line = await selectLine(reader, text);
		await reader.mouse.click(line.x + line.width / 2, line.y + line.height / 2, { button: 'right' });
		await reader.getByRole('menuitem', { name: 'Add to mind map' }).click();
	};
	await add(/Reading papers should be calm/);
	const map = reader.getByRole('textbox', { name: 'Notes' }).locator('[data-mind-map-canvas]');
	const topics = map.locator('[data-topic]');
	await expect(topics).toHaveCount(2);
	await expect(topics.nth(1)).toContainText('Reading papers should be calm.');
	await expect(topics.nth(1).getByRole('button', { name: 'Go to page 1' })).toBeVisible();

	// Again: under the central topic of that map.
	await add(/This one-page paper exists/);
	await expect(topics).toHaveCount(3);
	await expect(topics.filter({ hasText: 'This one-page paper' })).toHaveAttribute('aria-level', '2');

	// With a topic selected in the map: under that one.
	await map.getByRole('button', { name: 'Fit the map' }).click();
	await topics.filter({ hasText: 'Reading papers' }).click();
	await add(/Ada Lovelace/);
	await expect(topics.filter({ hasText: 'Ada Lovelace' })).toHaveAttribute('aria-level', '3');
	expect(errs).toEqual([]);
});

test('mind maps out and in: PNG / SVG / outline from the map, and a chat answer as a map', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await standInClaude(context);
	const reader = await addPaper(page, context);
	const errs = errors(reader);
	await expect(reader.locator('[data-pdf-page]').first().locator('[data-pdf-canvas]')).toBeVisible();

	// Claude drafts a map (the saved prompt), inserted into the notes.
	await reader.keyboard.press('ControlOrMeta+Shift+e');
	await reader.getByRole('button', { name: 'Saved prompts' }).click();
	await reader.getByRole('menuitem', { name: 'Mind map of the paper' }).click();
	await reader.getByRole('button', { name: 'Insert as mind map' }).click();
	await reader.getByRole('button', { name: 'Show', exact: true }).click();
	const map = reader.getByRole('textbox', { name: 'Notes' }).locator('[data-mind-map-canvas]');
	await expect(map.locator('[data-topic]')).toHaveText(['Calm reading', /Annotations in the PDF/, 'One page']);
	await expect(map.locator('[data-topic]').nth(1).getByRole('button', { name: 'Go to page 1' })).toBeVisible();

	// Out: an outline on the clipboard, a PNG and an SVG.
	await map.locator('[data-topic]').first().click();
	const bar = reader.getByRole('toolbar', { name: 'Mind map' });
	await bar.getByRole('button', { name: 'Copy as an outline' }).click();
	await expect.poll(() => reader.evaluate(() => navigator.clipboard.readText())).toBe('- Calm reading\n  - Annotations in the PDF (p. 1)\n  - One page');
	let download = reader.waitForEvent('download');
	await bar.getByRole('button', { name: 'Save as PNG' }).click();
	expect((await download).suggestedFilename()).toBe('Calm reading.png');
	download = reader.waitForEvent('download');
	await bar.getByRole('button', { name: 'Save as SVG' }).click();
	const file = await download;
	expect(file.suggestedFilename()).toBe('Calm reading.svg');
	const chunks: Uint8Array[] = [];
	for await (const chunk of await file.createReadStream()) chunks.push(chunk as Uint8Array);
	const svg = new TextDecoder().decode(new Uint8Array(chunks.flatMap((c) => [...c])));
	expect(svg).toContain('Annotations in the PDF');
	expect(svg.match(/<path /g)).toHaveLength(2);
	expect(errs).toEqual([]);
});

test('mind map branches stay on their side: a new one doesn’t jump across as it’s typed in', async ({ page, context }) => {
	const { reader, notes } = await openNotes(page, context);
	const errs = errors(reader);
	await reader.getByRole('button', { name: 'Mind map', exact: true }).click();
	const map = notes.locator('[data-mind-map-canvas]');
	const topics = map.locator('[data-topic]');
	const root = topics.first();
	/** Left or right of the central topic. */
	const sideOf = async (i: number) => {
		const [r, b] = [(await root.boundingBox())!, (await topics.nth(i).boundingBox())!];
		return b.x > r.x + r.width / 2 ? 'right' : 'left';
	};
	await root.click();
	await reader.keyboard.press('Tab');
	await reader.keyboard.type('First');
	await reader.keyboard.press('Enter');
	expect(await sideOf(1)).toBe('right');

	await root.click();
	await reader.keyboard.press('Tab');
	await expect(topics).toHaveCount(3);
	const empty = await sideOf(2);
	await reader.keyboard.type('Second, with a longer text that wraps');
	await expect(topics.nth(2).locator('textarea')).toHaveValue(/Second/);
	expect(await sideOf(2)).toBe(empty);
	await reader.keyboard.press('Enter');
	expect(await sideOf(2)).toBe(empty);
	expect(await sideOf(1)).toBe('right');

	// Balance spreads them again.
	await reader.getByRole('toolbar', { name: 'Mind map' }).getByRole('button', { name: 'Balance the branches (both sides)' }).click();
	expect([await sideOf(1), await sideOf(2)]).toEqual(['right', 'left']);
	expect(errs).toEqual([]);
});

test('mind map folding shows: a “+N” badge on a folded branch unfolds it; a − on hover folds it', async ({ page, context }) => {
	const { reader, notes } = await openNotes(page, context);
	const errs = errors(reader);
	await reader.getByRole('button', { name: 'Mind map', exact: true }).click();
	const map = notes.locator('[data-mind-map-canvas]');
	const topics = map.locator('[data-topic]');
	await topics.first().click();
	await reader.keyboard.press('Tab');
	await reader.keyboard.type('Method');
	await reader.keyboard.press('Tab');
	await reader.keyboard.type('Tile');
	await reader.keyboard.press('Enter');
	await reader.keyboard.press('Enter');
	await reader.keyboard.type('Fuse');
	await reader.keyboard.press('Enter');
	await expect(topics).toHaveCount(4);

	const method = topics.filter({ hasText: 'Method' });
	await method.hover();
	await method.getByRole('button', { name: 'Fold the branch' }).click();
	await expect(topics).toHaveCount(2);
	const badge = method.getByRole('button', { name: 'Unfold: 2 hidden topics' });
	await expect(badge).toHaveText('+2');
	await badge.click();
	await expect(topics).toHaveCount(4);
	expect(errs).toEqual([]);
});

/** Announce changed library files to a window, as the desktop's folder watcher does. */
const announceChanges = (page: Page, paths: string[]) => page.evaluate((detail) => window.dispatchEvent(new CustomEvent('xivly:test-library-changed', { detail })), paths);

/** A paper's folder in the browser-storage library: its id. */
const paperIds = (page: Page) =>
	page.evaluate(async () => {
		const ids: string[] = [];
		for await (const [name] of (await (await navigator.storage.getDirectory()).getDirectoryHandle('papers')) as unknown as AsyncIterable<[string]>) ids.push(name);
		return ids;
	});

const readLibraryJson = (page: Page, path: string) =>
	page.evaluate(async (path) => {
		const parts = path.split('/');
		let dir = await navigator.storage.getDirectory();
		for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
		return JSON.parse(await (await (await dir.getFileHandle(parts.at(-1)!)).getFile()).text());
	}, path);

test('synced from another device: the library and the open notes show the change without a reload', async ({ page, context }) => {
	const { reader, notes } = await openNotes(page, context);
	const errs = errors(reader);
	await reader.keyboard.type('Written on this Mac.');
	await expect(reader.getByText('Saved', { exact: true })).toBeVisible();
	await writesDone(reader);
	const [id] = await paperIds(page);

	// Its title changed on another device.
	const meta = await readLibraryJson(page, `papers/${id}/paper.json`);
	await writeLibraryFiles(page, { [`papers/${id}/paper.json`]: { ...meta, title: 'Renamed on the other Mac' } });
	await announceChanges(page, [`papers/${id}/paper.json`]);
	await expect(page.getByRole('button', { name: /Renamed on the other Mac/ })).toBeVisible();

	// And its notes.
	const file = await readLibraryJson(reader, `papers/${id}/notes.json`);
	await writeLibraryFiles(reader, { [`papers/${id}/notes.json`]: { ...file, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Written on the other Mac.' }] }] } } });
	await announceChanges(reader, [`papers/${id}/notes.json`]);
	await expect(notes).toHaveText('Written on the other Mac.');
	// Not an edit here: nothing to save, and nothing to undo.
	await expect(reader.getByText('Saved', { exact: true })).toBeVisible();
	await notes.click();
	await reader.keyboard.press('ControlOrMeta+z');
	await expect(notes).toHaveText('Written on the other Mac.');
	expect(errs).toEqual([]);
});

/** A library file's bytes (base64), and writing them back, as a sync client would. */
const readLibraryBytes = (page: Page, path: string) =>
	page.evaluate(async (path) => {
		const parts = path.split('/');
		let dir = await navigator.storage.getDirectory();
		for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
		const bytes = new Uint8Array(await (await (await dir.getFileHandle(parts.at(-1)!)).getFile()).arrayBuffer());
		return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
	}, path);
const writeLibraryBytes = (page: Page, path: string, base64: string) =>
	page.evaluate(
		async ([path, base64]) => {
			const parts = path.split('/');
			let dir = await navigator.storage.getDirectory();
			for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
			const w = await (await dir.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
			await w.write(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
			await w.close();
		},
		[path, base64]
	);

test('the open PDF changed on another device: shown at once, or a choice when annotations here are unsaved', async ({ page, context }) => {
	const reader = await addPaper(page, context);
	const errs = errors(reader);
	const firstPage = reader.locator('[data-pdf-page]').first();
	await expect(firstPage.locator('[data-pdf-canvas]')).toBeVisible();
	const [id] = await paperIds(page);
	const pdf = `papers/${id}/paper.pdf`;
	const original = await readLibraryBytes(reader, pdf);
	const drawBox = async () => {
		await reader.getByRole('button', { name: 'Box a region' }).click();
		const box = (await firstPage.boundingBox())!;
		await reader.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.06);
		await reader.mouse.down();
		await reader.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.12, { steps: 5 });
		await reader.mouse.up();
		await expect(reader.getByRole('dialog', { name: 'Annotation' }).getByRole('textbox', { name: 'Add a note…' })).toBeFocused();
		await reader.keyboard.type('Boxed on this Mac');
		await expect(firstPage.locator('[data-pdf-annotation]')).toHaveCount(1);
	};

	// Saved here, then the other device's version (without the box) arrives: shown.
	await drawBox();
	await reader.keyboard.press('ControlOrMeta+s');
	await expect(reader.getByRole('button', { name: 'Annotations are saved in the PDF' })).toBeVisible();
	await writesDone(reader);
	await writeLibraryBytes(reader, pdf, original);
	await announceChanges(reader, [pdf]);
	await expect(firstPage.locator('[data-pdf-canvas]')).toBeVisible();
	await expect(reader.locator('[data-pdf-annotation]')).toHaveCount(0);

	// A box not saved yet, and another new version arrives: asked; "Keep mine" saves over it.
	await drawBox();
	await expect(reader.getByRole('button', { name: 'Unsaved changes: save now' })).toBeVisible();
	await writeLibraryBytes(reader, pdf, btoa(atob(original) + '\n%another version\n'));
	await announceChanges(reader, [pdf]);
	const dialog = reader.getByRole('dialog', { name: 'This paper changed on another device' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Keep mine' }).click();
	await expect(reader.getByRole('button', { name: 'Annotations are saved in the PDF' })).toBeVisible();
	await expect(reader.locator('[data-pdf-annotation]')).toHaveCount(1);
	// Its own save isn't a change from elsewhere: no question.
	await announceChanges(reader, [pdf]);
	await reader.waitForTimeout(500);
	await expect(dialog).toBeHidden();
	expect(errs).toEqual([]);
});
