import {afterAll} from 'vitest';
import * as potentialInstances from './node-instances.js';

// Reset the node instances
export async function resetNodes() {
	await Promise.all(
		Object.values(potentialInstances).map((instance) => {
			if (typeof instance !== 'string' && typeof instance !== 'number' && 'restart' in instance) {
				instance.restart();
			}
		}),
	);
}

afterAll(async () => {
	if (process.env.SKIP_GLOBAL_SETUP) return;
	await resetNodes();
});
