import {Deployment, loadEnvironment} from 'rocketh';
import {context} from '../deploy/_context';
import {network} from 'hardhat';
import {EIP1193ProviderWithoutEvents} from 'eip-1193';

async function main() {
	const env = await loadEnvironment(
		{
			provider: network.provider as EIP1193ProviderWithoutEvents,
		},
		context,
	);

	const args = process.argv.slice(2);
	const account = (args[0] || process.env.ACCOUNT) as String0x;
	const Registry = env.deployments.Registry as Deployment<typeof context.artifacts.GreetingsRegistry.abi>;
	const message = await env.read(Registry, {functionName: 'messages', args: [account]});

	console.log({account, message});
}
main();
