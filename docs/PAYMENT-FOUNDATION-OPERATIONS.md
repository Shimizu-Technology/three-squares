# Payment foundation rollout

The payment design is in `WORLDPAY-IMPLEMENTATION-SPEC.md`. This rollout keeps production paused. No adapter, profile, or credential is inferred from `payment_test_mode` or a reference prefix.

## Identity and migration

Create immutable `PaymentIdentity` records from verified account/environment evidence and an enabled `PaymentProfile` for each provider/location/channel. An enabled location profile overrides that provider's default channel profile. The site's selected provider affects new sessions only. Missing profiles fail closed; Worldpay remains unavailable until Phase 4a installs its adapters. Stripe's `stripe_default` secret slot uses `STRIPE_SECRET_KEY_TEST` in sandbox and `STRIPE_SECRET_KEY` in production, with the explicit `external_account_id` sent as the Stripe account context. Do not copy unknown historical secret values into new configuration slots.

Historical orders are deliberately left with null identities. Neither an ID prefix nor the current test toggle proves the original account or environment. Before enabling historical refunds/recovery, map each order using authenticated Stripe account/payment evidence; unresolved rows require reconciliation. Preserve legacy reference columns. This additive migration is irreversible because financial evidence must survive rollback.

Production web and workers require `APP_DEPLOYMENT_ENV=production`, no legacy `APP_MODE=test`, no simulated/sandbox Worldpay mode, no simulation routes, no legacy database test toggle, and only production enabled profiles. The initializer checks this on boot; dispatch and finalization recheck identity authority. Existing unsafe settings will prevent boot when Render is eventually resumed. The launch owner must reconcile settings and verified account profiles before resuming it. Do not disable the guard to bring up the service.

The first slice adds records/contracts only. Existing checkout and refund consumers move onto them in the following slices; this schema PR alone does not close F01/F03/F07. Physical iPad/provider certification and real sends/charges remain outside local acceptance.
