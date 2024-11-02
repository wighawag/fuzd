import {String0x} from '../utils/index.js';

export type ExpectedWorstCaseGasPrice =
	| {current: bigint; updateTimestamp: number; previous: undefined}
	| {previous: undefined; current: undefined; updateTimestamp: undefined}
	| {previous: bigint; current: bigint; updateTimestamp: number};

export type TransactionParametersUsed = {
	maxFeePerGas: String0x;
	maxPriorityFeePerGas: String0x;
	nonce: String0x;
	from: String0x;
};

export type PendingExecutionStored<TransactionDataType> = {
	chainId: String0x;
	account: String0x;
	slot: string;
	batchIndex: number;
	onBehalf?: String0x;
	derivationParameters: DerivationParameters;
	transaction: TransactionDataType;
	transactionParametersUsed: TransactionParametersUsed;
	initialTime: number;
	broadcastTime?: number;
	nextCheckTime: number;
	hash: String0x;
	maxFeePerGasAuthorized: String0x;
	helpedForUpToGasPrice?: String0x;
	isVoidTransaction: boolean;
	finalized: boolean;
	retries?: number;
	lastError?: string;
	expiryTime?: number;
	expectedWorstCaseGasPrice?: String0x;
};

export type ExecutionResponse<TransactionDataType> = PendingExecutionStored<TransactionDataType> & {
	slotAlreadyUsed?: boolean;
};

// ------------------------------------------------------------------------------------------------
// ExecutionSubmission
// ------------------------------------------------------------------------------------------------
export type ExecutionSubmission<TransactionDataType> = {
	chainId: String0x;
	derivationParameters: DerivationParameters;
	transaction: TransactionDataType;
	maxFeePerGasAuthorized: String0x; // 1000 gwei // TODO CONFIGURE per network: max worst worst case
	expiryTime?: number;
	onBehalf?: String0x;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// Executor
// ------------------------------------------------------------------------------------------------
export type Executor<TransactionDataType> = {
	getRemoteAccount(chainId: String0x, account: String0x): Promise<RemoteAccountInfo>;
	broadcastExecution(
		slot: string,
		batchIndex: number,
		account: String0x,
		execution: ExecutionSubmission<TransactionDataType>,
		options?: {
			expectedWorstCaseGasPrice?: bigint;
		},
	): Promise<ExecutionResponse<TransactionDataType>>;

	getExecutionStatus(executionBatch: {
		chainId: String0x;
		slot: string;
		account: String0x;
	}): Promise<'finalized' | 'broadcasted' | undefined>;

	getExpectedWorstCaseGasPrice?(chainId: String0x): Promise<ExpectedWorstCaseGasPrice>;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// TransactionParams
// ------------------------------------------------------------------------------------------------
export type TransactionParams = {
	chainId: String0x;
	expectedNonce: number;
	nonce: number;
};
// ------------------------------------------------------------------------------------------------

export type DerivationParameters = {
	type: string;
	data: any;
};

export type RemoteAccountInfo = {
	derivationParameters: DerivationParameters;
	address: String0x;
};
