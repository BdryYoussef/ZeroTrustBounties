'use client'

import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId, usePublicClient } from 'wagmi'
import { generateECIESKeyPair, decryptPayload, hexToBytes, type ECIESKeyPair } from '@/lib/ecies'
import { uploadWASM, uploadDualBitmap, computeFileCID, computeBytesCID } from '@/lib/ipfs'
import useZTBContract, { useBounty } from '@/hooks/useZTBContract'
import { parseUnits, formatUnits, parseAbiItem, hexToString } from 'viem'
import { type Domain, type VerificationMode, DOMAIN_LABELS, MODE_LABELS } from '@/lib/abi/ZTBEscrow.abi'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DropZone } from '@/components/ui/DropZone'
import { StepHeader } from '@/components/ui/StepIndicator'
import { RewardSlider } from '@/components/ui/RewardSlider'
import { ParameterCard, ParameterGrid } from '@/components/ui/ParameterCard'

// ── Types ─────────────────────────────────────────────────────

interface FinancialConfig {
  authorizedIndices: number[]
  maxDeltaPct:       number
}

interface SponsorState {
  wasmFile:       File | null
  wasmCID:        string
  wasmIPFSUrl:    string
  wasmUploading:  boolean
  bitmapAFile:    File | null
  bitmapBFile:    File | null
  bitmapAHash:    string | null
  bitmapBHash:    string | null
  bitmapACID:     string
  bitmapBCID:     string
  bitmapACoverage: number
  bitmapBCoverage: number
  bitmapUploading: boolean
  domain:         Domain
  mode:           VerificationMode
  financialConfig: FinancialConfig
  keyPair:        ECIESKeyPair | null
  keySaved:       boolean
  rewardUsdt:     string
  rewardFloorUsdt: string
  txHash:         string
  txStatus:       'idle' | 'pending' | 'success' | 'error'
  txError:        string
}

// ── Coverage bar ──────────────────────────────────────────────

