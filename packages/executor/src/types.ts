import {
	EIP1193AccessList,
	EIP1193Account,
	EIP1193DATA,
	EIP1193LegacyTransactionData,
	EIP1193ProviderWithoutEvents,
	EIP1193TransactionData,
	EIP1193TransactionDataOfType1,
	EIP1193TransactionDataOfType2,
} from 'eip-1193';

import type {AbiEvent} from 'abitype';

export type Broadcaster = {
	nextNonce: number;
};

export type StartTransaction = {
	// the execution should only happen if that tx is included in a block
	// which can serve as a startTime
	hash: `0x${string}`;
	nonce: number;
	broadcastTime: number;
	expectEvent?: {
		eventABI: AbiEvent;
		startTimeParam?: string;
	};
};

export type DeltaExecution<T extends StartTransaction = StartTransaction> = {
	type: 'delta';
	expiry?: number;
	startTransaction: T;
	delta: number;
};

export type AssumedTransaction = {
	// the execution should only happen if that tx is included in a block
	hash: `0x${string}`;
	nonce: number;
	expectEvent?: {
		eventABI: AbiEvent;
	};
};

export type FixedTimeExecution<T extends AssumedTransaction = AssumedTransaction> = {
	type: 'fixed';
	expiry?: number;
	assumedTransaction?: T;
	timestamp: number;
};

export type TransactionExecutionData =
	| `0x${string}`
	| {
			// TODO abitype
			abi: any[];
			// data:
			// with specific pattern to fill it with execution data so that the executor can call a contract before sending
			// Note that this require trust, unless that data is checked by the contract somehow
			// TODO: would that run the risk of having tx failure that cannot be attributed trustlessly
			data: any;
	  };

export type BaseExecutionData = {
	gas: string;
	feeStrategy: FeeStrategy;
};

export type DecryptedTransactionData = {
	data: EIP1193DATA;
	to: EIP1193Account;
	accessList?: EIP1193AccessList;
};

export type ExecutionDataInClear = BaseExecutionData &
	DecryptedTransactionData & {
		type: 'clear';
	};

export type ExecutionDataTimedLocked = BaseExecutionData & {
	type: 'enctime-lockedypted';
	payload: string;
	// TODO algorithm?: string;
};

export type ExecutionData = ExecutionDataInClear | ExecutionDataTimedLocked;

export type SingleFeeStrategy = {
	type: 'single';
	maxFeePerGas: string;
	maxPriorityFeePerGas: string;
};

export type FeeStrategy = SingleFeeStrategy;

export type Execution = {
	tx: ExecutionData;
	timing: FixedTimeExecution | DeltaExecution;
};

export type Time = {
	getTimestamp(): Promise<number>;
};

export type ExecutionBroadcastStored = {
	pendingID?: string;
	queueID?: string;
};

export type TransactionInfo = {hash: string; nonce: number; broadcastTime: number; maxFeePerGasUsed: string};
export type ExecutionPendingTransactionData = ExecutionStored & {broadcastedTransaction: TransactionInfo};

export type ExecutionStored = Execution & {
	id: string;
	retries: number;
	timing:
		| FixedTimeExecution<AssumedTransaction & {confirmed?: {blockTime: number}}>
		| DeltaExecution<StartTransaction & {confirmed?: {blockTime: number; startTime?: number}}>;
};

export type ListOptions = (
	| {
			start: string; // Key at which the list results should start, inclusive.
			prefix?: string; // Restricts results to only include key-value pairs whose keys begin with the prefix.
	  }
	| {
			startAfter: string; // Key after which the list results should start, exclusive. Cannot be used simultaneously with start.
			prefix?: string; // Restricts results to only include key-value pairs whose keys begin with the prefix.
	  }
	| {
			prefix: string; // Restricts results to only include key-value pairs whose keys begin with the prefix.
	  }
) &
	(
		| {
				end: string; // Key at which the list results should end, exclusive.
		  }
		| {
				limit: number; // Maximum number of key-value pairs to return.
		  }
	) & {
		reverse?: boolean; //If true, return results in descending order instead of the default ascending order.
		//Note that enabling this does not change the meaning of start, startKey, or endKey. start still defines the smallest key in lexicographic order that can be returned (inclusive), effectively serving as the endpoint for a reverse-order list. end still defines the largest key in lexicographic order that the list should consider (exclusive), effectively serving as the starting point for a reverse-order list.
	};

export type KeyValueDB = {
	get<T = unknown>(key: string): Promise<T | undefined>;
	get<T = unknown>(keys: string[]): Promise<Map<string, T>>;
	put<T = unknown>(key: string, value: T): Promise<void>;
	put<T = unknown>(entries: {[key: string]: T}): Promise<void>;
	// Deletes the key and associated value. Returns true if the key existed or false if it did not.
	delete(key: string): Promise<boolean>;
	//Deletes the provided keys and their associated values. Supports up to 128 keys at a time. Returns a count of the number of key-value pairs deleted.
	delete(keys: string[]): Promise<number>;
	list<T = unknown>(options: ListOptions): Promise<Map<string, T>>;
};

export type TransactionData = {chainId: string} & (
	| Omit<EIP1193LegacyTransactionData, 'from'>
	| Omit<EIP1193TransactionDataOfType1, 'from'>
	| Omit<EIP1193TransactionDataOfType2, 'from'>
);

export type Wallet = {
	address: `0x${string}`;
	signTransaction(tx: TransactionData): Promise<`0x${string}`>;
};

export type ExecutorConfig = {
	chainId: string;
	provider: EIP1193ProviderWithoutEvents;
	time: Time;
	db: KeyValueDB;
	wallet: Wallet;
	finality: number;
	worstCaseBlockTime: number;
	maxExpiry?: number;
	maxNumTransactionsToProcessInOneGo?: number;
};
