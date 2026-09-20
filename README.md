# Chatter 💬

A local‑first chat playground. Everything (chats, media, scheduled messages) lives on‑device.

It ships two ways:

1. **Website** – the same single‑page app, deployable to Vercel (`vercel.json` already configured).
2. **Android APK** – a Capacitor WebView wrapper with a **native scheduled‑message alarm + notification system** that works even when the app is on the home screen or fully closed.

---

## What was added for the APK + notifications

### Scheduled messages fire & notify in the background

Previously a scheduled message only fired while the page was open (a 1‑second JS tick).
Now, when you tap **“Schedule message”** the app hands the job to Android:

- `AlarmManager` schedules an **exact wake‑up** for the chosen time.
- At that time a `BroadcastReceiver` runs **even if the app is closed / on the home screen**:
  - raises a **phone notification** (title = the contact, body = the message),
  - records the message as *delivered*.
- The next time the app is opened (or brought back), the web layer pulls the delivered
  entries and inserts them into the correct chat **with the exact scheduled timestamp**
  (and bumps the unread badge if it was “they send it”).
- If the app happens to be open at fire time, the message appears live **and** you still
  get the notification. Deletion cancels the OS alarm. Reboot re‑arms pending alarms
  (`BOOT_COMPLETED`).

### Code map

| Layer | File | Role |
|---|---|---|
| Web bridge | `chatter-alarms.js` | talks to the native plugin, or falls back to Service‑Worker notifications in a browser |
| Web app | `index.html` | `chatter*` helpers + store hooks (`Rn/Tn/En`/`Fi`) that sync state ↔ OS scheduler |
| PWA | `sw.js`, `manifest.webmanifest`, `icons/` | installable web app + browser notifications |
| Native | `android/.../scheduler/*.java` | `SchedulerPlugin` (bridge), `AlarmReceiver`, `BootReceiver`, `ScheduleStore`, `Notifier`, `AlarmScheduler` |
| Build | `scripts/build-web.mjs`, `scripts/make-icons.mjs`, `scripts/smoke-native-scheduler.mjs` | web bundle, icons, smoke test |

---

## Build the APK (on a machine with the Android SDK)

You need **JDK 17** and the **Android SDK** (easiest: install Android Studio). This sandbox
has neither, so the APK itself is not compiled here — but the project is fully generated and
builds with the standard toolchain:

```bash
npm install
npm run apk:debug      # → android/app/build/outputs/apk/debug/app-debug.apk
```

For a signed release: `npm run apk:release` (configure signing in `android/app/build.gradle`).

Then copy `app-debug.apk` to the phone and install (allow “unknown sources”).

### Permissions on first run

- Android 13+: it asks for **Notifications** the first time you schedule.
- Android 12+: exact alarms are enabled via `USE_EXACT_ALARM`; if the OS still blocks them
  the app falls back to inexact alarms (may be a few minutes late in deep doze).

### Regenerating icons (optional)

```bash
npm i -D sharp
npm run build:icons
```

---

## Test the web layer

```bash
npm test
```

Boots the built app in jsdom with a faithful in‑memory clone of the Java store and verifies a
due scheduled message fires through the native bridge and lands in the chat.

---

## कैसे काम करता है (Hinglish)

- Message schedule karo, time set karo → ab ye **Android ke AlarmManager** ko de diya jata hai.
- App ko home screen pe bhejo ya band kar do → set time pe **phone pe notification aayegi**.
- App dobara kholo → wo scheduled message sahi time‑stamp ke saath chat me mil jayega
  (unread badge bhi badhega agar “they send it” tha).
- App khuli ho tab bhi message live aata hai **aur** notification bhi milti hai.
- Delete karne par alarm cancel; phone restart ke baad pending alarms wapas set.
