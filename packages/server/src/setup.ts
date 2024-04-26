import {Bindings, MiddlewareHandler} from 'hono/types';
import {ServerOptions} from './types';
import {
	BroadcasterSignerData,
	ChainConfigs,
	Executor,
	ExecutorBackend,
	ExecutorStorage,
	PendingExecutionStored,
	TransactionSubmission,
	createExecutor,
} from 'fuzd-executor';
import {Scheduler, SchedulerBackend, SchedulerStorage, createScheduler} from 'fuzd-scheduler';
import {KVExecutorStorage, KVSchedulerStorage, initSchedulerGateway} from 'fuzd-gateways';
import {initAccountFromHD} from 'remote-account';
import {Time, getTimeFromContractTimestamp} from 'fuzd-common';
import {JSONRPCHTTPProvider} from 'eip-1193-jsonrpc-provider';
import * as bip39 from '@scure/bip39';
import {HDKey} from '@scure/bip32';
import {EIP1193Account, EIP1193CallProvider, EIP1193GetBlockByNumberProvider} from 'eip-1193';
import {EIP1193LocalSigner} from 'eip-1193-signer';
import {initDecrypter, mainnetClient} from 'fuzd-tlock-decrypter';

const defaultPath = "m/44'/60'/0'/0/0";

export type SetupOptions<Env extends Bindings = Bindings> = {
	serverOptions: ServerOptions<Env>;
};

export type Config = {
	executor: Executor<TransactionSubmission, PendingExecutionStored> & ExecutorBackend;
	scheduler: Scheduler<TransactionSubmission> & SchedulerBackend;
	gateway: ReturnType<typeof initSchedulerGateway>;
	executorStorage: ExecutorStorage;
	schedulerStorage: SchedulerStorage<TransactionSubmission>;
	account: ReturnType<typeof initAccountFromHD>;
	time: Time;
	chainConfigs: ChainConfigs;
};

declare module 'hono' {
	interface ContextVariableMap {
		config: Config;
	}
}

export function setup<Env extends Bindings = Bindings>(options: SetupOptions<Env>): MiddlewareHandler {
	const {getDB, getEnv} = options.serverOptions;

	return async (c, next) => {
		const env = getEnv(c);
		const chainConfigs: ChainConfigs = {};
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

		const mnemonic: string = env.HD_MNEMONIC as string;
		if (!mnemonic) {
			throw new Error(`no HD_MNEMONIC defined`);
		}
		const seed = bip39.mnemonicToSeedSync(mnemonic);
		const masterKey = HDKey.fromMasterSeed(seed);
		const accountHDKey = masterKey.derive(defaultPath);
		const account = initAccountFromHD(accountHDKey);

		const db: any = null; // TODO
		const executorStorage = new KVExecutorStorage(db);
		const schedulerStorage = new KVSchedulerStorage(db);

		let time = {
			async getTimestamp(provider: EIP1193GetBlockByNumberProvider & EIP1193CallProvider) {
				const block = await provider.request({method: 'eth_getBlockByNumber', params: ['latest', false]});
				if (!block) {
					throw new Error(`cannot get latest block`);
				}
				return Number(block.timestamp);
			},
		};
		const contractTimestamp: `0x${string}` = env.CONTRACT_TIMESTAMP as `0x${string}`;
		if (contractTimestamp) {
			time = {
				async getTimestamp(provider: EIP1193CallProvider) {
					return getTimeFromContractTimestamp(provider, contractTimestamp);
				},
			};
		}

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
			chainConfigs,
		};
		const executorConfig = {
			...baseConfig,
			storage: executorStorage,
		};
		const executor = createExecutor(executorConfig);

		const decrypter =
			env.TIME_LOCK_DECRYPTION === 'false'
				? undefined
				: initDecrypter({
						client: mainnetClient(),
					});
		const schedulerConfig = {
			...baseConfig,
			executor,
			decrypter,
			storage: schedulerStorage,
		};
		const scheduler = createScheduler(schedulerConfig);

		const gateway = initSchedulerGateway(scheduler);

		c.set('config', {
			executor,
			scheduler,
			gateway,
			executorStorage,
			schedulerStorage,
			account,
			time,
			chainConfigs,
		});

		next();
	};
}
