import {ExecutionQueued} from 'fuzd-scheduler';
import {Decrypter, DecryptionResult} from 'fuzd-scheduler';
import {timelockDecrypt, HttpChainClient} from 'tlock-js';

export type DecrypterConfig = {
	client: HttpChainClient;
};

export function initDecrypter<TransactionDataType>(config: DecrypterConfig): Decrypter<TransactionDataType> {
	async function decrypt(
		execution: ExecutionQueued<TransactionDataType>
	): Promise<DecryptionResult<TransactionDataType>> {
		if (execution.type !== 'time-locked') {
			throw new Error(`expect an execution of type "time-locked"`);
		}

		let decrypted: string;
		try {
			decrypted = await timelockDecrypt(execution.payload, config.client);
		} catch (err) {
			return {
				success: false,
				retry: 0, // TODO
			};
		}

		const json = JSON.parse(decrypted);

		if (json.type === 'time-locked') {
			// onion decryption
			if (execution.timing.type === 'fixed') {
			} else {
				throw new Error(`execution timing of type "${execution.timing.type}" is not supported with tlock decrypter`);
			}
			return {
				success: false,
				newPayload: json.payload,
				newTimeValue: json.timeValue,
				retry: json.retry,
			};
		} else {
			return {
				success: true,
				transaction: json.transaction,
			};
		}
	}
	return {
		decrypt,
	};
}
