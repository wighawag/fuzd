import {logs} from 'named-logs';
import type {
	EIP1193Block,
	EIP1193BlockTag,
	EIP1193ProviderWithoutEvents,
	EIP1193QUANTITY,
	EIP1193TransactionReceipt,
} from 'eip-1193';
import {String0x} from 'fuzd-common';

const logger = logs('fuzd-chain-protocol-ethereum-utils');

export async function getTransactionStatus(
	provider: EIP1193ProviderWithoutEvents,
	transaction: {hash: String0x; nonce: number},
	finality: number,
): Promise<
	| {finalised: true; blockTime: number; receipt: EIP1193TransactionReceipt; failed: boolean}
	| {finalised: false; blockTime?: number; receipt: EIP1193TransactionReceipt | null; failed?: boolean}
> {
	let finalised = false;
	let blockTime: number | undefined;
	// TODO fix eip-1193 to make receipt response optional, is that a null ?
	const receipt = await provider.request({
		method: 'eth_getTransactionReceipt',
		params: [transaction.hash],
	});
	if (receipt) {
		const latestBlocknumberAshex = await provider.request({method: 'eth_blockNumber'});
		const latestBlockNumber = Number(latestBlocknumberAshex);
		const receiptBlocknumber = Number(receipt.blockNumber);

		if (isNaN(latestBlockNumber) || isNaN(receiptBlocknumber)) {
			const errorMessage = `could not parse blocknumbers, latest: ${latestBlocknumberAshex}, receipt: ${receipt.blockNumber}`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}

		const block = await provider.request({
			method: 'eth_getBlockByHash',
			params: [receipt.blockHash, false],
		});
		if (block) {
			blockTime = Number(block.timestamp);
			finalised = receiptBlocknumber <= Math.max(0, latestBlockNumber - finality);
		}
	}

	let failed: boolean | undefined;
	if (receipt) {
		if (receipt.status === '0x0') {
			failed = true;
		} else if (receipt.status === '0x1') {
			failed = false;
		} else {
			const errorMessage = `Could not get the tx status for ${receipt.transactionHash} (status: ${receipt.status})`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}
	}

	if (finalised) {
		return {
			finalised,
			blockTime: blockTime as number,
			receipt: receipt as EIP1193TransactionReceipt,
			failed: failed as boolean,
		};
	} else {
		return {
			finalised,
			blockTime,
			receipt,
			failed,
		};
	}
}

function max(a: bigint, b: bigint): bigint {
	return a > b ? a : b;
}
function avg(arr: bigint[]) {
	const sum = arr.reduce((a: bigint, v: bigint) => a + v);
	return sum / BigInt(arr.length);
}
function avgNumber(arr: number[]) {
	const sum = arr.reduce((a: number, v: number) => a + v);
	return sum / arr.length;
}
export type EIP1193FeeHistory = {
	oldestBlock: string;
	reward: String0x[][];
	baseFeePerGas: string[];
	gasUsedRatio: string[];
};

export type EstimateGasPriceOptions = {
	blockCount: number;
	newestBlock: EIP1193BlockTag;
	rewardPercentiles: number[];
};

export type RoughEstimateGasPriceOptions = {
	blockCount: number;
	newestBlock: EIP1193BlockTag;
	rewardPercentiles: [number, number, number];
};

export type GasPrice = {maxFeePerGas: bigint; maxPriorityFeePerGas: bigint};
export type EstimateGasPriceResult = {
	averageGasPricesOnEachPercentiles: GasPrice[];
	gasUsedRatio: {
		average: number;
		last: number;
		all: number[];
	};
	baseFeePerGas: {
		average: bigint;
		last: bigint;
		all: bigint[];
	};
};
export type RoughEstimateGasPriceResult = {slow: GasPrice; average: GasPrice; fast: GasPrice};

const TARGET_RATIO = 0.5;

