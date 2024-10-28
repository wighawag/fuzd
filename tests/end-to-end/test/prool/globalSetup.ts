import * as potentialInstances from './node-instances.js';

export default async function setup() {
	const instances = Object.values(potentialInstances).filter(
		(v) => typeof v !== 'string' && typeof v !== 'number' && 'start' in v,
	);
	const shutdown = await Promise.all([
		...Object.values(instances).map((instance) => {
			return instance.start();
		}),
	]);
	return () =>
		Promise.all(
			shutdown.map((fn: () => void) => {
				return fn();
			}),
		);
}
