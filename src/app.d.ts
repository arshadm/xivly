// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	/** Chrome extension build (vite.config.js `define`). */
	const __XIVLY_EXTENSION__: boolean;
	/** `bun run dev:extension` build: reload on rebuild (scripts/dev-extension.ts). */
	const __XIVLY_EXTENSION_DEV__: boolean;
}

export {};
