import { chromium, webkit } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
const url = process.env.CUSTOMER_FIXTURE_URL ?? "http://localhost:5691/fixtures/customer-cards.html";
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local fixtures only");
const output = path.resolve(process.env.UI_EVIDENCE_DIR ?? "../tmp/customer-cards"),
  session = process.env.DEV_LIFECYCLE_SESSION;
mkdirSync(output, { recursive: true });
if (session)
  execFileSync("dev-lifecycle", [
    "claim",
    "--session",
    session,
    "process",
    String(process.pid),
    "--reason",
    "Customer card geometry browser descendants",
  ]);
const results = [];
try {
  for (const [engine, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await type.launch();
    try {
      for (const [width, height] of [
        [768, 1024],
        [1024, 768],
        [1440, 900],
        [390, 844],
        ...(engine === "webkit" ? [[375, 812]] : []),
      ])
        for (const touch of [false, true]) {
          const context = await browser.newContext({
            viewport: { width, height },
            hasTouch: touch,
            deviceScaleFactor: 1,
          });
          try {
            const page = await context.newPage();
            await page.goto(url);
            await page.getByRole("img", { name: "Fictional failed photo: photo unavailable", exact: true }).waitFor();
            await page.evaluate(() => document.fonts.ready);
            const geometry = await page.locator('[data-customer-card="product"]').evaluateAll((cards) =>
              cards.map((card) => {
                const price = card.querySelector(".customer-card__price");
                const walker = document.createTreeWalker(price, NodeFilter.SHOW_TEXT);
                let textNode;
                while ((textNode = walker.nextNode()) && !textNode.textContent.trim()) {}
                const range = document.createRange();
                range.selectNodeContents(textNode);
                const textBox = range.getBoundingClientRect().toJSON();
                const rect = (selector) => card.querySelector(selector).getBoundingClientRect().toJSON(),
                  title = card.querySelector(".customer-card__title"),
                  style = getComputedStyle(title);
                return {
                  name: title.textContent,
                  textBox,
                  card: card.getBoundingClientRect().toJSON(),
                  media: rect(".customer-card__media"),
                  title: rect(".customer-card__title"),
                  price: rect(".customer-card__price"),
                  font: style.fontSize,
                  line: style.lineHeight,
                  text: card.querySelector(".customer-card__price").textContent,
                  photo: card.querySelector("[data-photo-state]").dataset.photoState,
                  nestedActions: card.querySelectorAll("button,a").length,
                };
              })
            );
            for (const card of geometry) {
              assert.ok(Math.abs(card.media.width - card.media.height) <= 1, JSON.stringify(card));
              assert.equal(card.title.height, width < 640 ? 40 : 48);
              assert.equal(card.font, width < 640 ? "14px" : "16px");
              assert.equal(card.line, width < 640 ? "20px" : "24px");
              assert.equal(card.price.height, 24);
              assert.equal(card.nestedActions, 0);
              assert.ok(Math.abs(card.card.height - geometry[0].card.height) <= 1);
              const neighbor = geometry.find((other) => other !== card && Math.abs(other.card.y - card.card.y) <= 1);
              assert.ok(neighbor);
              assert.ok(Math.abs(card.price.y - neighbor.price.y) <= 1);
              assert.ok(
                Math.abs(card.textBox.bottom - neighbor.textBox.bottom) <= 1,
                "price/eligibility text baselines align"
              );
              assert.ok(Math.abs(card.title.y - neighbor.title.y) <= 1);
            }
            for (const price of await page.locator('.customer-card__price').all()) {
              assert.ok(await price.evaluate(el => [...el.querySelectorAll('span:not(.sr-only)')].every(child => child.getBoundingClientRect().right <= el.getBoundingClientRect().right + 1)), 'prices stay within the card');
            }
            assert.equal(geometry[2].text, "Catering inquiry");
            assert.ok(!geometry[2].text.includes("$0"));
            assert.equal(geometry[3].photo, "unavailable");
            assert.equal(geometry[5].text, "With a meal");
            assert.ok(geometry[4].text.includes("From $11.95"));
            assert.ok(geometry[4].text.includes("Was $14.95"));
            const collections = await page
              .locator('[data-customer-card="collection"] .customer-card__media')
              .evaluateAll((els) =>
                els.map((el) => ({
                  width: el.getBoundingClientRect().width,
                  height: el.getBoundingClientRect().height,
                }))
              );
            for (const media of collections) assert.ok(Math.abs(media.width / media.height - 4 / 3) < 0.01);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.screenshot({
              path: path.join(output, `cards-${engine}-${width}-${touch ? "touch" : "fine"}.png`),
              fullPage: true,
            });
            results.push({ engine, width, height, touch, geometry, collections, status: "passed" });
            writeFileSync(path.join(output, "card-geometry.json"), JSON.stringify(results, null, 2) + "\n");
            console.log(`${engine} ${width}x${height} ${touch ? "touch" : "fine"} passed`);
          } finally {
            await context.close();
          }
        }
    } finally {
      await browser.close();
    }
  }
} finally {
  if (session) execFileSync("dev-lifecycle", ["release", "--session", session, "process", String(process.pid)]);
}