// TODO use a library for these ?
export async function getGasPriceEstimate(
	provider: EIP1193ProviderWithoutEvents,
	options?: Partial<EstimateGasPriceOptions>,
): Promise<EstimateGasPriceResult> {
	// const latestBlock = (await provider.request({
	// 	method: 'eth_getBlockByNumber',
	// 	params: [`latest`, false],
	// })) as EIP1193Block | undefined;

	// if (!latestBlock) {
	// 	const errorMessage = `failed to fetch latest block`;
	// 	logger.error(errorMessage);
	// 	throw new Error(errorMessage);
	// }

	const defaultOptions: EstimateGasPriceOptions = {
		blockCount: 20,
		newestBlock: 'pending',
		rewardPercentiles: [10, 50, 80],
	};
	const optionsResolved = options ? {...defaultOptions, ...options} : defaultOptions;

	const historicalBlocks = optionsResolved.blockCount;

	// const rawFeeHistory: EIP1193FeeHistory = (await provider.request({
	// 	method: 'eth_feeHistory',
	// 	params: [`0x${historicalBlocks.toString(16)}`, optionsResolved.newestBlock, optionsResolved.rewardPercentiles],
	// } as any)) as any; // TODO request Type

	const rawFeeHistory = await provider.request<{
		params: [EIP1193QUANTITY, EIP1193BlockTag, number[]];
		result: EIP1193FeeHistory;
	}>({
		method: 'eth_feeHistory',
		params: [`0x${historicalBlocks.toString(16)}`, optionsResolved.newestBlock, optionsResolved.rewardPercentiles],
	}); // TODO request Type

	let blockNum = Number(rawFeeHistory.oldestBlock);
	const lastBlock = blockNum + rawFeeHistory.reward.length;
	let index = 0;
	const blocksHistory: {number: number; baseFeePerGas: bigint; gasUsedRatio: number; priorityFeePerGas: bigint[]}[] =
		[];
	while (blockNum < lastBlock) {
		blocksHistory.push({
			number: blockNum,
			baseFeePerGas: BigInt(rawFeeHistory.baseFeePerGas[index]),
			gasUsedRatio: Number(rawFeeHistory.gasUsedRatio[index]),
			priorityFeePerGas: rawFeeHistory.reward[index].map((x) => BigInt(x)),
		});
		blockNum += 1;
		index += 1;
	}

	const percentilePriorityFeeAverages: bigint[] = [];
	for (let i = 0; i < optionsResolved.rewardPercentiles.length; i++) {
		percentilePriorityFeeAverages.push(avg(blocksHistory.map((b) => b.priorityFeePerGas[i])));
	}

	const baseFeePerGas = BigInt(rawFeeHistory.baseFeePerGas[rawFeeHistory.baseFeePerGas.length - 1]);

	const result: GasPrice[] = [];
	for (let i = 0; i < optionsResolved.rewardPercentiles.length; i++) {
		result.push({
			maxFeePerGas: percentilePriorityFeeAverages[i] + baseFeePerGas,
			maxPriorityFeePerGas: percentilePriorityFeeAverages[i],
		});
	}
	return {
		averageGasPricesOnEachPercentiles: result,
		gasUsedRatio: {
			average: avgNumber(blocksHistory.map((b) => b.gasUsedRatio)),
			last: blocksHistory[blocksHistory.length - 1].gasUsedRatio,
			all: blocksHistory.map((b) => b.gasUsedRatio),
		},
		baseFeePerGas: {
			average: avg(blocksHistory.map((b) => b.baseFeePerGas)),
			last: baseFeePerGas,
			all: blocksHistory.map((b) => b.baseFeePerGas),
		},
	};
}

