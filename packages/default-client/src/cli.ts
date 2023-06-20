import {testnetClient} from 'tlock-js';
import {createClient} from '.';
import {TransactionSubmission} from 'fuzd-executor';

async function main() {
	const privateKey = '0x';
	const client = createClient<TransactionSubmission>({
		drand: testnetClient(),
		privateKey,
		schedulerEndPoint: 'http://127.0.0.1:8787/scheduleExecution',
	});

	const chainId = '0x7a69';
	await client.submitExecution({
		chainId,
		gas: 1000000n,
		broadcastSchedule: [
			{
				duration: 10000,
				maxFeePerGas: 1000000000000000000n,
				maxPriorityFeePerGas: 10000000000n,
			},
		],
		data: '0x',
		to: '0x',
		time: Math.floor(Date.now() / 1000) + 10,
	});
}
main();
