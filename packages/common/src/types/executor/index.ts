import * as z from 'zod/v4';
import {Assert, IntegerString, IntegerStringSchema, IsZodExactly, String0x, String0xSchema} from '../utils/index.js';

// ------------------------------------------------------------------------------------------------
// DerivationParameters
// ------------------------------------------------------------------------------------------------
export type DerivationParameters = {
	type: string;
	data: any;
};
export const DerivationParametersSchema = z.object({
	type: z.string(),
	data: z.any(),
});
type ZodMatchDerivationParameters = Assert<IsZodExactly<typeof DerivationParametersSchema, DerivationParameters>>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// UpdateableParameter<T>
// ------------------------------------------------------------------------------------------------
// export type UpdateableParameter<T> = T extends undefined
// 	? never
// 	:
export type UpdateableParameter<T> =
	| {current: T; updateTimestamp: number; previous: undefined}
	| {previous: T; current: T; updateTimestamp: number};

export function UpdateableParameterSchema<TypeT extends z.ZodType>(typeSchema: TypeT) {
	return z.discriminatedUnion('previous', [
		z.object({
			current: typeSchema,
			updateTimestamp: z.number().int().min(0),
			previous: z.undefined(),
		}),
		z.object({
			previous: typeSchema,
			current: typeSchema,
			updateTimestamp: z.number().int().min(0),
		}),
	]);
}
type ZodMatchUpdateableParameter = Assert<
	IsZodExactly<ReturnType<typeof UpdateableParameterSchema>, UpdateableParameter<unknown>>
>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// UpdateableParameters<T>
// ------------------------------------------------------------------------------------------------
export type UpdateableParameters<T extends Record<string, any>> = {
	// [P in keyof T]: T extends undefined ? never : UpdateableParameter<T[P]>;
	[P in keyof T]: UpdateableParameter<T[P]>;
};

// export function UpdateableParametersSchema<TypeT extends z.ZodType<Record<string, unknown>>>(typeSchema: TypeT) {
// 	const shape = typeSchema.shape;
// 	const updatedShape = {} as {
// 		[K in keyof TypeT['shape']]: ReturnType<typeof UpdateableParameterSchema>;
// 	};

// 	for (const [key, propertySchema] of Object.entries(shape)) {
// 		(updatedShape as any)[key] = UpdateableParameterSchema(propertySchema as z.ZodType);
// 	}

// 	return z.object(updatedShape);
// }

// const testSchema = z.object({
// 	hello: z.string()
// });
// const t = UpdateableParametersSchema(testSchema);
// TODO : not sure if this is correct
// type ZodMatchUpdateableParameters = Assert<
// 	IsZodExactly<ReturnType<typeof UpdateableParametersSchema>, UpdateableParameters<Record<string, unknown>>>
// >;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// TransactionParametersUsed
// ------------------------------------------------------------------------------------------------
export type TransactionParametersUsed = {
	maxFeePerGas: String0x;
	maxPriorityFeePerGas: String0x;
	nonce: String0x;
	from: String0x;
};
export const TransactionParametersUsedSchema = z.object({
	maxFeePerGas: String0xSchema,
	maxPriorityFeePerGas: String0xSchema,
	nonce: String0xSchema,
	from: String0xSchema,
});
type ZodMatchTransactionParametersUsed = Assert<
	IsZodExactly<typeof TransactionParametersUsedSchema, TransactionParametersUsed>
>;
// ------------------------------------------------------------------------------------------------

type TransactionDataTypeExample = {
	hello: string;
};
const TransactionDataTypeExampleSchema = z.object({
	hello: z.string(),
});
type ZodMatchTransactionDataTypeExample = Assert<
	IsZodExactly<typeof TransactionDataTypeExampleSchema, TransactionDataTypeExample>
