import {ScheduledExecutionQueued} from './scheduler-storage.js';
import {ExecutionSubmission, String0x, ExecutionServiceParameters, IntegerString} from 'fuzd-common';
// ------------------------------------------------------------------------------------------------
// PriorTransactionInfo
// ------------------------------------------------------------------------------------------------
export type PriorTransactionInfo = {
	hash: String0x;
	nonce: String0x;
	broadcastTime: number;
	// TODO
	// expectEvent?: {
	// 	eventABI: AbiEvent;
	// 	startTimeParam?: string;
	// };
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// DeltaTime
// ------------------------------------------------------------------------------------------------
export type DeltaTime = {
	type: 'delta-time';
	expiry?: number;
	startTransaction: PriorTransactionInfo;
	delta: number;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// FixedTime
// ------------------------------------------------------------------------------------------------
export type FixedTime = {
	type: 'fixed-time';
	expiry?: number;
	assumedTransaction?: PriorTransactionInfo;
	scheduledTime: number;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// FixedRound
// ------------------------------------------------------------------------------------------------
export type FixedRound = {
	type: 'fixed-round';
	expiry?: number;
	assumedTransaction?: PriorTransactionInfo;
	scheduledRound: number;
	expectedTime: number;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// TimingTypesCompatibleWithTimeLock
// ------------------------------------------------------------------------------------------------
export type TimingTypesCompatibleWithTimeLock = FixedRound | FixedTime;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// TimingTypes
// ------------------------------------------------------------------------------------------------
export type TimingTypes = FixedRound | DeltaTime | FixedTime;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// DecryptionResult
// ------------------------------------------------------------------------------------------------
export type DecryptionResult<ExecutionDataType> =
	| {success: true; executions: ExecutionDataType[]}
	| {success: false; newPayload?: string; newTiming?: TimingTypes; retry?: number};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// Decrypter<ExecutionDataType>
// ------------------------------------------------------------------------------------------------
export type Decrypter<ExecutionDataType> = {
	decrypt(execution: ScheduledExecutionQueued<ExecutionDataType>): Promise<DecryptionResult<ExecutionDataType>>;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// DecryptedPayload<
// ------------------------------------------------------------------------------------------------
export type DecryptedPayload<ExecutionDataType> =
	| {type: 'time-locked'; payload: string; timing: TimingTypesCompatibleWithTimeLock}
	| {type: 'clear'; executions: ExecutionDataType[]};
// ------------------------------------------------------------------------------------------------

export type BaseScheduledExecution = {
	chainId: IntegerString;
	slot: string;
	onBehalf?: String0x;
	paymentReserve?: {amount: string; broadcaster: String0x};
	executionServiceParameters: ExecutionServiceParameters;
};

// ------------------------------------------------------------------------------------------------
// ScheduledTimeLockedExecution
// ------------------------------------------------------------------------------------------------
export type ScheduledTimeLockedExecution = BaseScheduledExecution & {
	type: 'time-locked';
	payload: string;
	timing: TimingTypesCompatibleWithTimeLock;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ScheduledExecutionInClear
// ------------------------------------------------------------------------------------------------
export type ScheduledExecutionInClear<ExecutionDataType> = BaseScheduledExecution & {
	type: 'clear';
	executions: ExecutionDataType[];
	timing: TimingTypes;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ScheduledExecution
// ------------------------------------------------------------------------------------------------
export type ScheduledExecution<ExecutionDataType> =
	| ScheduledTimeLockedExecution
	| ScheduledExecutionInClear<ExecutionDataType>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ScheduleInfo
// ------------------------------------------------------------------------------------------------
export type ScheduleInfo = {
	checkinTime: number;
	chainId: IntegerString;
	account: String0x;
	slot: string;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// Scheduler<
// ------------------------------------------------------------------------------------------------
export type Scheduler<TransactionDataType> = {
	scheduleExecution(
		account: String0x,
		execution: ScheduledExecution<ExecutionSubmission<TransactionDataType>>,
	): Promise<ScheduleInfo>;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ExecutionStatus
// ------------------------------------------------------------------------------------------------
export type ExecutionStatus = {
	type: 'unknown' | 'deleted' | 'broadcasted' | 'archived' | 'reassigned' | 'skipped' | 'finalized';
	reason: string;
};

// ------------------------------------------------------------------------------------------------
// QueueProcessingResult
// ------------------------------------------------------------------------------------------------
export type QueueProcessingResult = {
	limit: number;
	executions: {chainId: string; account: String0x; slot: string; checkinTime: number; status: ExecutionStatus}[];
	chainTimestamps: {[chainId: string]: number};
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// SchedulerBackend
// ------------------------------------------------------------------------------------------------
export type SchedulerBackend = {
	processQueue(): Promise<QueueProcessingResult>;
	checkScheduledExecutionStatus(): Promise<QueueProcessingResult>;
};
// ------------------------------------------------------------------------------------------------
