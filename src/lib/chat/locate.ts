// Where claude is: found once per window (again after a failure, or when the path setting changes).
import { platform } from '#lib/platform/index.js';
import { settings } from '#lib/settings.svelte.js';

let found: { setting: string; path: Promise<string> } | null = null;

export function locateClaude(): Promise<string> {
	const setting = settings.values.claudePath;
	if (!found || found.setting !== setting) {
		const path = platform.claude!.locate(setting).then((r) => r.path);
		found = { setting, path };
		path.catch(() => (found = null));
	}
	return found.path;
}
