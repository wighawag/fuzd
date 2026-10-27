import {z} from 'zod';
import type {
	DerivationParameters,
	ExecutionBroadcast,
	ExecutionResponse,
	ExecutionServiceParameters,
	ExecutionSubmission,
	Fees,
	PendingExecutionStored,
	RemoteAccountInfo,
	TransactionParametersUsed,
} from 'fuzd-common';
import type {
	PriorTransactionInfo,
	ScheduledExecution,
	ScheduledExecutionQueued,
	ScheduleInfo,
	TimingTypes,
	TimingTypesCompatibleWithTimeLock,
} from 'fuzd-scheduler';
import type {EthereumTransactionData} from 'fuzd-chain-protocol/ethereum';
import type {DeployAccountTransactionData, InvokeTransactionData} from 'fuzd-chain-protocol/starknet';
import type {MyTransactionData} from '../setup.js';
import type {ErrorType} from '../utils/response.js';
import {IntegerStringSchema, IndexParamSchema, Plain, schemaFor, String0xSchema} from './primitives.js';

export * from './primitives.js';

// ------------------------------------------------------------------------------------------------
// Transaction data (fuzd-chain-protocol)
// ------------------------------------------------------------------------------------------------
const ethereumTransactionDataShape = {
	type: z.literal('0x2'),
	to: String0xSchema.optional(),
	gas: String0xSchema,
	data: String0xSchema.optional(),
	value: String0xSchema.optional(),
	accessList: z
		.array(
			z.object({
				address: String0xSchema,
				storageKeys: z.tuple([String0xSchema], String0xSchema),
			}),
		)
		.optional(),
};
export const EthereumTransactionDataSchema = schemaFor<Plain<EthereumTransactionData>>()(
	z.object(ethereumTransactionDataShape),
);

const invokeTransactionDataShape = {
	type: z.literal('INVOKE'),
	calldata: z.array(String0xSchema),
	max_fee: String0xSchema,
	version: z.literal('0x1'),
};
export const InvokeTransactionDataSchema = schemaFor<Plain<InvokeTransactionData>>()(
	z.object(invokeTransactionDataShape),
);

const deployAccountTransactionDataShape = {
	type: z.literal('DEPLOY_ACCOUNT'),
	max_fee: String0xSchema,
	version: z.literal('0x1'),
	contract_address_salt: String0xSchema,
	constructor_calldata: z.array(String0xSchema),
	class_hash: String0xSchema,
};
export const DeployAccountTransactionDataSchema = schemaFor<Plain<DeployAccountTransactionData>>()(
	z.object(deployAccountTransactionDataShape),
);

export const MyTransactionDataSchema = schemaFor<Plain<MyTransactionData>>()(
	z.discriminatedUnion('type', [
		z.object(ethereumTransactionDataShape),
		z.object(invokeTransactionDataShape),
		z.object(deployAccountTransactionDataShape),
	]),
);

// ------------------------------------------------------------------------------------------------
// fuzd-common
// ------------------------------------------------------------------------------------------------
export const DerivationParametersSchema = schemaFor<DerivationParameters>()(
	z.object({
		type: z.string(),
		data: z.any(),
	}),
);

export const FeesSchema = schemaFor<Fees>()(
	z.object({
		fixed: z.string(),
		per_1_000_000: z.number(),
	}),
);

export const ExecutionServiceParametersSchema = schemaFor<Plain<ExecutionServiceParameters>>()(
	z.object({
		derivationParameters: DerivationParametersSchema,
		expectedWorstCaseGasPrice: z.string().optional(),
		fees: FeesSchema,
	}),
);

const executionSubmissionShape = {
	chainId: IntegerStringSchema,
	transaction: MyTransactionDataSchema,
	maxFeePerGasAuthorized: String0xSchema,
	criticalDelta: z.number().optional(),
};
export const ExecutionSubmissionSchema = schemaFor<Plain<ExecutionSubmission<MyTransactionData>>>()(
	z.object(executionSubmissionShape),
);

export const ExecutionBroadcastSchema = schemaFor<Plain<ExecutionBroadcast<MyTransactionData>>>()(
	z.object({
		...executionSubmissionShape,
		serviceParameters: ExecutionServiceParametersSchema,
		slot: z.string(),
		onBehalf: String0xSchema.optional(),
		expiryTime: z.number().optional(),
	}),
);

