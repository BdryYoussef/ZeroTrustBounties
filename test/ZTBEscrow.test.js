const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ZTBEscrow", function () {
  it("Should deploy the ZTBEscrow smart contract", async function () {
    const [owner, sponsor, hunter] = await ethers.getSigners();
    
    // 1. Setup mock parameters generated purely via ethers utility
    const mockUsdtToken = ethers.Wallet.createRandom().address;
    const mockRiscZeroVerifier = ethers.Wallet.createRandom().address;
    const mockImageId = ethers.randomBytes(32);

    // 2. Deploy Contract Instance locally
    const ZTBEscrowFactory = await ethers.getContractFactory("ZTBEscrow");
    const contract = await ZTBEscrowFactory.deploy(mockUsdtToken, mockRiscZeroVerifier, mockImageId);
    
    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();

    // 3. Simple basic verification of local genesis block presence
    expect(contractAddress).to.not.be.undefined;
    
    console.log("    ✅ ZTBEscrow successfully instantiated at:", contractAddress);

    // 4. Invariant Test (INV-10 / Protocol Sybil protection computation check)
    const payloadLength = 500;
    const requiredStake = await contract.computeRequiredStake(0, payloadLength);
    // Base 0.01 + (5 * 0.001) = 0.015 ether total cost required for a commitment payload of this size
    expect(requiredStake).to.equal(ethers.parseEther("0.015"));
    console.log("    ✅ INV-10 Exponential Stake verified => Penalty requirement:", ethers.formatEther(requiredStake), "ETH computed");
  });
});
