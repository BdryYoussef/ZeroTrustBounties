// src/utils/crypto.ts — ZTB Hacker Crypto Utilities
// Wrapper autour de lib/ecies.ts pour l'API simplifiée du portail hacker.
// Cipher: secp256k1 + HKDF-SHA256 + AES-256-GCM · ZTB-ECIES-V4.3

import { encryptPayload, hexToBytes } from '@/lib/ecies'

// ── Types ──────────────────────────────────────────────────────

export interface EncryptResult {
  /** Payload chiffré sérialisé en hex (0x-prefixed) — pour encryptedPayload on-chain */
  encryptedHex: `0x${string}`
  /** SHA-256 du payload JSON brut en hex (0x-prefixed) — pour payloadHash on-chain */
  payloadHash: `0x${string}`
  /** Longueur en bytes du payload JSON brut — pour payloadLength on-chain */
  payloadLength: number
  /** Nonce anti-replay aléatoire — pour commitment et submitProof */
  nonce: bigint
}

// ── API principale ─────────────────────────────────────────────

/**
 * Chiffre un payload JSON avec la clé publique ECIES du sponsor.
 *
 * @param payload         – Objet JSON à chiffrer (ex: contenu de proof.json)
 * @param sponsorPubKeyHex – Clé publique sponsor (hex, avec ou sans 0x)
 * @returns               – Données prêtes à passer à submitProof()
 */
export async function encryptJsonPayload(
  payload: object,
  sponsorPubKeyHex: string,
): Promise<EncryptResult> {
  // 1. Sérialiser le payload en bytes UTF-8
  const jsonStr    = JSON.stringify(payload)
  const rawBytes   = new TextEncoder().encode(jsonStr)
  const payloadLength = rawBytes.length

  // 2. Calculer le SHA-256 du payload brut (pour le commitment et payloadHash on-chain)
  const hashBuffer = await crypto.subtle.digest('SHA-256', rawBytes)
  const hashBytes  = new Uint8Array(hashBuffer)
  const payloadHash = ('0x' + toHex(hashBytes)) as `0x${string}`

  // 3. Parser la clé publique sponsor (hex → Uint8Array)
  const pubKeyBytes = hexToBytes(sponsorPubKeyHex)

  // 4. Chiffrer via ECIES (secp256k1 + HKDF + AES-256-GCM)
  const encrypted = await encryptPayload(rawBytes, pubKeyBytes)

  // 5. Nonce aléatoire 32 bytes → bigint
  const nonceBytes = crypto.getRandomValues(new Uint8Array(32))
  const nonce = bytesToBigInt(nonceBytes)

  return {
    encryptedHex:  encrypted.serializedHex as `0x${string}`,
    payloadHash,
    payloadLength,
    nonce,
  }
}

/**
 * Calcule le commitment hacker : keccak256(address || sha256(payload) || nonce)
 * Ré-expose computeCommitment de useZTBContract pour usage dans le composant.
 */
export { computeCommitment } from '@/hooks/useZTBContract'

// ── Utilitaires internes ───────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = BigInt(0)
  for (const byte of bytes) {
    result = (result * BigInt(256)) + BigInt(byte)
  }
  return result
}
