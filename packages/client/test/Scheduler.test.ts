import {network} from 'hardhat';
import {Deployment, loadAndExecuteDeployments} from 'rocketh';
import {expect} from './utils/viem-chai';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {initTime} from './utils/time';
import {createTestExecutor, createTestScheduler} from '../src/executor';
import {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {walletClient, contract, publicClient, getAccounts} from './viem';
import artifacts from '../generated/artifacts';
import {encodeFunctionData} from 'viem';
import {deriveRemoteAddress} from 'remote-account';
import {hashRawTx, overrideProvider} from './utils/mock-provider';

const time = initTime();

const provider = overrideProvider(network.provider as EIP1193ProviderWithoutEvents);

const executorConfig = {
	chainId: '31337',
	finality: 1,
	worstCaseBlockTime: 2,
	provider,
	time,
};
const {executor, publicExtendedKey} = createTestExecutor(executorConfig);

const {scheduler} = createTestScheduler({
	...executorConfig,
	executor,
});

async function deploymentFixture() {
	const {deployments, accounts} = await loadAndExecuteDeployments({
		provider,
	});
	const registry = contract(deployments['Registry'] as Deployment<typeof artifacts.GreetingsRegistry.abi>);
	return {registry, accounts};
}

async function prepareExecution() {
	const {registry, accounts} = await loadFixture(deploymentFixture);
	const gasPrice = await publicClient.getGasPrice();

	const user = accounts.deployer;
	const remoteAccount = deriveRemoteAddress(publicExtendedKey, user);

	const data = encodeFunctionData({
		...registry,
		functionName: 'setMessageFor',
		args: [user, 'hello', 1],
	});

	const txData = {
		type: '0x2',
		chainId: '0x7a69',
		to: registry.address,
		data,
	} as const;

	const delegated = await registry.read.isDelegate([user, remoteAccount]);
	if (!delegated) {
		await registry.write.delegate([remoteAccount, true], {account: user, value: 0n});
	}

	const gas = await publicClient.estimateGas({...txData, account: remoteAccount});
	const balance = await publicClient.getBalance({address: remoteAccount});
	if (balance < gasPrice * gas) {
		await walletClient.sendTransaction({account: user, to: remoteAccount, value: gas * gasPrice});
	}

	return {gas, gasPrice, txData, user, registry};
}

let counter = 0;
describe('Executing on the registry', function () {
	it('Should execute without issues', async function () {
		const {gas, gasPrice, txData, user, registry} = await prepareExecution();
		const timestamp = await time.getTimestamp();
		const checkinTime = timestamp + 100;
		const result = await scheduler.submitExecution((++counter).toString(), user, {
			type: 'clear',
			timing: {
				type: 'fixed',
				value: {
					type: 'time',
					time: checkinTime,
				},
			},
			transaction: {
				...txData,
				gas: `0x${gas.toString(16)}` as `0x${string}`,
				broadcastSchedule: [
					{
						duration: '0x2000',
						maxFeePerGas: `0x${gasPrice.toString(16)}` as `0x${string}`,
						maxPriorityFeePerGas: `0x${gasPrice.toString(16)}` as `0x${string}`,
					},
				],
			},
		});
		expect(result.checkinTime).to.equal(checkinTime);

		time.increaseTime(101);
		await scheduler.processQueue();
		expect((await registry.read.messages([user])).content).to.equal('hello');
	});
});
