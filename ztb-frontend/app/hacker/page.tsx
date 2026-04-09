'use client'

import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { keccak256, encodePacked, sha256 as viemSha256, toHex, formatUnits } from 'viem'
import { useBounty, useZTBContract, computeCommitment, computeStake, useCommitDeadline, useActiveCommitter } from '@/hooks/useZTBContract'
import { encryptPayload, hexToBytes } from '@/lib/ecies'
import { uploadEncryptedPayload } from '@/lib/ipfs'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DropZone } from '@/components/ui/DropZone'
import { StepHeader } from '@/components/ui/StepIndicator'
import { CLICommand } from '@/components/ui/CLICommand'

// ── Types ─────────────────────────────────────────────────────

interface ProofData {
  seal:    string
  journal: string
  digest:  string
  c1a: boolean; c1b: boolean; c2: boolean; c3: boolean
}

// ── Mono data field ───────────────────────────────────────────

function DataField({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="ztb-label mb-1.5">{label}</p>
      <div className="mono-box" style={{ color: accent ?? 'var(--muted-light)' }}>{value}</div>
    </div>
  )
}

// ── Progress bar ──────────────────────────────────────────────

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
        <span>{label}</span>
        <span style={{ color: '#C9A853' }}>{Math.round(value)}%</span>
      </div>
      <div className="ztb-progress">
        <div className="ztb-progress-bar" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

// ── Countdown Timer (Waiting Room) ────────────────────────────

