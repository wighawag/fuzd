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
	derivationParameters: DerivationParameters;
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
export type BaseTransactionData = {
	gas: `0x${string}`;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ExecutionSubmission
// ------------------------------------------------------------------------------------------------
export type ExecutionSubmission<TransactionDataType> = {
	chainId: `0x${string}`;
	derivationParameters: DerivationParameters;
	transaction: TransactionDataType;
	maxFeePerGasAuthorized: `0x${string}`; // 1000 gwei // TODO CONFIGURE per network: max worst worst case
	expiryTime?: number;
	onBehalf?: `0x${string}`;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// Executor
// ------------------------------------------------------------------------------------------------
export type Executor<TransactionDataType> = {
	getRemoteAccount(chainId: `0x${string}`, account: `0x${string}`): Promise<RemoteAccountInfo>;
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

export type DerivationParameters = {
	type: string;
	data: any;
};

export type RemoteAccountInfo = {
	derivationParameters: DerivationParameters;
	address: `0x${string}`;
};
