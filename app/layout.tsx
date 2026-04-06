import type { Metadata } from 'next'
import { Space_Grotesk, Sora } from 'next/font/google'
import { Providers } from './providers'
import { ThemeToggle } from './theme-toggle'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-ui',
})

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-title',
})

export const metadata: Metadata = {
  title: 'ZTB — Zero Trust Bounties',
  description: 'Decentralized bug bounty — V4.3',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body className={`${spaceGrotesk.variable} ${sora.variable}`}>
        <Providers>
          <ThemeToggle />
          {children}
        </Providers>
      </body>
    </html>
  )
}