import {createWranglerDevServer} from 'prool-cf-worker';

export const poolId =
	Number(process.env.VITEST_POOL_ID ?? 1) * Number(process.env.VITEST_SHARD_ID ?? 1) +
	(process.env.VITE_NETWORK_TRANSPORT_MODE === 'webSocket' ? 100 : 0);

export const WORKER_URL = `http://localhost:8787/${poolId}`;

const folder = `.wrangler/prool/${poolId}`;
const wranglerTOML = 'node_modules/fuzd-cf-worker/wrangler.toml';
export const wrangler = createWranglerDevServer(WORKER_URL, {
	binary: 'pnpm wrangler dev',
	persistTo: folder,
	env: 'production',
	config: wranglerTOML,
	onReadyCommands: [
		`rm -Rf ${folder} || echo 'already done'`,
		`pnpm wrangler --config ${wranglerTOML} d1 execute --local --persist-to ${folder} fuzd-db --env production --file=node_modules/fuzd-server/src/schema/sql/scheduler.sql`,
		`pnpm wrangler --config ${wranglerTOML} d1 execute --local --persist-to ${folder} fuzd-db --env production --file=node_modules/fuzd-server/src/schema/sql/executor.sql`,
	],
	onStopCommands: [`rm -Rf ${folder}`],
});
