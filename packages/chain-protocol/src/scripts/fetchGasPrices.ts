import {createCurriedJSONRPC} from 'remote-procedure-call';
import {EthereumChainProtocol} from '../ethereum/index.js';
import {
	getRoughGasPriceEstimate,
	getGasPriceEstimate,
	EstimateGasPriceOptions,
	getBestGasEstimate,
} from '../ethereum/utils.js';
import {formatEstimates, formatGasEstimate, formatGasPrice, formatRoughEstimates} from './utils.js';
import {Methods} from 'eip-1193';

const args = process.argv.slice(2);
const nodeURL = process.env.ETH_NODE_URL as string;

const rpc = createCurriedJSONRPC<Methods>(nodeURL);
async function main() {
	const protocol = new EthereumChainProtocol(nodeURL, {
		expectedFinality: 12,
		worstCaseBlockTime: 15,
	});

	console.log(`--------------------- getGasFee --------------------------------`);
	const gasFee = await protocol.getGasFee({
		maxFeePerGasAuthorized: '0x100',
	});
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

	bestGasEstimates(0.5);
	bestGasEstimates(1);
}

main();
