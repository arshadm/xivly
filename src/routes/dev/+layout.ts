// Dev tools (/dev/starter): not part of the app, a 404 in production builds.
import { dev } from '$app/env';
import { error } from '@sveltejs/kit';

export const load = () => {
	if (!dev) error(404, 'Not found');
};
