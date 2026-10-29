/**
 * fuzd-client is a wrapper to make it easier to send request to fuzd api
 * @module
 */

import type {EIP1193ProviderWithoutEvents} from 'eip-1193';
import type {
	ScheduleInfo,
	ScheduledExecution,
	DecryptedPayload,
	TimingTypes,
	FixedTime,
	DeltaTime,
	FixedRound,
	DeltaTimeWithTargetTime,
} from '@fuzd/scheduler';
import {timelockEncrypt, HttpChainClient, roundAt, Buffer} from 'tlock-js';
import {privateKeyToAccount} from 'viem/accounts';
import {
	ExecutionBroadcast,
	ExecutionResponse,
	getBestGasEstimate,
	type ExecutionSubmission,
	type IntegerString,
	type RemoteAccountInfo,
	type String0x,
} from '@fuzd/common';
import {EthereumTransactionData} from '@fuzd/chain-protocol/ethereum';

import {testnetClient, mainnetClient} from 'tlock-js';
import {InvokeTransactionData, StarknetTransactionData} from '@fuzd/chain-protocol/starknet';
export {mainnetClient, testnetClient};

export type {ScheduleInfo, ScheduledExecution, DecryptedPayload};
export type {ExecutionSubmission, RemoteAccountInfo, String0x};
export type {EthereumTransactionData, StarknetTransactionData, InvokeTransactionData};

(globalThis as any).Buffer = Buffer;

export type ClientConfig = {
	drand?: HttpChainClient;
	schedulerEndPoint: string | ((execution: string, signature: String0x) => Promise<ScheduleInfo>);
	privateKey: String0x;
};

export type SimplerEthereumTransactionData = Omit<EthereumTransactionData, 'gas' | 'value' | 'type'> & {
	gas: bigint | String0x | number;
	value?: bigint | String0x;
};

export type SimplerStarknetTransactionData = Omit<InvokeTransactionData, 'type' | 'max_fee' | 'version'> & {
	max_fee: bigint | String0x;
};

function hex(b: bigint | String0x | number): String0x {
	return (typeof b === 'string' ? b : `0x${b.toString(16)}`) as String0x;
}

function fromSimplerTransactionData(
	simple: SimplerStarknetTransactionData | SimplerEthereumTransactionData,
): StarknetTransactionData | EthereumTransactionData {
	if ('gas' in simple && simple.gas) {
		return {
			gas: hex(simple.gas),
			type: '0x2',
			accessList: simple.accessList,
			data: simple.data,
			to: simple.to,
			value: simple.value ? hex(simple.value) : undefined,
		};
	} else if ('max_fee' in simple && simple.max_fee) {
		return {
			type: 'INVOKE',
			version: '0x1', // TODO v3
			calldata: simple.calldata,
			max_fee: hex(simple.max_fee),
		};
	} else {
		throw new Error(`invalid transaction: ${simple}`);
	}
}

export {getBestGasEstimate};

/** A transaction to schedule: its own target, data and gas (and value, for ethereum). */
export type SubmissionTransaction = SimplerEthereumTransactionData | SimplerStarknetTransactionData; // TODO use BinumberIshTransactionData

/** What a submission sets once for all of its transactions. */
export type SubmissionParameters = {
	slot: string;
	chainId: IntegerString;
	/** The most each transaction may pay per gas. */
	maxFeePerGasAuthorized: bigint;
	criticalDelta?: number;
	timing: FixedTime | DeltaTime | DeltaTimeWithTargetTime | Omit<FixedRound, 'scheduledRound'>;
	paymentReserve?: {amount: bigint; broadcaster: String0x};
	onBehalf?: `0x${string}`;
	inClear?: boolean;
};

/** One transaction, scheduled alone. */
export type Submission = SubmissionParameters & {
	transaction: SubmissionTransaction;
	transactions?: never;
};

/**
 * Several transactions in one submission: the scheduler broadcasts them in this order, from one
 * remote account, at the submission's time (each is then found at its index in the batch).
 */
export type BatchSubmission = SubmissionParameters & {
	transactions: SubmissionTransaction[];
	transaction?: never;
};

