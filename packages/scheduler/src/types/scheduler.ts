import {EIP1193Account, EIP1193DATA, EIP1193ProviderWithoutEvents} from 'eip-1193';
// import {AbiEvent} from 'abitype';
import {ExecutionQueued, SchedulerStorage} from './scheduler-storage';
import {Executor} from './common';
import {Time, SchemaString0x} from 'fuzd-common';
import z from 'zod';

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

export type DeltaScheduledExecution<
	TimeValueType extends FixedTiming = FixedTiming,
	TransactionType extends StartTransaction = StartTransaction,
> = {
	type: 'delta';
	expiry?: number;
	startTransaction: TransactionType;
	delta: TimeValueType;
};

export type AssumedTransaction = {
	// the execution should only happen if that tx is included in a block
	hash: `0x${string}`;
	nonce: number;
	// TODO
	// expectEvent?: {
	// 	eventABI: AbiEvent;
	// };
};

export type FixedTimeScheduledExecution<
	TimeValueType extends FixedTiming | PartiallyHiddenTimeValue = FixedTiming,
	TransactionType extends AssumedTransaction = AssumedTransaction,
> = {
	type: 'fixed';
	expiry?: number;
	assumedTransaction?: TransactionType;
	value: TimeValueType;
};

export type DecryptionResult<TransactionDataType> =
	| {success: true; transactions: TransactionDataType[]}
	| {
			success: false;
			newPayload?: string;
			newTimimg?: RoundBasedTiming;
			retry?: number;
	  };

export type Decrypter<TransactionDataType> = {
	decrypt(execution: ExecutionQueued<TransactionDataType>): Promise<DecryptionResult<TransactionDataType>>;
};

export type PartiallyHiddenTimeValue =
	| {
			type: 'time-period';
			startTime: number;
			periodInSeconds: number;
	  }
	| {
			type: 'round-period';
			startTime: number;
			periodInRounds: number;
			averageSecondsPerRound: number;
	  };

export type RoundBasedTiming = {
	type: 'round';
	round: number;
	expectedTime: number;
};

export type TimeBasedTiming = {
	type: 'time';
	time: number;
};

export type FixedTiming = TimeBasedTiming | RoundBasedTiming;

type BaseExecution = {
	chainId: `0x${string}`;
	slot: string;
};

export type TimingTypes = FixedTiming | PartiallyHiddenTimeValue;

export type ScheduledTimeLockedExecution<
	FixedTimingType extends TimingTypes,
	AssumedTransactionType extends AssumedTransaction = AssumedTransaction,
> = BaseExecution & {
	type: 'time-locked';
	payload: string;
	timing: FixedTimeScheduledExecution<FixedTimingType, AssumedTransactionType>;
	// TODO algo:
};

export type ScheduledExecutionInClear<
	TransactionDataType,
	FixedTimingType extends TimingTypes,
	DeltaTimingType extends FixedTiming,
	StartTransactionType extends StartTransaction = StartTransaction,
	AssumedTransactionType extends AssumedTransaction = AssumedTransaction,
> = BaseExecution & {
	type: 'clear';
	transactions: TransactionDataType[];
	timing:
		| FixedTimeScheduledExecution<FixedTimingType, AssumedTransactionType>
		| DeltaScheduledExecution<DeltaTimingType, StartTransactionType>;
};

export type ScheduledExecution<
	TransactionDataType,
	FixedTimingType extends TimingTypes = TimingTypes,
	DeltaTimingType extends FixedTiming = FixedTiming,
	StartTransactionType extends StartTransaction = StartTransaction,
	AssumedTransactionType extends AssumedTransaction = AssumedTransaction,
> =
	| ScheduledTimeLockedExecution<FixedTimingType, AssumedTransactionType>
	| ScheduledExecutionInClear<
			TransactionDataType,
			FixedTimingType,
			DeltaTimingType,
			StartTransactionType,
			AssumedTransactionType
	  >;

export type ChainConfig = {
	provider: EIP1193ProviderWithoutEvents;
	finality: number;
	worstCaseBlockTime: number;
};

export type ChainConfigs = {
	[chainId: `0x${string}`]: ChainConfig;
};

export type SchedulerConfig<TransactionDataType, TransactionInfoType> = {
	executor: Executor<TransactionDataType, TransactionInfoType>;
	chainConfigs: ChainConfigs;
	decrypter?: Decrypter<TransactionDataType>;
	time: Time;
	storage: SchedulerStorage<TransactionDataType>;
	maxExpiry?: number;
	maxNumTransactionsToProcessInOneGo?: number;
};

export type ScheduleInfo = {
	checkinTime: number;
	chainId: `0x${string}`;
	account: `0x${string}`;
	slot: string;
};

export type Scheduler<TransactionDataType> = {
	submitExecution(account: EIP1193Account, execution: ScheduledExecution<TransactionDataType>): Promise<ScheduleInfo>;
};

export type ExecutionStatus = {type: 'broadcasted' | 'deleted' | 'reassigned' | 'skipped'; reason: string};

export type QueueProcessingResult = {
	limit: number;
	executions: {chainId: string; account: `0x${string}`; slot: string; checkinTime: number; status: ExecutionStatus}[];
	chainTimetamps: {[chainId: string]: number};
};

export type SchedulerBackend = {
	processQueue(): Promise<QueueProcessingResult>;
};

export type DecryptedPayload<TransactionDataType> =
	| {
			type: 'time-locked';
			payload: string;
			timing: RoundBasedTiming;
	  }
	| {
			type: 'clear';
			transactions: TransactionDataType[];
	  };
