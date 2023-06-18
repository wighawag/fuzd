import {createDurable} from 'itty-durable';
import {Executor, createExecutor} from 'fuzd-executor';
import {JSONRPCHTTPProvider} from 'eip-1193-json-provider';
import {EIP1193LocalSigner} from 'eip-1193-signer';
import {Execution} from 'fuzd-executor';
import {KVExecutorStorage, initExecutorGateway} from 'fuzd-executor-gateway';
import {ExecutorBackend} from 'fuzd-executor';

interface Env {}

export class ExecutorDO extends createDurable() {
	protected executor: Executor & ExecutorBackend;
	protected executorGateway: ReturnType<typeof initExecutorGateway>;
	constructor(state: DurableObjectState, env: Env) {
		super(state, env);

		const provider = new JSONRPCHTTPProvider('http://localhost:8545');
		const db = state.storage;
		const storage = new KVExecutorStorage(db);
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
			storage,
			time,
			async getSignerProviderFor(address: `0x${string}`) {
				// TODO
				return signerProvider;
			},
			maxExpiry: 24 * 3600,
			maxNumTransactionsToProcessInOneGo: 10,
		});

		this.executorGateway = initExecutorGateway(this.executor);
	}

	home() {
		return 'hello';
	}

	async submitExecution(executionAsString: string, signature: `0x${string}`) {
		try {
			const txInfo = await this.executorGateway.submitTransactionAsJsonString(executionAsString, signature);
			console.log(txInfo);
			return txInfo;
		} catch (err) {
			console.error(err);
			throw err;
		}
	}

	processPendingTransactions() {
		return this.executor.processPendingTransactions();
	}
}
