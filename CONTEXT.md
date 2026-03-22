# ZTB — Zero-Trust Bounties — Contexte Partagé

## Équipe
- Youssef Badry      : ZK & Rust Guest (zkVM RISC Zero)
- Ammar Bensliman    : Smart Contracts Solidity (Foundry)
- Zouhair Elghouate  : Frontend Next.js + Web3 (wagmi)
- Ahmed Belrhazi     : CI & Tests WASM (GitHub Actions)

École : EMSI — Ingénierie Informatique, option Cybersécurité
Année : 2025-2026

---

## C'est quoi ZTB

Un protocole de bug bounty décentralisé.
Un sponsor verrouille des USDT dans un smart contract.
Un hacker prouve qu'il a trouvé un exploit via une preuve zkVM
sans révéler son exploit. Le contrat paie automatiquement.
Zéro humain. Zéro confiance requise.

Stack : RISC Zero zkVM + wasmi 0.31 + Solidity + Next.js 14 + Sepolia

---

## Versions figées (NE PAS CHANGER)

wasmi           : 0.31.2
risc0-zkvm      : 5.0.0 (path local /home/azureuser/risc0/risc0/zkvm)
solidity        : ^0.8.24
next.js         : 14
wagmi           : v2
node            : 20

---

## IMAGE IDs

EXTRACTION_IMAGE_ID (Guest d'extraction — Sprint 1) :
[2062952722, 1514172728, 3666612992, 1964921325,
 4240132551, 3652829924, 1524893047, 3638279077]

PROOF_IMAGE_ID (Guest de preuve — Sprint 2) :
TBD — Youssef livrera en fin Sprint 2

ATTENTION : ces IDs seront gelés définitivement fin Sprint 3.
Toute modification du Guest après ce gel invalide tous les contrats.

---

## Format du journal d'extraction (9 champs)

Ce que le Guest d'extraction committe dans le receipt zkVM.
Ammar doit decoder ces champs dans createBounty() pour vérifier
que le receipt est valide.

Position | Nom                | Type    | Description
---------|--------------------|---------|---------------------------------
0        | expected_cid       | bytes32 | SHA256 du WASM cible
1        | props_hash         | bytes32 | SHA256 des assertions extraites
2        | density            | uint32  | nombre d'assertions uniques
3        | total_transitions  | uint32  | transitions WASM possibles
4        | hash_a             | bytes32 | SHA256 du bitmap baseline A
5        | hash_b             | bytes32 | SHA256 du bitmap baseline B
6        | merkle_a           | bytes32 | Merkle root bitmap A
7        | merkle_b           | bytes32 | Merkle root bitmap B
8        | domain             | uint8   | 0=FINANCIAL 1=ACCESS 2=GENERAL

---

## Format du journal de preuve (15 champs)

Ce que le Guest de preuve committe. Ammar en a besoin pour
submitProof(). Youssef livrera le format exact en fin Sprint 2.

Position | Nom               | Type    | Description
---------|-------------------|---------|---------------------------------
0        | expected_cid      | bytes32 | SHA256 WASM vérifié
1        | domain            | uint8   | domaine
2        | props_hash        | bytes32 | hash assertions
3        | baseline_hash_a   | bytes32 | hash baseline A
4        | baseline_hash_b   | bytes32 | hash baseline B
5        | config_hash       | bytes32 | hash FinancialConfig
6        | payload_hash      | bytes32 | SHA256 du payload
7        | payload_length    | uint32  | longueur du payload
8        | c1a               | bool    | trap atteint
9        | c1b               | bool    | transition valid->invalid
10       | c2                | bool    | axiome de domaine violé
11       | c3                | bool    | nouvelles transitions
12       | total_new         | uint32  | nb nouvelles transitions
13       | mode              | uint8   | 0=STRICT 1=RELAXED
14       | verdict_layer     | bytes8  | "TRAP", "VALIDATE" ou "DOMAIN"

---

## Oracle tri-couche — logique ZK (pas dans le contrat)

C1 = assertions embarquées dans le WASM
     C1a : trap atteint (assert!/require!/panic!)
     C1b : ztb_validate_state() passe de 1 à 0 (opt-in)
C2 = axiomes de domaine hardcodés dans le Guest
     FINANCIAL : conservation de valeur + FinancialConfig
     ACCESS    : isolation des rôles
     GENERAL   : intégrité du flux de contrôle (CFI)
C3 = dual bitmap AFL 8KB x2
     seuil absolu >= 4 nouvelles transitions
     ratio >= 2% (arithmétique entière, pas de f32)

VERDICT :
  Mode STRICT  : (C1 OR C2) AND C3 → 100% reward
  Mode RELAXED : (C1 OR C2)        → 70%  reward (rewardFloor)
  Mode RELAXED : (C1 OR C2) AND C3 → 100% reward

---

## Invariants de sécurité critiques (pour Ammar)

INV-9  : commitment = keccak256(address || sha256(payload) || nonce)
INV-10 : stake = BASE(0.1 ETH) * 2^n + (length/100 * 0.001 ETH)
          slash automatique si no-show après 72h
INV-11 : require(block.timestamp >= proofsOpenAt)
          proofsOpenAt = createdAt + 96 hours
INV-12 : nonReentrant + safeTransfer dans la même TX
INV-14 : FinancialConfig : max 8 indices, delta <= 20% état initial
INV-15 : dual bitmap A (hash AFL) + B (hash Knuth)

---

## Structure des repos

ztb-zkvm/          → Youssef (Rust, RISC Zero Guest)
ztb-contracts/     → Ammar  (Solidity, Foundry)
ztb-frontend/      → Zouhair (Next.js, wagmi)
ztb-tests/         → Ahmed  (WAT, GitHub Actions)

---

## État des livrables

Sprint 0 — COMPLET
  [x] Youssef : wasmi 0.31 + Fuel API validé dans Guest RISC Zero
  [x] Youssef : Hello World zkVM prouvé (add(2,3)=5)
  [x] Youssef : StepLimiter Fuel mesuré (5 steps)

Sprint 1 — EN COURS
  [x] Youssef : Guest d'extraction complet (wasmparser, assertions, dual baseline)
  [x] Youssef : Journal 9 champs validé, EXTRACTION_IMAGE_ID confirmé
  [ ] Ammar   : ZTBEscrow.sol (createBounty, commitProof, submitProof)
  [ ] Zouhair : Page Sponsor + WalletConnect + ECIES
  [ ] Ahmed   : 5 bancs d'essai WASM + pipeline CI

Sprint 2 — À VENIR
  [ ] Youssef : Guest de preuve (dual bitmap AFL, C1/C2/C3, Groth16)
  [ ] Ammar   : submitProof() finalisé avec IRiscZeroVerifier
  [ ] Zouhair : Page Hacker + upload IPFS
  [ ] Ahmed   : Benchmarks overhead + CI complète

Sprint 3 — GEL
  [ ] GEL DÉFINITIF GUEST_IMAGE_ID — communiqué à toute l'équipe
  [ ] Déploiement Sepolia

---

## Règle de collaboration

1. Chaque membre copie ce fichier au début de sa session Claude
2. Chaque membre met à jour ce fichier quand il livre quelque chose
3. Les interfaces entre modules (format journal, ABI) sont décidées
   par les deux membres concernés ensemble — pas par Claude seul
4. Point de sync hebdomadaire 30 min — ce fichier est l'ordre du jour