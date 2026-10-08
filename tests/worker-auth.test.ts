// RS256 tokens are minted and checked here rather than against Firebase, so a
// signature, claim or cache bug fails in this suite instead of in production.

import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const subtle = webcrypto.subtle
const encoder = new TextEncoder()

const PROJECT = 'demo-proj'
const ISSUER = `https://securetoken.google.com/${PROJECT}`
const KID = 'test-key-1'

/** 2026-10-09T12:00:00Z, so nothing depends on the machine clock. */
const NOW = Date.UTC(2026, 9, 9, 12, 0, 0)

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

let keys: CryptoKeyPair
/** The JWKS entry: a JsonWebKey plus the `kid` and `alg` Google serves alongside it. */
interface JwkEntry extends JsonWebKey {
  kid: string
  alg: string
}

let jwk: JwkEntry

/**
 * The JWKS lives in module scope, so each test gets a fresh module to make the
 * cache observable rather than inherited from the test before it.
 */
async function loadAuth() {
  vi.resetModules()
  return (await import('../worker/src/auth')) as typeof import('../worker/src/auth')
}

interface TokenParts {
  alg?: string
  kid?: string
  aud?: string
  iss?: string
  sub?: string
  exp?: number
  iat?: number
  [claim: string]: unknown
}

async function sign(
  claims: TokenParts,
  options: { alg?: string; kid?: string; corrupt?: boolean } = {}
): Promise<string> {
  const header = { alg: options.alg ?? 'RS256', typ: 'JWT', kid: options.kid ?? KID }
  const signingInput = `${base64Url(encoder.encode(JSON.stringify(header)))}.${base64Url(
    encoder.encode(JSON.stringify(claims))
  )}`

  const signed = new Uint8Array(
    await subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, encoder.encode(signingInput))
  )
  if (options.corrupt) {
    // Flip the last byte so the signature no longer covers the payload.
    signed[signed.length - 1] ^= 0xff
  }

  return `${signingInput}.${base64Url(signed)}`
}

/** A token that is valid in every way unless a test says otherwise. */
function validClaims(overrides: TokenParts = {}): TokenParts {
  return {
    aud: PROJECT,
    iss: ISSUER,
    sub: 'user-1',
    iat: NOW - 60,
    exp: NOW + 3600,
    ...overrides,
  }
}

/** Serve the test public key as JWKS, counting the fetches. */
function stubJwks(): { calls: number } {
  const counter = { calls: 0 }

  vi.stubGlobal('fetch', async (input: unknown) => {
    counter.calls += 1
    if (String(input).includes('googleapis.com')) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { 'Cache-Control': 'public, max-age=3600' },
      })
    }
    return new Response('not found', { status: 404 })
  })

  return counter
}

beforeEach(async () => {
  keys = await subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  )
  jwk = { ...(await subtle.exportKey('jwk', keys.publicKey)), kid: KID, alg: 'RS256', use: 'sig' }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('verifyFirebaseIdToken', () => {
  // Issue case 12
  it('case 12: accepts a token that checks out in every claim', async () => {
    stubJwks()
    const { verifyFirebaseIdToken } = await loadAuth()

    await expect(verifyFirebaseIdToken(await sign(validClaims()), PROJECT, NOW)).resolves.toEqual({
      uid: 'user-1',
    })
  })

  // Issue case 13
  it('case 13: rejects a token that fails any single claim', async () => {
    stubJwks()
    const { verifyFirebaseIdToken } = await loadAuth()

    const wrongAudience = await sign(validClaims({ aud: 'other-proj' }))
    const wrongIssuer = await sign(validClaims({ iss: 'https://securetoken.google.com/other' }))
    // Well past the expiry, so this fails whichever way the 60 s skew is applied.
    const expired = await sign(validClaims({ exp: NOW - 3600 }))
    const issuedInFuture = await sign(validClaims({ iat: NOW + 3600 }))
    const unknownKey = await sign(validClaims(), { kid: 'no-such-key' })
    const wrongAlgorithm = await sign(validClaims(), { alg: 'HS256' })
    const tampered = await sign(validClaims(), { corrupt: true })
    const noSubject = await sign(validClaims({ sub: '' }))

    for (const token of [
      wrongAudience,
      wrongIssuer,
      expired,
      issuedInFuture,
      unknownKey,
      wrongAlgorithm,
      tampered,
      noSubject,
    ]) {
      await expect(verifyFirebaseIdToken(token, PROJECT, NOW)).rejects.toThrow()
    }
  })

  it('case 13: rejects a token that is not three JWT segments', async () => {
    stubJwks()
    const { verifyFirebaseIdToken } = await loadAuth()

    await expect(verifyFirebaseIdToken('not-a-token', PROJECT, NOW)).rejects.toThrow()
    await expect(verifyFirebaseIdToken('only.two', PROJECT, NOW)).rejects.toThrow()
  })

  it('rejects a token that the project id does not match', async () => {
    stubJwks()
    const { verifyFirebaseIdToken } = await loadAuth()

    await expect(verifyFirebaseIdToken(await sign(validClaims()), 'another-proj', NOW)).rejects.toThrow()
  })

  // Issue case 14
  it('case 14: fetches the JWKS once inside the cache window', async () => {
    const counter = stubJwks()
    const { verifyFirebaseIdToken } = await loadAuth()

    await verifyFirebaseIdToken(await sign(validClaims()), PROJECT, NOW)
    const afterFirst = counter.calls
    await verifyFirebaseIdToken(await sign(validClaims({ sub: 'user-2' })), PROJECT, NOW)

    expect(afterFirst).toBe(1)
    expect(counter.calls).toBe(1)
  })
})