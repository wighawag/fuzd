import {
	ExecutorConfig,
	SchedulerConfig,
	TransactionSubmission,
	createExecutor,
	createScheduler,
} from 'dreveal-executor';
import {JSONRPCHTTPProvider} from 'eip-1193-json-provider';
import {createInMemoryKeyValueDB} from './InMemoryKeyValueDB';
import {EIP1193LocalSigner} from 'eip-1193-signer';
import {EIP1193Account} from 'eip-1193';
import {initAccountFromHD} from 'remote-account';
import * as bip39 from '@scure/bip39';
import {HDKey} from '@scure/bip32';
import {KVExecutorStorage, KVSchedulerStorage} from 'dreveal-executor-gateway';

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
// 	async getSignerProviderFor(address: EIP1193Account) {
// 		return new EIP1193LocalSigner(account.deriveForAddress(address).privateKey);
// 	},
// 	storage: new KVExecutorStorage(db),
// 	maxExpiry: 24 * 3600,
// 	maxNumTransactionsToProcessInOneGo: 10,
// });

// export const executorProvider = initExecutorProvider();

export type TestExecutorConfig = Omit<
	ExecutorConfig,
	'getSignerProviderFor' | 'storage' | 'maxExpiry' | 'maxNumTransactionsToProcessInOneGo'
>;

export function createTestExecutor(config: TestExecutorConfig) {
	const db = createInMemoryKeyValueDB();
	return {
		executor: createExecutor({
			...config,
			async getSignerProviderFor(address: EIP1193Account) {
				return new EIP1193LocalSigner(account.deriveForAddress(address).privateKey);
			},
			storage: new KVExecutorStorage(db),
			maxExpiry: 24 * 3600,
			maxNumTransactionsToProcessInOneGo: 10,
		}),
		publicExtendedKey: account.publicExtendedKey,
	};
}

export type TestSchedulerConfig<TransactionDataType, TransationInfoType> = Omit<
	SchedulerConfig<TransactionDataType, TransationInfoType>,
	'storage' | 'maxExpiry' | 'maxNumTransactionsToProcessInOneGo'
>;

export function createTestScheduler<TransactionDataType, TransationInfoType>(
	config: TestSchedulerConfig<TransactionDataType, TransationInfoType>
) {
	const db = createInMemoryKeyValueDB();
	return {
		scheduler: createScheduler({
			...config,
			storage: new KVSchedulerStorage(db),
			maxExpiry: 24 * 3600,
			maxNumTransactionsToProcessInOneGo: 10,
		}),
	};
}
