// lib/abi/ZTBEscrow.abi.ts — V4.3 Final (synced to new contract)

export const ZTB_ESCROW_ABI = [

  // ── WRITE FUNCTIONS ───────────────────────────────────────

  {
    name: 'createBounty',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'targetCID',           type: 'bytes32' },
      { name: 'staticPropsHash',     type: 'bytes32' },
      { name: 'baselineMerkleRootA', type: 'bytes32' },
      { name: 'baselineMerkleRootB', type: 'bytes32' },
      { name: 'baselineAHash',       type: 'bytes32' },
      { name: 'baselineBHash',       type: 'bytes32' },
      { name: 'financialConfigHash', type: 'bytes32' },
      { name: 'domain',              type: 'uint8'   },
      { name: 'mode',                type: 'uint8'   },
      { name: 'extractionReceipt',   type: 'bytes'   },
      { name: 'maxSteps',            type: 'uint256' },
      { name: 'eciesPublicKey',      type: 'bytes'   },
      { name: 'reward',              type: 'uint256' },
      { name: 'rewardFloor',         type: 'uint256' },
    ],
    outputs: [],
  },

  {
    name: 'commit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'bountyId',      type: 'uint256' },
      { name: 'commitHash',    type: 'bytes32' },
      { name: 'payloadLength', type: 'uint256' },
    ],
    outputs: [],
  },

  {
    name: 'submitProof',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'bountyId',         type: 'uint256' },
      { name: 'payloadHash',      type: 'bytes32' },
      { name: 'nonce',            type: 'uint256' },
      { name: 'groth16Receipt',   type: 'bytes'   },
      { name: 'journal',          type: 'bytes'   },
      { name: 'encryptedPayload', type: 'string'  },
    ],
    outputs: [],
  },

  {
    name: 'cancelBounty',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [],
  },

  {
    name: 'activateBounty',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [],
  },

  {
    name: 'clearExpiredCommit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [],
  },

  // ── READ FUNCTIONS ────────────────────────────────────────

  {
    // Struct field order matches ZTBEscrow.sol Bounty struct exactly
    name: 'bounties',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [
      { name: 'targetCID',           type: 'bytes32' },
      { name: 'staticPropsHash',     type: 'bytes32' },
      { name: 'baselineMerkleRootA', type: 'bytes32' },
      { name: 'baselineMerkleRootB', type: 'bytes32' },
      { name: 'baselineAHash',       type: 'bytes32' },
      { name: 'baselineBHash',       type: 'bytes32' },
      { name: 'financialConfigHash', type: 'bytes32' },
      { name: 'reward',              type: 'uint256' },
      { name: 'rewardFloor',         type: 'uint256' },
      { name: 'maxSteps',            type: 'uint256' },
      { name: 'createdAt',           type: 'uint256' },
      { name: 'proofsOpenAt',        type: 'uint256' },
      { name: 'domain',              type: 'uint8'   },
      { name: 'mode',                type: 'uint8'   },
      { name: 'sponsor',             type: 'address' },
      { name: 'eciesPublicKey',      type: 'bytes'   },
      { name: 'isOpen',              type: 'bool'    },
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
    name: 'commitDeadline',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },

  {
    name: 'commitAttempts',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'bountyId', type: 'uint256' },
      { name: 'hacker',   type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },

  {
    name: 'isDevMode',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },

  // ── EVENTS ────────────────────────────────────────────────

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
    name: 'Committed',
    type: 'event',
    inputs: [
      { name: 'commitHash', type: 'bytes32', indexed: true },
      { name: 'hunter',     type: 'address', indexed: true },
    ],
  },

  {
    name: 'CommitCleared',
    type: 'event',
    inputs: [
      { name: 'bountyId',          type: 'uint256', indexed: true  },
      { name: 'slashedCommitter',  type: 'address', indexed: true  },
      { name: 'forfeitedStake',    type: 'uint256', indexed: false },
    ],
  },

] as const

// ── Types ──────────────────────────────────────────────────────

export type Domain           = 0 | 1 | 2
export type VerificationMode = 0 | 1
export type BountyState      = 'open' | 'closed'

export const DOMAIN_LABELS: Record<Domain, string> = {
  0: 'Financial',
  1: 'Access Control',
  2: 'General',
}

export const DOMAIN_COLORS: Record<Domain, string> = {
  0: '#4ade80',
  1: '#5fa8d3',
  2: '#d0a76f',
}

export const MODE_LABELS: Record<VerificationMode, string> = {
  0: 'STRICT — 100% reward (C1 or C2) + C3',
  1: 'RELAXED — 70% without C3, 100% with C3',
}

// ── Protocol constants ────────────────────────────────────────

export const BASE_STAKE_ETH    = 0.1
export const STEP_PENALTY_ETH  = 0.001
export const PROOFS_OPEN_DELAY = 96   // hours
export const COMMIT_DEADLINE   = 72   // hours