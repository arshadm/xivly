import { isTauri } from '@tauri-apps/api/core';
import { tauriPlatform } from './tauri';
import type { Platform } from './types';
import { webPlatform } from './web';

export type * from './types';

/**
 * Picked at runtime: the same build runs in Tauri and in a browser.
 * (No top-level await here: WebKit mis-orders module evaluation with it.)
 */
export const platform: Platform = isTauri() ? tauriPlatform : webPlatform;
