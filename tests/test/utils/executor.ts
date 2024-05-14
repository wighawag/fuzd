import {BroadcasterSignerData, ExecutorConfig, createExecutor} from 'fuzd-executor';
import {SchedulerConfig, createScheduler} from 'fuzd-scheduler';
import {JSONRPCHTTPProvider} from 'eip-1193-jsonrpc-provider';
import {EIP1193LocalSigner} from 'eip-1193-signer';
import {EIP1193Account} from 'eip-1193';
import {initAccountFromHD} from 'remote-account';
import * as bip39 from '@scure/bip39';
import {HDKey} from '@scure/bip32';
import {RemoteSQLExecutorStorage, RemoteSQLSchedulerStorage} from 'fuzd-server';
import {RemoteLibSQL} from 'remote-sql-libsql';
import {createClient} from '@libsql/client';

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
	'signers' | 'storage' | 'maxExpiry' | 'maxNumTransactionsToProcessInOneGo'
>;

export async function createTestExecutor(config: TestExecutorConfig) {
	const client = createClient({
		url: ':memory:',
	});
	const db = new RemoteLibSQL(client);
	const storage = new RemoteSQLExecutorStorage(db);
	await storage.setup();
	return {
		executor: createExecutor({
			...config,
			signers: {
				async getProviderByAssignerID(assignerID: string, forAddress: EIP1193Account): Promise<BroadcasterSignerData> {
					const derivedAccount = account.deriveForAddress(forAddress);
					// TODO get it from id
					return {
						signer: new EIP1193LocalSigner(derivedAccount.privateKey),
						assignerID,
						address: derivedAccount.address,
					};
				},
				async assignProviderFor(chainId: `0x${string}`, forAddress: EIP1193Account): Promise<BroadcasterSignerData> {
					const derivedAccount = account.deriveForAddress(forAddress);
					return {
						signer: new EIP1193LocalSigner(derivedAccount.privateKey),
						assignerID: account.publicExtendedKey,
						address: derivedAccount.address,
					};
				},
			},
			storage,
			maxExpiry: 24 * 3600,
			maxNumTransactionsToProcessInOneGo: 10,
		}),
		publicExtendedKey: account.publicExtendedKey,
	};
}

export type TestSchedulerConfig<ExecutionDataType, TransationInfoType> = Omit<
	SchedulerConfig<ExecutionDataType, TransationInfoType>,
	'storage' | 'maxExpiry' | 'maxNumTransactionsToProcessInOneGo'
>;

export async function createTestScheduler<ExecutionDataType, TransationInfoType>(
	config: TestSchedulerConfig<ExecutionDataType, TransationInfoType>,
) {
	const client = createClient({
		url: ':memory:',
	});

	const db = new RemoteLibSQL(client);
	const storage = new RemoteSQLSchedulerStorage(db);
	await storage.setup();
	return {
		scheduler: createScheduler({
			...config,
			storage,
			maxExpiry: 24 * 3600,
			maxNumTransactionsToProcessInOneGo: 10,
		}),
		schedulerStorage: storage,
	};
}
