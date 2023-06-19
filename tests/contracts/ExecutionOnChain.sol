// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import 'solidity-proxy/src/Proxied.sol';

/// @notice a registry that let user send greetings to the world
///  It is used as a demo for jolly-roger,
///  a fully featured SDK to build entirely decentralised apps and games
///  It is inteded to be deployed via upgradeable proxy locally
///  to showcase the HCR (Hot Contract Replacement) capabilities of `hardhat-deploy`
///  but immutable on live networks.
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