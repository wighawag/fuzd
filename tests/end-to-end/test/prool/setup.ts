import {afterAll} from 'vitest';
import * as potentialInstances from './node-instances.js';

// Reset the node instances
export async function resetNodes() {
	await Promise.all(
		Object.values(potentialInstances).map((instance) => {
			if (typeof instance !== 'string' && typeof instance !== 'number' && 'restart' in instance) {
				// awaited: a restart still going when the run ends started processes after the global
				// teardown had stopped the pools, and they held vitest open until it gave up
				return instance.restart();
			}
		}),
	);
}

afterAll(async () => {
	if (process.env.SKIP_GLOBAL_SETUP) return;
	await resetNodes();
});
