import {network} from 'hardhat';
import {Deployment, loadAndExecuteDeployments} from 'rocketh';
import {expect} from './utils/viem-chai';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {initTime} from './utils/time';
import {createTestExecutor} from '../src/executor';
import {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {walletClient, contract, publicClient, getAccounts} from './viem';
import artifacts from '../generated/artifacts';
import {encodeFunctionData} from 'viem';

const time = initTime();

const executor = createTestExecutor({
	chainId: '31337',
	finality: 1,
	worstCaseBlockTime: 2,
	provider: network.provider as EIP1193ProviderWithoutEvents,
	time,
});

async function deploymentFixture() {
	const {deployments, accounts} = await loadAndExecuteDeployments({
		provider: network.provider as any,
	});
	const registry = contract(deployments['Registry'] as Deployment<typeof artifacts.GreetingsRegistry.abi>);
	return {registry, accounts};
}

let counter = 0;
describe('Executing on the registry', function () {
	it('Should be already deployed', async function () {
		const {registry, accounts} = await loadFixture(deploymentFixture);
		const gasPrice = await publicClient.getGasPrice();

		const data = encodeFunctionData({
			...registry,
			functionName: 'setMessage',
			args: ['hello', 1],
		});

		const txData = {
			type: '0x2',
			chainId: '0x7a69',
			to: registry.address,
			data,
		} as const;

		const gas = await publicClient.estimateGas({...txData, account: accounts.deployer});

		const txInfo = await executor.submitTransaction((++counter).toString(), accounts.deployer, {
			...txData,
			gas: `0x${gas.toString(16)}` as `0x${string}`,
			broadcastSchedule: [
				{
					duration: '0x1000',
					maxFeePerGas: `0x${gasPrice.toString(16)}` as `0x${string}`,
					maxPriorityFeePerGas: `0x${gasPrice.toString(16)}` as `0x${string}`,
				},
			],
		});

		console.log(txInfo);
	});
});
