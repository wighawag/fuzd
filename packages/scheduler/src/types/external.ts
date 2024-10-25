import {ScheduledExecutionQueued} from './scheduler-storage';
import {ExecutionSubmission, SchemaEIP1193Account, SchemaString0x} from 'fuzd-common';
import z from 'zod';

// ------------------------------------------------------------------------------------------------
// PriorTransactionInfo
// ------------------------------------------------------------------------------------------------
export const SchemaPriorTransactionInfo = z.object({
	hash: SchemaString0x,
	nonce: SchemaString0x,
	broadcastTime: z.number(),
	// TODO
	// expectEvent?: {
	// 	eventABI: AbiEvent;
	// 	startTimeParam?: string;
	// };
});
export type PriorTransactionInfo = z.infer<typeof SchemaPriorTransactionInfo>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// DeltaTime
// ------------------------------------------------------------------------------------------------
export const SchemaDeltaTime = z.object({
	type: z.literal('delta-time'),
	expiry: z.number().optional(),
	startTransaction: SchemaPriorTransactionInfo,
	delta: z.number(),
});

export type DeltaTime = z.infer<typeof SchemaDeltaTime>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// FixedTime
// ------------------------------------------------------------------------------------------------
export const SchemaFixedTime = z.object({
	type: z.literal('fixed-time'),
	expiry: z.number().optional(),
	assumedTransaction: SchemaPriorTransactionInfo.optional(),
	scheduledTime: z.number(),
});

export type FixedTime = z.infer<typeof SchemaFixedTime>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// FixedRound
// ------------------------------------------------------------------------------------------------
export const SchemaFixedRound = z.object({
	type: z.literal('fixed-round'),
	expiry: z.number().optional(),
	assumedTransaction: SchemaPriorTransactionInfo.optional(),
	scheduledRound: z.number(),
	expectedTime: z.number(),
});

export type FixedRound = z.infer<typeof SchemaFixedRound>;

// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// TimingTypesCompatibleWithTimeLock
// ------------------------------------------------------------------------------------------------
export const SchemaTimingTypesCompatibleWithTimeLock = z.discriminatedUnion('type', [
	SchemaFixedRound,
	SchemaFixedTime,
]);
export type TimingTypesCompatibleWithTimeLock = z.infer<typeof SchemaTimingTypesCompatibleWithTimeLock>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// TimingTypes
// ------------------------------------------------------------------------------------------------
export const SchemaTimingTypes = z.discriminatedUnion('type', [SchemaFixedRound, SchemaDeltaTime, SchemaFixedTime]);
export type TimingTypes = z.infer<typeof SchemaTimingTypes>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// DecryptionResult
// ------------------------------------------------------------------------------------------------
export function GenericSchemaDecryptionResult<TSchemaExecutionDataType extends z.ZodTypeAny>(
	SchemaExecutionDataType: TSchemaExecutionDataType,
) {
	return z.discriminatedUnion('success', [
		z.object({
			success: z.literal(true),
			executions: z.array(SchemaExecutionDataType),
		}),
		z.object({
			success: z.literal(false),
			newPayload: z.string().optional(),
			newTiming: SchemaTimingTypes.optional(),
			retry: z.number().optional(),
		}),
	]);
}

export type SchemaDecryptionResult<TSchemaExecutionDataType extends z.ZodTypeAny> = ReturnType<
	typeof GenericSchemaDecryptionResult<TSchemaExecutionDataType>
>;

export type DecryptionResult<ExecutionDataType> = z.infer<SchemaDecryptionResult<z.ZodType<ExecutionDataType>>>;
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
export function GenericSchemaDecryptedPayload<TSchemaExecutionDataType extends z.ZodTypeAny>(
	SchemaExecutionDataType: TSchemaExecutionDataType,
) {
	return z.discriminatedUnion('type', [
		z.object({
			type: z.literal('time-locked'),
			payload: z.string(),
			timing: SchemaTimingTypesCompatibleWithTimeLock,
		}),
		z.object({
			type: z.literal('clear'),
			executions: z.array(SchemaExecutionDataType),
			// TODO timing: new timing that could be delayed ?
		}),
	]);
}
export type SchemaDecryptedPayload<TSchemaExecutionDataType extends z.ZodTypeAny> = ReturnType<
	typeof GenericSchemaDecryptedPayload<TSchemaExecutionDataType>
>;
export type DecryptedPayload<ExecutionDataType> = z.infer<SchemaDecryptedPayload<z.ZodType<ExecutionDataType>>>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ScheduledTimeLockedExecution
// ------------------------------------------------------------------------------------------------
export const SchemaScheduledTimeLockedExecution = z.object({
	type: z.literal('time-locked'),
	chainId: SchemaString0x,
	slot: z.string(),
	onBehalf: SchemaString0x.optional(),
	payload: z.string(),
	timing: SchemaTimingTypesCompatibleWithTimeLock,
	paymentReserve: z.string().optional(),
});
export type ScheduledTimeLockedExecution = z.infer<typeof SchemaScheduledTimeLockedExecution>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ScheduledExecutionInClear
// ------------------------------------------------------------------------------------------------
export function GenericSchemaScheduledExecutionInClear<TSchemaExecutionDataType extends z.ZodTypeAny>(
	SchemaExecutionDataType: TSchemaExecutionDataType,
) {
	return z.object({
		type: z.literal('clear'),
		chainId: SchemaString0x,
		slot: z.string(),
		onBehalf: SchemaString0x.optional(),
		executions: z.array(SchemaExecutionDataType),
		timing: SchemaTimingTypes,
		paymentReserve: z.string().optional(),
	});
}

export type SchemaScheduledExecutionInClear<TSchemaExecutionDataType extends z.ZodTypeAny> = ReturnType<
	typeof GenericSchemaScheduledExecutionInClear<TSchemaExecutionDataType>
>;

export type ScheduledExecutionInClear<ExecutionDataType> = z.infer<
	SchemaScheduledExecutionInClear<z.ZodType<ExecutionDataType>>
>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ScheduledExecution
// ------------------------------------------------------------------------------------------------
export function GenericSchemaScheduledExecution<TSchemaTransactionData extends z.ZodTypeAny>(
	SchemaExecutionDataType: TSchemaTransactionData,
) {
	return z.discriminatedUnion('type', [
		SchemaScheduledTimeLockedExecution,
		GenericSchemaScheduledExecutionInClear(SchemaExecutionDataType),
	]);
}

export type SchemaScheduledExecution<TSchemaExecutionDataType extends z.ZodTypeAny> = ReturnType<
	typeof GenericSchemaScheduledExecution<TSchemaExecutionDataType>
>;

export type ScheduledExecution<ExecutionDataType> = z.infer<SchemaScheduledExecution<z.ZodType<ExecutionDataType>>>;

// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ScheduleInfo
// ------------------------------------------------------------------------------------------------
export const SchemaScheduleInfo = z.object({
	checkinTime: z.number(),
	chainId: SchemaString0x,
	account: SchemaEIP1193Account,
	slot: z.string(),
});
export type ScheduleInfo = z.infer<typeof SchemaScheduleInfo>;
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
