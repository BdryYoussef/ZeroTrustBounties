// lib/ipfs.ts
// Mock IPFS implementation for testing purposes

export async function computeFileCID(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return computeBytesCID(new Uint8Array(buffer));
}

export async function computeBytesCID(bytes: Uint8Array): Promise<string> {
  // Simple fake deterministic hash starting with 0x to be compatible with bytes32 optionally
  let hash = 0;
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash << 5) - hash + bytes[i];
    hash |= 0; 
  }
  const hex = Math.abs(hash).toString(16).padStart(64, '0');
  return `0x${hex}`;
}

export async function uploadWASM(file: File): Promise<{ url: string }> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  const cid = await computeFileCID(file);
  return { url: `ipfs://${cid}` };
}

export async function uploadDualBitmap(bytesA: Uint8Array, bytesB: Uint8Array): Promise<{ url: string }> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  return { url: `ipfs://mock_dual_bitmap` };
}
