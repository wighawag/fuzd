import {ScheduledExecutionQueued} from './scheduler-storage.js';
import {
	ExecutionSubmission,
	String0x,
	ExecutionServiceParameters,
	IntegerString,
	IntegerStringSchema,
	String0xSchema,
	ExecutionServiceParametersSchema,
} from 'fuzd-common';
import * as z from 'zod/v4';
// ------------------------------------------------------------------------------------------------
// PriorTransactionInfo
// ------------------------------------------------------------------------------------------------
export type PriorTransactionInfo = {
	from: String0x;
	hash: String0x;
	nonce: String0x;
	broadcastTime: number;
	// TODO
	// expectEvent?: {
	// 	eventABI: AbiEvent;
	// 	startTimeParam?: string;
	// };
};
export const PriorTransactionInfoSchema = z.object({
	from: String0xSchema,
	hash: String0xSchema,
	nonce: String0xSchema,
	broadcastTime: z.number().int(),
	// expectEvent: z
	// 	.object({
	// 		eventABI: AbiEventSchema,
	// 		startTimeParam: z.string().optional(),
	// 	})
	// 	.optional(),
}) satisfies z.ZodType<PriorTransactionInfo>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// DeltaTime
// ------------------------------------------------------------------------------------------------
export type DeltaTime = {
	type: 'delta-time';
	expiryDelta?: number;
	startTransaction: PriorTransactionInfo;
	delta: number;
};
export const DeltaTimeSchema = z.object({
	type: z.literal('delta-time'),
	expiryDelta: z.number().int().optional(),
	startTransaction: PriorTransactionInfoSchema,
	delta: z.number().int(),
}) satisfies z.ZodType<DeltaTime>;
// ------------------------------------------------------------------------------------------------
// DeltaTimeWithTargetTime
// ------------------------------------------------------------------------------------------------
export type DeltaTimeWithTargetTime = {
	type: 'delta-time-with-target-time';
	expiryDelta?: number;
	startTransaction: PriorTransactionInfo;
	delta: number;
	targetTimeUnlessHigherDelta: number;
};
export const DeltaTimeWithTargetTimeSchema = z.object({
	type: z.literal('delta-time-with-target-time'),
	expiryDelta: z.number().int().optional(),
	startTransaction: PriorTransactionInfoSchema,
	delta: z.number().int(),
	targetTimeUnlessHigherDelta: z.number().int(),
}) satisfies z.ZodType<DeltaTimeWithTargetTime>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// FixedTime
// ------------------------------------------------------------------------------------------------
export type FixedTime = {
	type: 'fixed-time';
	expiryDelta?: number;
	assumedTransaction?: PriorTransactionInfo;
	scheduledTime: number;
};
export const FixedTimeSchema = z.object({
	type: z.literal('fixed-time'),
	expiryDelta: z.number().int().optional(),
	assumedTransaction: PriorTransactionInfoSchema.optional(),
	scheduledTime: z.number().int(),
}) satisfies z.ZodType<FixedTime>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// FixedRound
// ------------------------------------------------------------------------------------------------
export type FixedRound = {
	type: 'fixed-round';
	expiryDelta?: number;
	assumedTransaction?: PriorTransactionInfo;
	scheduledRound: number;
	expectedTime: number;
};
export const FixedRoundSchema = z.object({
	type: z.literal('fixed-round'),
	expiryDelta: z.number().int().optional(),
	assumedTransaction: PriorTransactionInfoSchema.optional(),
	scheduledRound: z.number().int(),
	expectedTime: z.number().int(),
}) satisfies z.ZodType<FixedRound>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// TimingTypesCompatibleWithTimeLock
// ------------------------------------------------------------------------------------------------
export type TimingTypesCompatibleWithTimeLock = FixedRound | FixedTime | DeltaTimeWithTargetTime;
export const TimingTypesCompatibleWithTimeLockSchema = z.union([
	FixedRoundSchema,
	FixedTimeSchema,
	DeltaTimeWithTargetTimeSchema,
]) satisfies z.ZodType<TimingTypesCompatibleWithTimeLock>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// TimingTypes
// ------------------------------------------------------------------------------------------------
export type TimingTypes = FixedRound | DeltaTime | DeltaTimeWithTargetTime | FixedTime;
export const TimingTypesSchema = z.union([
	FixedRoundSchema,
	DeltaTimeSchema,
	DeltaTimeWithTargetTimeSchema,
	FixedTimeSchema,
]) satisfies z.ZodType<TimingTypes>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// DecryptionResult
// ------------------------------------------------------------------------------------------------
export type DecryptionResult<ExecutionDataType> =
	| {success: true; executions: ExecutionDataType[]}
	| {success: false; newPayload?: string; newTiming?: TimingTypes; retry?: number};
