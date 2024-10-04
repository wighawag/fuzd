// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import 'solidity-proxy/solc_0_8/ERC1967/Proxied.sol';

contract ExecutionOnChain is Proxied {

    event ExecutionSubmitted(ScheduledExecution execution);

    struct AccessListEntry {
        address addr;
        bytes32[] storageKeys;
    }

    struct BroadcastSchedule {
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        uint256 duration;
    }

    struct ScheduledExecution {
        address to;
        uint256 gas;
        bytes data;
        uint8 transactionType;
        uint256 chainId;
        AccessListEntry[] accessList;
        BroadcastSchedule[] schedule;
    }
    function execute(ScheduledExecution calldata execution) external {
        emit ExecutionSubmitted(execution);
    }

}