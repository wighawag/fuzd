import {EIP1193Account} from 'eip-1193';
import {ExecutionQueued} from './scheduler-storage';
import {SchemaString0x} from 'fuzd-common';
import z from 'zod';

// ------------------------------------------------------------------------------------------------
// PriorTransactionInfo
// ------------------------------------------------------------------------------------------------
export const SchemaPriorTransactionInfo = z.object({
	hash: SchemaString0x,
	nonce: z.number(),
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
export function GenericSchemaDecryptionResult<TSchemaTransactionDataType extends z.ZodTypeAny>(
	SchemaTransactionDataType: TSchemaTransactionDataType,
) {
	return z.discriminatedUnion('success', [
		z.object({
			success: z.literal(true),
			transactions: z.array(SchemaTransactionDataType),
		}),
		z.object({
			success: z.literal(false),
			newPayload: z.string().optional(),
			newTiming: SchemaTimingTypes.optional(),
			retry: z.number().optional(),
		}),
	]);
}

export type SchemaDecryptionResult<TSchemaTransactionDataType extends z.ZodTypeAny> = ReturnType<
	typeof GenericSchemaDecryptionResult<TSchemaTransactionDataType>
>;

export type DecryptionResult<TransactionDataType> = z.infer<SchemaDecryptionResult<z.ZodType<TransactionDataType>>>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// Decrypter<TransactionDataType>
// ------------------------------------------------------------------------------------------------
export type Decrypter<TransactionDataType> = {
	decrypt(execution: ExecutionQueued<TransactionDataType>): Promise<DecryptionResult<TransactionDataType>>;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// DecryptedPayload<
// ------------------------------------------------------------------------------------------------
export function GenericSchemaDecryptedPayload<TSchemaTransactionDataType extends z.ZodTypeAny>(
	SchemaTransactionDataType: TSchemaTransactionDataType,
) {
	return z.discriminatedUnion('type', [
		z.object({
			type: z.literal('time-locked'),
			payload: z.string(),
			timing: SchemaTimingTypesCompatibleWithTimeLock,
		}),
		z.object({
			type: z.literal('clear'),
			transactions: z.array(SchemaTransactionDataType),
			// TODO timing: new timing that could be delayed ?
		}),
	]);
}
export type SchemaDecryptedPayload<TSchemaTransactionDataType extends z.ZodTypeAny> = ReturnType<
	typeof GenericSchemaDecryptedPayload<TSchemaTransactionDataType>
>;
export type DecryptedPayload<TransactionDataType> = z.infer<SchemaDecryptedPayload<z.ZodType<TransactionDataType>>>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ScheduledTimeLockedExecution
// ------------------------------------------------------------------------------------------------
export const SchemaScheduledTimeLockedExecution = z.object({
	type: z.literal('time-locked'),
	chainId: SchemaString0x,
	slot: z.string(),
	payload: z.string(),
	timing: SchemaTimingTypesCompatibleWithTimeLock,
	maxFeePerGas: z.string(),
	paymentReserve: z.string().optional(),
});
export type ScheduledTimeLockedExecution = z.infer<typeof SchemaScheduledTimeLockedExecution>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ScheduledExecutionInClear
// ------------------------------------------------------------------------------------------------
export function GenericSchemaScheduledExecutionInClear<TSchemaTransactionDataType extends z.ZodTypeAny>(
	SchemaTransactionDataType: TSchemaTransactionDataType,
) {
	return z.object({
		type: z.literal('clear'),
		chainId: SchemaString0x,
		slot: z.string(),
		transactions: z.array(SchemaTransactionDataType),
		timing: SchemaTimingTypes,
		maxFeePerGas: z.string(),
		paymentReserve: z.string().optional(),
	});
}

export type SchemaScheduledExecutionInClear<TSchemaTransactionDataType extends z.ZodTypeAny> = ReturnType<
	typeof GenericSchemaScheduledExecutionInClear<TSchemaTransactionDataType>
>;

export type ScheduledExecutionInClear<TransactionDataType> = z.infer<
	SchemaScheduledExecutionInClear<z.ZodType<TransactionDataType>>
>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ScheduledExecution
// ------------------------------------------------------------------------------------------------
export function GenericSchemaScheduledExecution<TSchemaTransactionDataType extends z.ZodTypeAny>(
	SchemaTransactionDataType: TSchemaTransactionDataType,
) {
	return z.discriminatedUnion('type', [
		SchemaScheduledTimeLockedExecution,
		GenericSchemaScheduledExecutionInClear(SchemaTransactionDataType),
	]);
}

export type SchemaScheduledExecution<TSchemaTransactionDataType extends z.ZodTypeAny> = ReturnType<
	typeof GenericSchemaScheduledExecution<TSchemaTransactionDataType>
>;

export type ScheduledExecution<TransactionDataType> = z.infer<SchemaScheduledExecution<z.ZodType<TransactionDataType>>>;

// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ScheduleInfo
// ------------------------------------------------------------------------------------------------
export const SchemaScheduleInfo = z.object({
	checkinTime: z.number(),
	chainId: SchemaString0x,
	account: SchemaString0x,
	slot: z.string(),
});
export type ScheduleInfo = z.infer<typeof SchemaScheduleInfo>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// Scheduler<
// ------------------------------------------------------------------------------------------------
export type Scheduler<TransactionDataType> = {
	submitExecution(account: EIP1193Account, execution: ScheduledExecution<TransactionDataType>): Promise<ScheduleInfo>;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ExecutionStatus
// ------------------------------------------------------------------------------------------------
export type ExecutionStatus = {type: 'broadcasted' | 'deleted' | 'reassigned' | 'skipped'; reason: string};

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
};
// ------------------------------------------------------------------------------------------------
