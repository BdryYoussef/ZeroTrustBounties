'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useEffect, useState } from 'react'

const NAV_LINKS = [
  { href: '/',         label: 'Home' },
  { href: '/explorer', label: 'Explorer' },
  { href: '/hacker',   label: 'Hacker' },
  { href: '/sponsor',  label: 'Create Bounty' },
  { href: '/sponsor/dashboard', label: 'Sponsor Dashboard' },
]

function shortenAddr(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

export function Navbar() {
  const pathname   = usePathname()
  const { address, isConnected }  = useAccount()
  const { connect, connectors }   = useConnect()
  const { disconnect }            = useDisconnect()
  const [theme, setTheme]         = useState<'dark' | 'light'>('dark')

  // ← key fix: don't render wallet UI until client is hydrated
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const connector = connectors.find(c => c.name.toLowerCase().includes('metamask')) ?? connectors[0]

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next === 'light' ? 'executive-light' : ''
  }

  return (
    <nav style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      zIndex: 50,
      height: 68,
      display: 'flex',
      alignItems: 'center',
      background: 'rgba(6,8,11,0.4)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
      padding: '0 20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 1100,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>

        {/* ── Logo ── */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
          <Image
            src="/ztb-logo.png"
            alt="ZTB Logo"
            width={56}
            height={56}
            style={{ objectFit: 'contain', flexShrink: 0 }}
            priority
          />
          <span style={{
            fontFamily: 'var(--font-title)',
            fontWeight: 800,
            fontSize: '0.9rem',
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg,#C9A853,#E2C46A)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            whiteSpace: 'nowrap',
          }}>
            Zero Trust Bounties
          </span>
        </Link>

        {/* ── Nav links ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: 'inline-block',
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: '0.9rem',
                  fontWeight: active ? 700 : 500,
                  letterSpacing: '0.02em',
                  textDecoration: 'none',
                  color: active ? '#C9A853' : 'rgba(255,255,255,0.65)',
                  background: active ? 'rgba(201,168,83,0.12)' : 'transparent',
                  borderBottom: active ? '2px solid #C9A853' : '2px solid transparent',
                  textShadow: active ? '0 0 12px rgba(201,168,83,0.4)' : 'none',
                  transition: 'all 200ms ease',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.color = '#fff';
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.65)';
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }
                }}
              >
                {label}
              </Link>
            )
          })}
        </div>

        {/* ── Right controls — only rendered after client mount ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, minWidth: 160, justifyContent: 'flex-end' }}>

          {/* Sepolia Faucet link */}
          <a
            href="https://faucet.sepolia.io"
            target="_blank"
            rel="noreferrer"
            title="Get Sepolia test ETH"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', borderRadius: 999,
              fontSize: '0.72rem', fontWeight: 700,
              background: 'rgba(95,168,211,0.07)',
              border: '1px solid rgba(95,168,211,0.2)',
              color: '#5FA8D3', textDecoration: 'none',
              whiteSpace: 'nowrap', flexShrink: 0,
              transition: 'all 200ms ease',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(95,168,211,0.15)'
              ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(95,168,211,0.4)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(95,168,211,0.07)'
              ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(95,168,211,0.2)'
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
            </svg>
            Faucet
          </a>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            style={{
              width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.45)',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            {theme === 'dark' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeLinecap="round"/>
              </svg>
            )}
          </button>

          {/* Wallet — only after hydration */}
          {mounted && (
            isConnected ? (
              <button
                type="button"
                onClick={() => disconnect()}
                title="Click to disconnect"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 16px', borderRadius: 999,
                  fontSize: '0.85rem', fontWeight: 700,
                  background: 'rgba(74,222,128,0.1)',
                  border: '1px solid rgba(74,222,128,0.4)',
                  boxShadow: '0 0 12px rgba(74,222,128,0.25)',
                  color: '#4ADE80', cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'all 200ms ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 20px rgba(74,222,128,0.4)'; (e.currentTarget as HTMLElement).style.background = 'rgba(74,222,128,0.15)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 12px rgba(74,222,128,0.25)'; (e.currentTarget as HTMLElement).style.background = 'rgba(74,222,128,0.1)' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ADE80', boxShadow: '0 0 8px #4ADE80', flexShrink: 0, display: 'inline-block' }} />
                {shortenAddr(address!)}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => connector && connect({ connector })}
                disabled={!connector}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 14px', borderRadius: 999,
                  fontSize: '0.75rem', fontWeight: 700,
                  background: 'linear-gradient(135deg, #BF9940, #C9A853)',
                  border: 'none', color: '#0B0E14',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                Connect
              </button>
            )
          )}
        </div>
      </div>
    </nav>
  )
}
