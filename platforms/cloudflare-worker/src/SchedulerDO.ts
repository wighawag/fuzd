import {createDurable} from 'itty-durable';
import {
	Executor,
	TransactionInfo,
	TransactionSubmission,
	createExecutor,
	ExecutorBackend,
	ExecutorStorage,
} from 'fuzd-executor';
import {JSONRPCHTTPProvider} from 'eip-1193-json-provider';
import {EIP1193LocalSigner} from 'eip-1193-signer';
import {KVExecutorStorage, KVSchedulerStorage, initExecutorGateway, initSchedulerGateway} from 'fuzd-executor-gateway';
import {Scheduler, SchedulerBackend, SchedulerStorage, createScheduler} from 'fuzd-scheduler';

interface Env {}

export class SchedulerDO extends createDurable() {
	protected executor: Executor<TransactionSubmission, TransactionInfo> & ExecutorBackend;
	protected scheduler: Scheduler<TransactionSubmission> & SchedulerBackend;
	protected gateway: ReturnType<typeof initSchedulerGateway>;
	protected executorStorage: ExecutorStorage;
	protected schedulerStorage: SchedulerStorage<TransactionSubmission>;
	constructor(state: DurableObjectState, env: Env) {
		super(state, env);

		const provider = new JSONRPCHTTPProvider('http://localhost:8545');
		const db = state.storage;
		this.executorStorage = new KVExecutorStorage(db);
		this.schedulerStorage = new KVSchedulerStorage(db);
		const time = {
			async getTimestamp() {
				return Math.floor(Date.now() / 1000);
			},
		};
		// account 0 of test test ... junk : 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
		const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
		const signerProvider = new EIP1193LocalSigner(privateKey);
		const baseConfig = {
			chainId: '31337',
			finality: 3,
			worstCaseBlockTime: 15,
			provider,

			time,
			async getSignerProviderFor(address: `0x${string}`) {
				// TODO
				return signerProvider;
			},
			maxExpiry: 24 * 3600,
			maxNumTransactionsToProcessInOneGo: 10,
		};
		const executorConfig = {
			...baseConfig,
			storage: this.executorStorage,
		};
		this.executor = createExecutor(executorConfig);

		const schedulerConfig = {
			...baseConfig,
			executor: this.executor,
			// TODO decrypter: ,
			storage: this.schedulerStorage,
		};
		this.scheduler = createScheduler(schedulerConfig);

		this.gateway = initSchedulerGateway(this.scheduler);
	}

	home() {
		return 'hello';
	}

	async submitExecution(executionAsString: string, signature: `0x${string}`) {
		try {
			const scheduled = await this.gateway.submitExecutionAsJsonString(signature, executionAsString, signature);
			console.log(scheduled);
			return scheduled;
		} catch (err) {
			console.error(err);
			throw err;
		}
	}

	processPendingTransactions() {
		return this.executor.processPendingTransactions();
	}

	getPendingTransactions() {
		return this.executorStorage.getPendingExecutions({limit: 100});
	}

	getQueue() {
		return this.schedulerStorage.getQueueTopMostExecutions({limit: 100});
	}
}
