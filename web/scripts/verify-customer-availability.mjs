import { chromium, webkit, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const base = process.env.CUSTOMER_BASE_URL ?? "http://localhost:5691",
  api = process.env.CUSTOMER_API_URL ?? "http://localhost:3601",
  db = process.env.CUSTOMER_DEMO_DB;
if (!db || !/^tsq_uniform_c_.*demo$/.test(db)) throw new Error("Explicit owned tsq_uniform_c_*demo DB required");
for (const url of [base, api])
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local demo only");
const output = path.resolve(process.env.UI_EVIDENCE_DIR ?? "../tmp/customer-availability");
mkdirSync(output, { recursive: true });
const session = process.env.DEV_LIFECYCLE_SESSION;
const sql = (query) => execFileSync("psql", ["-X", "-A", "-t", "-d", db, "-c", query], { encoding: "utf8" }).trim();
const quote = (value) => (value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`);
const original = JSON.parse(
  sql(
    "SELECT row_to_json(s) FROM (SELECT id,online_ordering_paused,online_ordering_pause_message FROM site_settings ORDER BY id LIMIT 1) s"
  )
);
const restore = () =>
  sql(
    `UPDATE site_settings SET online_ordering_paused=${original.online_ordering_paused},online_ordering_pause_message=${quote(original.online_ordering_pause_message)} WHERE id=${original.id}`
  );
if (session)
  execFileSync("dev-lifecycle", [
    "claim",
    "--session",
    session,
    "process",
    String(process.pid),
    "--reason",
    "Customer availability browser descendants",
  ]);
const results = [];
try {
  for (const [engine, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    if (process.env.CUSTOMER_QA_ENGINE && process.env.CUSTOMER_QA_ENGINE !== engine) continue;
    const browser = await type.launch();
    try {
      for (const [width, height] of [
        [390, 844],
        ...(engine === "webkit" ? [[375, 812]] : []),
        [1440, 900],
      ]) {
        if (process.env.CUSTOMER_QA_WIDTH && Number(process.env.CUSTOMER_QA_WIDTH) !== width) continue;
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
        const page = await context.newPage();
        const label = `${engine}-${width}`;
        try {
          sql(`UPDATE site_settings SET online_ordering_paused=false WHERE id=${original.id}`);
          await page.goto(`${base}/products`);
          await page.getByRole("button", { name: /Three Squares Main/ }).tap();
          await page.locator("#menu-search").fill("Cheeseburger");
          await page.locator('[data-customer-card="product"]').filter({ hasText: "Cheeseburger" }).tap();
          await page.getByRole("button", { name: "Add to Cart", exact: true }).tap();
          const drawer = page.getByRole("dialog", { name: "Shopping Cart" });
          await expect(drawer).toBeVisible();
          await drawer.getByRole("button", { name: "Continue shopping", exact: true }).tap();
          sql(
            `UPDATE site_settings SET online_ordering_paused=true,online_ordering_pause_message='Fixture kitchen pause' WHERE id=${original.id}`
          );
          await page.reload();
          await expect(page.getByText("Online ordering is paused.", { exact: true })).toBeVisible();
          await expect(page.getByRole("heading", { name: "Cheeseburger", exact: true })).toBeVisible();
          await page.getByRole("button", { name: "Shopping cart with 1 item", exact: true }).tap();
          await expect(drawer.getByRole("button", { name: "Secure Checkout", exact: true })).toBeDisabled();
          await page.screenshot({ path: path.join(output, `paused-${label}.png`) });
          await drawer.getByRole("button", { name: "Continue shopping", exact: true }).tap();
          await page.getByRole("button", { name: "Add to Cart", exact: true }).tap();
          await expect(page.getByRole("button", { name: "Shopping cart with 1 item", exact: true })).toBeVisible();
          await expect(drawer).not.toBeVisible();
          sql(`UPDATE site_settings SET online_ordering_paused=false WHERE id=${original.id}`);
          await page.reload();
          await expect(page.getByText("Online ordering is paused.", { exact: true })).not.toBeVisible();
          await expect(page.getByRole("button", { name: "Shopping cart with 1 item", exact: true })).toBeVisible();
          await page.route("**/api/v1/config*", (route) => route.abort());
          await expect(page.getByText(/Having trouble connecting/)).toBeVisible({ timeout: 35000 });
          await expect(page.getByRole("heading", { name: "Cheeseburger", exact: true })).toBeVisible();
          await page.getByRole("button", { name: "Shopping cart with 1 item", exact: true }).tap();
          await expect(drawer.getByRole("button", { name: "Secure Checkout", exact: true })).toBeDisabled();
          await page.screenshot({ path: path.join(output, `connection-${label}.png`) });
          await drawer.getByRole("button", { name: "Continue shopping", exact: true }).tap();
          await page.unroute("**/api/v1/config*");
          await page.getByRole("button", { name: "Retry connection", exact: true }).tap();
          await expect(page.getByText(/Having trouble connecting/)).not.toBeVisible();
          await page.getByRole("button", { name: "Shopping cart with 1 item", exact: true }).tap();
          await expect(drawer.getByRole("button", { name: "Secure Checkout", exact: true })).toBeEnabled();
          const sessionId = await page.evaluate(() => localStorage.getItem("cart_session_id"));
          const location = await page.evaluate(
            () => JSON.parse(localStorage.getItem("tsq-location")).state.selectedLocation
          );
          const response = await context.request.get(`${api}/api/v1/cart`, {
            headers: { "X-Session-ID": sessionId, "X-Location-ID": String(location.id) },
          });
          assert.equal(response.status(), 200);
          const cart = await response.json();
          assert.equal(cart.items.length, 1);
          assert.equal(cart.item_count, 1);
          assert.equal(cart.subtotal_cents, 1295);
          await page.route("**/api/v1/config*", (route) => route.abort());
          await page.reload();
          await expect(
            page.getByRole("heading", { name: "We can’t reach ordering right now.", exact: true })
          ).toBeVisible({ timeout: 15000 });
          await expect(page.getByText("Online ordering is paused.", { exact: true })).not.toBeVisible();
          await page.unroute("**/api/v1/config*");
          await page.getByRole("button", { name: "Retry connection", exact: true }).tap();
          await expect(page.getByRole("heading", { name: "Cheeseburger", exact: true })).toBeVisible();
          results.push({
            engine,
            width,
            height,
            touch: true,
            cart: { itemCount: cart.item_count, subtotal: cart.subtotal_cents },
            status: "passed",
            case: "C05",
          });
          writeFileSync(path.join(output, "availability.json"), JSON.stringify(results, null, 2) + "\n");
          console.log(
            `${label}: saved pause, rejected addition, connection retention/retry and first-load recovery passed`
          );
        } catch (error) {
          await page.screenshot({ path: path.join(output, `availability-failure-${label}.png`) });
          throw error;
        } finally {
          restore();
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  restore();
  if (session) execFileSync("dev-lifecycle", ["release", "--session", session, "process", String(process.pid)]);
}
