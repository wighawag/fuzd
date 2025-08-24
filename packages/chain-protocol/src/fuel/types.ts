import * as z from 'zod/v4';
import type {JsonAbi} from '@fuel-ts/abi-coder';

type BigNumberish = string; // TODO ?
type BytesLike = string; // TODO ?

enum InputType {
	Coin = 0,
	Contract = 1,
	Message = 2,
}

type CoinTransactionRequestInput = {
	type: InputType.Coin;

	/** UTXO ID */
	id: BytesLike;

	/** Owning address or script hash */
	owner: BytesLike;

	/** Amount of coins */
	amount: BigNumberish;

	/** Asset ID of the coins */
	assetId: BytesLike;

	/** Points to the TX whose output is being spent. (TxPointer) */
	txPointer: BytesLike;

	/** Index of witness that authorizes spending the coin */
	witnessIndex: number;

	/** Gas used by predicate */
	predicateGasUsed?: BigNumberish;

	/** Predicate bytecode */
	predicate?: BytesLike;

	/** Predicate input data (parameters) */
	predicateData?: BytesLike;
};

type MessageTransactionRequestInput = {
	type: InputType.Message;

	/** Address of sender */
	sender: BytesLike;

	/** Address of recipient */
	recipient: BytesLike;

	/** Amount of coins */
	amount: BigNumberish;

	/** Index of witness that authorizes the message */
	witnessIndex: number;

	/** Unique nonce of message */
	nonce: BytesLike;

	/** Gas used by predicate */
	predicateGasUsed?: BigNumberish;

	/** Predicate bytecode */
	predicate?: BytesLike;

	/** Predicate input data (parameters) */
	predicateData?: BytesLike;

	/** data of message */
	data?: BytesLike;
};

type ContractTransactionRequestInput = {
	type: InputType.Contract;

	/** ID of the last transaction that modified the contract state (It can be zeroed if unsure) */
	txID?: BytesLike;

	/** Points to the TX whose output is being spent. (TxPointer) */
	txPointer: BytesLike;

	/** Contract ID */
	contractId: BytesLike;
};
type TransactionRequestInput =
	| CoinTransactionRequestInput
	| ContractTransactionRequestInput
	| MessageTransactionRequestInput;

enum OutputType /* u8 */ {
	Coin = 0,
	Contract = 1,
	Change = 2,
	Variable = 3,
	ContractCreated = 4,
}
type CoinTransactionRequestOutput = {
	type: OutputType.Coin;
	/** Receiving address or script hash */
	to: BytesLike;
	/** Amount of coins to send */
	amount: BigNumberish;
	/** Asset ID of coins */
	assetId: BytesLike;
};
type ContractTransactionRequestOutput = {
	type: OutputType.Contract;
	/** Index of input contract */
	inputIndex: number;
};
type ChangeTransactionRequestOutput = {
	type: OutputType.Change;
	/** Receiving address or script hash */
	to: BytesLike;
	/** Asset ID of coins */
	assetId: BytesLike;
};
type VariableTransactionRequestOutput = {
	type: OutputType.Variable;
	/** Receiving address or script hash */
	to?: BytesLike;
	/** Amount of coins to send */
	amount?: BigNumberish;
	/** Asset ID of coins */
	assetId?: BytesLike;
};
type ContractCreatedTransactionRequestOutput = {
	type: OutputType.ContractCreated;
	/** Contract ID */
	contractId: BytesLike;
	/** State Root */
	stateRoot: BytesLike;
};
type TransactionRequestOutput =
	| CoinTransactionRequestOutput
	| ContractTransactionRequestOutput
	| ChangeTransactionRequestOutput
	| VariableTransactionRequestOutput
	| ContractCreatedTransactionRequestOutput;

type TransactionRequestWitness = BytesLike;

