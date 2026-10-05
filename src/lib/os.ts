// The operating system, for wording and layout (traffic lights, Finder vs File Explorer).
// The web build reports the visitor's OS the same way.
export type Os = 'macos' | 'windows' | 'linux';

const p = typeof navigator === 'undefined' ? '' : navigator.platform;
export const os: Os = /Mac|iPhone|iPad/.test(p) ? 'macos' : /Win/.test(p) ? 'windows' : 'linux';
export const mac = os === 'macos';

/** "Show in Finder" and friends. */
export const fileManager = { macos: 'Finder', windows: 'File Explorer', linux: 'Files' }[os];
/** Where a removed paper goes on desktop. */
export const trashName = os === 'windows' ? 'Recycle Bin' : 'Trash';
