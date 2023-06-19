import {execute} from 'rocketh';
import 'rocketh-deploy-proxy';
import {context} from './_context';

export default execute(
	context,
	async ({deployViaProxy, accounts, artifacts}) => {
		await deployViaProxy(
			'ExecutionOnChain',
			{
				account: accounts.deployer,
				artifact: artifacts.ExecutionOnChain,
			},
			{
				owner: accounts.deployer,
			}
		);
	},
	{tags: ['ExecutionOnChain', 'ExecutionOnChain_deploy']}
);
