'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { useTotalBounties, useBounty } from '@/hooks/useZTBContract'
import { formatUnits } from 'viem'
import { DOMAIN_LABELS, DOMAIN_COLORS, type Domain } from '@/lib/abi/ZTBEscrow.abi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

// ── Skeleton ──────────────────────────────────────────────────

function BountyCardSkeleton() {
  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        animation: 'fadeIn 400ms ease both',
      }}
    >
      {[60, 100, 40, 70].map((w, i) => (
        <div
          key={i}
          className="rounded-lg"
          style={{
            height: 14,
            width: `${w}%`,
            background: 'rgba(255,255,255,0.05)',
            animation: `glowPulse 2s ease-in-out ${i * 150}ms infinite`,
          }}
        />
      ))}
    </div>
  )
}

// ── Bounty card ───────────────────────────────────────────────

function BountyCard({ bountyId }: { bountyId: bigint }) {
  const { data, isLoading } = useBounty(bountyId)
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  if (isLoading) return <BountyCardSkeleton />
  if (!data) return null

  const [
    targetCID,,,,,,,reward, rewardFloor,,,
    , proofsOpenAt, domain, mode, sponsor,,
  ] = data as readonly unknown[] as [
    `0x${string}`,`0x${string}`,`0x${string}`,`0x${string}`,`0x${string}`,
    `0x${string}`,`0x${string}`,bigint,bigint,bigint,bigint,bigint,
    number,number,`0x${string}`,`0x${string}`,boolean
  ]

  const rewardUsdt  = formatUnits(reward, 6)
  const openInSecs  = Number(proofsOpenAt) - now
  const isProofOpen = openInSecs <= 0
  const domainNum   = domain as Domain
  const domainColor = DOMAIN_COLORS[domainNum] ?? '#5FA8D3'
  const hours       = Math.max(0, Math.floor(openInSecs / 3600))
  const mins        = Math.max(0, Math.floor((openInSecs % 3600) / 60))
  const secs        = Math.max(0, openInSecs % 60)

  return (
    <div
      className="rounded-2xl flex flex-col gap-4 p-5 transition-all duration-300"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${hovered ? `${domainColor}33` : 'var(--border)'}`,
        boxShadow: hovered
          ? `0 8px 40px rgba(0,0,0,0.45), 0 0 0 1px ${domainColor}22`
          : '0 4px 24px rgba(0,0,0,0.35)',
        transform: hovered ? 'translateY(-3px)' : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="ztb-label mb-1">Bounty #{bountyId.toString()}</p>
          <p
            className="font-mono text-xs truncate max-w-[180px]"
            style={{ color: 'var(--muted)' }}
          >
            {targetCID.slice(0, 20)}…
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span
            className="ztb-badge text-xs"
            style={{
              background: `${domainColor}18`,
              borderColor: `${domainColor}35`,
              color: domainColor,
            }}
          >
            {DOMAIN_LABELS[domainNum] ?? `Domain ${domain}`}
          </span>
          <Badge variant={Number(mode) === 0 ? 'info' : 'warning'} className="text-[0.68rem]">
            {Number(mode) === 0 ? 'STRICT' : 'RELAXED'}
          </Badge>
          {!data[16] && proofsOpenAt === 0n && <Badge variant="gold" dot className="text-[0.68rem]">PENDING (72h)</Badge>}
          {!data[16] && proofsOpenAt > 0n && <Badge variant="error" dot className="text-[0.68rem]">SETTLED/CLOSED</Badge>}
        </div>
      </div>

      {/* Reward */}
      <div
        className="rounded-xl px-4 py-3"
        style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.18)' }}
      >
        <p className="ztb-label mb-1">Reward</p>
        <p
          className="text-2xl font-bold"
          style={{ fontFamily: 'var(--font-title)', color: '#4ADE80', letterSpacing: '-0.03em' }}
        >
          {parseFloat(rewardUsdt).toLocaleString()} <span className="text-sm font-semibold text-[var(--muted)]">USDT</span>
        </p>
        {Number(mode) === 1 && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Floor: {parseFloat(formatUnits(rewardFloor, 6)).toLocaleString()} USDT
          </p>
        )}
      </div>

      {/* Proof window */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="ztb-label mb-1">Proof Window</p>
          {isProofOpen ? (
            <Badge variant="success" dot>Open — Submit Now</Badge>
          ) : (
            <div
              className="flex items-center gap-1.5 text-xs font-mono font-semibold rounded-full px-3 py-1"
              style={{
                background: 'rgba(251,191,36,0.08)',
                border: '1px solid rgba(251,191,36,0.25)',
                color: '#FBBF24',
              }}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              {hours.toString().padStart(2, '0')}:{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
            </div>
          )}
        </div>
        <Link
          href={`/hacker?bountyId=${bountyId.toString()}`}
          className="ztb-btn ztb-btn-primary ztb-btn-sm"
          style={{ textDecoration: 'none' }}
        >
          Hack It
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
      </div>

      {/* Sponsor */}
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Sponsor{' '}
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted-light)' }}>
          {sponsor.slice(0, 10)}…{sponsor.slice(-6)}
        </span>
      </p>
    </div>
  )
}

// ── Filter chip ───────────────────────────────────────────────

type DomainFilter = 'all' | '0' | '1' | '2'

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200"
      style={{
        background: active ? 'rgba(201,168,83,0.15)' : 'var(--surface-2)',
        border: active ? '1px solid rgba(201,168,83,0.4)' : '1px solid var(--border)',
        color: active ? '#C9A853' : 'var(--muted)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────

export default function ExplorerPage() {
  const [mounted, setMounted]           = useState(false)
  const [domainFilter, setDomainFilter] = useState<DomainFilter>('all')
  const [minReward, setMinReward]       = useState('')

  useEffect(() => setMounted(true), [])

  const { isConnected }    = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect }          = useDisconnect()
  const chainId                 = useChainId()
  const TARGET_CHAIN_ID         = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? '31337')
  const isOnCorrectChain        = chainId === TARGET_CHAIN_ID
  const networkLabel            = TARGET_CHAIN_ID === 31337 ? 'Anvil Local' : 'Sepolia'
  const metaMaskConnector       = connectors.find(c => c.name.toLowerCase().includes('metamask')) ?? connectors[0]

  const { data: countData } = useTotalBounties()
  const totalBounties       = countData ? Number(countData) : 0
  const ids = Array.from({ length: totalBounties }, (_, i) => BigInt(i))

  if (!mounted) return null

  return (
    <main className="page-shell-wide">

      {/* ── Header ── */}
      <div className="animate-fade-up flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="font-title font-bold mb-2"
            style={{
              fontFamily: 'var(--font-title)',
              fontSize: 'clamp(1.8rem,5vw,2.8rem)',
              letterSpacing: '-0.03em',
              background: 'linear-gradient(135deg,#E8EDF5 0%,#5FA8D3 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Bounty Explorer
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Browse all active bug bounties across every vulnerability domain.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <Badge variant="gold" dot>V4.3 · {networkLabel}</Badge>
          <Badge variant="info" dot>{totalBounties} active bounties</Badge>
        </div>
      </div>

      {/* ── Wallet row ── */}
      <Card className="animate-fade-up-d1">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="font-semibold text-sm" style={{ color: 'var(--text)', fontFamily: 'var(--font-ui)' }}>Wallet</p>
          {isConnected ? (
            <div className="flex items-center gap-2">
              <Badge variant={isOnCorrectChain ? 'success' : 'error'} dot>
                {isOnCorrectChain ? networkLabel : `Switch to ${networkLabel}`}
              </Badge>
              <Button variant="danger" size="sm" onClick={() => disconnect()}>Disconnect</Button>
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

      {/* ── Filters ── */}
      <Card className="animate-fade-up-d1">
        <div className="flex flex-wrap items-center gap-3">
          {/* Domain chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <FilterChip label="All Domains" active={domainFilter === 'all'} onClick={() => setDomainFilter('all')} />
            {(['0', '1', '2'] as DomainFilter[]).map(d => (
              <FilterChip
                key={d}
                label={DOMAIN_LABELS[parseInt(d) as Domain]}
                active={domainFilter === d}
                onClick={() => setDomainFilter(d)}
              />
            ))}
          </div>
          {/* Min reward */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>Min reward</span>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={minReward}
              onChange={e => setMinReward(e.target.value)}
              className="ztb-input w-28 text-xs"
              style={{ fontFamily: 'var(--font-mono)', color: '#4ADE80' }}
            />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>USDT</span>
          </div>
        </div>
      </Card>

      {/* ── Grid ── */}
      {totalBounties === 0 ? (
        <Card className="animate-fade-up-d2 text-center py-12">
          <div
            className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            <svg className="w-7 h-7" style={{ color: 'var(--muted)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
          </div>
          <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>No bounties yet</p>
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Ask a sponsor to create the first bounty.</p>
          <Link
            href="/sponsor"
            className="ztb-btn ztb-btn-primary ztb-btn-sm inline-flex"
            style={{ textDecoration: 'none' }}
          >
            Create a Bounty
          </Link>
        </Card>
      ) : (
        <div
          className="grid gap-4 animate-fade-up-d2"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}
        >
          {ids.map(id => <BountyCard key={id.toString()} bountyId={id} />)}
        </div>
      )}

      {/* ── Hall of Fame ── */}
      <div className="mt-10 animate-fade-up-d3">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-white/10" />
          <span className="text-[10px] font-extrabold tracking-[0.25em] uppercase" style={{ color: '#C9A853' }}>
            🏆 Hall of Fame
          </span>
          <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-white/10" />
        </div>

        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {/* Table header */}
          <div
            className="grid grid-cols-4 px-5 py-3 text-[10px] font-extrabold tracking-[0.15em] uppercase"
            style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}
          >
            <span>Rank</span>
            <span>Hacker</span>
            <span className="text-center">Critical Hits</span>
            <span className="text-right">Total Earned</span>
          </div>

          {/* Rows */}
          {[
            { rank: 1, addr: '0x71C4...9A2F', hits: 23, earned: '$421,500', medal: '🥇', accent: '#C9A853', glow: 'rgba(201,168,83,0.07)' },
            { rank: 2, addr: '0xB3f8...11D0', hits: 19, earned: '$287,200', medal: '🥈', accent: '#94A3B8', glow: 'rgba(148,163,184,0.06)' },
            { rank: 3, addr: '0x4A2e...C9E1', hits: 14, earned: '$195,000', medal: '🥉', accent: '#CD7C3A', glow: 'rgba(205,124,58,0.06)' },
            { rank: 4, addr: '0x99fA...3D72', hits: 11, earned: '$112,400', medal: null, accent: 'var(--muted-light)', glow: 'transparent' },
            { rank: 5, addr: '0x2C1b...78A3', hits:  8, earned: '$88,100',  medal: null, accent: 'var(--muted-light)', glow: 'transparent' },
          ].map(({ rank, addr, hits, earned, medal, accent, glow }) => (
            <div
              key={rank}
              className="grid grid-cols-4 items-center px-5 py-4 transition-all duration-200 hover:bg-white/[0.02]"
              style={{
                borderBottom: rank < 5 ? '1px solid var(--border)' : 'none',
                background: glow !== 'transparent' ? glow : undefined,
              }}
            >
              {/* Rank */}
              <div className="flex items-center gap-2">
                {medal
                  ? <span className="text-base leading-none">{medal}</span>
                  : <span className="text-xs font-bold w-6 text-center" style={{ color: 'var(--muted)' }}>#{rank}</span>
                }
              </div>

              {/* Address */}
              <span className="font-mono text-xs font-semibold" style={{ color: accent }}>
                {addr}
              </span>

              {/* Hits */}
              <div className="flex justify-center">
                <span
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={{
                    background: `${accent}15`,
                    border: `1px solid ${accent}30`,
                    color: accent,
                  }}
                >
                  {hits} crits
                </span>
              </div>

              {/* Earned */}
              <span className="text-right text-sm font-bold font-title" style={{ color: accent }}>
                {earned}
              </span>
            </div>
          ))}
        </div>
      </div>

    </main>
  )
}
