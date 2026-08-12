// Web Push subscription management.
//
// iOS only delivers notifications to a PWA that has been added to the Home
// Screen (iOS 16.4+). In-page timers are killed the moment the web app is
// backgrounded, so Web Push is the only way an alarm can reach the user when
// the app is not open.

import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore'
import { getDbInstance } from './firebase'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

export type PushBlockReason =
  | 'unsupported-browser'
  | 'ios-needs-home-screen'
  | 'ios-too-old'
  | 'missing-vapid-key'
  | 'permission-denied'

export interface PushEnvironment {
  supported: boolean
  isIOS: boolean
  isStandalone: boolean
  permission: NotificationPermission | 'unsupported'
  blockedBy: PushBlockReason | null
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=')
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return ''
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Short stable id for a push endpoint so re-subscribing overwrites in place. */
function endpointId(endpoint: string): string {
  let hash = 0
  for (let i = 0; i < endpoint.length; i++) {
    hash = (hash << 5) - hash + endpoint.charCodeAt(i)
    hash |= 0
  }
  return `ep${Math.abs(hash).toString(36)}${endpoint.length.toString(36)}`
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS 13+ reports a desktop Safari UA, so fall back to touch points.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  const legacyStandalone = (navigator as Navigator & { standalone?: boolean }).standalone
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    legacyStandalone === true
  )
}

/** iOS version from the user agent ("OS 16_4" -> 16.4), or null off-iOS. */
function getIOSVersion(): number | null {
  if (typeof navigator === 'undefined') return null
  const match = /OS (\d+)[._](\d+)/.exec(navigator.userAgent)
  if (!match) return null
  return Number(`${match[1]}.${match[2]}`)
}

export function getPushEnvironment(): PushEnvironment {
  const isIOS = isIOSDevice()
  const isStandalone = isStandaloneDisplay()

  const hasApis =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  const permission: NotificationPermission | 'unsupported' = hasApis
    ? Notification.permission
    : 'unsupported'

  let blockedBy: PushBlockReason | null = null

  if (!hasApis) {
    // On iOS the Push APIs are simply absent until the app runs from the Home Screen.
    blockedBy = isIOS && !isStandalone ? 'ios-needs-home-screen' : 'unsupported-browser'
  } else if (isIOS && !isStandalone) {
    blockedBy = 'ios-needs-home-screen'
  } else if (isIOS && (getIOSVersion() ?? 0) < 16.4) {
    blockedBy = 'ios-too-old'
  } else if (!VAPID_PUBLIC_KEY) {
    blockedBy = 'missing-vapid-key'
  } else if (permission === 'denied') {
    blockedBy = 'permission-denied'
  }

  return { supported: hasApis && !blockedBy, isIOS, isStandalone, permission, blockedBy }
}

function subscriptionsCollection(uid: string) {
  return collection(getDbInstance(), 'users', uid, 'pushSubscriptions')
}

async function persistSubscription(uid: string, subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON()
  const keys = json.keys ?? {}

  await setDoc(doc(subscriptionsCollection(uid), endpointId(subscription.endpoint)), {
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh ?? arrayBufferToBase64Url(subscription.getKey('p256dh')),
    auth: keys.auth ?? arrayBufferToBase64Url(subscription.getKey('auth')),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
    updatedAt: Date.now(),
  })
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

export interface EnablePushResult {
  ok: boolean
  reason?: PushBlockReason | 'subscribe-failed'
}

/**
 * Ask for permission and subscribe. Must be called from a user gesture —
 * iOS rejects `Notification.requestPermission()` outside one.
 */
export async function enablePush(uid: string): Promise<EnablePushResult> {
  const environment = getPushEnvironment()
  if (environment.blockedBy) return { ok: false, reason: environment.blockedBy }

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()

  if (permission !== 'granted') return { ok: false, reason: 'permission-denied' }

  const registration = await getRegistration()
  if (!registration) return { ok: false, reason: 'subscribe-failed' }

  try {
    const existing = await registration.pushManager.getSubscription()
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      }))

    await persistSubscription(uid, subscription)
    return { ok: true }
  } catch (error) {
    console.error('Push subscribe failed:', error)
    return { ok: false, reason: 'subscribe-failed' }
  }
}

export async function disablePush(uid: string): Promise<void> {
  const registration = await getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return

  try {
    await deleteDoc(doc(subscriptionsCollection(uid), endpointId(subscription.endpoint)))
  } catch (error) {
    console.error('Failed to remove stored push subscription:', error)
  }

  await subscription.unsubscribe()
}

export async function isPushEnabled(): Promise<boolean> {
  const registration = await getRegistration()
  if (!registration) return false
  return (await registration.pushManager.getSubscription()) !== null
}

/**
 * Re-persist the current subscription on app start. Push endpoints rotate
 * (iOS does this fairly aggressively) and the worker only knows what is in
 * Firestore, so refresh on every launch. Other devices' subscriptions are left
 * alone — the worker prunes them when the push service reports them as gone.
 */
export async function refreshPushSubscription(uid: string): Promise<void> {
  if (!uid) return
  const registration = await getRegistration()
  if (!registration) return

  let subscription: PushSubscription | null = null
  try {
    subscription = await registration.pushManager.getSubscription()
  } catch {
    return
  }
  if (!subscription) return

  try {
    await persistSubscription(uid, subscription)
  } catch (error) {
    console.error('Failed to refresh push subscription:', error)
  }
}
