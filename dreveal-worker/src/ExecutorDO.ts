import {createDurable} from 'itty-durable';
import {createExecutor} from 'dreveal-executor';
import {JSONRPCHTTPProvider} from 'eip-1193-json-provider';
import {createWallet} from 'eip-1193-signer-viem';

interface Env {}

export class ExecutorDO extends createDurable() {
	protected executor: ReturnType<typeof createExecutor>;
	constructor(state: DurableObjectState, env: Env) {
		super(state, env);

		const provider = new JSONRPCHTTPProvider('http://localhost:8545');
		const db = state.storage;
		const time = {
			async getTimestamp() {
				return Math.floor(Date.now() / 1000);
			},
		};
		const privateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';
		const wallet = createWallet(privateKey);
		this.executor = createExecutor({
			chainId: '31337',
			finality: 12,
			worstCaseBlockTime: 15,
			provider,
			db,
			time,
			wallet,
			maxExpiry: 24 * 3600,
			maxNumTransactionsToProcessInOneGo: 10,
		});
	}

	home() {
		return 'hello';
	}

	submitExecution() {}
}
