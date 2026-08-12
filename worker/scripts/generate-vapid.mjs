// Generate a VAPID key pair for Web Push.
//
//   node scripts/generate-vapid.mjs
//
// Writes worker/.vapid.json (gitignored) so setup-secrets.sh can upload the
// keys without them ever passing through a shell prompt. The public key also
// goes into NEXT_PUBLIC_VAPID_PUBLIC_KEY for the web app; the private key is a
// worker secret only and must never reach the browser.

import { webcrypto } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUTPUT_PATH = fileURLToPath(new URL('../.vapid.json', import.meta.url))

if (existsSync(OUTPUT_PATH) && !process.argv.includes('--force')) {
  console.error(`${OUTPUT_PATH} already exists.`)
  console.error('Re-run with --force to replace it, but note that rotating the keys')
  console.error('invalidates every device that has already subscribed to push.')
  process.exit(1)
}

const toBase64Url = (buffer) =>
  Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const keyPair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
])

const publicKey = toBase64Url(await webcrypto.subtle.exportKey('raw', keyPair.publicKey))
const { d: privateKey } = await webcrypto.subtle.exportKey('jwk', keyPair.privateKey)

writeFileSync(OUTPUT_PATH, `${JSON.stringify({ publicKey, privateKey }, null, 2)}\n`, {
  mode: 0o600,
})

console.log(`Wrote ${OUTPUT_PATH}`)
console.log('')
console.log('Add this to .env.local and to the Vercel project environment variables:')
console.log('')
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`)
