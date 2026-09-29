"use client"

import { Analytics } from "@vercel/analytics/next"
import { Capacitor } from "@capacitor/core"

// Vercel Analytics loads /_vercel/insights/script.js from the deployment. The
// Android app serves the bundled export from https://localhost, where that
// script does not exist, so it only runs on the web.
export function WebAnalytics() {
  if (Capacitor.isNativePlatform()) return null
  return <Analytics />
}
