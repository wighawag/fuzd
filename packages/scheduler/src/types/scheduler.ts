import {EIP1193Account, EIP1193DATA, EIP1193ProviderWithoutEvents} from 'eip-1193';
// import {AbiEvent} from 'abitype';
import {ExecutionQueued, SchedulerStorage} from './scheduler-storage';
import {Executor} from './common';
import {Time, SchemaString0x} from 'fuzd-common';
import z, {ZodType} from 'zod';

// ------------------------------------------------------------------------------------------------
// RoundedBasedTiming
// ------------------------------------------------------------------------------------------------
export const SchemaRoundBasedTiming = z.object({
	type: z.literal('round'),
	round: z.number(),
	expectedTime: z.number(),
});
export type RoundBasedTiming = z.infer<typeof SchemaRoundBasedTiming>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// TimeBasedTiming // TODO rename
// ------------------------------------------------------------------------------------------------
export const SchemaTimeBasedTiming = z.object({
	type: z.literal('time'),
	time: z.number(),
});
export type TimeBasedTiming = z.infer<typeof SchemaTimeBasedTiming>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// FixedTiming
// ------------------------------------------------------------------------------------------------
export const SchemaFixedTiming = z.discriminatedUnion('type', [SchemaTimeBasedTiming, SchemaRoundBasedTiming]);
export type FixedTiming = z.infer<typeof SchemaFixedTiming>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// PartiallyHiddenTimeValue
// ------------------------------------------------------------------------------------------------
export const SchemaPartiallyHiddenTimeValue = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('time-period'),
		startTime: z.number(),
		periodInSeconds: z.number(),
	}),
	z.object({
		type: z.literal('round-period'),
		startTime: z.number(),
		periodInRounds: z.number(),
		averageSecondsPerRound: z.number(),
	}),
]);
export type PartiallyHiddenTimeValue = z.infer<typeof SchemaPartiallyHiddenTimeValue>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// TimingTypes
// ------------------------------------------------------------------------------------------------
export const SchemaTimingTypes = z.union([SchemaFixedTiming, SchemaPartiallyHiddenTimeValue]);
export type TimingTypes = z.infer<typeof SchemaTimingTypes>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// StartTransaction
// ------------------------------------------------------------------------------------------------
// the execution should only happen if that tx is included in a block
// which can serve as a startTime
export const SchemaStartTransaction = z.object({
	hash: SchemaString0x,
	nonce: z.number(),
	broadcastTime: z.number(),
	// TODO
	// expectEvent?: {
	// 	eventABI: AbiEvent;
	// 	startTimeParam?: string;
	// };
});
export type StartTransaction = z.infer<typeof SchemaStartTransaction>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// SchemaDeltaScheduledExecution<
// ------------------------------------------------------------------------------------------------
export function GenericSchemaDeltaScheduledExecution<
	TSchemaTimeValueType extends z.ZodType<FixedTiming> = typeof SchemaFixedTiming,
	TSchemaTransactionType extends z.ZodType<StartTransaction> = typeof SchemaStartTransaction,
>(SchemaTimeValueType?: TSchemaTimeValueType, SchemaTransactionType?: TSchemaTransactionType) {
	// optional argument do not seemt to work even with setting their default value as below
	if (!SchemaTimeValueType) {
		SchemaTimeValueType = SchemaFixedTiming as unknown as TSchemaTimeValueType;
	}
	if (!SchemaTransactionType) {
		SchemaTransactionType = SchemaStartTransaction as unknown as TSchemaTransactionType;
	}
	return z.object({
		type: z.literal('delta'),
		expiry: z.number().optional(),
		startTransaction: SchemaTransactionType,
		delta: SchemaTimeValueType,
	});
}
export type SchemaDeltaScheduledExecution<
	TSchemaTimeValueType extends z.ZodType<FixedTiming>,
	TSchemaTransactionType extends z.ZodType<StartTransaction>,
> = ReturnType<typeof GenericSchemaDeltaScheduledExecution<TSchemaTimeValueType, TSchemaTransactionType>>;

export type DeltaScheduledExecution<
	TTimeValueType extends FixedTiming = FixedTiming,
	TSchemaTransaction extends StartTransaction = StartTransaction,
> = z.infer<SchemaDeltaScheduledExecution<ZodType<TTimeValueType>, ZodType<TSchemaTransaction>>>;

// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// AssumedTransaction
// ------------------------------------------------------------------------------------------------
export const SchemaAssumedTransaction = z.object({
	// the execution should only happen if that tx is included in a block
	hash: SchemaString0x,
	nonce: z.number(),
	// TODO
	// expectEvent?: {
	// 	eventABI: AbiEvent;
	// };
});
export type AssumedTransaction = z.infer<typeof SchemaAssumedTransaction>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// FixedTimeScheduledExecution
// ------------------------------------------------------------------------------------------------
export function GenericFixedTimeScheduledExecution<
	TSchemaTimeValueType extends z.ZodType<TimingTypes> = typeof SchemaTimingTypes,
	TSchemaTransactionType extends z.ZodType<AssumedTransaction> = typeof SchemaAssumedTransaction,
