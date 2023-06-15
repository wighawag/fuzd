import {EIP1193Account, EIP1193DATA, EIP1193ProviderWithoutEvents, EIP1193SignerProvider} from 'eip-1193';
import {EIP1193TransactionDataUsed, ExecutorStorage} from './executor-storage';
import {Time} from './common';
import {z} from 'zod';

// ------------------------------------------------------------------------------------------------
// UTILITY TYPES
// ------------------------------------------------------------------------------------------------
const validateHex = (val: unknown) => {
	if (typeof val != 'string') {
		return false;
	}
	return val.startsWith('0x');
};
const hex = z.custom<`0x${string}`>(validateHex);
const EIP1193AccountSchema = z.custom<`0x${string}`>((val) => {
	if (typeof val != 'string') {
		return false;
	}
	return validateHex(val) && val.length == 42;
});
const EIP1193Bytes32Schema = z.custom<`0x${string}`>((val) => {
	if (typeof val != 'string') {
		return false;
	}
	return validateHex(val) && val.length == 66;
});
const EIP1193QuantitySchema = z.custom<`0x${string}`>((val) => {
	if (typeof val != 'string') {
		return false;
	}
	return validateHex(val) && val.length > 2 && val.length <= 66;
});
const EIP1193AccessListEntrySchema = z.object({
	address: EIP1193AccountSchema,
	storageKeys: z.array(EIP1193Bytes32Schema).nonempty(),
});
const EIP1193AccessListSchema = z.array(EIP1193AccessListEntrySchema);
// ------------------------------------------------------------------------------------------------

const FeePerGas = z.object({
	maxFeePerGas: EIP1193QuantitySchema,
	maxPriorityFeePerGas: EIP1193QuantitySchema,
});
export type FeePerGas = z.infer<typeof FeePerGas>;

const FeePerGasPeriod = FeePerGas.extend({
	duration: EIP1193QuantitySchema,
});
export type FeePerGasPeriod = z.infer<typeof FeePerGasPeriod>;

const BroadcastSchedule = z.array(FeePerGasPeriod).nonempty();
export type BroadcastSchedule = z.infer<typeof BroadcastSchedule>;

export const TransactionSubmission = z.object({
	to: EIP1193AccountSchema.optional(),
	gas: EIP1193QuantitySchema,
	data: hex.optional(),
	type: z.literal('0x2'),
	chainId: EIP1193QuantitySchema,
	accessList: EIP1193AccessListSchema.optional(),
	broadcastSchedule: BroadcastSchedule,
});
export type TransactionSubmission = z.infer<typeof TransactionSubmission>;

export type TransactionInfo = {
	hash: EIP1193DATA;
	broadcastTime: number;
	transactionData: EIP1193TransactionDataUsed;
	isVoidTransaction: boolean;
};

export type RawTransactionInfo = {
	rawTx: EIP1193DATA;
	transactionData: EIP1193TransactionDataUsed;
	isVoidTransaction: boolean;
};

export type ExecutorConfig = {
	chainId: string;
	provider: EIP1193ProviderWithoutEvents;
	time: Time;
	storage: ExecutorStorage;
	getSignerProviderFor: (account: EIP1193Account) => Promise<EIP1193SignerProvider>;
	finality: number;
	worstCaseBlockTime: number;
	maxExpiry?: number;
	maxNumTransactionsToProcessInOneGo?: number;
};

export type Executor = {
	submitTransaction(id: string, account: EIP1193Account, submission: TransactionSubmission): Promise<TransactionInfo>;
};

export type ExecutorBackend = {
	processPendingTransactions(): Promise<void>;
};

export type TransactionParamsAndSigner = {
	expectedNonce: number;
	nonce: number;
	broadcasterAddress: EIP1193Account;
	signer: EIP1193SignerProvider;
	gasRequired: bigint;
};
