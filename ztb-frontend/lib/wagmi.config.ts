// lib/wagmi.config.ts
// Wagmi CLI configuration for auto-generating typed hooks from Hardhat artifacts.
//
// ⚡ SETUP: Run this AFTER the presentation to replace the manual ABI:
//
//   npm install --save-dev @wagmi/cli
//   npx wagmi generate
//
// This reads artifacts/contracts/ZTBEscrow.sol/ZTBEscrow.json (compiled by Hardhat)
// and outputs type-safe React hooks to hooks/generated/useZTBEscrow.ts
//
// See: https://wagmi.sh/cli/getting-started

import { defineConfig } from '@wagmi/cli'
import { hardhat }      from '@wagmi/cli/plugins'
import { react }        from '@wagmi/cli/plugins'

export default defineConfig({
  out: 'hooks/generated/useZTBEscrow.ts',
  plugins: [
    hardhat({
      project: './',                           // hardhat.config.cjs is in the root
      include: ['ZTBEscrow'],                  // only generate for this contract
      deployments: {
        ZTBEscrow: {
          31337: (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '') as `0x${string}`,
        },
      },
    }),
    react(),                                   // generate useReadZTBEscrow / useWriteZTBEscrow hooks
  ],
})
