# 📋 Task Manager PWA

A **dark, minimalist task manager** built as a Progressive Web App (PWA) with offline-first capabilities. Features a sleek dark UI, drag-and-drop task organization, smart alarms with repeating schedules, photo attachments, calendar integration, and full offline support.

![Task Manager](public/icons/icon-512.png)

---

## ✨ Features

### Core Functionality
- **Create & Manage Tasks** – Add tasks with titles, detailed descriptions, and photo attachments
- **Photo Attachments** – Attach images to tasks, stored locally as Base64
- **Complete & Archive** – Mark tasks complete with visual distinction between active and completed views
- **Drag & Drop Reordering** – Reorganize tasks with intuitive drag-and-drop powered by `@dnd-kit`

### Alarm System
- **Smart Alarms** – Set alarm times for task reminders (24-hour format)
- **Repeating Schedules** – Configure weekly repeating alarms (e.g., Mon, Wed, Fri)
- **Native Notifications** – Full push notification support on Android/iOS via Capacitor
- **Web Notifications** – Browser notification fallback for PWA users
- **Calendar Export** – Export alarms to `.ics` files for native calendar app integration

### Views & Navigation
- **Tasks Grid** – Main view displaying all active tasks
- **Completed Tasks** – Separate view for archived/completed tasks
- **Calendar View** – Visual calendar showing tasks by due date
- **Settings** – Data management, export/import, and notification preferences
- **Sliding Drawer** – Smooth navigation drawer for screen switching

### Offline-First Architecture
- **IndexedDB Storage** – All data persisted locally using Dexie.js
- **Service Worker** – Full offline capability with custom service worker
- **Automatic Migration** – Legacy localStorage data automatically migrates to IndexedDB
- **Data Export/Import** – Backup and restore all tasks as JSON

### PWA Features
- **Installable** – Add to home screen on mobile and desktop
- **Standalone Mode** – Full-screen app experience without browser UI
- **Offline Ready** – Works completely offline after initial load
- **Android Hardware Back Button** – Native back navigation support

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript |
| **UI Library** | React 19 |
| **Styling** | Tailwind CSS v4 |
| **UI Components** | Radix UI Primitives |
| **Drag & Drop** | @dnd-kit |
| **Storage** | IndexedDB via Dexie.js |
| **Notifications** | Capacitor Local Notifications |
| **Date Handling** | date-fns |
| **Toasts** | Sonner |
| **Charts** | Recharts |
| **Form Handling** | React Hook Form + Zod |
| **Theming** | next-themes |

---

## 📁 Project Structure

```
WEBTODOAPP/
├── app/
│   ├── page.tsx          # Main app component with state management
│   ├── layout.tsx        # Root layout with metadata & PWA config
│   └── globals.css       # Global styles & Tailwind imports
│
├── components/
│   ├── add-task-screen.tsx       # New task creation form
│   ├── calendar-screen.tsx       # Calendar view component
│   ├── settings-screen.tsx       # Settings & data management
│   ├── sliding-drawer.tsx        # Navigation drawer
│   ├── task-detail-screen.tsx    # Individual task view/edit
│   ├── tasks-grid-screen.tsx     # Main task grid display
│   ├── theme-provider.tsx        # Dark/light theme wrapper
│   └── ui/                       # Shadcn/ui component library
│
├── lib/
│   ├── calendar-export.ts    # ICS calendar file generation
│   ├── notifications.ts      # Capacitor native notifications
│   ├── storage-idb.ts        # IndexedDB storage layer (Dexie)
│   ├── storage.ts            # Legacy storage utilities
│   ├── utils.ts              # Utility functions (cn helper)
│   └── web-notifications.ts  # Browser notification fallback
│
├── hooks/
│   └── use-mobile.tsx        # Mobile detection hook
│
├── public/
│   ├── sw.js                 # Service worker for offline
│   ├── manifest.json         # PWA manifest
│   ├── icons/                # App icons (192x192, 512x512)
│   └── images/               # Static assets
│
└── styles/
    └── globals.css           # Additional global styles
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18.17 or later
- **npm** or **pnpm**

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/task-manager.git
   cd task-manager
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run development server**
   ```bash
   npm run dev
   ```

4. **Open in browser**
   ```
   http://localhost:3000
   ```

### Build for Production

```bash
npm run build
npm start
```

---

## 📱 Native App Build (Optional)

This project uses **Capacitor** for native Android/iOS builds.

### Android Build

1. Initialize Capacitor (first time only):
   ```bash
   npx cap init
   npx cap add android
   ```

2. Build and sync:
   ```bash
   npm run build
   npx cap sync android
   ```

3. Open in Android Studio:
   ```bash
   npx cap open android
   ```

### iOS Build (macOS required)

1. Add iOS platform:
   ```bash
   npx cap add ios
   ```

2. Build and sync:
   ```bash
   npm run build
   npx cap sync ios
   ```

3. Open in Xcode:
   ```bash
   npx cap open ios
   ```

---

## 🎨 Design Philosophy

### Dark Minimalist UI
- Background: `#0B0B0B` (near-black)
- Accent: Subtle green highlights for completed states
- Typography: Clean, readable sans-serif fonts
- Motion: Smooth 200ms transitions throughout

### Offline-First
All data is stored locally in IndexedDB. No server required, no data leaves your device.

### Mobile-Native Feel
- Hardware back button support
- Swipe gestures via drawer navigation
- Touch-optimized tap targets
- Haptic-ready notification system

---

## 📦 Data Management

### Export Data
Settings → Export Data → Downloads a `.json` file with all tasks

### Import Data
Settings → Import Data → Select a previously exported `.json` file

### Calendar Export
Settings → Export to Calendar → Downloads `.ics` file with all alarms

---

## 🔔 Notification System

| Platform | Notification Type |
|----------|------------------|
| **Android Native** | Capacitor Local Notifications with custom alarm channel |
| **iOS Native** | Capacitor Local Notifications |
| **Web PWA** | Browser Notification API with foreground reminders |
| **iOS PWA Fallback** | Calendar export for native iOS Calendar alarms |

---

## 🔒 Privacy

- **100% Local Storage** – All data stays on your device
- **No Analytics** – No tracking or data collection
- **No Server** – Works entirely offline
- **Export Anytime** – Full data portability via JSON export

---

## 📝 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  <strong>Task Manager PWA</strong> — Stay organized, stay focused.
</p>
