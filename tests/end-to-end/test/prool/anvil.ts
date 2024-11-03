import {createServer} from 'prool';
import {anvil} from 'prool/instances';

export function defineAnvil(urlWithPoolId: string) {
	const urlObject = new URL(urlWithPoolId);
	const portString = urlObject.port;
	const portAsNumber = parseInt(portString);
	const port = isNaN(portAsNumber) ? 80 : portAsNumber;
	const pathname = urlObject.pathname.slice(1);
	const poolId = parseInt(pathname);
	if (isNaN(poolId)) {
		throw new Error(`url need to end with poolId as pathname like for example so http://localhost:8546/<poolId>`);
	}

	return {
		async restart() {
			await fetch(`${urlWithPoolId}/restart`);
		},
		async start() {
			return await createServer({
				instance: anvil(),
				port,
			}).start();
		},
	} as const;
}