>;
// ------------------------------------------------------------------------------------------------
// PendingExecutionStored<TransactionDataType>
// ------------------------------------------------------------------------------------------------
export type PendingExecutionStored<TransactionDataType> = {
	chainId: IntegerString;
	account: String0x;
	slot: string;
	batchIndex: number;
	onBehalf?: String0x;
	serviceParameters: ExecutionServiceParameters;
	transaction: TransactionDataType;
	transactionParametersUsed: TransactionParametersUsed;
	initialTime: number;
	bestTime?: number;
	broadcastTime?: number;
	nextCheckTime: number;
	hash: String0x;
	maxFeePerGasAuthorized: String0x;
	helpedForUpToGasPrice?: {upToGasPrice: String0x; valueSent: String0x};
	isVoidTransaction: boolean;
	finalized: boolean;
	retries?: number;
	lastError?: string;
	expiryTime?: number;
	debtAssigned: string;
};
export function PendingExecutionStoredSchema<TypeT extends z.ZodType>(typeSchema: TypeT) {
	return z.object({
		chainId: IntegerStringSchema,
		account: String0xSchema,
		slot: z.string(),
		batchIndex: z.number().int().min(0),
		onBehalf: String0xSchema.optional(),
		serviceParameters: ExecutionServiceParametersSchema,
		transaction: typeSchema,
		transactionParametersUsed: TransactionParametersUsedSchema,
		initialTime: z.number().int().min(0),
		bestTime: z.number().int().min(0).optional(),
		broadcastTime: z.number().int().min(0).optional(),
		nextCheckTime: z.number().int().min(0),
		hash: String0xSchema,
		maxFeePerGasAuthorized: String0xSchema,
		helpedForUpToGasPrice: z
			.object({
				upToGasPrice: String0xSchema,
				valueSent: String0xSchema,
			})
			.optional(),
		isVoidTransaction: z.boolean(),
		finalized: z.boolean(),
		retries: z.number().int().min(0).optional(),
		lastError: z.string().optional(),
		expiryTime: z.number().int().min(0).optional(),
		debtAssigned: IntegerStringSchema,
	});
}
type ZodMatchPendingExecutionStored = Assert<
	IsZodExactly<ReturnType<typeof PendingExecutionStoredSchema>, PendingExecutionStored<unknown>>
>;
// ------------------------------------------------------------------------------------------------

// export const t: UpdateableParameters<ExecutionServiceParameters> = {
// 	derivationParameters: {
// 		previous: {data: '', type: 'ethereum'},
// 		current: {data: '', type: 'ethereum'},
// 		updateTimestamp: 1,
// 	},
// 	fees: {current: {fixed: '0', per_1_000_000: 1}, updateTimestamp: 0, previous: undefined},
// };

// ------------------------------------------------------------------------------------------------
// ExecutionResponse<TransactionDataType>
// ------------------------------------------------------------------------------------------------
export type ExecutionResponse<TransactionDataType> = PendingExecutionStored<TransactionDataType> & {
	slotAlreadyUsed?: boolean;
};
export function ExecutionResponseSchema<TypeT extends z.ZodType>(typeSchema: TypeT) {
	return z.intersection(
		z.object({
			slotAlreadyUsed: z.boolean().optional(),
		}),
		PendingExecutionStoredSchema(typeSchema),
	);
}
type ZodMatchExecutionResponse = Assert<
	IsZodExactly<ReturnType<typeof ExecutionResponseSchema>, ExecutionResponse<unknown>>
>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// Fees
// ------------------------------------------------------------------------------------------------
export type Fees = {
	fixed: string;
	per_1_000_000: number;
};
export const FeesSchema = z.object({
	fixed: IntegerStringSchema,
	per_1_000_000: z.number().int().min(0).max(100_000),
});
type ZodMatchFees = Assert<IsZodExactly<typeof FeesSchema, Fees>>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ExecutionServiceParameters
// ------------------------------------------------------------------------------------------------
export type ExecutionServiceParameters = {
	derivationParameters: DerivationParameters;
	expectedWorstCaseGasPrice?: IntegerString;
	fees: Fees;
};
export const ExecutionServiceParametersSchema = z.object({
	derivationParameters: DerivationParametersSchema,
	expectedWorstCaseGasPrice: IntegerStringSchema.optional(),
	fees: FeesSchema,
});
type ZodMatchExecutionServiceParameters = Assert<
	IsZodExactly<typeof ExecutionServiceParametersSchema, ExecutionServiceParameters>
