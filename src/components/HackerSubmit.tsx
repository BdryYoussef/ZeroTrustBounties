'use client'

// src/components/HackerSubmit.tsx — ZTB Hacker Submission Portal
// Flow: Wallet → Lookup bounty → Upload proof.json + chiffrement ECIES → Commit ETH → Submit

import { useState, useCallback, useRef } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import {
  useBounty,
  useRequiredStake,
  useZTBContract,
  computeCommitment,
} from '@/hooks/useZTBContract'
import { encryptJsonPayload } from '@/src/utils/crypto'
import {
  DOMAIN_LABELS,
  STATE_LABELS,
  type BountyState,
  type Domain,
  type VerificationMode,
} from '@/lib/abi/ZTBEscrow.abi'
import { formatUnits } from 'viem'

// ── Types ─────────────────────────────────────────────────────


interface HackerState {
  // Étape bounty
  bountyIdInput: string
  bountyId:      bigint | null

  // Étape proof
  proofFile:        File | null
  proofJson:        object | null
  proofRawBytes:    Uint8Array | null
  encryptedHex:     `0x${string}` | null
  payloadHash:      `0x${string}` | null
  payloadLength:    number
  nonce:            bigint | null
  encrypting:       boolean

  // Étape commit
  commitTxHash:  string
  commitDone:    boolean

  // Étape submit
  groth16Receipt: string
  submitTxHash:  string
  submitDone:    boolean

  globalError:   string | null
}

// ── Composant principal ───────────────────────────────────────

