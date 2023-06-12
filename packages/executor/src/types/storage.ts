import {EIP1193Account, EIP1193DATA, EIP1193QUANTITY, EIP1193TransactionDataOfType2} from 'eip-1193';
import {AssumedTransaction, DeltaExecution, Execution, FixedTimeExecution, StartTransaction} from './execution';

export type TransactionInfo = {hash: `0x${string}`; nonce: number; broadcastTime: number; maxFeePerGasUsed: bigint};
export type ExecutionPendingTransactionData = ExecutionStored & {
	broadcastedTransaction: {data: TransactionDataUsed; info: TransactionInfo};
	nonce: number;
};

export type Broadcaster = {
	nextNonce: number;
	address: `0x${string}`;
};

export type ExecutionBroadcastStored =
	| {
			nonce: number;
	  }
	| {
			executionTime: number;
	  };

export type ExecutionStored = Execution & {
	id: string;
	executionTime: number;
	retries: number;
	timing:
		| FixedTimeExecution<AssumedTransaction & {confirmed?: {blockTime: number}}>
		| DeltaExecution<StartTransaction & {confirmed?: {blockTime: number; startTime?: number}}>;
};

export type TransactionDataUsed = EIP1193TransactionDataOfType2 & {
	chainId: string;
	to: EIP1193Account;
	gas: EIP1193QUANTITY;
	data: EIP1193DATA;
	nonce: EIP1193QUANTITY;
	maxFeePerGas: EIP1193QUANTITY;
	maxPriorityFeePerGas: EIP1193QUANTITY;
};

export interface ExecutorStorage {
	getExecution(id: string, executionTime: number): Promise<ExecutionStored | undefined>;
	getBroadcastedExecution(id: string): Promise<ExecutionBroadcastStored | undefined>;

	deleteExecution(id: string, executionTime: number): Promise<void>;
	// expect to delete atomically both broadast and queue

	deletePendingExecution(id: string, broadcaster: `0x${string}`, nonce: number): Promise<void>;
	// expect to delete atomically both broadast and pending

	createExecution(id: string, executionTime: number, executionToStore: ExecutionStored): Promise<ExecutionStored>;
	// Account too ?
	// db.put<ExecutionStored>(queueID, executionToStore);
	// db.put<ExecutionBroadcastStored>(broadcastID, {queueID});

	updateExecutionInQueue(executionTime: number, executionToStore: ExecutionStored): Promise<void>;

	reassignExecutionToQueue(
		oldExecutionTime: number,
		newExecutionTime: number,
		execution: ExecutionStored
	): Promise<void>;
	// db.delete(queueID);
	// db.put<ExecutionStored>(computeQueueID(newTimestamp, execution.id), execution);

	getBroadcaster(address: string): Promise<Broadcaster | undefined>;
	getBroadcasterFor(address: string): Promise<Broadcaster | undefined>;

	createBroadcaster(address: string, broadcaster: Broadcaster): Promise<void>;

	createPendingExecution(
		id: string,
		executionTime: number,
		nonce: number,
		data: ExecutionPendingTransactionData,
		broadcasterAddress: string,
		broadcaster: Broadcaster
	): Promise<ExecutionPendingTransactionData>;
	// db.put<ExecutionBroadcastStored>(broadcastID, {pendingID}); // no queueID
	// db.put<ExecutionPendingTransactionData>(pendingID, {
	//     ...execution,
	//     broadcastedTransaction: {info: result.tx, data: {...transaction, nonce: `0x${result.tx.nonce.toString()}`}},
	// });
	// broadcaster.nextNonce = result.tx.nonce + 1;
	// await db.put<Broadcaster>(broadcasterID, broadcaster);
	// await db.delete(queueID);

	getQueueTopMostExecutions(limit: number): Promise<ExecutionStored[]>;
	// const executions = await db.list<ExecutionStored>({prefix: 'q_', limit});

	updatePendingExecution(pendingID: string, data: ExecutionPendingTransactionData): Promise<void>;

	getPendingExecutions(limit: number): Promise<ExecutionPendingTransactionData[]>;
}
