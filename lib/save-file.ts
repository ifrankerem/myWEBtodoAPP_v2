// Hands a generated text file (backup JSON, .ics calendar) to the user.
//
// Browsers download it through an <a download> link. The Android WebView
// ignores that attribute, so the native app writes the file to the cache
// directory and opens the system share sheet instead — from there it can be
// saved to Files, sent to Drive, or opened directly in a calendar app.

import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export async function saveTextFile(filename: string, content: string, mimeType: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    try {
      await Share.share({ title: filename, files: [uri] })
    } catch (error) {
      // Dismissing the share sheet rejects; that is not a failed export.
      if (error instanceof Error && /cancel/i.test(error.message)) return
      throw error
    }
    return
  }

  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
