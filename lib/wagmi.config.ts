import { createConfig, http, fallback } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { metaMask } from 'wagmi/connectors'

export const config = createConfig({
  chains: [sepolia],

  connectors: [
    metaMask({
      dappMetadata: {
        name: 'ZTB — Zero Trust Bounties',
        url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      },
    }),
  ],

  transports: {
    [sepolia.id]: fallback([
      http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
      http('https://rpc.sepolia.org'),
    ]),
  },

  ssr: false,
})