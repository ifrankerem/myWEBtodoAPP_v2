# Orchestra

This repository runs the orchestra: a brain (Claude Code or Codex) plans and reviews, and OpenCode agents write the tests (`orchestra-tester`) and the code (`orchestra-worker`). Brain rules: `~/.orchestra/BRAIN.md`.

GitHub: ifrankerem/myWEBtodoAPP_v2

## Setup

Run once per clone, before the first task:

- `npm ci`
- `npm ci --prefix worker`

## Verify

Every command passes before a PR is ready, and the brain runs them again before merging:

- `npm test`
- `npm run lint`
- `npx tsc --noEmit`
- `npm --prefix worker run typecheck`
- `npm run build`
- `npm run android:apk` — only when the task touches `android/`, `capacitor.config.ts` or a `@capacitor*` dependency. Needs the Android SDK from `android/local.properties`.

## Tests

Where tests live, how they are named, how to run a single test file:

- Vitest 4 with jsdom and Testing Library (`vitest.config.mts`, `vitest.setup.ts`). Every test lives flat in `tests/`.
- Name a test after the module it covers: `tests/<module>.test.ts` for logic, `tests/<component>.test.tsx` for React components. Tests for the Cloudflare Worker are prefixed `worker-` and import from `../worker/src/...`.
- Import app code through the `@/` alias, e.g. `import { toRepeatRule } from '@/lib/repeat-rule'`.
- Run one file: `npx vitest run tests/<file>.test.ts`.
- Pin dates and timezones in tests (fixed `Date` values, explicit IANA zones); never depend on the machine clock or locale.

## Commits

- Conventional Commits `type(scope): subject`, lowercase imperative subject, header at most 100 characters, e.g. `fix(fields): grow task title and notes with their text`.
- Scope is the area touched: `alarms`, `tasks`, `calendar`, `ui`, `fields`, `android`, `worker`, `storage`.

## Project rules

Files every agent reads before working:

- `README.md` — stack, features and project layout.
- `worker/README.md` — when a task touches `worker/` or alarm delivery.

## Off limits

Paths no task changes unless the owner says so:

- Files `npx cap sync android` regenerates: `android/app/src/main/assets/`, `android/app/capacitor.build.gradle`, `android/capacitor.settings.gradle`, `android/capacitor-cordova-android-plugins/`. Hand-written Android files (`android/app/src/main/java/`, `AndroidManifest.xml`, `res/`, Gradle files) change only when the issue's Files section lists them.
- `.env*`, `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `worker/wrangler.jsonc` — deploy config and security rules.
- `next.config.mjs` — static-export build config that the Android bundle depends on.
- `components/ui/` — generated shadcn/ui primitives.
- `design/`, `.superdesign/`, `.agents/`, `skills-lock.json`, `ORCHESTRA.md`.
- Generated output: `.next/`, `out/`, `node_modules/`, `worker/node_modules/`.
