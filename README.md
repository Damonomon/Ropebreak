# Ropebreak — website + Android & iOS app

One set of files makes both the Ropebreak website and the phone app.

- The **app** ships with a built-in copy of the reviews, so it works offline. Each time it opens (or comes back to the foreground) it checks the website for new reviews and saves them on the phone.
- The **website** is the `www/` folder, published for free with GitHub Pages.
- So: **write a review → publish the website → it appears in everyone's app.** No app store update needed.

```
www/                     the website and the app's screens
  content/reviews.json   ← ALL the reviews live here
  content/images/        ← review photos
  js/config.js           ← put your website address here once it's live
  js/app.js              the app logic (rendering, rankings, sharing, offline)
  css/styles.css         the Ropebreak look
  privacy.html           privacy policy (both stores require one)
android/                 the Android app project (Capacitor)
ios/                     the iOS app project (Capacitor)
assets/                  icon + splash source images
.github/workflows/       cloud builds: website + Android
codemagic.yaml           cloud build: iOS (no Mac needed)
```

---

## Adding a new review

Open `www/content/reviews.json` and add an entry to the `reviews` list. Copy an existing one as a template:

```json
{
  "slug": "the-red-lion",                 // unique, lowercase, dashes — used in links
  "category": "pub",                      // coffeeshop | coffee | pub | beer | wildcard
  "title": "The Red Lion",
  "shortTitle": "The Red Lion",           // optional: shorter name for receipt + rankings
  "date": "2026-10-10",
  "teaser": "One-line hook shown on the card.",
  "chips": ["tag one", "tag two"],
  "radar": [8, 7, 9, 6],                  // the 4 radar scores, in the category's axis order
  "overall": 8,                           // 0–10, or "00" for a special kind of disaster
  "verdict": "The line under the big score.",
  "characteristics": ["Cosy"],            // from the category's filter list
  "map": "The Red Lion, Leeds",           // optional: what "View on map" searches for
  "photo": { "src": "images/the-red-lion.jpg", "alt": "Describe the photo" },  // optional
  "body": [
    { "p": "A paragraph." },
    { "quote": "\"A pull quote.\"" },
    { "list": ["A", "bulleted", "list"] }
  ],
  "receipt": [["Pints ordered", "2"], ["Regret", "none"]]
}
```

(The `//` notes above are just explanations — JSON files can't contain them.)

Then change `"updated"` at the top of the file to today's date. Photos go in `www/content/images/` (keep them under ~300 KB; 900×900 JPGs work well). Rankings update themselves.

**Radar axes by category** — scores go in this order:

| Category | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| coffeeshop | Atmosphere | Human interaction | Would go back? | Value for money |
| coffee | Taste | Caffeine hit | Value for money | Would order again? |
| pub | Pint quality | Atmosphere | Would bring a mate? | Toilet cleanliness |
| beer | Taste | Drinkability | Value for money | Would order again? |
| wildcard | Would recommend? | Felt illicit? | Mental health boost? | Felt attractive? |

Commit the change to GitHub and the website workflow republishes the site within a minute or two.

---

## Step 1 — Get it on GitHub and put the website live (free)

1. Create a free account at github.com and a new repository called `ropebreak`.
2. Upload this whole folder to it (GitHub Desktop is the easiest way).
3. In the repository: **Settings → Pages → Source: GitHub Actions**.
4. **Actions → Publish website → Run workflow.** Your site will be at `https://<your-username>.github.io/ropebreak/`.
5. Put that address in `www/js/config.js`:
   ```js
   siteUrl: "https://<your-username>.github.io/ropebreak/",
   ```
   and commit. From now on the app checks that address for new reviews, and "Share review" includes a link to it.

Want your own domain (e.g. ropebreak.co.uk)? Add it under Settings → Pages, then use it as `siteUrl`.

## Step 2 — Android

**Try it on your own phone (free):**
GitHub → **Actions → Build Android app → Run workflow**. When it finishes, download `ropebreak-test-apk` from the run page, unzip it, copy `app-debug.apk` to an Android phone and open it (allow "install unknown apps" when asked).

**Publish on Google Play:**
1. Sign up at play.google.com/console ($25 one-off).
2. Create your signing key once, on any computer with Java installed — **back this file and the passwords up; you can never update the app without them**:
   ```
   keytool -genkey -v -keystore ropebreak-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias ropebreak
   ```
3. In GitHub → Settings → Secrets and variables → Actions, add:
   - `ANDROID_KEYSTORE_BASE64` — the .jks file as base64 (`base64 -w0 ropebreak-release.jks` on Linux, `base64 -i ropebreak-release.jks` on Mac)
   - `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`ropebreak`), `ANDROID_KEY_PASSWORD`
4. Run **Build Android app** again — it now also produces `ropebreak-play-store-bundle` (an `.aab` file). Upload that in Play Console.
5. Fill in the store listing (screenshots, description, the privacy policy link `https://<your-site>/privacy.html`, content rating, "no data collected").
6. New personal Play accounts must run a **closed test with at least 12 testers for 14 days** before going public — friends and family count.

For each later release, bump `versionCode` (by 1) and `versionName` in `android/app/build.gradle`.

## Step 3 — iOS (no Mac needed)

1. Join the Apple Developer Program at developer.apple.com ($99/year; approval can take a day or two).
2. In App Store Connect (appstoreconnect.apple.com) create a new app with bundle ID **`com.ropebreak.reviews`**. Note its numeric **Apple ID** (App Information page) and put it in `codemagic.yaml` as `APP_STORE_APPLE_ID`.
3. In App Store Connect → Users and Access → Integrations, create an **API key** (App Manager role) and download it.
4. Sign up at codemagic.io (free tier includes Mac build minutes), connect your GitHub repo, and under Team settings → Integrations → App Store Connect add the API key, naming it **`Ropebreak ASC key`**. Turn on automatic code signing for `com.ropebreak.reviews`.
5. Start the **Ropebreak iOS** workflow (or push a tag like `v1.0.0`). The build goes to **TestFlight** — install the TestFlight app on your iPhone to try it.
6. When happy, submit it for review in App Store Connect (screenshots, description, privacy link, "Data Not Collected").

A heads-up on Apple's review: Apple sometimes rejects apps that are "just a website". This app has offline reading, the native share sheet and its own content updates, which usually satisfies them, but if they push back, adding something like favourites or a "reviews near me" map is the typical fix.

---

## Working on it locally (optional)

Needs Node.js 22+.

```
npm install
npm run serve        # preview the site at http://localhost:8080
npm run android      # open in Android Studio (needs Android Studio installed)
npm run ios          # open in Xcode (Mac only)
npm run assets       # regenerate icons/splash after changing assets/*.png
```

After changing anything in `www/`, run `npx cap sync` before building the apps.

To change the app's name or ID, edit `capacitor.config.json` (and the bundle ID in `codemagic.yaml`), then run `npx cap sync`. The ID can't change once the app is in a store.
