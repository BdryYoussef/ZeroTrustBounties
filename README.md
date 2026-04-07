# 🛡️ Zero Trust Bounties (ZTB) — Unified Stack

**Zero Trust Bounties (ZTB)** est le premier framework de sécurité décentralisé permettant la vérification de failles logiques de manière confidentielle grâce aux preuves à divulgation nulle de connaissance (**ZK-SNARKs**).

Cette plateforme de niveau professionnel unifie le flux **Sponsor** (Création de primes) et le flux **Hacker** (Chasse à l'exploit) au sein d'une seule application web interactive et sécurisée.

---

## 🎨 Design System & Esthétique
L'application repose sur une interface **Premium Glassmorphism** :
- **Rich Aesthetics** : Panneaux translucides floutés, dégradés vibrants et contrastes OLED.
- **Micro-Animations** : Effets de survol (`hover`), notifications d'état et transitions fluides entre onglets.
- **Typographie Moderne** : Utilisation de polices hybrides Monospace/Sans-serif pour un aspect Cyber-Web3.

---

## 🔥 Fonctionnalités Clefs

### 🏢 Portail Sponsor (Créateur)
- **Wizard en 7 étapes** : De l'upload du binaire WASM à la mise sous séquestre des fonds USDT.
- **Oracle de Couverture** : Calcul automatique du `% de code coverage` via Bitmaps binaires avant validation.
- **Dashboard de Décryptage** : Interface intégrée pour déchiffrer les attaques des hackers localement via clé privée **ECIES**.
- **Sécurité Asymétrique** : Génération de paires `secp256k1` (standard Ethereum) pour la confidentialité des rapports.

### 🥷 Portail Hacker (Chasseur)
- **Vérification Zero-Trust** : Recalcule localement le Hash CID du fichier WASM avant tout engagement de fonds (Anti-Phishing).
- **Cycle Commit-Reveal** : Préserve les attaques contre le "Front-running" sur la blockchain.
- **Calcul de Caution (Stake)** : Calcul dynamique et automatisé de la caution ETH requise on-chain en fonction de la taille de la faille soumise.

### 🔗 Architecture Technique
- **Stockage Stratifié** : Métadonnées sur la **Blockchain (Sepolia)** et fichiers binaires sur **IPFS (Pinata)**.
- **Cryptographie Locale** : Chiffrement AES-256-GCM et dérivation de clé HKDF-SHA256 directement dans le navigateur (Aucun serveur central).
- **Web3 Connect** : Intégration complète avec Wagmi et Viem pour une réactivité instantanée avec MetaMask.

---

## 🚀 Installation & Lancement

### 1. Cloner le dépôt
```bash
git clone https://github.com/BdryYoussef/ZeroTrustBounties.git
cd ZeroTrustBounties
```

### 2. Configuration d'Environnement
Créez un fichier `.env.local` à la racine (Ignoré par Git) :
```env
NEXT_PUBLIC_ESCROW_ADDRESS=0x_Adresse_Du_Contrat_ZTB
NEXT_PUBLIC_PINATA_JWT=votre_cle_api_pinata
```

### 3. Installer et Lancer
```bash
npm install
npm run dev
```

---

## 🏗️ Structure du Projet
- `app/hacker/page.tsx` : Terminal d'attaque et de soumission de preuves.
- `app/sponsor/page.tsx` : Portail de gestion des primes et Dashboard de déchiffrement.
- `lib/ecies.ts` : Moteur de cryptographie asymétrique haute performance.
- `lib/ipfs.ts` : Pont de communication vers le stockage décentralisé Pinata.
- `hooks/useZTBContract.ts` : Orchestration des Smart Contracts ZTBEscrow.

---

## 📜 Licence & Crédits
Développé pour le projet **Zero Trust Bounties (2026)**. 
- **Blockchain Core** : Ammar (Solidity)
- **ZK Logic** : Youssef (Risc0/Bonsai)
- **Frontend Engine** : Antigravity (Next.js/Wagmi)
