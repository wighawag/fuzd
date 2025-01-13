import {IntegerString, String0x} from '../utils/index.js';

// export type UpdateableParameter<T> = T extends undefined
// 	? never
// 	:
export type UpdateableParameter<T> =
	| {current: T; updateTimestamp: number; previous: undefined}
	| {previous: T; current: T; updateTimestamp: number};

export type UpdateableParameters<T extends Record<string, any>> = {
	// [P in keyof T]: T extends undefined ? never : UpdateableParameter<T[P]>;
	[P in keyof T]: UpdateableParameter<T[P]>;
};

export type TransactionParametersUsed = {
	maxFeePerGas: String0x;
	maxPriorityFeePerGas: String0x;
	nonce: String0x;
	from: String0x;
};

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
};

// export const t: UpdateableParameters<ExecutionServiceParameters> = {
// 	derivationParameters: {
// 		previous: {data: '', type: 'ethereum'},
// 		current: {data: '', type: 'ethereum'},
// 		updateTimestamp: 1,
// 	},
// 	fees: {current: {fixed: '0', per_1_000_000: 1}, updateTimestamp: 0, previous: undefined},
// };

export type ExecutionResponse<TransactionDataType> = PendingExecutionStored<TransactionDataType> & {
	slotAlreadyUsed?: boolean;
};

export type Fees = {
	fixed: string;
	per_1_000_000: number;
};

export type ExecutionServiceParameters = {
	derivationParameters: DerivationParameters;
	expectedWorstCaseGasPrice?: string;
	fees: Fees;
};

// ------------------------------------------------------------------------------------------------
// ExecutionSubmission
// ------------------------------------------------------------------------------------------------
export type ExecutionSubmission<TransactionDataType> = {
	chainId: IntegerString;
	transaction: TransactionDataType;
	maxFeePerGasAuthorized: String0x; // 1000 gwei // TODO CONFIGURE per network: max worst worst case
	expiryTime?: number;
	onBehalf?: String0x;
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
// ------------------------------------------------------------------------------------------------

export type ExecutionBroadcast<T> = ExecutionSubmission<T> & {
	serviceParameters: ExecutionServiceParameters;
	slot: string;
};

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
				upToGasPrice: bigint;
			};
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
// ------------------------------------------------------------------------------------------------

export type DerivationParameters = {
	type: string;
	data: any;
};

export type RemoteAccountInfo = {
	serviceParameters: ExecutionServiceParameters;
	address: String0x;
	debt: string;
};
