import {describe, it, expect} from 'vitest';
import {network} from 'hardhat';
import {Deployment, loadAndExecuteDeployments} from 'rocketh';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {initTime} from './utils/time';
import {TestSchedulerConfig, createTestExecutor, createTestScheduler} from './utils/executor';
import {EIP1193ProviderWithoutEvents} from 'eip-1193';
import artifacts from '../generated/artifacts';
import {encodeFunctionData} from 'viem';
import {deriveRemoteAddress} from 'remote-account';
import {createMockDecrypter, overrideProvider} from './utils/mock-provider';
import {TransactionSubmission} from 'fuzd-executor';
import {deployAll} from './utils';
import {createViemContext} from './utils/viem';

const time = initTime();

const provider = overrideProvider(network.provider as EIP1193ProviderWithoutEvents);

const executorConfig = {
	chainConfigs: {
		'0x7a69': {
			finality: 1,
			worstCaseBlockTime: 3,
			provider,
		},
	},
	time,
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

	const viemContext = createViemContext(provider);
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
		const timestamp = await time.getTimestamp();
		const checkinTime = timestamp + 100;
		console.log({user});
		const result = await scheduler.submitExecution(user, {
			slot: (++counter).toString(),
			chainId: '0x7a69',
			type: 'clear',
			timing: {
				type: 'fixed',
				value: {
					type: 'time',
					time: checkinTime,
				},
			},
			transactions: [
				{
					type: '0x2',
					chainId: txData.chainId,
					to: txData.to,
					data: txData.data,
					gas: `0x${gas.toString(16)}` as `0x${string}`,
					broadcastSchedule: [
						{
							duration: '0x2000',
							maxFeePerGas: `0x${gasPrice.toString(16)}` as `0x${string}`,
							maxPriorityFeePerGas: `0x${gasPrice.toString(16)}` as `0x${string}`,
						},
					],
				},
			],
		});
		expect(result.checkinTime).to.equal(checkinTime);

		const queue = await schedulerStorage.getQueueTopMostExecutions({limit: 10});
		console.log(queue);
		time.increaseTime(1010);
		const queueExecution = await scheduler.processQueue();
		console.log({queueExecution});
		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('hello');
	});

	it('Should execute encrypted data without issues', async function () {
		const {gas, gasPrice, env, txData, user, GreetingsRegistry, mockDecrypter, scheduler} = await prepareExecution();
		const timestamp = await time.getTimestamp();
		const checkinTime = timestamp + 100;
		const transaction: TransactionSubmission = {
			type: '0x2',
			chainId: txData.chainId,
			to: txData.to,
			data: txData.data,
			gas: `0x${gas.toString(16)}` as `0x${string}`,
			broadcastSchedule: [
				{
					duration: '0x2000' as `0x${string}`,
					maxFeePerGas: `0x${gasPrice.toString(16)}` as `0x${string}`,
					maxPriorityFeePerGas: `0x${gasPrice.toString(16)}` as `0x${string}`,
				},
			],
		};
		const id = (++counter).toString();
		mockDecrypter.addDecryptedResult(id, transaction);
		const result = await scheduler.submitExecution(user, {
			slot: id,
			chainId: '0x7a69',
			type: 'time-locked',
			timing: {
				type: 'fixed',
				value: {
					type: 'time',
					time: checkinTime,
				},
			},
			payload: '0xblabla',
		});
		expect(result.checkinTime).to.equal(checkinTime);

		time.increaseTime(101);
		await scheduler.processQueue();
		expect((await env.read(GreetingsRegistry, {functionName: 'messages', args: [user]})).content).to.equal('hello');
	});
});
