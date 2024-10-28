import {ExecutionSubmission, Executor} from 'fuzd-common';
import {Decrypter} from './external.js';
import {SchedulerStorage} from './scheduler-storage.js';
import {ChainProtocol, ChainProtocols, TransactionDataTypes} from 'fuzd-chain-protocol';

// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// SchedulerConfig<
// ------------------------------------------------------------------------------------------------
export type SchedulerConfig<ChainProtocolTypes extends ChainProtocol<any>> = {
	executor: Executor<TransactionDataTypes<ChainProtocolTypes>>;
	chainProtocols: ChainProtocols<ChainProtocolTypes>;
	decrypter?: Decrypter<ExecutionSubmission<TransactionDataTypes<ChainProtocolTypes>>>;
	storage: SchedulerStorage<TransactionDataTypes<ChainProtocolTypes>>;
	maxExpiry?: number;
	maxNumTransactionsToProcessInOneGo?: number;
};
// ------------------------------------------------------------------------------------------------
