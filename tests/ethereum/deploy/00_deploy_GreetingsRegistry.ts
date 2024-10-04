import {execute} from 'rocketh';
import '@rocketh/deploy-proxy';
import {context} from './_context';

export default execute(
	context,
	async ({deployViaProxy, namedAccounts, artifacts}) => {
		const contract = await deployViaProxy(
			'GreetingsRegistry',
			{
				account: namedAccounts.deployer,
				artifact: artifacts.GreetingsRegistry,
				args: [''],
			},
			{
				owner: namedAccounts.deployer,
			},
		);
	},
	{tags: ['GreetingsRegistry', 'GreetingsRegistry_deploy']},
);
