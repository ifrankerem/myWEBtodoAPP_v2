// Luna-style icons drawn for this app. Gradients are shared through
// <XpIconDefs />, which the root layout renders once.

const DOC = `<path d="M7 3h12l6 6v20H7z" fill="url(#xpgPage)" stroke="#6b7f9e"/><path d="M19 3v6h6" fill="#dfe7f3" stroke="#6b7f9e" stroke-linejoin="round"/><path d="M10.5 14h11M10.5 18h11M10.5 22h8" stroke="#5b86c9" stroke-width="1.6"/>`
const FOLDER = `<path d="M3 8.5h9.5l2.5 2.5h14v16.5H3z" fill="url(#xpgFolderBack)" stroke="#b7861a"/><path d="M3 13.5h26v14H3z" fill="url(#xpgFolder)" stroke="#b7861a"/>`
const CHECK = `<circle cx="16" cy="16" r="13" fill="url(#xpgGreen)" stroke="#2a7a14"/><path d="M9.5 16.5l4.5 4.5 8.5-9.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`
const calendar = (day: number) =>
  `<rect x="4" y="6" width="24" height="22" rx="2" fill="#fff" stroke="#5f7394"/><path d="M4 8a2 2 0 0 1 2-2h20a2 2 0 0 1 2 2v5H4z" fill="url(#xpgRed)"/><rect x="9" y="3" width="2.6" height="6" rx="1.2" fill="#6d7a90"/><rect x="20.4" y="3" width="2.6" height="6" rx="1.2" fill="#6d7a90"/><text x="16" y="25" text-anchor="middle" font-family="Tahoma,Verdana,sans-serif" font-weight="700" font-size="11" fill="#1d3f8a">${day}</text>`
const SUNFLOWER_PETALS = [0, 40, 80, 120, 160, 200, 240, 280, 320]
  .map((angle) => `<ellipse cx="16" cy="8.5" rx="2.6" ry="4.6" fill="#ffc726" stroke="#d99000" stroke-width=".6" transform="rotate(${angle} 16 14)"/>`)
  .join('')

