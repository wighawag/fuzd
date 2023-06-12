import {createDurable} from 'itty-durable';
import {createExecutor} from 'dreveal-executor';
import {JSONRPCHTTPProvider} from 'eip-1193-json-provider';
import {EIP1193LocalSigner} from 'eip-1193-signer';
import {Execution} from 'dreveal-executor';
import {encodePacked, keccak256} from 'viem';

interface Env {}

export class ExecutorDO extends createDurable() {
	protected executor: ReturnType<typeof createExecutor>;
	constructor(state: DurableObjectState, env: Env) {
		super(state, env);

		const provider = new JSONRPCHTTPProvider('http://localhost:8545');
		const db = state.storage;
		const time = {
			async getTimestamp() {
				return Math.floor(Date.now() / 1000);
			},
		};
		// account 0 of test test ... junk : 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
		const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
		const signerProvider = new EIP1193LocalSigner(privateKey);
		this.executor = createExecutor({
			chainId: '31337',
			finality: 3,
			worstCaseBlockTime: 15,
			provider,
			db,
			time,
			signerProvider,
			maxExpiry: 24 * 3600,
			maxNumTransactionsToProcessInOneGo: 10,
		});
	}

	home() {
		return 'hello';
	}

	submitExecution(execution: Execution) {
		let id: string;
		let timeIdentifier: `0x${string}`;
		if (execution.timing.type === 'delta') {
			timeIdentifier = execution.timing.startTransaction.hash;
		} else {
			timeIdentifier = `0x${execution.timing.timestamp.toString(16)}`;
		}
		if (execution.tx.type === 'clear') {
			id = keccak256(
				encodePacked(['address', 'bytes', 'bytes32'], [execution.tx.to, execution.tx.data, timeIdentifier])
			);
		} else {
			id = keccak256(encodePacked(['bytes', 'bytes32'], [execution.tx.payload, timeIdentifier]));
		}
		return this.executor.submitExecution(id, execution);
	}

	processQueue() {
		return this.executor.processQueue();
	}

	processPendingTransactions() {
		return this.executor.processPendingTransactions();
	}
}
