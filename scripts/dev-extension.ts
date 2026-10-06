// Chrome extension, live: `bun run dev:extension`. Builds build-extension/
// (unpacked, no zip), then rebuilds on every change in src/ or static/. Load
// build-extension/ once (chrome://extensions, Developer mode, Load unpacked):
// open Xivly tabs then reload by themselves, and the whole extension reloads
// when the service worker or the manifest changes.
import { watch } from 'node:fs';

const env = { ...process.env, XIVLY_EXTENSION: '1', XIVLY_EXTENSION_DEV: '1' };
let building = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

async function build() {
	if (building) return void (again = true);
	building = true;
	const start = performance.now();
	const steps = [['bun', 'x', 'vite', 'build', '--logLevel', 'warn'], ['bun', 'scripts/build-extension.ts', '--dev']];
	let ok = true;
	for (const cmd of steps) {
		ok = (await Bun.spawn(cmd, { env, stdout: 'inherit', stderr: 'inherit' }).exited) === 0;
		if (!ok) break;
	}
	console.log(ok ? `Built in ${((performance.now() - start) / 1000).toFixed(1)} s: watching src/ and static/` : 'Build failed: fix it and save again');
	building = false;
	if (again) {
		again = false;
		void build();
	}
}

for (const dir of ['src', 'static'])
	watch(dir, { recursive: true }, () => {
		clearTimeout(timer);
		timer = setTimeout(build, 200);
	});
void build();
