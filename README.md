# Chatter 💬

A WhatsApp-style chat experience that lives entirely on your device —
contacts, conversations, GIFs, emoji, themes, backups and smart
"upcoming replies" included. No account, no server.

## 📱 Android app (recommended)

Install **Chatter** on your phone — it's the full app, wrapped native:

👉 [`dist/chatter-release.apk`](dist/chatter-release.apk) — download, open,
allow unknown apps, done. Android 7.0+.

See [ANDROID.md](ANDROID.md) for how the app is built, updated and signed.

## 🌐 Web version

Open `index.html` in any browser (or deploy this folder to Vercel/Netlify —
`vercel.json` is included). All state persists in `localStorage`.

## Repository layout

| Path | What it is |
|---|---|
| `index.html` | The entire web app (single file) |
| `contacts.json` | Characters, auto-synced into the app on startup |
| `upcoming_replies.txt` | Trigger → auto-reply rules, auto-loaded on startup |
| `chatter-backup.ctrjs` | Exported backup (import it from Settings → Backup) |
| `avatars/` | Contact avatars |
| `Favicon/` | App logo source |
| `android/` | Native Android WebView project (Gradle, zero dependencies) |
| `tools/` | Asset/icon/API verification scripts |
| `.github/workflows/` | CI: rebuilds + commits the APKs on every push |
| `dist/` | Installable APKs + build status |

## Data files

- **Import**: Settings → Backup (`.ctrjs`), Characters (`.json`), Upcoming
  replies (`.txt`) — or just edit `contacts.json` /
  `upcoming_replies.txt`; they auto-sync on next launch.
- **Export**: same screens; on Android, exports land in Downloads.
