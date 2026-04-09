import type { Metadata } from 'next'
import { Space_Grotesk, Sora } from 'next/font/google'
import { Providers } from './providers'
import { Navbar } from '@/components/Navbar'
import { AnimatedBackground } from '@/components/AnimatedBackground'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
})

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-title',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ZTB — Zero Trust Bounties',
  description: 'Decentralized, ZK-proven bug bounties. Commit · Prove · Reveal.',
  keywords: ['bug bounty', 'zero trust', 'zkvm', 'risc zero', 'defi', 'web3'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} ${sora.variable}`} suppressHydrationWarning>
        <Providers>
          <Navbar />
          <AnimatedBackground />
          <div className="nav-spacer" />
          {children}
        </Providers>
      </body>
    </html>
  )
}