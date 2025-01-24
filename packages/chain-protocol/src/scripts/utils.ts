import {formatEther} from 'viem';
import {GasEstimate, GasPrice} from '../index.js';
import {EstimateGasPriceResult, RoughEstimateGasPriceResult} from 'fuzd-common';

export function formatRoughEstimates(roughEstimate: RoughEstimateGasPriceResult) {
	return {
		slow: formatGasPrice(roughEstimate.slow),
		average: formatGasPrice(roughEstimate.average),
		fast: formatGasPrice(roughEstimate.fast),
	};
}

export function formatEstimates(estimateResult: EstimateGasPriceResult) {
	return {
		averageGasPricesOnEachPercentiles: estimateResult.averageGasPricesOnEachPercentiles.map(formatGasPrice),
		gasUsedRatio: {
			average: estimateResult.gasUsedRatio.average,
			last: estimateResult.gasUsedRatio.last,
			// all: number[];
		},
		baseFeePerGas: {
			average: formatValue(estimateResult.baseFeePerGas.average),
			last: formatValue(estimateResult.baseFeePerGas.last),
			// all: bigint[];
		},
	};
}

export function formatGasPrice(gasPrice: GasPrice) {
	return {
		maxFeePerGas: formatValue(gasPrice.maxFeePerGas),
		maxPriorityFeePerGas: formatValue(gasPrice.maxPriorityFeePerGas),
	};
}

export function formatGasEstimate(gasEstimate: GasEstimate) {
	return {
		maxFeePerGas: formatValue(gasEstimate.maxFeePerGas),
		maxPriorityFeePerGas: formatValue(gasEstimate.maxPriorityFeePerGas),
		gasPriceEstimate: formatGasPrice(gasEstimate.gasPriceEstimate),
	};
}

export function formatValue(value: bigint) {
	return formatEther(value, 'gwei') + ' gwei';
}
