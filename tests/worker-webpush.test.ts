// Round-trips the worker's RFC 8291 encryption through a receiver
// implementation, so a broken key derivation fails here instead of silently
// producing pushes that iOS drops.

import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { bytesToBase64Url, sendWebPush, type VapidKeys } from '../worker/src/webpush'

const subtle = webcrypto.subtle
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function concat(...chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  return new Uint8Array(await subtle.sign('HMAC', cryptoKey, data))
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length)
}

/** Receiver side of RFC 8291: decrypt an aes128gcm push body. */
async function decryptPushBody(
  body: Uint8Array,
  userPrivateKey: CryptoKey,
  userPublicKey: Uint8Array,
  authSecret: Uint8Array
): Promise<string> {
  const salt = body.slice(0, 16)
  const keyIdLength = body[20]
  const serverPublicKey = body.slice(21, 21 + keyIdLength)
  const ciphertext = body.slice(21 + keyIdLength)

  const serverKey = await subtle.importKey(
    'raw',
    serverPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )
  const sharedSecret = new Uint8Array(
    await subtle.deriveBits({ name: 'ECDH', public: serverKey }, userPrivateKey, 256)
  )

  const authPrk = await hmac(authSecret, sharedSecret)
  const ikm = await hkdfExpand(
    authPrk,
    concat(encoder.encode('WebPush: info'), new Uint8Array([0]), userPublicKey, serverPublicKey),
    32
  )

  const prk = await hmac(salt, ikm)
  const cek = await hkdfExpand(prk, encoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdfExpand(prk, encoder.encode('Content-Encoding: nonce\0'), 12)

  const aesKey = await subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt'])
  const plaintext = new Uint8Array(
    await subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, ciphertext)
  )

  // Strip the trailing 0x02 record delimiter.
  return decoder.decode(plaintext.slice(0, -1))
}

async function makeSubscription() {
  const keyPair = (await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair
  const publicKey = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey))
  const authSecret = webcrypto.getRandomValues(new Uint8Array(16))

  return {
    privateKey: keyPair.privateKey,
    publicKey,
    authSecret,
    subscription: {
      endpoint: 'https://web.push.apple.com/test-endpoint',
      p256dh: bytesToBase64Url(publicKey),
      auth: bytesToBase64Url(authSecret),
    },
  }
}

async function makeVapidKeys(): Promise<VapidKeys> {
  const keyPair = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const publicKey = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey))
  const jwk = await subtle.exportKey('jwk', keyPair.privateKey)

  return {
    publicKey: bytesToBase64Url(publicKey),
    privateKey: jwk.d as string,
    subject: 'mailto:test@example.com',
  }
}

describe('sendWebPush', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends a payload the subscriber can decrypt, with a VAPID authorization header', async () => {
    const { privateKey, publicKey, authSecret, subscription } = await makeSubscription()
    const vapid = await makeVapidKeys()

    let captured: { url: string; init: RequestInit } | null = null
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      captured = { url, init }
      return new Response(null, { status: 201 })
    })

    const payload = { title: '🔔 ALARM', body: 'Take out the trash', taskId: 'abc' }
    const result = await sendWebPush(subscription, payload, vapid)

    expect(result).toEqual({ ok: true, status: 201 })
    expect(captured).not.toBeNull()

    const { init } = captured!
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Encoding']).toBe('aes128gcm')
    expect(headers.TTL).toBe('3600')
    expect(headers.Authorization).toMatch(
      new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${vapid.publicKey}$`)
    )

    const decrypted = await decryptPushBody(
      new Uint8Array(init.body as ArrayBuffer),
      privateKey,
      publicKey,
      authSecret
    )
    expect(JSON.parse(decrypted)).toEqual(payload)
  })

  it('signs the VAPID JWT for the push service origin with a future expiry', async () => {
    const { subscription } = await makeSubscription()
    const vapid = await makeVapidKeys()

    let authorization = ''
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      authorization = (init.headers as Record<string, string>).Authorization
      return new Response(null, { status: 201 })
    })

    await sendWebPush(subscription, { title: 'x' }, vapid)

    const jwt = authorization.slice('vapid t='.length, authorization.indexOf(', k='))
    const claims = JSON.parse(
      Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')
    ) as { aud: string; exp: number; sub: string }

    expect(claims.aud).toBe('https://web.push.apple.com')
    expect(claims.sub).toBe('mailto:test@example.com')
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
    expect(claims.exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 24 * 60 * 60)
  })

  it('flags 410 Gone so the caller prunes the dead endpoint', async () => {
    const { subscription } = await makeSubscription()
    const vapid = await makeVapidKeys()

    vi.stubGlobal('fetch', async () => new Response('gone', { status: 410 }))

    const result = await sendWebPush(subscription, { title: 'x' }, vapid)
    expect(result).toMatchObject({ ok: false, status: 410, gone: true })
  })

  it('reports transport failures instead of throwing', async () => {
    const { subscription } = await makeSubscription()
    const vapid = await makeVapidKeys()

    vi.stubGlobal('fetch', async () => {
      throw new Error('network down')
    })

    const result = await sendWebPush(subscription, { title: 'x' }, vapid)
    expect(result).toMatchObject({ ok: false, status: 0, gone: false, error: 'network down' })
  })
})
