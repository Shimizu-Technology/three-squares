# Payment foundation rollout

The payment design is in `WORLDPAY-IMPLEMENTATION-SPEC.md`. This rollout keeps production paused. No adapter, profile, or credential is inferred from `payment_test_mode` or a reference prefix.

## Identity and migration

Create immutable `PaymentIdentity` records from verified account/environment evidence and an enabled `PaymentProfile` for each provider/location/channel. An enabled location profile overrides that provider's default channel profile. The site's selected provider affects new sessions only. Missing profiles fail closed; Worldpay remains unavailable until Phase 4a installs its adapters. Stripe's `stripe_default` secret slot uses `STRIPE_SECRET_KEY_TEST` in sandbox and `STRIPE_SECRET_KEY` in production, with the explicit `external_account_id` sent as the Stripe account context. Do not copy unknown historical secret values into new configuration slots.

Historical orders are deliberately left with null identities. Neither an ID prefix nor the current test toggle proves the original account or environment. Before enabling historical refunds/recovery, map each order using authenticated Stripe account/payment evidence; unresolved rows require reconciliation. Preserve legacy reference columns. This additive migration is irreversible because financial evidence must survive rollback.

Production web and workers require `APP_DEPLOYMENT_ENV=production`, explicit `APP_MODE=production` and live Stripe credentials, no simulated/sandbox Worldpay mode, no simulation routes, no legacy database test toggle, and only production enabled profiles. The initializer checks this on boot; dispatch and finalization recheck identity authority. Existing unsafe settings will prevent boot when Render is eventually resumed. The launch owner must reconcile settings and verified account profiles before resuming it. Do not disable the guard to bring up the service.

Checkout, POS, signed Stripe webhooks and payment recovery now converge on `Payments::FinalizeOrder`. Admin refunds use the original identity through `Payments::RefundPayment`; provider selection changes affect new payments only. Physical iPad/provider certification and real sends/charges remain outside local acceptance.

## Refund operations and historical evidence

Admin refunds require a stable `Idempotency-Key`. The server freezes amount, reason, kind and inventory decision before dispatch. Reusing the key returns the same operation; a different payload returns 409. Pending and unknown operations retain their reserved amount. A rejected request returns durable `no_operation` proof before the UI permits a corrected request with a new key. Transport uncertainty keeps the saved request intact across reloads.

`Payments::RefundPayment.call(order:, amount_cents:, request_key:, ...)` enables linked returns only. Its `reconcile(operation:)` method queries the original identity and operation key without repeating a mutation. `POST /api/v1/admin/orders/:id/refund_operations/:operation_id/reconcile` exposes this recovery to authorized staff. A missing processor result remains unknown. Neither a missing result nor an expired recovery window releases the reserved amount.

Historical orders need an independently verified `payment_identity_id` mapping before any refund. The adapter then authenticates the original capture, account, environment, amount and USD currency. `LegacyCaptureBinding` records its one original order, using the PaymentIntent as the consumption reference when a Charge belongs to one. This prevents separate legacy orders or identity aliases from refunding the same capture. No checkout attempt is fabricated for historical evidence. Unknown identities, mismatched evidence and unregistered external/Dashboard refunds require manual reconciliation; the application does not import them as authorized refund operations. Reconcile external activity before enabling further application refunds on an affected order.

Stripe refund requests send `payment_intent` for a verified `pi_` reference and `charge` for a verified `ch_` reference. These reference types choose an SDK argument only; they never establish authority. Refund queries filter by the stored original payment and operation metadata. See Stripe's [refund creation](https://docs.stripe.com/api/refunds/create) and [refund listing](https://docs.stripe.com/api/refunds/list) contracts.

Confirmed success creates durable notification and optional inventory effects. Restocking requires an explicit saved decision. Refunds and cancellation restore only the remaining quantities in the original `InventoryReservation` pools. Missing historical commitment evidence produces a persisted `manual_review_required` warning and never reports inventory restored. Financial success remains recorded even if an inventory or notification effect must retry.
