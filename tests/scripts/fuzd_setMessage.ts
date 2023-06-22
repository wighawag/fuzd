import {Deployment, loadEnvironment} from 'rocketh';
import {context} from '../deploy/_context';
import {network} from 'hardhat';
import {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {publicClient, walletClient} from './viem';
import {encodeFunctionData, parseEther} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {createClient} from 'fuzd-default-client';
import {testnetClient} from 'tlock-js';
import {deriveRemoteAddress} from 'remote-account';

async function main() {
	const env = await loadEnvironment(
		{
			provider: network.provider as EIP1193ProviderWithoutEvents,
			networkName: network.name,
		},
		context
	);

	const args = process.argv.slice(2);
	const message = (args[0] || process.env.MESSAGE) as `0x${string}`;
	const delayString = args[1] || process.env.DELAY;
	const delay = delayString ? parseInt(delayString) : 30;

	const timestamp = Math.floor(Date.now() / 1000);

	const Registry = env.deployments.Registry as Deployment<typeof context.artifacts.GreetingsRegistry.abi>;
	const data = await encodeFunctionData({...Registry, functionName: 'setMessage', args: [message, 2]});

	const schedulerHost = 'http://127.0.0.1:8787';

	const privateKey = `0x31672bc8a7a0462ba57920bf7ab60690f60ba1fb7711423cc0d9eedce19f62b7`; // generatePrivateKey();
	const wallet = privateKeyToAccount(privateKey);
	const publicKey = await fetch(`${schedulerHost}/publicKey`).then((v) => v.text());
	const remoteAddress = deriveRemoteAddress(publicKey, wallet.address);

	const remoteAddressBalance = await publicClient.getBalance({address: remoteAddress});
	if (remoteAddressBalance === 0n) {
		console.log(`sending 1 ether to the remote account ....`);
		const [providerAccount] = await walletClient.getAddresses();
		const hash = await walletClient.sendTransaction({
			account: providerAccount,
			to: remoteAddress,
			value: parseEther('1'),
		});
		const receipt = await publicClient.waitForTransactionReceipt({hash});
		console.log('done');
	}

	// const gasPricing = await publicClient.getGasPrice();
	const gasPricing = await publicClient.getFeeHistory({
		blockCount: 1,
		rewardPercentiles: [100],
	});

	const {baseFeePerGas, reward, gasUsedRatio, oldestBlock} = gasPricing;

	const maxFeePerGas = baseFeePerGas[baseFeePerGas.length - 1];
	const maxPriorityFeePerGas = reward ? reward[0][0] : 0n;

	const chainId = '0x7a69';
	const txData = {
		chainId,
		data,
		to: Registry.address,
	};
	const gas = await publicClient.estimateGas({...txData, account: wallet.address});

	// const hash = await walletClient.sendTransaction({
	// 	...txData,
	// 	account: address,
	// 	gas,
	// });

	const client = createClient({
		drand: testnetClient(),
		privateKey: privateKey,
		schedulerEndPoint: `${schedulerHost}/scheduleExecution`,
	});

	const scheduleInfo = await client.submitExecution({
		...txData,
		broadcastSchedule: [
			{
				maxFeePerGas,
				maxPriorityFeePerGas,
				duration: 3600,
			},
		],
		time: timestamp + delay,
		gas,
	});

	console.log({remoteAddress, scheduleInfo, gas, account: wallet.address});
}
main();
