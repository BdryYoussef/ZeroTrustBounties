// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ZTBEscrowUpgradeable} from "../contracts/ZTBEscrowUpgradeable.sol";

contract DeployZTB is Script {
    function run() external returns (address proxyAddress) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Example mock configuration for Sepolia
        address mockUSDT = 0x7169D38820dfd117C3FA1f22a697dBA58d90BA06; 
        address mockVerifier = 0x0000000000000000000000000000000000000000;
        bytes32 mockImageId = keccak256("MOCK_IMAGE_ID");

        address admin = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy the implementation contract
        console2.log("Deploying implementation contract...");
        ZTBEscrowUpgradeable implementation = new ZTBEscrowUpgradeable();
        console2.log("Implementation deployed at:", address(implementation));

        // 2. Encode the initialization data
        bytes memory initData = abi.encodeCall(
            implementation.initialize,
            (mockUSDT, mockVerifier, mockImageId, admin)
        );

        // 3. Deploy the proxy pointing to the implementation and initialize it
        console2.log("Deploying ERC1967Proxy...");
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        proxyAddress = address(proxy);
        
        console2.log("Proxy deployed at:", proxyAddress);
        console2.log("Proxy correctly initialized with UUPS Upgradeable settings.");

        vm.stopBroadcast();
    }
}
