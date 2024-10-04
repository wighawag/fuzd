import * as instances from './katana-instances.js';

export default async function setup() {
	const shutdown = await Promise.all([
		...Object.values(instances).map((instance) => {
			return instance.start();
		}),
	]);
	return () =>
		Promise.all(
			shutdown.map((fn) => {
				return fn();
			}),
		);
}
