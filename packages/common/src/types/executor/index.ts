import z from 'zod';
import {SchemaString0x} from '../utils';

export type ExpectedWorstCaseGasPrice =
	| {current: bigint; updateTimestamp: number; previous: undefined}
	| {previous: undefined; current: undefined; updateTimestamp: undefined}
	| {previous: bigint; current: bigint; updateTimestamp: number};

export type TransactionParametersUsed = {
	maxFeePerGas: `0x${string}`;
	maxPriorityFeePerGas: `0x${string}`;
	nonce: `0x${string}`;
	from: `0x${string}`;
};

export type PendingExecutionStored<TransactionDataType> = {
	chainId: `0x${string}`;
	account: `0x${string}`;
	slot: string;
	batchIndex: number;
	onBehalf?: `0x${string}`;
	broadcasterAssignerID: string;
	transaction: TransactionDataType;
	transactionParametersUsed: TransactionParametersUsed;
	initialTime: number;
	broadcastTime?: number;
	nextCheckTime: number;
	hash: `0x${string}`;
	maxFeePerGasAuthorized: `0x${string}`;
	helpedForUpToGasPrice?: `0x${string}`;
	isVoidTransaction: boolean;
	finalized: boolean;
	retries?: number;
	lastError?: string;
	expiryTime?: number;
	expectedWorstCaseGasPrice?: `0x${string}`;
};

export type ExecutionResponse<TransactionDataType> = PendingExecutionStored<TransactionDataType> & {
	slotAlreadyUsed?: boolean;
};

// ------------------------------------------------------------------------------------------------
// BaseTransactionData
// ------------------------------------------------------------------------------------------------
export const SchemaBaseTransactionData = z.object({
	gas: SchemaString0x,
});

export type BaseTransactionData = z.infer<typeof SchemaBaseTransactionData>;
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ExecutionSubmission
// ------------------------------------------------------------------------------------------------

export function GenericSchemaExecutionSubmission<TSchemaTransactionDataType extends z.ZodTypeAny>(
	SchemaTransactionDataType: TSchemaTransactionDataType,
) {
	return z.object({
		chainId: SchemaString0x,
		transaction: SchemaTransactionDataType,
		maxFeePerGasAuthorized: SchemaString0x,
		expiryTime: z.number().optional(),
		onBehalf: SchemaString0x.optional(),
	});
}

export type SchemaExecutionSubmission<TSchemaTransactionDataType extends z.ZodTypeAny> = ReturnType<
	typeof GenericSchemaExecutionSubmission<TSchemaTransactionDataType>
>;

export type ExecutionSubmissionFromZod<TransactionDataType> = z.infer<
	SchemaExecutionSubmission<z.ZodType<TransactionDataType>>
>;

export type ExecutionSubmission<TransactionDataType> = {
	chainId: `0x${string}`;
	transaction: TransactionDataType;
	maxFeePerGasAuthorized: `0x${string}`; // 1000 gwei // TODO CONFIGURE per network: max worst worst case
	expiryTime?: number;
	onBehalf?: `0x${string}`;
};

// function test<TransactionDataType>() {
// 	function next(v: ExecutionSubmission<TransactionDataType>) {}
// 	const transactionToBroadcast: TransactionDataType = {
// 		gas: `0xdsad`,
// 		to: '0xdsad',
// 		type: '0x2',
// 		value: `0xdsad sd}`,
// 	} as TransactionDataType;

// 	next({
// 		chainId: '0xdsadsd' as `0x${string}`,
// 		maxFeePerGasAuthorized: `0x38D7EA4C68000` as `0x${string}`, // 1000 gwei // TODO CONFIGURE per network: max worst worst case
// 		transaction: transactionToBroadcast,
// 	} satisfies ExecutionSubmissionFromZod<TransactionDataType>);
// }

// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// Executor
// ------------------------------------------------------------------------------------------------
export type Executor<TransactionDataType> = {
	broadcastExecution(
		slot: string,
		batchIndex: number,
		account: `0x${string}`,
		execution: ExecutionSubmission<TransactionDataType>,
		options?: {
			expectedWorstCaseGasPrice?: bigint;
		},
	): Promise<ExecutionResponse<TransactionDataType>>;

	getExecutionStatus(executionBatch: {
		chainId: `0x${string}`;
		slot: string;
		account: `0x${string}`;
	}): Promise<'finalized' | 'broadcasted' | undefined>;

	getExpectedWorstCaseGasPrice?(chainId: `0x${string}`): Promise<ExpectedWorstCaseGasPrice>;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// TransactionParams
// ------------------------------------------------------------------------------------------------
export type TransactionParams = {
	chainId: `0x${string}`;
	expectedNonce: number;
	nonce: number;
};
// ------------------------------------------------------------------------------------------------