>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ExecutionSubmission
// ------------------------------------------------------------------------------------------------
export type ExecutionSubmission<TransactionDataType> = {
	chainId: IntegerString;
	transaction: TransactionDataType;
	maxFeePerGasAuthorized: String0x; // 1000 gwei // TODO CONFIGURE per network: max worst worst case
	criticalDelta?: number;
	// TODO add payment tx
	// cannot be verified as we don' want to track eth changes
	// but this can help client count how much has been unspent
	// All of it without requiring scheduler to care
	// so basicaly user always send payment for each execution
	// unspent could be used for next execution but the client would need to let unspent known
	// remeber we are dealing with scheduled tx so we would need to let the executor know to reserve the umspent
	//  at scheduled tx submission time
	// this kind of complicate things., hmmm
	// alternatively, the unspent can simply be withdrawn at any time
	// payment?: {
	// 	value: string;
	// 	tx: String0x;
	// }[];
};
export function ExecutionSubmissionSchema<TypeT extends z.ZodType>(typeSchema: TypeT) {
	return z.object({
		chainId: IntegerStringSchema,
		transaction: typeSchema,
		maxFeePerGasAuthorized: String0xSchema,
		criticalDelta: z.number().int().min(0).optional(),
	});
}
type ZodMatchExecutionSubmission = Assert<
	IsZodExactly<ReturnType<typeof ExecutionSubmissionSchema>, ExecutionSubmission<unknown>>
>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ExecutionBroadcast<T>
// ------------------------------------------------------------------------------------------------
export type ExecutionBroadcast<T> = ExecutionSubmission<T> & {
	serviceParameters: ExecutionServiceParameters;
	slot: string;
	onBehalf?: String0x;
	expiryTime?: number;
};
export function ExecutionBroadcastSchema<TypeT extends z.ZodType>(typeSchema: TypeT) {
	return z.intersection(
		z.object({
			serviceParameters: ExecutionServiceParametersSchema,
			slot: z.string(),
			onBehalf: String0xSchema.optional(),
			expiryTime: z.number().int().min(0).optional(),
		}),
		ExecutionSubmissionSchema(typeSchema),
	);
}
type ZodMatchExecutionBroadcast = Assert<
	IsZodExactly<ReturnType<typeof ExecutionBroadcastSchema>, ExecutionBroadcast<unknown>>
>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// Executor
// ------------------------------------------------------------------------------------------------
export type Executor<TransactionDataType> = {
	getRemoteAccount(chainId: IntegerString, account: String0x): Promise<RemoteAccountInfo>;
	broadcastExecution(
		slot: string,
		batchIndex: number,
		account: String0x,
		execution: ExecutionSubmission<TransactionDataType>,
		serviceParameters: ExecutionServiceParameters,
		options?: {
			trusted?: boolean;
			asPaymentFor?: {
				chainId: IntegerString;
				account: String0x;
				slot: string;
				batchIndex: number;
				helpedForUpToGasPrice: {upToGasPrice: bigint; valueSent: bigint};
			};
			onBehalf?: String0x;
			expiryTime?: number;
			initialTime?: number;
		},
	): Promise<ExecutionResponse<TransactionDataType>>;

	getExecutionStatus(executionBatch: {
		chainId: IntegerString;
		slot: string;
		account: String0x;
	}): Promise<'finalized' | 'broadcasted' | undefined>;

	getServiceParameters(chainId: IntegerString): Promise<UpdateableParameters<ExecutionServiceParameters>>;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// TransactionParams
// ------------------------------------------------------------------------------------------------
export type TransactionParams = {
	chainId: IntegerString;
	expectedNonce: number;
	nonce: number;
};
export const TransactionParamsSchema = z.object({
	chainId: IntegerStringSchema,
	expectedNonce: z.number().int().min(0),
	nonce: z.number().int().min(0),
});

type ZodMatchTransactionParams = Assert<IsZodExactly<typeof TransactionParamsSchema, TransactionParams>>;

// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// RemoteAccountInfo
// ------------------------------------------------------------------------------------------------
export type RemoteAccountInfo = {
	serviceParameters: ExecutionServiceParameters;
	address: String0x;
	debt: IntegerString;
};
export const RemoteAccountInfoSchema = z.object({
	serviceParameters: ExecutionServiceParametersSchema,
	address: String0xSchema,
	debt: IntegerStringSchema,
});
type ZodMatchRemoteAccountInfo = Assert<IsZodExactly<typeof RemoteAccountInfoSchema, RemoteAccountInfo>>;
// ------------------------------------------------------------------------------------------------
