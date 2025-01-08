import {test, expect} from 'vitest';
import {createProxiedJSONRPC} from 'remote-procedure-call';
import {Methods as StarknetMethods} from '@starknet-io/types-js';
import assert from 'assert';
import {RPC_URL} from './prool';
import {
	create_declare_transaction_v2,
	create_invoke_transaction_v1_from_calls,
	create_call,
	create_invoke_transaction_intent_v1_from_calls,
	create_invoke_transaction_v1_from_calls_with_abi,
} from 'strk';
import {encodeShortString, decodeShortString} from 'starknet-core/utils/shortString';
import {CallData} from 'starknet-core/utils/calldata';
import {calculateContractAddressFromHash, computePedersenHash} from 'starknet-core/utils/hash';
import GreetingsRegistry from './ts-artifacts/GreetingsRegistry';
import {KATANA_CHAIN_ID, test_accounts, UniversalDeployerContract, ETHTokenContract} from 'katana-rpc';
import {createTestExecutor} from '../ethereum/test/utils/executor';
import {mnemonicToSeedSync} from '@scure/bip39';
import {HDKey} from '@scure/bip32';
import {initAccountFromHD} from 'remote-account';
import {AllowedTransactionData, StarknetChainProtocol} from 'fuzd-chain-protocol/starknet';
import AccountContract from 'strk-account';
import ERC20ABI from './abis/ERC20';
import {String0x} from '../../packages/common/dist/esm/types';

const rpc = createProxiedJSONRPC<StarknetMethods>(RPC_URL);

const chainId = KATANA_CHAIN_ID;

async function waitForTransaction(transaction_hash: string) {
	let txResponse = await rpc.starknet_getTransactionReceipt({transaction_hash});
	while (!(txResponse.success && txResponse.value.block_hash)) {
		txResponse = await rpc.starknet_getTransactionReceipt({transaction_hash});
	}
	return txResponse.value;
}

let counter = 0;

test('starknet_chainId', async function () {
	const chainIdResponse = await rpc.starknet_chainId();
	expect(chainIdResponse.success).to.be.true;
	assert(chainIdResponse.success);
	expect(chainIdResponse.value).to.equal(chainId);
});

test('declare_Account', async function () {
	const declare_transaction = create_declare_transaction_v2({
		chain_id: chainId,
		contract: AccountContract,
		max_fee: '0xFFFFFFFFFFFFFF',
		nonce: '0x0',
		sender_address: test_accounts[0].contract_address,
		private_key: test_accounts[0].private_key,
	});
	const declareResponse = await rpc.starknet_addDeclareTransaction({declare_transaction});
	expect(declareResponse.success).to.be.true;
	assert(declareResponse.success);
	expect(declareResponse.value.class_hash).toEqual(`0x1a030827d5dda407c098f8cfc7dde025460c44202eeb487c55c89d70829fc8e`);
});

