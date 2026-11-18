import {logs} from 'named-logs';
import {FUZDLogger} from '@fuzd/common';
import {ScheduledExecutionQueued, Decrypter, DecryptionResult, DecryptedPayload} from '@fuzd/scheduler';
import {timelockDecrypt, HttpChainClient, roundTime, roundAt, Buffer} from 'tlock-js';

export {testnetClient, mainnetClient} from 'tlock-js';

globalThis.Buffer = Buffer; // required

const logger = <FUZDLogger>logs('fuzd-tlock-decrypter');

export type DecrypterConfig = {
	client: HttpChainClient;
};

export function initDecrypter<ExecutionDataType>(config: DecrypterConfig): Decrypter<ExecutionDataType> {
	async function decrypt(
		execution: ScheduledExecutionQueued<ExecutionDataType>,
	): Promise<DecryptionResult<ExecutionDataType>> {
		if (execution.type !== 'time-locked') {
			throw new Error(`expect an execution of type "time-locked"`);
		}

		// TODO option to
		// - provide round for t-lock
		// - provide aproximate round for t-lock
		let decrypted: Buffer;
		try {
			decrypted = await timelockDecrypt(execution.payload, config.client);
		} catch (err: any) {
			logger.error(err.message || `failed to decrypt`, {
				error: {
					name: err.name,
					stack: err.stack,
					cause: err,
				},
			});
			return {
				success: false,
				retry: 0, // TODO
			};
		}

		const json: DecryptedPayload<ExecutionDataType> = JSON.parse(decrypted.toString('utf-8'));

		if (json.type === 'time-locked') {
			// onion decryption: the decrypted payload is itself time-locked, with the timing of its own layer
			const newTiming = json.timing;
			if (
				!newTiming ||
				!(
					newTiming.type === 'fixed-time' ||
					newTiming.type === 'fixed-round' ||
					newTiming.type === 'delta-time-with-target-time'
				)
			) {
				throw new Error(
					`execution timing of type "${(newTiming as any)?.type}" is not supported for a time-locked payload`,
				);
			}
			const drandChainInfo = await config.client.chain().info();
			let round: number;
			switch (newTiming.type) {
				case 'fixed-time':
					round = roundAt(newTiming.scheduledTime * 1000, drandChainInfo);
					break;
				case 'fixed-round':
					round = newTiming.scheduledRound;
					break;
				case 'delta-time-with-target-time':
					// a time, not a round: the earliest the inner layer can be decrypted
					round = roundAt(newTiming.targetTimeUnlessHigherDelta * 1000, drandChainInfo);
					break;
			}
			const retry = Math.floor(roundTime(drandChainInfo, round) / 1000);
			return {
				success: false,
				newPayload: json.payload,
				newTiming,
				retry,
			};
		} else {
			return {
				success: true,
				executions: json.executions,
			};
		}
	}
	return {
		decrypt,
	};
}
