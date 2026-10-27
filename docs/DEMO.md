# Three Squares: 10–12 minute local demo

The default demo loads the restaurant menu, prices, locations and available photos already checked into this public repository. The seed may be out of date: **prices will be confirmed before launch**. Payments and customer details are simulated. No money moves, and email/SMS are disabled. Run it on the presenter's Mac with Vite in development mode; a normal hosted production build excludes the simulator controls.

## Prepare once

Install the versions in `api/.ruby-version` and `.node-version`, PostgreSQL 16 (already running), the API bundle (`cd api && bundle install`) and web dependencies (`cd web && npm ci`). The launcher connects to local PostgreSQL; it never starts or stops the database server.

Keep your existing **development** Clerk keys in `api/.env` (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`) and `web/.env` (`VITE_CLERK_PUBLISHABLE_KEY`). The public keys must match the same Clerk instance. The launcher also reads these keys from the main checkout's env files when using a Git worktree. Shell values take precedence. Live keys are rejected; keys are never printed. Use literal values, optionally quoted, rather than shell expressions in these files.

Set your presenter account's primary dev Clerk email privately:

```sh
export DEMO_OWNER_EMAIL='your-dev-account@example.test'
bin/demo start
```

Replace that example with your actual dev Clerk account. Sign in normally through **Log In**. The launcher uses the existing authenticated owner bootstrap for new accounts and promotes an existing matching account to owner/all locations in the demo database. It does not change Clerk roles or bypass authentication. The email stays in your environment, never in tracked files. If you change it after signing in, stop and start the launcher, then refresh the workspace.

The default database is `three_squares_demo`, with `--catalog three-squares`. The launcher runs the existing `db:seed`, then selects Worldpay simulation, provisions online/POS profiles and a connected simulated reader for every active seeded location, and disables all email/SMS sends. Restaurant, cookies and catering storefronts are visible; catering online ordering stays **off**, so catering remains an inquiry flow. Seeded locations are open all day **in this demo database only** so you can rehearse after hours.

Product photos use the seed's remote S3 URLs where a verified/deferred image exists. The seed stores those URLs without fetching or uploading images; the browser loads them while you browse. Unverified dishes can still show a placeholder. Internet access is needed for Clerk and remote photos.

Use `--catalog fictional` for the original small fictional menu and Simulation North/South locations. Keep the same catalog option on start/reset; switching catalogs requires reset to avoid mixing menus. Starting the restaurant catalog reapplies its seed menu and location availability while retaining orders/payment history. To use another isolated database or avoid occupied ports:

```sh
bin/demo start --db tsq_demo --api-port 3100 --web-port 5174
```

Equivalent port variables are `DEMO_API_PORT` and `DEMO_WEB_PORT`; `DEMO_PG_PORT` selects the local PostgreSQL port (default 5432). Standard `PGUSER`/`PGPASSWORD` can supply local database authentication. Generic `DATABASE_URL` is deliberately ignored. Only the default name or `tsq_` names containing `demo` or `sim` are accepted; names containing `prod`, `live`, `development` or `test` are rejected.

Wait for the launcher to print the customer/workspace URLs. Keep that terminal open. Open the customer URL and sign in in a second tab for the workspace. For a phone-sized customer walkthrough on the Mac, set browser responsive mode to **390 × 844**. The servers listen on loopback; this is not a physical-phone LAN setup.

## Present the flow

**0:00–2:00 — Customer pickup order.** Open the customer menu in the phone-sized window. Choose **Three Squares Main**, open **Cheeseburger** (with its seeded photo), add two burgers, then open the cart and checkout. Enter fictional contact details (for example `customer@example.test`, a fictional name, and a demo phone number). Choose pickup and leave the fictional card outcome set to **approve**. Review the total, tick the review checkbox and press **Pay**. Show the receipt, pickup location and saved order number.

Say: “This is the customer's pickup experience. The card approval is simulated, so we can show the whole order without charging anyone.” Use only the form's fictional card instructions; do not enter a real card.

**2:00–3:00 — Kitchen handoff.** In the owner workspace, open **Orders → Pickup queue** at `/admin/orders/pickup-queue`. Select the same location and find the receipt's order number. Press **Acknowledge**, open the **Acknowledged** tab, then press **Ready**. Refresh the customer's receipt to show that pickup status follows the same saved order.

Say: “The kitchen sees the order at the right location and tells the customer when it is ready.” Notifications remain disabled in this demo.

**3:00–5:00 — Walk-up sale and a decline.** Open **POS** at `/admin/pos`, choose Three Squares Main and its simulated reader. Add a Cheeseburger, choose **Card (simulated)** and take the card payment. Wait for dispatch, then use the reader panel's tap/approve controls. Show the paid receipt. Start another basket, choose **Card (simulated)**, then use the reader panel to take the payment and **Decline** it. Show the declined result, then follow the screen's saved-payment/retry instructions and approve the retry. Keep the original saved payment open until its result is definitive.

Say: “Staff can take walk-up orders here. This panel stands in for a card reader; it lets us rehearse approval and decline recovery before hardware is connected.” A disconnected reader or browser refresh does not prove cancellation. Use **Check saved payment** after uncertainty.

**5:00–6:00 — Partial refund.** Open the original two-burger order in **Orders**. Choose **Refund Order → Partial Refund**, enter **12.95** (half of the seeded $25.90 purchase; check the displayed price), add a reason and press **Process Refund**. Wait for success; show the remaining paid amount and refund history. Reload once to show the saved result. Choose restocking only when that is the intended stock outcome.

Say: “We can refund part of a sale and keep the original payment and refund history together.”

**6:00–8:30 — Reconciliation.** Open **Payment Reconciliation** at `/admin/payment-reconciliation`. Explicitly select **Simulated** and the simulator account. Review its unbatched transactions, then close a simulated batch using the ordinary funding scenario. Advance the **accounting** timeline until the planned deposit is available. Download the synthetic funding CSV, select that same file in the import control and import it. Review the batch, deposit and allocation balances; reload to show they persist.

Say: “This example connects sales and refunds to a batch and its deposit. The fee and timing are fictional. The bank's actual file format still needs confirmation.” Accounting time advances deposit observations only; it does not speed up an active payment.

**8:30–9:30 — Dashboard and analytics.** Open the workspace dashboard and **Analytics**. Point out the amber notice: **Simulated orders aren't counted in revenue**.

Say: “Practice orders stay out of revenue reports, so a demonstration cannot inflate the restaurant's sales.” Zero revenue is expected even though the demo order queue contains paid orders.

**9:30–10:15 — Payments status.** Open **Settings → General → Payment & Email Settings** and show **Payments status**. Point out the simulated-payment badge and **Real processor requests: Blocked / disabled**. Say: “Simulated — no money moves. Real processing is waiting on Worldpay credentials and the remaining setup.” Simulated rows describe the simulator; they do not claim that real Worldpay is ready or show a real-profile credential error. The status is read-only.

**10:15–11:30 — Pause and resume online ordering.** Add another item in the customer tab and leave its basket unpaid. In **Settings → General**, find **Online ordering**. Enter a short customer message, press **Pause online ordering → Confirm change**, and wait for **Saved status: Paused**. Refresh the customer tab: show the pause banner, browsable menu and disabled checkout. Press **Resume online ordering → Confirm change** in Settings, then refresh the customer tab and show that checkout is available again. Leave ordering resumed for the next rehearsal.

Say: “You can pause new online orders when the kitchen needs a break. Staff POS and already-saved payments keep their own workflow.”

**Optional closing glance, within 12 minutes:** open **Catering**, point out the inquiry form, and explain that event requests are handled as quotes. Do not submit a real inquiry during this demo.

Whenever a badge says **Simulated**, say: “The app is using a practice payment ledger; no card network, bank deposit, email or SMS is being sent.” The demo shows application behavior, not processor certification or live reader readiness.

## Stop and reset

Press **Ctrl-C** in the launcher terminal, or from this checkout run:

```sh
bin/demo stop
```

This stops only this launcher's API, queue and Vite process groups. It retains the demo database. Logs and its process state live under `tmp/demo/`; do not delete a running launcher's pidfile.

For a clean rehearsal, stop first, then use the same database option on reset and start:

```sh
bin/demo reset
bin/demo start
# Fictional option: bin/demo reset --catalog fictional
# Then: bin/demo start --catalog fictional
# Custom DB: use --db tsq_demo on both commands
```

Reset drops and recreates only the named dedicated demo database, migrates it and restores the selected catalog and simulator setup. It clears orders, refunds and accounting history. Clear the customer's cart/saved checkout (or use a fresh browser session) after resetting so old browser recovery links do not point at deleted orders. Starting again without reset preserves history and stock; fixture creation does not duplicate records. The restaurant seed reapplies its catalog fields.

## Troubleshooting

- **Port in use:** choose unused `--api-port` and `--web-port` values. The launcher uses strict ports and never kills their existing owner. Open the newly printed URLs.
- **Clerk key missing or mismatched:** check the dev keys in the files above, or export them privately in the shell. Both public keys must match; never paste keys into a report. Also set `DEMO_OWNER_EMAIL` to the signed-in account's primary email. Sign out/in if the browser belongs to another Clerk instance.
- **Database connection refused:** start your normal local PostgreSQL service yourself, or set `DEMO_PG_PORT` for an already-running local instance. The launcher does not manage shared database services.
- **Queue not processing:** inspect `tmp/demo/queue.log`, `api.log` and `prepare.log`. Keep the launcher running; check that all three services are alive. Recovery/outbox/refund sweeps run every minute, so allow a minute after a recoverable interruption. Stop/start the launcher to restart its worker, dispatcher and scheduler. If queue tables are incomplete, use reset for this disposable demo database. Existing queue tables are never force-reloaded.
- **A service crashes:** the launcher reports which child exited and stops its other services. Fix the cause in its log, then start again. Use `bin/demo stop` to clean a stale recorded run before restarting.
- **Customer banner or checkout unavailable:** an explicit ordering pause is controlled in Settings; resume it there. A connection warning instead means config/API access failed: use the customer retry control and inspect `tmp/demo/api.log`. The launcher still waits for `/health` before printing URLs; it uses the merged availability flow without modifying it.

Production queue settings, guards and production simulator bundle exclusion remain unchanged. `DEMO_QUEUE=1` applies only in development with the launcher's explicit simulated configuration and a dedicated demo database.
