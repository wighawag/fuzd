import {ExecutorConfig, createExecutor} from 'fuzd-executor';
import {SchedulerConfig, createScheduler} from 'fuzd-scheduler';
import {initAccountFromHD} from 'remote-account';
import {mnemonicToSeedSync} from '@scure/bip39';
import {HDKey} from '@scure/bip32';
import {RemoteSQLExecutorStorage, RemoteSQLSchedulerStorage} from 'fuzd-server';
import {RemoteLibSQL} from 'remote-sql-libsql';
import {createClient} from '@libsql/client';
import {ChainProtocol, TransactionDataTypes} from 'fuzd-chain-protocol';
import {IntegerString, String0x} from 'fuzd-common';

const defaultPath = "m/44'/60'/0'/0/0";
const seed = mnemonicToSeedSync('test test test test test test test test test test test junk');
const masterKey = HDKey.fromMasterSeed(seed);
const accountHDKey = masterKey.derive(defaultPath);
const account = initAccountFromHD(accountHDKey);

// export const executor = createExecutor({
// 	chainId: '1',
// 	finality: 12,
// 	worstCaseBlockTime: 15,
// 	provider,
// 	time,
// 	async getSignerProviderFor(address: String0x) {
// 		return new EIP1193LocalSigner(account.deriveForAddress(address).privateKey);
// 	},
// 	storage: new KVExecutorStorage(db),
// 	maxExpiry: 24 * 3600,
// 	maxNumTransactionsToProcessInOneGo: 10,
// });

// export const executorProvider = initExecutorProvider();

export type TestExecutorConfig<ChainProtocolTypes extends ChainProtocol<any>> = Omit<
	ExecutorConfig<ChainProtocolTypes>,
	'storage' | 'maxExpiry' | 'maxNumTransactionsToProcessInOneGo'
> & {
	expectedWorstCaseGasPrices?: {chainId: IntegerString; value: bigint}[];
};

export async function createTestExecutor<ChainProtocolTypes extends ChainProtocol<any>>(
	config: TestExecutorConfig<ChainProtocolTypes>,
) {
	type TransactionDataType = TransactionDataTypes<ChainProtocolTypes>;
	const client = createClient({
		url: ':memory:',
	});
	const db = new RemoteLibSQL(client);
	const storage = new RemoteSQLExecutorStorage<TransactionDataType>(db);
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
		storage,
	};
}

export type TestSchedulerConfig<ChainProtocolTypes extends ChainProtocol<any>> = Omit<
	SchedulerConfig<ChainProtocolTypes>,
	'storage' | 'maxExpiry' | 'maxNumTransactionsToProcessInOneGo'
>;

export async function createTestScheduler<ChainProtocolTypes extends ChainProtocol<any>>(
	config: TestSchedulerConfig<ChainProtocolTypes>,
) {
	type TransactionDataType = TransactionDataTypes<ChainProtocolTypes>;
	const client = createClient({
		url: ':memory:',
	});

	const db = new RemoteLibSQL(client);
	const storage = new RemoteSQLSchedulerStorage<TransactionDataType>(db);
	await storage.setup();
	return {
		scheduler: createScheduler<ChainProtocolTypes>({
			...config,
			storage,
			maxExpiry: 24 * 3600,
			maxNumTransactionsToProcessInOneGo: 10,
		}),
		schedulerStorage: storage,
	};
}
