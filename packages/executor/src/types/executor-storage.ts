import {Fees, IntegerString, PendingExecutionStored, String0x, UpdateableParameter} from 'fuzd-common';

export type BroadcasterData = {
	chainId: IntegerString;
	address: String0x;
	nextNonce: number;
	lock: string | null;
	lock_timestamp: number | null;

	debt: bigint;
};

export type BroadcasterDataWithLock = BroadcasterData & {lock: string; lock_timestamp: number};

export type ChainConfiguration = {
	fees?: UpdateableParameter<Fees>;
	expectedWorstCaseGasPrice?: UpdateableParameter<string>;
};

// const t: ChainConfiguration = {
// 	expectedWorstCaseGasPrice: {
// 		current: '0',
// 		updateTimestamp: 0,
// 		previous: undefined,
// 	},
// 	fees: {
// 		current: {
// 			fixed: '0',
// 			per_1_000_000: 0,
// 		},
// 		updateTimestamp: 0,
// 		previous: undefined,
// 	},
// };

export interface ExecutorStorage<TransactionDataType> {
	getPendingExecution(params: {
		chainId: IntegerString;
		account: String0x;
		slot: string;
		batchIndex: number;
	}): Promise<PendingExecutionStored<TransactionDataType> | undefined>;

	getPendingExecutionBatch(params: {
		chainId: IntegerString;
		account: String0x;
		slot: string;
	}): Promise<PendingExecutionStored<TransactionDataType>[] | undefined>;

	deletePendingExecution(params: {
		chainId: IntegerString;
		account: String0x;
		slot: string;
		batchIndex: number;
	}): Promise<void>;

	deleteFinalizedPendingExecutions(params: {chainId?: IntegerString; upTo?: number}): Promise<void>;

	lockBroadcaster(params: {
		chainId: IntegerString;
		address: string;
		nonceFromNetwork: number;
	}): Promise<BroadcasterDataWithLock | undefined>;

	unlockBroadcaster(params: {chainId: IntegerString; address: string}): Promise<void>;

	createOrUpdatePendingExecution(
		executionToStore: PendingExecutionStored<TransactionDataType>,
		options: {updateNonceIfNeeded?: {broadcaster: String0x; lock: string}; debtOffset?: bigint},
		asPaymentFor?: {
			chainId: IntegerString;
			account: String0x;
			slot: string;
			batchIndex: number;
			helpedForUpToGasPrice: {upToGasPrice: bigint; valueSent: bigint};
		},
	): Promise<PendingExecutionStored<TransactionDataType>>;
	getPendingExecutions(params: {limit: number}): Promise<PendingExecutionStored<TransactionDataType>[]>;
	getPendingExecutionsPerBroadcaster(
		broadcasterData: {
			chainId: IntegerString;
			broadcaster: String0x;
		},
		params: {limit: number},
	): Promise<PendingExecutionStored<TransactionDataType>[]>;

	getAllExecutions(params: {
		limit: number;
		order: 'ASC' | 'DESC';
	}): Promise<PendingExecutionStored<TransactionDataType>[]>;

	// TODO remove: createBroadcaster is not used, and if used we should use updateBroadcaster too
	getBroadcaster(params: {chainId: IntegerString; address: string}): Promise<BroadcasterData | undefined>;
	createBroadcaster(broadcaster: BroadcasterData): Promise<void>;
	clear(): Promise<void>;
	setup(): Promise<void>;
	getChainConfiguration(chainId: IntegerString): Promise<ChainConfiguration>;
	updateExpectedWorstCaseGasPrice(
		chainId: IntegerString,
		timestamp: number,
		newGasPrice: bigint,
	): Promise<ChainConfiguration>;
	updateFees(chainId: IntegerString, timestamp: number, newFees: Fees): Promise<ChainConfiguration>;
}
