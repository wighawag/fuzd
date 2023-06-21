import {ExecutionQueued, FixedTiming} from 'fuzd-scheduler';
import {RoundBasedTiming} from 'fuzd-scheduler';
import {Decrypter, DecryptionResult} from 'fuzd-scheduler';
import {timelockDecrypt, HttpChainClient, roundTime} from 'tlock-js';

export type DecrypterConfig = {
	client: HttpChainClient;
};

export type DecryptedPayload<TransactionDataType> =
	| {
			type: 'time-locked';
			payload: string;
			timing: RoundBasedTiming;
	  }
	| {
			type: 'clear';
			transaction: TransactionDataType;
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

		const json: DecryptedPayload<TransactionDataType> = JSON.parse(decrypted);

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
				transaction: json.transaction,
			};
		}
	}
	return {
		decrypt,
	};
}
