import {BroadcasterSignerData, ExecutorConfig, createExecutor} from 'fuzd-executor';
import {SchedulerConfig, createScheduler} from 'fuzd-scheduler';
import {JSONRPCHTTPProvider} from 'eip-1193-jsonrpc-provider';
import {EIP1193LocalSigner} from 'eip-1193-signer';
import {EIP1193Account} from 'eip-1193';
import {initAccountFromHD} from 'remote-account';
import * as bip39 from '@scure/bip39';
import {HDKey} from '@scure/bip32';
import Database from 'libsql/promise';
import {RemoteSQLExecutorStorage, RemoteSQLSchedulerStorage} from 'fuzd-server';
import {RemoteLibSQL} from 'remote-sql-libsql';

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

export function createTestExecutor(config: TestExecutorConfig) {
	const db = new RemoteLibSQL(new Database(':memory:'));
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
			storage: new RemoteSQLExecutorStorage(db),
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
	config: TestSchedulerConfig<TransactionDataType, TransationInfoType>,
) {
	const db = new RemoteLibSQL(new Database(':memory:'));
	return {
		scheduler: createScheduler({
			...config,
			storage: new RemoteSQLSchedulerStorage(db),
			maxExpiry: 24 * 3600,
			maxNumTransactionsToProcessInOneGo: 10,
		}),
	};
}
