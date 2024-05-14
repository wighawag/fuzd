import {describe, it, expect} from 'vitest';
import {network} from 'hardhat';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {initTime} from './utils/time';
import {createTestExecutor} from './utils/executor';
import {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {encodeFunctionData} from 'viem';
import {deriveRemoteAddress} from 'remote-account';
import {hashRawTx, overrideProvider} from './utils/mock-provider';
import {deployAll} from './utils';
import {createViemContext} from './utils/viem';

const time = initTime();

const provider = overrideProvider(network.provider as EIP1193ProviderWithoutEvents);

async function prepareExecution() {
	const {env, GreetingsRegistry} = await await loadFixture(deployAll);

	const {executor, publicExtendedKey} = await createTestExecutor({
		chainConfigs: {
			'0x7a69': {
				finality: 1,
				worstCaseBlockTime: 3,
				provider,
			},
		},
		time,
	});

	const viemContext = createViemContext(provider);
	const {publicClient, walletClient} = viemContext;
	const gasPrice = await publicClient.getGasPrice();

	const user = env.namedAccounts.deployer;
	const remoteAccount = deriveRemoteAddress(publicExtendedKey, user);

	const data = encodeFunctionData({
		...GreetingsRegistry,
		functionName: 'setMessageFor',
		args: [user, 'hello', 1],
	});

	const txData = {
		type: 'eip1559',
		chainId: '0x7a69',
		to: GreetingsRegistry.address,
		data,
	} as const;

	const delegated = await env.read(GreetingsRegistry, {functionName: 'isDelegate', args: [user, remoteAccount]});
	if (!delegated) {
		await env.execute(GreetingsRegistry, {
			functionName: 'delegate',
			args: [remoteAccount, true],
			account: user,
			value: 0n,
		});
	}

	const gas = await publicClient.estimateGas({...txData, account: remoteAccount});
	const balance = await publicClient.getBalance({address: remoteAccount});
	if (balance < gasPrice * gas) {
		await walletClient.sendTransaction({account: user, to: remoteAccount, value: gas * gasPrice});
	}

	return {gas, gasPrice, txData, user, GreetingsRegistry, env, executor, publicExtendedKey};
}

let counter = 0;
describe('Executing on the registry', function () {
	it('Should execute without issues', async function () {
		const {gas, gasPrice, txData, user, GreetingsRegistry, executor, env} = await prepareExecution();
		const txInfo = await executor.broadcastExecution((++counter).toString(), user, {
			chainId: txData.chainId,
			transaction: {
				type: '0x2',
				to: txData.to,
				data: txData.data,
				gas: `0x${gas.toString(16)}` as `0x${string}`,
			},
			maxFeePerGasAuthorized: `0x${gasPrice.toString(16)}` as `0x${string}`,
		});

		expect(txInfo.isVoidTransaction).to.be.false;
		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('hello');
	});

	it('Should fails to execute right away if tx is not broadcasted, it still pass', async function () {
		const {gas, gasPrice, txData, user, GreetingsRegistry, executor, env} = await prepareExecution();
		provider.override({
			eth_sendRawTransaction: async (provider, params) => {
				const rawTx = params[0];
				const hash = hashRawTx(rawTx);
				return hash;
			},
		});
		const txInfo = await executor.broadcastExecution((++counter).toString(), user, {
			chainId: txData.chainId,
			transaction: {
				type: '0x2',
				to: txData.to,
				data: txData.data,
				gas: `0x${gas.toString(16)}` as `0x${string}`,
			},
			maxFeePerGasAuthorized: `0x${gasPrice.toString(16)}` as `0x${string}`,
		});

		expect(txInfo.isVoidTransaction).to.be.false;
		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('');
	});

	it('Should fails to execute right away if tx is not broadcasted, but succeed on checks', async function () {
		const {gas, gasPrice, txData, user, GreetingsRegistry, executor, env} = await prepareExecution();
		provider.override({
			eth_sendRawTransaction: async (provider, params) => {
				const rawTx = params[0];
				const hash = hashRawTx(rawTx);
				return hash;
			},
		});
		const txInfo = await executor.broadcastExecution((++counter).toString(), user, {
			chainId: txData.chainId,
			transaction: {
				type: '0x2',
				to: txData.to,
				data: txData.data,
				gas: `0x${gas.toString(16)}` as `0x${string}`,
			},
			maxFeePerGasAuthorized: `0x${gasPrice.toString(16)}` as `0x${string}`,
		});

		expect(txInfo.isVoidTransaction).to.be.false;
		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('');

		provider.removeOverride();

		await executor.processPendingTransactions();

		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('hello');
	});

	it.skip('test reorg', async function () {
		const {gas, gasPrice, txData, user, GreetingsRegistry, executor, env} = await prepareExecution();
		provider.override({
			// we do not broadcast
			eth_sendRawTransaction: async (provider, params) => {
				const rawTx = params[0];
				const hash = hashRawTx(rawTx);
				return hash;
			},
			// and we return as if the tx was subnitted
			eth_getTransactionReceipt: async (provider, params) => {
				const latestBlock = await provider.request({
					method: 'eth_getBlockByNumber',
					params: ['latest', false],
				});
				// TODO proper receipt
				return {...txData, blockNumber: latestBlock?.number, blockhash: latestBlock?.hash};
			},
		});
		const txInfo = await executor.broadcastExecution((++counter).toString(), user, {
			chainId: txData.chainId,
			transaction: {
				type: '0x2',
				to: txData.to,
				data: txData.data,
				gas: `0x${gas.toString(16)}` as `0x${string}`,
			},
			maxFeePerGasAuthorized: `0x${gasPrice.toString(16)}` as `0x${string}`,
		});

		expect(txInfo.isVoidTransaction).to.be.false;
		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('');

		// provider.removeOverride();

		await executor.processPendingTransactions();

		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('hello');
	});
});
