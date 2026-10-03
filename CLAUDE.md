# Ropebreak — notes for Claude

Ropebreak is a personal review blog (coffee, coffee shops, pubs, beer, wildcards). This repo is the **master copy** and builds both the website (GitHub Pages) and the Android/iOS app (Capacitor). Human-facing setup steps are in `README.md`.

## Owner's ground rules
- **Never purchase, subscribe to or sign up for anything**, and never trigger anything that could cost money. Ask before publishing anything new (store submissions, new services, new hosting).
- Ideas and design work happen in the owner's claude.ai Project ("Reviews"). Sessions on this repo are for technical work only: applying those changes, fixing, building.
- Owner works mostly from a phone; give click-by-click GitHub instructions, not CLI.

## How it fits together
- `www/` is the whole site and the app's screens. Plain HTML/CSS/JS, no bundler.
  - `content/reviews.json` holds **all reviews** (schema and radar-axis order in README). Bump its top-level `"updated"` date on every content change. The app compares this date to decide whether its cached copy is newer than the built-in one.
  - `content/images/` holds review photos as separate files. Never inline base64.
  - `js/app.js` renders everything from the JSON: grid, filters, review pages, rankings (derived automatically), sharing, offline cache, Android back button.
  - `js/config.js`: `siteUrl` is `https://damonomon.github.io/Ropebreak/` (case-sensitive). The app fetches `siteUrl + content/reviews.json` on launch and resume.
- `android/`, `ios/`: Capacitor 8 native projects (iOS uses SPM). App ID `com.ropebreak.reviews`; it can't change once in a store.
- `.github/workflows/website.yml` deploys `www/` to Pages on every push to `main` that touches `www/`.
- `.github/workflows/android.yml` is manual (or runs on a `v*` tag). It builds a debug APK, plus a signed AAB if the keystore secrets exist.
- `codemagic.yaml` is the iOS cloud build. Not set up yet (needs a paid Apple account, which the owner decides on).

## Porting changes from the Project artifact
The owner will paste a claude.ai artifact link. It's a **single self-contained HTML file** in the original structure: hand-written review sections, an inline `REVIEWS`/`RANKINGS` script, base64 photos. **Never paste it over `www/index.html`.** Instead:
1. Read the artifact and diff it against the repo.
2. New or edited reviews: update `content/reviews.json`, and extract any base64 images into `content/images/<slug>.jpg`.
3. Design, CSS and copy changes: port them into `www/index.html`, `www/css/styles.css` or the render functions in `www/js/app.js`.
4. New features: implement them in `app.js`, keeping them data-driven.
5. Tell the owner which changes need a new app build: anything outside `content/` does. Content alone reaches installed apps automatically.

## Before pushing
- Validate the JSON (`node -e "require('./www/content/reviews.json')"`).
- Preview: `python3 -m http.server -d www 8765`, then check it with Playwright on a phone viewport in light and dark mode (Chromium is at `/opt/pw-browsers`).
- After changing `www/`, run `npx cap sync` so the native projects pick it up.
- The Android SDK host (`dl.google.com`) may be blocked in cloud sessions. Build APKs through the GitHub Actions workflow instead.
- For a store release, bump `versionCode`/`versionName` in `android/app/build.gradle`.
