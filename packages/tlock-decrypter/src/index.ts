import {RoundBasedTiming, ExecutionQueued, Decrypter, DecryptionResult, DecryptedPayload} from 'fuzd-scheduler';
import {timelockDecrypt, HttpChainClient, roundTime, Buffer} from 'tlock-js';

export {testnetClient, mainnetClient} from 'tlock-js';

globalThis.Buffer = Buffer; // required
import {logs} from 'named-logs';

const logger = logs('fuzd-tlock-decrypter');

export type DecrypterConfig = {
	client: HttpChainClient;
};

export function initDecrypter<TransactionDataType>(config: DecrypterConfig): Decrypter<TransactionDataType> {
	async function decrypt(
		execution: ExecutionQueued<TransactionDataType>,
	): Promise<DecryptionResult<TransactionDataType>> {
		if (execution.type !== 'time-locked') {
			throw new Error(`expect an execution of type "time-locked"`);
		}

		// TODO option to
		// - provide round for t-lock
		// - provide aproximate round for t-lock
		let decrypted: Buffer;
		try {
			decrypted = await timelockDecrypt(execution.payload, config.client);
		} catch (err) {
			logger.error(err);
			return {
				success: false,
				retry: 0, // TODO
			};
		}

		const json: DecryptedPayload<TransactionDataType> = JSON.parse(decrypted.toString('utf-8'));

		if (json.type === 'time-locked') {
			// onion decryption
			if (execution.timing.type === 'fixed') {
			} else {
				throw new Error(`execution timing of type "${execution.timing.type}" is not supported with tlock decrypter`);
			}
			const round = json.timing.round;
			const drandChainInfo = await config.client.chain().info();
			const retry = roundTime(drandChainInfo, round);
			return {
				success: false,
				newPayload: json.payload,
				newTimimg: json.timing,
				retry,
			};
		} else {
			return {
				success: true,
				transactions: json.transactions,
			};
		}
	}
	return {
		decrypt,
	};
}
