import {EIP1193Account, EIP1193ProviderWithoutEvents} from 'eip-1193';
// import {AbiEvent} from 'abitype';
import {SchedulerStorage} from './scheduler-storage';
import {Time} from './common';
import {Executor} from './executor';
import {ExecutionSubmission} from './executor';

export type StartTransaction = {
	// the execution should only happen if that tx is included in a block
	// which can serve as a startTime
	hash: `0x${string}`;
	nonce: number;
	broadcastTime: number;
	// TODO
	// expectEvent?: {
	// 	eventABI: AbiEvent;
	// 	startTimeParam?: string;
	// };
};

export type DeltaExecution<TimeValueType = number, TransactionType extends StartTransaction = StartTransaction> = {
	type: 'delta';
	expiry?: number;
	startTransaction: TransactionType;
	delta: TimeValueType;
};

export type AssumedTransaction = {
	// the execution should only happen if that tx is included in a block
	hash: `0x${string}`;
	nonce: number;
	// TODO
	// expectEvent?: {
	// 	eventABI: AbiEvent;
	// };
};

export type FixedTimeExecution<
	TimeValueType = number,
	TransactionType extends AssumedTransaction = AssumedTransaction
> = {
	type: 'fixed';
	expiry?: number;
	assumedTransaction?: TransactionType;
	timestamp: TimeValueType;
};

export type PartiallyHiddenTimeValue = {
	type: 'periodic';
	value: number;
};

export type TimeLockedExecution<
	StartTransactionType extends StartTransaction = StartTransaction,
	AssumedTransactionType extends AssumedTransaction = AssumedTransaction
> = {
	type: 'time-locked';
	payload: `0x${string}`;
	timing:
		| FixedTimeExecution<number | PartiallyHiddenTimeValue, AssumedTransactionType>
		| DeltaExecution<number | PartiallyHiddenTimeValue, StartTransactionType>;
	// TODO algo:
};

export type ExecutionInClear<
	StartTransactionType extends StartTransaction = StartTransaction,
	AssumedTransactionType extends AssumedTransaction = AssumedTransaction
> = {
	type: 'clear';
	tx: ExecutionSubmission;
	timing: FixedTimeExecution<number, AssumedTransactionType> | DeltaExecution<number, StartTransactionType>;
};

export type Execution<
	StartTransactionType extends StartTransaction = StartTransaction,
	AssumedTransactionType extends AssumedTransaction = AssumedTransaction
> =
	| TimeLockedExecution<StartTransactionType, AssumedTransactionType>
	| ExecutionInClear<StartTransactionType, AssumedTransactionType>;

export type SchedulerConfig = {
	executor: Executor;
	chainId: string;
	provider: EIP1193ProviderWithoutEvents;
	time: Time;
	storage: SchedulerStorage;
	finality: number;
	worstCaseBlockTime: number;
	maxExpiry?: number;
	maxNumTransactionsToProcessInOneGo?: number;
};

export type ScheduleInfo = {
	executionTime: number;
};

export type Scheduler = {
	submitExecution(id: string, account: EIP1193Account, execution: Execution): Promise<ScheduleInfo>;
};

export type SchedulerBackend = {
	processQueue(): Promise<void>;
};
