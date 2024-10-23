import {test, expect} from 'vitest';
import {createProxiedJSONRPC} from 'remote-procedure-call';
import {Methods as StarknetMethods} from '@starknet-io/types-js';
import assert from 'assert';
import {RPC_URL} from './prool';
import {create_declare_transaction_v2, create_invoke_transaction_v1_from_calls, create_call} from 'strk';
import {encodeShortString, decodeShortString} from 'starknet-core/utils/shortString';
import {CallData} from 'starknet-core/utils/calldata';
import {
	getSelectorFromName,
	calculateContractAddressFromHash,
	computePoseidonHashOnElements,
	computePedersenHashOnElements,
	computePedersenHash,
} from 'starknet-core/utils/hash';
import {toHex} from 'starknet-core/utils/num';
import {starknetKeccak} from 'starknet-core/utils/hash';
import GreetingsRegistry from './ts-artifacts/GreetingsRegistry';
import {KATANA_CHAIN_ID, test_accounts, UniversalDeployerContract} from 'katana-rpc';
import {createTestExecutor} from '../ethereum/test/utils/executor';
import * as bip39 from '@scure/bip39';
import {HDKey} from '@scure/bip32';
import {initAccountFromHD} from 'remote-account';
import {StarknetChainProtocol} from 'fuzd-chain-protocol/starknet';

const rpc = createProxiedJSONRPC<StarknetMethods>(RPC_URL);

async function waitForTransaction(transaction_hash: string) {
	let txResponse = await rpc.starknet_getTransactionReceipt({transaction_hash});
	while (!(txResponse.success && txResponse.value.block_hash)) {
		txResponse = await rpc.starknet_getTransactionReceipt({transaction_hash});
	}
	return txResponse.value;
}

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
});

let contractAddress: string;
test('deploy_GreetingsRegistry', async function () {
	let prefix: string | [] = encodeShortString('');
	if (prefix == '0x') {
		// this should be handled by encodeShortString
		prefix = [];
	}
	const unique = true;
	const salt = 0;
	const invoke_transaction = create_invoke_transaction_v1_from_calls({
		chain_id: KATANA_CHAIN_ID,
		calls: [
			{
				//https://github.com/dojoengine/dojo/blob/main/crates/katana/contracts/universal_deployer.cairo
				contractAddress: UniversalDeployerContract.contract_address,
				entrypoint: 'deployContract',
				calldata: [GreetingsRegistry.class_hash, salt, unique, [prefix]],
			},
		],
		max_fee: '0xFFFFFFFFFFFFFFFFFF',
		nonce: '0x1',
		sender_address: test_accounts[0].contract_address,
		private_key: test_accounts[0].private_key,
	});
	const invokeResponse = await rpc.starknet_addInvokeTransaction({invoke_transaction});
	expect(invokeResponse.success).to.be.true;

	assert(invokeResponse.success);
	let receipt = await waitForTransaction(invokeResponse.value.transaction_hash);
	expect(receipt.execution_status).to.equals('SUCCEEDED');

	// const lastBlockResponse = await rpc.starknet_blockNumber();
	// assert(lastBlockResponse.success);
	// const keyFilter = [[toHex(starknetKeccak('ContractDeployed'))]];
	// const logsResponse = await rpc.starknet_getEvents({
	// 	filter: {
	// 		address: UniversalDeployerContract.contract_address,
	// 		chunk_size: 10,
	// 		from_block: {block_number: Math.max(lastBlockResponse.value - 9, 0)},
	// 		to_block: {block_number: lastBlockResponse.value},
	// 		keys: keyFilter,
	// 	},
	// });
	const logsResponse = await rpc.starknet_getEvents({
		filter: {
			address: UniversalDeployerContract.contract_address,
			chunk_size: 10,
		},
	});
	expect(logsResponse.success).to.be.true;
	assert(logsResponse.success);
	contractAddress = logsResponse.value.events[0].data[0];

	const expectedContractAddress = unique
		? calculateContractAddressFromHash(
				computePedersenHash(test_accounts[0].contract_address, salt),
				GreetingsRegistry.class_hash,
				[prefix],
				UniversalDeployerContract.contract_address,
			)
		: calculateContractAddressFromHash(salt, GreetingsRegistry.class_hash, [prefix], 0);
	expect(contractAddress).to.equals(expectedContractAddress);
});

