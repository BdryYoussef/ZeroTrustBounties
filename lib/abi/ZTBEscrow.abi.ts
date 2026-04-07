// lib/abi/ZTBEscrow.abi.ts
// ABI ZTBEscrow V4.3 — construit depuis CONTEXT.md
// À mettre à jour si Ammar modifie des fonctions

export const ZTB_ESCROW_ABI = [

  // ── ENUMS ─────────────────────────────────────────────────
  // Domain        : FINANCIAL=0, ACCESS_CONTROL=1, GENERAL=2
  // BountyState   : PENDING=0, ACTIVE=1, CLOSED=2, DISPUTED=3
  // VerifMode     : STRICT=0, RELAXED=1

  // ── WRITE FUNCTIONS ───────────────────────────────────────

  {
    name: 'createBounty',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'targetCID',           type: 'bytes32' }, // SHA256 du WASM
      { name: 'staticPropsHash',     type: 'bytes32' }, // SHA256 assertions
      { name: 'baselineMerkleRootA', type: 'bytes32' }, // Merkle root bitmap A
      { name: 'baselineMerkleRootB', type: 'bytes32' }, // Merkle root bitmap B
      { name: 'baselineHashA',       type: 'bytes32' }, // SHA256 bitmap A
      { name: 'baselineHashB',       type: 'bytes32' }, // SHA256 bitmap B
      { name: 'financialConfigHash', type: 'bytes32' }, // SHA256 FinancialConfig
      { name: 'domain',              type: 'uint8'   }, // 0=FINANCIAL 1=ACCESS 2=GENERAL
      { name: 'mode',                type: 'uint8'   }, // 0=STRICT 1=RELAXED
      { name: 'extractionReceipt',   type: 'bytes'   }, // Groth16 receipt extraction
      { name: 'maxSteps',            type: 'uint256' }, // limite pas zkVM
      { name: 'eciesPublicKey',      type: 'bytes'   }, // clé publique sponsor
      { name: 'reward',              type: 'uint256' }, // récompense USDT (6 décimales)
      { name: 'rewardFloor',         type: 'uint256' }, // 70% si RELAXED sans C3
    ],
    outputs: [],
  },

  {
    name: 'commit',
    type: 'function',
    stateMutability: 'payable',         // envoie ETH comme stake
    inputs: [
      { name: 'bountyId',       type: 'uint256' },
      { name: 'commitHash',     type: 'bytes32' }, // keccak256(address || sha256(payload) || nonce)
      { name: 'payloadLength',  type: 'uint256' }, // pour calcul stake anti-DoS
    ],
    outputs: [],
  },

  {
    name: 'submitProof',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'bountyId',         type: 'uint256' }, // arg 0
      { name: 'payloadHash',      type: 'bytes32' }, // arg 1 — SHA256 du payload (INV-9)
      { name: 'nonce',            type: 'uint256' }, // arg 2 — anti-replay
      { name: 'groth16Receipt',   type: 'bytes'   }, // arg 3 — receipt zkVM compressé
      { name: 'journal',          type: 'bytes'   }, // arg 4 — sortie brute du Guest (15 champs)
      { name: 'encryptedPayload', type: 'string'  }, // arg 5 — payload chiffré ECIES
    ],
    outputs: [],
  },

  // ── READ FUNCTIONS ────────────────────────────────────────

  {
    name: 'bounties',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [
      { name: 'targetCID',           type: 'bytes32' },
      { name: 'staticPropsHash',     type: 'bytes32' },
      { name: 'baselineMerkleRootA', type: 'bytes32' },
      { name: 'baselineMerkleRootB', type: 'bytes32' },
      { name: 'baselineHashA',       type: 'bytes32' },
      { name: 'baselineHashB',       type: 'bytes32' },
      { name: 'financialConfigHash', type: 'bytes32' },
      { name: 'domain',              type: 'uint8'   },
      { name: 'mode',                type: 'uint8'   },
      { name: 'reward',              type: 'uint256' },
      { name: 'rewardFloor',         type: 'uint256' },
      { name: 'maxSteps',            type: 'uint256' },
      { name: 'createdAt',           type: 'uint256' },
      { name: 'proofsOpenAt',        type: 'uint256' }, // createdAt + 96h
      { name: 'state',               type: 'uint8'   }, // 0=PENDING 1=ACTIVE 2=CLOSED 3=DISPUTED
      { name: 'sponsor',             type: 'address' },
      { name: 'eciesPublicKey',      type: 'bytes'   },
    ],
  },

  {
    name: 'computeRequiredStake',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'hacker',        type: 'address' },
      { name: 'bountyId',      type: 'uint256' },
      { name: 'payloadLength', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },

  {
    name: 'nextId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },

  {
    name: 'activeCommitter',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },

  {
    name: 'commitAttempts',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'hacker',   type: 'address' },
      { name: 'bountyId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },

  {
    name: 'commitDeadline',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },

  // ── EVENTS ────────────────────────────────────────────────

  {
    name: 'ExploitProven',
    type: 'event',
    inputs: [
      { name: 'bountyId',         type: 'uint256', indexed: true  },
      { name: 'hacker',           type: 'address', indexed: true  },
      { name: 'payloadHash',      type: 'bytes32', indexed: false },
      { name: 'encryptedPayload', type: 'bytes',   indexed: false },
      { name: 'c1a',              type: 'bool',    indexed: false },
      { name: 'c1b',              type: 'bool',    indexed: false },
      { name: 'c2',               type: 'bool',    indexed: false },
      { name: 'c3',               type: 'bool',    indexed: false },
      { name: 'totalNew',         type: 'uint32',  indexed: false },
      { name: 'amount',           type: 'uint256', indexed: false },
    ],
  },

  {
    name: 'BountyCreated',
    type: 'event',
    inputs: [
      { name: 'bountyId', type: 'uint256', indexed: true  },
      { name: 'sponsor',  type: 'address', indexed: true  },
      { name: 'reward',   type: 'uint256', indexed: false },
      { name: 'domain',   type: 'uint8',   indexed: false },
      { name: 'mode',     type: 'uint8',   indexed: false },
    ],
  },

] as const

// ── Types utiles ──────────────────────────────────────────────

export type Domain           = 0 | 1 | 2
export type VerificationMode = 0 | 1
export type BountyState      = 0 | 1 | 2 | 3

export const DOMAIN_LABELS: Record<Domain, string> = {
  0: 'Financial',
  1: 'Access Control',
  2: 'General',
}

export const MODE_LABELS: Record<VerificationMode, string> = {
  0: 'STRICT — 100% reward si (C1 ou C2) ET C3',
  1: 'RELAXED — 70% sans C3, 100% avec C3',
}

export const STATE_LABELS: Record<BountyState, string> = {
  0: 'En attente (PENDING)',
  1: 'Actif (ACTIVE)',
  2: 'Fermé (CLOSED)',
  3: 'Contesté (DISPUTED)',
}

// ── Constantes du protocole ───────────────────────────────────

export const BASE_STAKE_ETH   = 0.1    // ETH — stake de base
export const STEP_PENALTY_ETH = 0.001  // ETH — pénalité par 100 bytes payload
export const PROOFS_OPEN_DELAY = 96    // heures après création
export const COMMIT_DEADLINE   = 72    // heures pour soumettre après commit