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
	provider,
	db,
	time,
	wallet,
});

async function main() {
	executor.submitExecution({
		type: 'encrypted',
		payload: '0x',
		timing: {
			type: 'timestamp',
			timestamp: 1,
		},
	});
}

main();
