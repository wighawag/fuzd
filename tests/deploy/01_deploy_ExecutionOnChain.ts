import {execute} from 'rocketh';
import '@rocketh/deploy-proxy';
import {context} from './_context';

export default execute(
	context,
	async ({deployViaProxy, namedAccounts, artifacts}) => {
		await deployViaProxy(
			'ExecutionOnChain',
			{
				account: namedAccounts.deployer,
				artifact: artifacts.ExecutionOnChain,
			},
			{
				owner: namedAccounts.deployer,
			},
		);
	},
	{tags: ['ExecutionOnChain', 'ExecutionOnChain_deploy']},
);
