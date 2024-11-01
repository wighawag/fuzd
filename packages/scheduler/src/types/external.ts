import {ScheduledExecutionQueued} from './scheduler-storage.js';
import {ExecutionSubmission, String0x} from 'fuzd-common';
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

// ------------------------------------------------------------------------------------------------
// ScheduledTimeLockedExecution
// ------------------------------------------------------------------------------------------------
export type ScheduledTimeLockedExecution = {
	type: 'time-locked';
	chainId: String0x;
	slot: string;
	onBehalf?: String0x;
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
	chainId: String0x;
	slot: string;
	onBehalf?: String0x;
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
	chainId: String0x;
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
