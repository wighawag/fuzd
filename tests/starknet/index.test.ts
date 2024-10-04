import {test, expect} from 'vitest';
import {createProxiedJSONRPC} from 'remote-procedure-call';
import {Methods as StarknetMethods} from '@starknet-io/types-js';
import assert from 'assert';
import {RPC_URL} from './prool';
import {create_declare_transaction_v2, create_invoke_transaction_v1_from_calls} from 'strk';
import GreetingsRegistry from './ts-artifacts/GreetingsRegistry';
import {KATANA_CHAIN_ID, test_accounts, UniversalDeployerContract} from './katana';

const rpc = createProxiedJSONRPC<StarknetMethods>(RPC_URL);

test('starknet_chainId', async function () {
	const chainIdResponse = await rpc.starknet_chainId();
	expect(chainIdResponse.success).to.be.true;
	assert(chainIdResponse.success);
	expect(chainIdResponse.value).to.equal(KATANA_CHAIN_ID);
});

test('declare_GreetingsRegistry', async function () {
	const declare_transaction = create_declare_transaction_v2({
		chain_id: KATANA_CHAIN_ID,
		contract: GreetingsRegistry,
		max_fee: '0xFFFFFFFFFFFFFFFFFF',
		nonce: '0x0',
		sender_address: test_accounts[0].contract_address,
		private_key: test_accounts[0].private_key,
	});
	const chainIdResponse = await rpc.starknet_addDeclareTransaction({declare_transaction});
	expect(chainIdResponse.success).to.be.true;
	assert(chainIdResponse.success);
});

test('deploy_GreetingsRegistry', async function () {
	const invoke_transaction = create_invoke_transaction_v1_from_calls({
		chain_id: KATANA_CHAIN_ID,
		calls: [
			{
				contractAddress: UniversalDeployerContract.contract_address,
				entrypoint: 'deployContract',
				calldata: [GreetingsRegistry.class_hash, 0, true, []],
			},
		],
		max_fee: '0xFFFFFFFFFFFFFFFFFF',
		nonce: '0x1',
		sender_address: test_accounts[0].contract_address,
		private_key: test_accounts[0].private_key,
	});
	const chainIdResponse = await rpc.starknet_addInvokeTransaction({invoke_transaction});
	expect(chainIdResponse.success).to.be.true;
	assert(chainIdResponse.success);
});