export const TransactionParametersUsedSchema = schemaFor<TransactionParametersUsed>()(
	z.object({
		maxFeePerGas: String0xSchema,
		maxPriorityFeePerGas: String0xSchema,
		nonce: String0xSchema,
		from: String0xSchema,
	}),
);

const pendingExecutionStoredShape = {
	chainId: IntegerStringSchema,
	account: String0xSchema,
	slot: z.string(),
	batchIndex: z.number(),
	onBehalf: String0xSchema.optional(),
	serviceParameters: ExecutionServiceParametersSchema,
	transaction: MyTransactionDataSchema,
	transactionParametersUsed: TransactionParametersUsedSchema,
	initialTime: z.number(),
	bestTime: z.number().optional(),
	broadcastTime: z.number().optional(),
	nextCheckTime: z.number(),
	hash: String0xSchema,
	maxFeePerGasAuthorized: String0xSchema,
	helpedForUpToGasPrice: z.object({upToGasPrice: String0xSchema, valueSent: String0xSchema}).optional(),
	isVoidTransaction: z.boolean(),
	finalized: z.boolean(),
	retries: z.number().optional(),
	lastError: z.string().optional(),
	expiryTime: z.number().optional(),
	debtAssigned: z.string(),
};
export const PendingExecutionStoredSchema = schemaFor<Plain<PendingExecutionStored<MyTransactionData>>>()(
	z.object(pendingExecutionStoredShape),
);

export const ExecutionResponseSchema = schemaFor<Plain<ExecutionResponse<MyTransactionData>>>()(
	z.object({...pendingExecutionStoredShape, slotAlreadyUsed: z.boolean().optional()}),
);

export const RemoteAccountInfoSchema = schemaFor<Plain<RemoteAccountInfo>>()(
	z.object({
		serviceParameters: ExecutionServiceParametersSchema,
		address: String0xSchema,
		debt: z.string(),
	}),
);

// ------------------------------------------------------------------------------------------------
// fuzd-scheduler
// ------------------------------------------------------------------------------------------------
export const PriorTransactionInfoSchema = schemaFor<PriorTransactionInfo>()(
	z.object({
		from: String0xSchema,
		hash: String0xSchema,
		nonce: String0xSchema,
		broadcastTime: z.number(),
	}),
);

const fixedRoundSchema = z.object({
	type: z.literal('fixed-round'),
	expiryDelta: z.number().optional(),
	assumedTransaction: PriorTransactionInfoSchema.optional(),
	scheduledRound: z.number(),
	expectedTime: z.number(),
});
const fixedTimeSchema = z.object({
	type: z.literal('fixed-time'),
	expiryDelta: z.number().optional(),
	assumedTransaction: PriorTransactionInfoSchema.optional(),
	scheduledTime: z.number(),
});
const deltaTimeWithTargetTimeSchema = z.object({
	type: z.literal('delta-time-with-target-time'),
	expiryDelta: z.number().optional(),
	startTransaction: PriorTransactionInfoSchema,
	delta: z.number(),
	targetTimeUnlessHigherDelta: z.number(),
});
const deltaTimeSchema = z.object({
	type: z.literal('delta-time'),
	expiryDelta: z.number().optional(),
	startTransaction: PriorTransactionInfoSchema,
	delta: z.number(),
});

export const TimingTypesCompatibleWithTimeLockSchema = schemaFor<Plain<TimingTypesCompatibleWithTimeLock>>()(
	z.discriminatedUnion('type', [fixedRoundSchema, fixedTimeSchema, deltaTimeWithTargetTimeSchema]),
);
export const TimingTypesSchema = schemaFor<Plain<TimingTypes>>()(
	z.discriminatedUnion('type', [fixedRoundSchema, fixedTimeSchema, deltaTimeWithTargetTimeSchema, deltaTimeSchema]),
);

