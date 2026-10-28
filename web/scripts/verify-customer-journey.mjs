import { chromium, webkit, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
const base = process.env.CUSTOMER_BASE_URL ?? "http://localhost:5691",
  api = process.env.CUSTOMER_API_URL ?? "http://localhost:3601";
for (const url of [base, api])
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local demo only");
const output = path.resolve(process.env.UI_EVIDENCE_DIR ?? "../tmp/customer-journeys");
mkdirSync(output, { recursive: true });
const session = process.env.DEV_LIFECYCLE_SESSION;
if (session)
  execFileSync("dev-lifecycle", [
    "claim",
    "--session",
    session,
    "process",
    String(process.pid),
    "--reason",
    "Customer journeys browser descendants",
  ]);
const results = [];
const square = async (locator) => {
  const box = await rect(locator);
  assert.ok(Math.abs(box.width - 44) <= 1 && Math.abs(box.height - 44) <= 1, JSON.stringify(box));
};
const rect = (locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });
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
      ]) {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, deviceScaleFactor: 1 });
        const page = await context.newPage();
        const label = `${engine}-${width}`;
        try {
          await page.goto(`${base}/products`);
          await page.getByRole("button", { name: /Three Squares Main/ }).tap();
          await page.locator('[data-customer-card="product"]').first().waitFor();
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({ path: path.join(output, `after-menu-${label}.png`) });
          const cardRows = await page
            .locator('[data-customer-card="product"]')
            .evaluateAll((els) =>
              els.map((el) => ({
                box: el.getBoundingClientRect().toJSON(),
                price: el.querySelector(".customer-card__price").getBoundingClientRect().toJSON(),
              }))
            );
          for (const card of cardRows)
            for (const other of cardRows.filter((row) => Math.abs(card.box.y - row.box.y) < 1)) {
              assert.ok(Math.abs(card.box.height - other.box.height) <= 1);
              assert.ok(Math.abs(card.price.y - other.price.y) <= 1);
            }
          await page.locator("#menu-search").fill("Cheeseburger");
          const meal = page.locator('[data-customer-card="product"]').filter({ hasText: "Cheeseburger" });
          await expect(meal).toHaveCount(1);
          await meal.tap();
          const add = page.getByRole("button", { name: "Add to Cart", exact: true });
          await expect(add).toBeEnabled();
          assert.equal((await rect(add)).height, 52);
          const productQuantity = page.getByRole("group", { name: "Quantity of Cheeseburger", exact: true });
          await square(productQuantity.getByRole("button", { name: "Increase quantity of Cheeseburger", exact: true }));
          await square(productQuantity.getByRole("button", { name: "Decrease quantity of Cheeseburger", exact: true }));
          await productQuantity.getByRole("button", { name: "Increase quantity of Cheeseburger", exact: true }).tap();
          await expect(productQuantity.getByLabel("Current quantity of Cheeseburger", { exact: true })).toHaveText("2");
          await productQuantity.getByRole("button", { name: "Decrease quantity of Cheeseburger", exact: true }).tap();
          await expect(productQuantity.getByLabel("Current quantity of Cheeseburger", { exact: true })).toHaveText("1");
          await add.tap();
          const drawer = page.getByRole("dialog", { name: "Shopping Cart" });
          await expect(drawer).toBeVisible();
          const increase = drawer.getByRole("button", { name: "Increase quantity of Cheeseburger", exact: true }),
            decrease = drawer.getByRole("button", { name: "Decrease quantity of Cheeseburger", exact: true }),
            close = drawer.getByRole("button", { name: "Close cart", exact: true });
          for (const target of [increase, decrease, close]) await square(target);
          await expect(increase).toBeEnabled();
          const cartQuantity = drawer.getByRole("group", { name: "Quantity of Cheeseburger", exact: true });
          const quantityBefore = await rect(cartQuantity);
          await page.route("**/api/v1/cart/items/*", async route => {
            if (["PATCH", "PUT"].includes(route.request().method())) await new Promise(resolve => setTimeout(resolve, 500));
            await route.continue();
          });
          await increase.tap();
          await expect(cartQuantity).toHaveAttribute("aria-busy", "true");
          await expect(increase).toBeDisabled();
          await expect(decrease).toBeDisabled();
          const quantityPending = await rect(cartQuantity);
          assert.ok(Math.abs(quantityBefore.width - quantityPending.width) <= 1);
          await expect(drawer.getByText("$25.90", { exact: true }).first()).toBeVisible();
          await page.unroute("**/api/v1/cart/items/*");
          await expect(decrease).toBeEnabled();
          await decrease.tap();
          await expect(drawer.getByText("$12.95", { exact: true }).first()).toBeVisible();
          await expect(increase).toBeEnabled();
          await drawer.getByRole("button", { name: "Remove Cheeseburger from cart", exact: true }).tap();
          await expect(drawer.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
          await drawer.getByRole("button", { name: "Browse Menu", exact: true }).tap();
          await page.locator("#menu-search").fill("Cheeseburger");
          await page.locator('[data-customer-card="product"]').filter({ hasText: "Cheeseburger" }).tap();
          await expect(add).toBeEnabled();
          await add.tap();
          await expect(drawer).toBeVisible();
          await expect(drawer.getByRole("button", { name: "Secure Checkout", exact: true })).toBeEnabled();
          assert.equal((await rect(drawer.getByRole("button", { name: "Continue shopping", exact: true }))).height, 44);
          await drawer.getByRole("button", { name: "Continue shopping", exact: true }).tap();
          await expect(drawer).not.toBeVisible();
          const cart = page.getByRole("button", { name: "Shopping cart with 1 item", exact: true });
          await square(cart);
          await cart.tap();
          await expect(drawer).toBeVisible();
          await page.keyboard.press("Tab");
          assert.ok(await page.evaluate(() => document.querySelector("dialog[open]").contains(document.activeElement)));
          await page.keyboard.press("Escape");
          await expect(drawer).not.toBeVisible();
          await expect(cart).toBeFocused();
          await page.reload();
          await expect(page.getByRole("button", { name: "Shopping cart with 1 item", exact: true })).toBeVisible();
          await page.getByRole("button", { name: "Shopping cart with 1 item", exact: true }).tap();
          await expect(drawer.getByRole("button", { name: "Secure Checkout", exact: true })).toBeEnabled();
          assert.equal((await rect(drawer.getByRole("button", { name: "Secure Checkout", exact: true }))).height, 52);
          await drawer.evaluate(async element => {
            await Promise.all(element.getAnimations().map(animation => animation.finished));
          });
          await expect(drawer).toHaveCSS("opacity", "1");
          await page.screenshot({ path: path.join(output, `cart-${label}.png`) });
          await drawer.getByRole("button", { name: "Secure Checkout", exact: true }).tap();
          await page.locator("#name").fill("Fictional Customer");
          await page.locator("#email").fill(`fixture-${label}@example.test`);
          await page.locator("#phone").fill("6715550100");
          await page.getByLabel(/Card outcome/).selectOption("approve");
          await page.getByRole("checkbox", { name: /I have reviewed my items/ }).check();
          const pay = page.getByRole("button", { name: "Pay $12.95", exact: true });
          await expect(pay).toBeEnabled();
          await pay.tap();
          await page.waitForURL(/\/orders\/\d+/, { timeout: 30000 });
          await expect(page.getByRole("heading", { name: "Order Confirmed!", exact: true })).toBeVisible({
            timeout: 30000,
          });
          const orderId = Number(new URL(page.url()).pathname.split("/").at(-1));
          const capability = await page.evaluate((id) => localStorage.getItem(`tsq-order-capability:${id}`), orderId);
          const response = await context.request.get(`${api}/api/v1/orders/${orderId}`, {
            headers: { "X-Order-Capability": capability },
          });
          assert.equal(response.status(), 200);
          const { order } = await response.json();
          assert.equal(order.payment_status, "paid");
          assert.equal(order.payment_environment, "simulated");
          assert.equal(order.total_cents, 1295);
          assert.equal(order.customer_name, "Fictional Customer");
          await page.reload();
          await expect(page.getByRole("heading", { name: "Order Confirmed!", exact: true })).toBeVisible();
          await page.screenshot({ path: path.join(output, `receipt-${label}.png`) });
          await page.goto(`${base}/products`);
          await page.locator('[data-customer-card="product"]').first().waitFor();
          const inquiry = page
            .locator('[data-customer-card="product"]')
            .filter({ hasText: "Catering inquiry" })
            .first();
          await inquiry.tap();
          await expect(page.getByText("This item now requires a catering inquiry", { exact: true })).toBeVisible();
          await expect(page.getByRole("button", { name: "Price by request", exact: true })).toBeDisabled();
          await page.goto(`${base}/catering`);
          await page
            .getByRole("button", { name: /Request a quote/i })
            .first()
            .tap();
          await expect(page.getByRole("dialog", { name: "Request a Catering Quote" })).toBeVisible();
          await page.getByLabel("Name *", { exact: true }).fill("Fictional Inquiry");
          await page.getByLabel("Email *", { exact: true }).fill("inquiry@example.test");
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).not.toBeVisible();
          await page.goto(`${base}/collections`);
          await page.locator('[data-customer-card="collection"]').first().waitFor();
          await page.screenshot({ path: path.join(output, `collections-${label}.png`) });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          results.push({
            engine,
            width,
            height,
            touch: true,
            orderId,
            orderNumber: order.order_number,
            totalCents: order.total_cents,
            cardRows,
            status: "passed",
            cases: ["C01", "C02", "C03", "C04"],
          });
          writeFileSync(path.join(output, "journeys.json"), JSON.stringify(results, null, 2) + "\n");
          console.log(`${label}: browse, cart edits, simulated checkout receipt ${orderId}, inquiry entry passed`);
        } catch (error) {
          await page.screenshot({ path: path.join(output, `failure-${label}.png`) });
          writeFileSync(path.join(output, `failure-${label}.txt`), await page.locator("body").innerText());
          throw error;
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
