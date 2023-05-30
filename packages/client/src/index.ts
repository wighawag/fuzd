import {createExecutor} from 'dreveal-executor';
import {JSONRPCHTTPProvider} from 'eip-1193-json-provider';
import {createInMemoryKeyValueDB} from './InMemoryKeyValueDB';
import {createWallet} from './ViemWallet';

const provider = new JSONRPCHTTPProvider('http://localhost:8545');
const db = createInMemoryKeyValueDB();
const time = {
	async getTimestamp() {
		return Math.floor(Date.now() / 1000);
	},
};
const privateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';
const wallet = createWallet(privateKey);

const executor = createExecutor({
	chainId: '1',
	finality: 12,
	worstCaseBlockTime: 15,
	provider,
	db,
	time,
	wallet,
	maxExpiry: 24 * 3600,
	maxNumTransactionsToProcessInOneGo: 10,
});

async function main() {
	const id = '1'; // TODO id based on player account
	executor.submitExecution(id, {
		tx: {
			type: 'clear',
			data: '0x',
			to: '0x',
			feeStrategy: {
				type: 'single',
				maxFeePerGas: '1',
				maxPriorityFeePerGas: '1',
			},
			gas: '1000000',
		},
		timing: {
			type: 'fixed',
			timestamp: 1,
		},
	});
}

main();
