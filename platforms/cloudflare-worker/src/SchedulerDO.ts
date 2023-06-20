import {createDurable} from 'itty-durable';
import {
	Executor,
	TransactionInfo,
	TransactionSubmission,
	createExecutor,
	ExecutorBackend,
	ExecutorStorage,
	ChainConfig,
	BroadcasterSignerData,
} from 'fuzd-executor';
import {JSONRPCHTTPProvider} from 'eip-1193-json-provider';
import {EIP1193LocalSigner} from 'eip-1193-signer';
import {KVExecutorStorage, KVSchedulerStorage, initExecutorGateway, initSchedulerGateway} from 'fuzd-executor-gateway';
import {Scheduler, SchedulerBackend, SchedulerStorage, createScheduler} from 'fuzd-scheduler';
import {initAccountFromHD} from 'remote-account';
import * as bip39 from '@scure/bip39';
import {HDKey} from '@scure/bip32';
import type {EIP1193Account} from 'eip-1193';

interface Env {}

const defaultPath = "m/44'/60'/0'/0/0";
const seed = bip39.mnemonicToSeedSync('test test test test test test test test test test test junk');
const masterKey = HDKey.fromMasterSeed(seed);
const accountHDKey = masterKey.derive(defaultPath);
const account = initAccountFromHD(accountHDKey);

export class SchedulerDO extends createDurable() {
	protected executor: Executor<TransactionSubmission, TransactionInfo> & ExecutorBackend;
	protected scheduler: Scheduler<TransactionSubmission> & SchedulerBackend;
	protected gateway: ReturnType<typeof initSchedulerGateway>;
	protected executorStorage: ExecutorStorage;
	protected schedulerStorage: SchedulerStorage<TransactionSubmission>;
	constructor(state: DurableObjectState, env: Env) {
		super(state, env);

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
			time,
			signers: {
				async assignProviderFor(chainId: `0x${string}`, forAddress: EIP1193Account): Promise<BroadcasterSignerData> {
					const derivedAccount = account.deriveForAddress(forAddress);
					return {
						signer: new EIP1193LocalSigner(derivedAccount.privateKey),
						assignerID: account.publicExtendedKey,
						address: derivedAccount.address,
					};
				},
				async getProviderByAssignerID(assignerID: string, forAddress: EIP1193Account): Promise<BroadcasterSignerData> {
					const derivedAccount = account.deriveForAddress(forAddress);
					// TODO get it from assignerID
					return {
						signer: new EIP1193LocalSigner(derivedAccount.privateKey),
						assignerID,
						address: derivedAccount.address,
					};
				},
			},
			maxExpiry: 24 * 3600,
			maxNumTransactionsToProcessInOneGo: 10,
			chainConfigs: {
				'0x31337': {
					provider: new JSONRPCHTTPProvider('http://localhost:8545'),
					finality: 3,
					worstCaseBlockTime: 5,
				} as ChainConfig,
			},
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
		return 'fuzd';
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
