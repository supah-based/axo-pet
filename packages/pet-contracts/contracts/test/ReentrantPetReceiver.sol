// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @dev Test-only receiver that attempts a caller-selected pet reentry during safe mint.
contract ReentrantPetReceiver is IERC721Receiver {
    address private _pet;
    bytes private _reentryData;
    bool public reentrySucceeded;

    function executeMint(address pet, bytes calldata mintData, bytes calldata reentryData) external {
        _pet = pet;
        _reentryData = reentryData;
        (bool success, bytes memory returnData) = pet.call(mintData);
        if (!success) {
            assembly ("memory-safe") {
                revert(add(returnData, 0x20), mload(returnData))
            }
        }
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        (reentrySucceeded,) = _pet.call(_reentryData);
        return IERC721Receiver.onERC721Received.selector;
    }
}
