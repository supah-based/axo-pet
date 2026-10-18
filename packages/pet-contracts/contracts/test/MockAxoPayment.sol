// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockAxoPayment is ERC20 {
    constructor() ERC20("AXO Test Payment", "tAXO") {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}
