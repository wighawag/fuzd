import type {TransactionInfo} from 'fuzd-executor';

export type ExecutorGateway = {
	submitTransactionAsJsonString(id: string, submission: string, signature: `0x${string}`): Promise<TransactionInfo>;
};
