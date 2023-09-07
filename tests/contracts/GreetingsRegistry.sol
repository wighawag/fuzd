// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import 'solidity-proxy/solc_0.8/EIP1967/Proxied.sol';

/// @notice a registry that let user send greetings to the world
///  It is used as a demo for jolly-roger,
///  a fully featured SDK to build entirely decentralised apps and games
///  It is inteded to be deployed via upgradeable proxy locally
///  to showcase the HCR (Hot Contract Replacement) capabilities of `hardhat-deploy`
///  but immutable on live networks.
contract GreetingsRegistry is Proxied {
	// ----------------------------------------------------------------------------------------------
	// EVENTS
	// ----------------------------------------------------------------------------------------------
	/// @notice emitted whenever a user set a new greeting to the world
	/// @param user the user that send the message
	/// @param timestamp the time at which the message was recorded
	/// @param message the message content
	/// @param dayTimeInSeconds the time of the day in seconds where 00:00 => 0 and 23:59 => 82859
	/// @dev the timestamp is included to speedup indexing
	/// see: https://ethereum-magicians.org/t/proposal-for-adding-blocktimestamp-to-logs-object-returned-by-eth-getlogs-and-related-requests/11183
	event MessageChanged(address indexed user, uint256 timestamp, string message, uint24 dayTimeInSeconds);

	/// @notice emitted whenever a user delegate the right to set a message to another account
	/// @param user the user that delegate its rights
	/// @param delegated address that will be able to set message if delegated
	/// @param yes whether to delegate or revoke
	event Delegated(address indexed user, address indexed delegated, bool yes);

	// ----------------------------------------------------------------------------------------------
	// TYPES
	// ----------------------------------------------------------------------------------------------
	struct Message {
		string content;
		uint256 timestamp;
		uint24 dayTimeInSeconds;
	}

	// ----------------------------------------------------------------------------------------------
	// STORAGE
	// ----------------------------------------------------------------------------------------------
	mapping(address => Message) internal _messages;
	string internal _prefix;
	mapping(address => mapping(address => bool)) internal _delegates;

	// ----------------------------------------------------------------------------------------------
	// CONSTRUCTOR / INITIALIZER
	// ----------------------------------------------------------------------------------------------

	/// @dev constructors
	/// @param initialPrefix the prefix that will be prepended to every user message goig forward
	constructor(string memory initialPrefix) {
		// the proxied modifier from `hardhat-deploy` (see `postUpgrade` function)
		//  ensure postUpgrade effect can only be used once when the contract is deployed without proxy.
		//  by calling that function in the constructor
		//  we ensure the contract behave the same whether it is deployed through a proxy or not.
		//  when the contract is deployed without proxy, the postUpgrade can never be called
		postUpgrade(initialPrefix);
	}

	//
	/// @dev called by the admin when the contract is deployed as a proxy
	/// @param initialPrefix the prefix that will be prepended to every user message goig forward
	function postUpgrade(string memory initialPrefix) public proxied {
		_prefix = initialPrefix;
	}

	// ----------------------------------------------------------------------------------------------
	// PUBLIC INTERFACE
	// ----------------------------------------------------------------------------------------------

	/// @notice return the last message from the given `user`.
	/// @param user address of the user.
	/// @return userMsg the message send by the user.
	function messages(address user) external view returns (Message memory userMsg) {
		userMsg = _messages[user];
	}

	/// @notice return the last greeting message from the given `user`.
	/// @param user address of the user.
	/// @return greeting the message's content send by the user.
	function lastGreetingOf(address user) external view returns (string memory greeting) {
		greeting = _messages[user].content;
	}

	/// @notice return the prefix that is appended to any new message.
	/// @return value prefix string.
	function prefix() external view returns (string memory value) {
		return _prefix;
	}

	/// @notice set a new message for `msg.sender`.
	/// @param message the value to set as content.
	/// @param dayTimeInSeconds the time of the day in seconds the message was written.
	function setMessage(string calldata message, uint24 dayTimeInSeconds) external {
		_setMessageFor(msg.sender, message, dayTimeInSeconds);
	}

	/// @notice set a new message for `msg.sender`.
	/// @param account address which will have its greetings set
	/// @param message the value to set as content.
	/// @param dayTimeInSeconds the time of the day in seconds the message was written.
	function setMessageFor(address account, string calldata message, uint24 dayTimeInSeconds) external {
		require(msg.sender == account || _delegates[account][msg.sender], 'NOT_AUTHORIZED');
		_setMessageFor(account, message, dayTimeInSeconds);
	}

	/// @notice delegate the right to set message to another account
	/// @param to address which will be given the right to delegate
	/// @param yes whether to give the right or revoke it
	function delegate(address payable to, bool yes) external payable{
		to.transfer(msg.value);
		_delegates[msg.sender][to] = yes;
		emit Delegated(msg.sender, to, yes);
	}

	/// @notice return whether an account has right to set message on behalf of another
	/// @param account address being queried
	/// @param delegated the account which has right to set message
	/// @return yes whether `delegated` has the right to set message
	function isDelegate(address account, address delegated) external view returns (bool yes){
		return _delegates[account][delegated];
	}

	// ----------------------------------------------------------------------------------------------
	// INTERNAL
	// ----------------------------------------------------------------------------------------------

	function _setMessageFor(address account, string calldata message, uint24 dayTimeInSeconds) internal {
		string memory actualMessage = string(bytes.concat(bytes(_prefix), bytes(message)));
		_messages[account] = Message({
			content: actualMessage,
			timestamp: block.timestamp,
			dayTimeInSeconds: dayTimeInSeconds
		});
		emit MessageChanged(account, block.timestamp, actualMessage, dayTimeInSeconds);
	}
}
