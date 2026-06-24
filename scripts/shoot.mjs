// Capture the verdict card in each state to docs/*.png, using the system Chrome.
// Requires the dev server running on http://localhost:3000 (npm run dev).
//
//   node scripts/shoot.mjs

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, "..", "docs");
mkdirSync(docs, { recursive: true });

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--force-color-profile=srgb", "--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 1000, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle0" });
await page.waitForSelector(".chip");

const order = ["ship", "hold", "reject"];
for (let i = 0; i < order.length; i++) {
  if (i > 0) {
    const buttons = await page.$$(".switch button");
    await buttons[i].click();
  }
  await sleep(1500); // let the one animation settle
  await page.screenshot({ path: join(docs, `${order[i]}.png`) });
  console.log("wrote docs/" + order[i] + ".png");
}

await browser.close();
