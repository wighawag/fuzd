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
import {deriveRemoteAddress} from 'remote-account';
import {initExecutorGateway} from 'dreveal-executor-gateway';

const time = initTime();

const {executor, publicExtendedKey} = createTestExecutor({
	chainId: '31337',
	finality: 1,
	worstCaseBlockTime: 2,
	provider: network.provider as EIP1193ProviderWithoutEvents,
	time,
});

const executorGateway = initExecutorGateway(executor);

async function deploymentFixture() {
	const {deployments, accounts} = await loadAndExecuteDeployments({
		provider: network.provider as any,
	});
	const registry = contract(deployments['Registry'] as Deployment<typeof artifacts.GreetingsRegistry.abi>);
	return {registry, accounts};
}

let counter = 0;
describe('Executing on the registry', function () {
	it('Should execute without issues', async function () {
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

		const json = JSON.stringify({
			...txData,
			gas: `0x${gas.toString(16)}` as `0x${string}`,
			broadcastSchedule: [
				{
					duration: '0x2000',
					maxFeePerGas: `0x${gasPrice.toString(16)}` as `0x${string}`,
					maxPriorityFeePerGas: `0x${gasPrice.toString(16)}` as `0x${string}`,
				},
			],
		});
		const signature = await walletClient.signMessage({message: json, account: user});
		const txInfo = await executorGateway.submitTransactionAsJsonString((++counter).toString(), json, signature);

		expect(txInfo.isVoidTransaction).to.be.false;
		expect((await registry.read.messages([user])).content).to.equal('hello');
	});
});