export async function getBestGasEstimate(
	provider: EIP1193ProviderWithoutEvents,
	importanceRatio: number,
): Promise<GasPrice> {
	const defaultOptions: EstimateGasPriceOptions = {
		blockCount: 20,
		newestBlock: 'pending',
		rewardPercentiles: [10, 50, 80],
	};

	const result = await getGasPriceEstimate(provider, defaultOptions);

	let almostFullBlocks = false;
	let fullBlocks = false;
	const ratioConsideredAlmostFull = (TARGET_RATIO * 20) / 100;
	if (result.gasUsedRatio.average > ratioConsideredAlmostFull && result.gasUsedRatio.last > ratioConsideredAlmostFull) {
		almostFullBlocks = true;
	}
	if (result.gasUsedRatio.average > TARGET_RATIO && result.gasUsedRatio.last > TARGET_RATIO) {
		fullBlocks = true;
	}

	let maxFeePerGas: bigint;
	let maxPriorityFeePerGas: bigint;
	maxFeePerGas = max(result.baseFeePerGas.average, result.baseFeePerGas.last);
	const growing = result.baseFeePerGas.last > result.baseFeePerGas.all[0];

	if (fullBlocks) {
		if (importanceRatio > 0.9) {
			maxFeePerGas *= 2n;
		} else {
			maxFeePerGas += maxFeePerGas / 5n;
		}
		if (growing) {
			maxFeePerGas += maxFeePerGas / 5n;
		}
	} else if (almostFullBlocks) {
		if (importanceRatio > 0.9) {
			maxFeePerGas += maxFeePerGas / 5n;
		}
		if (growing) {
			maxFeePerGas += maxFeePerGas / 5n;
		}
	}

	if (maxFeePerGas == 0n) {
		maxFeePerGas = 1n;
	}

	// -------------------------------------------------
	// maxPriorityFeePerGas
	// -------------------------------------------------

	if (importanceRatio > 0.9) {
		if (fullBlocks) {
			maxPriorityFeePerGas = result.averageGasPricesOnEachPercentiles[3].maxPriorityFeePerGas;
		} else if (almostFullBlocks) {
			maxPriorityFeePerGas = result.averageGasPricesOnEachPercentiles[2].maxPriorityFeePerGas;
		} else {
			maxPriorityFeePerGas = result.averageGasPricesOnEachPercentiles[1].maxPriorityFeePerGas;
		}
	} else {
		if (fullBlocks) {
			maxPriorityFeePerGas = result.averageGasPricesOnEachPercentiles[2].maxPriorityFeePerGas;
		} else if (almostFullBlocks) {
			maxPriorityFeePerGas = maxFeePerGas / 10n;
		} else {
			maxPriorityFeePerGas = maxFeePerGas / 5n;
		}
	}

	// TODO form 0.8 to 0.9 increase

	// TODO add 0 and 0.5 too
	//  and then increase linerarly from each point to the next

	if (maxPriorityFeePerGas == 0n) {
		maxPriorityFeePerGas = 1n;
	}

	if (maxPriorityFeePerGas > maxFeePerGas) {
		maxFeePerGas = maxPriorityFeePerGas;
	} else {
		maxFeePerGas += maxPriorityFeePerGas;
	}

	return {
		maxFeePerGas,
		maxPriorityFeePerGas,
	};
}

export async function getRoughGasPriceEstimate(
	provider: EIP1193ProviderWithoutEvents,
	options?: Partial<RoughEstimateGasPriceOptions>,
): Promise<RoughEstimateGasPriceResult> {
	const defaultOptions: EstimateGasPriceOptions = {
		blockCount: 20,
		newestBlock: 'pending',
		rewardPercentiles: [10, 50, 80],
	};
	const optionsResolved = options ? {...defaultOptions, ...options} : defaultOptions;

	if (optionsResolved.rewardPercentiles.length !== 3) {
		const errorMessage = `rough gas estimate require 3 percentile, it defaults to [10,50,80]`;
		logger.error(errorMessage);
		throw new Error(errorMessage);
	}

	const result = await getGasPriceEstimate(provider, optionsResolved);
	if (result.gasUsedRatio.average < TARGET_RATIO) {
	}
	return {
		slow: result.averageGasPricesOnEachPercentiles[0],
		average: result.averageGasPricesOnEachPercentiles[1],
		fast: result.averageGasPricesOnEachPercentiles[2],
	};
}
