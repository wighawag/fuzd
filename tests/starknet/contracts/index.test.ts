import {test, expect} from 'vitest';
import {createProxiedJSONRPC} from 'remote-procedure-call';
import {Methods as StarknetMethods} from '@starknet-io/types-js';
import assert from 'assert';
import {RPC_URL} from './prool';

const KATANA_CHAIN_ID = '0x4b4154414e41';
const rpc = createProxiedJSONRPC<StarknetMethods>(RPC_URL);

test('starknet_chainId', async function () {
	const chainIdResponse = await rpc.starknet_chainId();
	expect(chainIdResponse.success).to.be.true;
	assert(chainIdResponse.success);
	expect(chainIdResponse.value).to.equal(KATANA_CHAIN_ID);
});
