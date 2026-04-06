import hre from "hardhat";
const { ethers } = hre;

async function main() {
  console.log("=== Début du test de validation ZTBEscrow ===");

  const [owner] = await ethers.getSigners();
  
  // 1. Paramètres factices
  const mockUsdtToken = ethers.Wallet.createRandom().address;
  const mockRiscZeroVerifier = ethers.Wallet.createRandom().address;
  const mockImageId = ethers.randomBytes(32);

  console.log("-> Déploiement en cours...");
  // 2. Déploiement Local
  const ZTBEscrowFactory = await ethers.getContractFactory("ZTBEscrow");
  const contract = await ZTBEscrowFactory.deploy(mockUsdtToken, mockRiscZeroVerifier, mockImageId);
  
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  if (contractAddress) {
    console.log("    ✅ Contrat déployé avec succès à l'adresse:", contractAddress);
  } else {
    throw new Error("Échec du déploiement !");
  }

  // 3. Test de calcul de penalty INV-10
  console.log("-> Test de l'Invariant INV-10 (Compute Required Stake)...");
  const payloadLength = 500;
  const requiredStake = await contract.computeRequiredStake(0, payloadLength);
  
  // 0.01 ether base + (5 * 0.001 ether) = 0.015
  const expectedStake = ethers.parseEther("0.015");
  if (requiredStake === expectedStake) {
    console.log("    ✅ Invariant Anti-Spam INV-10 Vérifié: Stake Requis est correct:", ethers.formatEther(requiredStake), "ETH");
  } else {
    throw new Error("L'invariant INV-10 a retourné une mauvaise valeur.");
  }

  console.log("=== Tous les tests sont passés avec succès ! ===");
}

main().catch((error) => {
  console.error("Erreur lors de l'exécution:", error);
  process.exitCode = 1;
});
