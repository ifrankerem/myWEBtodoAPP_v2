# Task Manager — Windows XP / Luna Design System

## Reproduction-only current baseline

This subsection exists only for the mandatory “Current UI” ground-truth draft. When a prompt explicitly asks for the current UI reproduction, use this baseline and the source code exactly; do not apply the XP target system yet. When a prompt asks for the XP redesign, ignore this subsection and use the target system in the rest of this document.

- Current canvas: `#0b0d10`; raised surfaces: `#12151a` and `#1a1e26`; border: `#262b35`.
- Current accent: ember `#e8913a`; success `#7ec87e`; destructive `#e05252`; secondary warning `#d4915c`.
- Current text: `#e8ecf0`; muted `#6b7280`; dim `#3b4150`.
- Current body font: DM Sans; current display font: Outfit.
- Current cards: 12–16px radii, subtle 1px borders, dark surfaces, occasional low-opacity semantic glow.
- Current page spacing: 24px; main content `max-width: 448px`; two-column square task grid; circular floating action buttons at bottom right.
- Current page title: 14px uppercase Outfit, bold, 0.2em tracking, centered in a simple mobile header.
- Current motion: fade-up/scale entrance with 300–700ms timing and stagger delays.

## Product context

Task Manager is a mobile-first Next.js PWA for creating, sorting, scheduling, completing, editing, backing up, and syncing personal tasks. Firebase/authentication, storage, notifications, drag-and-drop, calendar behavior, and screen navigation already work and must remain unchanged. This redesign changes presentation and UI composition only.

Primary jobs to be done:

- Sign in and understand sync state.
- Scan active or completed tasks quickly.
- Add, reorder, inspect, edit, complete, or delete a task.
- Review work in grid-calendar or schedule views.
- Manage account, notifications, calendar export, and backups.

Screens: login; tasks; completed tasks; calendar grid; calendar schedule; task details/edit; add task; settings; shared navigation drawer.

## Visual direction

Recreate the tactile, cheerful feel of Windows XP's Luna era as a functional web application. This is a deliberate old-school interface, not a modern UI with a blue gradient pasted on top. Use compact system typography, beveled controls, cream/gray chrome, saturated blue title bars, grouped property panels, visible borders, small status areas, and unmistakable pressed/selected states.

The app should feel like a polished Task Manager utility that could have shipped with Windows XP, while staying comfortable on a phone. Nostalgia must never reduce legibility or touch usability.

Do not use: glassmorphism, generic modern dark surfaces, neon glows, oversized floating circles, modern pill-heavy layouts, huge radii, sparse marketing-page spacing, gradient text, or decorative serif/display fonts.

## Color tokens

### Desktop and window chrome

- `--xp-desktop: #5a8fd8` — fallback desktop/wallpaper blue.
- `--xp-desktop-sky: #77a9e5` — light desktop gradient stop.
- `--xp-desktop-grass: #72a84a` — optional lower wallpaper accent; use only outside windows.
- `--xp-chrome: #ece9d8` — standard dialog and toolbar surface.
- `--xp-chrome-light: #f7f5e9` — inset group/card surface.
- `--xp-canvas: #ffffff` — primary task/calender content canvas.
- `--xp-inset: #f1efe2` — form field/group background.

### Active Windows XP blue

- `--xp-blue-deep: #003c74` — darkest title/frame edge.
- `--xp-blue: #0a50c2` — title-bar base.
- `--xp-blue-bright: #3d95ff` — title-bar highlight.
- `--xp-blue-soft: #8db9ed` — selected/secondary blue.
- `--xp-selection: #316ac5` — selected row/tab.
- `--xp-selection-text: #ffffff`.

### Semantic colors

- `--xp-green: #3c8d0d` — Start-button green and success.
- `--xp-green-light: #6fbf36`.
- `--xp-red: #d63c2f` — destructive/close.
- `--xp-red-dark: #9b1c13`.
- `--xp-yellow: #fff4c1` — notice surface.
- `--xp-yellow-border: #d6b656`.
- `--xp-link: #0000ee`.

### Text and borders

- `--xp-text: #111111` — primary content.
- `--xp-text-muted: #5b5b5b` — metadata.
- `--xp-text-disabled: #858585`.
- `--xp-border-dark: #7f9db9` — input and inset border.
- `--xp-edge-dark: #404040` — bevel shadow.
- `--xp-edge-mid: #808080`.
- `--xp-edge-light: #ffffff`.
- `--xp-focus: #000000` — dotted classic focus outline.

Text/background pairings must meet practical contrast. Never place normal blue text directly on saturated title-bar blue; title-bar labels are white with a subtle dark text shadow.

### Dark XP theme

Dark mode must remain unmistakably Windows XP: charcoal-blue window chrome, midnight blue title bars, crisp light/dark bevels, and pale system text. It must not revert to the previous Obsidian Forge look.

