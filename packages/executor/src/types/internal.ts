import {ProcessingBudget, String0x} from '@fuzd/common';
import {ExecutorStorage} from './executor-storage.js';
import {ChainProtocol, ChainProtocols, TransactionDataTypes} from '@fuzd/chain-protocol';
import type {ETHAccount} from 'remote-account';

// ------------------------------------------------------------------------------------------------
// ExecutorConfig
export type ExecutorConfig<ChainProtocolTypes extends ChainProtocol<any>> = {
	serverAccount: ETHAccount;
	chainProtocols: ChainProtocols<ChainProtocolTypes>;
	storage: ExecutorStorage<TransactionDataTypes<ChainProtocolTypes>>;
	maxExpiry?: number;
	/** @deprecated unused: processPendingTransactions follows `processing` */
	maxNumTransactionsToProcessInOneGo?: number;
	/** how much one processPendingTransactions run may do, see ProcessingBudget for the defaults */
	processing?: Partial<ProcessingBudget>;
	paymentAccount?: String0x;
};
