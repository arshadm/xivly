import { MediaQuery } from 'svelte/reactivity';
import { settings } from './settings.svelte';

const system = new MediaQuery('(prefers-color-scheme: dark)');

/** Dark when the setting says so, or follows the system. ⌘⇧D flips it. */
class Theme {
	dark = $derived(settings.values.theme === 'system' ? system.current : settings.values.theme === 'dark');
	toggle() {
		settings.set('theme', this.dark ? 'light' : 'dark');
	}
}

export const theme = new Theme();
