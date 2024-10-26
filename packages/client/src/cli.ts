import {testnetClient} from 'tlock-js';
import {createClient} from './index.js';
import {loadEnv} from 'ldenv';
import {parseEther} from 'viem';
import {Command} from 'commander';
import pkg from '../package.json';
loadEnv();

async function main() {
	const program = new Command();

	program
		.name('fuzd')
		.version(pkg.version)
		.usage(`fuzd -e https://localhost:34002/api/scheduling/scheduleExecution -c 31337 -d 100 --value "1 gwei"`)
		.description('Execute encrypted transaction at a later time')
		.requiredOption('-c, --chain <chainId>', `chain to execute tx on`)
		.requiredOption('-d, --delta <value>', 'how far in future (in seconds)')
		.requiredOption('-e, --endpoint <url>', 'endpoint to connect to')
		// TODO gas parameter should be one value, and would depend
		.requiredOption('-g, --gas <amount>', 'gas amount for tx')
		.requiredOption('-m, --max-fee-per-gas <amount>', 'maxFeePerGas in wei can also add unit like eth,gwei')
		// .option('--value <amount>', 'amount of wei to send, can also add unit like eth,gwei,...')
		.option('--data <0x...>', 'tx data')
		.option('--to <0x...>', 'address to send tx to');

	program.parse(process.argv);

	type Options = {
		chain: string;
		endpoint: string;
		delta: string;
		maxFeePerGas: string;
		gas: string;
		// value: string;
		data: string;
		to: string;
	};

	const options: Options = program.opts();

	const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
	const endpoint = options.endpoint || (process.env.FUZD_ENDPOINT as string | undefined);
	if (!privateKey) {
		throw new Error(`no private provided, add PRIVATE_KEY to an .env file`);
	}
	if (!endpoint) {
		throw new Error(`no endpoint provided, add FUZD_ENDPOINT to an .env file`);
	}
	const delta = Number(options.delta);
	if (isNaN(delta) || delta <= 0) {
		throw new Error(`invalid delta`);
	}
	const gas = BigInt(options.gas);
	const time = delta + Math.floor(Date.now() / 1000);
	const data = options.delta ? (options.delta as `0x${string}`) : undefined;
	const to = options.to ? (options.to as `0x${string}`) : undefined;
	let maxFeePerGasAuthorized = BigInt(0);
	const split = options.maxFeePerGas.split(' ');
	if (split.length > 1) {
		maxFeePerGasAuthorized = parseEther(split[0], split[1] as 'wei' | 'gwei');
	} else {
		maxFeePerGasAuthorized = parseEther(split[0]);
	}
	const client = createClient({
		drand: testnetClient(),
		privateKey,
		schedulerEndPoint: endpoint,
	});

	await client.scheduleExecution({
		chainId: options.chain,
		transaction: {
			gas,
			data,
			to,
		},
		maxFeePerGasAuthorized,
		time,
	});
}
main();
