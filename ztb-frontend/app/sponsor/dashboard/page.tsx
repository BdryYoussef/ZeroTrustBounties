'use client'

import React, { useEffect, useState } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { parseAbiItem, hexToString, hexToBytes } from 'viem'
import useZTBContract from '@/hooks/useZTBContract'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { decryptPayload } from '@/lib/ecies'
const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9') as `0x${string}`

interface BountyLogInfo {
  bountyId: bigint
  reward: bigint
  domain: number
  mode: number
}

// Minimal hook to fetch exactly 1 bounty state because useBounty doesn't loop easily dynamically unless we do it via readContracts
// For simplicity in the dashboard, we'll fetch them individually or via multicall.
// For simplicity in the dashboard, we'll fetch them individually or via multicall.
export default function SponsorDashboard() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { activateBounty, cancelBounty, isSuccess, isPending } = useZTBContract()

  const [bounties, setBounties] = useState<(BountyLogInfo & { 
    isOpen: boolean, 
    proofsOpenAt: number, 
    createdAt: number, 
    isFetched: boolean 
  })[]>([])

  const [loading, setLoading] = useState(false)
  const [inboxPrivKey, setInboxPrivKey] = useState('')
  const [decryptedPayloads, setDecryptedPayloads] = useState<Record<string, string>>({})
  const [decryptingId, setDecryptingId] = useState<bigint | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!mounted || !address || !publicClient) return
    let active = true

    async function loadBounties() {
      setLoading(true)
      try {
        const logs = await publicClient!.getLogs({
          address: ESCROW_ADDRESS,
          event: parseAbiItem('event BountyCreated(uint256 indexed bountyId, address indexed sponsor, uint256 reward, uint8 domain, uint8 mode)'),
          args: { sponsor: address },
          fromBlock: 0n,
          toBlock: 'latest',
        })

        if (!active) return

        const info = logs.map(l => ({
          bountyId: l.args.bountyId!,
          reward: l.args.reward!,
          domain: l.args.domain!,
          mode: l.args.mode!,
        }))

        // Fetch their current status via readContract
        const enriched = await Promise.all(
          info.map(async (b) => {
            try {
              const data = await publicClient!.readContract({
                address: ESCROW_ADDRESS,
                abi: parseAbiItem('function bounties(uint256) view returns (bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint256,uint256,uint256,uint256,uint256,uint8,uint8,address,bytes,bool)'),
                args: [b.bountyId]
              }) as any[]

              // Match ZTBEscrow.sol returns structure
              // 0: targetCID
              // 7: financialConfigHash -> Wait, the returns string has 17 items if we look at the ABI:
              // targetCID, staticPropsHash, baselineMerkleRootA, baselineMerkleRootB, baselineAHash, baselineBHash, financialConfigHash (0-6)
              // reward, rewardFloor, maxSteps, createdAt, proofsOpenAt (7-11)
              // domain, mode (12-13)
              // sponsor, eciesPublicKey, isOpen (14-16)
              return {
                ...b,
                createdAt: Number(data[10]),
                proofsOpenAt: Number(data[11]),
                isOpen: data[16] as boolean,
                isFetched: true
              }
            } catch (e) {
              return { ...b, isOpen: false, proofsOpenAt: 0, createdAt: 0, isFetched: false }
            }
          })
        )
        setBounties(enriched)
      } catch (e) { console.error(e) } finally { setLoading(false) }
    }
    loadBounties()
    return () => { active = false }
  }, [mounted, address, publicClient, isSuccess]) // refresh when a tx (like activateBounty) completes

  async function handleDecrypt(bountyId: bigint) {
    if (!inboxPrivKey) { setErrorMsg('Please enter your ECIES private key hex'); return }
    setDecryptingId(bountyId)
    setErrorMsg('')
    try {
      const logs = await publicClient!.getLogs({
        address: ESCROW_ADDRESS,
        event: parseAbiItem('event ExploitProven(uint256 indexed bountyId, address indexed hacker, bytes32 payloadHash, bytes encryptedPayload, bool c1a, bool c1b, bool c2, bool c3, uint32 totalNew, uint256 amount)'),
        args: { bountyId },
        fromBlock: 0n,
        toBlock: 'latest',
      })
      if (logs.length === 0) throw new Error('No ExploitProven event found for this bounty.')

      const encPayloadHex = logs[0].args.encryptedPayload as string
      const ipfsStr = hexToString(encPayloadHex as `0x${string}`)
      const cid = ipfsStr.replace('ipfs://', '')
      
      const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`)
      if (!res.ok) throw new Error('Failed to fetch encrypted blob from IPFS')
      const encryptedBytes = new Uint8Array(await res.arrayBuffer())

      let cleanPrivHex = inboxPrivKey.startsWith('0x') ? inboxPrivKey.slice(2) : inboxPrivKey
      if (cleanPrivHex.length !== 64) throw new Error('Private key hex must be 64 characters')
      
      const privKeyBytes = hexToBytes(`0x${cleanPrivHex}`)
      const decryptedBytes = await decryptPayload(encryptedBytes, privKeyBytes)
      
      setDecryptedPayloads(prev => ({ ...prev, [bountyId.toString()]: new TextDecoder().decode(decryptedBytes) }))
    } catch (e: any) {
      setErrorMsg(e?.shortMessage || e?.message || String(e))
    } finally {
      setDecryptingId(null)
    }
  }

  if (!mounted) return null

  return (
    <main className="page-shell">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-title font-bold text-ztb-gold uppercase tracking-wider mb-2">Decryption Inbox</h1>
          <p className="text-sm text-[var(--muted)]">Track zero-trust bounties, activate contests, and decrypt raw 0-days.</p>
        </div>
      </div>

      {!isConnected ? (
         <div className="rounded-xl p-8 text-center text-[var(--muted-light)] bg-[var(--surface-2)]">
            Connect your wallet to view your Sponsor Dashboard.
         </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-4">
             <p className="ztb-label mb-2">ECIES Context (Global Decryption Key)</p>
             <input
               type="password"
               value={inboxPrivKey}
               onChange={e => setInboxPrivKey(e.target.value)}
               placeholder="Paste your 64-char Hex Private Key to decrypt payloads"
               className="ztb-input w-full font-mono text-ztb-gold"
               autoComplete="off"
             />
          </div>

          {errorMsg && <p className="error-note animate-fade-in">{errorMsg}</p>}

          {loading ? (
             <p className="text-ztb-blue animate-pulse text-sm">Syncing bounties...</p>
          ) : bounties.length === 0 ? (
             <div className="rounded-xl p-8 text-center text-[var(--muted)] border border-dashed border-[var(--border)]">
                No bounties deployed yet.
             </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {bounties.map(b => {
                const isPending = !b.isOpen && b.proofsOpenAt === 0
                const isSettledOrClosed = !b.isOpen && b.proofsOpenAt > 0
                const isContestationDone = Date.now() / 1000 >= b.createdAt + (72 * 3600)
                
                return (
                  <div key={b.bountyId.toString()} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-3">
                           <h3 className="font-bold text-lg text-white font-mono">Bounty #{b.bountyId.toString()}</h3>
                           {isPending && <Badge variant="gold" dot>PENDING (72h)</Badge>}
                           {b.isOpen && <Badge variant="success" dot>ACTIVE</Badge>}
                           {isSettledOrClosed && <Badge variant="error" dot>SETTLED / CLOSED</Badge>}
                        </div>
                        <p className="text-xs text-[var(--muted)] mt-1">Reward: {Number(b.reward) / 1e6} USDT</p>
                      </div>

                      <div className="flex gap-2">
                         {isPending && (
                            <Button 
                              variant="primary" 
                              onClick={() => activateBounty(b.bountyId)}
                              disabled={!isContestationDone || isPending === undefined}
                            >
                              {isContestationDone ? 'Activate Bounty' : 'Contestation Active'}
                            </Button>
                         )}
                         {b.isOpen && (
                            <Button variant="danger" onClick={() => cancelBounty(b.bountyId)}>
                              Cancel & Withdraw
                            </Button>
                         )}
                         {isSettledOrClosed && (
                            <Button 
                              variant="primary" 
                              onClick={() => handleDecrypt(b.bountyId)}
                              isLoading={decryptingId === b.bountyId}
                            >
                              Decrypt 0-Day
                            </Button>
                         )}
                      </div>
                    </div>

                    {decryptedPayloads[b.bountyId.toString()] && (
                      <div className="mt-2 animate-fade-up">
                        <p className="ztb-label mb-2 text-[#5FA8D3]">Decrypted 0-Day Exploit JSON</p>
                        <pre className="font-mono text-xs overflow-auto p-4 bg-[#0A0D14] rounded-lg border border-[#4ADE80]/30 text-[#4ADE80] max-h-64 shadow-[0_0_15px_rgba(74,222,128,0.1)_inset]">
                          {decryptedPayloads[b.bountyId.toString()]}
                        </pre>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </main>
  )
}
