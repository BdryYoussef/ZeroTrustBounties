'use client'

import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { generateECIESKeyPair, type ECIESKeyPair } from '@/lib/ecies'
import { uploadWASM, uploadDualBitmap, computeFileCID, computeBytesCID } from '@/lib/ipfs'
import useZTBContract from '@/hooks/useZTBContract'
import { parseUnits, formatUnits } from 'viem'
import { type Domain, type VerificationMode, DOMAIN_LABELS, MODE_LABELS } from '@/lib/abi/ZTBEscrow.abi'

// ── Types ─────────────────────────────────────────────────────

interface FinancialConfig {
  authorizedIndices: number[]   // max 8 indices
  maxDeltaPct:       number     // max 20%
}

interface SponsorState {
  // Étape 1 — WASM
  wasmFile:       File | null
  wasmCID:        string
  wasmIPFSUrl:    string
  wasmUploading:  boolean

  // Étape 2 — Dual bitmap
  bitmapAFile:    File | null
  bitmapBFile:    File | null
  bitmapACID:     string
  bitmapBCID:     string
  bitmapACoverage: number
  bitmapBCoverage: number
  bitmapUploading: boolean

  // Étape 3 — Config
  domain:         Domain
  mode:           VerificationMode
  financialConfig: FinancialConfig

  // Étape 4 — ECIES
  keyPair:        ECIESKeyPair | null
  keySaved:       boolean

  // Étape 5 — Reward
  rewardUsdt:     string
  rewardFloorUsdt: string

  // Étape 6 — Tx
  txHash:         string
  txStatus:       'idle' | 'pending' | 'success' | 'error'
  txError:        string
}

// ── Composant principal ───────────────────────────────────────

