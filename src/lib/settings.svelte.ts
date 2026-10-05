// App settings: one typed object, persisted per platform (Tauri store on
// desktop, localStorage on web) and live-synced across windows / tabs.
import type { InkSmoothing, MinimapVariant, ScrollMode, ZoomMode } from 'svelte-pdf-mini';
import { platform } from './platform';

export type PageFrame = 'rounded' | 'shadow' | 'border' | 'flat' | 'none';

export type CoverStyle = 'book' | 'stack' | 'flat' | 'page';
export const coverStyles: { value: CoverStyle; label: string }[] = [
	{ value: 'book', label: 'Book' },
	{ value: 'stack', label: 'Paper stack' },
	{ value: 'flat', label: 'Flat' },
	{ value: 'page', label: 'First page' }
];

export type SortKey = 'added' | 'opened' | 'published' | 'title';

const defaults = {
	// General
	theme: 'system' as 'system' | 'light' | 'dark',

	// Reading: page look (see svelte-pdf-mini page-themes)
	/** Tint pages with the paper's category color (else plain white pages). */
	tintPages: true,
	/** Page color when not tinted by category: 'white', 'warm' or a palette name. */
	pageColor: 'white',
	paperStrength: 0.5,
	pageFrame: 'rounded' as PageFrame,

	// Reading: layout & zoom
	zoomMode: 'page-width' as Exclude<ZoomMode, 'manual'>,
	columns: 1 as 1 | 2 | 'auto',
	scrollMode: 'vertical' as ScrollMode,
	firstPageAlone: false,
	smoothZoom: true,
	wheelZoom: true,
	/** Reopen papers where you left off (else at the top). */
	resumePosition: false,

	// Reading: panels & aids
	sidePanel: false,
	minimap: false,
	minimapVariant: 'pages' as MinimapVariant,
	tocRail: false,
	progressBar: true,
	breadcrumb: true,
	linkPreviews: true,
	citationCards: true,

	// Annotations
	author: '',
	annotationsVisible: true,
	sideNotes: true,
	lineMarkers: true,
	stickyTools: false,
	/** Pen stroke smoothing (svelte-pdf-mini `smoothStroke`). */
	inkSmoothing: 'steady' as InkSmoothing,
	/** Boxes are filled (translucent) or outlined. */
	boxFill: true,
	selectOn: 'dblclick' as 'click' | 'dblclick',
	/** Color / note / copy menu over a text selection. */
	selectionMenu: true,
	editOnCreate: true,
	foreignAnnotations: 'readonly' as 'editable' | 'readonly' | 'hidden',

	// Saving
	/** Seconds between autosaves of unsaved annotations; 0 = only on ⌘S / close. */
	autosaveSeconds: 60,
	confirmUnsaved: true,

	// Research
	citationLookup: true,
	semanticScholarKey: '',

	// Library
	cardSize: 'medium' as 'small' | 'medium' | 'large',
	/** The example library was offered (first start). */
	starterOffered: false,
	/** How paper cards look in the library. */
	coverStyle: 'book' as CoverStyle,
	sortBy: 'added' as SortKey,
	/** Newest / Z first (desc) or oldest / A first (asc). */
	sortDesc: true,
	/** Show every paper, only unread or only read ones. */
	readFilter: 'all' as 'all' | 'unread' | 'read',

	// Desktop
	hookToasts: 'errors' as 'all' | 'errors' | 'off'
};

export type Settings = typeof defaults;
export type SettingKey = keyof Settings;

const STORAGE_KEY = 'xivly:settings';
const EVENT = 'xivly://settings';

interface Backend {
	load(): Promise<Partial<Settings>>;
	save(values: Partial<Settings>): Promise<void>;
	/** Changes made by other windows / tabs. */
	watch(apply: (values: Partial<Settings>) => void): void;
}

const webBackend: Backend = {
	async load() {
		try {
			return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
		} catch {
			return {};
		}
	},
	async save(values) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
	},
	watch(apply) {
		addEventListener('storage', (e) => {
			if (e.key === STORAGE_KEY && e.newValue) apply(JSON.parse(e.newValue));
		});
	}
};

const desktopBackend = (): Backend => {
	const store = import('@tauri-apps/plugin-store').then(({ LazyStore }) => new LazyStore('settings.json'));
	const event = import('@tauri-apps/api/event');
	const self = import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().label);
	return {
		async load() {
			return Object.fromEntries(await (await store).entries()) as Partial<Settings>;
		},
		async save(values) {
			const s = await store;
			await s.clear();
			for (const [k, v] of Object.entries(values)) await s.set(k, v);
			await s.save();
			// Tell the other windows (the store's own events are per webview); `emit`
			// reaches this one too, which must not re-apply a snapshot it has moved past.
			await (await event).emit(EVENT, { source: await self, values });
		},
		watch(apply) {
			event.then(({ listen }) =>
				listen<{ source: string; values: Partial<Settings> }>(EVENT, async ({ payload }) => {
					if (payload.source !== (await self)) apply(payload.values);
				})
			);
		}
	};
};

class SettingsState {
	values = $state<Settings>({ ...defaults });
	ready = $state(false);
	#backend: Backend = platform.kind === 'desktop' ? desktopBackend() : webBackend;

	async init() {
		const stored = await this.#backend.load().catch(() => ({}));
		this.values = { ...defaults, ...pick(stored) };
		this.#backend.watch((v) => (this.values = { ...defaults, ...pick(v) }));
		this.ready = true;
	}

	#saveTimer: ReturnType<typeof setTimeout> | undefined;

	/** Applies at once; written (and sent to other windows) once a drag settles. */
	set<K extends SettingKey>(key: K, value: Settings[K]) {
		this.values[key] = value;
		clearTimeout(this.#saveTimer);
		this.#saveTimer = setTimeout(() => void this.#backend.save(overrides($state.snapshot(this.values) as Settings)), 300);
	}

	reset() {
		clearTimeout(this.#saveTimer);
		this.values = { ...defaults };
		void this.#backend.save({});
	}
}

/** Only what differs from the defaults is stored, so changed defaults reach everyone. */
function overrides(values: Settings): Partial<Settings> {
	return Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== defaults[k as SettingKey])) as Partial<Settings>;
}

/** Known keys only (old or foreign keys in the store are ignored). */
function pick(stored: Partial<Settings>): Partial<Settings> {
	const known = Object.entries(stored).filter(([k]) => k in defaults);
	// Choices that no longer exist fall back to the default.
	return Object.fromEntries(known.filter(([k, v]) => k !== 'coverStyle' || coverStyles.some((c) => c.value === v))) as Partial<Settings>;
}

export const settings = new SettingsState();
