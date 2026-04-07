/* eslint-disable @typescript-eslint/no-unused-vars */
// lib/ipfs.ts — ZTB IPFS Utilities (stub — à compléter par Youssef)
// Utilisé par app/sponsor/page.tsx pour uploader WASM et bitmaps

export interface IPFSUploadResult {
  url:  string
  cid:  string
  size: number
}

/**
 * Upload un fichier WASM sur IPFS via Pinata / nœud local.
 * @stub — implémentation à fournir
 */
export async function uploadWASM(file: File): Promise<IPFSUploadResult> {
  const jwt = process.env.NEXT_PUBLIC_PINATA_JWT
  if (!jwt) throw new Error('uploadWASM: NEXT_PUBLIC_PINATA_JWT manquant dans .env.local')

  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Erreur Pinata IPFS : ${errorText}`)
  }

  const data = await res.json()
  return {
    url:  `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`,
    cid:  data.IpfsHash,
    size: data.PinSize,
  }
}

/**
 * Upload deux bitmaps de couverture (A et B) sur IPFS.
 * @stub — implémentation à fournir
 */
export async function uploadDualBitmap(
  bytesA: Uint8Array,
  bytesB: Uint8Array,
): Promise<IPFSUploadResult> {
  const jwt = process.env.NEXT_PUBLIC_PINATA_JWT
  if (!jwt) throw new Error('uploadDualBitmap: NEXT_PUBLIC_PINATA_JWT manquant dans .env.local')

  const formData = new FormData()
  const content = JSON.stringify({
    bitmapA: Array.from(bytesA),
    bitmapB: Array.from(bytesB),
  })
  
  const blob = new Blob([content], { type: 'application/json' })
  formData.append('file', blob, 'dual_bitmaps.json')

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Erreur Pinata IPFS JSON : ${errorText}`)
  }

  const data = await res.json()
  return {
    url:  `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`,
    cid:  data.IpfsHash,
    size: data.PinSize,
  }
}

/**
 * Calcule le CIDv1 SHA2-256 d'un fichier (simulé côté navigateur via SHA-256 hex).
 */
export async function computeFileCID(file: File): Promise<`0x${string}`> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return computeBytesCID(bytes)
}

/**
 * Calcule le CIDv1 SHA2-256 de bytes bruts → retourne SHA-256 hex (0x-prefixed).
 */
export async function computeBytesCID(bytes: Uint8Array): Promise<`0x${string}`> {
  const plain      = new Uint8Array(bytes)           // garantit un ArrayBuffer sans SharedArrayBuffer
  const hashBuffer = await crypto.subtle.digest('SHA-256', plain)
  const hashArray  = Array.from(new Uint8Array(hashBuffer))
  const hashHex    = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return `0x${hashHex}`
}
