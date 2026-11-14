// HMAC-SHA256 verification for Razorpay webhooks. Pure Web Crypto, so it runs in Deno (Edge Functions) and Node (tests).
const enc = new TextEncoder()

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export async function hmacSha256(secret: string, body: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)))
}

/** Constant-time check of `signatureHex` against HMAC-SHA256(secret, rawBody). Returns false for anything malformed. */
export async function verifyRazorpaySignature(rawBody: string, signatureHex: string | null | undefined, secret: string | undefined): Promise<boolean> {
  if (!secret || !signatureHex) return false
  const given = hexToBytes(signatureHex.trim())
  if (!given) return false
  const expected = await hmacSha256(secret, rawBody)
  if (given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ given[i]
  return diff === 0
}
