// ------------------------------------------------------------------------------------------------
// ChainConfig
// ------------------------------------------------------------------------------------------------

import {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {Executor, Time} from 'fuzd-common';
import {Decrypter} from './external';
import {SchedulerStorage} from './scheduler-storage';

// TODO zod ?
export type ChainConfig = {
	provider: EIP1193ProviderWithoutEvents;
	finality: number;
	worstCaseBlockTime: number;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// ChainConfigs
// ------------------------------------------------------------------------------------------------
// TODO zod ?
export type ChainConfigs = {
	[chainId: `0x${string}`]: ChainConfig;
};
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// SchedulerConfig<
// ------------------------------------------------------------------------------------------------
// TODO zod ?
export type SchedulerConfig<ExecutionDataType, TransactionInfoType> = {
	executor: Executor<ExecutionDataType, TransactionInfoType>;
	chainConfigs: ChainConfigs;
	decrypter?: Decrypter<ExecutionDataType>;
	time: Time;
	storage: SchedulerStorage<ExecutionDataType>;
	maxExpiry?: number;
	maxNumTransactionsToProcessInOneGo?: number;
};
// ------------------------------------------------------------------------------------------------
