import {testnetClient} from 'tlock-js';
import {createClient} from '.';

async function main() {
	const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
	const client = createClient({
		drand: testnetClient(),
		privateKey,
		schedulerEndPoint: 'http://127.0.0.1:8787/scheduleExecution',
	});

	const chainId = '0x7a69';
	await client.scheduleExecution({
		chainId,
		transaction: {
			gas: 1000000n,
			data: '0x',
			to: '0x',
		},
		maxFeePerGasAuthorized: 1000000000000000000n,
		time: Math.floor(Date.now() / 1000) + 100,
	});
}
main();