/** The gas (and value) a transaction may cost, which is what its payment is computed from. */
export type TransactionCost = {gas: bigint | String0x | number; value?: bigint | String0x};

/** The most a submission may cost: either one transaction's gas and value, or every transaction of a batch. */
export type MaxCostParameters = {maxFeePerGasAuthorized: bigint} & (
	| {gas: bigint; value?: bigint; transactions?: never}
	| {transactions: TransactionCost[]; gas?: never; value?: never}
);

function submissionTransactions(execution: Submission | BatchSubmission): SubmissionTransaction[] {
	if (execution.transaction && execution.transactions) {
		throw new Error(`provide either transaction or transactions, not both`);
	}
	const transactions = execution.transactions || (execution.transaction ? [execution.transaction] : []);
	if (transactions.length === 0) {
		throw new Error(`a submission needs at least one transaction`);
	}
	return transactions;
}

export type DirectSubmission = {
	slot: string;
	chainId: IntegerString;
	transaction: SimplerEthereumTransactionData | SimplerStarknetTransactionData; // TODO use BinumberIshTransactionData
	maxFeePerGasAuthorized: bigint;
	criticalDelta?: number;
	onBehalf?: `0x${string}`;
};

export function createClient(config: ClientConfig) {
	const wallet = privateKeyToAccount(config.privateKey);
	const drandClient = config.drand || mainnetClient();

	let _assignedRemoteAccount: RemoteAccountInfo | undefined;

	async function _fetchRemoteAccount(chainId: IntegerString): Promise<RemoteAccountInfo> {
		const remoteAccountRequestUrl = `${config.schedulerEndPoint}/api/execution/remoteAccount/${chainId}/${wallet.address}`;
		const remoteAccountResponse = await fetch(remoteAccountRequestUrl);
		let remoteAccountResult;
		try {
			remoteAccountResult = await remoteAccountResponse.clone().json();
		} catch (err) {
			throw new Error(
				`failed to parse response: ${remoteAccountRequestUrl}: ${err} ${await remoteAccountResponse.text()}`,
			);
		}

		if (!remoteAccountResult.success) {
			throw new Error(remoteAccountResult.error || `failed: ${remoteAccountRequestUrl}`);
		}
		return remoteAccountResult.account;
	}
	async function assignRemoteAccount(chainId: IntegerString): Promise<RemoteAccountInfo> {
		_assignedRemoteAccount = await _fetchRemoteAccount(chainId);
		return _assignedRemoteAccount;
	}

	async function estimateBestGasPrice(provider: EIP1193ProviderWithoutEvents, importanceRatio: number) {
		return getBestGasEstimate(provider, importanceRatio);
	}

	/**
	 * The most a submission may cost the remote account: for each transaction, its gas at
	 * `maxFeePerGasAuthorized`, the service's fees on that (fixed and proportional, charged per
	 * transaction, as the executor does when it broadcasts each one) and its value; summed over a batch.
	 */
	function computeTotalMaxCost(params: MaxCostParameters): bigint {
		if (!_assignedRemoteAccount) {
			throw new Error(`need to assign a account first`);
		}
		const fees = _assignedRemoteAccount.serviceParameters.fees;
		const transactions: {gas: bigint; value: bigint}[] = params.transactions
			? params.transactions.map((v) => ({gas: BigInt(v.gas), value: v.value ? BigInt(v.value) : 0n}))
			: [{gas: params.gas, value: params.value ? params.value : 0n}];
		let total = 0n;
		for (const transaction of transactions) {
			const txCost = params.maxFeePerGasAuthorized * transaction.gas;
			total += txCost + transaction.value;
			if (fees.fixed != '0' || fees.per_1_000_000 > 0) {
				total += BigInt(fees.fixed) + (BigInt(fees.per_1_000_000) * txCost) / 1_000_000n;
			}
		}
		return total;
	}

	async function computeBalanceRequired(
		params: MaxCostParameters & {
			slot: string;
			chainId: IntegerString;
		},
	): Promise<{amountReserved: bigint; totalMaxCost: bigint; balanceRequired: bigint}> {
		const totalMaxCost = computeTotalMaxCost(params);
		if (!_assignedRemoteAccount) {
			throw new Error(`need to assign a account first`);
		}

		const reservedRequestUrl = `${config.schedulerEndPoint}/api/scheduling/reserved/${params.chainId}/${_assignedRemoteAccount.address}/${params.slot}`;
		const reservedResponse = await fetch(reservedRequestUrl);
		let reservedResult;
		try {
			reservedResult = await reservedResponse.clone().json();
		} catch (err) {
			throw new Error(`failed to parse response: ${reservedRequestUrl}: ${err} ${await reservedResponse.text()}`);
		}

		if (!reservedResult.success) {
			throw new Error(reservedResult.errors);
		}

		const amountReserved = BigInt(reservedResult.total);

		return {amountReserved, totalMaxCost, balanceRequired: amountReserved + totalMaxCost};
	}

	/**
	 * Schedule one transaction (`transaction`) or several in one submission (`transactions`, broadcast
	 * in that order). Timing, price, payment reserve and encryption are the submission's, shared by all.
	 */
	async function scheduleExecution(
		execution: Submission | BatchSubmission,
		options?: {fakeEncrypt?: boolean},
	): Promise<{success: true; info: ScheduleInfo} | {success: false; error: unknown}> {
		if (
			execution.timing.expiryDelta &&
			execution.criticalDelta &&
			execution.criticalDelta > execution.timing.expiryDelta
		) {
			throw new Error(
				`invalid criticalDelta, criticalDelta need to be smaller than timing.expiryDelta, it used to prioritize its execution`,
			);
		}
		const transactions = submissionTransactions(execution);
		let executionToSend: ScheduledExecution<ExecutionSubmission<EthereumTransactionData | StarknetTransactionData>>;
		const remoteAccount = await _fetchRemoteAccount(execution.chainId);
		if (_assignedRemoteAccount && remoteAccount.address != _assignedRemoteAccount.address) {
			throw new Error(`remoteAccount derivation changed`);
		}
		const serviceParameters = remoteAccount.serviceParameters;
		const payloadJSON: DecryptedPayload<ExecutionSubmission<EthereumTransactionData | StarknetTransactionData>> = {
			type: 'clear',
			executions: transactions.map((transaction) => ({
				chainId: execution.chainId,
				maxFeePerGasAuthorized: ('0x' + execution.maxFeePerGasAuthorized.toString(16)) as String0x,
				transaction: fromSimplerTransactionData(transaction),
				criticalDelta: execution.criticalDelta,
			})),
		};

		const timestamp = Math.floor(Date.now() / 1000);
		const partialTiming = execution.timing;
		let timing: TimingTypes;
		let round: number | undefined;

		if (partialTiming.type === 'fixed-round') {
			if (execution.inClear) {
				throw new Error(`fixed-round can't be used in clear`);
			}
			const drandChainInfo = await drandClient.chain().info();
			round = roundAt(options?.fakeEncrypt ? timestamp * 1000 : partialTiming.expectedTime * 1000, drandChainInfo);
			timing = {...partialTiming, scheduledRound: round};
		} else if (!execution.inClear) {
			timing = partialTiming;
			if (timing.type === 'fixed-time') {
				const drandChainInfo = await drandClient.chain().info();
				round = roundAt(options?.fakeEncrypt ? timestamp * 1000 : timing.scheduledTime * 1000, drandChainInfo);
			} else if (timing.type == 'delta-time-with-target-time') {
				const drandChainInfo = await drandClient.chain().info();
				round = roundAt(
					options?.fakeEncrypt ? timestamp * 1000 : timing.targetTimeUnlessHigherDelta * 1000,
					drandChainInfo,
				);
			}
		} else {
			timing = partialTiming;
		}

		if (
			round &&
			(timing.type === 'delta-time-with-target-time' || timing.type === 'fixed-round' || timing.type === 'fixed-time')
		) {
			const payloadAsJSONString = JSON.stringify(payloadJSON);
			const payload = await timelockEncrypt(round, Buffer.from(payloadAsJSONString, 'utf-8'), drandClient);
			executionToSend = {
				chainId: execution.chainId,
				slot: execution.slot,
				timing,
				executionServiceParameters: serviceParameters,
				paymentReserve: execution.paymentReserve
					? {amount: execution.paymentReserve.amount.toString(), broadcaster: execution.paymentReserve.broadcaster}
					: undefined, // TODO 0xstring ?
				onBehalf: execution.onBehalf,
				type: 'time-locked',
				payload,
			};
		} else {
			if (!execution.inClear) {
				throw new Error(
					`option provided (${timing.type}) forces the execution to be in clear, provide the option {inClear} if tjat is what you want`,
				);
			}
			executionToSend = {
				chainId: execution.chainId,
				slot: execution.slot,
				timing,
				executionServiceParameters: serviceParameters,
				paymentReserve: execution.paymentReserve
					? {amount: execution.paymentReserve.amount.toString(), broadcaster: execution.paymentReserve.broadcaster}
					: undefined, // TODO 0xstring ?
				onBehalf: execution.onBehalf,
				type: 'clear',
				executions: payloadJSON.executions,
			};
		}

		const jsonAsString = JSON.stringify(executionToSend);
		const signature = await wallet.signMessage({message: jsonAsString});
		if (typeof config.schedulerEndPoint === 'string') {
			const response = await fetch(`${config.schedulerEndPoint}/api/scheduling/scheduleExecution`, {
				method: 'POST',
				body: jsonAsString,
				headers: {
					signature,
					'content-type': 'application/json',
				},
			});
			try {
				return response.json();
			} catch (err: any) {
				throw new Error(`could not parse response: ${err}`);
			}
		} else {
			const info = await config.schedulerEndPoint(jsonAsString, signature);
			return {
				success: true,
				info,
			};
		}
	}

	async function broadcastExecution(
		execution: DirectSubmission,
	): Promise<
		| {success: true; info: ExecutionResponse<EthereumTransactionData | StarknetTransactionData>}
		| {success: false; error: unknown}
	> {
		const remoteAccount = await _fetchRemoteAccount(execution.chainId);
		if (_assignedRemoteAccount && remoteAccount.address != _assignedRemoteAccount.address) {
			throw new Error(`remoteAccount derivation changed`);
		}
		const serviceParameters = remoteAccount.serviceParameters;
		const transactionData = fromSimplerTransactionData(execution.transaction);

		const executionToSend: ExecutionBroadcast<EthereumTransactionData | StarknetTransactionData> = {
			chainId: execution.chainId,
			slot: execution.slot,
			serviceParameters,
			onBehalf: execution.onBehalf,
			criticalDelta: execution.criticalDelta,
			transaction: transactionData,
			maxFeePerGasAuthorized: ('0x' + execution.maxFeePerGasAuthorized.toString(16)) as String0x,
		};

		const jsonAsString = JSON.stringify(executionToSend);
		const signature = await wallet.signMessage({message: jsonAsString});
		if (typeof config.schedulerEndPoint === 'string') {
			const response = await fetch(`${config.schedulerEndPoint}/api/execution/broadcastExecution`, {
				method: 'POST',
				body: jsonAsString,
				headers: {
					signature,
					'content-type': 'application/json',
				},
			});
			try {
				return response.json();
			} catch (err: any) {
				throw new Error(`could not parse response: ${err}`);
			}
		} else {
			return {success: false, error: 'schedulerEndPoint function not supported for direct execution'};
			// const info = await config.schedulerEndPoint(jsonAsString, signature);
			// return {
			// 	success: true,
			// 	info,
			// };
		}
	}

	function getRemoteAccount() {
		return _assignedRemoteAccount?.address;
	}

	return {
		getRemoteAccount,
		assignRemoteAccount,
		scheduleExecution,
		computeTotalMaxCost,
		computeBalanceRequired,
		broadcastExecution,
	};
}

export type FuzdClient = ReturnType<typeof createClient>;
