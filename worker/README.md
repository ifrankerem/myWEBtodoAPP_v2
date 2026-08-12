# Task Alarm Worker

Cloudflare Worker that delivers task alarms as Web Push notifications.

## Why this exists

A PWA cannot wake itself up. `setTimeout` in the page is killed as soon as iOS
suspends the web app, so an alarm scheduled in the browser never fires unless
the app happens to be open and on screen at that exact minute. The only
mechanism that reaches a closed iOS PWA is Web Push, and Web Push needs a
server to send the message at the right time. That server is this worker.

## How it works

1. The web app computes the next absolute fire time for every task alarm and
   writes it to the top-level `alarms` Firestore collection
   (`lib/alarm-sync.ts`).
2. The app registers each device's push endpoint under
   `users/{uid}/pushSubscriptions` (`lib/push-subscription.ts`).
3. This worker runs every minute, queries `active == true && fireAt <= now`,
   and pushes each due alarm to that user's devices.
4. Repeating alarms are re-armed to their next occurrence in the timezone the
   alarm was created in, so repeats survive even if the app is never reopened.
5. Endpoints that return 404/410 are deleted from Firestore.

Web Push encryption (RFC 8291 `aes128gcm`) and VAPID signing (RFC 8292) are
implemented directly on WebCrypto in `src/webpush.ts` — the `web-push` npm
package is Node-only and does not run on Workers.

## Setup

### 1. Create a Firebase service account

Firebase Console → Project Settings → Service accounts → *Generate new private
key*. This JSON lets the worker read and write Firestore while bypassing
security rules. Keep the downloaded file out of the repo — it is a credential.

### 2. Configure the worker

Edit `wrangler.jsonc` and set `VAPID_SUBJECT` (your `mailto:` address) and
`APP_URL` (the deployed web app URL, used as the notification click target).

### 3. Log in and upload the secrets

```bash
cd worker
npm install
npx wrangler login                                        # opens a browser
./scripts/setup-secrets.sh ~/Downloads/<project>-firebase-adminsdk-*.json
```

The script generates the VAPID key pair if needed (into the gitignored
`.vapid.json`), then uploads `FIREBASE_SERVICE_ACCOUNT`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY` and a random `TRIGGER_SECRET`. It prints the
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` line to copy into `.env.local` and Vercel.

> **Do not paste the service account JSON into `wrangler secret put`.** The
> prompt reads one line, so a pretty-printed key file is truncated at the first
> newline and the worker then fails with *"FIREBASE_SERVICE_ACCOUNT is not
> valid JSON"*. Always pipe it in — that is all the script does:
>
> ```bash
> jq -c . service-account.json | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
> ```

### 4. Deploy the Firestore index and rules

The due-alarm query needs a composite index on `alarms(active, fireAt)`.

```bash
cd ..
# The CLI package is `firebase-tools` — `firebase` is the client SDK and has no binary.
npx firebase-tools login
npx firebase-tools deploy --only firestore:indexes,firestore:rules
```

### 5. Deploy

```bash
cd worker
npm run deploy
npm run tail          # live logs
```

## Local development

```bash
cp .dev.vars.example .dev.vars   # fill in
npm run dev

# fire the cron handler by hand
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

With `TRIGGER_SECRET` set you can also run a sweep against the deployed worker:

```bash
curl -H "Authorization: Bearer $TRIGGER_SECRET" https://<worker>.workers.dev/run
```

The response is the run summary: how many alarms were due, sent, failed,
skipped as too late, and how many dead subscriptions were pruned.

## Behaviour notes

- **One-minute granularity.** Cron cannot run more often, so an alarm can be up
  to ~60s late.
- **Alarms more than an hour late are skipped**, not delivered. A "07:00 wake
  up" arriving at 14:00 is noise. They are still re-armed.
- **Re-arming happens even if delivery failed**, so a bad endpoint cannot make
  the same alarm fire on every subsequent run.
- **Free tier.** 100k worker requests/day and cron triggers are included; this
  workload is far under that.
