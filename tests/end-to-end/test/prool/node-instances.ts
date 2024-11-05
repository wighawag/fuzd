import {createWranglerDevServer} from 'prool-cf-worker';
import {ANVIL_URL, FUZD_URL} from './pool';
import {defineAnvil} from './anvil';
import {createCommand} from 'prool-any';

// const folder = `.wrangler/prool/{PORT}`;
// const wranglerTOML = 'node_modules/fuzd-cf-worker/wrangler.toml';
// const onReadyCommands = [
// 	`rm -Rf ${folder} || echo 'already done'`,
// 	`pnpm wrangler --config ${wranglerTOML} d1 execute --local --persist-to ${folder} fuzd-db --env production --file=node_modules/fuzd-server/src/schema/sql/scheduler.sql`,
// 	`pnpm wrangler --config ${wranglerTOML} d1 execute --local --persist-to ${folder} fuzd-db --env production --file=node_modules/fuzd-server/src/schema/sql/executor.sql`,
// ];
// export const wrangler = createWranglerDevServer(FUZD_URL, {
// 	binary: 'pnpm wrangler dev',
// 	persistTo: folder,
// 	env: 'production',
// 	config: wranglerTOML,
// 	onReadyCommands,
// 	onStopCommands: [`rm -Rf ${folder}`],
// });

export const fuzd = createCommand(FUZD_URL, {
	command: 'pnpm fuzd-nodejs',
	readyMessage: 'Server is running on',
});

export const anvil = defineAnvil(ANVIL_URL);
