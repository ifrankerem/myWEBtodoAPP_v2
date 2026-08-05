# Routes

## Framework routing

- Framework: Next.js 15 App Router.
- Router type: file-based (`app/`).
- Root layout: `app/layout.tsx`.
- Global stylesheet: `app/globals.css`, imported by the root layout.

## Route map

| URL | Entry | Layout | Summary |
| --- | --- | --- | --- |
| `/` | `app/page.tsx` | `app/layout.tsx` | Authenticated single-page task manager. Local state switches between tasks, completed tasks, calendar, task detail, add task, and settings screens. Unauthenticated users see the login screen. |

## Full route controller

`app/page.tsx` is the sole route controller. Its actual authenticated render branch starts at line 394 and conditionally mounts:

- `components/tasks-grid-screen.tsx` for `tasks` and `completed`
- `components/calendar-screen.tsx` for `calendar`
- `components/task-detail-screen.tsx` for `detail`
- `components/add-task-screen.tsx` for `add`
- `components/settings-screen.tsx` for `settings`
- `components/sliding-drawer.tsx` as the shared navigation layer

Before that branch, the route shows a full-screen auth-loading state, `components/login-screen.tsx` for signed-out users, or a syncing state.