function CoverageBar({ pct, label }: { pct: number; label: string }) {
  const ok = pct >= 20
  return (
    <div className="mt-2 space-y-1">
      <div className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
        <span>{label}</span>
        <span style={{ color: ok ? '#4ADE80' : '#F87171', fontWeight: 700 }}>{pct}%</span>
      </div>
      <div className="ztb-progress">
        <div
          className="ztb-progress-bar"
          style={{
            width: `${Math.min(pct, 100)}%`,
            background: ok
              ? 'linear-gradient(90deg,#1B4F72,#4ADE80)'
              : 'linear-gradient(90deg,#7A2020,#F87171)',
          }}
        />
      </div>
      {!ok && <p className="error-note">Minimum 20% coverage required</p>}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────

export default function SponsorPage() {
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

  const { createBounty, cancelBounty, isPending, isSuccess, isError, error, txHash } = useZTBContract()
  const publicClient = usePublicClient()

  const [state, setState] = useState<SponsorState>({
    wasmFile: null, wasmCID: '', wasmIPFSUrl: '', wasmUploading: false,
    bitmapAFile: null, bitmapBFile: null,
    bitmapAHash: null, bitmapBHash: null,
    bitmapACID: '', bitmapBCID: '',
    bitmapACoverage: 0, bitmapBCoverage: 0, bitmapUploading: false,
    domain: 0, mode: 0,
    financialConfig: { authorizedIndices: [], maxDeltaPct: 10 },
    keyPair: null, keySaved: false,
    rewardUsdt: '', rewardFloorUsdt: '',
    txHash: '', txStatus: 'idle', txError: '',
  })

  const [globalError, setGlobalError] = useState<string | null>(null)
  const [privBlurred, setPrivBlurred] = useState(true)

  // ── Lifecycle State ──────────────────────────────────────
  const [manageBountyId, setManageBountyId] = useState('')
  const [inboxPrivKey, setInboxPrivKey] = useState('')
  const [decryptedExploit, setDecryptedExploit] = useState('')
  const [decrypting, setDecrypting] = useState(false)
  const [decryptError, setDecryptError] = useState('')
  
  const manageBountyNum = manageBountyId.trim() !== '' ? BigInt(manageBountyId) : null
  const { data: mBountyData } = useBounty(manageBountyNum ?? 0n)
  
  const mIsOpen = mBountyData ? (mBountyData[16] as boolean) : false
  const mSponsor = mBountyData ? (mBountyData[14] as string) : ''

  async function handleDecrypt() {
    const privHex = inboxPrivKey || state.keyPair?.privateKeyHex
    if (!privHex) { setDecryptError('Please enter your private key hex'); return }
    setDecrypting(true)
    setDecryptError('')
    try {
      const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}`
      const logs = await publicClient!.getLogs({
        address: ESCROW_ADDRESS,
        event: parseAbiItem('event ExploitProven(uint256 indexed bountyId, address indexed hacker, bytes32 payloadHash, bytes encryptedPayload, bool c1a, bool c1b, bool c2, bool c3, uint32 totalNew, uint256 amount)'),
        args: { bountyId: manageBountyNum },
        fromBlock: 0n,
        toBlock: 'latest',
      })
      if (logs.length === 0) throw new Error('No ExploitProven event found for this bounty')

      const encPayloadHex = logs[0].args.encryptedPayload as string
      const ipfsStr = hexToString(encPayloadHex as `0x${string}`)
      const cid = ipfsStr.replace('ipfs://', '')
      
      const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`)
      if (!res.ok) throw new Error('Failed to fetch from IPFS')
      const encryptedBytes = new Uint8Array(await res.arrayBuffer())

      const privKeyBytes = hexToBytes(privHex)
      const decryptedBytes = await decryptPayload(encryptedBytes, privKeyBytes)
      setDecryptedExploit(new TextDecoder().decode(decryptedBytes))
    } catch (e: any) {
      setDecryptError(e?.shortMessage || e?.message || String(e))
    } finally {
      setDecrypting(false)
    }
  }

  async function handleCancel() {
    if (manageBountyNum !== null) await cancelBounty(manageBountyNum)
  }

  // ── Step completion ──────────────────────────────────────
  const step1Done = !!state.wasmCID
  const step2Done = !!state.bitmapACID && !!state.bitmapBCID
  const step3Done = true
  const step4Done = !!state.keyPair && state.keySaved
  const step5Done = !!state.rewardUsdt
  const allDone   = step1Done && step2Done && step3Done && step4Done && step5Done

  // ── Handlers ─────────────────────────────────────────────

  function countBits(b: Uint8Array) { return b.reduce((a, n) => { let c = 0; while (n) { c += n & 1; n >>= 1 } return a + c }, 0) }

  async function handleWASM(file: File) {
    if (!file.name.endsWith('.wasm')) { setGlobalError('Select a valid .wasm file'); return }
    setState(s => ({ ...s, wasmFile: file, wasmUploading: true }))
    setGlobalError(null)
    try {
      const [result, cid] = await Promise.all([uploadWASM(file), computeFileCID(file)])
      setState(s => ({ ...s, wasmCID: cid, wasmIPFSUrl: result.url, wasmUploading: false }))
    } catch (e) {
      setGlobalError('WASM upload failed: ' + String(e))
      setState(s => ({ ...s, wasmUploading: false }))
    }
  }

  async function handleBitmap(file: File, which: 'A' | 'B') {
    const bytes    = new Uint8Array(await file.arrayBuffer())
    const coverage = Math.round((countBits(bytes) / (bytes.length * 8)) * 100)
    if (which === 'A') setState(s => ({ ...s, bitmapAFile: file, bitmapACoverage: coverage }))
    else               setState(s => ({ ...s, bitmapBFile: file, bitmapBCoverage: coverage }))
  }

  async function handleUploadBitmaps() {
    if (!state.bitmapAFile || !state.bitmapBFile) { setGlobalError('Select both bitmap files'); return }
    setState(s => ({ ...s, bitmapUploading: true }))
    setGlobalError(null)
    try {
      const [bytesA, bytesB] = await Promise.all([
        state.bitmapAFile.arrayBuffer().then(b => new Uint8Array(b)),
        state.bitmapBFile.arrayBuffer().then(b => new Uint8Array(b)),
      ])
      const [, cidA, cidB] = await Promise.all([
        uploadDualBitmap(bytesA, bytesB),
        computeBytesCID(bytesA),
        computeBytesCID(bytesB),
      ])
      const [hashABuffer, hashBBuffer] = await Promise.all([
        crypto.subtle.digest('SHA-256', bytesA),
        crypto.subtle.digest('SHA-256', bytesB),
      ])
      
      const bufToHex = (b: ArrayBuffer) => '0x' + Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('')
      const hexA = bufToHex(hashABuffer)
      const hexB = bufToHex(hashBBuffer)

      setState(s => ({ 
        ...s, 
        bitmapACID: cidA, 
        bitmapBCID: cidB, 
        bitmapAHash: hexA, 
        bitmapBHash: hexB, 
        bitmapUploading: false 
      }))
    } catch (e) {
      setGlobalError('Bitmap upload failed: ' + String(e))
      setState(s => ({ ...s, bitmapUploading: false }))
    }
  }

  function handleGenerateKeys() {
    try {
      setState(s => ({ ...s, keyPair: generateECIESKeyPair(), keySaved: false }))
    } catch (e) { setGlobalError('Key generation error: ' + String(e)) }
  }

  function handleDownloadKey() {
    if (!state.keyPair) return
    const a   = document.createElement('a')
    a.href    = URL.createObjectURL(new Blob([state.keyPair.privateKeyHex], { type: 'text/plain' }))
    a.download = 'ztb_private_key.txt'
    a.click()
    setState(s => ({ ...s, keySaved: true }))
    setPrivBlurred(false)
  }

  function handleRewardChange(value: string) {
    const floor = state.mode === 1 ? (parseFloat(value) * 0.7).toFixed(2) : value
    setState(s => ({ ...s, rewardUsdt: value, rewardFloorUsdt: floor }))
  }

  async function handleCreateBounty() {
    setGlobalError(null)
    if (!state.wasmCID)    return setGlobalError('Upload the WASM file first')
    if (!state.bitmapACID) return setGlobalError('Upload both baseline bitmaps first')
    if (!state.keyPair)    return setGlobalError('Generate an ECIES key pair first')
    if (!state.keySaved)   return setGlobalError('Download and save your private key first')
    if (!state.rewardUsdt || parseFloat(state.rewardUsdt) <= 0) return setGlobalError('Set a USDT reward > 0')
    if (state.mode === 1 && parseFloat(state.rewardFloorUsdt) > parseFloat(state.rewardUsdt)) return setGlobalError('Floor reward cannot exceed maximum reward')
    try {
      await createBounty({
        targetCID:           state.wasmCID as `0x${string}`,
        staticPropsHash:     ('0x' + '0'.repeat(64)) as `0x${string}`,
        baselineMerkleRootA: ('0x' + '0'.repeat(64)) as `0x${string}`,
        baselineMerkleRootB: ('0x' + '0'.repeat(64)) as `0x${string}`,
        baselineAHash:       state.bitmapAHash as `0x${string}`,
        baselineBHash:       state.bitmapBHash as `0x${string}`,
        financialConfigHash: ('0x' + '0'.repeat(64)) as `0x${string}`,
        domain:              state.domain,
        mode:                state.mode,
        extractionReceipt:   '0x' as `0x${string}`,
        maxSteps:            1000000n,
        eciesPublicKey:      state.keyPair.publicKeyHex as `0x${string}`,
        rewardUsdt:          state.rewardUsdt,
        rewardFloorUsdt:     state.rewardFloorUsdt || state.rewardUsdt,
      })
    } catch (e) { setGlobalError('createBounty failed: ' + String(e)) }
  }

  if (!mounted) return null

  const explorerUrl = TARGET_CHAIN_ID === 31337
    ? `http://localhost:4000/tx/${txHash}`
    : `https://sepolia.etherscan.io/tx/${txHash}`

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
            Sponsor Dashboard
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Deploy a zero-trust bounty — lock USDT, receive ZK-verified exploits.
          </p>
        </div>
        <Badge variant="gold" dot className="flex-shrink-0 mt-1">
          V4.3 · {networkLabel}
        </Badge>
      </div>

      {/* ── Global error ── */}
      {globalError && (
        <div
          className="animate-fade-up rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)' }}
        >
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#F87171' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 8v4M12 16h.01" />
          </svg>
          <p className="text-sm" style={{ color: '#F87171' }}>{globalError}</p>
        </div>
      )}

      {/* ── Step 1: Wallet ── */}
      <Card className="animate-fade-up-d1">
        <StepHeader
          n={1}
          title="Connect Wallet"
          subtitle="MetaMask on the correct network"
          done={isConnected && isOnCorrectChain}
          active={!isConnected}
          action={
            isConnected
              ? <Badge variant={isOnCorrectChain ? 'success' : 'error'} dot>
                  {isOnCorrectChain ? networkLabel : `Switch to ${networkLabel}`}
                </Badge>
              : undefined
          }
        />
        {isConnected ? (
          <div className="flex flex-col gap-3">
            <div className="mono-box text-[var(--muted-light)]">{address}</div>
            <Button variant="danger" size="sm" className="w-fit" onClick={() => disconnect()}>
              Disconnect
            </Button>
          </div>
        ) : (
          <Button variant="primary" className="w-fit" onClick={() => metaMaskConnector && connect({ connector: metaMaskConnector })} disabled={!metaMaskConnector}>
            Connect MetaMask
          </Button>
        )}
      </Card>

      {/* Wrong network warning */}
      {isConnected && !isOnCorrectChain && (
        <div
          className="animate-fade-up rounded-xl p-4 text-center text-sm"
          style={{ border: '1px solid rgba(248,113,113,0.3)', color: '#F87171', background: 'rgba(248,113,113,0.06)' }}
        >
          Switch to <strong>{networkLabel}</strong> in MetaMask to continue.
        </div>
      )}

      {isConnected && isOnCorrectChain && (
        <>
          {/* ── Step 2: WASM ── */}
          <Card className="animate-fade-up-d1">
            <StepHeader
              n={2}
              title="Upload Instrumented WASM"
              subtitle="Floating-point-free RISC Zero compatible binary"
              done={step1Done}
              active={!step1Done}
              action={step1Done ? <Badge variant="success" dot>Uploaded</Badge> : undefined}
            />
            {state.wasmUploading ? (
              <div className="flex items-center gap-3 text-sm py-2" style={{ color: 'var(--muted)' }}>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity=".2" />
                  <path fill="currentColor" opacity=".8" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Uploading to IPFS…
              </div>
            ) : (
              <DropZone
                onFile={handleWASM}
                accept=".wasm"
                label="Drop .wasm file here"
                hint="or click to browse — instrumented, FP-free binary"
                file={step1Done ? state.wasmFile : null}
              />
            )}
            {state.wasmCID && (
              <div className="mt-3 space-y-1.5">
                <p className="ztb-label">CID (targetCID on-chain)</p>
                <div className="mono-box" style={{ color: '#5FA8D3' }}>{state.wasmCID}</div>
              </div>
            )}
          </Card>

          {/* ── Step 3: Dual Bitmap ── */}
          <Card className="animate-fade-up-d2">
            <StepHeader
              n={3}
              title="Upload Dual Baseline Bitmaps"
              subtitle="Coverage bitmap A (AFL XOR) and B (Knuth multiplicative)"
              done={step2Done}
              active={!step2Done}
              action={step2Done ? <Badge variant="success" dot>Both Uploaded</Badge> : undefined}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="ztb-label mb-2 text-ztb-gold">baseline_a.bin (AFL XOR)</p>
                <DropZone
                  onFile={f => handleBitmap(f, 'A')}
                  accept=".bin"
                  label="Drop baseline_a.bin here"
                  hint="Must be exactly 8192 bytes"
                  file={step2Done ? state.bitmapAFile : null}
                />
                {state.bitmapAFile && (
                  <CoverageBar pct={state.bitmapACoverage} label="Coverage A" />
                )}
              </div>
              <div>
                <p className="ztb-label mb-2">Bitmap B — Knuth multiplicative</p>
                <DropZone
                  onFile={f => handleBitmap(f, 'B')}
                  accept=".bin"
                  label="Drop baseline_b.bin"
                  hint="coverage bitmap (.bin)"
                  file={state.bitmapBFile}
                />
                {state.bitmapBFile && (
                  <CoverageBar pct={state.bitmapBCoverage} label="Coverage B" />
                )}
              </div>
            </div>
            {state.bitmapAFile && state.bitmapBFile && !step2Done && (
              <Button
                variant="secondary"
                className="mt-4"
                onClick={handleUploadBitmaps}
                isLoading={state.bitmapUploading}
                disabled={state.bitmapUploading || state.bitmapACoverage < 20 || state.bitmapBCoverage < 20}
              >
                {state.bitmapUploading ? 'Uploading…' : 'Upload Both Bitmaps to IPFS'}
              </Button>
            )}
          </Card>

          {/* ── Step 4: Oracle Config ── */}
          <Card className="animate-fade-up-d2">
            <StepHeader
              n={4}
              title="Oracle Configuration"
              subtitle="Select vulnerability domain and verification mode"
              done={step3Done}
              active={false}
            />
            <div className="space-y-5">
              {/* Domain */}
              <div>
                <p className="ztb-label mb-2.5">Domain</p>
                <div className="flex flex-wrap gap-2">
                  {([0, 1, 2] as Domain[]).map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setState(s => ({ ...s, domain: d }))}
                      className="ztb-btn"
                      style={{
                        background: state.domain === d
                          ? 'rgba(201,168,83,0.15)' : 'var(--surface-2)',
                        border: state.domain === d
                          ? '1px solid rgba(201,168,83,0.4)' : '1px solid var(--border)',
                        color: state.domain === d ? '#C9A853' : 'var(--muted-light)',
                      }}
                    >
                      {DOMAIN_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>

              {/* FinancialConfig */}
              {state.domain === 0 && (
                <div
                  className="rounded-xl p-4 space-y-3"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <p className="ztb-label">Financial Config — max 8 indices, delta ≤ 20%</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs mb-1.5" style={{ color: 'var(--muted)' }}>Authorized indices (comma-separated)</p>
                      <input
                        type="text"
                        placeholder="e.g. 0,1,2,3"
                        className="ztb-input"
                        onChange={e => {
                          const indices = e.target.value.split(',').map(Number).filter(n => !isNaN(n)).slice(0, 8)
                          setState(s => ({ ...s, financialConfig: { ...s.financialConfig, authorizedIndices: indices } }))
                        }}
                      />
                    </div>
                    <div>
                      <p className="text-xs mb-1.5" style={{ color: 'var(--muted)' }}>Max delta (%)</p>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={state.financialConfig.maxDeltaPct}
                        className="ztb-input"
                        onChange={e => setState(s => ({ ...s, financialConfig: { ...s.financialConfig, maxDeltaPct: Math.min(20, parseInt(e.target.value) || 10) } }))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* C1/C2/C3 Mode */}
              <div>
                <p className="ztb-label mb-2.5">C1 / C2 / C3 Verification Filters</p>
                <div className="flex flex-col gap-3">
                  {([0, 1] as VerificationMode[]).map(m => (
                    <label
                      key={m}
                      className="cursor-pointer group flex items-center justify-between p-4 rounded-xl transition-all duration-300"
                      style={{
                        background: state.mode === m ? 'rgba(95,168,211,0.1)' : 'var(--surface-2)',
                        border: state.mode === m ? '1px solid rgba(95,168,211,0.4)' : '1px solid var(--border)',
                        boxShadow: state.mode === m ? '0 0 15px rgba(95,168,211,0.1) inset' : 'none'
                      }}
                      onClick={() => setState(s => ({
                        ...s, mode: m,
                        rewardFloorUsdt: m === 1 && s.rewardUsdt ? (parseFloat(s.rewardUsdt) * 0.7).toFixed(2) : s.rewardUsdt,
                      }))}
                    >
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-title font-bold tracking-wide" style={{ color: state.mode === m ? '#5FA8D3' : 'var(--text)' }}>
                            {m === 0 ? 'STRICT MODE' : 'RELAXED MODE'}
                          </span>
                          <div className="flex gap-1.5">
                            <Badge variant="success">C1</Badge>
                            <Badge variant="success">C2</Badge>
                            <Badge variant={m === 0 ? 'success' : 'gold'}>{m === 0 ? 'C3 Required' : 'C3 Optional'}</Badge>
                          </div>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>{MODE_LABELS[m]}</p>
                      </div>
                      <div className="flex items-center">
                        <div className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${state.mode === m ? 'bg-[#5FA8D3]' : 'bg-white/10'}`}>
                          <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[#1A1F29] transition-transform duration-300 ${state.mode === m ? 'translate-x-5' : ''}`} />
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* ── Step 5: ECIES Key ── */}
          <Card className="animate-fade-up-d3">
            <StepHeader
              n={5}
              title="ECIES Key Pair"
              subtitle="secp256k1 + HKDF-SHA256 + AES-256-GCM · IV 96-bit"
              done={step4Done}
              active={!step4Done}
              action={step4Done ? <Badge variant="success" dot>Saved</Badge> : undefined}
            />
            {!state.keyPair ? (
              <Button variant="secondary" className="w-fit" onClick={handleGenerateKeys}>
                Generate Key Pair
              </Button>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="ztb-label mb-1.5">Public key — stored on-chain</p>
                  <div className="mono-box" style={{ color: '#5FA8D3' }}>{state.keyPair.publicKeyHex}</div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="ztb-label">Private key — keep offline</p>
                    <button
                      type="button"
                      onClick={() => setPrivBlurred(b => !b)}
                      className="text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      {privBlurred ? 'Reveal' : 'Hide'}
                    </button>
                  </div>
                  <div
                    className="mono-box transition-all duration-300"
                    style={{
                      color: '#C9A853',
                      filter: privBlurred ? 'blur(5px)' : 'none',
                      userSelect: privBlurred ? 'none' : 'text',
                    }}
                  >
                    {state.keyPair.privateKeyHex}
                  </div>
                  {!state.keySaved && (
                    <p className="text-xs mt-1.5" style={{ color: '#FBBF24' }}>
                      Download and save this key offline before creating the bounty.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleDownloadKey}
                  >
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Private Key
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleGenerateKeys}>
                    Regenerate
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* ── Step 6: Reward ── */}
          <Card className="animate-fade-up-d3">
            <StepHeader
              n={6}
              title="Set USDT Reward"
              subtitle="Total reward locked in escrow on bounty creation"
              done={step5Done}
              active={!step5Done}
              action={step5Done ? <Badge variant="gold">{state.rewardUsdt} USDT</Badge> : undefined}
            />
            <RewardSlider
              value={state.rewardUsdt}
              onChange={handleRewardChange}
              min={100}
              max={50000}
              step={100}
              floorValue={state.mode === 1 ? state.rewardFloorUsdt : undefined}
              floorLabel="Floor RELAXED (70%)"
            />
          </Card>

          {/* ── Step 7: Create Bounty ── */}
          <Card className="animate-fade-up-d4" glow={allDone ? 'gold' : 'none'}>
              <StepHeader
                n={7}
                title="Create Bounty"
                subtitle="Submit transaction to deploy. Bounty starts in 72h PENDING state."
                done={isSuccess}
                active={allDone && !isSuccess}
              />

            {/* Parameter summary */}
            <ParameterGrid className="mb-5">
              <ParameterCard label="WASM"     value={step1Done ? 'Uploaded' : 'Missing'} ok={step1Done} />
              <ParameterCard label="Bitmaps"  value={step2Done ? 'A + B uploaded' : 'Missing'} ok={step2Done} />
              <ParameterCard label="Domain"   value={DOMAIN_LABELS[state.domain]} ok />
              <ParameterCard label="Mode"     value={state.mode === 0 ? 'STRICT' : 'RELAXED'} ok />
              <ParameterCard label="ECIES"    value={step4Done ? 'Key saved' : state.keyPair ? 'Not downloaded' : 'Missing'} ok={step4Done ? true : state.keyPair ? 'warn' : false} />
              <ParameterCard label="Reward"   value={state.rewardUsdt ? `${state.rewardUsdt} USDT` : 'Not set'} ok={!!state.rewardUsdt} />
            </ParameterGrid>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleCreateBounty}
              isLoading={isPending}
              disabled={!allDone || isPending}
            >
              {isPending ? 'Waiting for MetaMask…' : 'Create Bounty — Lock USDT'}
            </Button>

            {/* On-chain activity */}
            {isSuccess && txHash && (
              <div
                className="mt-4 rounded-xl p-4 space-y-3 animate-fade-in"
                style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.2)' }}
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" style={{ color: '#4ADE80' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                  </svg>
                  <span className="text-sm font-semibold" style={{ color: '#4ADE80' }}>Bounty created on-chain</span>
                </div>
                <div className="mono-box text-[0.7rem]" style={{ color: 'var(--muted-light)' }}>
                  Tx: {txHash}
                </div>
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ztb-btn ztb-btn-secondary ztb-btn-sm inline-flex items-center gap-2 w-fit"
                  style={{ textDecoration: 'none' }}
                >
                  View on Explorer
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}

            {isError && (
              <p className="error-note mt-3">
                {error?.message ?? 'Transaction failed'}
              </p>
            )}
          </Card>
        </>
      )}
    </main>
  )
}