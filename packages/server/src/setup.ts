import {MiddlewareHandler} from 'hono/types';
import {ServerOptions} from './types.js';
import {ExecutorBackend, ExecutorStorage, createExecutor} from 'fuzd-executor';
import {Scheduler, SchedulerBackend, SchedulerConfig, SchedulerStorage, createScheduler} from 'fuzd-scheduler';
import {ETHAccount, initAccountFromHD} from 'remote-account';
import {ExecutionSubmission, Executor, String0x} from 'fuzd-common';
import {mnemonicToSeedSync} from '@scure/bip39';
import {HDKey} from '@scure/bip32';
import {initDecrypter, mainnetClient} from 'fuzd-tlock-decrypter';
import {RemoteSQLExecutorStorage} from './storage/RemoteSQLExecutorStorage.js';
import {RemoteSQLSchedulerStorage} from './storage/RemoteSQLSchedulerStorage.js';
import {EthereumChainProtocol} from 'fuzd-chain-protocol/ethereum';
import {ChainProtocols, TransactionDataTypes} from 'fuzd-chain-protocol';
import {StarknetChainProtocol} from 'fuzd-chain-protocol/starknet';
import {tags} from 'typia';

const defaultPath = "m/44'/60'/0'/0/0";

// used to be hono Bindings but its type is now `object` which break compilation here
type Bindings = Record<string, any>;

export type SetupOptions<Env extends Bindings = Record<string, any>> = {
	serverOptions: ServerOptions<Env>;
};

type MyChainProtocols = EthereumChainProtocol | StarknetChainProtocol;

export type MyTransactionData = TransactionDataTypes<MyChainProtocols>;

export type Config = {
	executor: Executor<MyTransactionData> & ExecutorBackend;
	scheduler: Scheduler<MyTransactionData> & SchedulerBackend;
	executorStorage: ExecutorStorage<MyTransactionData>;
	schedulerStorage: SchedulerStorage<MyTransactionData>;
	account: ReturnType<typeof initAccountFromHD>;
	paymentAccount?: String0x;
	chainProtocols: ChainProtocols<MyChainProtocols>;
	contractTimestampAddress?: String0x & tags.Pattern<'^0[xX][A-Fa-f0-9][A-Fa-f0-9]+$'>;
	getTimeDiff(chainId: String0x): Promise<number>;
};

declare module 'hono' {
	interface ContextVariableMap {
		config: Config;
	}
}

const chainOverrides: Record<string, string> = {};

export function setChainOverride(chainId: `0x${string}`, override: string) {
	chainOverrides[`CHAIN_${chainId}`] = override;
}

function assignChainProtocols(
	env: Record<string, string>,
	chainProtocols: ChainProtocols<MyChainProtocols>,
	contractTimestamp: `0x${string}`,
	account: ETHAccount,
) {
	const envKeys = Object.keys(env);
	for (const envKey of envKeys) {
		if (envKey.startsWith('CHAIN_0x')) {
			const chainId = envKey.substring(6) as String0x;
			const chainString = env[envKey as `CHAIN_0x${string}`] as string;
			const [nodeURL, paramsString] = chainString.split('#');

			let protocol: 'ethereum' | 'starknet' = 'ethereum';
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
						} else if (key === 'protocol') {
							if (value === 'starknet' || value === 'ethereum') {
								protocol = value;
							} else {
								throw new Error(`invlaid protocol: ${value}`);
							}
						}
					}
				}
			}
			if (protocol === 'ethereum') {
				chainProtocols[chainId] = new EthereumChainProtocol(
					nodeURL,
					{
						expectedFinality: finality,
						worstCaseBlockTime,
						contractTimestamp,
					},
					account,
				);
			} else {
				chainProtocols[chainId] = new StarknetChainProtocol(
					nodeURL,
					{
						expectedFinality: finality,
						worstCaseBlockTime,
						accountContractClassHash: '0x', // TODO
						tokenContractAddress: '0x', // TODO
					},
					account,
				);
			}
		}
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
		const seed = mnemonicToSeedSync(mnemonic);
		const masterKey = HDKey.fromMasterSeed(seed);
		const accountHDKey = masterKey.derive(defaultPath);
		const account = initAccountFromHD(accountHDKey);

		const contractTimestamp: String0x = env.CONTRACT_TIMESTAMP as String0x;
		const chainProtocols: ChainProtocols<MyChainProtocols> = {};
		assignChainProtocols(env, chainProtocols, contractTimestamp, account);
		assignChainProtocols(chainOverrides, chainProtocols, contractTimestamp, account);

		const db = getDB(c);
		const executorStorage = new RemoteSQLExecutorStorage<MyTransactionData>(db);
		const schedulerStorage = new RemoteSQLSchedulerStorage<MyTransactionData>(db);

		const baseConfig = {
			maxExpiry: 24 * 3600,
			maxNumTransactionsToProcessInOneGo: 10,
			chainProtocols,
			contractTimestampAddress: contractTimestamp,
		};
		const paymentAccount = env.PAYMENT_ACCOUNT as String0x | undefined;
		const executorConfig = {
			...baseConfig,
			storage: executorStorage,
			paymentAccount,
		};
		const executor = createExecutor<MyChainProtocols>(executorConfig);

		const decrypter =
			env.TIME_LOCK_DECRYPTION === 'false'
				? undefined
				: initDecrypter<ExecutionSubmission<MyTransactionData>>({
						client: mainnetClient(),
					});
		const schedulerConfig: SchedulerConfig<MyChainProtocols> = {
			...baseConfig,
			executor,
			decrypter,
			storage: schedulerStorage,
		};
		const scheduler = createScheduler<MyChainProtocols>(schedulerConfig);

		c.set('config', {
			executor,
			scheduler,
			executorStorage,
			schedulerStorage,
			account,
			chainProtocols,
			paymentAccount,
			async getTimeDiff(chainId: String0x) {
				if (!chainId) {
					return 0;
				}
				const chainProtocol = chainProtocols[chainId];
				if (!chainProtocol) {
					throw new Error(`cannot get protocol for chain with id ${chainId}`);
				}
				const virtualTimestamp = await chainProtocol.getTimestamp();
				const timestamp = Math.floor(Date.now() / 1000);
				return virtualTimestamp - timestamp;
			},
		});

		// auto setup
		if (c.req.query('_initDB') == 'true') {
			await executorStorage.setup();
			await schedulerStorage.setup();
		}

		return next();
	};
}
