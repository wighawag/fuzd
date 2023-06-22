import {EIP1193Account, EIP1193DATA, EIP1193ProviderWithoutEvents} from 'eip-1193';
// import {AbiEvent} from 'abitype';
import {ExecutionQueued, SchedulerStorage} from './scheduler-storage';
import {Executor, Time} from './common';

export type StartTransaction = {
	// the execution should only happen if that tx is included in a block
	// which can serve as a startTime
	hash: `0x${string}`;
	nonce: number;
	broadcastTime: number;
	// TODO
	// expectEvent?: {
	// 	eventABI: AbiEvent;
	// 	startTimeParam?: string;
	// };
};

export type DeltaScheduledExecution<
	TimeValueType extends FixedTiming = FixedTiming,
	TransactionType extends StartTransaction = StartTransaction
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
	TransactionType extends AssumedTransaction = AssumedTransaction
> = {
	type: 'fixed';
	expiry?: number;
	assumedTransaction?: TransactionType;
	value: TimeValueType;
};

export type DecryptionResult<TransactionDataType> =
	| {success: true; transaction: TransactionDataType}
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
	timeContract?: EIP1193Account;
};

export type TimingTypes = FixedTiming | PartiallyHiddenTimeValue;

export type ScheduledTimeLockedExecution<
	FixedTimingType extends TimingTypes,
	AssumedTransactionType extends AssumedTransaction = AssumedTransaction
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
	AssumedTransactionType extends AssumedTransaction = AssumedTransaction
> = BaseExecution & {
	type: 'clear';
	transaction: TransactionDataType;
	timing:
		| FixedTimeScheduledExecution<FixedTimingType, AssumedTransactionType>
		| DeltaScheduledExecution<DeltaTimingType, StartTransactionType>;
};

export type ScheduledExecution<
	TransactionDataType,
	FixedTimingType extends TimingTypes = TimingTypes,
	DeltaTimingType extends FixedTiming = FixedTiming,
	StartTransactionType extends StartTransaction = StartTransaction,
	AssumedTransactionType extends AssumedTransaction = AssumedTransaction
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
};

export type Scheduler<TransactionDataType> = {
	submitExecution(
		id: string,
		account: EIP1193Account,
		execution: ScheduledExecution<TransactionDataType>
	): Promise<ScheduleInfo>;
};

export type ExecutionStatus = {type: 'broadcasted' | 'deleted' | 'reassigned' | 'skipped'; reason: string};

export type QueueProcessingResult = {
	timestamp: number;
	limit: number;
	executions: {id: string; checkinTime: number; status: ExecutionStatus}[];
};

export type WithTimeContract = {chainId: EIP1193DATA; timeContract: EIP1193Account};

export type SchedulerBackend = {
	processQueue(onlyWithTimeContract?: WithTimeContract): Promise<QueueProcessingResult>;
};
