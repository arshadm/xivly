// App settings: one typed object, persisted per platform (Tauri store on
// desktop, localStorage on web) and live-synced across windows / tabs.
import type { MinimapVariant, ScrollMode, ZoomMode } from 'svelte-pdf-mini';
import { platform } from './platform';

export type PageFrame = 'rounded' | 'shadow' | 'border' | 'flat' | 'none';
export type FocusStyle = 'glow' | 'brackets' | 'marker' | 'ink' | 'pulse' | 'outline' | 'spotlight';

export const defaults = {
	// General
	theme: 'system' as 'system' | 'light' | 'dark',

	// Reading: page look (see svelte-pdf-mini page-themes)
	/** Tint pages with the paper's category colour (else plain white pages). */
	tintPages: true,
	paperStrength: 0.5,
	pageFrame: 'rounded' as PageFrame,

	// Reading: layout & zoom
	zoomMode: 'page-width' as Exclude<ZoomMode, 'manual'>,
	columns: 1 as 1 | 2 | 'auto',
	scrollMode: 'vertical' as ScrollMode,
	firstPageAlone: false,
	smoothZoom: true,
	wheelZoom: true,

	// Reading: panels & aids
	sidePanel: false,
	minimap: false,
	minimapVariant: 'pages' as MinimapVariant,
	tocRail: true,
	progressBar: true,
	breadcrumb: true,
	linkPreviews: true,
	citationCards: true,
	focusStyle: 'glow' as FocusStyle,

	// Annotations
	author: '',
	annotationsVisible: true,
	sideNotes: true,
	lineMarkers: true,
	stickyTools: false,
	/** Boxes are filled (translucent) or outlined. */
	boxFill: true,
	selectOn: 'dblclick' as 'click' | 'dblclick',
	editOnCreate: true,
	foreignAnnotations: 'editable' as 'editable' | 'readonly' | 'hidden',

	// Saving
	/** Seconds between autosaves of unsaved annotations; 0 = only on ⌘S / close. */
	autosaveSeconds: 60,
	confirmUnsaved: true,

	// Research
	citationLookup: true,
	semanticScholarKey: '',

	// Library
	cardSize: 'medium' as 'small' | 'medium' | 'large',
	sortBy: 'added' as 'added' | 'opened' | 'year' | 'title',

	// Desktop
	hookToasts: 'errors' as 'all' | 'errors' | 'off'
};

export type Settings = typeof defaults;
export type SettingKey = keyof Settings;

const STORAGE_KEY = 'xivly:settings';
const EVENT = 'xivly://settings';

interface Backend {
	load(): Promise<Partial<Settings>>;
	save(values: Settings): Promise<void>;
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
	return {
		async load() {
			return Object.fromEntries(await (await store).entries()) as Partial<Settings>;
		},
		async save(values) {
			const s = await store;
			for (const [k, v] of Object.entries(values)) await s.set(k, v);
			await s.save();
			// Tell the other windows (the store's own events are per webview).
			await (await event).emit(EVENT, values);
		},
		watch(apply) {
			event.then(({ listen }) => listen<Partial<Settings>>(EVENT, ({ payload }) => apply(payload)));
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

	set<K extends SettingKey>(key: K, value: Settings[K]) {
		this.values[key] = value;
		void this.#backend.save($state.snapshot(this.values) as Settings);
	}

	reset() {
		this.values = { ...defaults };
		void this.#backend.save({ ...defaults });
	}
}

/** Known keys only (old or foreign keys in the store are ignored). */
function pick(stored: Partial<Settings>): Partial<Settings> {
	return Object.fromEntries(Object.entries(stored).filter(([k]) => k in defaults)) as Partial<Settings>;
}

export const settings = new SettingsState();
