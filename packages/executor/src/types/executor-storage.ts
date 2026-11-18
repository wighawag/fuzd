import {Fees, IntegerString, PendingExecutionStored, String0x, UpdateableParameter} from '@fuzd/common';

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

	/**
	 * Which of these slots (of one chain) still have a transaction not finalized: in a few statements
	 * for many slots, for checkScheduledExecutionStatus.
	 */
	getSlotsWithUnfinalizedExecutions(params: {
		chainId: IntegerString;
		slots: {account: String0x; slot: string}[];
	}): Promise<{account: String0x; slot: string}[]>;

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
	/**
	 * The unfinalized executions with the earliest next check first.
	 * `chainId` restricts them to one chain, `upToNextCheckTime` to those due at that time.
	 */
	getPendingExecutions(params: {
		limit: number;
		chainId?: IntegerString;
		upToNextCheckTime?: number;
	}): Promise<PendingExecutionStored<TransactionDataType>[]>;
	/**
	 * Claim the unfinalized executions of a chain due for a check (`nextCheckTime <= upToNextCheckTime`,
	 * earliest first) that no other run holds, in one atomic step. They stay the claimant's until written
	 * (createOrUpdatePendingExecution, postponePendingExecution), released, or the claim expires.
	 * One broadcaster at a time: a broadcaster another run holds a transaction of is left out
	 * entirely (the claimant's own are not), so two runs never wait on each other's broadcaster lock.
	 * See docs/adr/0004-claim-due-items-with-a-lease.md.
	 */
	claimPendingExecutions(params: {
		limit: number;
		chainId: IntegerString;
		upToNextCheckTime: number;
		claim: {by: string; now: number; expiresAt: number};
	}): Promise<PendingExecutionStored<TransactionDataType>[]>;
	/** Release whatever `claimant` still holds (its run is over). */
	releasePendingExecutionClaims(claimant: string): Promise<void>;
	/**
	 * Move the next check of an unfinalized execution, unless it changed since it was read: only the
	 * row still carrying `hash` is updated, so a concurrent resubmission is never overwritten.
	 */
	postponePendingExecution(
		execution: {chainId: IntegerString; account: String0x; slot: string; batchIndex: number; hash: String0x},
		nextCheckTime: number,
		lastError?: string,
	): Promise<void>;
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
