// Color schemes. Stored names stay "light" and "dark" so preferences saved
// before the redesign carry over; they map to the Luna blue and Noir schemes.
export const THEME_VALUES = { light: 'blue', dark: 'noir', olive: 'olive', silver: 'silver' }

export const SCHEMES = [
  { theme: 'system', label: 'Match system (blue or noir)' },
  { theme: 'light', label: 'Default (blue)' },
  { theme: 'olive', label: 'Olive Green' },
  { theme: 'silver', label: 'Silver' },
  { theme: 'dark', label: 'Noir (dark)' },
] as const
