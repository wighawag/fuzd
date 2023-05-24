import {logs} from 'named-logs';
import {Execution, KeyValueDB, Time, ExecutorConfig, TransactionData} from './types';
const logger = logs('dreveal-executor');

const defaultFinality = 12;

export function createExecutor(config: ExecutorConfig) {
	const {provider, time, db, wallet} = config;

	function submitExecution(execution: Execution) {
		logger.info(execution);
	}

	async function execute(execution: Execution) {
		let transaction: TransactionData | undefined;

		if (execution.type === 'clear') {
			if (typeof execution.data === 'string') {
				transaction = {
					chainId: '1',
					to: execution.data,
					data: execution.data,
				};
			} else {
				throw new Error(`only data string supported for now`);
			}
		}

		if (!transaction) {
			throw new Error(`no transaction`);
		}

		const rawTransaction = await wallet.signTransaction(transaction);
		await provider.request({
			method: 'eth_sendRawTransaction',
			params: [rawTransaction],
		});
	}

	async function process() {
		const timestamp = await time.getTimestamp();

		// TODO test limit, is 10 good enough ? this will depends on exec time and CRON period and number of tx submitted
		// TODO configure it
		const limit = 10;
		const executions = await db.list<Execution>({prefix: 'q_', limit});

		for (const executionEntry of executions.entries()) {
			const queueID = executionEntry[0];
			const execution = executionEntry[1];

			let executionTime: number | undefined;
			if (execution.timing.type === 'timestamp') {
			} else {
				// const revealTime = Math.max(reveal.arrivalTimeWanted, reveal.startTime + reveal.minDuration);
				// + contracts.OuterSpace.linkedData.resolveWindow + this.finality * 15
			}

			if (!executionTime) {
				continue;
			}

			if (timestamp >= executionTime) {
				await execute(execution);
			} else {
				logger.info(
					`skip execution (queueID: ${queueID}) because not yet time executionTime (${executionTime}) > timestamp (${timestamp})`
				);
			}
		}
	}

	return {
		submitExecution,
		process,
	};
}