const ICONS = {
  logo: `<rect x="6" y="5" width="20" height="24" rx="2.5" fill="url(#xpgBlue)" stroke="#123f95"/><rect x="9" y="9" width="14" height="17" rx="1" fill="#fff"/><rect x="11" y="3" width="10" height="5" rx="1.5" fill="url(#xpgSilver)" stroke="#50607a"/><path d="M11.5 17.5l3 3 6-7" fill="none" stroke="#2f9d1c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  doc: DOC,
  folder: FOLDER,
  folderTasks: `<path d="M3 8.5h9.5l2.5 2.5h14v16.5H3z" fill="url(#xpgFolderBack)" stroke="#b7861a"/><path d="M9 6h13l3 3v10H9z" fill="#fff" stroke="#6b7f9e"/><path d="M12 11h9M12 14h9" stroke="#5b86c9" stroke-width="1.4"/><path d="M3 15h26v12.5H3z" fill="url(#xpgFolder)" stroke="#b7861a"/>`,
  folderDone: `${FOLDER}<g transform="translate(14 13) scale(.55)">${CHECK}</g>`,
  check: CHECK,
  bell: `<path d="M16 4.5c-4.6 0-7.5 3.4-7.5 8.2v5.6L5.5 22.5h21l-3-4.2v-5.6c0-4.8-2.9-8.2-7.5-8.2z" fill="url(#xpgGold)" stroke="#9a6a0a"/><rect x="13.5" y="2.5" width="5" height="3" rx="1.5" fill="#c9941e"/><circle cx="16" cy="25.5" r="3" fill="#b27a0e"/>`,
  clock: `<circle cx="16" cy="16" r="12" fill="#fff" stroke="#1d5bd0" stroke-width="3.5"/><path d="M16 9v7l5 3" fill="none" stroke="#1d3f8a" stroke-width="2.6" stroke-linecap="round"/>`,
  sync: `<path d="M24.8 12.5A9.3 9.3 0 0 0 8 10" fill="none" stroke="#2f9d1c" stroke-width="3.6" stroke-linecap="round"/><path d="M4 6.5l2.2 8.3 7.3-3.9z" fill="#2f9d1c"/><path d="M7.2 19.5A9.3 9.3 0 0 0 24 22" fill="none" stroke="#1c5fd4" stroke-width="3.6" stroke-linecap="round"/><path d="M28 25.5l-2.2-8.3-7.3 3.9z" fill="#1c5fd4"/>`,
  gear: `<circle cx="16" cy="16" r="10.6" fill="none" stroke="#6f8199" stroke-width="5" stroke-dasharray="4.2 4.1"/><circle cx="16" cy="16" r="9" fill="url(#xpgSilver)" stroke="#51627c"/><circle cx="16" cy="16" r="3.6" fill="#fff" stroke="#51627c"/>`,
  recycle: `<path d="M8 10h16l-2 18H10z" fill="url(#xpgGray)" stroke="#5f6b7a"/><rect x="6" y="6.5" width="20" height="4" rx="1.2" fill="#dde2ea" stroke="#5f6b7a"/><path d="M12.5 14v10M16 14v10M19.5 14v10" stroke="#6d7889" stroke-width="1.4"/><path d="M13 6.5V5h6v1.5" fill="none" stroke="#5f6b7a"/>`,
  search: `<circle cx="13" cy="13" r="8" fill="#e5f2ff" stroke="#4a6fa5" stroke-width="2.6"/><path d="M19 19l8 8" stroke="#8a5a2b" stroke-width="4.2" stroke-linecap="round"/>`,
  back: `<circle cx="16" cy="16" r="13" fill="url(#xpgGreen)" stroke="#2a7a14"/><path d="M18.5 9.5L12 16l6.5 6.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  views: `<rect x="4" y="4" width="10.5" height="10.5" rx="1" fill="url(#xpgBlue)" stroke="#1d4f9e"/><rect x="17.5" y="4" width="10.5" height="10.5" rx="1" fill="url(#xpgBlue)" stroke="#1d4f9e"/><rect x="4" y="17.5" width="10.5" height="10.5" rx="1" fill="url(#xpgBlue)" stroke="#1d4f9e"/><rect x="17.5" y="17.5" width="10.5" height="10.5" rx="1" fill="url(#xpgBlue)" stroke="#1d4f9e"/>`,
  newTask: `${DOC}<circle cx="23" cy="23" r="7" fill="url(#xpgGreen)" stroke="#2a7a14"/><path d="M23 19.3v7.4M19.3 23h7.4" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`,
  del: `<path d="M8.5 8.5l15 15M23.5 8.5l-15 15" stroke="#9b1c13" stroke-width="7" stroke-linecap="round"/><path d="M8.5 8.5l15 15M23.5 8.5l-15 15" stroke="url(#xpgRed)" stroke-width="5" stroke-linecap="round"/>`,
  restore: `<path d="M10 12.5a8 8 0 1 1 1.5 10" fill="none" stroke="#1c5fd4" stroke-width="3.6" stroke-linecap="round"/><path d="M4.5 7.5l2.4 9.2 8-4.6z" fill="#1c5fd4"/>`,
  go: `<rect x="3" y="3" width="26" height="26" rx="4" fill="url(#xpgGreen)" stroke="#2a7a14"/><path d="M9 16h13M17 10l6 6-6 6" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  floppy: `<path d="M5 5h19l3 3v19H5z" fill="url(#xpgBlue)" stroke="#123f95"/><rect x="10" y="5" width="12" height="8" fill="#d9dee6" stroke="#60708a"/><rect x="18" y="6.5" width="2.5" height="5" fill="#40506a"/><rect x="8.5" y="17" width="15" height="10" fill="#fff" stroke="#8a9ab5"/><path d="M11 20.5h10M11 23.5h10" stroke="#c43"/>`,
  openFolder: `<path d="M3 8.5h9.5l2.5 2.5h12v5H3z" fill="url(#xpgFolderBack)" stroke="#b7861a"/><path d="M3 27.5L7 15h24l-4 12.5z" fill="url(#xpgFolder)" stroke="#b7861a"/>`,
  monitor: `<rect x="3" y="4" width="26" height="18" rx="2" fill="#dcdcdc" stroke="#6b6b6b"/><rect x="5.5" y="6.5" width="21" height="13" fill="url(#xpgSky)"/><path d="M5.5 19.5c5-5 10-6 21-3v3z" fill="#4b9a2b"/><path d="M12 22h8l1 4H11z" fill="#bdbdbd" stroke="#6b6b6b"/><rect x="8" y="26" width="16" height="3" rx="1" fill="#cfcfcf" stroke="#6b6b6b"/>`,
  info: `<circle cx="16" cy="16" r="13" fill="url(#xpgBlue)" stroke="#123f95"/><circle cx="16" cy="9.5" r="2.3" fill="#fff"/><rect x="14" y="13.5" width="4" height="11" rx="1.5" fill="#fff"/>`,
  warning: `<path d="M16 3.5L29 27H3z" fill="url(#xpgGold)" stroke="#9a6a0a" stroke-linejoin="round"/><rect x="14.4" y="11" width="3.2" height="9" rx="1.4" fill="#3a2a00"/><circle cx="16" cy="23.3" r="1.9" fill="#3a2a00"/>`,
  user: `<rect x="0" y="0" width="32" height="32" fill="url(#xpgSky)"/><path d="M16 21c1 4 0 8 0 11" stroke="#3e8e2a" stroke-width="2.2" fill="none"/><path d="M16 27c-3-3-7-2-8 0 3 1 6 1 8 0z" fill="#4aa332"/>${SUNFLOWER_PETALS}<circle cx="16" cy="14" r="4.4" fill="#6b3d12"/><circle cx="15" cy="13" r="1.4" fill="#8c5a24"/>`,
  logoff: `<rect x="3" y="3" width="26" height="26" rx="5" fill="url(#xpgOrange)" stroke="#b25a0a"/><path d="M13 9.5H9.5v13H13M14.5 16h10M20.5 12l4 4-4 4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  switchUser: `<rect x="3" y="3" width="26" height="26" rx="5" fill="url(#xpgGreen)" stroke="#2a7a14"/><circle cx="12" cy="12.5" r="3.4" fill="#fff"/><path d="M6.5 23c.6-4 3-6 5.5-6s4.9 2 5.5 6z" fill="#fff"/><circle cx="21" cy="11" r="2.8" fill="#dff7d0"/><path d="M17.8 17.8c1-1.7 2-2.3 3.2-2.3 2.2 0 4.3 1.6 4.8 5.5h-5.3" fill="#dff7d0"/>`,
  google: `<rect x="2" y="2" width="28" height="28" rx="4" fill="#fff" stroke="#b9c3d6"/><text x="16" y="22.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="18" fill="#4285f4">G</text>`,
  mail: `<rect x="0" y="0" width="32" height="32" fill="url(#xpgSky)"/><rect x="5" y="9" width="22" height="15" rx="1.5" fill="url(#xpgPage)" stroke="#6b7f9e"/><path d="M5.5 10l10.5 8 10.5-8" fill="none" stroke="#6b7f9e" stroke-width="1.6"/>`,
  photo: `<rect x="3" y="6" width="26" height="20" rx="1.5" fill="url(#xpgSky)" stroke="#5f7394"/><circle cx="23" cy="12" r="2.5" fill="#ffe36b"/><path d="M3.5 25.5l8-9 5 5 4-3 8 7z" fill="#3f8f2a"/>`,
  help: `<circle cx="16" cy="16" r="13" fill="url(#xpgBlue)" stroke="#123f95"/><path d="M12.2 12.5a3.9 3.9 0 1 1 5.6 3.5c-1.2.6-1.8 1.4-1.8 2.8v.8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="24" r="1.9" fill="#fff"/>`,
} as const

export type XpIconName = keyof typeof ICONS | 'calendar' | 'ics'

function markup(name: XpIconName): string {
  const day = new Date().getDate()
  if (name === 'calendar') return calendar(day)
  if (name === 'ics') {
    return `${calendar(day)}<circle cx="24" cy="24" r="7" fill="url(#xpgGreen)" stroke="#2a7a14"/><path d="M24 20v7M21 24.2l3 3 3-3" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
  }
  return ICONS[name]
}

export function XpIcon({ name, size = 32, className }: { name: XpIconName; size?: number; className?: string }) {
  return (
    <svg
      className={`xp-ic${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: markup(name) }}
    />
  )
}

const STOPS: Array<[string, string, string, 'v' | 'd' | 'h']> = [
  ['xpgBlue', '#8cc2ff', '#1c5fd4', 'v'],
  ['xpgGreen', '#a3e782', '#2f9d1c', 'v'],
  ['xpgRed', '#ff8f70', '#cf2f1e', 'v'],
  ['xpgGold', '#fff29e', '#e0a21c', 'v'],
  ['xpgOrange', '#ffc774', '#e0721a', 'v'],
  ['xpgSilver', '#ffffff', '#a3adbf', 'v'],
  ['xpgPage', '#ffffff', '#dfe7f3', 'd'],
  ['xpgFolder', '#ffeb94', '#f0bd2c', 'v'],
  ['xpgFolderBack', '#f6d15e', '#d59f27', 'v'],
  ['xpgSky', '#a6d3ff', '#3b86e6', 'v'],
]

/** Shared gradients. Must not be display:none, or browsers drop the fills. */
export function XpIconDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {STOPS.map(([id, from, to, direction]) => (
          <linearGradient key={id} id={id} x1="0" y1="0" x2={direction === 'v' ? '0' : '1'} y2={direction === 'h' ? '0' : '1'}>
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        ))}
        <linearGradient id="xpgGray" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9aa3ad" />
          <stop offset=".45" stopColor="#eef0f2" />
          <stop offset="1" stopColor="#8a939e" />
        </linearGradient>
      </defs>
    </svg>
  )
}
