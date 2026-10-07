// Messages between the app's windows (desktop) or tabs (web): a paper removed
// (its reader closes), a cover re-rendered (the library shows the new one), a
// reader taking a paper over from another (see reader-lock.svelte.ts).
// Never delivered back to the window that sent it.
import { platform } from './platform';

export interface Messages {
	'paper-removed': { id: string };
	'cover-changed': { id: string };
	/** "Hand this paper over": its reader saves, then lets go. */
	'reader-take-over': { id: string };
	/** The paper's reader couldn't save its annotations, so it keeps the paper. */
	'reader-kept': { id: string; error: string };
}
type Name = keyof Messages;

const EVENT = 'xivly://broadcast';
const self = Math.random().toString(36).slice(2);
const channel = platform.kind !== 'desktop' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('xivly') : null;

export async function broadcast<N extends Name>(name: N, payload: Messages[N]) {
	const message = { source: self, name, payload };
	if (channel) return channel.postMessage(message);
	if (platform.kind !== 'desktop') return;
	const { emit } = await import('@tauri-apps/api/event');
	await emit(EVENT, message);
}

/** Listen for `name` from the other windows; returns the stop function. */
export function onBroadcast<N extends Name>(name: N, fn: (payload: Messages[N]) => void): () => void {
	type Message = { source: string; name: Name; payload: Messages[N] };
	const handle = (m: Message) => m.source !== self && m.name === name && fn(m.payload);
	if (channel) {
		const listener = (e: MessageEvent<Message>) => handle(e.data);
		channel.addEventListener('message', listener);
		return () => channel.removeEventListener('message', listener);
	}
	if (platform.kind !== 'desktop') return () => {};
	const stop = import('@tauri-apps/api/event').then(({ listen }) => listen<Message>(EVENT, ({ payload }) => handle(payload)));
	return () => void stop.then((f) => f());
}
