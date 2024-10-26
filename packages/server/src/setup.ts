import {MiddlewareHandler} from 'hono/types';
import {ServerOptions} from './types.js';
import {ExecutorBackend, ExecutorStorage, createExecutor} from 'fuzd-executor';
import {
	ChainProtocols,
	Scheduler,
	SchedulerBackend,
	SchedulerConfig,
	SchedulerStorage,
	createScheduler,
} from 'fuzd-scheduler';
import {initAccountFromHD} from 'remote-account';
import {ExecutionSubmission, Executor} from 'fuzd-common';
import * as bip39 from '@scure/bip39';
import {HDKey} from '@scure/bip32';
import {initDecrypter, mainnetClient} from 'fuzd-tlock-decrypter';
import {RemoteSQLExecutorStorage} from './storage/RemoteSQLExecutorStorage.js';
import {RemoteSQLSchedulerStorage} from './storage/RemoteSQLSchedulerStorage.js';
import {EthereumChainProtocol} from 'fuzd-chain-protocol/ethereum';
import type {TransactionData} from 'fuzd-chain-protocol/ethereum';

const defaultPath = "m/44'/60'/0'/0/0";

// used to be hono Bindings but its type is now `object` which break compilation here
type Bindings = Record<string, any>;

export type SetupOptions<Env extends Bindings = Record<string, any>> = {
	serverOptions: ServerOptions<Env>;
};

export type MyTransactionData = TransactionData;

export type Config = {
	executor: Executor<MyTransactionData> & ExecutorBackend;
	scheduler: Scheduler<MyTransactionData> & SchedulerBackend;
	executorStorage: ExecutorStorage<MyTransactionData>;
	schedulerStorage: SchedulerStorage<MyTransactionData>;
	account: ReturnType<typeof initAccountFromHD>;
	paymentAccount?: `0x${string}`;
	chainProtocols: ChainProtocols;
	contractTimestampAddress?: `0x${string}`;
	getTimeDiff(chainId: `0x${string}`): Promise<number>;
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

		const mnemonic: string = env.HD_MNEMONIC as string;
		if (!mnemonic) {
			throw new Error(`no HD_MNEMONIC defined`);
		}
		const seed = bip39.mnemonicToSeedSync(mnemonic);
		const masterKey = HDKey.fromMasterSeed(seed);
		const accountHDKey = masterKey.derive(defaultPath);
		const account = initAccountFromHD(accountHDKey);

		const contractTimestamp: `0x${string}` = env.CONTRACT_TIMESTAMP as `0x${string}`;
		const chainProtocols: ChainProtocols = {};
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

				chainProtocols[chainId] = new EthereumChainProtocol(
					nodeURL,
					{
						expectedFinality: finality,
						worstCaseBlockTime,
						contractTimestamp,
					},
					account,
				);
			}
		}

		const db = getDB(c);
		const executorStorage = new RemoteSQLExecutorStorage<MyTransactionData>(db);
		const schedulerStorage = new RemoteSQLSchedulerStorage<MyTransactionData>(db);

		const baseConfig = {
			maxExpiry: 24 * 3600,
			maxNumTransactionsToProcessInOneGo: 10,
			chainProtocols,
			contractTimestampAddress: contractTimestamp,
		};
		const paymentAccount = env.PAYMENT_ACCOUNT as `0x${string}` | undefined;
		const executorConfig = {
			...baseConfig,
			storage: executorStorage,
			paymentAccount,
		};
		const executor = createExecutor<MyTransactionData>(executorConfig);

		const decrypter =
			env.TIME_LOCK_DECRYPTION === 'false'
				? undefined
				: initDecrypter<ExecutionSubmission<MyTransactionData>>({
						client: mainnetClient(),
					});
		const schedulerConfig: SchedulerConfig<MyTransactionData> = {
			...baseConfig,
			executor,
			decrypter,
			storage: schedulerStorage,
		};
		const scheduler = createScheduler<MyTransactionData>(schedulerConfig);

		c.set('config', {
			executor,
			scheduler,
			executorStorage,
			schedulerStorage,
			account,
			chainProtocols,
			paymentAccount,
			async getTimeDiff(chainId: `0x${string}`) {
				if (!chainId) {
					return 0;
				}
				const chainProtocol = chainProtocols[chainId];
				const virtualTimestamp = await chainProtocol.getTimestamp();
				const timestamp = Math.floor(Date.now() / 1000);
				return virtualTimestamp - timestamp;
			},
		});

		return next();
	};
}
