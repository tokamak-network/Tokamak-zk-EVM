// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {VerifierV1} from "../src/VerifierV1.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        VerifierV1 verifier = new VerifierV1();
        
        vm.stopBroadcast();
        
    }
}