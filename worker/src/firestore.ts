// Minimal Firestore REST client for the Workers runtime.
//
// The Firebase Admin SDK is Node-only, so the worker authenticates directly
// with a service account JWT and talks to the Firestore v1 REST API.

interface ServiceAccount {
  client_email: string
  private_key: string
  project_id?: string
}

export type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }

export interface FirestoreDocument {
  name: string
  fields?: Record<string, FirestoreValue>
}

const encoder = new TextEncoder()

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Unwrap a Firestore typed value into a plain JS value. */
export function readValue(value: FirestoreValue | undefined): unknown {
  if (!value) return undefined
  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('booleanValue' in value) return value.booleanValue
  if ('nullValue' in value) return null
  if ('timestampValue' in value) return Date.parse(value.timestampValue)
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(readValue)
  if ('mapValue' in value) return readFields(value.mapValue.fields)
  return undefined
}

export function readFields(
  fields: Record<string, FirestoreValue> | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields ?? {})) out[key] = readValue(value)
  return out
}

/** Last path segment of a Firestore resource name. */
export function documentId(name: string): string {
  return name.slice(name.lastIndexOf('/') + 1)
}

export class FirestoreClient {
  private readonly account: ServiceAccount
  readonly projectId: string
  private token: { value: string; expiresAt: number } | null = null

  constructor(serviceAccountJson: string, projectId?: string) {
    let account: ServiceAccount
    try {
      account = JSON.parse(serviceAccountJson) as ServiceAccount
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON')
    }
    if (!account.client_email || !account.private_key) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is missing client_email or private_key')
    }

    const resolvedProjectId = projectId || account.project_id
    if (!resolvedProjectId) throw new Error('Firebase project id is not configured')

    this.account = account
    this.projectId = resolvedProjectId
  }

  private get documentsUrl(): string {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`
  }

  private async getAccessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value

    const now = Math.floor(Date.now() / 1000)
    const header = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
    const claims = base64Url(
      encoder.encode(
        JSON.stringify({
          iss: this.account.client_email,
          scope: 'https://www.googleapis.com/auth/datastore',
          aud: 'https://oauth2.googleapis.com/token',
          iat: now,
          exp: now + 3600,
        })
      )
    )

    const key = await crypto.subtle.importKey(
      'pkcs8',
      // Secrets often round-trip through shells that turn newlines into "\n".
      pemToPkcs8(this.account.private_key.replace(/\\n/g, '\n')) as BufferSource,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const signingInput = `${header}.${claims}`
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        key,
        encoder.encode(signingInput) as BufferSource
      )
    )

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${signingInput}.${base64Url(signature)}`,
      }),
    })

    if (!response.ok) {
      throw new Error(`Token exchange failed (${response.status}): ${await response.text()}`)
    }

    const body = (await response.json()) as { access_token: string; expires_in: number }
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    }
    return this.token.value
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken()
    return fetch(`${this.documentsUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
  }

  /** `alarms` documents that are active and already due. */
  async queryDueAlarms(nowMs: number, limit: number): Promise<FirestoreDocument[]> {
    const response = await this.request(':runQuery', {
      method: 'POST',
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'alarms' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: 'active' },
                    op: 'EQUAL',
                    value: { booleanValue: true },
                  },
                },
                {
                  fieldFilter: {
                    field: { fieldPath: 'fireAt' },
                    op: 'LESS_THAN_OR_EQUAL',
                    value: { integerValue: String(nowMs) },
                  },
                },
              ],
            },
          },
          orderBy: [{ field: { fieldPath: 'fireAt' }, direction: 'ASCENDING' }],
          limit,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`runQuery failed (${response.status}): ${await response.text()}`)
    }

    const rows = (await response.json()) as Array<{ document?: FirestoreDocument }>
    return rows.map((row) => row.document).filter((doc): doc is FirestoreDocument => Boolean(doc))
  }

  async listPushSubscriptions(uid: string): Promise<FirestoreDocument[]> {
    const response = await this.request(`/users/${encodeURIComponent(uid)}/pushSubscriptions`)
    if (response.status === 404) return []
    if (!response.ok) {
      throw new Error(`listPushSubscriptions failed (${response.status})`)
    }
    const body = (await response.json()) as { documents?: FirestoreDocument[] }
    return body.documents ?? []
  }

  async updateAlarm(
    alarmId: string,
    fields: { fireAt?: number; active?: boolean; lastSentAt?: number }
  ): Promise<void> {
    const mask = Object.keys(fields)
      .map((field) => `updateMask.fieldPaths=${field}`)
      .join('&')

    const documentFields: Record<string, FirestoreValue> = {}
    if (fields.fireAt !== undefined) {
      documentFields.fireAt = { integerValue: String(Math.round(fields.fireAt)) }
    }
    if (fields.active !== undefined) documentFields.active = { booleanValue: fields.active }
    if (fields.lastSentAt !== undefined) {
      documentFields.lastSentAt = { integerValue: String(Math.round(fields.lastSentAt)) }
    }

    const response = await this.request(`/alarms/${encodeURIComponent(alarmId)}?${mask}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: documentFields }),
    })

    if (!response.ok) {
      throw new Error(`updateAlarm failed (${response.status}): ${await response.text()}`)
    }
  }

  async deletePushSubscription(uid: string, subscriptionId: string): Promise<void> {
    await this.request(
      `/users/${encodeURIComponent(uid)}/pushSubscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: 'DELETE' }
    )
  }
}
