import {Execution, TransactionData, createExecutor} from 'dreveal-executor';
import {JSONRPCHTTPProvider} from 'eip-1193-json-provider';
import {createInMemoryKeyValueDB} from './InMemoryKeyValueDB';
import {privateKeyToAccount} from 'viem/accounts';
import {TransactionSerializable} from 'viem';
import {createWallet} from './ViemWallet';

const provider = new JSONRPCHTTPProvider('http://localhost:8545');
const db = createInMemoryKeyValueDB();

const time = {
	async getTimestamp() {
		return Math.floor(Date.now() / 1000);
	},
};

const privateKey = '0x00';
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
