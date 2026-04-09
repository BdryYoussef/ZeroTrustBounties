'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useReadContract } from 'wagmi'
import { ZTB_ESCROW_ABI } from '@/lib/abi/ZTBEscrow.abi'

const ZTB_ESCROW_ADDRESS = (
  process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '0x0000000000000000000000000000000000000000'
) as `0x${string}`

// ── Data ────────────────────────────────────────────────────────

const TECH_PILLS = [
  { text: 'RISC Zero zkVM',  color: '#C9A853' },
  { text: 'Solidity + EVM',  color: '#5FA8D3' },
  { text: 'ECIES secp256k1', color: '#4ADE80' },
  { text: 'Pinata IPFS',     color: '#C9A853' },
  { text: 'Groth16 Proofs',  color: '#5FA8D3' },
  { text: 'USDT Escrow',     color: '#FBBF24' },
]

const CARDS = [
  {
    href: '/explorer',
    title: 'Bounty Explorer',
    desc: 'Browse all active zero-trust bounties across every domain.',
    badge: 'Live View',
    color: '#5FA8D3',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="11" cy="11" r="8" />
        <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
      </svg>
    ),
  },
  {
    href: '/hacker',
    title: 'Hacker Dashboard',
    desc: 'Commit → Prove → Reveal. ECIES-encrypted payloads, IPFS pinned.',
    badge: 'Earn Rewards',
    color: '#C9A853',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    href: '/sponsor',
    title: 'Sponsor Dashboard',
    desc: 'Deploy bounties, lock USDT rewards, receive ZK-verified exploit proofs.',
    badge: 'Post Bounties',
    color: '#4ADE80',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
]

const HOW_IT_WORKS = [
  { n: '01', title: 'Anti-Front-Running',   desc: 'keccak256 commitments with ETH stake secure your exploit slot before reveal.' },
  { n: '02', title: 'ZK-Verified Proofs',   desc: 'RISC Zero Groth16 proofs checked fully on-chain. Zero trust in the verifier.' },
  { n: '03', title: 'ECIES Encryption',     desc: 'secp256k1 + AES-256-GCM. Only the sponsor can decrypt your payload CID.' },
  { n: '04', title: 'IPFS Persistence',     desc: 'Encrypted payloads pinned permanently via Pinata. Censorship-resistant.' },
]

// ── Page ────────────────────────────────────────────────────────