test('declare_GreetingsRegistry', async function () {
	const declare_transaction = create_declare_transaction_v2({
		chain_id: chainId,
		contract: GreetingsRegistry,
		max_fee: '0xFFFFFFFFFFFFFF',
		nonce: '0x1',
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
		chain_id: chainId,
		calls: [
			{
				//https://github.com/dojoengine/dojo/blob/main/crates/katana/contracts/universal_deployer.cairo
				contractAddress: UniversalDeployerContract.contract_address,
				entrypoint: 'deployContract',
				calldata: [GreetingsRegistry.class_hash, salt, unique, [prefix]],
			},
		],
		max_fee: '0xFFFFFFFFFFFFFF',
		nonce: '0x2',
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
		chain_id: chainId,
		calls: [
			{
				contractAddress: contractAddress,
				entrypoint: 'setMessage',
				calldata: calldataParser.compile('setMessage', [message, 12]),
			},
		],
		max_fee: '0xFFFFFFFFFFFFFF',
		nonce: '0x3',
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
			calldata: [test_accounts[1].contract_address],
			entry_point: 'lastGreetingOf',
		}),
	);
	expect(precallResponse.success).to.be.true;
	assert(precallResponse.success);

	// fix decodeShortString and encodeShortString for ""
	expect(precallResponse.value[0]).to.equals('0x0');

	// TODO
	const paymentAccount = '0x0000000000000000000000000000000000000001';

	const defaultPath = "m/44'/60'/0'/0/0";
	const mnemonic: string = 'test test test test test test test test test test test junk';
	const seed = mnemonicToSeedSync(mnemonic);
	const masterKey = HDKey.fromMasterSeed(seed);
	const accountHDKey = masterKey.derive(defaultPath);
	const account = initAccountFromHD(accountHDKey);
	const {executor, publicExtendedKey} = await createTestExecutor({
		serverAccount: account,
		chainProtocols: {
			// TODO any
			[chainId]: new StarknetChainProtocol(RPC_URL, {
				accountContractClassHash: AccountContract.class_hash,
				expectedFinality: 1,
				tokenContractAddress: ETHTokenContract.contract_address as String0x,
				worstCaseBlockTime: 1,
			}),
		},
		paymentAccount,
		expectedWorstCaseGasPrices: [
			{
				chainId,
				value: 0n,
			},
		],
	});

	const user = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
	const remoteAccountInfo = await executor.getRemoteAccount(chainId, user);
	const serviceParameters = remoteAccountInfo.serviceParameters;
	const remoteAccount = remoteAccountInfo.address;
	// TODO test payment account on starknet
	// const paymenetAccountBroadcasterInfo = await executor.getBroadcaster(chainId, paymentAccount);
	// const paymentAccountBroadcaster = paymenetAccountBroadcasterInfo.address;

	// --------------------------------------------------------------------------------------------
	// SENT ETH
	// --------------------------------------------------------------------------------------------
	const senderNonceResponse = await rpc.starknet_getNonce({
		block_id: 'latest',
		contract_address: test_accounts[0].contract_address,
	});
	assert(senderNonceResponse.success);
	console.log(`nonce: ${senderNonceResponse.value}`);
	const send_transaction = create_invoke_transaction_v1_from_calls_with_abi({
		chain_id: KATANA_CHAIN_ID,
		calls: [
			{
				abi: ERC20ABI,
				contractAddress: ETHTokenContract.contract_address,
				entrypoint: 'transfer',
				args: [remoteAccount, 1000000000000000000000n],
			},
		],
		max_fee: 10000000000000000n,
		nonce: senderNonceResponse.value,
		sender_address: test_accounts[0].contract_address,
		private_key: test_accounts[0].private_key,
	});
	const sendResponse = await rpc.starknet_addInvokeTransaction({
		invoke_transaction: send_transaction,
	});
	if (!sendResponse.success) {
		console.error('send_eth failed', sendResponse.error);
	}
	expect(sendResponse.success).to.be.true;
	assert(sendResponse.success);
	let receipt = await waitForTransaction(sendResponse.value.transaction_hash);
	if (receipt.execution_status !== 'SUCCEEDED') {
		console.error('send_eth receipt', receipt);
	}
	expect(receipt.execution_status).to.equals('SUCCEEDED');
	// --------------------------------------------------------------------------------------------

	const abi = JSON.parse(GreetingsRegistry.abi);
	const calldataParser = new CallData(abi);

	const messageAsFelt = encodeShortString(message);
	const intent = create_invoke_transaction_intent_v1_from_calls({
		chain_id: chainId,
		calls: [
			{
				contractAddress: contractAddress,
				entrypoint: 'setMessage',
				calldata: calldataParser.compile('setMessage', [message, 12]),
			},
		],
		max_fee: '0xFFFFFFFFFFFFFF',
		nonce: '0x3', // not used
		sender_address: test_accounts[0].contract_address, // not used
	});

	const transaction: AllowedTransactionData = {
		type: 'INVOKE',
		version: '0x1',
		calldata: intent.data.calldata,
		max_fee: '0xFFFFFFFFFFFFFF',
	};

	// account is ethereum account, right ?
	const txInfo = await executor.broadcastExecution(
		(++counter).toString(),
		0,
		user,
		{
			chainId,
			transaction,
			maxFeePerGasAuthorized: `0xFFFFF` as String0x,
		},
		serviceParameters,
	);

	expect(txInfo.slotAlreadyUsed).to.be.undefined;

	console.log(`txInfo`, txInfo);

	await waitForTransaction(txInfo.hash);

	const callResponse = await rpc.starknet_call(
		create_call({
			block_id: 'latest',
			contract_address: contractAddress,
			calldata: [remoteAccount],
			entry_point: 'lastGreetingOf',
		}),
	);
	expect(callResponse.success).to.be.true;
	assert(callResponse.success);

	expect(callResponse.value[0]).to.equals(messageAsFelt);
	expect(decodeShortString(callResponse.value[0])).to.equals(message);
});
