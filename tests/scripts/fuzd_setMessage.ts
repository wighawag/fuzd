import {Deployment} from 'rocketh';
import {context} from '../deploy/_context';
import hre from 'hardhat';
import {loadEnvironmentFromHardhat} from 'hardhat-rocketh/helpers';
import {createViemContext} from '../utils/viem';
import {encodeFunctionData, formatEther, parseEther} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {createClient} from 'fuzd-client';
import {mainnetClient} from 'tlock-js';
import {deriveRemoteAddress} from 'remote-account';

async function main() {
	const env = await loadEnvironmentFromHardhat({hre, context});

	const viemContext = await createViemContext(env.network.provider);
	const {publicClient, walletClient} = viemContext;

	const args = process.argv.slice(2);
	const schedulerHost = args[0];
	const message = (args[1] || process.env.MESSAGE) as `0x${string}`;
	const delayString = args[2] || process.env.DELAY;
	const delay = delayString ? parseInt(delayString) : 30;

	const timestamp = Math.floor(Date.now() / 1000);

	const GreetingsRegistry = env.deployments.GreetingsRegistry as Deployment<
		typeof context.artifacts.GreetingsRegistry.abi
	>;
	const data = encodeFunctionData({...GreetingsRegistry, functionName: 'setMessage', args: [message, 2]});

	const privateKey = `0x31672bc8a7a0462ba57920bf7ab60690f60ba1fb7711423cc0d9eedce19f62b7`; // generatePrivateKey();
	const wallet = privateKeyToAccount(privateKey);
	const publicKey = await fetch(`${schedulerHost}/api/publicKey`).then((v) => v.text());
	const remoteAddress = deriveRemoteAddress(publicKey, wallet.address);

	const remoteAddressBalance = await publicClient.getBalance({address: remoteAddress});
	const gasPrice = await publicClient.getGasPrice();
	const maxFeePerGas = gasPrice;

	const chainIdAsNumber = await publicClient.getChainId();
	const chainId = `0x${chainIdAsNumber.toString(16)}`;

	console.log({chainId});

	const txData = {
		chainId,
		data,
		to: GreetingsRegistry.address,
	};
	const gas = await publicClient.estimateGas({...txData, account: wallet.address});

	const balanceRequired = gas * maxFeePerGas;
	if (remoteAddressBalance < balanceRequired) {
		const weiNeeded = balanceRequired - remoteAddressBalance;
		console.log(`sending ${formatEther(weiNeeded)} ETH to the remote account ....`);
		const [providerAccount] = await walletClient.getAddresses();
		const hash = await walletClient.sendTransaction({
			account: providerAccount,
			to: remoteAddress,
			value: weiNeeded,
		});
		await publicClient.waitForTransactionReceipt({hash});
		console.log('done');
	}

	const client = createClient({
		drand: mainnetClient(),
		privateKey: privateKey,
		schedulerEndPoint: `${schedulerHost}/api/scheduling/scheduleExecution`,
	});

	const scheduleInfo = await client.scheduleExecution({
		chainId,
		transaction: {
			gas,
			data: txData.data,
			to: txData.to,
		},
		maxFeePerGasAuthorized: maxFeePerGas,
		time: timestamp + delay,
	});

	console.log({remoteAddress, scheduleInfo, gas, account: wallet.address});
}
main();
