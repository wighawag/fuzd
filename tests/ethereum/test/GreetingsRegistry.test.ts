import {expect, describe, it} from 'vitest';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {deployAll} from './utils';
import {Deployment} from 'rocketh';

describe('GreetingsRegistry', function () {
	it('Should be already deployed', async function () {
		const {env} = await await loadFixture(deployAll);

		const registry = env.deployments['GreetingsRegistry'] as Deployment<typeof env.artifacts.GreetingsRegistry.abi>;
		const prefix = await env.read(registry, {functionName: 'prefix'});
		expect(prefix).to.equal('');
	});

	it('basic test', async function () {
		const {env, GreetingsRegistry, otherAccounts} = await loadFixture(deployAll);
		const greetingToSet = 'hello world';
		const greeter = otherAccounts[0];
		await expect(
			(
				await env.read(GreetingsRegistry, {
					functionName: 'messages',
					args: [greeter],
				})
			).content,
		).to.equal('');

		await env.execute(GreetingsRegistry, {functionName: 'setMessage', args: [greetingToSet, 1], account: greeter});

		expect(
			(
				await env.read(GreetingsRegistry, {
					functionName: 'messages',
					args: [greeter],
				})
			).content,
		).to.equal(greetingToSet);
	});

	it('Should not be able to set message for other account', async function () {
		const {env, GreetingsRegistry, otherAccounts} = await loadFixture(deployAll);
		expect(
			env.execute(GreetingsRegistry, {
				functionName: 'setMessageFor',
				args: [otherAccounts[1], 'hello', 1],
				account: otherAccounts[0],
			}),
		).rejects.toThrowError();
	});
});
