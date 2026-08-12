// Web Push (RFC 8291 message encryption + RFC 8292 VAPID) implemented on top
// of WebCrypto only, so it runs on the Cloudflare Workers runtime without the
// Node-only `web-push` package.

export interface PushSubscriptionKeys {
  endpoint: string
  p256dh: string
  auth: string
}

export interface VapidKeys {
  /** base64url, uncompressed P-256 point (65 bytes). */
  publicKey: string
  /** base64url, raw P-256 private scalar (32 bytes). */
  privateKey: string
  /** `mailto:` or `https:` contact, required by push services. */
  subject: string
}

export type PushSendResult =
  | { ok: true; status: number }
  | { ok: false; status: number; gone: boolean; error: string }

const encoder = new TextEncoder()

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data as BufferSource))
}

/** Single-block HKDF-Expand — every output we need is <= 32 bytes. */
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const block = await hmacSha256(prk, concat(info, new Uint8Array([1])))
  return block.slice(0, length)
}

/** Split an uncompressed P-256 point into the x/y coordinates a JWK needs. */
function publicKeyToJwkCoordinates(publicKey: Uint8Array): { x: string; y: string } {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error('VAPID public key must be a 65-byte uncompressed P-256 point')
  }
  return {
    x: bytesToBase64Url(publicKey.slice(1, 33)),
    y: bytesToBase64Url(publicKey.slice(33, 65)),
  }
}

/** RFC 8292 VAPID `Authorization` header for one push service origin. */
async function buildVapidAuthorization(audience: string, vapid: VapidKeys): Promise<string> {
  const { x, y } = publicKeyToJwkCoordinates(base64UrlToBytes(vapid.publicKey))

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d: vapid.privateKey, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: audience,
        // Push services reject anything more than 24h out; 12h keeps margin.
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      })
    )
  )

  const signingInput = `${header}.${claims}`
  // WebCrypto ECDSA already returns the raw r||s concatenation JWS expects.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      encoder.encode(signingInput) as BufferSource
    )
  )

  return `vapid t=${signingInput}.${bytesToBase64Url(signature)}, k=${vapid.publicKey}`
}

/** RFC 8291 aes128gcm encryption of a push payload for one subscription. */
async function encryptPayload(
  subscription: PushSubscriptionKeys,
  payload: string
): Promise<Uint8Array> {
  const userPublicKey = base64UrlToBytes(subscription.p256dh)
  const userAuth = base64UrlToBytes(subscription.auth)

  const serverKeyPair = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )) as CryptoKeyPair

  const serverPublicKey = new Uint8Array(
    (await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)) as ArrayBuffer
  )

  const userKey = await crypto.subtle.importKey(
    'raw',
    userPublicKey as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )

  // The Workers type definitions rename the ECDH peer key to `$public`
  // (`public` collides with a TS keyword), but the runtime reads `public`.
  const ecdhAlgorithm = { name: 'ECDH', public: userKey } as unknown as Parameters<
    typeof crypto.subtle.deriveBits
  >[0]

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(ecdhAlgorithm, serverKeyPair.privateKey, 256)
  )

  // IKM = HKDF(salt = auth_secret, ikm = ecdh_secret, info = "WebPush: info\0"||ua||as)
  const authPrk = await hmacSha256(userAuth, sharedSecret)
  const keyInfo = concat(
    encoder.encode('WebPush: info'),
    new Uint8Array([0]),
    userPublicKey,
    serverPublicKey
  )
  const ikm = await hkdfExpand(authPrk, keyInfo, 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const prk = await hmacSha256(salt, ikm)

  const contentEncryptionKey = await hkdfExpand(
    prk,
    encoder.encode('Content-Encoding: aes128gcm\0'),
    16
  )
  const nonce = await hkdfExpand(prk, encoder.encode('Content-Encoding: nonce\0'), 12)

  const aesKey = await crypto.subtle.importKey(
    'raw',
    contentEncryptionKey as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )

  // 0x02 is the aes128gcm delimiter marking the last (only) record.
  const plaintext = concat(encoder.encode(payload), new Uint8Array([2]))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 },
      aesKey,
      plaintext as BufferSource
    )
  )

  // Header: salt(16) | record size(4, big endian) | key id length(1) | key id
  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096, false)

  return concat(salt, recordSize, new Uint8Array([serverPublicKey.length]), serverPublicKey, ciphertext)
}

/** Send one encrypted push message. Never throws — failures come back typed. */
export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  payload: unknown,
  vapid: VapidKeys,
  ttlSeconds = 3600
): Promise<PushSendResult> {
  try {
    const audience = new URL(subscription.endpoint).origin
    const [authorization, body] = await Promise.all([
      buildVapidAuthorization(audience, vapid),
      encryptPayload(subscription, JSON.stringify(payload)),
    ])

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttlSeconds),
        Urgency: 'high',
      },
      body: body as BodyInit,
    })

    if (response.ok) return { ok: true, status: response.status }

    return {
      ok: false,
      status: response.status,
      // 404/410 mean the endpoint is permanently dead and should be pruned.
      gone: response.status === 404 || response.status === 410,
      error: (await response.text().catch(() => '')).slice(0, 300),
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      gone: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
