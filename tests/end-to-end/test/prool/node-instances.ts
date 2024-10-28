import {createWranglerDevServer} from 'prool-cf-worker';
import {WORKER_URL} from './pool';

const folder = `.wrangler/prool/{PORT}`;
const wranglerTOML = 'node_modules/fuzd-cf-worker/wrangler.toml';
const onReadyCommands = [
	`rm -Rf ${folder} || echo 'already done'`,
	`pnpm wrangler --config ${wranglerTOML} d1 execute --local --persist-to ${folder} fuzd-db --env production --file=node_modules/fuzd-server/src/schema/sql/scheduler.sql`,
	`pnpm wrangler --config ${wranglerTOML} d1 execute --local --persist-to ${folder} fuzd-db --env production --file=node_modules/fuzd-server/src/schema/sql/executor.sql`,
];
export const wrangler = createWranglerDevServer(WORKER_URL, {
	binary: 'pnpm wrangler dev',
	persistTo: folder,
	env: 'production',
	config: wranglerTOML,
	onReadyCommands,
	onStopCommands: [`rm -Rf ${folder}`],
});