export default function SponsorPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { address, isConnected } = useAccount()
  const { connect, connectors }  = useConnect()
  const { disconnect }           = useDisconnect()
  const chainId                  = useChainId()
  const isOnSepolia              = chainId === 11155111
  const metaMaskConnector =
    connectors.find(c => c.name.toLowerCase().includes('metamask')) ?? connectors[0]

  const { createBounty, isPending, isSuccess, isError, error, txHash } = useZTBContract()

  const [state, setState] = useState<SponsorState>({
    wasmFile: null, wasmCID: '', wasmIPFSUrl: '', wasmUploading: false,
    bitmapAFile: null, bitmapBFile: null,
    bitmapACID: '', bitmapBCID: '',
    bitmapACoverage: 0, bitmapBCoverage: 0, bitmapUploading: false,
    domain: 0, mode: 0,
    financialConfig: { authorizedIndices: [], maxDeltaPct: 10 },
    keyPair: null, keySaved: false,
    rewardUsdt: '', rewardFloorUsdt: '',
    txHash: '', txStatus: 'idle', txError: '',
  })

  const [globalError, setGlobalError] = useState<string | null>(null)

  // ── Étape 1 — Upload WASM ──────────────────────────────────

  async function handleWASMUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.wasm')) {
      setGlobalError('Fichier invalide — sélectionnez un fichier .wasm')
      return
    }
    setState(s => ({ ...s, wasmFile: file, wasmUploading: true }))
    setGlobalError(null)
    try {
      const [result, cid] = await Promise.all([
        uploadWASM(file),
        computeFileCID(file),
      ])
      setState(s => ({
        ...s,
        wasmCID: cid,
        wasmIPFSUrl: result.url,
        wasmUploading: false,
      }))
    } catch (e) {
      setGlobalError('Upload WASM échoué : ' + String(e))
      setState(s => ({ ...s, wasmUploading: false }))
    }
  }

  // ── Étape 2 — Upload dual bitmap ───────────────────────────

  async function handleBitmapUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    which: 'A' | 'B',
  ) {
    const file = e.target.files?.[0]
    if (!file) return
    const bytes = new Uint8Array(await file.arrayBuffer())
    const coverage = Math.round((countBits(bytes) / (bytes.length * 8)) * 100)

    if (which === 'A') {
      setState(s => ({ ...s, bitmapAFile: file, bitmapACoverage: coverage }))
    } else {
      setState(s => ({ ...s, bitmapBFile: file, bitmapBCoverage: coverage }))
    }
  }

  async function handleUploadBitmaps() {
    if (!state.bitmapAFile || !state.bitmapBFile) {
      setGlobalError('Sélectionnez les deux bitmaps A et B')
      return
    }
    setState(s => ({ ...s, bitmapUploading: true }))
    setGlobalError(null)
    try {
      const [bytesA, bytesB] = await Promise.all([
        state.bitmapAFile.arrayBuffer().then(b => new Uint8Array(b)),
        state.bitmapBFile.arrayBuffer().then(b => new Uint8Array(b)),
      ])
      const [result, cidA, cidB] = await Promise.all([
        uploadDualBitmap(bytesA, bytesB),
        computeBytesCID(bytesA),
        computeBytesCID(bytesB),
      ])
      setState(s => ({
        ...s,
        bitmapACID: cidA,
        bitmapBCID: cidB,
        bitmapUploading: false,
      }))
    } catch (e) {
      setGlobalError('Upload bitmaps échoué : ' + String(e))
      setState(s => ({ ...s, bitmapUploading: false }))
    }
  }

  // ── Étape 4 — ECIES ───────────────────────────────────────

  function handleGenerateKeys() {
    try {
      const pair = generateECIESKeyPair()
      setState(s => ({ ...s, keyPair: pair, keySaved: false }))
    } catch (e) {
      setGlobalError('Erreur génération clés : ' + String(e))
    }
  }

  function handleDownloadKey() {
    if (!state.keyPair) return
    const blob = new Blob([state.keyPair.privateKeyHex], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'ztb_private_key.txt'
    a.click()
    URL.revokeObjectURL(url)
    setState(s => ({ ...s, keySaved: true }))
  }

  // ── Étape 5 — Reward ──────────────────────────────────────

  function handleRewardChange(value: string) {
    const floor = state.mode === 1
      ? (parseFloat(value) * 0.7).toFixed(2)
      : value
    setState(s => ({ ...s, rewardUsdt: value, rewardFloorUsdt: floor }))
  }

  // ── Étape 6 — createBounty() ──────────────────────────────

  async function handleCreateBounty() {
    setGlobalError(null)

    if (!state.wasmCID)          return setGlobalError('Uploadez le WASM d\'abord')
    if (!state.bitmapACID)       return setGlobalError('Uploadez les bitmaps d\'abord')
    if (!state.keyPair)          return setGlobalError('Générez la clé ECIES d\'abord')
    if (!state.keySaved)         return setGlobalError('Téléchargez la clé privée d\'abord')
    if (!state.rewardUsdt)       return setGlobalError('Définissez la récompense USDT')

    try {
      await createBounty({
        targetCID:           state.wasmCID as `0x${string}`,
        staticPropsHash:     '0x' + '0'.repeat(64) as `0x${string}`, // Youssef livrera
        baselineMerkleRootA: '0x' + '0'.repeat(64) as `0x${string}`, // Youssef livrera
        baselineMerkleRootB: '0x' + '0'.repeat(64) as `0x${string}`, // Youssef livrera
        baselineHashA:       state.bitmapACID as `0x${string}`,
        baselineHashB:       state.bitmapBCID as `0x${string}`,
        financialConfigHash: '0x' + '0'.repeat(64) as `0x${string}`, // calculé localement
        domain:              state.domain,
        mode:                state.mode,
        extractionReceipt:   '0x' as `0x${string}`,                  // Youssef livrera
        maxSteps:            1000000n,
        eciesPublicKey:      state.keyPair.publicKeyHex as `0x${string}`,
        rewardUsdt:          state.rewardUsdt,
        rewardFloorUsdt:     state.rewardFloorUsdt || state.rewardUsdt,
      })
    } catch (e) {
      setGlobalError('createBounty échoué : ' + String(e))
    }
  }

  // ── Utilitaire ────────────────────────────────────────────

  function countBits(bytes: Uint8Array): number {
    return bytes.reduce((acc, b) => acc + popcount(b), 0)
  }
  function popcount(n: number): number {
    let c = 0
    while (n) { c += n & 1; n >>= 1 }
    return c
  }

  // ── Vérification complétude ───────────────────────────────

  const step1Done = !!state.wasmCID
  const step2Done = !!state.bitmapACID && !!state.bitmapBCID
  const step3Done = true // toujours une valeur par défaut
  const step4Done = !!state.keyPair && state.keySaved
  const step5Done = !!state.rewardUsdt
  const allDone   = step1Done && step2Done && step3Done && step4Done && step5Done

  // ── Render ────────────────────────────────────────────────

  if (!mounted) return null

  return (
    <main className="app-shell">
      <div className="sponsor-wrap">

        {/* Header */}
        <header className="glass-panel stagger-in sponsor-header">
          <div className="sponsor-header-top">
            <h1 className="hero-title title-gradient sponsor-title">
              Interface Sponsor
            </h1>
            <span className="status-chip ok">V4.3 · Sepolia</span>
          </div>
          <p className="muted sponsor-subtitle">
            Créez un bounty décentralisé — verrouillez vos USDT, recevez les exploits chiffrés.
          </p>
        </header>

        {/* Erreur globale */}
        {globalError && (
          <div className="glass-panel stagger-in" style={{ padding: '14px 20px', borderColor: 'rgba(199,116,116,0.4)' }}>
            <p className="error-note">⚠️ {globalError}</p>
          </div>
        )}

        {/* ── Étape 0 — Wallet ── */}
        <section className="glass-panel stagger-in sponsor-step">
          <p className="step-title">Étape 1 — Connexion Wallet</p>
          {isConnected ? (
            <div className="sponsor-col">
              <span className={`status-chip ${isOnSepolia ? 'ok' : 'bad'}`}>
                {isOnSepolia ? '✅ Sepolia' : '❌ Passez sur Sepolia'}
              </span>
              <div className="mono-box address-text">{address}</div>
              <button onClick={() => disconnect()} className="app-btn danger fit-content">
                Déconnecter
              </button>
            </div>
          ) : (
            <button
              onClick={() => metaMaskConnector && connect({ connector: metaMaskConnector })}
              className="app-btn primary fit-content"
              disabled={!metaMaskConnector}
            >
              Connecter MetaMask
            </button>
          )}
        </section>

        {isConnected && isOnSepolia && (
          <>
            {/* ── Étape 1 — WASM ── */}
            <section className="glass-panel stagger-in delay-1 sponsor-step">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p className="step-title" style={{ margin: 0 }}>Étape 2 — Upload WASM instrumenté</p>
                {step1Done && <span className="status-chip ok">✅ Uploadé</span>}
              </div>

              <label className="app-btn secondary fit-content" style={{ cursor: 'pointer' }}>
                {state.wasmUploading ? 'Upload en cours...' : 'Sélectionner .wasm'}
                <input type="file" accept=".wasm" onChange={handleWASMUpload} style={{ display: 'none' }} disabled={state.wasmUploading} />
              </label>

              {state.wasmFile && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p className="muted key-label">Fichier</p>
                  <div className="mono-box" style={{ color: '#b8d6ea' }}>{state.wasmFile.name} — {(state.wasmFile.size / 1024).toFixed(1)} KB</div>
                  {state.wasmCID && (
                    <>
                      <p className="muted key-label">CIDv1 (targetCID on-chain)</p>
                      <div className="mono-box pub-key">{state.wasmCID}</div>
                    </>
                  )}
                </div>
              )}
            </section>

            {/* ── Étape 2 — Dual Bitmap ── */}
            <section className="glass-panel stagger-in delay-1 sponsor-step">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p className="step-title" style={{ margin: 0 }}>Étape 3 — Upload Dual Bitmap Baseline</p>
                {step2Done && <span className="status-chip ok">✅ Uploadé</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Bitmap A */}
                <div>
                  <p className="muted key-label">Bitmap A — Hash AFL XOR</p>
                  <label className="app-btn secondary fit-content" style={{ cursor: 'pointer', display: 'block' }}>
                    {state.bitmapAFile ? state.bitmapAFile.name : 'Sélectionner baseline_a.bin'}
                    <input type="file" accept=".bin" onChange={e => handleBitmapUpload(e, 'A')} style={{ display: 'none' }} />
                  </label>
                  {state.bitmapAFile && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ background: 'rgba(11,22,36,0.76)', borderRadius: 8, padding: '6px 10px', marginBottom: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span className="muted" style={{ fontSize: '0.78rem' }}>Couverture A</span>
                          <span style={{ fontSize: '0.78rem', color: state.bitmapACoverage >= 20 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                            {state.bitmapACoverage}%
                          </span>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 6 }}>
                          <div style={{ width: `${Math.min(state.bitmapACoverage, 100)}%`, background: state.bitmapACoverage >= 20 ? '#4ade80' : '#f87171', height: 6, borderRadius: 4, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                      {state.bitmapACoverage < 20 && (
                        <p className="error-note">⚠️ Couverture insuffisante — minimum 20% requis</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Bitmap B */}
                <div>
                  <p className="muted key-label">Bitmap B — Hash Knuth multiplicatif</p>
                  <label className="app-btn secondary fit-content" style={{ cursor: 'pointer', display: 'block' }}>
                    {state.bitmapBFile ? state.bitmapBFile.name : 'Sélectionner baseline_b.bin'}
                    <input type="file" accept=".bin" onChange={e => handleBitmapUpload(e, 'B')} style={{ display: 'none' }} />
                  </label>
                  {state.bitmapBFile && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ background: 'rgba(11,22,36,0.76)', borderRadius: 8, padding: '6px 10px', marginBottom: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span className="muted" style={{ fontSize: '0.78rem' }}>Couverture B</span>
                          <span style={{ fontSize: '0.78rem', color: state.bitmapBCoverage >= 20 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                            {state.bitmapBCoverage}%
                          </span>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 6 }}>
                          <div style={{ width: `${Math.min(state.bitmapBCoverage, 100)}%`, background: state.bitmapBCoverage >= 20 ? '#4ade80' : '#f87171', height: 6, borderRadius: 4, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                      {state.bitmapBCoverage < 20 && (
                        <p className="error-note">⚠️ Couverture insuffisante — minimum 20% requis</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {state.bitmapAFile && state.bitmapBFile && !step2Done && (
                <button
                  onClick={handleUploadBitmaps}
                  className="app-btn secondary fit-content"
                  style={{ marginTop: 12 }}
                  disabled={state.bitmapUploading || state.bitmapACoverage < 20 || state.bitmapBCoverage < 20}
                >
                  {state.bitmapUploading ? 'Upload en cours...' : 'Uploader les deux bitmaps'}
                </button>
              )}
            </section>

            {/* ── Étape 3 — Domaine + Mode ── */}
            <section className="glass-panel stagger-in delay-2 sponsor-step">
              <p className="step-title">Étape 4 — Configuration Oracle</p>

              {/* Domaine */}
              <div style={{ marginBottom: 20 }}>
                <p className="muted key-label">Domaine</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {([0, 1, 2] as Domain[]).map(d => (
                    <button
                      key={d}
                      onClick={() => setState(s => ({ ...s, domain: d }))}
                      className={`app-btn ${state.domain === d ? 'primary' : 'secondary'}`}
                      style={{ minWidth: 140 }}
                    >
                      {DOMAIN_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>

              {/* FinancialConfig si FINANCIAL */}
              {state.domain === 0 && (
                <div style={{ marginBottom: 20, padding: '14px', background: 'rgba(11,22,36,0.5)', borderRadius: 12, border: '1px solid rgba(123,151,186,0.2)' }}>
                  <p className="muted key-label" style={{ marginBottom: 8 }}>FinancialConfig — max 8 indices, delta ≤ 20%</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 6 }}>Indices autorisés (séparés par virgule)</p>
                      <input
                        type="text"
                        placeholder="ex: 0,1,2,3"
                        className="mono-box"
                        style={{ width: '100%', color: '#b8d6ea', outline: 'none' }}
                        onChange={e => {
                          const indices = e.target.value.split(',').map(Number).filter(n => !isNaN(n)).slice(0, 8)
                          setState(s => ({ ...s, financialConfig: { ...s.financialConfig, authorizedIndices: indices } }))
                        }}
                      />
                    </div>
                    <div>
                      <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 6 }}>Delta maximum (%)</p>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={state.financialConfig.maxDeltaPct}
                        className="mono-box"
                        style={{ width: '100%', color: '#b8d6ea', outline: 'none' }}
                        onChange={e => setState(s => ({ ...s, financialConfig: { ...s.financialConfig, maxDeltaPct: Math.min(20, parseInt(e.target.value) || 10) } }))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Mode */}
              <div>
                <p className="muted key-label">Mode de vérification</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {([0, 1] as VerificationMode[]).map(m => (
                    <button
                      key={m}
                      onClick={() => {
                        setState(s => ({
                          ...s,
                          mode: m,
                          rewardFloorUsdt: m === 1 && s.rewardUsdt ? (parseFloat(s.rewardUsdt) * 0.7).toFixed(2) : s.rewardUsdt,
                        }))
                      }}
                      className={`app-btn ${state.mode === m ? 'primary' : 'secondary'}`}
                      style={{ minWidth: 200 }}
                    >
                      {m === 0 ? 'STRICT — 100%' : 'RELAXED — 70% / 100%'}
                    </button>
                  ))}
                </div>
                <p className="muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>
                  {MODE_LABELS[state.mode]}
                </p>
              </div>
            </section>

            {/* ── Étape 4 — ECIES ── */}
            <section className="glass-panel stagger-in delay-2 sponsor-key-step">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p className="step-plain">Étape 5 — Clé ECIES</p>
                  <p className="muted step-meta">secp256k1 + HKDF-SHA256 + AES-256-GCM · IV 96 bits</p>
                </div>
                {step4Done && <span className="status-chip ok">✅ Prête</span>}
              </div>

              {!state.keyPair && (
                <button onClick={handleGenerateKeys} className="app-btn secondary fit-content">
                  Générer la paire de clés
                </button>
              )}

              {state.keyPair && (
                <div className="sponsor-key-grid">
                  <div>
                    <p className="muted key-label">Clé publique — stockée on-chain</p>
                    <div className="mono-box pub-key">{state.keyPair.publicKeyHex}</div>
                  </div>
                  <div>
                    <p className="muted key-label">Clé privée — garder hors ligne</p>
                    <div className={`mono-box priv-key ${state.keySaved ? '' : 'is-blurred'}`}>
                      {state.keyPair.privateKeyHex}
                    </div>
                    {!state.keySaved && (
                      <p className="key-warning">⚠️ Télécharge et sauvegarde cette clé hors ligne.</p>
                    )}
                  </div>
                  <div className="btn-row">
                    <button onClick={handleDownloadKey} className="app-btn warn">
                      ⬇ Télécharger la clé privée
                    </button>
                    <button onClick={handleGenerateKeys} className="app-btn secondary">
                      ↺ Régénérer
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* ── Étape 5 — Reward ── */}
            <section className="glass-panel stagger-in delay-3 sponsor-step">
              <p className="step-title">Étape 6 — Récompense USDT</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <p className="muted key-label">Récompense totale (USDT)</p>
                  <input
                    type="number"
                    min={1}
                    placeholder="ex: 1000"
                    value={state.rewardUsdt}
                    className="mono-box"
                    style={{ width: '100%', color: '#4ade80', outline: 'none', fontSize: '1.1rem' }}
                    onChange={e => handleRewardChange(e.target.value)}
                  />
                </div>
                {state.mode === 1 && (
                  <div>
                    <p className="muted key-label">Reward Floor RELAXED sans C3 (USDT)</p>
                    <input
                      type="number"
                      min={1}
                      value={state.rewardFloorUsdt}
                      className="mono-box"
                      style={{ width: '100%', color: '#e2cfac', outline: 'none', fontSize: '1.1rem' }}
                      onChange={e => setState(s => ({ ...s, rewardFloorUsdt: e.target.value }))}
                    />
                    <p className="muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>
                      Calculé automatiquement à 70% — modifiable
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* ── Étape 6 — createBounty() ── */}
            <section className="glass-panel stagger-in delay-3 sponsor-step">
              <p className="step-title">Étape 7 — Créer le Bounty</p>

              {/* Récapitulatif */}
              <div style={{ background: 'rgba(11,22,36,0.5)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <RecapRow label="WASM"     value={step1Done ? '✅ Uploadé' : '❌ Manquant'} ok={step1Done} />
                <RecapRow label="Bitmaps"  value={step2Done ? '✅ A + B uploadés' : '❌ Manquants'} ok={step2Done} />
                <RecapRow label="Domaine"  value={DOMAIN_LABELS[state.domain]} ok />
                <RecapRow label="Mode"     value={state.mode === 0 ? 'STRICT' : 'RELAXED'} ok />
                <RecapRow label="ECIES"    value={step4Done ? '✅ Clé sauvegardée' : state.keyPair ? '⚠️ Clé non sauvegardée' : '❌ Manquante'} ok={step4Done} />
                <RecapRow label="Reward"   value={state.rewardUsdt ? `${state.rewardUsdt} USDT` : '❌ Manquant'} ok={!!state.rewardUsdt} />
              </div>

              <button
                onClick={handleCreateBounty}
                className="app-btn primary"
                disabled={!allDone || isPending}
                style={{ opacity: allDone ? 1 : 0.5 }}
              >
                {isPending ? 'En attente MetaMask...' : 'Créer le Bounty — Verrouiller USDT'}
              </button>

              {/* Statut Tx */}
              {isSuccess && txHash && (
                <div style={{ marginTop: 12 }}>
                  <span className="status-chip ok">✅ Bounty créé</span>
                  <div className="mono-box" style={{ marginTop: 8, color: '#4ade80' }}>
                    Tx : {txHash}
                  </div>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="app-btn secondary fit-content"
                    style={{ display: 'inline-block', marginTop: 8, textDecoration: 'none' }}
                  >
                    Voir sur Etherscan →
                  </a>
                </div>
              )}

              {isError && (
                <p className="error-note" style={{ marginTop: 8 }}>
                  ❌ {error?.message ?? 'Transaction échouée'}
                </p>
              )}
            </section>

          </>
        )}

        {/* Mauvais réseau */}
        {isConnected && !isOnSepolia && (
          <div className="glass-panel stagger-in network-warning">
            Changez vers le réseau <strong>Sepolia</strong> dans MetaMask pour continuer
          </div>
        )}

      </div>
    </main>
  )
}

// ── Composant récapitulatif ────────────────────────────────────

function RecapRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span className="muted" style={{ fontSize: '0.85rem' }}>{label}</span>
      <span style={{ fontSize: '0.85rem', color: ok ? '#4ade80' : '#f87171', fontFamily: 'monospace' }}>
        {value}
      </span>
    </div>
  )
}