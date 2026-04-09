// lib/wagmi.ts — Runtime Wagmi config
// Auto-patched for LOCAL DEMO by scripts/deploy.cjs — 2026-04-09T12:51:31.888Z
import { createConfig, http } from 'wagmi'
import { hardhat }           from 'wagmi/chains'
import { injected }          from 'wagmi/connectors'

export const config = createConfig({
  chains:     [hardhat],
  connectors: [injected()],
  transports: {
    [hardhat.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? 'http://127.0.0.1:8545'),
  },
  ssr: false,
})
