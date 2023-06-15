import {TransactionInfo} from 'dreveal-executor';

export type ExecutorGateway = {
	submitTransactionAsJsonString(id: string, submission: string, signature: `0x${string}`): Promise<TransactionInfo>;
};
