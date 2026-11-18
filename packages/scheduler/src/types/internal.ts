import {ExecutionSubmission, Executor, ProcessingBudget} from '@fuzd/common';
import {Decrypter} from './external.js';
import {SchedulerStorage} from './scheduler-storage.js';
import {ChainProtocol, ChainProtocols, TransactionDataTypes} from '@fuzd/chain-protocol';

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
	/** how many broadcast executions checkScheduledExecutionStatus looks at per chain per run (10 by default), in batches of `processing.batchSize` */
	maxNumTransactionsToProcessInOneGo?: number;
	/** how much one processQueue run may do, see ProcessingBudget for the defaults */
	processing?: Partial<ProcessingBudget>;
};
// ------------------------------------------------------------------------------------------------