export default function HackerSubmit() {
  const { address, isConnected } = useAccount()
  const { connect, connectors }  = useConnect()
  const { disconnect }           = useDisconnect()
  const chainId                  = useChainId()
  const isOnSepolia              = chainId === 11155111
  const metaMaskConnector =
    connectors.find(c => c.name.toLowerCase().includes('metamask')) ?? connectors[0]

  const [state, setState] = useState<HackerState>({
    bountyIdInput: '',
    bountyId:      null,
    proofFile:        null,
    proofJson:        null,
    proofRawBytes:    null,
    encryptedHex:     null,
    payloadHash:      null,
    payloadLength:    0,
    nonce:            null,
    encrypting:       false,
    commitTxHash:  '',
    commitDone:    false,
    groth16Receipt: '',
    submitTxHash:  '',
    submitDone:    false,
    globalError:   null,
  })

  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Lecture on-chain ───────────────────────────────────────

  const bountyQuery    = useBounty(state.bountyId ?? 0n)
  const bountyData     = state.bountyId != null ? bountyQuery.data as readonly unknown[] | undefined : undefined

  // bountyData layout (from ABI): [targetCID, staticPropsHash, ..., reward, rewardFloor, maxSteps, createdAt, proofsOpenAt, state, sponsor, eciesPublicKey]
  const bountyReward      = bountyData?.[9]  as bigint | undefined
  const bountyRewardFloor = bountyData?.[10] as bigint | undefined
  const bountyMode        = bountyData?.[8]  as VerificationMode | undefined
  const bountyDomain      = bountyData?.[7]  as Domain | undefined
  const bountyState       = bountyData?.[14] as BountyState | undefined
  const bountySponsor     = bountyData?.[15] as `0x${string}` | undefined
  const bountyEciesPubKey = bountyData?.[16] as `0x${string}` | undefined

  const stakeQuery = useRequiredStake(
    address ?? '0x0000000000000000000000000000000000000000',
    state.bountyId ?? 0n,
    BigInt(state.payloadLength),
  )
  const requiredStake = stakeQuery.data as bigint | undefined

  // ── Contract write ────────────────────────────────────────

  const {
    commitProof,
    submitProof,
    isPending,
    isSuccess,
    isError,
    error,
    txHash,
    reset,
  } = useZTBContract()

  // ── Étape bounty ──────────────────────────────────────────

  function handleBountyLookup() {
    const id = parseInt(state.bountyIdInput)
    if (isNaN(id) || id < 0) {
      setState(s => ({ ...s, globalError: 'Bounty ID invalide' }))
      return
    }
    setState(s => ({ ...s, bountyId: BigInt(id), globalError: null }))
  }

  // ── Étape proof — file handling ───────────────────────────

  async function processProofFile(file: File) {
    setState(s => ({ ...s, globalError: null, proofFile: file, proofJson: null, encryptedHex: null }))

    if (!file.name.endsWith('.json')) {
      setState(s => ({ ...s, globalError: 'Sélectionnez un fichier .json' }))
      return
    }

    let parsed: object
    try {
      const text = await file.text()
      parsed = JSON.parse(text)
    } catch {
      setState(s => ({ ...s, globalError: 'Fichier JSON invalide' }))
      return
    }

    if (!bountyEciesPubKey) {
      setState(s => ({ ...s, globalError: 'Clé publique sponsor introuvable — vérifiez le Bounty ID' }))
      return
    }

    setState(s => ({ ...s, proofJson: parsed, encrypting: true }))

    try {
      const result = await encryptJsonPayload(parsed, bountyEciesPubKey)
      const rawBytes = new TextEncoder().encode(JSON.stringify(parsed))
      setState(s => ({
        ...s,
        encryptedHex:  result.encryptedHex,
        payloadHash:   result.payloadHash,
        payloadLength: result.payloadLength,
        proofRawBytes: rawBytes,
        nonce:         result.nonce,
        encrypting:    false,
      }))
    } catch (e) {
      setState(s => ({
        ...s,
        encrypting: false,
        globalError: 'Chiffrement ECIES échoué : ' + String(e),
      }))
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processProofFile(file)
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processProofFile(file)
  }, [bountyEciesPubKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Étape commit ──────────────────────────────────────────

  async function handleCommit() {
    if (!address || !state.bountyId || !state.payloadHash || !state.nonce || !requiredStake) return
    setState(s => ({ ...s, globalError: null }))
    reset()

    const commitment = computeCommitment(address, state.payloadHash, state.nonce)

    try {
      await commitProof({
        bountyId:   state.bountyId,
        commitment,
        stakeWei:   requiredStake,
      })
      setState(s => ({ ...s, commitDone: true, commitTxHash: txHash ?? '' }))
    } catch (e) {
      setState(s => ({ ...s, globalError: 'commitProof échoué : ' + String(e) }))
    }
  }

  // ── Étape submit ──────────────────────────────────────────

  async function handleSubmit() {
    if (
      !state.bountyId ||
      !state.encryptedHex ||
      !state.payloadHash ||
      !state.nonce ||
      !state.payloadLength
    ) return

    setState(s => ({ ...s, globalError: null }))
    reset()

    const receipt = state.groth16Receipt.trim().startsWith('0x')
      ? state.groth16Receipt.trim() as `0x${string}`
      : ('0x' + state.groth16Receipt.trim()) as `0x${string}`

    try {
      await submitProof({
        bountyId:         state.bountyId,
        groth16Receipt:   receipt,
        encryptedPayload: state.encryptedHex,
        payloadHash:      state.payloadHash,
        nonce:            state.nonce,
        payloadLength:    BigInt(state.payloadLength),
      })
      setState(s => ({ ...s, submitDone: true, submitTxHash: txHash ?? '' }))
    } catch (e) {
      setState(s => ({ ...s, globalError: 'submitProof échoué : ' + String(e) }))
    }
  }

  // ── Dériver l'étape courante ──────────────────────────────

  const walletOk   = isConnected && isOnSepolia
  const bountyOk   = walletOk && !!bountyData && bountyState === 1
  const proofReady = bountyOk && !!state.encryptedHex && !state.encrypting
  const commitOk   = proofReady && (state.commitDone || (isSuccess && !!txHash))
  const submitReady = commitOk && state.groth16Receipt.length > 2

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="hacker-wrap">

      {/* Header */}
      <header className="glass-panel stagger-in hacker-header">
        <div className="hacker-header-top">
          <div>
            <div className="home-tag" style={{ marginBottom: 12 }}>Portail Hacker · ZTB V4.3</div>
            <h1 className="hero-title title-gradient hacker-title">
              Hacker Submission<br />Portal
            </h1>
          </div>
          <span className="status-chip ok">Sepolia · ECIES</span>
        </div>
        <p className="muted" style={{ marginTop: 10, fontSize: '0.93rem', lineHeight: 1.65 }}>
          Soumettez un exploit chiffré en 4 étapes — votre payload ne quitte jamais le navigateur non-chiffré.
        </p>
      </header>

      {/* Erreur globale */}
      {state.globalError && (
        <div className="glass-panel stagger-in hacker-error-banner">
          <span className="hacker-error-icon">⚠</span>
          <span>{state.globalError}</span>
        </div>
      )}

      {/* ── Étape 1 — Wallet ─────────────────────────────── */}
      <section className="glass-panel stagger-in hacker-step">
        <div className="hacker-step-header">
          <div className="hacker-step-badge">01</div>
          <div>
            <p className="step-plain">Connexion Wallet</p>
            <p className="muted step-meta">MetaMask · réseau Sepolia requis</p>
          </div>
          {walletOk && <span className="status-chip ok">✅ Connecté</span>}
        </div>

        {isConnected ? (
          <div className="sponsor-col" style={{ marginTop: 14 }}>
            <span className={`status-chip ${isOnSepolia ? 'ok' : 'bad'} fit-content`}>
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
            style={{ marginTop: 14 }}
            disabled={!metaMaskConnector}
          >
            Connecter MetaMask
          </button>
        )}
      </section>

      {/* ── Étape 2 — Bounty lookup ───────────────────────── */}
      <section className={`glass-panel stagger-in delay-1 hacker-step ${!walletOk ? 'hacker-step-disabled' : ''}`}>
        <div className="hacker-step-header">
          <div className="hacker-step-badge">02</div>
          <div>
            <p className="step-plain">Sélectionner un Bounty</p>
            <p className="muted step-meta">Lecture on-chain · ACTIVE requis</p>
          </div>
          {bountyOk && <span className="status-chip ok">✅ Bounty chargé</span>}
        </div>

        {walletOk && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="hacker-input-row">
              <input
                type="number"
                min={0}
                placeholder="ex: 0"
                value={state.bountyIdInput}
                onChange={e => setState(s => ({ ...s, bountyIdInput: e.target.value }))}
                className="mono-box hacker-id-input"
                style={{ color: '#b8d6ea', outline: 'none', flex: 1 }}
                disabled={!walletOk}
              />
              <button
                onClick={handleBountyLookup}
                className="app-btn secondary"
                disabled={!walletOk || !state.bountyIdInput}
              >
                Charger →
              </button>
            </div>

            {/* Bounty info card */}
            {state.bountyId != null && (
              <div className="hacker-bounty-card">
                {bountyQuery.isLoading && (
                  <p className="muted" style={{ fontSize: '0.88rem' }}>Chargement...</p>
                )}
                {bountyQuery.isError && (
                  <p className="error-note">Erreur lecture on-chain</p>
                )}
                {bountyData && (
                  <div className="hacker-bounty-grid">
                    <BountyInfoRow label="État" value={
                      bountyState !== undefined ? STATE_LABELS[bountyState] : '—'
                    } ok={bountyState === 1} />
                    <BountyInfoRow label="Récompense" value={
                      bountyReward !== undefined
                        ? formatUnits(bountyReward, 6) + ' USDT'
                        : '—'
                    } ok={true} />
                    {bountyMode === 1 && bountyRewardFloor !== undefined && (
                      <BountyInfoRow label="Floor RELAXED" value={formatUnits(bountyRewardFloor, 6) + ' USDT'} ok={true} />
                    )}
                    <BountyInfoRow label="Domaine" value={bountyDomain !== undefined ? DOMAIN_LABELS[bountyDomain] : '—'} ok={true} />
                    <BountyInfoRow label="Mode" value={bountyMode !== undefined ? (bountyMode === 0 ? 'STRICT' : 'RELAXED') : '—'} ok={true} />
                    <BountyInfoRow label="Sponsor" value={bountySponsor ? bountySponsor.slice(0, 10) + '…' + bountySponsor.slice(-6) : '—'} ok={true} />
                    {bountyState !== 1 && (
                      <p className="error-note" style={{ marginTop: 4 }}>⚠️ Ce bounty n&apos;est pas ACTIVE — impossible de soumettre</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Étape 3 — Upload proof.json ───────────────────── */}
      <section className={`glass-panel stagger-in delay-2 hacker-step ${!bountyOk ? 'hacker-step-disabled' : ''}`}>
        <div className="hacker-step-header">
          <div className="hacker-step-badge">03</div>
          <div>
            <p className="step-plain">Upload & Chiffrement ECIES</p>
            <p className="muted step-meta">proof.json chiffré avec la clé publique du Sponsor</p>
          </div>
          {proofReady && <span className="status-chip ok">✅ Chiffré</span>}
        </div>

        {bountyOk && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Drop zone */}
            <div
              className={`hacker-dropzone ${isDragging ? 'hacker-dropzone-active' : ''} ${state.encrypting ? 'hacker-dropzone-loading' : ''}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
              aria-label="Zone d'upload proof.json"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              {state.encrypting ? (
                <div className="hacker-dropzone-content">
                  <div className="hacker-spinner" />
                  <span className="muted" style={{ fontSize: '0.88rem' }}>Chiffrement ECIES en cours…</span>
                </div>
              ) : state.proofFile ? (
                <div className="hacker-dropzone-content">
                  <span className="hacker-dropzone-icon">📄</span>
                  <span style={{ color: '#b8d6ea', fontWeight: 700 }}>{state.proofFile.name}</span>
                  <span className="muted" style={{ fontSize: '0.8rem' }}>
                    {(state.proofFile.size / 1024).toFixed(2)} KB · Cliquez pour remplacer
                  </span>
                </div>
              ) : (
                <div className="hacker-dropzone-content">
                  <span className="hacker-dropzone-icon">🔒</span>
                  <span style={{ fontWeight: 700 }}>Glissez proof.json ou cliquez</span>
                  <span className="muted" style={{ fontSize: '0.8rem' }}>Format JSON requis</span>
                </div>
              )}
            </div>

            {/* Résultats chiffrement */}
            {proofReady && (
              <div className="hacker-crypto-results">
                <div className="hacker-crypto-badge">
                  <span className="hacker-crypto-badge-dot" />
                  Chiffrement ECIES · secp256k1 + AES-256-GCM
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <p className="muted key-label">Payload Hash (SHA-256)</p>
                    <div className="mono-box pub-key hacker-truncate">{state.payloadHash}</div>
                  </div>
                  <div>
                    <p className="muted key-label">Payload chiffré ({state.payloadLength} bytes → ECIES)</p>
                    <div className="mono-box hacker-truncate" style={{ color: '#c5d3e4' }}>
                      {state.encryptedHex?.slice(0, 80)}…
                    </div>
                  </div>
                  {requiredStake !== undefined && (
                    <div className="hacker-stake-pill">
                      <span className="muted" style={{ fontSize: '0.82rem' }}>Stake requis</span>
                      <span style={{ fontWeight: 700, color: '#e2cfac' }}>
                        {formatUnits(requiredStake, 18)} ETH
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Étape 4 — Commit on-chain ─────────────────────── */}
      <section className={`glass-panel stagger-in delay-3 hacker-step ${!proofReady ? 'hacker-step-disabled' : ''}`}>
        <div className="hacker-step-header">
          <div className="hacker-step-badge">04</div>
          <div>
            <p className="step-plain">Commit on-chain</p>
            <p className="muted step-meta">Verrouille votre commitment + stake ETH · 72h pour soumettre</p>
          </div>
          {commitOk && <span className="status-chip ok">✅ Committé</span>}
        </div>

        {proofReady && !commitOk && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {requiredStake !== undefined && (
              <div className="hacker-stake-confirm">
                <div>
                  <p className="muted key-label">Stake à verrouiller</p>
                  <p style={{ fontWeight: 700, fontSize: '1.3rem', color: '#e2cfac', margin: 0 }}>
                    {formatUnits(requiredStake, 18)} ETH
                  </p>
                  <p className="muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>
                    Remboursé si l&apos;exploit est valide · Pénalité si invalide
                  </p>
                </div>
                <div>
                  <p className="muted key-label">Commitment calculé</p>
                  <div className="mono-box hacker-truncate" style={{ color: '#c5d3e4', fontSize: '0.72rem' }}>
                    {address && state.payloadHash && state.nonce
                      ? computeCommitment(address, state.payloadHash, state.nonce)
                      : '—'}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleCommit}
              className="app-btn primary fit-content"
              disabled={!proofReady || isPending}
            >
              {isPending
                ? '⏳ En attente MetaMask…'
                : `Commit — Verrouiller ${requiredStake ? formatUnits(requiredStake, 18) : '…'} ETH`}
            </button>

            {isError && (
              <p className="error-note">❌ {error?.message ?? 'Transaction échouée'}</p>
            )}
          </div>
        )}

        {commitOk && (
          <div style={{ marginTop: 12 }}>
            <p className="muted" style={{ fontSize: '0.84rem' }}>
              ✅ Committé — vous avez <strong style={{ color: '#e2cfac' }}>72 heures</strong> pour soumettre la preuve.
            </p>
          </div>
        )}
      </section>

      {/* ── Étape 5 — Submit on-chain ─────────────────────── */}
      <section className={`glass-panel stagger-in delay-3 hacker-step ${!commitOk ? 'hacker-step-disabled' : ''}`}>
        <div className="hacker-step-header">
          <div className="hacker-step-badge">05</div>
          <div>
            <p className="step-plain">Soumettre la Preuve</p>
            <p className="muted step-meta">Envoi du payload chiffré + receipt zkVM on-chain</p>
          </div>
          {state.submitDone && <span className="status-chip ok">✅ Soumis</span>}
        </div>

        {commitOk && !state.submitDone && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <p className="muted key-label">Groth16 Receipt (hex · livré par le zkVM)</p>
              <textarea
                className="mono-box hacker-receipt-input"
                placeholder="0x1234abcd… (collez le receipt zkVM compressé)"
                value={state.groth16Receipt}
                onChange={e => setState(s => ({ ...s, groth16Receipt: e.target.value }))}
                style={{ color: '#c5d3e4', outline: 'none', resize: 'vertical', width: '100%' }}
                rows={4}
              />
              <p className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                Ce receipt est généré par Youssef / le zkVM après exécution du circuit.
              </p>
            </div>

            <button
              onClick={handleSubmit}
              className="app-btn primary fit-content"
              disabled={!submitReady || isPending}
              style={{ opacity: submitReady ? 1 : 0.5 }}
            >
              {isPending
                ? '⏳ En attente MetaMask…'
                : 'Soumettre la Preuve on-chain →'}
            </button>

            {isError && (
              <p className="error-note">❌ {error?.message ?? 'Transaction échouée'}</p>
            )}
          </div>
        )}

        {/* Succès */}
        {state.submitDone && isSuccess && txHash && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="status-chip ok fit-content">🎉 Exploit soumis on-chain</span>
            <div>
              <p className="muted key-label">Transaction Hash</p>
              <div className="mono-box" style={{ color: '#4ade80' }}>{txHash}</div>
            </div>
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="app-btn secondary fit-content"
              style={{ textDecoration: 'none', display: 'inline-block' }}
            >
              Voir sur Etherscan →
            </a>
            <div className="hacker-reward-card">
              <p className="muted key-label">Récompense potentielle</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '1.4rem', color: '#4ade80' }}>
                {bountyReward !== undefined
                  ? formatUnits(bountyReward, 6) + ' USDT'
                  : '—'}
              </p>
              {bountyMode === 1 && bountyRewardFloor !== undefined && (
                <p className="muted" style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>
                  ou {formatUnits(bountyRewardFloor, 6)} USDT (RELAXED sans C3)
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

// ── Sous-composants ───────────────────────────────────────────

function BountyInfoRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span className="muted" style={{ fontSize: '0.83rem' }}>{label}</span>
      <span style={{ fontSize: '0.83rem', fontFamily: 'monospace', color: ok ? '#b8d6ea' : '#f87171', fontWeight: 600 }}>
        {value}
      </span>
    </div>
  )
}
