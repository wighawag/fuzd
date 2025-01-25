import {createCurriedJSONRPC} from 'remote-procedure-call';
import {EthereumChainProtocol} from '../ethereum/index.js';
import {formatEstimates, formatGasEstimate, formatGasPrice, formatRoughEstimates, formatValue} from './utils.js';
import {Methods} from 'eip-1193';
import {EstimateGasPriceOptions, getBestGasEstimate, getGasPriceEstimate, getRoughGasPriceEstimate} from 'fuzd-common';

const args = process.argv.slice(2);
const nodeURL = process.env.ETH_NODE_URL as string;

const rpc = createCurriedJSONRPC<Methods>(nodeURL);
async function main() {
	const protocol = new EthereumChainProtocol(nodeURL, {
		expectedFinality: 12,
		worstCaseBlockTime: 15,
	});

	console.log(`--------------------- getGasFee --------------------------------`);
	const gasFee = await protocol.getGasFee(
		{
			maxFeePerGasAuthorized: '0x100',
		},
		0.5,
	);
	console.log(formatGasEstimate(gasFee));
	console.log(`----------------------------------------------------------------`);

	console.log(`------------- getRoughGasPriceEstimate -------------------------`);
	const roughEstimate = await getRoughGasPriceEstimate(rpc);
	console.log(formatRoughEstimates(roughEstimate));
	console.log(`----------------------------------------------------------------`);

	async function gasEstimates(options: Partial<EstimateGasPriceOptions>) {
		console.log(`--------------- getGasPriceEstimate (${options.rewardPercentiles?.join(',')})------------------`);
		const estimates1 = await getGasPriceEstimate(rpc, options);
		console.log(formatEstimates(estimates1));
		console.log(`----------------------------------------------------------------`);
	}
	await gasEstimates({
		blockCount: 20,
		newestBlock: 'pending',
		rewardPercentiles: [10, 50, 80],
	});

	async function bestGasEstimates(importanceRation: number) {
		console.log(`------------- getBestGasEstimate (${importanceRation}) -------------------------`);
		const bestEstimate = await getBestGasEstimate(rpc, importanceRation);
		console.log(formatGasPrice(bestEstimate));
		console.log(`----------------------------------------------------------------`);
	}

	await bestGasEstimates(0.5);
	await bestGasEstimates(1);

	console.log(`------------- eth_gasPrice -------------------------`);
	const gasPriceResponse = await rpc.call('eth_gasPrice')();
	if (gasPriceResponse.success) {
		console.log(formatValue(BigInt(gasPriceResponse.value)));
	}

	console.log(`----------------------------------------------------------------`);
}

main();