export default function HomePage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { data: nextId } = useReadContract({
    address: ZTB_ESCROW_ADDRESS,
    abi: ZTB_ESCROW_ABI,
    functionName: 'nextId',
    query: { enabled: mounted },
  })
  const bountyCount = nextId ? Number(nextId) : null

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 20px 80px', display: 'flex', flexDirection: 'column', gap: 56 }}>

      {/* ─── HERO ─── */}
      <section style={{ textAlign: 'center', paddingTop: 8, paddingBottom: 16 }}>

        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <Image
            src="/ztb-logo.png"
            alt="ZTB Logo"
            width={260}
            height={260}
            style={{ objectFit: 'contain' }}
            priority
          />
        </div>

        {/* Version badge */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '5px 16px', borderRadius: 999,
            background: 'rgba(201,168,83,0.08)',
            border: '1px solid rgba(201,168,83,0.25)',
            fontSize: '0.73rem', fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#C9A853',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C9A853', display: 'inline-block' }} />
            V4.3 · EMSI Engineering Demo
          </span>
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: 'var(--font-title)',
          fontWeight: 800,
          fontSize: 'clamp(2.5rem, 8vw, 5.5rem)',
          letterSpacing: '-0.04em',
          lineHeight: 1.05,
          margin: '0 0 16px',
          background: 'linear-gradient(135deg, #E8EDF5 0%, #C0CDD9 55%, #C9A853 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}>
          Zero-Trust<br />Bug Bounties
        </h1>

        {/* Subtitle */}
        <p style={{
          color: '#E8EDF5', fontSize: '1.25rem', lineHeight: 1.6,
          maxWidth: 600, margin: '0 auto 32px', fontWeight: 400
        }}>
          <strong style={{ color: '#4ADE80' }}>Trustless</strong> exploit verification using RISC Zero <strong style={{ color: '#C9A853' }}>ZK proofs</strong>. Commit, prove, reveal — your payload is encrypted end-to-end.
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginBottom: 40 }}>
          <Link href="/explorer" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '14px 32px', borderRadius: 12,
            background: 'linear-gradient(135deg, #1A1F2B 0%, #0A0D14 100%)',
            border: '1px solid rgba(95,168,211,0.5)',
            color: '#5FA8D3', fontWeight: 700, fontSize: '1rem',
            textDecoration: 'none',
            boxShadow: '0 0 20px rgba(95,168,211,0.2)',
            transition: 'all 200ms ease',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 30px rgba(95,168,211,0.4)'; (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, #1A1F2B 0%, #111 100%)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 20px rgba(95,168,211,0.2)'; (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, #1A1F2B 0%, #0A0D14 100%)' }}
          >
            Explore Bounties
            {bountyCount !== null && (
              <span style={{
                padding: '2px 8px', borderRadius: 999,
                background: 'rgba(95,168,211,0.15)',
                border: '1px solid rgba(95,168,211,0.3)',
                color: '#5FA8D3', fontSize: '0.75rem', fontWeight: 700,
              }}>
                {bountyCount}
              </span>
            )}
          </Link>

          <Link href="/sponsor" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '14px 32px', borderRadius: 12,
            background: 'linear-gradient(135deg, #BF9940, #C9A853)',
            color: '#0B0E14', fontWeight: 700, fontSize: '1rem',
            textDecoration: 'none',
            boxShadow: '0 0 20px rgba(201,168,83,0.3)',
            transition: 'all 200ms ease',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 30px rgba(201,168,83,0.5)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 20px rgba(201,168,83,0.3)' }}
          >
            Create Bounty
          </Link>
        </div>

        {/* Tech pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
          {TECH_PILLS.map(t => (
            <span key={t.text} style={{
              padding: '4px 12px', borderRadius: 999,
              background: `${t.color}12`, border: `1px solid ${t.color}30`,
              color: t.color, fontSize: '0.75rem', fontWeight: 600,
            }}>{t.text}</span>
          ))}
        </div>
      </section>

      {/* ─── CARDS ─── */}
      <section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {CARDS.map(c => (
            <Link
              key={c.href}
              href={c.href}
              style={{
                display: 'flex', flexDirection: 'column', gap: 16,
                padding: '22px 22px 20px',
                background: 'var(--surface)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 18,
                textDecoration: 'none',
                boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
                transition: 'border-color 250ms, box-shadow 250ms, transform 200ms',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = `${c.color}35`
                el.style.boxShadow = `0 8px 40px rgba(0,0,0,0.45), 0 0 0 1px ${c.color}25`
                el.style.transform = 'translateY(-3px)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = 'rgba(255,255,255,0.07)'
                el.style.boxShadow = '0 4px 24px rgba(0,0,0,0.35)'
                el.style.transform = 'none'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: `${c.color}15`, border: `1px solid ${c.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: c.color, flexShrink: 0,
                }}>
                  {c.icon}
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700,
                  background: `${c.color}15`, border: `1px solid ${c.color}30`, color: c.color,
                }}>{c.badge}</span>
              </div>
              <div>
                <h2 style={{
                  fontFamily: 'var(--font-title)', fontWeight: 700, fontSize: '1.05rem',
                  color: 'var(--text)', letterSpacing: '-0.02em', margin: '0 0 6px',
                }}>{c.title}</h2>
                <p style={{ color: 'var(--muted)', fontSize: '0.86rem', lineHeight: 1.6, margin: 0 }}>{c.desc}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: c.color, fontSize: '0.84rem', fontWeight: 600, marginTop: 'auto' }}>
                Open
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section>
        <div style={{
          padding: '28px 28px 24px',
          background: 'var(--surface)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 18,
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-title)', fontWeight: 700, fontSize: '1.15rem',
            color: 'var(--text)', letterSpacing: '-0.02em', margin: '0 0 22px',
          }}>
            How It Works
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            {HOW_IT_WORKS.map(f => (
              <div key={f.n} style={{
                padding: '16px 18px', borderRadius: 12,
                background: 'var(--surface-2)', border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <p style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em',
                  color: '#C9A853', margin: '0 0 8px',
                }}>{f.n}</p>
                <p style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)', margin: '0 0 5px' }}>{f.title}</p>
                <p style={{ color: 'var(--muted)', fontSize: '0.8rem', lineHeight: 1.55, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
          ZTB V4.3 · EMSI Engineering Degree · RISC Zero zkVM · Solidity · Next.js 14
        </p>
      </footer>

    </main>
  )
}