- `--xp-desktop: #071426`
- `--xp-desktop-sky: #102d52`
- `--xp-chrome: #202733`
- `--xp-chrome-light: #293342`
- `--xp-canvas: #101722`
- `--xp-inset: #151e2a`
- `--xp-blue-deep: #041b3d`
- `--xp-blue: #0b3f83`
- `--xp-blue-bright: #1768bd`
- `--xp-blue-soft: #4a7fb5`
- `--xp-selection: #245d9f`
- `--xp-text: #f1f5f9`
- `--xp-text-muted: #b3bdc9`
- `--xp-border-dark: #54708f`
- `--xp-edge-dark: #05080d`
- `--xp-edge-mid: #576474`
- `--xp-edge-light: #a9b7c7`
- Success/destructive/warning colors retain the XP semantic hues but should be slightly desaturated against dark surfaces.

The light/dark control is a compact sun/moon toolbar button with a text label or screen-reader label. Preference persists and may default to the operating-system theme.

## Typography

- UI font: `Tahoma, "MS Sans Serif", Arial, sans-serif`.
- Monospace/status font when needed: `"Lucida Console", "Courier New", monospace`.
- No remote display font in the redesigned UI.
- Default body: 13px / 1.35, weight 400.
- Mobile body: at least 14px for longer content and form values.
- Window title: 13px / 1, bold, white.
- Section/group title: 12px / 1, regular or bold, blue/dark text.
- Page/list labels: 13–14px, normal weight.
- Status text: 11–12px.
- Avoid uppercase tracking. XP typography is compact and natural, not widely letter-spaced.

## Layout and responsive behavior

### Shared shell

- The main experience is an XP desktop containing one primary application window.
- Desktop/tablet: center the application window; preferred width 760–980px and height `calc(100dvh - 48px)` with a small desktop margin. A navigation/task pane can occupy 180–220px on the left and feature content fills the right.
- Phone: the application window fills the viewport. Keep the title bar and application status bar fixed; content scrolls inside the window. Navigation remains a drawer styled exclusively as an Explorer task pane.
- Respect safe-area insets on installed PWAs.

### Window anatomy

1. Saturated blue gradient title bar, 28–34px high, with a small app icon, current screen title, and ornamental minimize/maximize/close controls. Only attach behavior to controls that already have a real action; otherwise render non-interactive ornament safely.
2. Do not render a decorative `File / Edit / View / Favorites / Tools / Help` menu row. Use only the compact toolbar containing real application actions.
3. Main cream/chrome client area with an inset white content pane.
4. Bottom status bar divided into cells, showing task counts, sync state, or current view.
5. Do not render an operating-system taskbar, green Start button, Windows logo control, fake clock, or desktop dock. Navigation remains inside the application window through the real menu/drawer button. A compact application status bar is allowed.

### Spacing scale

- 2px: bevel offsets and icon gaps.
- 4px: tight control internals.
- 6px: compact row spacing.
- 8px: default control/card gap.
- 12px: section padding.
- 16px: major group spacing.
- 24px: maximum spacious break between major regions.

Favor information density. Do not use the current 24px padding everywhere on phones; use 8–12px inside the XP window.

## Surfaces, borders, and shadows

- Application window: 1px `--xp-blue-deep` outer border; 6–8px radius only on the top corners; square or 2px bottom corners.
- Title bar: vertical blue gradient from `--xp-blue-bright` through `--xp-blue` to `--xp-blue-deep`, with a 1px inner highlight.
- Standard raised control: light top/left edges and dark bottom/right edges. A CSS equivalent is a four-color 2px bevel; avoid soft modern shadows.
- Pressed control: invert the bevel and shift content by 1px.
- Inset content/field: dark top/left and light bottom/right border, white interior.
- Group box: 1px neutral gray border with the legend interrupting the top edge on the chrome background.
- List rows: white or very subtle alternating cream. Selected row is solid `--xp-selection` with white text.
- Large modern drop shadows are forbidden. A restrained 2–4px hard-ish shadow may separate the app window from the desktop.

## Components

### Window title bar

- Left: 16px application/task icon and concise title (`Task Manager — Tasks`).
- Right: classic square caption controls, 21–24px, with visible hover/pressed states.
- Mobile may keep only a real navigation/back control and an ornamental close button, but the visual grammar stays intact.

### Navigation

- Desktop primary direction: Explorer-style task pane, not a modern icon sidebar and not a Start menu.
- Selected item uses blue highlight/white text or a pale-blue group header with strong active state.
- Each item keeps existing Lucide semantics: tasks, calendar, completed, settings, sync.
- The signed-in email and sync state appear in a compact user/status block.
- Never label the navigation trigger “Start” and never imitate the Windows taskbar.

### Buttons

