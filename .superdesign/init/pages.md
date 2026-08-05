# Page and Screen Dependency Trees

The app exposes one Next.js route and uses an internal `Screen` state machine. Each user-visible screen is documented separately because each is a meaningful design target.

## `/` — Route shell and task list

Entry: `app/page.tsx`

Dependencies:
- `app/page.tsx`
  - `components/tasks-grid-screen.tsx`
    - `app/page.tsx` (type-only `Task`, cycle ends here)
  - `components/calendar-screen.tsx`
    - `app/page.tsx` (type-only `Task`, cycle ends here)
  - `components/task-detail-screen.tsx`
    - `app/page.tsx` (type-only `Task`, cycle ends here)
    - `lib/storage-idb.ts`
  - `components/add-task-screen.tsx`
    - `app/page.tsx` (type-only `Task`, cycle ends here)
    - `lib/storage-idb.ts`
  - `components/sliding-drawer.tsx`
    - `app/page.tsx` (type-only `Screen`, cycle ends here)
    - `lib/auth-context.tsx`
      - `lib/firebase.ts`
  - `components/settings-screen.tsx`
    - `app/page.tsx` (type-only `Task`, cycle ends here)
    - `lib/calendar-export.ts`
    - `lib/web-notifications.ts`
    - `lib/auth-context.tsx`
      - `lib/firebase.ts`
    - `lib/storage-cloud.ts`
      - `lib/firebase.ts`
      - `lib/storage-idb.ts`
  - `components/login-screen.tsx`
    - `lib/auth-context.tsx`
      - `lib/firebase.ts`
  - `lib/auth-context.tsx`
    - `lib/firebase.ts`
  - `lib/storage-idb.ts`
  - `lib/storage-cloud.ts`
    - `lib/firebase.ts`
    - `lib/storage-idb.ts`
  - `lib/notifications.ts`
  - `lib/web-notifications.ts`

Visual-context subset for the authenticated task-list render: `app/page.tsx`, `components/tasks-grid-screen.tsx`, `components/sliding-drawer.tsx`, `app/layout.tsx`, `app/globals.css`.

## `/` — Login state

Entry: `components/login-screen.tsx`

Dependencies:
- `components/login-screen.tsx`
  - `lib/auth-context.tsx`
    - `lib/firebase.ts`

Visual-context subset: `components/login-screen.tsx`, `app/layout.tsx`, `app/globals.css`.

## `/` — Calendar screen

Entry: `components/calendar-screen.tsx`

Dependencies:
- `components/calendar-screen.tsx`
  - `app/page.tsx` (type-only `Task`; route shell)
    - `components/sliding-drawer.tsx`
    - remaining screen components and data services listed under the route shell above

Visual-context subset: `app/page.tsx`, `components/calendar-screen.tsx`, `components/sliding-drawer.tsx`, `app/layout.tsx`, `app/globals.css`.

## `/` — Task detail/edit screen

Entry: `components/task-detail-screen.tsx`

Dependencies:
- `components/task-detail-screen.tsx`
  - `app/page.tsx` (type-only `Task`; route shell)
  - `lib/storage-idb.ts`

Visual-context subset: `app/page.tsx`, `components/task-detail-screen.tsx`, `components/sliding-drawer.tsx`, `app/layout.tsx`, `app/globals.css`.

## `/` — Add task screen

Entry: `components/add-task-screen.tsx`

Dependencies:
- `components/add-task-screen.tsx`
  - `app/page.tsx` (type-only `Task`; route shell)
  - `lib/storage-idb.ts`

Visual-context subset: `app/page.tsx`, `components/add-task-screen.tsx`, `components/sliding-drawer.tsx`, `app/layout.tsx`, `app/globals.css`.

## `/` — Settings screen

Entry: `components/settings-screen.tsx`

Dependencies:
- `components/settings-screen.tsx`
  - `app/page.tsx` (type-only `Task`; route shell)
  - `lib/calendar-export.ts`
  - `lib/web-notifications.ts`
  - `lib/auth-context.tsx`
    - `lib/firebase.ts`
  - `lib/storage-cloud.ts`
    - `lib/firebase.ts`
    - `lib/storage-idb.ts`

Visual-context subset: `app/page.tsx`, `components/settings-screen.tsx`, `components/sliding-drawer.tsx`, `app/layout.tsx`, `app/globals.css`.

## Shared root layout

Entry: `app/layout.tsx`

Dependencies:
- `app/layout.tsx`
  - `lib/auth-context.tsx`
    - `lib/firebase.ts`
  - `app/globals.css`
