import {EIP1193Account, EIP1193DATA, EIP1193QUANTITY, EIP1193TransactionDataOfType2} from 'eip-1193';
import {AssumedTransaction, DeltaExecution, Execution, FixedTimeExecution, StartTransaction} from './execution';

export type Broadcaster = {
	nextNonce: number;
};

export type ExecutionBroadcastStored =
	| {
			pendingID: string;
	  }
	| {
			queueID: string;
	  };

export type TransactionInfo = {hash: `0x${string}`; nonce: number; broadcastTime: number; maxFeePerGasUsed: bigint};
export type ExecutionPendingTransactionData = ExecutionStored & {
	broadcastedTransaction: {data: TransactionDataUsed; info: TransactionInfo};
};

export type ExecutionStored = Execution & {
	id: string;
	retries: number;
	timing:
		| FixedTimeExecution<AssumedTransaction & {confirmed?: {blockTime: number}}>
		| DeltaExecution<StartTransaction & {confirmed?: {blockTime: number; startTime?: number}}>;
};

export type TransactionDataUsed = Omit<EIP1193TransactionDataOfType2, 'from'> & {
	chainId: string;
	to: EIP1193Account;
	gas: EIP1193QUANTITY;
	data: EIP1193DATA;
	nonce: EIP1193QUANTITY;
	maxFeePerGas: EIP1193QUANTITY;
	maxPriorityFeePerGas: EIP1193QUANTITY;
};
