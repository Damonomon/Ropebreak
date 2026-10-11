// Takes phone-sized screenshots of the live site (light and dark) so changes
// can be checked visually from sessions that can't load map images.
// Usage: node scripts/screenshot.mjs <out-dir> <hash>...   e.g. map reviews
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const SITE = "https://damonomon.github.io/Ropebreak/";
const [out = "shots", ...hashes] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], colorScheme: scheme });
  const page = await ctx.newPage();
  for (const hash of hashes.length ? hashes : ["reviews", "map"]) {
    await page.goto(SITE + "?t=" + Date.now() + "#" + hash, { waitUntil: "networkidle" });
    await page.waitForTimeout(hash === "map" ? 4000 : 800);
    await page.screenshot({ path: `${out}/${hash}-${scheme}.png` });
  }
  await ctx.close();
}
await browser.close();
