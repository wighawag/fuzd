import {Execution, createExecutor} from 'dreveal-executor';
import {JSONRPCHTTPProvider} from 'eip-1193-json-provider';
import {createInMemoryKeyValueDB} from './InMemoryKeyValueDB';

const provider = new JSONRPCHTTPProvider('http://localhost:8545');
const db = createInMemoryKeyValueDB();

const time = {
	async getTimestamp() {
		return Math.floor(Date.now() / 1000);
	},
};

const wallet = {
	address: '0x' as `0x${string}`,
	async signTransaction() {
		return '0x' as `0x${string}`;
	},
};

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