test('invoke_GreetingsRegistry', async function () {
	const message = 'hello';
	const precallResponse = await rpc.starknet_call(
		create_call({
			contract_address: contractAddress,
			calldata: [test_accounts[0].contract_address],
			entry_point: 'lastGreetingOf',
		}),
	);
	expect(precallResponse.success).to.be.true;
	assert(precallResponse.success);

	// fix decodeShortString and encodeShortString for ""
	expect(precallResponse.value[0]).to.equals('0x0');

	const abi = JSON.parse(GreetingsRegistry.abi);
	const calldataParser = new CallData(abi);

	const messageAsFelt = encodeShortString(message);
	const invoke_transaction = create_invoke_transaction_v1_from_calls({
		chain_id: KATANA_CHAIN_ID,
		calls: [
			{
				contractAddress: contractAddress,
				entrypoint: 'setMessage',
				calldata: calldataParser.compile('setMessage', [message, 12]),
			},
		],
		max_fee: '0xFFFFFFFFFFFFFFFFFF',
		nonce: '0x2',
		sender_address: test_accounts[0].contract_address,
		private_key: test_accounts[0].private_key,
	});
	const invokeResponse = await rpc.starknet_addInvokeTransaction({invoke_transaction});
	expect(invokeResponse.success).to.be.true;
	assert(invokeResponse.success);
	let receipt = await waitForTransaction(invokeResponse.value.transaction_hash);
	expect(receipt.execution_status).to.equals('SUCCEEDED');

	const callResponse = await rpc.starknet_call(
		create_call({
			block_id: 'latest',
			contract_address: contractAddress,
			calldata: [test_accounts[0].contract_address],
			entry_point: 'lastGreetingOf',
		}),
	);
	expect(callResponse.success).to.be.true;
	assert(callResponse.success);

	expect(callResponse.value[0]).to.equals(messageAsFelt);
	expect(decodeShortString(callResponse.value[0])).to.equals(message);
});

test('invoke_GreetingsRegistry_via_fuzd', async function () {
	const message = 'yo!';
	const precallResponse = await rpc.starknet_call(
		create_call({
			contract_address: contractAddress,
			calldata: [test_accounts[0].contract_address],
			entry_point: 'lastGreetingOf',
		}),
	);
	expect(precallResponse.success).to.be.true;
	assert(precallResponse.success);

	// fix decodeShortString and encodeShortString for ""
	expect(precallResponse.value[0]).to.equals('0x0');

	const abi = JSON.parse(GreetingsRegistry.abi);
	const calldataParser = new CallData(abi);

	const messageAsFelt = encodeShortString(message);
	const invoke_transaction = create_invoke_transaction_v1_from_calls({
		chain_id: KATANA_CHAIN_ID,
		calls: [
			{
				contractAddress: contractAddress,
				entrypoint: 'setMessage',
				calldata: calldataParser.compile('setMessage', [message, 12]),
			},
		],
		max_fee: '0xFFFFFFFFFFFFFFFFFF',
		nonce: '0x2',
		sender_address: test_accounts[0].contract_address,
		private_key: test_accounts[0].private_key,
	});

	// TODO
	const paymentAccount = '0x0000000000000000000000000000000000000001';

	const defaultPath = "m/44'/60'/0'/0/0";
	const mnemonic: string = 'test test test test test test test test test test test junk';
	const seed = bip39.mnemonicToSeedSync(mnemonic);
	const masterKey = HDKey.fromMasterSeed(seed);
	const accountHDKey = masterKey.derive(defaultPath);
	const account = initAccountFromHD(accountHDKey);
	const {executor, publicExtendedKey} = await createTestExecutor({
		chainProtocols: {
			// TODO any
			[KATANA_CHAIN_ID]: new StarknetChainProtocol(
				RPC_URL,
				{
					accountContractClassHash: '0x', // TODO
					expectedFinality: 1,
					tokenContractAddress: '0x', // TOD
					worstCaseBlockTime: 1,
				},
				account,
			),
			// provider as any,
			// {
			// 	expectedFinality: 1,
			// 	worstCaseBlockTime: 3,
			// },
			// account,
		},
		paymentAccount,
		expectedWorstCaseGasPrices: [
			{
				chainId: '0x7a69',
				value: 0n,
			},
		],
	});

	const callResponse = await rpc.starknet_call(
		create_call({
			block_id: 'latest',
			contract_address: contractAddress,
			calldata: [test_accounts[0].contract_address],
			entry_point: 'lastGreetingOf',
		}),
	);
	expect(callResponse.success).to.be.true;
	assert(callResponse.success);

	expect(callResponse.value[0]).to.equals(messageAsFelt);
	expect(decodeShortString(callResponse.value[0])).to.equals(message);
});
