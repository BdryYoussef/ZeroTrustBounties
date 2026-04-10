// hooks/useZTBContract.ts — V4.3 Final
// Hooks wagmi pour interagir avec ZTBEscrow.sol

import { useWriteContract, useReadContract, useWatchContractEvent, usePublicClient, useWalletClient } from 'wagmi'
import { parseUnits, keccak256, encodePacked, sha256, maxUint256 } from 'viem'
import {
  ZTB_ESCROW_ABI,
  type Domain,
  type VerificationMode,
  BASE_STAKE_ETH,
  STEP_PENALTY_ETH,
} from '@/lib/abi/ZTBEscrow.abi'

// ── Addresses ─────────────────────────────────────────────────
const ESCROW_ADDRESS = (
  process.env.NEXT_PUBLIC_ESCROW_ADDRESS
  ?? '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9'
) as `0x${string}`

const USDT_ADDRESS = (
  process.env.NEXT_PUBLIC_USDT_ADDRESS
  ?? '0x5FbDB2315678afecb367f032d93F642f64180aa3'
) as `0x${string}`

// Minimal ERC-20 ABI — only what we need
const ERC20_ABI = [
  { name: 'approve',   type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
] as const

// ── Types ─────────────────────────────────────────────────────

export interface CreateBountyArgs {
  targetCID:           `0x${string}`
  staticPropsHash:     `0x${string}`
  baselineMerkleRootA: `0x${string}`
  baselineMerkleRootB: `0x${string}`
  baselineAHash:       `0x${string}`
  baselineBHash:       `0x${string}`
  financialConfigHash: `0x${string}`
  domain:              Domain
  mode:                VerificationMode
  extractionReceipt:   `0x${string}`
  maxSteps:            bigint
  eciesPublicKey:      `0x${string}`
  rewardUsdt:          string
  rewardFloorUsdt:     string
  metadataURI:         string   // IPFS CID of the metadata JSON
}

export interface CommitProofArgs {
  bountyId:      bigint
  commitment:    `0x${string}`  // keccak256(address || sha256(payload) || nonce)
  payloadLength: bigint         // passé au contrat pour calcul du stake anti-DoS
  stakeWei:      bigint         // ETH value envoyé avec la tx (msg.value)
}

export interface SubmitProofArgs {
  bountyId:         bigint
  payloadHash:      `0x${string}`  // arg 1 — SHA256 du payload (INV-9)
  nonce:            bigint          // arg 2 — anti-replay
  groth16Receipt:   `0x${string}`  // arg 3 — seal Groth16
  journal:          `0x${string}`  // arg 4 — sortie brute du Guest (15 champs encodés)
  encryptedPayload: string          // arg 5 — payload chiffré ECIES (string calldata)
}

// ── Utilitaire — calculer le commitment ───────────────────────

export function computeCommitment(
  address:       `0x${string}`,
  payloadHash:   `0x${string}`,
  nonce:         bigint,
): `0x${string}` {
  // keccak256(address || sha256(payload) || nonce) — INV-9
  return keccak256(
    encodePacked(
      ['address', 'bytes32', 'uint256'],
      [address, payloadHash, nonce],
    )
  )
}

// ── Utilitaire — calculer le stake requis (hors contrat) ──────

export function computeStake(
  attempts:      number,
  payloadLength: number,
): bigint {
  // BASE(0.1 ETH) * 2^n + (length/100 * 0.001 ETH) — INV-10
  const base    = BASE_STAKE_ETH * Math.pow(2, Math.min(attempts, 5))
  const penalty = Math.floor(payloadLength / 100) * STEP_PENALTY_ETH
  const total   = base + penalty
  return parseUnits(total.toFixed(6), 18)  // en wei
}

// ── Hook principal — écriture ─────────────────────────────────

export function useZTBContract() {
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const {
    writeContract,
    writeContractAsync,
    isPending,
    isSuccess,
    isError,
    error,
    data: txHash,
    reset,
  } = useWriteContract()

  // SPONSOR — approve USDT then create bounty (2 MetaMask prompts)
  async function createBounty(args: CreateBountyArgs) {
    if (!publicClient || !walletClient) throw new Error('Wallet not connected')

    const rewardWei      = parseUnits(args.rewardUsdt,      6)
    const rewardFloorWei = parseUnits(args.rewardFloorUsdt, 6)
    const account        = walletClient.account.address

    // ① Check current allowance
    const allowance = await publicClient.readContract({
      address:      USDT_ADDRESS,
      abi:          ERC20_ABI,
      functionName: 'allowance',
      args:         [account, ESCROW_ADDRESS],
    }) as bigint

    // ② If insufficient, prompt approve first
    if (allowance < rewardWei) {
      const hash = await writeContractAsync({
        address:      USDT_ADDRESS,
        abi:          ERC20_ABI,
        functionName: 'approve',
        args:         [ESCROW_ADDRESS, maxUint256],  // approve max — single approval for lifetime
      })
      // Critically wait for approval tx to land so the nonce increments correctly!
      await publicClient.waitForTransactionReceipt({ hash })
    }

    // ③ Now create the bounty
    return writeContract({
      address:      ESCROW_ADDRESS,
      abi:          ZTB_ESCROW_ABI,
      functionName: 'createBounty',
      args: [
        args.targetCID,
        args.staticPropsHash,
        args.baselineMerkleRootA,
        args.baselineMerkleRootB,
        args.baselineAHash,
        args.baselineBHash,
        args.financialConfigHash,
        args.domain,
        args.mode,
        args.extractionReceipt,
        args.maxSteps,
        args.eciesPublicKey,
        rewardWei,
        rewardFloorWei,
        args.metadataURI,        // new: IPFS CID of metadata JSON
      ],
    })
  }

  // HACKER — engager une preuve
  function commitProof(args: CommitProofArgs) {
    return writeContract({
      address:      ESCROW_ADDRESS,
      abi:          ZTB_ESCROW_ABI,
      functionName: 'commit',        // nom exact dans ZTBEscrow.sol
      args:         [args.bountyId, args.commitment, args.payloadLength],
      value:        args.stakeWei,   // ETH envoyé avec la tx
    })
  }

  // HACKER — soumettre la preuve
  function submitProof(args: SubmitProofArgs) {
    return writeContract({
      address:      ESCROW_ADDRESS,
      abi:          ZTB_ESCROW_ABI,
      functionName: 'submitProof',
      args: [
        args.bountyId,           // uint256
        args.payloadHash,        // bytes32  — arg 1 (INV-9)
        args.nonce,              // uint256  — arg 2
        args.groth16Receipt,     // bytes    — arg 3
        args.journal,            // bytes    — arg 4 (sortie Guest)
        args.encryptedPayload,   // string   — arg 5
      ],
    })
  }

  // SPONSOR — annuler un bounty
  function cancelBounty(bountyId: bigint) {
    return writeContract({
      address:      ESCROW_ADDRESS,
      abi:          ZTB_ESCROW_ABI,
      functionName: 'cancelBounty',
      args:         [bountyId],
    })
  }

  // SPONSOR — Activer un bounty après 72h (PRIORITY 2)
  function activateBounty(bountyId: bigint) {
    return writeContract({
      address:      ESCROW_ADDRESS,
      abi:          ZTB_ESCROW_ABI,
      functionName: 'activateBounty',
      args:         [bountyId],
    })
  }

  // ANYONE — Clear an expired commit (Anti-Griefing, TASK 1)
  function clearExpiredCommit(bountyId: bigint) {
    return writeContract({
      address:      ESCROW_ADDRESS,
      abi:          ZTB_ESCROW_ABI,
      functionName: 'clearExpiredCommit',
      args:         [bountyId],
    })
  }

  return {
    createBounty,
    commitProof,
    submitProof,
    cancelBounty,
    activateBounty,
    clearExpiredCommit,
    isPending,
    isSuccess,
    isError,
    error,
    txHash,
    reset,
  }
}

export default useZTBContract

// ── Hook lecture — un seul bounty ─────────────────────────────

export function useBounty(bountyId: bigint) {
  return useReadContract({
    address:      ESCROW_ADDRESS,
    abi:          ZTB_ESCROW_ABI,
    functionName: 'bounties',
    args:         [bountyId],
    query: { enabled: bountyId >= 0n },
  })
}

// ── Hook lecture — nombre total de bounties ───────────────────

export function useTotalBounties() {
  return useReadContract({
    address:      ESCROW_ADDRESS,
    abi:          ZTB_ESCROW_ABI,
    functionName: 'nextId',
  })
}

// ── Hook lecture — stake requis on-chain ──────────────────────

export function useRequiredStake(
  hacker:        `0x${string}`,
  bountyId:      bigint,
  payloadLength: bigint,
) {
  return useReadContract({
    address:      ESCROW_ADDRESS,
    abi:          ZTB_ESCROW_ABI,
    functionName: 'computeRequiredStake',
    args:         [hacker, bountyId, payloadLength],
    query: { enabled: !!hacker && bountyId >= 0n },
  })
}

// ── Hook lecture — committer actif ────────────────────────────

export function useActiveCommitter(bountyId: bigint) {
  return useReadContract({
    address:      ESCROW_ADDRESS,
    abi:          ZTB_ESCROW_ABI,
    functionName: 'activeCommitter',
    args:         [bountyId],
  })
}

// ── Hook lecture — deadline du commit ────────────────────────

export function useCommitDeadline(bountyId: bigint) {
  return useReadContract({
    address:      ESCROW_ADDRESS,
    abi:          ZTB_ESCROW_ABI,
    functionName: 'commitDeadline',
    args:         [bountyId],
  })
}

// ── Hook événement — écouter ExploitProven ───────────────────

export function useExploitProvenEvent(
  onExploit: (bountyId: bigint, hacker: string, amount: bigint) => void
) {
  useWatchContractEvent({
    address:      ESCROW_ADDRESS,
    abi:          ZTB_ESCROW_ABI,
    eventName:    'ExploitProven',
    onLogs: (logs) => {
      logs.forEach(log => {
        const { bountyId, hacker, amount } = log.args as {
          bountyId: bigint
          hacker:   string
          amount:   bigint
        }
        onExploit(bountyId, hacker, amount)
      })
    },
  })
}