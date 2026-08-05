# Extractable Components

## Layout Components

## SlidingDrawer

- Source: `components/sliding-drawer.tsx`
- Category: layout
- Description: Shared left-side app navigation with product title, signed-in user sync state, primary screen links, and settings link.
- Extractable props: `isOpen` (boolean, default: false), `currentScreen` (string, default: "tasks")
- Hardcoded: Task Manager product title, version/byline, navigation labels, Lucide icon choices, dimensions, transitions, and all styling.

## RootLayout

- Source: `app/layout.tsx`
- Category: layout
- Description: Next.js document shell that loads fonts, global styles, auth context, analytics, PWA metadata, and the service worker.
- Extractable props: none beyond the standard `children` slot.
- Hardcoded: Metadata, PWA head tags, font families, body classes, providers, and analytics.

## Basic Components

## Button

- Source: `components/ui/button.tsx`
- Category: basic
- Description: shadcn-style polymorphic button with semantic variants and sizes.
- Extractable props: `variant` (string, default: "default"), `size` (string, default: "default"), `disabled` (boolean, default: false)
- Hardcoded: Variant class definitions, icon sizing, focus behavior, and disabled behavior.

## Input

- Source: `components/ui/input.tsx`
- Category: basic
- Description: Shared text-like input primitive.
- Extractable props: `type` (string, default: "text"), `disabled` (boolean, default: false)
- Hardcoded: Sizing, border, focus ring, placeholder, file-input, and invalid-state classes.

## Card

- Source: `components/ui/card.tsx`
- Category: basic
- Description: Card family with header, title, description, content, action, and footer regions.
- Extractable props: none; content belongs in slots.
- Hardcoded: Layout grid, padding, border, radius, shadow, and semantic data slots.

## Checkbox

- Source: `components/ui/checkbox.tsx`
- Category: basic
- Description: Radix checkbox with checked, focus, invalid, and disabled states.
- Extractable props: `checked` (boolean, default: false), `disabled` (boolean, default: false)
- Hardcoded: Check icon, dimensions, focus ring, and state classes.

## Switch

- Source: `components/ui/switch.tsx`
- Category: basic
- Description: Radix switch with animated thumb and checked/unchecked styling.
- Extractable props: `checked` (boolean, default: false), `disabled` (boolean, default: false)
- Hardcoded: Dimensions, thumb geometry, transitions, and focus treatment.

## Screen-level reusable patterns

The page-specific files repeatedly implement their own header, framed content panel, inputs, toggle controls, and floating actions. They are strong future refactor candidates but are not currently shared components, so they should not be extracted as existing DraftComponents during reproduction.
