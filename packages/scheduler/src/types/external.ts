import {ScheduledExecutionQueued} from './scheduler-storage.js';
import {ExecutionSubmission} from 'fuzd-common';
// ------------------------------------------------------------------------------------------------
// PriorTransactionInfo
// ------------------------------------------------------------------------------------------------
export type PriorTransactionInfo = {
	hash: `0x${string}`;
	nonce: `0x${string}`;
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

// ------------------------------------------------------------------------------------------------
// ScheduledTimeLockedExecution
// ------------------------------------------------------------------------------------------------
export type ScheduledTimeLockedExecution = {
	type: 'time-locked';
	chainId: `0x${string}`;
	slot: string;
	onBehalf?: `0x${string}`;
	payload: string;
	timing: TimingTypesCompatibleWithTimeLock;
	paymentReserve?: string;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ScheduledExecutionInClear
// ------------------------------------------------------------------------------------------------
export type ScheduledExecutionInClear<ExecutionDataType> = {
	type: 'clear';
	chainId: `0x${string}`;
	slot: string;
	onBehalf?: `0x${string}`;
	executions: ExecutionDataType[];
	timing: TimingTypes;
	paymentReserve?: string;
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
	chainId: `0x${string}`;
	account: `0x${string}`;
	slot: string;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// Scheduler<
// ------------------------------------------------------------------------------------------------
export type Scheduler<TransactionDataType> = {
	scheduleExecution(
		account: `0x${string}`,
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
	executions: {chainId: string; account: `0x${string}`; slot: string; checkinTime: number; status: ExecutionStatus}[];
	chainTimetamps: {[chainId: string]: number};
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
