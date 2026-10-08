// Firebase ID token verification, WebCrypto only.
//
// The alarm endpoints are open by design — they are reached by a cron, not by
// the app — but `/voice-intent` costs a Workers AI call per request, so it is
// closed to everyone who cannot present a token this project signed.
//
// The keys come from Google's public JWKS and are cached in module scope for as
// long as the response says they are fresh, so a burst of requests does not turn
// into a burst of key fetches.

/** Where Google serves the keys that sign Firebase ID tokens. */
const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

/** Used when the response says nothing about how long the keys are good for. */
const DEFAULT_MAX_AGE = 60 * 60

/** Tokens are accepted this far either side of their stated times. */
const CLOCK_SKEW = 60

/** The parts of a JWKS entry we need; `kid` is what a token names. */
interface JwkEntry extends JsonWebKey {
  kid?: string
}

/** Keys plus the time the cache goes stale, both in the units JWT times use. */
interface CachedKeys {
  keys: Map<string, CryptoKey>
  expiresAt: number
}

/**
 * Module scope on purpose: the cache has to outlive a request. Tests reset the
 * module registry to observe it.
 */
let cache: CachedKeys | null = null

/** Base64url as bytes, for the JWT segments and the signature. */
function base64UrlDecode(segment: string): Uint8Array<ArrayBuffer> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function decodeJson(segment: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(segment)))
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** How long the response says its keys stay fresh, in seconds. */
function maxAge(response: Response): number {
  const match = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')
  return match ? Number(match[1]) : DEFAULT_MAX_AGE
}

async function signingKey(kid: string, seconds: number): Promise<CryptoKey> {
  if (cache === null || cache.expiresAt <= seconds) {
    const response = await fetch(JWKS_URL)
    if (!response.ok) throw new Error(`JWKS fetch failed: ${response.status}`)

    const body = (await response.json()) as { keys?: JwkEntry[] }
    const keys = new Map<string, CryptoKey>()

    for (const jwk of body.keys ?? []) {
      if (typeof jwk.kid !== 'string') continue
      keys.set(jwk.kid, await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      ))
    }

    cache = { keys, expiresAt: seconds + maxAge(response) }
  }

  const key = cache.keys.get(kid)
  if (!key) throw new Error(`unknown kid: ${kid}`)
  return key
}

/**
 * The uid a Firebase ID token belongs to, or a throw for anything that is not a
 * token this project signed and has not expired.
 */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  now = Math.floor(Date.now() / 1000)
): Promise<{ uid: string }> {
  // JWT times are in seconds, and so is `now`, which callers may pin.
  const seconds = now
  const segments = token.split('.')
  if (segments.length !== 3) throw new Error('malformed token')

  const [headerSegment, payloadSegment, signatureSegment] = segments
  const header = decodeJson(headerSegment)
  const claims = decodeJson(payloadSegment)
  if (header === null || claims === null) throw new Error('malformed token')

  // Checked before the signature: an HS256 token must never reach key
  // verification, or "alg: none" would be a way in.
  if (header.alg !== 'RS256') throw new Error('unsupported algorithm')
  if (typeof header.kid !== 'string' || header.kid === '') throw new Error('missing kid')

  const key = await signingKey(header.kid, seconds)

  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlDecode(signatureSegment),
    new TextEncoder().encode(`${headerSegment}.${payloadSegment}`)
  )
  if (!verified) throw new Error('bad signature')

  if (claims.aud !== projectId) throw new Error('wrong audience')
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('wrong issuer')

  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW <= seconds) {
    throw new Error('expired')
  }
  if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW > seconds) {
    throw new Error('issued in the future')
  }

  if (typeof claims.sub !== 'string' || claims.sub === '') throw new Error('missing sub')
  return { uid: claims.sub }
}
