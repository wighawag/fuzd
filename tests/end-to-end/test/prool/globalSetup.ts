import net from 'node:net';

async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.unref();
		server.on('error', reject);
		server.listen(0, () => {
			const {port} = server.address() as net.AddressInfo;
			server.close(() => resolve(port));
		});
	});
}

export default async function setup() {
	// pick the ports before anything reads them: the workers inherit them through the env
	for (const name of ['E2E_ANVIL_PORT', 'E2E_FUZD_PORT']) {
		if (!process.env[name]) {
			process.env[name] = String(await freePort());
		}
	}
	console.log(`e2e: anvil on ${process.env.E2E_ANVIL_PORT}, fuzd on ${process.env.E2E_FUZD_PORT}`);

	const potentialInstances = await import('./node-instances.js');
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
