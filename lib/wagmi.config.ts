// lib/wagmi.config.ts
// Auto-patched for LOCAL DEMO by scripts/deploy.cjs — 2026-04-06T20:08:48.807Z
import { createConfig, http } from 'wagmi'
import { foundry } from 'wagmi/chains'
import { metaMask, injected } from 'wagmi/connectors'

export const config = createConfig({
  chains: [foundry],

  connectors: [
    injected(),
    metaMask({
      dappMetadata: {
        name: 'ZTB — Zero Trust Bounties',
        url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      },
    }),
  ],

  transports: {
    [foundry.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? 'http://127.0.0.1:8545'),
  },

  ssr: false,
})
