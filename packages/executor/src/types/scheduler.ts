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
	// TODO
	// expectEvent?: {
	// 	eventABI: AbiEvent;
	// };
};

export type FixedTimeExecution<T extends AssumedTransaction = AssumedTransaction> = {
	type: 'fixed';
	expiry?: number;
	assumedTransaction?: T;
	timestamp: number;
};

export type DecryptedTransactionData = ExecutionSubmission;

export type ExecutionDataInClear = {
	type: 'clear';
	execution: DecryptedTransactionData;
};

export type ExecutionDataTimedLocked = {
	type: 'time-locked';
	payload: `0x${string}`;
	// TODO algorithm?: string;
};

export type ExecutionData = ExecutionDataInClear | ExecutionDataTimedLocked;

export type Execution = {
	tx: ExecutionData;
	timing: FixedTimeExecution | DeltaExecution; // TODO time-locked should have different timing, at least for game like conquest
};

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
