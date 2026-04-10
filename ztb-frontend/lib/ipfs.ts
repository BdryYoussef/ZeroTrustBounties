// lib/ipfs.ts — ZTB V4.3
// Real Pinata IPFS integration.
// Requires PINATA_JWT in .env.local (server-side) or NEXT_PUBLIC_PINATA_JWT (client-side).
// For security we use a Next.js API route proxy for server-side JWT.
// For the demo we read NEXT_PUBLIC_PINATA_JWT from env.

const PINATA_JWT      = process.env.NEXT_PUBLIC_PINATA_JWT ?? ''
const PINATA_GATEWAY  = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? 'https://gateway.pinata.cloud'
const PINATA_PIN_URL  = 'https://api.pinata.cloud/pinning/pinFileToIPFS'
const PINATA_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS'

// ── Helpers ───────────────────────────────────────────────────

function assertJWT() {
  if (!PINATA_JWT) {
    throw new Error(
      'PINATA_JWT missing — add NEXT_PUBLIC_PINATA_JWT=<your_jwt> to .env.local'
    )
  }
}

function pinataHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${PINATA_JWT}`,
  }
}

// ── SHA-256 CID for on-chain bytes32 commitment ───────────────
// Returns "0x" + 64 hex chars (sha256 of raw bytes), compatible with bytes32.

export async function computeFileCID(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  return computeBytesCID(new Uint8Array(buffer))
}

export async function computeBytesCID(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer)
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `0x${hex}`
}

// ── Upload a single File to Pinata → returns IPFS CID + URL ──

export async function pinFile(
  file: File | Blob,
  name: string,
): Promise<{ cid: string; url: string }> {
  assertJWT()

  const form = new FormData()
  form.append('file', file, name)
  form.append(
    'pinataMetadata',
    JSON.stringify({ name: `ZTB-${name}-${Date.now()}` }),
  )
  form.append(
    'pinataOptions',
    JSON.stringify({ cidVersion: 1 }),
  )

  const res = await fetch(PINATA_PIN_URL, {
    method: 'POST',
    headers: pinataHeaders(),
    body: form,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Pinata upload failed (${res.status}): ${body}`)
  }

  const json = await res.json() as { IpfsHash: string }
  return {
    cid: json.IpfsHash,
    url: `${PINATA_GATEWAY}/ipfs/${json.IpfsHash}`,
  }
}

// ── Upload JSON object to Pinata ──────────────────────────────

export async function pinJSON(
  data: unknown,
  name: string,
): Promise<{ cid: string; url: string }> {
  assertJWT()

  const res = await fetch(PINATA_JSON_URL, {
    method: 'POST',
    headers: {
      ...pinataHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pinataContent: data,
      pinataMetadata: { name: `ZTB-${name}-${Date.now()}` },
      pinataOptions:  { cidVersion: 1 },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Pinata JSON pin failed (${res.status}): ${body}`)
  }

  const json = await res.json() as { IpfsHash: string }
  return {
    cid: json.IpfsHash,
    url: `${PINATA_GATEWAY}/ipfs/${json.IpfsHash}`,
  }
}

// ── Sponsor flow: upload WASM ─────────────────────────────────

export async function uploadWASM(
  file: File,
): Promise<{ url: string; cid: string }> {
  const result = await pinFile(file, file.name)
  return { url: result.url, cid: result.cid }
}

// ── Sponsor flow: upload dual bitmap pair ─────────────────────

async function pinFileWithRetry(
  blob: Blob,
  name: string,
  maxAttempts = 3,
): Promise<{ cid: string; url: string }> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await pinFile(blob, name)
    } catch (e) {
      lastErr = e
      if (attempt < maxAttempts) {
        // Exponential back-off: 2s, 4s, 8s
        await new Promise(r => setTimeout(r, 2000 * attempt))
      }
    }
  }
  throw lastErr
}

export async function uploadDualBitmap(
  bytesA: Uint8Array,
  bytesB: Uint8Array,
): Promise<{ url: string; cidA: string; cidB: string }> {
  const rA = await pinFileWithRetry(new Blob([bytesA], { type: 'application/octet-stream' }), 'baseline_a.bin')
  // Strict 2s debounce before baseline_b to respect Pinata free-tier rate limits
  await new Promise(r => setTimeout(r, 2000))
  const rB = await pinFileWithRetry(new Blob([bytesB], { type: 'application/octet-stream' }), 'baseline_b.bin')
  return {
    url:  rA.url,
    cidA: rA.cid,
    cidB: rB.cid,
  }
}

// ── Hacker flow: upload ECIES-encrypted payload ───────────────
// encryptedBytes should be the `serialized` Uint8Array from ecies.encryptPayload()

export async function uploadEncryptedPayload(
  encryptedBytes: Uint8Array,
  bountyId: bigint,
): Promise<{ cid: string; url: string }> {
  const blob = new Blob([encryptedBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' })
  return pinFile(blob, `exploit-bounty-${bountyId}.ecies`)
}
