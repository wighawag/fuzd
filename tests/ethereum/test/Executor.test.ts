import 'named-logs-console';
import {describe, it, expect} from 'vitest';
import {network} from 'hardhat';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {createTestExecutor} from './utils/executor';
import {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {encodeFunctionData, formatEther, parseEther} from 'viem';
import {initAccountFromHD} from 'remote-account';
import {hashRawTx, overrideProvider} from './utils/mock-provider';
import {deployAll} from './utils';
import {createViemContext} from '../utils/viem';
import {EthereumChainProtocol} from 'fuzd-chain-protocol/ethereum';
import {mnemonicToSeedSync} from '@scure/bip39';
import {HDKey} from '@scure/bip32';
import {Fees, String0x} from 'fuzd-common';

const provider = overrideProvider(network.provider as EIP1193ProviderWithoutEvents);

async function prepareExecution(options?: {fees?: Fees; gasPrice?: bigint}) {
	const {env, GreetingsRegistry} = await await loadFixture(deployAll);

	const paymentAccount = '0x0000000000000000000000000000000000000001';

	const defaultPath = "m/44'/60'/0'/0/0";
	const mnemonic: string = 'test test test test test test test test test test test junk';
	const seed = mnemonicToSeedSync(mnemonic);
	const masterKey = HDKey.fromMasterSeed(seed);
	const accountHDKey = masterKey.derive(defaultPath);
	const account = initAccountFromHD(accountHDKey);
	const chainId = '31337';

	const {executor, publicExtendedKey, storage} = await createTestExecutor<EthereumChainProtocol>({
		serverAccount: account,
		chainProtocols: {
			[chainId]: new EthereumChainProtocol(
				// TODO any
				provider as any,
				{
					expectedFinality: 1,
					worstCaseBlockTime: 3,
				},
			),
		},
		paymentAccount,
		expectedWorstCaseGasPrices: [
			{
				chainId,
				value: 0n,
			},
		],
	});

	const timestamp = Math.floor(Date.now() / 1000);

	if (options?.fees) {
		await storage.updateFees(chainId, timestamp, options.fees);
	}

	const viemContext = await createViemContext(provider);
	const {publicClient, walletClient} = viemContext;
	const gasPrice = options?.gasPrice || (await publicClient.getGasPrice());

	const user = env.namedAccounts.deployer;
	const remoteAccountInfo = await executor.getRemoteAccount(chainId, user);
	const serviceParameters = remoteAccountInfo.serviceParameters;
	const remoteAccount = remoteAccountInfo.address;
	const paymenetAccountBroadcasterInfo = await executor.getRemoteAccount(chainId, paymentAccount);
	const paymentRemoteAccount = paymenetAccountBroadcasterInfo.address;

	await walletClient.sendTransaction({account: user, to: paymentRemoteAccount, value: parseEther('0.1')});

	const data = encodeFunctionData({
		...GreetingsRegistry,
		functionName: 'setMessageFor',
		args: [user, 'hello', 1],
	});

	const txData = {
		type: 'eip1559',
		chainId,
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

	return {gas, gasPrice, txData, user, GreetingsRegistry, env, executor, publicExtendedKey, serviceParameters};
}

let counter = 0;
describe('Executing on the registry', function () {
	it('Should execute without issues', async function () {
		const {gas, gasPrice, txData, user, GreetingsRegistry, executor, env, serviceParameters} = await prepareExecution();
		const txInfo = await executor.broadcastExecution(
			(++counter).toString(),
			0,
			user,
			{
				chainId: txData.chainId,
				transaction: {
					type: '0x2',
					to: txData.to,
					data: txData.data,
					gas: `0x${gas.toString(16)}` as String0x,
				},
				maxFeePerGasAuthorized: `0x${gasPrice.toString(16)}` as String0x,
			},
			serviceParameters,
		);

		expect(txInfo.isVoidTransaction).to.be.false;
		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('hello');
	});

	it('Should fails if fees are added and the payment sent is not enough', async function () {
		const {gas, gasPrice, txData, user, GreetingsRegistry, executor, env, serviceParameters} = await prepareExecution({
			fees: {fixed: '1', per_1_000_000: 0},
		});

		await expect(
			executor.broadcastExecution(
				(++counter).toString(),
				0,
				user,
				{
					chainId: txData.chainId,
					transaction: {
						type: '0x2',
						to: txData.to,
						data: txData.data,
						gas: `0x${gas.toString(16)}` as String0x,
					},
					maxFeePerGasAuthorized: `0x${gasPrice.toString(16)}` as String0x,
				},
				serviceParameters,
			),
		).rejects.toThrowError();
	});

	it('Should execute after processs is called since we allow for the paymentAccount to pay for diff', async function () {
		const {gas, gasPrice, txData, user, GreetingsRegistry, executor, env, serviceParameters} = await prepareExecution();
		const txInfo = await executor.broadcastExecution(
			(++counter).toString(),
			0,
			user,
			{
				chainId: txData.chainId,
				transaction: {
					type: '0x2',
					to: txData.to,
					data: txData.data,
					gas: `0x${gas.toString(16)}` as String0x,
				},
				maxFeePerGasAuthorized: `0x1`,
			},
			serviceParameters,
		);

		expect(txInfo.isVoidTransaction).to.be.false;
		await executor.processPendingTransactions();
		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('hello');
	});

	it('Should fails to execute right away if tx is not broadcasted, it still pass', async function () {
		const {gas, gasPrice, txData, user, GreetingsRegistry, executor, env, serviceParameters} = await prepareExecution();
		provider.override({
			eth_sendRawTransaction: async (provider, params) => {
				const rawTx = params[0];
				const hash = hashRawTx(rawTx);
				return hash;
			},
		});
		const txInfo = await executor.broadcastExecution(
			(++counter).toString(),
			0,
			user,
			{
				chainId: txData.chainId,
				transaction: {
					type: '0x2',
					to: txData.to,
					data: txData.data,
					gas: `0x${gas.toString(16)}` as String0x,
				},
				maxFeePerGasAuthorized: `0x${gasPrice.toString(16)}` as String0x,
			},
			serviceParameters,
		);

		expect(txInfo.isVoidTransaction).to.be.false;
		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('');
	});

	it('Should fails to execute right away if tx is not broadcasted, but succeed on checks', async function () {
		const {gas, gasPrice, txData, user, GreetingsRegistry, executor, env, serviceParameters} = await prepareExecution();
		provider.override({
			eth_sendRawTransaction: async (provider, params) => {
				const rawTx = params[0];
				const hash = hashRawTx(rawTx);
				return hash;
			},
		});
		const txInfo = await executor.broadcastExecution(
			(++counter).toString(),
			0,
			user,
			{
				chainId: txData.chainId,
				transaction: {
					type: '0x2',
					to: txData.to,
					data: txData.data,
					gas: `0x${gas.toString(16)}` as String0x,
				},
				maxFeePerGasAuthorized: `0x${gasPrice.toString(16)}` as String0x,
			},
			serviceParameters,
		);

		expect(txInfo.isVoidTransaction).to.be.false;
		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('');

		provider.removeOverride();

		await executor.processPendingTransactions();

		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('hello');
	});

	it('test reorg', async function () {
		const {gas, gasPrice, txData, user, GreetingsRegistry, executor, env, serviceParameters} = await prepareExecution();
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
		const txInfo = await executor.broadcastExecution(
			(++counter).toString(),
			0,
			user,
			{
				chainId: txData.chainId,
				transaction: {
					type: '0x2',
					to: txData.to,
					data: txData.data,
					gas: `0x${gas.toString(16)}` as String0x,
				},
				maxFeePerGasAuthorized: `0x${gasPrice.toString(16)}` as String0x,
			},
			serviceParameters,
		);

		expect(txInfo.isVoidTransaction).to.be.false;
		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('');

		provider.removeOverride();

		await executor.processPendingTransactions();

		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('hello');
	});
});
