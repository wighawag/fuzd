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
import {ChainConfigs, Scheduler, SchedulerBackend, SchedulerStorage, createScheduler} from 'fuzd-scheduler';
import {initAccountFromHD} from 'remote-account';
import * as bip39 from '@scure/bip39';
import {HDKey} from '@scure/bip32';
import type {EIP1193Account} from 'eip-1193';

interface Env {
	HD_MNEMONIC?: string;
	[chainId: `CHAIN_0x${string}`]: string | undefined;
}

const defaultPath = "m/44'/60'/0'/0/0";

export class SchedulerDO extends createDurable() {
	protected executor: Executor<TransactionSubmission, TransactionInfo> & ExecutorBackend;
	protected scheduler: Scheduler<TransactionSubmission> & SchedulerBackend;
	protected gateway: ReturnType<typeof initSchedulerGateway>;
	protected executorStorage: ExecutorStorage;
	protected schedulerStorage: SchedulerStorage<TransactionSubmission>;
	protected account: ReturnType<typeof initAccountFromHD>;
	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		const DO = this;

		const chainConfigs: ChainConfigs = {
			'0x7169': {
				provider: new JSONRPCHTTPProvider('http://localhost:8545'),
				finality: 3,
				worstCaseBlockTime: 5,
			} as ChainConfig,
		};

		const envKeys = Object.keys(env);
		for (const envKey of envKeys) {
			if (envKey.startsWith('CHAIN_0x')) {
				const chainId = envKey.substring(6) as `0x${string}`;
				const chainString = env[envKey as `CHAIN_0x${string}`] as string;
				const [nodeURL, paramsString] = chainString.split('#');

				let finality = 12;
				let worstCaseBlockTime = 15;
				if (paramsString) {
					const paramsSplits = paramsString.split('&');
					for (const split of paramsSplits) {
						const [key, value] = split.split('=');
						if (value) {
							if (key === 'finality') {
								const intValue = parseInt(value);
								if (!isNaN(intValue)) {
									finality = intValue;
								}
							} else if (key === 'worstCaseBlockTime') {
								const intValue = parseInt(value);
								if (!isNaN(intValue)) {
									worstCaseBlockTime = intValue;
								}
							}
						}
					}
				}

				chainConfigs[chainId] = {
					provider: new JSONRPCHTTPProvider(nodeURL),
					finality,
					worstCaseBlockTime,
				};
			}
		}

		const mnemonic = env.HD_MNEMONIC;
		if (!mnemonic) {
			throw new Error(`no HD_MNEMONIC defined`);
		}
		const seed = bip39.mnemonicToSeedSync(mnemonic);
		const masterKey = HDKey.fromMasterSeed(seed);
		const accountHDKey = masterKey.derive(defaultPath);
		this.account = initAccountFromHD(accountHDKey);

		const db = state.storage;
		this.executorStorage = new KVExecutorStorage(db);
		this.schedulerStorage = new KVSchedulerStorage(db);
		const time = {
			async getTimestamp() {
				return Math.floor(Date.now() / 1000);
			},
		};

		const baseConfig = {
			time,
			signers: {
				async assignProviderFor(chainId: `0x${string}`, forAddress: EIP1193Account): Promise<BroadcasterSignerData> {
					const derivedAccount = DO.account.deriveForAddress(forAddress);
					return {
						signer: new EIP1193LocalSigner(derivedAccount.privateKey),
						assignerID: DO.account.publicExtendedKey,
						address: derivedAccount.address,
					};
				},
				async getProviderByAssignerID(assignerID: string, forAddress: EIP1193Account): Promise<BroadcasterSignerData> {
					const derivedAccount = DO.account.deriveForAddress(forAddress);
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
			chainConfigs,
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

	getPublicKey() {
		return new Response(this.account.publicExtendedKey);
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