- Default height 28–32px desktop, 38–44px for primary phone touch controls.
- Radius 2–4px, cream face, black label, classic bevel.
- Default button may have a darker inner keyline.
- Primary action can use the same cream button with bold text and default ring; do not turn it into a modern filled pill.
- Destructive actions use red icon/text sparingly and may use a red caption-style surface only for critical delete/close.
- Hover lightens the face; active inverts bevel and moves content 1px.
- Keyboard focus uses a visible dotted outline plus sufficient outer contrast.

### Inputs and textareas

- White background, dark inset border, 30–34px desktop height, 42px minimum on phones.
- Tahoma/system text in near-black.
- Labels sit above controls or align in two-column property rows on wide screens.
- Native date/time affordances remain usable. Do not force a dark color scheme.

### Task collection

- Preserve drag-and-drop and the photo/text task distinction.
- The task drag affordance is a narrow XP toolbar-style gripper: a 16×28px beveled vertical rail with three recessed horizontal notches and a grab cursor. It must not use a Lucide six-dot/grip icon, floating dark pill, glass overlay, or circular control. In grid view it sits flush against the tile's top-left frame; in list view it aligns inside the left edge without covering the thumbnail.
- Provide a persistent toolbar toggle between Explorer icon/grid view and details/list view. Save the user's choice locally.
- Explorer details/list view shows title, due state, reminder, repeat, and completion indicators in compact rows.
- Mobile-friendly direction: use compact file/icon tiles inside an inset white pane, not rounded cards floating on a dark canvas.
- Drag handles are visible but subdued. Dragging uses selection blue, a dotted outline, and a small hard shadow.
- Delete/erase mode must be unmistakable and reversible.

### Calendar

- Render the calendar inside a white inset pane with a classic toolbar for previous/next month and grid/schedule toggle.
- Day cells have thin gray rules; today gets a strong dark-blue focus rectangle, selected day uses XP selection blue.
- Task markers use semantic red/yellow/green sparingly; do not use glow.
- Schedule view resembles an Outlook/Explorer list with compact rows and column alignment.

### Forms, details, and settings

- Structure related options as XP property-sheet group boxes.
- Use tabs only where they genuinely organize settings; classic tabs are squared with a raised active tab.
- Task detail metadata should resemble a Properties dialog: labeled rows, separators, and a bottom action strip (`OK`, `Apply`, `Cancel` equivalents mapped to existing actions).
- Add/edit task keeps all current fields and photo preview, alarm switch, repetition days, save/cancel.

### Login

- Center a compact XP login dialog on the desktop background.
- Use a blue title bar, cream client area, app emblem, labeled email/password fields, classic default button, Google button, error notice, and a sign-up/sign-in link.
- No giant logo, large empty vertical space, or modern glowing CTA.

### Status and notifications

- Sync state uses a tiny green icon and status-bar text such as `Connected — All tasks synced`.
- Success/error messages resemble system notification bars: pale yellow/cream surface, small icon, crisp border.
- Loading/syncing uses a compact classic progress indicator or marquee in a dialog/status area, never a glowing dot.

## Consistency requirement

Every visible state must use this XP system, including authentication loading, syncing, empty states, drawer overlay, login/sign-up, tasks grid and list, erase mode, completed tasks, both calendar views, add task, view/edit task details, photo lightbox, settings, import/export feedback, and the easter-egg modal. No old dark cards, ember glows, oversized circular FABs, rounded modern inputs, or widely tracked headings may remain.

## Iconography

- Reuse the existing Lucide icons so application meaning stays intact.
- Render most icons at 14–18px with 1.5–2px stroke.
- Icons can receive restrained XP palette colors, but they must not become oversized decorations.
- Brand emblem may remain the existing `T` mark inside a small beveled blue app tile; no new photographic or raster brand asset is required.

## Motion and interaction

- Default interaction duration: 80–140ms; drawer/window motion may use 180–220ms.
- Prefer immediate state changes, pressed offsets, and small opacity changes.
- Avoid entrance cascades, elastic motion, continuous glow, and large scale transforms.
- Drawer opens like an anchored Explorer task pane rather than a floating glass sheet.
- Honor `prefers-reduced-motion` by removing nonessential transforms.

## Accessibility and usability constraints

- Preserve semantic buttons/inputs and all keyboard behavior.
- Touch targets on phones must remain at least 42px even when the visible classic control is smaller; use transparent padding if needed.
- Focus must be visible on every action.
- Do not rely on color alone for completed, alarm, repeat, selected, delete, or sync states.
- Respect safe-area insets and dynamic viewport height.
- Existing business logic, backend calls, auth behavior, notification behavior, drag sensors, data shape, and navigation callbacks are immutable during the visual redesign.

## Implementation notes

- Keep Tailwind CSS 4's CSS-first setup in `app/globals.css`; define XP tokens in `:root` and expose only needed Tailwind theme aliases.
- The root layout is the correct place for the active global CSS import. A client auth provider may stay nested inside the server root layout.
- Prefer reusable code-native components for XP window chrome, bevel button, inset panel, group box, screen header, and status bar when implementation begins.
- The unused `styles/globals.css` should not become a second source of truth.
