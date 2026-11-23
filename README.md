# Zyn Tracker

A phone-first tracker for tapering Zyn use. It installs to your iPhone home screen, works offline, and keeps all data on the device.

## Run it locally

```bash
npm install
npm run dev      # http://localhost:5173 (also reachable from your phone on the same Wi-Fi)
npm test         # spacing/day-rollover logic tests
npm run build    # production build in dist/
```

## Put it on your iPhone (GitHub Pages)

Same steps as Groundwork, with a new repo called `zyn-tracker`.

1. **Turn the folder into a repository.** In GitHub Desktop: **File → Add local repository…**, choose the `zyn-tracker` folder, click the **create a repository** link. Leave the name as `zyn-tracker`, set Git ignore and License to **None**, then **Create repository**.
2. **Publish it.** Click **Publish repository**, **untick "Keep this code private"** (Pages needs a public repo on a free account; only the code is public, your usage data never leaves your phone), then **Publish repository**.
3. **Turn on Pages.** On github.com, open the `zyn-tracker` repo → **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. **Re-run the first deploy.** The first run fires before Pages is switched on, so it usually fails. **Actions** tab → open **Deploy to GitHub Pages** → **Re-run jobs → Re-run all jobs**. Wait for the green ✓.
5. **Install it.** Open `https://<your-username>.github.io/zyn-tracker/` in **Safari** on your iPhone → **Share → Add to Home Screen → Add**.

Always open it from the home-screen icon, not a Safari tab. iOS keeps the home-screen app's data separate and is much less likely to clear it.

## Updating it later

Replace the files in the folder, then in GitHub Desktop write a short summary, **Commit to main**, **Push origin**. GitHub rebuilds automatically. On your phone, close the app fully and reopen it; sometimes it takes two launches to pick up the new version.

## Backups

Settings → **Export backup** saves a `.json` file (choose **Save to Files** in the share sheet). **Restore** loads one back and replaces what's in the app. Do this every week or two; there's no sync, so a new phone starts empty without one.

## Notes

- **Your day resets at 5am**, not midnight. A Zyn at 1am counts toward the night before, so a cutoff like 01:00 works properly.
- **Timers pause while the app is closed.** That's an iOS rule, not a bug. Everything is computed from timestamps, so when you reopen it the countdown and any in-progress session jump to the correct time.
- **No notifications.** The app won't ping you when the countdown ends. That needs a push server, which is a bigger project.
- **Data from the Claude artifact version doesn't carry over.** That lived in Claude's storage; this lives on your phone.

## Libraries

React (MIT), lucide-react (ISC), Tailwind CSS (MIT), Vite (MIT), vite-plugin-pwa (MIT), Vitest (MIT).
