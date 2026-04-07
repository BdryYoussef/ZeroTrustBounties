// hooks/useZTBContract.ts — V4.3 Final
// Hooks wagmi pour interagir avec ZTBEscrow.sol

import { useWriteContract, useReadContract, useWatchContractEvent } from 'wagmi'
import { parseUnits, keccak256, encodePacked, sha256 } from 'viem'
import {
  ZTB_ESCROW_ABI,
  type Domain,
  type VerificationMode,
  BASE_STAKE_ETH,
  STEP_PENALTY_ETH,
} from '@/lib/abi/ZTBEscrow.abi'

// ── Adresse contrat ───────────────────────────────────────────
// Remplacer quand Ammar déploie sur Sepolia
const ESCROW_ADDRESS = (
  process.env.NEXT_PUBLIC_ESCROW_ADDRESS
  ?? '0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e'
) as `0x${string}`

// ── Types ─────────────────────────────────────────────────────

export interface CreateBountyArgs {
  targetCID:           `0x${string}`  // SHA256 du WASM
  staticPropsHash:     `0x${string}`  // SHA256 assertions
  baselineMerkleRootA: `0x${string}`  // Merkle root bitmap A
  baselineMerkleRootB: `0x${string}`  // Merkle root bitmap B
  baselineHashA:       `0x${string}`  // SHA256 bitmap A
  baselineHashB:       `0x${string}`  // SHA256 bitmap B
  financialConfigHash: `0x${string}`  // SHA256 FinancialConfig
  domain:              Domain
  mode:                VerificationMode
  extractionReceipt:   `0x${string}`  // receipt Groth16 extraction
  maxSteps:            bigint
  eciesPublicKey:      `0x${string}`  // clé publique sponsor
  rewardUsdt:          string         // ex: "1000" → converti en 6 décimales
  rewardFloorUsdt:     string         // ex: "700"  → 70% si RELAXED sans C3
}

export interface CommitProofArgs {
  bountyId:      bigint
  commitment:    `0x${string}`  // keccak256(address || sha256(payload) || nonce)
  stakeWei:      bigint         // calculé par computeStake()
}

export interface SubmitProofArgs {
  bountyId:         bigint
  groth16Receipt:   `0x${string}`
  encryptedPayload: `0x${string}`
  payloadHash:      `0x${string}`
  nonce:            bigint
  payloadLength:    bigint
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
  const {
    writeContract,
    isPending,
    isSuccess,
    isError,
    error,
    data: txHash,
    reset,
  } = useWriteContract()

  // SPONSOR — créer un bounty
  function createBounty(args: CreateBountyArgs) {
    return writeContract({
      address:      ESCROW_ADDRESS,
      abi:          ZTB_ESCROW_ABI,
      functionName: 'createBounty',
      args: [
        args.targetCID,
        args.staticPropsHash,
        args.baselineMerkleRootA,
        args.baselineMerkleRootB,
        args.baselineHashA,
        args.baselineHashB,
        args.financialConfigHash,
        args.domain,
        args.mode,
        args.extractionReceipt,
        args.maxSteps,
        args.eciesPublicKey,
        parseUnits(args.rewardUsdt, 6),       // USDT = 6 décimales
        parseUnits(args.rewardFloorUsdt, 6),
      ],
    })
  }

  // HACKER — engager une preuve
  function commitProof(args: CommitProofArgs) {
    return writeContract({
      address:      ESCROW_ADDRESS,
      abi:          ZTB_ESCROW_ABI,
      functionName: 'commitProof',
      args:         [args.bountyId, args.commitment],
      value:        args.stakeWei,  // ETH envoyé avec la tx
    })
  }

  // HACKER — soumettre la preuve
  function submitProof(args: SubmitProofArgs) {
    return writeContract({
      address:      ESCROW_ADDRESS,
      abi:          ZTB_ESCROW_ABI,
      functionName: 'submitProof',
      args: [
        args.bountyId,
        args.groth16Receipt,
        args.encryptedPayload,
        args.payloadHash,
        args.nonce,
        args.payloadLength,
      ],
    })
  }

  return {
    createBounty,
    commitProof,
    submitProof,
    isPending,   // true → MetaMask attend signature
    isSuccess,   // true → transaction confirmée
    isError,     // true → transaction échouée
    error,       // détails si isError
    txHash,      // hash de la transaction
    reset,       // reset l'état après erreur
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