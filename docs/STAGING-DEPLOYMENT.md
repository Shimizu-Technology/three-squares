# Staging deployment: test money only

Staging runs the production Rails runtime configuration with **Stripe test-mode payments only**. Stripe Elements uses test cards; no real money moves. This is a short demo deployment, not permission to resume production or accept real payments. The deployment owner performs the steps below. This implementation does not change Render, Netlify, Stripe settings, or production data.

Use staging-owned primary and queue databases. Never point staging at a production database. Enabled payment profiles must have sandbox identities; existing production or simulated enabled profiles prevent staging boot. Historical production identities can remain disabled for evidence but cannot dispatch payments in staging.

## Render API environment

Set these on the staging API (and on a separate worker if using one). Values in angle brackets come from the deployment owner, not this document.

| Variable | Value |
| --- | --- |
| `RAILS_ENV` | `staging` |
| `APP_DEPLOYMENT_ENV` | `staging` (required; any other or missing value prevents boot) |
| `APP_MODE` | `test` |
| `DATABASE_URL` | `<staging primary PostgreSQL URL>` |
| `QUEUE_DATABASE_URL` | `<separate durable staging queue PostgreSQL URL>` |
| `ACTIVE_JOB_QUEUE_ADAPTER` | `solid_queue` (default; other values prevent boot) |
| `SOLID_QUEUE_IN_PUMA` | `true` for this single-service demo; Puma owns Worker, Dispatcher and Scheduler |
| `STRIPE_SECRET_KEY_TEST` | `<rk_test_ restricted key, or sk_test_ key, for the staging Stripe sandbox>` |
| `STRIPE_PUBLISHABLE_KEY_TEST` | `<matching pk_test_ publishable key>` |
| `STRIPE_WEBHOOK_SECRET` | `<whsec_ signing secret for the sandbox endpoint below>` |
| `STRIPE_WEBHOOK_ACCOUNT_ID` | `<acct_ ID returned by the authenticated account read>` |
| `FRONTEND_URL` | `<exact HTTPS Netlify staging origin>` |
| `ALLOWED_ORIGINS` | `<explicit comma-separated HTTPS staging frontend origins; no wildcard>` |
| `SECRET_KEY_BASE` | `<persistent independently generated Rails secret>` |
| `CLERK_SECRET_KEY` | `<staging Clerk instance secret>` (required at boot) |
| `CLERK_PUBLISHABLE_KEY` | `<matching staging Clerk publishable key>` |

Preserve the existing S3 requirements for images/uploads: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and `AWS_S3_BUCKET` must refer to staging-owned storage. Set `API_HOST` for a custom API hostname; Render subdomains are already allowed. Rails inherits production's existing SSL/proxy, logging, eager-loading, caching, mailer and storage configuration as written; this change does not turn on the currently commented production SSL options.

Unset `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` for this deployment. Staging rejects `sk_live_`, `rk_live_` and `pk_live_` in **any `STRIPE_*` variable**, including unused or alternate slots. Missing or mismatched payment credentials never authorize simulation or a different account. The provider selects the sandbox slot from the immutable identity, independently of the initializer's legacy key fallback.

Normally leave `PAYMENTS_SIMULATION_ENABLED` **unset**. The deployed web build excludes simulator UI through `import.meta.env.DEV`; staging uses real Stripe test APIs instead. Simulation remains subject to its existing explicit opt-in, identity and dedicated-database gates. The opt-in does not allow simulated enabled profiles in staging. Leave Worldpay transport flags unset/false for the Stripe demo. Avoid configuring real outbound notification credentials for demo customers; Stripe test money does not sandbox email, SMS, shipping or storage.

Keep one queue execution owner. With `SOLID_QUEUE_IN_PUMA=true`, do not also start a Background Worker. If the lead chooses a separate `bundle exec bin/jobs` worker instead, unset `SOLID_QUEUE_IN_PUMA` entirely, use identical release/environment on web and worker, and follow [Payment worker deployment](PAYMENT-WORKER-DEPLOYMENT.md). Do not set `SOLID_QUEUE_SKIP_RECURRING=true`.

## Deployment order