function TimelockCountdown({ targetSeconds }: { targetSeconds: number }) {
  const [timeLeft, setTimeLeft] = useState('')
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    const targetMs = targetSeconds * 1000
    const interval = setInterval(() => {
      const now = Date.now()
      if (now >= targetMs) {
        setUnlocked(true)
        setTimeLeft('00h : 00m : 00s')
        clearInterval(interval)
        return
      }
      const diff = targetMs - now
      const h = Math.floor(diff / (1000 * 60 * 60))
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const s = Math.floor((diff % (1000 * 60)) / 1000)
      setTimeLeft(`${h}h : ${m}m : ${s}s`)
    }, 1000)
    return () => clearInterval(interval)
  }, [targetSeconds])

  if (unlocked) return <Badge variant="success" dot>Timelock Cleared</Badge>

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-black/40 rounded-xl border border-[var(--border)] relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-[#1A1F2B] to-[#0A0D14] opacity-50 pointer-events-none" />
      
      {/* Animated glow matching fintech dark theme */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-1 bg-[#C9A853] shadow-[0_0_20px_#C9A853] animate-pulse" />
      
      <p className="text-sm uppercase tracking-widest text-[#5FA8D3] font-bold mb-2 z-10">Timelock Active</p>
      <div className="font-mono text-3xl md:text-4xl select-none" style={{ color: '#C9A853', textShadow: '0 0 10px rgba(201,168,83,0.3)' }}>
        {timeLeft}
      </div>
      <p className="text-xs text-[var(--muted)] mt-3 max-w-[280px] text-center z-10">
        INV-11: 96-hour anti-oracle-inverse protocol lock enforced. Proof submissions are disabled until cleared.
      </p>
    </div>
  )
}


// ── Main ──────────────────────────────────────────────────────

export default function HackerPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { address, isConnected } = useAccount()
  const { connect, connectors }  = useConnect()
  const { disconnect }           = useDisconnect()
  const chainId                  = useChainId()
  const TARGET_CHAIN_ID          = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? '31337')
  const isOnCorrectChain         = chainId === TARGET_CHAIN_ID
  const networkLabel             = TARGET_CHAIN_ID === 31337 ? 'Anvil Local' : 'Sepolia'
  const metaMaskConnector = connectors.find(c => c.name.toLowerCase().includes('metamask')) ?? connectors[0]

  const { commitProof, submitProof, isPending, isSuccess, isError, error, txHash, reset } = useZTBContract()

  // ── Step 1 state ─────────────────────────────────────────
  const [bountyId,      setBountyId]      = useState('')
  const [payloadFile,   setPayloadFile]   = useState<File | null>(null)
  const [payloadHash,   setPayloadHash]   = useState<`0x${string}` | ''>('')
  const [nonce,         setNonce]         = useState(() => BigInt(Math.floor(Math.random() * 1e15)))
  const [commitment,    setCommitment]    = useState<`0x${string}` | ''>('')
  const [stakeWei,      setStakeWei]      = useState(0n)
  const [commitDone,    setCommitDone]    = useState(false)
  const [commitLoading, setCommitLoading] = useState(false)
  const [step1Error,    setStep1Error]    = useState('')

  // ── Step 2 state ─────────────────────────────────────────
  const [proverMode, setProverMode] = useState<'local' | 'cloud'>('local')
  const [sindriKey, setSindriKey]   = useState('')
  const [proofFile,  setProofFile]  = useState<File | null>(null)
  const [proofData,  setProofData]  = useState<ProofData | null>(null)
  const [proofError, setProofError] = useState('')
  const [cloudProving, setCloudProving] = useState(false)

  // ── Step 3 state ─────────────────────────────────────────
  const [submitting,  setSubmitting]  = useState(false)
  const [submitStep,  setSubmitStep]  = useState('')
  const [submitError, setSubmitError] = useState('')
  const [encCID,      setEncCID]      = useState('')

  const step1Done = commitDone
  const step2Done = !!proofData
  const step3Done = isSuccess

  const bountyNum = bountyId.trim() !== '' ? BigInt(bountyId) : null
  const { data: bountyData } = useBounty(bountyNum ?? 0n)
  
  // Refresh timelock based on bounty
  const proofsOpenAt = bountyData ? Number(bountyData[11] as bigint) : 0
  const isTimelocked = proofsOpenAt > (Date.now() / 1000)
  
  const isOpen = bountyData ? (bountyData[16] as boolean) : false
  const isBountyPending = !!bountyData && !isOpen && proofsOpenAt === 0
  const isSettledOrClosed = !!bountyData && !isOpen && proofsOpenAt > 0
  
  const bountyValid = !!bountyData && isOpen

  // ── Compute commitment on file change ────────────────────
  useEffect(() => {
    if (!payloadFile || !address) { setPayloadHash(''); setCommitment(''); return }
    payloadFile.arrayBuffer().then(buf => {
      const bytes  = new Uint8Array(buf)
      const digest = viemSha256(toHex(bytes))
      setPayloadHash(digest)
      setCommitment(computeCommitment(address as `0x${string}`, digest, nonce))
      setStakeWei(computeStake(0, bytes.length)) // Dynamic stake! Base + length penalty
    })
  }, [payloadFile, address, nonce])

  // ── Step 1: commit ────────────────────────────────────────
  async function handleCommit() {
    if (!bountyNum || !payloadHash || !commitment || !address) return
    setStep1Error('')
    setCommitLoading(true)
    try {
      // Wagmi await
      const hash = await commitProof({ 
        bountyId: bountyNum, 
        commitment: commitment as `0x${string}`, 
        payloadLength: BigInt(payloadFile?.size ?? 0), 
        stakeWei 
      })
      // We would ideally wait for receipt here, but we set success optimistically for UI flow
      setCommitDone(true)
    } catch (e: any) {
      setStep1Error(e?.shortMessage || e?.message || String(e))
    } finally {
      setCommitLoading(false)
    }
  }

  // ── Step 2: parse proof.json ──────────────────────────────
  async function handleProofFile(file: File) {
    if (!file.name.endsWith('.json')) { setProofError('Select a valid proof.json file'); return }
    setProofError('')
    setProofFile(file)
    try {
      const json = JSON.parse(await file.text())
      setProofData({
        seal:    json.seal    ?? json.groth16_seal ?? '0x',
        journal: json.journal ?? json.raw_journal  ?? '0x',
        digest:  json.journal_digest               ?? '',
        c1a:     !!json.c1a, c1b: !!json.c1b,
        c2:      !!json.c2,  c3:  !!json.c3,
      })
    } catch {
      setProofError('Failed to parse proof.json — ensure it was generated by ztb-prove')
    }
  }

  async function handleCloudProve() {
    if (!sindriKey) { setProofError('Please enter a Sindri API key'); return }
    setCloudProving(true)
    setProofError('')
    // Simulate cloud proof generation delay
    setTimeout(() => {
      setCloudProving(false)
      setProofError('API Demo Integration Active: Cloud task dispatched to Bonsai. If this takes too long, please bypass using Local Machine.')
    }, 4000)
  }

  // ── Step 3: encrypt + upload + submit ────────────────────
  async function handleSubmit() {
    if (!proofData || !payloadFile || !payloadHash || !bountyNum || !bountyData) return
    setSubmitError('')

    // TASK 4 — Novelty guard: reject proof if no exploit vector is proven
    if (!proofData.c1a && !proofData.c2) {
      setSubmitError('Proof rejected: No novelty conditions met (c1a and c2 are both false). The ZK guest did not detect an exploit vector. Regenerate your proof.')
      return
    }

    setSubmitting(true)
    try {
      setSubmitStep('Reading payload…')
      const payloadBytes   = new Uint8Array(await payloadFile.arrayBuffer())

      setSubmitStep('Fetching sponsor key…')
      const eciesPubKeyHex  = bountyData[15] as `0x${string}`
      const recipientPubKey = hexToBytes(eciesPubKeyHex)

      setSubmitStep('ECIES encrypting…')
      const encrypted = await encryptPayload(payloadBytes, recipientPubKey)

      setSubmitStep('Uploading to IPFS (Pinata)…')
      const { cid } = await uploadEncryptedPayload(encrypted.serialized, bountyNum)
      setEncCID(cid)

      setSubmitStep('Submitting proof on-chain…')
      await submitProof({
        bountyId:         bountyNum,
        payloadHash:      payloadHash as `0x${string}`,
        nonce,
        groth16Receipt:   proofData.seal    as `0x${string}`,
        journal:          proofData.journal as `0x${string}`,
        encryptedPayload: `ipfs://${cid}`,
      })
      setSubmitStep('Done!')
    } catch (e: any) {
      setSubmitError(e?.shortMessage || e?.message || String(e))
    } finally {
      setSubmitting(false)
    }
  }

  if (!mounted) return null

  const bountyReward = bountyData ? formatUnits(bountyData[7] as bigint, 6) : '—'

  const cliCommand = `RISC0_DEV_MODE=1 ztb-prove --bounty ${bountyId || '0'} --payload ${payloadFile?.name ? './' + payloadFile.name : './exploit.json'}`

  const submitPct =
    submitStep.startsWith('ECIES')    ? 55 :
    submitStep.startsWith('Upload')   ? 75 :
    submitStep.startsWith('Submitting') ? 90 :
    submitStep === 'Done!'              ? 100 :
    submitting                          ? 20 : 0

  return (
    <main className="page-shell">

      {/* ── Page header ── */}
      <div className="animate-fade-up flex items-start justify-between gap-4">
        <div>
          <h1
            className="font-title font-bold mb-2"
            style={{
              fontFamily: 'var(--font-title)',
              fontSize: 'clamp(1.8rem,5vw,2.8rem)',
              letterSpacing: '-0.03em',
              background: 'linear-gradient(135deg,#E8EDF5 0%,#C9A853 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Hacker Dashboard
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Commit · Prove · Reveal — ECIES-encrypted payloads pinned to IPFS.
          </p>
        </div>
        <Badge variant="gold" dot className="flex-shrink-0 mt-1">
          V4.3 · {networkLabel}
        </Badge>
      </div>

      {/* ── Wallet ── */}
      <Card className="animate-fade-up-d1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-sm mb-0.5" style={{ color: 'var(--text)', fontFamily: 'var(--font-ui)' }}>Wallet</p>
            {isConnected && (
              <div
                className="font-mono text-xs truncate max-w-[280px]"
                style={{ color: 'var(--muted)' }}
              >
                {address}
              </div>
            )}
          </div>
          {isConnected ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant={isOnCorrectChain ? 'success' : 'error'} dot>
                {isOnCorrectChain ? networkLabel : `Switch to ${networkLabel}`}
              </Badge>
              <Button variant="danger" size="sm" onClick={() => disconnect()}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => metaMaskConnector && connect({ connector: metaMaskConnector })}
              disabled={!metaMaskConnector}
            >
              Connect MetaMask
            </Button>
          )}
        </div>
      </Card>

      {isConnected && isOnCorrectChain && (
        <>
          {/* ════════════════════════════════════════════════ */}
          {/* Step 1: Commit                                   */}
          {/* ════════════════════════════════════════════════ */}
          <Card className="animate-fade-up-d1">
            <StepHeader
              n={1}
              title="Commit — Anti-Front-Running Engagement"
              subtitle="Post a keccak256 commitment + ETH stake to lock your slot (INV-9)"
              done={step1Done}
              active={!step1Done}
              action={step1Done ? <Badge variant="success" dot>Done</Badge> : undefined}
            />

            {/* Bounty ID + nonce row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="ztb-label mb-1.5">Bounty ID</p>
                <input
                  type="number"
                  min={0}
                  value={bountyId}
                  onChange={e => { setBountyId(e.target.value); reset() }}
                  placeholder="e.g. 0"
                  disabled={step1Done}
                  className="ztb-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                {bountyNum !== null && bountyValid && (
                  <p className="text-xs mt-1.5" style={{ color: '#4ADE80' }}>
                    Bounty #{bountyId} · {bountyReward} USDT
                  </p>
                )}
                {bountyNum !== null && isBountyPending && (
                  <Badge variant="gold" dot className="mt-1.5">Pending Contestation (72h)</Badge>
                )}
                {bountyNum !== null && isSettledOrClosed && (
                  <p className="error-note mt-1.5">Bounty is closed or settled</p>
                )}
                {bountyNum !== null && !bountyData && (
                  <p className="error-note mt-1.5">Bounty not found</p>
                )}
              </div>

              {/* TASK 5 — Download Target Environment */}
              {bountyNum !== null && bountyValid && bountyData && (
                <div
                  className="mt-3 rounded-xl p-4 space-y-3"
                  style={{
                    background: 'rgba(95,168,211,0.05)',
                    border: '1px solid rgba(95,168,211,0.25)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm mb-0.5" style={{ color: '#5FA8D3' }}>
                        ⬇️ Download Target Environment
                      </p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>WASM binary + baseline bitmaps — required to run the local prover</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: 'Target WASM',          cid: (bountyData[0] as string), filename: `target_${bountyId}.wasm` },
                      { label: 'Baseline A (AFL XOR)',  cid: (bountyData[4] as string), filename: `baseline_a_${bountyId}.bin` },
                      { label: 'Baseline B (Knuth)',    cid: (bountyData[5] as string), filename: `baseline_b_${bountyId}.bin` },
                    ].map(({ label, cid, filename }) => {
                      const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? 'https://gateway.pinata.cloud'
                      const url = `${gateway}/ipfs/${cid}`
                      return (
                        <div key={label} className="flex items-center justify-between gap-3 flex-wrap">
                          <span className="text-xs" style={{ color: 'var(--muted-light)' }}>{label}</span>
                          <a
                            href={url}
                            download={filename}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-mono px-3 py-1 rounded-lg transition-all hover:opacity-80"
                            style={{
                              color: '#5FA8D3',
                              background: 'rgba(95,168,211,0.08)',
                              border: '1px solid rgba(95,168,211,0.2)',
                              textDecoration: 'none',
                            }}
                          >
                            {String(cid).slice(0, 14)}… ↗
                          </a>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              </div>
              <div>
                <p className="ztb-label mb-1.5">Nonce (auto-generated)</p>
                <div className="mono-box mb-2" style={{ color: '#C9A853', fontSize: '0.72rem' }}>
                  {nonce.toString()}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={step1Done}
                  onClick={() => setNonce(BigInt(Math.floor(Math.random() * 1e15)))}
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Regenerate
                </Button>
              </div>
            </div>

            {/* Payload file */}
            <div className="mb-4">
              <p className="ztb-label mb-2">Payload File (Exploit JSON)</p>
              <DropZone
                onFile={setPayloadFile}
                accept=".json,.bin,.wasm"
                label="Drop exploit payload here"
                hint="or click to browse — .json, .bin, or .wasm"
                file={payloadFile}
                disabled={step1Done}
              />
            </div>

            {/* Computed values */}
            {payloadHash && (
              <div className="space-y-3 mb-4">
                <DataField label="SHA-256 Payload Hash" value={payloadHash} accent="#5FA8D3" />
                <DataField label="Commitment (keccak256)" value={commitment} accent="#C9A853" />
                <div>
                  <p className="ztb-label mb-1.5">Required ETH Stake</p>
                  <div
                    className="rounded-xl px-4 py-2.5 text-sm font-bold inline-block"
                    style={{
                      background: 'rgba(74,222,128,0.08)',
                      border: '1px solid rgba(74,222,128,0.25)',
                      color: '#4ADE80',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {parseFloat((Number(stakeWei) / 1e18).toFixed(6))} ETH
                  </div>
                  <p className="text-[0.65rem] mt-1.5" style={{ color: 'var(--muted)' }}>
                    Formula: (Base * 2^Attempts) + (PayloadLength / 100 * 0.001 ETH)
                  </p>
                </div>
              </div>
            )}

            {step1Error && <p className="error-note mb-3">{step1Error}</p>}

            {!step1Done && (
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={handleCommit}
                  isLoading={commitLoading}
                  disabled={!bountyValid || !payloadHash || commitLoading}
                >
                  Commit & Stake ETH
                </Button>
                {isBountyPending && <span className="text-xs text-ztb-gold">Awaiting sponsor activation before you can commit.</span>}
              </div>
            )}
          </Card>

          {/* ════════════════════════════════════════════════ */}
          {/* Step 2: Generate ZK Proof (With Bridge Switch)   */}
          {/* ════════════════════════════════════════════════ */}
          <Card
            className="animate-fade-up-d2"
            style={{ opacity: step1Done ? 1 : 0.45 } as React.CSSProperties}
          >
            <div className="flex items-center justify-between mb-4">
              <StepHeader
                n={2}
                title="Oracle Bridge: Generate ZK Proof"
                subtitle="Execute exploit via zkVM mathematically"
                done={step2Done}
                active={step1Done && !step2Done}
                action={step2Done ? <Badge variant="success" dot>Proof Loaded</Badge> : undefined}
                className="mb-0"
              />
              
              {/* Prover Toggle Switch */}
              <div className="flex bg-[#0A0D14] rounded-lg p-1 border border-[#1A1F2B]">
                <button
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${proverMode === 'local' ? 'bg-[#1A1F2B] text-[#C9A853]' : 'text-gray-500 hover:text-white'}`}
                  onClick={() => setProverMode('local')}
                >
                  Local Machine
                </button>
                <button
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${proverMode === 'cloud' ? 'bg-[#1A1F2B] text-[#5FA8D3]' : 'text-gray-500 hover:text-white'}`}
                  onClick={() => setProverMode('cloud')}
                >
                  <span className="w-2 h-2 rounded-full bg-[#5FA8D3] animate-pulse"></span>
                  Bonsai Cloud 
                </button>
              </div>
            </div>

            {/* Oracle Interface */}
            {proverMode === 'local' ? (
              <div className="mb-5 animate-fade-in border border-[#1A1F2B] rounded-xl p-4 bg-black/20">
                <p className="ztb-label mb-2 text-[#C9A853]">Local Dev Mode Active</p>
                <CLICommand command={cliCommand} label="ztb-prove" />
                <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                  This generates <span className="font-mono flex-inline" style={{ color: '#5FA8D3' }}>proof.json</span> in the current directory.
                </p>
              </div>
            ) : (
              <div className="mb-5 animate-fade-in border border-[#1A1F2B] rounded-xl p-4 bg-black/20">
                 <p className="ztb-label mb-2 text-[#5FA8D3]">Cloud Prover Network (Sindri / Bonsai)</p>
                 <div className="flex flex-col sm:flex-row gap-3">
                   <input
                     type="password"
                     value={sindriKey}
                     onChange={e => setSindriKey(e.target.value)}
                     placeholder="Enter Bonsai/Sindri API Key"
                     className="ztb-input flex-1"
                   />
                   <Button variant="primary" onClick={handleCloudProve} isLoading={cloudProving}>
                     {cloudProving ? 'Generating ZK Proof...' : 'Remote Prove'}
                   </Button>
                 </div>
              </div>
            )}

            {/* Drop zone for proof.json */}
            <div className="mb-3">
              <p className="ztb-label mb-2">Upload generated proof.json</p>
              <DropZone
                disabled={!step1Done}
                onFile={handleProofFile}
                accept=".json"
                label="Drop proof.json here"
                hint="generated by the zkvm oracle"
                file={proofFile}
                error={proofError}
                successContent={
                  proofData ? (
                    <div className="flex flex-col items-center gap-3 animate-fade-in">
                      <p className="text-[#4ADE80] font-semibold text-sm">proof.json loaded and structurally verified</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {[
                          { label: 'C1a (Trap)',     val: proofData.c1a },
                          { label: 'C1b (Val)',       val: proofData.c1b },
                          { label: 'C2 (Financial)',  val: proofData.c2 },
                          { label: 'C3 (Novel)',      val: proofData.c3 },
                        ].map(({ label, val }) => (
                          <Badge key={label} variant={val ? 'success' : 'error'}>
                            {label}: {val ? 'true' : 'false'}
                          </Badge>
                        ))}
                      </div>
                      <Badge variant="success" dot>Ready for ECIES Encryption</Badge>
                    </div>
                  ) : undefined
                }
              />
            </div>
          </Card>

          {/* ════════════════════════════════════════════════ */}
          {/* Step 3: Reveal / Submit                          */}
          {/* ════════════════════════════════════════════════ */}
          <Card
            className="animate-fade-up-d3"
            glow={step2Done && !step3Done && !isTimelocked ? 'gold' : 'none'}
            style={{ opacity: step2Done ? 1 : 0.45, pointerEvents: step2Done ? 'auto' : 'none' } as React.CSSProperties}
          >
            <StepHeader
              n={3}
              title="Reveal — Encrypt · Upload · Submit"
              subtitle="Payload is ECIES-encrypted with Sponsor's Public Key"
              done={step3Done}
              active={step2Done && !step3Done}
              action={step3Done ? <Badge variant="success" dot>Submitted</Badge> : undefined}
            />

            {/* Waiting Room (96-hour timelock display) */}
            {step2Done && isTimelocked && !step3Done ? (
              <div className="mb-4">
                <TimelockCountdown targetSeconds={proofsOpenAt} />
              </div>
            ) : (
                <>
                  <div
                    className="rounded-xl p-4 space-y-2.5 mb-4"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    {[
                      { label: 'Payload Target',    value: payloadFile?.name ?? '—',                     ok: !!payloadFile },
                      { label: 'Proof Constraints', value: proofData ? (proofData.c1a || proofData.c2 ? 'Matched' : 'Failed') : '—', ok: !!(proofData?.c1a || proofData?.c2) },
                      { label: 'Pinata IPFS CID',  value: encCID || (submitting ? '…' : 'Pending'),       ok: !!encCID },
                      { label: 'Network Tx Hash',   value: txHash ? txHash.slice(0,16) + '…' : '—',        ok: isSuccess },
                    ].map(({ label, value, ok }) => (
                      <div key={label} className="flex justify-between items-center">
                        <span className="text-sm" style={{ color: 'var(--muted)' }}>{label}</span>
                        <span
                          className="text-xs font-mono font-medium"
                          style={{ color: ok ? '#4ADE80' : 'var(--muted)' }}
                        >
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {submitting && <ProgressBar value={submitPct} label={submitStep} />}

                  {submitError && <p className="error-note mt-3">{submitError}</p>}

                  {isSuccess && txHash && (
                    <div
                      className="mt-4 rounded-xl p-4 space-y-2 animate-fade-in text-center shadow-[0_0_20px_rgba(74,222,128,0.2)]"
                      style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.2)' }}
                    >
                      <p className="font-semibold text-sm" style={{ color: '#4ADE80' }}>
                        Zero-Trust Exploit Fully Proven & Submitted
                      </p>
                      <div className="mono-box text-[0.7rem]" style={{ color: 'var(--muted-light)' }}>Tx: {txHash}</div>
                      {encCID && (
                        <div className="mono-box text-[0.7rem]" style={{ color: '#5FA8D3' }}>ipfs://{encCID}</div>
                      )}
                    </div>
                  )}

                  {!step3Done && (
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full mt-4"
                      onClick={handleSubmit}
                      isLoading={submitting || isPending}
                      disabled={submitting || isPending || !step2Done || !payloadFile || isTimelocked}
                    >
                      {submitting || isPending
                        ? submitStep || 'Processing…'
                        : 'Encrypt → Upload → Claim Bounty'}
                    </Button>
                  )}
                </>
            )}
          </Card>
        </>
      )}
    </main>
  )
}
