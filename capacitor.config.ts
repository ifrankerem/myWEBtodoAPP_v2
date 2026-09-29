import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.ifrankerem.taskmanager',
  appName: 'Task Manager',
  // Next.js static export output (`output: 'export'` in next.config.mjs).
  webDir: 'out',
  // Debug builds otherwise echo every plugin result to logcat, including the
  // Google ID token returned by signInWithGoogle.
  loggingBehavior: 'none',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      // Injects --safe-area-inset-* variables that globals.css pads against.
      insetsHandling: 'css',
      // Light status bar icons over the XP blue desktop background.
      style: 'DARK',
    },
    SplashScreen: {
      backgroundColor: '#3A6EA5',
      showSpinner: false,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_task',
      iconColor: '#245EDB',
    },
    FirebaseAuthentication: {
      // The Firebase JS SDK owns the session; the native layer only produces
      // the Google credential that is handed to signInWithCredential.
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
}

export default config