const baseScheduledExecutionShape = {
	chainId: IntegerStringSchema,
	slot: z.string(),
	onBehalf: String0xSchema.optional(),
	paymentReserve: z.object({amount: z.string(), broadcaster: String0xSchema}).optional(),
	executionServiceParameters: ExecutionServiceParametersSchema,
};
const scheduledTimeLockedExecutionShape = {
	...baseScheduledExecutionShape,
	type: z.literal('time-locked'),
	payload: z.string(),
	timing: TimingTypesCompatibleWithTimeLockSchema,
};
const scheduledExecutionInClearShape = {
	...baseScheduledExecutionShape,
	type: z.literal('clear'),
	executions: z.array(ExecutionSubmissionSchema),
	timing: TimingTypesSchema,
};

export const ScheduledExecutionSchema = schemaFor<Plain<ScheduledExecution<ExecutionSubmission<MyTransactionData>>>>()(
	z.discriminatedUnion('type', [z.object(scheduledTimeLockedExecutionShape), z.object(scheduledExecutionInClearShape)]),
);

const queuedShape = {
	account: String0xSchema,
	broadcasted: z.boolean(),
	finalized: z.boolean(),
	checkinTime: z.number(),
	retries: z.number(),
	priorTransactionConfirmation: z.object({blockTime: z.number(), startTime: z.number().optional()}).optional(),
	lastError: z.string().optional(),
};
export const ScheduledExecutionQueuedSchema = schemaFor<Plain<ScheduledExecutionQueued<MyTransactionData>>>()(
	z.discriminatedUnion('type', [
		z.object({...scheduledTimeLockedExecutionShape, ...queuedShape}),
		z.object({...scheduledExecutionInClearShape, ...queuedShape}),
	]),
);

export const ScheduleInfoSchema = schemaFor<ScheduleInfo>()(
	z.object({
		checkinTime: z.number(),
		chainId: IntegerStringSchema,
		account: String0xSchema,
		slot: z.string(),
	}),
);

// ------------------------------------------------------------------------------------------------
// Path parameters: string on the wire, typed (and normalised) in the handler
// ------------------------------------------------------------------------------------------------
export const ChainIdParamSchema = schemaFor<{chainId: string}>()(z.object({chainId: IntegerStringSchema}));
export const OptionalChainIdParamSchema = schemaFor<{chainId?: string | undefined}>()(
	z.object({chainId: IntegerStringSchema.optional()}),
);
export const AccountParamSchema = schemaFor<{account: `0x${string}`}>()(z.object({account: String0xSchema}));
export const ChainIdAccountParamSchema = schemaFor<{chainId: string; account: `0x${string}`}>()(
	z.object({chainId: IntegerStringSchema, account: String0xSchema}),
);
export const ChainIdAccountSlotParamSchema = schemaFor<{chainId: string; account: `0x${string}`; slot: string}>()(
	z.object({chainId: IntegerStringSchema, account: String0xSchema, slot: z.string()}),
);
export const ChainIdBroadcasterParamSchema = schemaFor<{chainId: string; broadcaster: `0x${string}`}>()(
	z.object({chainId: IntegerStringSchema, broadcaster: String0xSchema}),
);
export const ChainIdBroadcasterSlotParamSchema = schemaFor<{
	chainId: string;
	broadcaster: `0x${string}`;
	slot: string;
}>()(z.object({chainId: IntegerStringSchema, broadcaster: String0xSchema, slot: z.string()}));
export const ExecutionParamSchema = schemaFor<
	{chainId: string; account: `0x${string}`; slot: string; batchIndex: string},
	{chainId: string; account: `0x${string}`; slot: string; batchIndex: number}
>()(z.object({chainId: IntegerStringSchema, account: String0xSchema, slot: z.string(), batchIndex: IndexParamSchema}));

// ------------------------------------------------------------------------------------------------
// Responses (documentation only: handlers are typed by the canonical types, these describe them)
// ------------------------------------------------------------------------------------------------
export const ErrorResponseSchema = schemaFor<ErrorType>()(
	z.object({
		success: z.literal(false),
		errors: z.array(
			z.object({
				name: z.string().optional(),
				message: z.string(),
				code: z.number().optional(),
				status: z.number().optional(),
			}),
		),
	}),
);

export function successResponse<Shape extends z.ZodRawShape>(shape: Shape) {
	return z.object({success: z.literal(true), ...shape});
}
