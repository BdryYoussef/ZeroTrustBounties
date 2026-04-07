'use client'

import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { formatUnits } from 'viem'
import { computeFileCID } from '@/lib/ipfs'
import useZTBContract, {
  useBounty,
  useTotalBounties,
  useRequiredStake,
  computeCommitment,
} from '@/hooks/useZTBContract'
import { encryptPayload, hexToBytes } from '@/lib/ecies'
import {
  DOMAIN_LABELS,
  STATE_LABELS,
  MODE_LABELS,
  type Domain,
  type BountyState,
} from '@/lib/abi/ZTBEscrow.abi'

// ── Types ─────────────────────────────────────────────────────

interface BountyInfo {
  id: bigint
  domain: Domain
  mode: number
  reward: bigint
  rewardFloor: bigint
  state: BountyState
  sponsor: string
  targetCID: string
  eciesPublicKey: string
  proofsOpenAt: bigint
  createdAt: bigint
}

type PageStep = 'list' | 'verify' | 'commit' | 'submit' | 'done'

// ── Composant principal ───────────────────────────────────────

export default function HackerPage() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const isOnSepolia = chainId === 11155111
  const metaMaskConnector =
    connectors.find(c => c.name.toLowerCase().includes('metamask')) ?? connectors[0]

  const { commitProof, submitProof, isPending, isSuccess, isError, error, txHash, reset } = useZTBContract()
  const { data: totalBounties } = useTotalBounties()

  const [step, setStep] = useState<PageStep>('list')
  const [selectedId, setSelectedId] = useState<bigint | null>(null)
  const [bountyInfo, setBountyInfo] = useState<BountyInfo | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)

  // Étape verify
  const [wasmFile, setWasmFile] = useState<File | null>(null)
  const [cidMatch, setCidMatch] = useState<boolean | null>(null)
  const [cidChecking, setCidChecking] = useState(false)

  // Étape commit
  const [payloadFile, setPayloadFile] = useState<File | null>(null)
  const [payloadLength, setPayloadLength] = useState<number>(0)
  const [nonce] = useState<bigint>(BigInt(Math.floor(Math.random() * 1e12)))
  const [commitment, setCommitment] = useState<string>('')

  // Dynamically fetch required stake based on the uploaded payload size
  const { data: requiredStake } = useRequiredStake(
    address ?? '0x0000000000000000000000000000000000000000',
    selectedId ?? BigInt(0),
    BigInt(payloadLength)
  )

  // Étape submit
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [encryptedPayload, setEncryptedPayload] = useState<string>('')
  const [encrypting, setEncrypting] = useState(false)
  const [countdown, setCountdown] = useState<string>('')

  // Countdown proofsOpenAt
  useEffect(() => {
    if (!bountyInfo) return
    const interval = setInterval(() => {
      const now = BigInt(Math.floor(Date.now() / 1000))
      const diff = bountyInfo.proofsOpenAt - now
      if (diff <= BigInt(0)) {
        setCountdown('Ouvert')
        clearInterval(interval)
      } else {
        const h = Number(diff / BigInt(3600))
        const m = Number((diff % BigInt(3600)) / BigInt(60))
        const s = Number(diff % BigInt(60))
        setCountdown(`${h}h ${m}m ${s}s`)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [bountyInfo])

  // ── Sélection d'un bounty ─────────────────────────────────

  function handleSelectBounty(info: BountyInfo) {
    setBountyInfo(info)
    setSelectedId(info.id)
    setStep('verify')
    setGlobalError(null)
    reset()
  }

  // ── Vérification CID ─────────────────────────────────────

  async function handleVerifyCID(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !bountyInfo) return
    setWasmFile(file)
    setCidChecking(true)
    setCidMatch(null)
    try {
      const localCID = await computeFileCID(file)
      const match = localCID.toLowerCase() === bountyInfo.targetCID.toLowerCase()
      setCidMatch(match)
      if (!match) setGlobalError('CID invalide — ce WASM ne correspond pas au bounty. Abandonner.')
      else setGlobalError(null)
    } catch (e) {
      setGlobalError('Erreur vérification CID : ' + String(e))
    } finally {
      setCidChecking(false)
    }
  }

  // ── Préparer le commit ────────────────────────────────────

  async function handlePrepareCommit() {
    if (!address || !payloadFile || !bountyInfo) return
    setGlobalError(null)
    try {
      const payloadBytes = new Uint8Array(await payloadFile.arrayBuffer())
      setPayloadLength(payloadBytes.length)
      const payloadCID = await computeFileCIDFromBytes(payloadBytes)
      const comm = computeCommitment(
        address as `0x${string}`,
        payloadCID,
        nonce,
      )
      setCommitment(comm)
    } catch (e) {
      setGlobalError('Erreur préparation commit : ' + String(e))
    }
  }

  async function handleCommit() {
    if (!commitment || requiredStake === undefined || requiredStake === BigInt(0) || !selectedId) return
    setGlobalError(null)
    try {
      await commitProof({
        bountyId: selectedId,
        commitment: commitment as `0x${string}`,
        stakeWei: requiredStake,
      })
    } catch (e) {
      setGlobalError('commitProof échoué : ' + String(e))
    }
  }

  // ── Chiffrer le payload ───────────────────────────────────

  async function handleEncryptPayload() {
    if (!payloadFile || !bountyInfo) return
    setEncrypting(true)
    setGlobalError(null)
    try {
      const payloadBytes = new Uint8Array(await payloadFile.arrayBuffer())
      const pubKeyBytes = hexToBytes(bountyInfo.eciesPublicKey)
      const encrypted = await encryptPayload(payloadBytes, pubKeyBytes)
      setEncryptedPayload(encrypted.serializedHex)
    } catch (e) {
      setGlobalError('Chiffrement ECIES échoué : ' + String(e))
    } finally {
      setEncrypting(false)
    }
  }

  // ── Soumettre la preuve ───────────────────────────────────

  async function handleSubmitProof() {
    if (!receiptFile || !encryptedPayload || !selectedId || !payloadFile) return
    setGlobalError(null)

    const now = BigInt(Math.floor(Date.now() / 1000))
    if (bountyInfo && now < bountyInfo.proofsOpenAt) {
      setGlobalError('Période fermée — attendez proofsOpenAt (96h après création)')
      return
    }

    try {
      const receiptBytes = new Uint8Array(await receiptFile.arrayBuffer())
      const payloadBytes = new Uint8Array(await payloadFile.arrayBuffer())
      const payloadCID = await computeFileCIDFromBytes(payloadBytes)

      await submitProof({
        bountyId: selectedId,
        groth16Receipt: ('0x' + Array.from(receiptBytes).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`,
        encryptedPayload: encryptedPayload as `0x${string}`,
        payloadHash: payloadCID,
        nonce,
        payloadLength: BigInt(payloadBytes.length),
      })
    } catch (e) {
      setGlobalError('submitProof échoué : ' + String(e))
    }
  }

  // ── Utilitaire ────────────────────────────────────────────

  async function computeFileCIDFromBytes(bytes: Uint8Array): Promise<`0x${string}`> {
    const plain = new Uint8Array(bytes)
    const hash = await crypto.subtle.digest('SHA-256', plain)
    const arr = Array.from(new Uint8Array(hash))
    return ('0x' + arr.map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <main className="app-shell">
      <div className="hacker-wrap">

        {/* Header */}
        <header className="glass-panel stagger-in hacker-header">
          <div className="hacker-header-top">
            <h1 className="hero-title title-gradient hacker-title">
              Interface Hacker
            </h1>
            <span className="status-chip ok">V4.3 · Sepolia</span>
          </div>
          <p className="muted hacker-subtitle">
            Explorez les bounties actifs, vérifiez le WASM, soumettez votre preuve ZK.
          </p>
        </header>

        {/* Erreur globale */}
        {globalError && (
          <div className="glass-panel stagger-in hacker-error-banner" style={{ padding: '14px 20px', borderColor: 'rgba(199,116,116,0.4)', color: '#f87171' }}>
            <p className="error-note">⚠️ {globalError}</p>
          </div>
        )}

        {/* Wallet */}
        <section className="glass-panel stagger-in hacker-step">
          <p className="step-title" style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Étape 1 — Connexion Wallet</p>
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
            {/* ── Liste des bounties ── */}
            {step === 'list' && (
              <section className="glass-panel stagger-in delay-1 hacker-step">
                <p className="step-title" style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Étape 2 — Bounties disponibles</p>
                {!totalBounties || Number(totalBounties) === 0 ? (
                  <p className="muted">Aucun bounty disponible pour le moment.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Array.from({ length: Number(totalBounties) }, (_, i) => BigInt(i)).map(id => (
                      <BountyCard
                        key={id.toString()}
                        bountyId={id}
                        onSelect={handleSelectBounty}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── Vérification CID ── */}
            {step === 'verify' && bountyInfo && (
              <section className="glass-panel stagger-in delay-1 hacker-step">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <p className="step-title" style={{ margin: 0, fontSize: '1.2rem' }}>Étape 2 — Vérification CID</p>
                  <button onClick={() => setStep('list')} className="app-btn secondary fit-content" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                    ← Retour
                  </button>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <p className="muted key-label">CID on-chain attendu</p>
                  <div className="mono-box pub-key">{bountyInfo.targetCID}</div>
                </div>

                <label className="app-btn secondary fit-content" style={{ cursor: 'pointer', display: 'inline-block' }}>
                  {cidChecking ? 'Vérification...' : 'Uploader votre WASM local'}
                  <input type="file" accept=".wasm" onChange={handleVerifyCID} style={{ display: 'none' }} disabled={cidChecking} />
                </label>

                {wasmFile && (
                  <div style={{ marginTop: 12 }}>
                    <div className="mono-box" style={{ color: '#b8d6ea', marginBottom: 8 }}>
                      {wasmFile.name} — {(wasmFile.size / 1024).toFixed(1)} KB
                    </div>
                    {cidMatch === true && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <span className="status-chip ok" style={{ width: 'fit-content' }}>✅ CID vérifié — WASM authentique</span>
                        <div>
                          <p className="muted key-label">Domaine</p>
                          <span className="status-chip ok" style={{ width: 'fit-content' }}>{DOMAIN_LABELS[bountyInfo.domain]}</span>
                        </div>
                        <div>
                          <p className="muted key-label">Mode</p>
                          <span className="status-chip ok" style={{ width: 'fit-content' }}>{bountyInfo.mode === 0 ? 'STRICT — 100%' : 'RELAXED — 70%/100%'}</span>
                        </div>
                        <div>
                          <p className="muted key-label">Reward</p>
                          <span style={{ color: '#4ade80', fontFamily: 'monospace', fontWeight: 700 }}>
                            {formatUnits(bountyInfo.reward, 6)} USDT
                          </span>
                        </div>
                        <button
                          onClick={() => setStep('commit')}
                          className="app-btn primary fit-content"
                        >
                          Continuer vers le Commit →
                        </button>
                      </div>
                    )}
                    {cidMatch === false && (
                      <span className="status-chip bad" style={{ width: 'fit-content' }}>❌ CID invalide — abandonner ce bounty</span>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ── Commit ── */}
            {step === 'commit' && bountyInfo && (
              <section className="glass-panel stagger-in delay-1 hacker-step">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <p className="step-title" style={{ margin: 0, fontSize: '1.2rem' }}>Étape 3 — Engagement (Commit)</p>
                  <button onClick={() => setStep('verify')} className="app-btn secondary fit-content" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                    ← Retour
                  </button>
                </div>

                {/* Upload payload */}
                <div style={{ marginBottom: 16 }}>
                  <p className="muted key-label">Votre payload exploit</p>
                  <label className="app-btn secondary fit-content" style={{ cursor: 'pointer', display: 'inline-block' }}>
                    {payloadFile ? payloadFile.name : 'Sélectionner le payload (.json)'}
                    <input type="file" onChange={async e => {
                      const f = e.target.files?.[0]
                      if (f) {
                        setPayloadFile(f)
                        // Trigger preparation logically after state is updated or handle below 
                      }
                    }} style={{ display: 'none' }} />
                  </label>

                  {payloadFile && (!commitment) && (
                    <button className="app-btn secondary" style={{ marginLeft: 8 }} onClick={handlePrepareCommit}>
                      Calculer Hash & Stakes
                    </button>
                  )}
                </div>

                {/* Stake */}
                {payloadFile && requiredStake !== undefined && commitment && (
                  <div style={{ marginBottom: 16 }}>
                    <p className="muted key-label">Stake requis</p>
                    <div className="mono-box hacker-stake-pill" style={{ color: '#fbbf24' }}>
                      {formatUnits(requiredStake, 18)} ETH
                      <span className="muted" style={{ fontSize: '0.78rem', marginLeft: 8 }}>
                        (BASE + pénalité liée à vos {payloadLength} bytes)
                      </span>
                    </div>
                  </div>
                )}

                {/* Commitment */}
                {commitment && (
                  <div style={{ marginBottom: 16 }}>
                    <p className="muted key-label">Commitment — keccak256(address || sha256(payload) || nonce)</p>
                    <div className="mono-box pub-key">{commitment}</div>
                  </div>
                )}

                <button
                  onClick={handleCommit}
                  className="app-btn primary fit-content"
                  disabled={!commitment || isPending || !requiredStake}
                >
                  {isPending ? 'En attente MetaMask...' : `Engager ${requiredStake ? formatUnits(requiredStake, 18) : '0'} ETH`}
                </button>

                {isSuccess && step === 'commit' && (
                  <div style={{ marginTop: 12 }}>
                    <span className="status-chip ok" style={{ width: 'fit-content' }}>✅ Commit enregistré</span>
                    <div className="mono-box" style={{ marginTop: 8, color: '#4ade80' }}>Tx : {txHash}</div>
                    <button
                      onClick={() => { reset(); setStep('submit') }}
                      className="app-btn primary fit-content"
                      style={{ marginTop: 8 }}
                    >
                      Continuer vers la Soumission →
                    </button>
                  </div>
                )}
                {isError && (
                  <p className="error-note" style={{ marginTop: 8 }}>❌ {error?.message}</p>
                )}
              </section>
            )}

            {/* ── Submit ── */}
            {step === 'submit' && bountyInfo && (
              <section className="glass-panel stagger-in delay-1 hacker-step">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <p className="step-title" style={{ margin: 0, fontSize: '1.2rem' }}>Étape 4 — Soumission de Preuve</p>
                  <button onClick={() => setStep('commit')} className="app-btn secondary fit-content" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                    ← Retour
                  </button>
                </div>

                {/* Countdown */}
                {countdown && countdown !== 'Ouvert' && (
                  <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(99,61,0,0.3)', borderRadius: 10, border: '1px solid rgba(251,191,36,0.3)' }}>
                    <p className="muted key-label">Ouverture des preuves dans</p>
                    <p style={{ color: '#fbbf24', fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700 }}>{countdown}</p>
                    <p className="muted" style={{ fontSize: '0.78rem' }}>proofsOpenAt = createdAt + 96h — INV-11</p>
                  </div>
                )}

                {/* Receipt Groth16 */}
                <div style={{ marginBottom: 16 }}>
                  <p className="muted key-label">Receipt Groth16 (généré par le zkVM)</p>
                  <label className="app-btn secondary fit-content" style={{ cursor: 'pointer', display: 'inline-block' }}>
                    {receiptFile ? receiptFile.name : 'Sélectionner le receipt (.bin)'}
                    <input type="file" onChange={e => setReceiptFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
                  </label>
                </div>

                {/* Chiffrement ECIES */}
                <div style={{ marginBottom: 16 }}>
                  <p className="muted key-label">Chiffrement payload avec clé publique sponsor</p>
                  {!encryptedPayload ? (
                    <button
                      onClick={handleEncryptPayload}
                      className="app-btn secondary fit-content"
                      disabled={encrypting || !payloadFile}
                    >
                      {encrypting ? 'Chiffrement en cours...' : 'Chiffrer le payload ECIES'}
                    </button>
                  ) : (
                    <div>
                      <span className="status-chip ok" style={{ width: 'fit-content' }}>✅ Payload chiffré</span>
                      <div className="mono-box pub-key" style={{ marginTop: 8, fontSize: '0.7rem' }}>
                        {encryptedPayload.slice(0, 80)}...
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleSubmitProof}
                  className="app-btn primary fit-content"
                  disabled={!receiptFile || !encryptedPayload || isPending || countdown !== 'Ouvert'}
                  style={{ opacity: countdown === 'Ouvert' ? 1 : 0.5 }}
                >
                  {isPending ? 'En attente MetaMask...' : 'Soumettre la Preuve ZK'}
                </button>

                {isSuccess && step === 'submit' && (
                  <div style={{ marginTop: 12 }}>
                    <span className="status-chip ok" style={{ width: 'fit-content' }}>✅ Preuve acceptée — Transaction validée</span>
                    <div className="mono-box" style={{ marginTop: 8, color: '#4ade80' }}>Tx : {txHash}</div>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="app-btn secondary fit-content"
                      style={{ display: 'inline-block', marginTop: 8, textDecoration: 'none' }}
                    >
                      Voir sur Etherscan →
                    </a>
                    <button
                      onClick={() => { reset(); setStep('list') }}
                      className="app-btn secondary fit-content"
                      style={{ marginTop: 8, marginLeft: 8 }}
                    >
                      Nouveau bounty
                    </button>
                  </div>
                )}
                {isError && (
                  <p className="error-note" style={{ marginTop: 8 }}>❌ {error?.message}</p>
                )}
              </section>
            )}
          </>
        )}

        {isConnected && !isOnSepolia && (
          <div className="glass-panel stagger-in network-warning">
            Changez vers le réseau <strong>Sepolia</strong> dans MetaMask pour continuer
          </div>
        )}

      </div>
    </main>
  )
}

// ── Composant BountyCard ───────────────────────────────────────

function BountyCard({
  bountyId,
  onSelect,
}: {
  bountyId: bigint
  onSelect: (info: BountyInfo) => void
}) {
  const { data, isLoading, isError } = useBounty(bountyId)

  if (isLoading) return (
    <div className="glass-panel" style={{ padding: '14px 16px' }}>
      <p className="muted" style={{ fontSize: '0.85rem' }}>Chargement bounty #{bountyId.toString()}...</p>
    </div>
  )

  if (isError || !data) return null

  const [
    targetCID, staticPropsHash,
    baselineMerkleRootA, baselineMerkleRootB,
    baselineHashA, baselineHashB, financialConfigHash,
    domain, mode, reward, rewardFloor, maxSteps,
    createdAt, proofsOpenAt, state, sponsor, eciesPublicKey
  ] = data as unknown as any[]

  if (state !== 1) return null // afficher seulement les ACTIVE

  const info: BountyInfo = {
    id: bountyId, domain, mode, reward, rewardFloor,
    state, sponsor, targetCID, eciesPublicKey,
    proofsOpenAt, createdAt,
  }

  return (
    <div
      className="glass-panel"
      style={{ padding: '16px', cursor: 'pointer', transition: 'border-color 0.2s', borderColor: 'rgba(123,151,186,0.24)' }}
      onClick={() => onSelect(info)}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(95,168,211,0.5)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(123,151,186,0.24)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: '0.9rem' }}>
          Bounty #{bountyId.toString()}
        </span>
        <span style={{ color: '#4ade80', fontFamily: 'monospace', fontWeight: 700 }}>
          {formatUnits(reward, 6)} USDT
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className="status-chip ok" style={{ fontSize: '0.75rem', padding: '4px 10px', width: 'fit-content' }}>
          {DOMAIN_LABELS[domain as Domain]}
        </span>
        <span className="status-chip ok" style={{ fontSize: '0.75rem', padding: '4px 10px', width: 'fit-content' }}>
          {mode === 0 ? 'STRICT' : 'RELAXED'}
        </span>
      </div>
      <p className="muted" style={{ fontSize: '0.75rem', marginTop: 8 }}>
        Cliquez pour vérifier le CID et commencer →
      </p>
    </div>
  )
}