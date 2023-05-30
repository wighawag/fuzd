import {
	EIP1193AccessList,
	EIP1193Account,
	EIP1193LegacyTransactionData,
	EIP1193ProviderWithoutEvents,
	EIP1193TransactionData,
	EIP1193TransactionDataOfType1,
	EIP1193TransactionDataOfType2,
} from 'eip-1193';

import type {AbiEvent} from 'abitype';

type BaseExecution = {
	assumingTransaction?: {
		// the execution should only happen if that tx is included in a block
		// which can serve as a startTime
		hash: `0x${string}`;
		nonce: number;
		broadcastTime?: number; // this can be used as an estimate
		// TODO should we also allow an executor to broadcast both commit tx + reveal tx ?
		expectEvent?: {
			eventABI: AbiEvent;
			startTimeParam?: string;
		};
	};
	timing: {
		expiry?: number;
	} & (
		| {
				type: 'duration';
				duration: number | {};
		  }
		| {
				type: 'timestamp';
				timestamp: number;
		  }
	);
};

export type ExecutionData =
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

export type SingleFeeStrategy = {
	type: 'single';
	maxFeePerGas: string;
	maxPriorityFeePerGas: string;
};

export type FeeStrategy = SingleFeeStrategy;

export type ExecutionInClear = BaseExecution & {
	type: 'clear';
	data: ExecutionData;
	to: EIP1193Account;
	gas: string;
	feeStrategy: FeeStrategy;
	accessList?: EIP1193AccessList;
};

export type EncryptedExecution = BaseExecution & {
	type: 'encrypted';
	payload: `0x${string}`; // get decrypted in the ExecutionData type
};

export type Execution = EncryptedExecution | ExecutionInClear;

export type Time = {
	getTimestamp(): Promise<number>;
};

export type ExecutionBroadcastStored = {
	pendingID?: string;
	queueID: string;
};

export type ExecutionStored = Execution & {id: string; assumedTransactionConfirmed?: number; retries: number};

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
