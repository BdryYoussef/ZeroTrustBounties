import { secp256k1 } from '@noble/curves/secp256k1'
import { hkdf }      from '@noble/hashes/hkdf'
import { sha256 }    from '@noble/hashes/sha256'

export interface ECIESKeyPair {
  privateKey:    Uint8Array
  publicKey:     Uint8Array
  publicKeyHex:  string
  privateKeyHex: string
}

export interface ECIESEncrypted {
  ephemeralPublicKey: Uint8Array
  iv:                 Uint8Array
  ciphertext:         Uint8Array
  tag:                Uint8Array
  serialized:         Uint8Array
  serializedHex:      string
}

export function generateECIESKeyPair(): ECIESKeyPair {
  const privateKey = secp256k1.utils.randomPrivateKey()
  const publicKey  = secp256k1.getPublicKey(privateKey, false)

  return {
    privateKey,
    publicKey,
    publicKeyHex:  '0x' + toHex(publicKey),
    privateKeyHex: toHex(privateKey),
  }
}

export async function encryptPayload(
  payload:         Uint8Array,
  recipientPubKey: Uint8Array,
): Promise<ECIESEncrypted> {
  const ephPrivKey   = secp256k1.utils.randomPrivateKey()
  const ephPubKey    = secp256k1.getPublicKey(ephPrivKey, false)
  const sharedPoint  = secp256k1.getSharedSecret(ephPrivKey, recipientPubKey)
  const sharedSecret = sharedPoint.slice(1, 33)

  const aesKeyBytes = hkdf(
    sha256,
    sharedSecret,
    undefined,
    new TextEncoder().encode('ZTB-ECIES-V4.3'),
    32,
  )
  const aesKeyBuffer = Uint8Array.from(aesKeyBytes)
  const payloadBuffer = Uint8Array.from(payload)

  const iv = crypto.getRandomValues(new Uint8Array(12))

  const cryptoKey = await crypto.subtle.importKey(
    'raw', aesKeyBuffer, { name: 'AES-GCM' }, false, ['encrypt'],
  )

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, cryptoKey, payloadBuffer,
  )

  const encryptedBytes = new Uint8Array(encryptedBuffer)
  const ciphertext     = encryptedBytes.slice(0, -16)
  const tag            = encryptedBytes.slice(-16)

  const serialized = new Uint8Array(65 + 12 + 16 + ciphertext.length)
  let offset = 0
  serialized.set(ephPubKey,  offset); offset += 65
  serialized.set(iv,         offset); offset += 12
  serialized.set(tag,        offset); offset += 16
  serialized.set(ciphertext, offset)

  return {
    ephemeralPublicKey: ephPubKey,
    iv,
    ciphertext,
    tag,
    serialized,
    serializedHex: '0x' + toHex(serialized),
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}