>(
	SchemaTimeValueType: TSchemaTimeValueType = SchemaFixedTiming as unknown as TSchemaTimeValueType,
	SchemaTransactionType: TSchemaTransactionType = SchemaAssumedTransaction as unknown as TSchemaTransactionType,
) {
	return z.object({
		type: z.literal('fixed'),
		expiry: z.number().optional(),
		assumedTransaction: SchemaTransactionType.optional(),
		value: SchemaTimeValueType,
	});
}

export type SchemaFixedTimeScheduledExecution<
	TSchemaTimeValueType extends z.ZodType<TimingTypes>,
	TSchemaTransactionType extends z.ZodType<AssumedTransaction>,
> = ReturnType<typeof GenericFixedTimeScheduledExecution<TSchemaTimeValueType, TSchemaTransactionType>>;

export type FixedTimeScheduledExecution<
	TTimeValueType extends TimingTypes = FixedTiming,
	TSchemaTransaction extends AssumedTransaction = AssumedTransaction,
> = z.infer<SchemaFixedTimeScheduledExecution<ZodType<TTimeValueType>, ZodType<TSchemaTransaction>>>;
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
			newTiming: SchemaRoundBasedTiming.optional(),
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
			type: z.literal('timed-locked'),
			payload: z.string(),
			timing: SchemaRoundBasedTiming,
		}),
		z.object({
			type: z.literal('clear'),
			transactions: z.array(SchemaTransactionDataType),
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
export function GenericScheduledTimeLockedExecution<
	TSchemaFixedTimingType extends z.ZodType<TimingTypes>,
	TSchemaAssumedTransactionType extends z.ZodType<AssumedTransaction> = typeof SchemaAssumedTransaction,
>(
	SchemaFixedTimingType: TSchemaFixedTimingType,
	SchemaAssumedTransactionType: TSchemaAssumedTransactionType = SchemaAssumedTransaction as unknown as TSchemaAssumedTransactionType,
) {
	return z.object({
		type: z.literal('time-locked'),
		chainId: SchemaString0x,
		slot: z.string(),
		payload: z.string(),
		timing: GenericFixedTimeScheduledExecution(SchemaFixedTimingType, SchemaAssumedTransactionType),
	});
}

export type SchemaScheduledTimeLockedExecution<
	TSchemaFixedTimingType extends z.ZodType<TimingTypes>,
	TSchemaAssumedTransactionType extends z.ZodType<AssumedTransaction> = typeof SchemaAssumedTransaction,
> = ReturnType<typeof GenericScheduledTimeLockedExecution<TSchemaFixedTimingType, TSchemaAssumedTransactionType>>;

export type ScheduledTimeLockedExecution<
	FixedTimingType extends TimingTypes,
	AssumedTransactionType extends AssumedTransaction = AssumedTransaction,
> = z.infer<SchemaScheduledTimeLockedExecution<z.ZodType<FixedTimingType>, z.ZodType<AssumedTransactionType>>>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ScheduledExecutionInClear
// ------------------------------------------------------------------------------------------------
export function GenericSchemaScheduledExecutionInClear<
	TSchemaTransactionDataType extends z.ZodTypeAny,
	TSchemaFixedTimingType extends z.ZodType<TimingTypes>,
	TSchemaDeltaTimingType extends z.ZodType<FixedTiming>,
	TSchemaStartTransactionType extends z.ZodType<StartTransaction> = typeof SchemaStartTransaction,
	TSchemaAssumedTransactionType extends z.ZodType<AssumedTransaction> = typeof SchemaAssumedTransaction,
>(
	SchemaTransactionDataType: TSchemaTransactionDataType,
	SchemaFixedTimingType: TSchemaFixedTimingType,
	SchemaDeltaTimingType: TSchemaDeltaTimingType,
	SchemaStartTransactionType: TSchemaStartTransactionType = SchemaStartTransaction as unknown as TSchemaStartTransactionType,
	SchemaAssumedTransactionType: TSchemaAssumedTransactionType = SchemaAssumedTransaction as unknown as TSchemaAssumedTransactionType,
) {
	return z.object({
		type: z.literal('clear'),
		chainId: SchemaString0x,
		slot: z.string(),
		transactions: z.array(SchemaTransactionDataType),
		timing: z.discriminatedUnion('type', [
			GenericFixedTimeScheduledExecution(SchemaFixedTimingType, SchemaAssumedTransactionType),
			GenericSchemaDeltaScheduledExecution(SchemaDeltaTimingType, SchemaStartTransactionType),
		]),
	});
}

export type SchemaScheduledExecutionInClear<
	TSchemaTransactionDataType extends z.ZodTypeAny,
	TSchemaFixedTimingType extends z.ZodType<TimingTypes>,
	TSchemaDeltaTimingType extends z.ZodType<FixedTiming>,
	TSchemaStartTransactionType extends z.ZodType<StartTransaction> = typeof SchemaStartTransaction,
	TSchemaAssumedTransactionType extends z.ZodType<AssumedTransaction> = typeof SchemaAssumedTransaction,
> = ReturnType<
	typeof GenericSchemaScheduledExecutionInClear<
		TSchemaTransactionDataType,
		TSchemaFixedTimingType,
		TSchemaDeltaTimingType,
		TSchemaStartTransactionType,
		TSchemaAssumedTransactionType
	>
>;

export type ScheduledExecutionInClear<
	TransactionDataType,
	FixedTimingType extends TimingTypes,
	DeltaTimingType extends FixedTiming,
	StartTransactionType extends StartTransaction = StartTransaction,
	AssumedTransactionType extends AssumedTransaction = AssumedTransaction,
> = z.infer<
	SchemaScheduledExecutionInClear<
		z.ZodType<TransactionDataType>,
		z.ZodType<FixedTimingType>,
		z.ZodType<DeltaTimingType>,
		z.ZodType<StartTransactionType>,
		z.ZodType<AssumedTransactionType>
	>
>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ScheduledExecution
// ------------------------------------------------------------------------------------------------
export function GenericSchemaScheduledExecution<
	TSchemaTransactionDataType extends z.ZodTypeAny,
	TSchemaFixedTimingType extends z.ZodType<TimingTypes> = typeof SchemaTimingTypes,
	TSchemaDeltaTimingType extends z.ZodType<FixedTiming> = typeof SchemaFixedTiming,
	TSchemaStartTransactionType extends z.ZodType<StartTransaction> = typeof SchemaStartTransaction,
	TSchemaAssumedTransactionType extends z.ZodType<AssumedTransaction> = typeof SchemaAssumedTransaction,
>(
	SchemaTransactionDataType: TSchemaTransactionDataType,
	SchemaFixedTimingType: TSchemaFixedTimingType = SchemaTimingTypes as unknown as TSchemaFixedTimingType,
	SchemaDeltaTimingType: TSchemaDeltaTimingType = SchemaFixedTiming as unknown as TSchemaDeltaTimingType,
	SchemaStartTransactionType: TSchemaStartTransactionType = SchemaStartTransaction as unknown as TSchemaStartTransactionType,
	SchemaAssumedTransactionType: TSchemaAssumedTransactionType = SchemaAssumedTransaction as unknown as TSchemaAssumedTransactionType,
) {
	return z.discriminatedUnion('type', [
		GenericScheduledTimeLockedExecution(SchemaFixedTimingType, SchemaAssumedTransactionType),
		GenericSchemaScheduledExecutionInClear(
			SchemaTransactionDataType,
			SchemaFixedTimingType,
			SchemaDeltaTimingType,
			SchemaStartTransactionType,
			SchemaAssumedTransactionType,
		),
	]);
}

export type SchemaScheduledExecution<
	TSchemaTransactionDataType extends z.ZodTypeAny,
	TSchemaFixedTimingType extends z.ZodType<TimingTypes> = typeof SchemaTimingTypes,
	TSchemaDeltaTimingType extends z.ZodType<FixedTiming> = typeof SchemaFixedTiming,
	TSchemaStartTransactionType extends z.ZodType<StartTransaction> = typeof SchemaStartTransaction,
	TSchemaAssumedTransactionType extends z.ZodType<AssumedTransaction> = typeof SchemaAssumedTransaction,
> = ReturnType<
	typeof GenericSchemaScheduledExecution<
		TSchemaTransactionDataType,
		TSchemaFixedTimingType,
		TSchemaDeltaTimingType,
		TSchemaStartTransactionType,
		TSchemaAssumedTransactionType
	>
>;

export type ScheduledExecution<
	TransactionDataType,
	FixedTimingType extends TimingTypes = TimingTypes,
	DeltaTimingType extends FixedTiming = FixedTiming,
	StartTransactionType extends StartTransaction = StartTransaction,
	AssumedTransactionType extends AssumedTransaction = AssumedTransaction,
> = z.infer<
	SchemaScheduledExecution<
		z.ZodType<TransactionDataType>,
		z.ZodType<FixedTimingType>,
		z.ZodType<DeltaTimingType>,
		z.ZodType<StartTransactionType>,
		z.ZodType<AssumedTransactionType>
	>
>;

// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ChainConfig
// ------------------------------------------------------------------------------------------------
// TODO zod ?
export type ChainConfig = {
	provider: EIP1193ProviderWithoutEvents;
	finality: number;
	worstCaseBlockTime: number;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ChainConfigs
// ------------------------------------------------------------------------------------------------
// TODO zod ?
export type ChainConfigs = {
	[chainId: `0x${string}`]: ChainConfig;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// SchedulerConfig<
// ------------------------------------------------------------------------------------------------
// TODO zod ?
export type SchedulerConfig<TransactionDataType, TransactionInfoType> = {
	executor: Executor<TransactionDataType, TransactionInfoType>;
	chainConfigs: ChainConfigs;
	decrypter?: Decrypter<TransactionDataType>;
	time: Time;
	storage: SchedulerStorage<TransactionDataType>;
	maxExpiry?: number;
	maxNumTransactionsToProcessInOneGo?: number;
};
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
