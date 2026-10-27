# Payment readers and recovery

The POS saves an order, its original provider/account/environment, collection mode and selected reader before collection. Terminal and hosted manual-card payments use the existing payment finalizer, inventory reservations, refund ledger and recovery workers. A reader status or browser success message cannot mark an order paid.

## Staff workflow

1. Choose an authorized sale location and reader. Review the basket and its location prices before pressing Card.
2. Keep the saved order open while the reader collects payment. Worldpay collection runs on the `payments` queue; Stripe uses its existing Terminal SDK path.
3. After a timeout, reload or lost response, use **Check saved payment**. **Resume original reader payment** retains the original order, request key, account and reader. It never creates a replacement payment.
4. Use **Cancel saved payment** to request cancellation. Cancellation, a disconnected reader, elapsed time and resetting a browser do not prove that money stopped moving. Unknown outcomes retain their lane and inventory claims.
5. The hosted card form is an explicit alternative for a new POS basket. It selects the configured online profile while preserving POS ownership, fulfillment and inventory rules. Resolve an existing uncertain payment before choosing this path.

Stripe resume queries the original PaymentIntent first. A verified `requires_payment_method` permits SDK collection on the original connected reader. A verified `requires_confirmation` can retry processing only when the same SDK-managed object remains in that connection's memory. Reload discards that object; the app does not reconstruct it from JSON or collect a second card while processing is unresolved. SDK details are never serialized to storage or sent to Rails. See the [Stripe Terminal payment lifecycle](https://docs.stripe.com/terminal/payments/collect-card-payment?terminal-sdk-platform=js) and [JavaScript SDK reference](https://docs.stripe.com/terminal/references/api/js-sdk).

Payment receipts show the actual recorded state, environment, amount, refunded amount, reference and allowlisted reader/card facts. Simulation and sandbox labels use text. Receipt/reprint data cannot authorize payment or stock changes. PAN, CVV, track, PIN, signatures and device cryptograms are excluded.

## Reader administration

`/admin/payment-terminals` requires `payments.terminals.manage`: owners and all-locations managers. Scoped managers and staff cannot provision, pair or retire readers. Staff collection/status/cancellation remains location-scoped and collection requires the original checkout user and frozen reader. Discovery requires `payments.terminals.discover`; connection tokens and reader listings use the configured Stripe location. Simulator commands require owner capability `payments.simulate` and a non-production simulated identity.

Worldpay pairing sends an activation code through Rails. Codes are filtered from logs and never stored in the operation ledger or browser recovery envelope. A lost response retains the administration UUID, frozen device/location/lane/profile and original nonsecret payload. Checking that operation queries the same lane; it does not send another pairing request. Reader edits and collection are blocked under the lane claim while administration is unresolved. Re-pairing cannot change a historical reader's immutable account/location/lane/identifier.

Stripe registration in this app verifies an **already registered** reader through its original account, processor mode and assigned Stripe location. It does not create or delete a Stripe reader. Local retirement stops new collection and retains both history and the Stripe registration. The [Stripe reader retrieval contract](https://docs.stripe.com/api/terminal/readers/retrieve) supplies the identity/location/mode facts used for this check.

Real Worldpay deletion remains unknown without assigned deletion proof. No empty response, cached connection heartbeat or missing lane is treated as financial resolution. Unknown administration keeps its lane claim for reconciliation.

## Simulator acceptance

Use only a dedicated local database and `PAYMENTS_SIMULATION_ENABLED=true` outside production. Every screen identifies simulated payments as **Simulated payments — no money moves**. The developer reader panel supports taking the saved payment, tap, approve, decline, wrong PIN, disconnect/reconnect and lost response. Card commands remain disabled until the worker commits dispatch. Financially unknown reader state can resume only from the bound simulated ledger, never a connectivity hint.

Clock advances apply to one saved attempt/session and its events. Public online checkout uses its capability/user boundary. POS developer commands and time advances additionally require owner capability and original staff/reader ownership. Other sessions and their refunds do not advance. Simulated rows remain excluded from operational revenue and exports; production boot, request and job guards remain mandatory. Development simulator UI is excluded from production bundles.

## Dispatch and deployment

Run web/API and the existing payments worker from the same release; see [worker deployment](PAYMENT-WORKER-DEPLOYMENT.md). The primary-DB outbox durably enqueues `ProcessTerminalSaleJob`. A committed dispatch claim precedes network I/O. Duplicate jobs, crashes on either side of that claim and recovery sweeps query the original transaction; they never repeat an unproven-safe sale. No financial locks are held during provider I/O. Terminal acquisition follows the common financial lock order, then the lane/terminal claim.

The native triPOS parser returns nonauthorizing facts. The provider binds them to the frozen intent and an explicitly approved assigned contract. Partial/multiple/foreign/malformed financial evidence quarantines the payment; later empty or single-approval queries cannot erase it. Raw wire data and credentials are not receipt fields or logs.

`WORLDPAY_TRIPOS_TRANSPORT_ENABLED=false` is the default. Enabling HTTP also requires a frozen approved Cloud profile/version, account/acceptor binding, application version, USD/query semantics, reporting timezone/completeness, response-code policy, payment types and request/input budgets. Simulation never uses this transport. This implementation was tested with injected transports and synthetic fixtures; no processing endpoints were called.

The published refund, linked-return, void and known-ID reversal builders remain blocked request plans. Assigned mutation/recovery semantics, active-sale cancellation, no-ID/no-PAN reversal, PIN/debit capabilities, physical device/firmware, receipts and certification remain external gates. Hosted Fields is still a marked stub pending its guide; Premium is separately gated. These seams do not establish sandbox or credentials-only readiness. See [native wire contract](../api/spec/services/payments/worldpay/tri_pos_client/README.md) and [certification runbook](WORLDPAY-CERTIFICATION-RUNBOOK.md).
