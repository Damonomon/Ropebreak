// Renders entrance.html to frames, then encode with ffmpeg (see README).
// Needs: a static server on port 8766 at the repo root, and Playwright.
const { chromium } = require("playwright");
const fs = require("fs");
const out = process.argv[2] || "frames";
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.error(e.message));
  await page.goto("http://localhost:8766/tools/hero-video/entrance.html");
  await page.evaluate(() => window.ready);
  const canvas = await page.$("#c");
  for (let i = 0; i < 240; i++) {
    await page.evaluate((t) => render(t), i / 30);
    await canvas.screenshot({ path: `${out}/f_${String(i).padStart(4, "0")}.png` });
  }
  await browser.close();
})();
