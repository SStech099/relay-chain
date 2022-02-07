// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract XRC20Token is ERC20,Ownable{

    constructor() ERC20("Test2 Token","Test2") Ownable(){}

    function mint(address _address,uint _amount) external onlyOwner() {
        _mint(_address,_amount);
    }

    function burn(address _address,uint _amount) external onlyOwner() {
        _burn(_address,_amount);
    }

}