export const DecryptionResultSchema = (<TypeT extends z.ZodType>(typeSchema: TypeT) => {
	return z.discriminatedUnion('success', [
		z.object({
			success: z.literal(true),
			executions: z.array(typeSchema),
		}),
		z.object({
			success: z.literal(false),
			newPayload: z.string().optional(),
			newTiming: TimingTypesSchema.optional(),
			retry: z.number().int().optional(),
		}),
	]);
}) satisfies <T extends z.ZodType>(schema: T) => z.ZodType<DecryptionResult<z.infer<T>>>;
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
export const DecryptedPayloadSchema = (<TypeT extends z.ZodType>(typeSchema: TypeT) => {
	return z.discriminatedUnion('type', [
		z.object({
			type: z.literal('time-locked'),
			payload: z.string(),
			timing: TimingTypesCompatibleWithTimeLockSchema,
		}),
		z.object({
			type: z.literal('clear'),
			executions: z.array(typeSchema),
		}),
	]);
}) satisfies <T extends z.ZodType>(schema: T) => z.ZodType<DecryptedPayload<z.infer<T>>>;
// ------------------------------------------------------------------------------------------------

export type BaseScheduledExecution = {
	chainId: IntegerString;
	slot: string;
	onBehalf?: String0x;
	paymentReserve?: {amount: string; broadcaster: String0x};
	executionServiceParameters: ExecutionServiceParameters;
};
export const BaseScheduledExecutionSchema = z.object({
	chainId: IntegerStringSchema,
	slot: z.string(),
	onBehalf: String0xSchema.optional(),
	paymentReserve: z
		.object({
			amount: z.string(),
			broadcaster: String0xSchema,
		})
		.optional(),
	executionServiceParameters: ExecutionServiceParametersSchema,
}) satisfies z.ZodType<BaseScheduledExecution>;

// ------------------------------------------------------------------------------------------------
// ScheduledTimeLockedExecution
// ------------------------------------------------------------------------------------------------
export type ScheduledTimeLockedExecution = BaseScheduledExecution & {
	type: 'time-locked';
	payload: string;
	timing: TimingTypesCompatibleWithTimeLock;
};
export const ScheduledExecutionTimeLockedSchema = BaseScheduledExecutionSchema.extend({
	type: z.literal('time-locked'),
	payload: z.string(),
	timing: TimingTypesCompatibleWithTimeLockSchema,
}) satisfies z.ZodType<ScheduledTimeLockedExecution>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ScheduledExecutionInClear
// ------------------------------------------------------------------------------------------------
export type ScheduledExecutionInClear<ExecutionDataType> = BaseScheduledExecution & {
	type: 'clear';
	executions: ExecutionDataType[];
	timing: TimingTypes;
};
export const ScheduledExecutionInClearSchema = (<TypeT extends z.ZodType>(typeSchema: TypeT) => {
	return BaseScheduledExecutionSchema.extend({
		type: z.literal('clear'),
		executions: z.array(typeSchema),
		timing: TimingTypesSchema,
	});
}) satisfies <T extends z.ZodType>(schema: T) => z.ZodType<ScheduledExecutionInClear<z.infer<T>>>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ScheduledExecution
// ------------------------------------------------------------------------------------------------
export type ScheduledExecution<ExecutionDataType> =
	| ScheduledTimeLockedExecution
	| ScheduledExecutionInClear<ExecutionDataType>;
export const ScheduledExecutionSchema = (<TypeT extends z.ZodType>(typeSchema: TypeT) => {
	return z.discriminatedUnion('type', [
		ScheduledExecutionTimeLockedSchema,
		ScheduledExecutionInClearSchema(typeSchema),
	]);
}) satisfies <T extends z.ZodType>(schema: T) => z.ZodType<ScheduledExecution<z.infer<T>>>;
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
export const ScheduleInfoAchema = z.object({
	checkinTime: z.number().int(),
	chainId: IntegerStringSchema,
	account: String0xSchema,
	slot: z.string(),
}) satisfies z.ZodType<ScheduleInfo>;
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
export const ExecutionStatus = z.object({
	type: z.enum(['unknown', 'deleted', 'broadcasted', 'archived', 'reassigned', 'skipped', 'finalized']),
	reason: z.string(),
}) satisfies z.ZodType<ExecutionStatus>;
// ------------------------------------------------------------------------------------------------
// QueueProcessingResult
// ------------------------------------------------------------------------------------------------
export type QueueProcessingResult = {
	limit: number;
	executions: {chainId: string; account: String0x; slot: string; checkinTime: number; status: ExecutionStatus}[];
	chainTimestamps: {[chainId: string]: number};
};
export const QueueProcessingResultSchema = z.object({
	limit: z.number().int(),
	executions: z.array(
		z.object({
			chainId: z.string(),
			account: String0xSchema,
			slot: z.string(),
			checkinTime: z.number().int(),
			status: ExecutionStatus,
		}),
	),
	chainTimestamps: z.record(z.string(), z.number().int()),
}) satisfies z.ZodType<QueueProcessingResult>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// SchedulerBackend
// ------------------------------------------------------------------------------------------------
export type SchedulerBackend = {
	processQueue(): Promise<QueueProcessingResult>;
	checkScheduledExecutionStatus(): Promise<QueueProcessingResult>;
};
// ------------------------------------------------------------------------------------------------