enum GqlReceiptType {
	Burn = 'BURN',
	Call = 'CALL',
	Log = 'LOG',
	LogData = 'LOG_DATA',
	MessageOut = 'MESSAGE_OUT',
	Mint = 'MINT',
	Panic = 'PANIC',
	Return = 'RETURN',
	ReturnData = 'RETURN_DATA',
	Revert = 'REVERT',
	ScriptResult = 'SCRIPT_RESULT',
	Transfer = 'TRANSFER',
	TransferOut = 'TRANSFER_OUT',
}
type TransactionReceiptJson = {
	id?: string | null;
	pc?: string | null;
	is?: string | null;
	to?: string | null;
	toAddress?: string | null;
	amount?: string | null;
	assetId?: string | null;
	gas?: string | null;
	param1?: string | null;
	param2?: string | null;
	val?: string | null;
	ptr?: string | null;
	digest?: string | null;
	reason?: string | null;
	ra?: string | null;
	rb?: string | null;
	rc?: string | null;
	rd?: string | null;
	len?: string | null;
	receiptType: GqlReceiptType;
	result?: string | null;
	gasUsed?: string | null;
	data?: string | null;
	sender?: string | null;
	recipient?: string | null;
	nonce?: string | null;
	contractId?: string | null;
	subId?: string | null;
};

interface TransactionSummaryJson {
	id: string;
	transactionBytes: string;
	receipts: TransactionReceiptJson[];
	gasPrice: string;
}

type TransactionSummaryJsonPartial = Omit<TransactionSummaryJson, 'id' | 'transactionBytes'>;

type TransactionStateFlag =
	| {state: undefined; transactionId: undefined; summary: undefined}
	| {
			state: 'funded';
			transactionId: string;
			summary: TransactionSummaryJsonPartial | undefined;
	  };
// ------------------------------------------------------------------------------------------------
// TransactionData
// ------------------------------------------------------------------------------------------------
type FuelBaseTransactionData = {
	/** Gas price for transaction */
	tip?: BigNumberish;
	/** Block until which tx cannot be included */
	maturity?: number;
	/** The block number after which the transaction is no longer valid. */
	expiration?: number;
	/** The maximum fee payable by this transaction using BASE_ASSET. */
	maxFee?: BigNumberish;
	/** The maximum amount of witness data allowed for the transaction */
	witnessLimit?: BigNumberish;
	/** List of inputs */
	inputs?: TransactionRequestInput[];
	/** List of outputs */
	outputs?: TransactionRequestOutput[];
	/** List of witnesses */
	witnesses?: TransactionRequestWitness[];
	/** The state of the transaction */
	flag?: TransactionStateFlag;
};

type JsonAbisFromAllCalls = {
	main: JsonAbi;
	otherContractsAbis: Record<string, JsonAbi>;
};

export type FuelTransactionData = FuelBaseTransactionData & {
	/** Gas limit for transaction */
	gasLimit?: BigNumberish;
	/** Script to execute */
	script?: BytesLike;
	/** Script input data (parameters) */
	scriptData?: BytesLike;

	abis?: JsonAbisFromAllCalls;
};

// export const EthereumTransactionDataSchema2 = z.object<ZodObjectShape<EthereumTransactionData>>({
// 	type: z.literal('0x2'),
// 	to: String0xSchema.optional(),
// 	gas: String0xSchema,
// 	data: String0xSchema.optional(),
// 	value: String0xSchema.optional(),
// 	accessList: z
// 		.array(
// 			z.object({
// 				address: String0xSchema,
// 				storageKeys: z.array(String0xSchema).min(1),
// 			}) as unknown as z.ZodObject<
// 				ZodObjectShape<{
// 					address: String0x;
// 					storageKeys: [String0x, ...String0x[]];
// 				}>
// 			>,
// 		)
// 		.optional(),
// });

export const FuelTransactionDataSchema = z.object({
	// TODO
}) satisfies z.ZodType<FuelTransactionData>;
// ------------------------------------------------------------------------------------------------
