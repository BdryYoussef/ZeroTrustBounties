# Zero Trust Bounties Frontend

Interface frontend de Zero Trust Bounties, construite avec Next.js, React, TypeScript, Tailwind CSS et wagmi.

L’application cible le workflow sponsor du protocole: connexion wallet sur Sepolia, upload d’un WASM instrumenté, upload de bitmaps de baseline, génération d’une paire ECIES, configuration du bounty et création de la transaction on-chain.

## Aperçu

Le projet met en avant deux entrées principales:

- une landing page qui présente le produit et redirige vers l’interface sponsor
- une interface sponsor dédiée à la création de bounty décentralisés

Le frontend s’appuie sur:

- Next.js App Router
- wagmi et viem pour l’accès blockchain
- TanStack Query pour la gestion des données côté client
- web3.storage pour l’upload IPFS
- une implémentation ECIES locale basée sur secp256k1, HKDF-SHA256 et AES-256-GCM

## Fonctionnalités

- Connexion MetaMask sur le réseau Sepolia
- Vérification du réseau actif avant les actions sensibles
- Upload d’un fichier WASM vers IPFS via web3.storage
- Calcul local du CID SHA-256 pour le WASM et les bitmaps
- Upload de deux bitmaps de baseline avec mesure de couverture
- Configuration du domaine et du mode de vérification
- Génération et téléchargement d’une clé ECIES sponsor
- Saisie de la récompense USDT et du reward floor en mode relaxed
- Création d’un bounty via le contrat `ZTBEscrow`
- Affichage du hash de transaction et lien Etherscan après succès

## Arborescence utile

```text
app/
	page.tsx            Landing page
	layout.tsx          Layout racine et metadata
	providers.tsx       Providers wagmi + React Query
	theme-toggle.tsx    Bascule de thème
	sponsor/page.tsx    Interface sponsor principale
hooks/
	useZTBContract.ts   Hooks wagmi et helpers métier
lib/
	ecies.ts            Génération et chiffrement ECIES
	ipfs.ts             Upload et vérification IPFS
	wagmi.config.ts     Configuration wallet/réseau
	abi/ZTBEscrow.abi.ts ABI, types et constantes du protocole
```

## Prérequis

- Node.js 18+ recommandé
- npm 9+ ou un gestionnaire compatible
- MetaMask installé dans le navigateur
- Accès au réseau Sepolia
- Un token web3.storage si vous voulez activer les uploads IPFS

## Installation

```bash
npm install
```

## Variables d’environnement

Créez un fichier `.env.local` à la racine du projet avec au minimum:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://rpc.sepolia.org
NEXT_PUBLIC_ESCROW_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_WEB3_STORAGE_TOKEN=your_web3_storage_token
```

Notes:

- `NEXT_PUBLIC_ESCROW_ADDRESS` doit être remplacée par l’adresse réelle du contrat déployé
- `NEXT_PUBLIC_WEB3_STORAGE_TOKEN` est requis pour l’upload IPFS
- si `NEXT_PUBLIC_SEPOLIA_RPC_URL` est absent, le frontend retombe sur le RPC public `https://rpc.sepolia.org`

## Lancement local

```bash
npm run dev
```

Ouvrez ensuite [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` démarre le serveur de développement Next.js
- `npm run build` construit l’application pour la production
- `npm run start` lance le build de production
- `npm run lint` exécute les règles ESLint de Next.js

## Flux sponsor

1. Connexion du wallet dans MetaMask.
2. Vérification que le wallet est bien sur Sepolia.
3. Upload du WASM instrumenté vers IPFS.
4. Préparation des deux bitmaps de baseline.
5. Configuration du domaine métier et du mode strict ou relaxed.
6. Génération de la clé ECIES sponsor et sauvegarde hors ligne de la clé privée.
7. Définition de la récompense USDT et validation du récapitulatif.
8. Création du bounty on-chain via `createBounty`.

## Détails techniques

### Blockchain

Le frontend utilise `wagmi` avec `sepolia` comme seule chaîne configurée. La connexion MetaMask est métadonnée avec le nom `ZTB — Zero Trust Bounties`.

### IPFS

Les uploads passent par l’API `web3.storage`. Le code calcule aussi les hash SHA-256 localement pour permettre un contrôle de cohérence entre contenu local et identifiants stockés.

### Chiffrement

La génération ECIES combine:

- secp256k1
- HKDF-SHA256
- AES-256-GCM

La clé privée générée côté sponsor doit être téléchargée et conservée hors ligne.

### Contrat

Le hook `useZTBContract` expose les opérations principales du contrat `ZTBEscrow`:

- `createBounty`
- `commitProof`
- `submitProof`
- lectures associées au bounty courant

## Déploiement

Le projet suit un modèle standard Next.js et peut être déployé sur une plateforme compatible Node.js. Avant production, vérifiez:

- la valeur de `NEXT_PUBLIC_ESCROW_ADDRESS`
- la disponibilité du token web3.storage
- la configuration RPC Sepolia
- la construction réussie avec `npm run build`

## Remarques

- Le projet est centré sur l’expérience sponsor; les pages ou flux côté hacker ne sont pas exposés ici.
- La logique métier dépend du contrat `ZTBEscrow` et de sa compatibilité avec les types/ABI présents dans `lib/abi/ZTBEscrow.abi.ts`.
- Si vous déplacez l’adresse du contrat ou les paramètres réseau, mettez aussi à jour la documentation et les variables d’environnement.
