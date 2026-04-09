'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useReadContract } from 'wagmi'
import { ZTB_ESCROW_ABI } from '@/lib/abi/ZTBEscrow.abi'

const ZTB_ESCROW_ADDRESS = (
  process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9'
) as `0x${string}`

// ── Icons (Pure SVG Fallback for No-NPM Environments) ──────────

const IconWrapper = ({ children, color, size = 24 }: any) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="1.5" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    {children}
  </svg>
)

const Icons = {
  Shield: (props: any) => (
    <IconWrapper {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></IconWrapper>
  ),
  Cpu: (props: any) => (
    <IconWrapper {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3"/>
    </IconWrapper>
  ),
  Database: (props: any) => (
    <IconWrapper {...props}>
      <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>
    </IconWrapper>
  ),
  Zap: (props: any) => (
    <IconWrapper {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></IconWrapper>
  ),
  Fingerprint: (props: any) => (
    <IconWrapper {...props}>
      <path d="M2 12a10 10 0 0 1 18-6M7 12a5 5 0 0 1 5-5M12 12a5 5 0 0 1 5-5M17 12a10 10 0 0 1-18 6M12 22v-3"/>
      <path d="M12 15a3 3 0 0 1-3-3M12 15a3 3 0 0 0 3-3"/>
    </IconWrapper>
  ),
  CheckCircle: (props: any) => (
    <IconWrapper {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></IconWrapper>
  ),
  ArrowRight: (props: any) => (
    <IconWrapper {...props}><path d="M5 12h14M12 5l7 7-7 7"/></IconWrapper>
  )
}

const FeatureIcon = ({ icon: IconComponent, color }: { icon: any, color: string }) => (
  <div className="p-3 rounded-xl bg-white/5 border border-white/10 group-hover:border-white/20 transition-colors">
    <IconComponent color={color} />
  </div>
)

// ── Components ────────────────────────────────────────────────

const UserCard = ({ title, subtitle, description, href, accentColor }: any) => (
  <Link 
    href={href}
    className="group relative flex flex-col p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2"
  >
    {/* Radial Glow */}
    <div 
      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
      style={{
        background: `radial-gradient(circle at center, ${accentColor}15 0%, transparent 70%)`
      }}
    />
    
    <div className="relative z-10 flex flex-col h-full">
      <span className="text-[10px] font-bold tracking-[0.2em] uppercase mb-4" style={{ color: accentColor }}>
        {subtitle}
      </span>
      <h3 className="text-2xl font-title font-bold text-white mb-4 tracking-tight">
        {title}
      </h3>
      <p className="text-gray-400 text-sm leading-relaxed mb-8 flex-grow">
        {description}
      </p>
      
      <div className="flex items-center gap-2 text-xs font-bold transition-all group-hover:gap-4" style={{ color: accentColor }}>
        ENTER PORTAL <Icons.ArrowRight color={accentColor} size={14} />
      </div>
    </div>
  </Link>
)

export default function HomePage() {
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])

  const { data: nextId } = useReadContract({
    address: ZTB_ESCROW_ADDRESS,
    abi: ZTB_ESCROW_ABI,
    functionName: 'nextId',
    query: { enabled: mounted },
  })
  const bountyCount = nextId ? Number(nextId) : 0

  if (!mounted) return null

  return (
    <main className="min-h-screen bg-[#06080B] text-white selection:bg-[#C9A853]/30">
      
      {/* ── Section 1: Hero ── */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        {/* Decorative elements - Subtle top glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-full pointer-events-none opacity-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#C9A853] rounded-full blur-[100px] animate-pulse" />
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#5FA8D3] rounded-full blur-[100px]" />
        </div>

        <div className="container mx-auto px-6 relative z-10 flex flex-col items-center text-center">
          {/* Mainnet Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-8 animate-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] font-extrabold tracking-widest text-gray-300">
              V4.3 · ZKVM MAINNET READY
            </span>
          </div>

          {/* Logo */}
          <div className="mb-8">
            <Image
              src="/ztb-logo.png"
              alt="ZTB Logo"
              width={180}
              height={180}
              className="object-contain opacity-90 hover:opacity-100 transition-opacity"
              priority
            />
          </div>

          <h1 className="text-5xl md:text-8xl font-title font-black tracking-tighter mb-8 leading-[1.1] text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/40">
            Zero Trust <br />
            <span className="text-[#C9A853]">Bounties</span>
          </h1>

          <p className="max-w-xl text-lg md:text-xl text-gray-400 font-medium mb-12 leading-relaxed">
            The first <strong className="text-white italic">trustless</strong> bug bounty settlement layer powered by RISC Zero zkVM proofs and ECIES encryption.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Link 
              href="/hacker" 
              className="px-10 py-4 rounded-xl bg-gradient-to-r from-[#BF9940] to-[#C9A853] text-black font-bold text-sm tracking-wide shadow-[0_0_40px_rgba(201,168,83,0.3)] hover:shadow-[0_0_50px_rgba(201,168,83,0.5)] transition-all hover:scale-105 active:scale-95"
            >
              START HACKING
            </Link>
            <Link 
              href="/sponsor" 
              className="px-10 py-4 rounded-xl border border-white/20 bg-white/5 backdrop-blur-md text-white font-bold text-sm tracking-wide hover:bg-white/10 hover:border-white/40 transition-all"
            >
              DEPLOY A BOUNTY
            </Link>
          </div>
          
          <div className="mt-12 text-[#5FA8D3] font-mono text-xs flex items-center gap-2">
            <span className="inline-block w-8 h-[1px] bg-[#5FA8D3]/30"></span>
            {bountyCount} ACTIVE PROTOCOLS SECURED BY ZK
            <span className="inline-block w-8 h-[1px] bg-[#5FA8D3]/30"></span>
          </div>
        </div>
      </section>

      {/* ── Section 2: Pioneers (3D Perspective Grid) ── */}
      <section className="relative py-32 bg-[#080A0F] overflow-hidden">
        {/* 3D Grid Background */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-[0.07]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            transform: 'perspective(1000px) rotateX(65deg) scale(2)',
            transformOrigin: 'top center',
            maskImage: 'linear-gradient(to bottom, black, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)'
          }}
        />

        <div className="container mx-auto px-6 relative z-10">
          <div className="flex flex-col items-center mb-20 text-center">
            <h2 className="text-3xl md:text-5xl font-title font-bold mb-6">Designed for Pioneers</h2>
            <div className="h-1 w-20 bg-gradient-to-r from-transparent via-[#C9A853] to-transparent"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            <UserCard 
              title="Protocols"
              subtitle="Infrastructure Security"
              description="Automate zero-day discovery with cryptographically secured bounty payouts. Zero trust required in traditional intermediaries."
              href="/explorer"
              accentColor="#5FA8D3"
            />
            <UserCard 
              title="Researchers"
              subtitle="Ethical Hackers"
              description="Submit exploits privately, prove them mathematically, and receive automated payouts without revealing code to human verifiers."
              href="/hacker"
              accentColor="#C9A853"
            />
            <UserCard 
              title="Capital"
              subtitle="Sponsors & DAOs"
              description="Deploy capital into bug bounty vaults. Reward floor logic and timelocks ensure maximum financial safety for liquidity providers."
              href="/sponsor"
              accentColor="#4ADE80"
            />
          </div>
        </div>
      </section>

      {/* ── Section 3: Tech Grid ── */}
      <section className="py-32 bg-[#06080B]">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-6xl mx-auto">
            
            {/* Feature 1 */}
            <div className="group space-y-4">
              <FeatureIcon icon={Icons.Shield} color="#5FA8D3" />
              <h4 className="text-lg font-bold">End-to-End ECIES</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Asymmetric key pairs guarantee that only the protocol sponsor can decrypt and read the submitted exploit payload.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group space-y-4">
              <FeatureIcon icon={Icons.Cpu} color="#C9A853" />
              <h4 className="text-lg font-bold">zkVM Oracle Bridge</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Execute targets in a deterministic environment. No floating-point drift, no non-determinism, full math proof.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group space-y-4">
              <FeatureIcon icon={Icons.Database} color="#4ADE80" />
              <h4 className="text-lg font-bold">IPFS Decentralization</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Payloads are pinned permanently via Pinata. Censorship-resistant data availability for security disclosure.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="group space-y-4">
              <FeatureIcon icon={Icons.Zap} color="#FBBF24" />
              <h4 className="text-lg font-bold">Anti-Spam Staking</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Hackers must lock ETH during the commitment phase. This prevents front-running and spamming the verifier network.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="group space-y-4">
              <FeatureIcon icon={Icons.Fingerprint} color="#5FA8D3" />
              <h4 className="text-lg font-bold">Commit-Reveal Flow</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                A two-phase submission process secures the hacker's "slot" on-chain before the proof is actually revealed.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="group space-y-4">
              <FeatureIcon icon={Icons.CheckCircle} color="#C9A853" />
              <h4 className="text-lg font-bold">Dual-Bitmap Validation</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Stateless execution diffing prevents duplicate bug submissions by comparing execution paths against baselines.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ── Section 4: Bottom Banner ── */}
      <section className="py-24 border-t border-white/5">
        <div className="container mx-auto px-6 text-center">
          <div className="flex justify-center mb-12">
             <Image src="/ztb-logo.png" alt="ZTB" width={80} height={80} className="grayscale opacity-50" />
          </div>
          <p className="font-mono text-[10px] tracking-[0.4em] text-gray-600 uppercase">
            Protocol Version 4.3 — Zero Trust Bounties © 2026
          </p>
        </div>
      </section>

    </main>
  )
}
