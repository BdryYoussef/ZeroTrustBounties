import { expect } from "chai";
import pkg from "hardhat";
const { ethers } = pkg;

describe("ZTBEscrow Test d'Integration", function () {
  it("Devrait deploier le contract ZTBEscrow et verifier les invariants", async function () {
    const [owner, sponsor, hunter] = await ethers.getSigners();
    
    // 1. Paramètres factices pour le test local
    const mockUsdtToken = ethers.Wallet.createRandom().address;
    const mockRiscZeroVerifier = ethers.Wallet.createRandom().address;
    const mockImageId = ethers.randomBytes(32);

    // 2. Déploiement Local
    const ZTBEscrowFactory = await ethers.getContractFactory("ZTBEscrow");
    const contract = await ZTBEscrowFactory.deploy(mockUsdtToken, mockRiscZeroVerifier, mockImageId);
    
    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();

    expect(contractAddress).to.not.be.undefined;
    console.log("    ✅ Contrat déployé avec succès sur Hardhat Local Network à l'adresse:", contractAddress);

    // 3. Test de calcul de penalty INV-10
    const payloadLength = 500;
    const requiredStake = await contract.computeRequiredStake(0, payloadLength);
    // 0.01 ether base + (5 * 0.001 ether) = 0.015
    expect(requiredStake).to.equal(ethers.parseEther("0.015"));
    console.log("    ✅ Invariant Anti-Spam INV-10 Vérifié: Stake Requis est correct:", ethers.formatEther(requiredStake), "ETH");
  });
});
