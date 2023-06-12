import {
	EIP1193AccessList,
	EIP1193Account,
	EIP1193DATA,
	EIP1193ProviderWithoutEvents,
	EIP1193SignerProvider,
} from 'eip-1193';
import {AbiEvent} from 'abitype';
import {ExecutorStorage} from './storage';

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
	gas: number;
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
	type: 'time-locked';
	payload: `0x${string}`;
	// TODO algorithm?: string;
};

export type ExecutionData = ExecutionDataInClear | ExecutionDataTimedLocked;

export type SingleFeeStrategy = {
	type: 'single';
	maxFeePerGas: bigint;
	maxPriorityFeePerGas: bigint;
};

export type FeeStrategy = SingleFeeStrategy;

export type Time = {
	getTimestamp(): Promise<number>;
};

export type Execution = {
	tx: ExecutionData;
	timing: FixedTimeExecution | DeltaExecution;
};

export type ExecutorConfig = {
	chainId: string;
	provider: EIP1193ProviderWithoutEvents;
	time: Time;
	storage: ExecutorStorage;
	signerProvider: EIP1193SignerProvider;
	finality: number;
	worstCaseBlockTime: number;
	maxExpiry?: number;
	maxNumTransactionsToProcessInOneGo?: number;
};
