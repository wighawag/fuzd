import {BroadcasterSignerData, ExecutorConfig, createExecutor} from 'fuzd-executor';
import {SchedulerConfig, createScheduler} from 'fuzd-scheduler';
import {JSONRPCHTTPProvider} from 'eip-1193-jsonrpc-provider';
import {EIP1193LocalSigner} from 'eip-1193-signer';
import {initAccountFromHD} from 'remote-account';
import * as bip39 from '@scure/bip39';
import {HDKey} from '@scure/bip32';
import {RemoteSQLExecutorStorage, RemoteSQLSchedulerStorage} from 'fuzd-server';
import {RemoteLibSQL} from 'remote-sql-libsql';
import {createClient} from '@libsql/client';
import {ExecutionSubmission} from 'fuzd-common';

const provider = new JSONRPCHTTPProvider('http://localhost:8545');

const time = {
	async getTimestamp() {
		return Math.floor(Date.now() / 1000);
	},
};

const defaultPath = "m/44'/60'/0'/0/0";
const seed = bip39.mnemonicToSeedSync('test test test test test test test test test test test junk');
const masterKey = HDKey.fromMasterSeed(seed);
const accountHDKey = masterKey.derive(defaultPath);
const account = initAccountFromHD(accountHDKey);

// export const executor = createExecutor({
// 	chainId: '1',
// 	finality: 12,
// 	worstCaseBlockTime: 15,
// 	provider,
// 	time,
// 	async getSignerProviderFor(address: `0x${string}`) {
// 		return new EIP1193LocalSigner(account.deriveForAddress(address).privateKey);
// 	},
// 	storage: new KVExecutorStorage(db),
// 	maxExpiry: 24 * 3600,
// 	maxNumTransactionsToProcessInOneGo: 10,
// });

// export const executorProvider = initExecutorProvider();

export type TestExecutorConfig<TransactionDataType> = Omit<
	ExecutorConfig<TransactionDataType>,
	'storage' | 'maxExpiry' | 'maxNumTransactionsToProcessInOneGo'
> & {
	expectedWorstCaseGasPrices?: {chainId: `0x${string}`; value: bigint}[];
};

export async function createTestExecutor<TransactionDataType>(config: TestExecutorConfig<TransactionDataType>) {
	const client = createClient({
		url: ':memory:',
	});
	const db = new RemoteLibSQL(client);
	const storage = new RemoteSQLExecutorStorage(db);
	await storage.setup();
	if (config.expectedWorstCaseGasPrices != undefined) {
		for (const expectedWorstCaseGasPrice of config.expectedWorstCaseGasPrices) {
			await storage.updateExpectedWorstCaseGasPrice(
				expectedWorstCaseGasPrice.chainId,
				Math.floor(Date.now() / 1000),
				expectedWorstCaseGasPrice.value,
			);
		}
	}

	return {
		executor: createExecutor({
			...config,
			storage,
			maxExpiry: 24 * 3600,
			maxNumTransactionsToProcessInOneGo: 10,
		}),
		publicExtendedKey: account.publicExtendedKey,
	};
}

export type TestSchedulerConfig<TransactionDataType> = Omit<
	SchedulerConfig<TransactionDataType>,
	'storage' | 'maxExpiry' | 'maxNumTransactionsToProcessInOneGo'
>;

export async function createTestScheduler<TransactionDataType>(config: TestSchedulerConfig<TransactionDataType>) {
	const client = createClient({
		url: ':memory:',
	});

	const db = new RemoteLibSQL(client);
	const storage = new RemoteSQLSchedulerStorage<TransactionDataType>(db);
	await storage.setup();
	return {
		scheduler: createScheduler<TransactionDataType>({
			...config,
			storage,
			maxExpiry: 24 * 3600,
			maxNumTransactionsToProcessInOneGo: 10,
		}),
		schedulerStorage: storage,
	};
}