1. Keep the existing deployment suspended until the owner authorizes the window. Prepare the staging databases and environment, select the reviewed release SHA, and keep ordering paused while validating it. For an existing staging dataset, pause through the owner UI or the runner below before exposing checkout. For a new dataset, initialize settings and pause before opening public access.
2. Create the databases through the approved hosting/database path. Rails `bin/rails db:prepare` also supports a missing staging primary, provided the database role can create databases. Environment checks still run. Only staging database-creation tasks may bypass an absent primary during bootstrap; ordinary web/runner boots still fail without it.
3. On the **empty queue database only**, run `bin/rails db:schema:load:queue`. This is destructive on a populated queue database. Never run it as a routine release migration. Keep `db/queue_schema.rb` in the image.
4. Run `bin/rails db:migrate` (primary, queue and cable mappings), or `bin/rails db:migrate:primary` then `bin/rails db:migrate:queue` for an existing installation. `bin/rails db:prepare` works with the same staging mapping. Cable retains production's primary-DB mapping; enabling Cable still has its pre-existing separate schema requirements. Do not load a Cable schema over application data as part of this demo.
5. Confirm the application has its initialized site settings/catalog. The provisioning task requires the existing settings row; it does not seed restaurant data, change ordering availability or change notification settings. For a brand-new staging dataset, initialize the approved demo catalog/settings first (the existing `db:seed` is an explicit catalog import, not part of provisioning). Keep notifications disabled and ordering paused.
6. Configure the sandbox webhook endpoint below. Run `bin/rails payments:provision_stripe` to review the plan, then `APPLY=true bin/rails payments:provision_stripe` to write it. Both perform a read-only `Stripe::Account.retrieve` using the environment's explicit key slot; the key's prefix must match staging sandbox / Rails production live mode. Account objects do not establish payment livemode, so the task checks the key mode before the authenticated read. Restricted keys need account-read plus the permissions used by checkout, queries and refunds. A provider failure aborts without writes or secret output. See [Stripe account retrieval](https://docs.stripe.com/api/accounts/retrieve) and [API key modes](https://docs.stripe.com/keys).
7. Verify the printed account matches `STRIPE_WEBHOOK_ACCOUNT_ID` and both test keys. The task creates/reuses `stripe_default:sandbox:<acct_id>` (`stripe_default:production:<acct_id>` in real production), an immutable USD Stripe identity and enabled default online `stripe_embedded` profile. Repeated applies reuse the records. Conflicting identities/defaults or enabled online overrides refuse provisioning for manual reconciliation. POS/Terminal profiles and ordering pause state remain unchanged. Production still requires its original production guards and a legacy-test-mode-free database.
8. Start the staged release with the single chosen queue owner. Verify `/up`, then verify Worker/Dispatcher/Scheduler heartbeats and recurring payment recovery, refund recovery and outbox dispatch. A healthy web response alone does not prove the queue runs:

   ```sh
   bin/rails runner 'abort "Wrong adapter" unless ActiveJob::Base.queue_adapter.is_a?(ActiveJob::QueueAdapters::SolidQueueAdapter); kinds = SolidQueue::Process.where("last_heartbeat_at > ?", 2.minutes.ago).pluck(:kind); abort "Missing queue processes" unless %w[Worker Dispatcher Scheduler].all? { |kind| kinds.include?(kind) }; puts "Queue processes healthy"'
   ```

9. The lead configures the existing Netlify web deployment's `VITE_API_BASE_URL` and matching staging `VITE_CLERK_PUBLISHABLE_KEY`, then builds normally in production mode (`npm run build`), retaining the simulator exclusion. Do not use a Vite development build on the hosted site. Confirm `GET /api/v1/config` returns `payment_environment=sandbox`, `app_mode=test`, `simulation_enabled=false`, the matching `pk_test_` key/account, and the intended ordering pause state.
10. Unpause only for the demo and use Stripe test cards. Verify checkout, the signed webhook, persisted test payment/order, and queue recovery/notification behavior with approved fixtures. Real Stripe test-card UI, hosted origin/Clerk configuration and hosted worker acceptance are deployment-owner checks; local stubbed API tests do not establish them.

All commands above run from `api/` with `RAILS_ENV=staging` and the full environment set. Primary migrations and queue schema loading require that both databases exist. Do not temporarily set `RAILS_ENV=production` or relax any production guard to run them.

## Stripe sandbox webhook endpoint

Create a **sandbox/test-mode** endpoint at `https://<staging-api-host>/webhooks/stripe`, with that endpoint's signing secret in `STRIPE_WEBHOOK_SECRET`. Subscribe to the events the current handler consumes:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`
- `charge.refund.updated`
- `refund.created`
- `refund.updated`
- `refund.failed`
- `charge.dispute.created` (records a manual-review warning)

The handler verifies the raw body/signature using `STRIPE_WEBHOOK_SECRET`, resolves the signed `event.account` or explicit `STRIPE_WEBHOOK_ACCOUNT_ID`, and binds `livemode=false` to the original sandbox identity. A wrong account, live-mode payment/refund or mismatched financial binding cannot finalize a sandbox payment/refund. Retry/delivery evidence belongs in the sandbox Dashboard; never send live events or use a live signing secret for the demo.

## Pause, resume, suspend

Owners can use the existing online-ordering pause control. Equivalent approved runner commands are:

```sh
# Pause new online checkout without rewriting saved financial attempts.
bin/rails runner 'SiteSetting.instance.update!(online_ordering_paused: true, online_ordering_pause_message: "Demo ordering is paused.")'
# Open the demo window after the checks above.
bin/rails runner 'SiteSetting.instance.update!(online_ordering_paused: false)'
```

At the end of the window, pause ordering first and verify the public config reports the pause. Resolve/check in-flight test payments, refunds and outbox work while the queue still runs; a pause does not cancel saved financial operations. The deployment owner then suspends the Render API (and a separate worker if used), disables the temporary sandbox webhook endpoint as appropriate, and puts the Netlify frontend in the agreed unavailable/demo-ended state. Preserve staging databases and financial evidence unless a separate deletion is approved. Do not switch the same staging database to live payment mode to end the demo. Resuming staging later requires the same environment, release/worker checks and explicit unpause. Real production launch remains a separate deployment with unchanged live-only guards.
