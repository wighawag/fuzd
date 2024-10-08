import {describe, it, expect} from 'vitest';
import {network} from 'hardhat';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {createTestExecutor, createTestScheduler} from './utils/executor';
import {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {encodeFunctionData} from 'viem';
import {deriveRemoteAddress} from 'remote-account';
import {createMockDecrypter, overrideProvider} from './utils/mock-provider';
import {ExecutionSubmission} from 'fuzd-executor';
import {deployAll} from './utils';
import {createViemContext} from '../utils/viem';
import {EthereumChainProtocol} from 'fuzd-chain-protocol/ethereum';

const provider = overrideProvider(network.provider as EIP1193ProviderWithoutEvents);

const chainProtocol = new EthereumChainProtocol(provider, {
	expectedFinality: 1,
	worstCaseBlockTime: 3,
});
const executorConfig = {
	chainProtocols: {
		'0x7a69': chainProtocol,
	},
};

const decrypter = createMockDecrypter();

async function prepareExecution() {
	const {env, GreetingsRegistry} = await await loadFixture(deployAll);

	const {executor, publicExtendedKey} = await createTestExecutor(executorConfig);
	const {scheduler, schedulerStorage} = await createTestScheduler({
		...executorConfig,
		decrypter,
		executor,
	});

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

	const viemContext = await createViemContext(provider);
	const {publicClient, walletClient} = viemContext;

	const gasPrice = await publicClient.getGasPrice();

	const gas = await publicClient.estimateGas({...txData, account: remoteAccount});
	const balance = await publicClient.getBalance({address: remoteAccount});
	if (balance < gasPrice * gas) {
		await walletClient.sendTransaction({account: user, to: remoteAccount, value: gas * gasPrice});
	}

	return {
		gas,
		gasPrice,
		txData,
		user,
		GreetingsRegistry,
		mockDecrypter: decrypter,
		env,
		executor,
		scheduler,
		schedulerStorage,
		publicExtendedKey,
	};
}

let counter = 0;
describe('Executing on the registry', function () {
	it('Should execute without issues', async function () {
		const {gas, gasPrice, txData, user, GreetingsRegistry, env, scheduler, schedulerStorage} = await prepareExecution();
		const timestamp = await chainProtocol.getTimestamp();
		const checkinTime = timestamp + 100;
		console.log({user});
		const result = await scheduler.scheduleExecution(user, {
			slot: (++counter).toString(),
			chainId: '0x7a69',
			type: 'clear',
			timing: {
				type: 'fixed-time',
				scheduledTime: checkinTime,
			},
			executions: [
				{
					chainId: txData.chainId,
					transaction: {
						type: '0x2',
						to: txData.to,
						data: txData.data,
						gas: `0x${gas.toString(16)}` as `0x${string}`,
					},
					maxFeePerGasAuthorized: `0x${gasPrice.toString(16)}` as `0x${string}`,
				},
			],
		});
		expect(result.checkinTime).to.equal(checkinTime);

		const queue = await schedulerStorage.getQueueTopMostExecutions({limit: 10});
		chainProtocol.increaseTime(1010);
		await scheduler.processQueue();
		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('hello');
	});

	it('Should execute encrypted data without issues', async function () {
		const {gas, gasPrice, env, txData, user, GreetingsRegistry, mockDecrypter, scheduler} = await prepareExecution();
		const timestamp = await chainProtocol.getTimestamp();
		const checkinTime = timestamp + 100;
		const transaction: ExecutionSubmission = {
			chainId: txData.chainId,
			transaction: {
				type: '0x2',
				to: txData.to,
				data: txData.data,
				gas: `0x${gas.toString(16)}` as `0x${string}`,
			},
			maxFeePerGasAuthorized: `0x${gasPrice.toString(16)}` as `0x${string}`,
		};
		const id = (++counter).toString();
		mockDecrypter.addDecryptedResult(id, transaction);
		const result = await scheduler.scheduleExecution(user, {
			slot: id,
			chainId: '0x7a69',
			type: 'time-locked',
			timing: {
				type: 'fixed-time',
				scheduledTime: checkinTime,
			},
			payload: '0xblabla',
		});
		expect(result.checkinTime).to.equal(checkinTime);

		chainProtocol.increaseTime(101);
		await scheduler.processQueue();
		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('hello');
	});
});
