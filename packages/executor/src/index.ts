import {logs} from 'named-logs';
const logger = logs('dreveal-executor');

const defaultFinality = 12;

type BaseExecution = {
	assumingTransaction?: {
		// the execution should only happen if that tx is included in a block
		// which can serve as a startTime
		hash: `0x${string}`;
		nonce: number;
		broadcastTime?: number; // this can be used as an estimate
		// TODO should we also allow an executor to broadcast both commit tx + reveal tx ?
	};
	timing:
		| {
				type: 'duration';
				duration: number | {};
		  }
		| {
				type: 'timestamp';
				timestamp: number;
		  };
};

export type ExecutionData =
	| `0x${string}`
	| {
			// TODO abitype
			abi: any[];
			// data:
			// with specific pattern to fill it with execution data so that the executor can call a contract before sending
			// Note that this require trust, unless that data is checked by the contract somehow
			// TODO: would that run the risk of having tx failure that cannot be attributed trustlessly
			data: any;
	  };

export type ExecutionInClear = BaseExecution & {
	type: 'clear';
	data: ExecutionData;
};

export type EncryptedExecution = BaseExecution & {
	type: 'encrypted';
	payload: `0x${string}`; // get decrypted in the ExecutionData type
};

export type Execution = EncryptedExecution | ExecutionInClear;

export function submit(execution: Execution) {
	logger.info(execution);
}
