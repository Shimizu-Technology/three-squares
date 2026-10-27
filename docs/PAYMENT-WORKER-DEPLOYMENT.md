# Payment worker deployment

The web process and an explicit Solid Queue worker must run the same release. The primary database holds payment intent, compensation claims, inventory commitments/reservations and `payment_outboxes`. The queue database holds runnable jobs and scheduler state. A queue outage cannot roll back or lose committed primary-DB effects: the recurring dispatcher scans pending and expired claims again.

This change does not provision or change Render. Keep the suspended preview suspended until the integration owner authorizes deployment. The following are release requirements, not evidence of a deployed worker.

## Provision and migrate before launch

1. Provision a durable PostgreSQL queue database and configure `QUEUE_DATABASE_URL` on both web and worker. Keep `DATABASE_URL` pointed at the application's primary database. Production aborts without the queue URL or when `ACTIVE_JOB_QUEUE_ADAPTER` selects anything other than `solid_queue`.
2. Use identical `APP_DEPLOYMENT_ENV=production`, original payment credential slots and production identity guards on both services. Do not enable simulated/sandbox profiles or legacy payment test flags in production.
3. Apply primary migrations with `RAILS_ENV=production bin/rails db:migrate:primary` in the approved release environment. Before an initial queue launch, explicitly load the existing queue schema into the **empty queue database only** with `RAILS_ENV=production bin/rails db:schema:load:queue`. This schema load is destructive on a populated queue DB; never use it as a routine release migration. Later queue changes require normal versioned migrations under `db/queue_migrate` and `bin/rails db:migrate:queue`. Keep `db/queue_schema.rb` available in the release image. The queue schema is already tracked; do not invent an application migration that copies queue tables into primary.
4. Preserve existing Solid Cable requirements if the application uses Cable. Its connection remains mapped to primary; its schema is a separate pre-existing deployment concern. This slice does not enable or migrate Cable.
5. Add an explicit Render Background Worker using the API root, the same install/build/runtime environment as web, and start command `bundle exec bin/jobs`. Keep the recurring scheduler enabled (do not set `SOLID_QUEUE_SKIP_RECURRING=true`). `queue.yml` workers consume `payments` and `default` through `queues: "*"`; concurrency defaults to one worker process and three threads. Budget DB connections for all worker/web processes and databases.

## Launch acceptance

Before enabling checkout, verify the release SHA matches on web and worker, both DB migrations/schema are present, worker/dispatcher/scheduler heartbeats are fresh in `SolidQueue::Process`, and recurring tasks include `recover_payments` and `dispatch_payment_outbox` every minute. A green `/up` only proves the web process, not payment recovery.

Use this read-only launch check in the approved deployment environment (not run by this implementation task):

```sh
RAILS_ENV=production bin/rails runner 'abort "Wrong queue adapter" unless ActiveJob::Base.queue_adapter.is_a?(ActiveJob::QueueAdapters::SolidQueueAdapter); kinds = SolidQueue::Process.where("last_heartbeat_at > ?", 2.minutes.ago).pluck(:kind); abort "Missing queue processes" unless %w[Worker Dispatcher Scheduler].all? { |kind| kinds.include?(kind) }; puts "Queue processes healthy"'
```

In an isolated nonproduction fixture environment, commit an outbox row while queue enqueue is unavailable, restart the worker, and verify the row delivers and is acknowledged. Repeat with an expired `dispatching` lease and a stale payment attempt whose browser never returned. Verify capture, inventory commitment, charge consumption and delivered effects in primary. Never use production charges or real messages as a launch test. Provider sandbox certification and physical iPad acceptance remain separate parent/release gates.

Alert on stale/missing worker heartbeats, queue latency/failed jobs, oldest due outbox row, increasing outbox retries, stale unknown/dispatching attempts, failed/pending compensation, elapsed recovery deadlines and `manual_reconciliation_required`. Recovery runs continue to query; a deadline never converts unknown money movement into a declined payment. An adapter/config failure stays visible as persisted error classification and a pending claim.

## Application interfaces

Create the order/items and session/attempt before remote setup. Store the full snapshot in `CheckoutSession.snapshot` with `Payments::Snapshot.digest(snapshot)`, and call `Payments::Snapshot.persist!(session:, attempt:, order:)` in that same transaction to copy it into `PaymentAttempt.snapshot` and `Order.payment_snapshot`. The validator compares the keys in snapshot `order` and saved `items`; payment binding columns can be applied afterward. The order must have the exact session/attempt/identity/provider/environment/user/location/total binding before setup. Snapshot item IDs must be sorted or sortable by saved ID. Cart timestamps use `iso8601(6)` to preserve PostgreSQL microseconds.

`Payments::ReserveInventory.call(order:, expires_at:)` is a prepayment transaction; callers can also wrap it inside pending-order creation. It groups shared product and variant pools, locks products then variants in ID order, and reserves stock without decrementing it. Finalization rechecks availability under the same locks, including expired reservations. Committed `InventoryReservation` rows retain order, pool type/ID, total quantity and per-item purchased/restored quantities for shared restock accounting; they are never deleted by finalization.

All authenticated collection queries converge on `Payments::FinalizeOrder.call(attempt:, result:)`, where `result` is `Payments::Result`. It validates identity/raw ID/amount/currency/full snapshot, then atomically consumes the charge, commits inventory and records outbox effects. `Payments::Eligibility.validate_order!(order)` must raise `Payments::FulfillmentError` for a valid captured payment whose order cannot fulfill. Unexpected programming errors remain errors and are retried by recovery. A partial approval is never fulfillment. Foreign reference rejection never initiates compensation.

`FinalizeOrder.call_cash(order:)` accepts only a staff-created POS cash order without session/attempt/provider identity. The parent owns staff authorization. The method uses Eligibility, the same inventory commitment and notification outbox primitives, and stamps the cash snapshot if absent. Production cash must already have `payment_environment=production` and cannot be simulated. Repeated calls return the committed order without decrementing stock again. Cash has no fabricated provider charge.

`Payments::ReconcileAttempt.call(attempt:)` queries outside locks and persists safely recovered setup IDs even for a collecting result. `PaymentRecoveryJob` sweeps persisted retries and stale raw-less attempts; `OutboxDispatchJob` sweeps due/expired outbox leases. `ProcessPaymentReversalJob` accepts only the stored attempt UUID, not a raw Stripe reference or legacy order number as authority. Unbound legacy reversals fail closed and need manual reconciliation.

`Payments::CompensateAttempt.claim!(attempt:)` requires an owned, unconsumed charge and `compensation_required`/existing compensation state. It validates again inside the job, commits a fulfillment-blocking claim and stable `compensation_operation_key`, and calls `provider.reverse(attempt:, operation_key:)` outside locks. Adapter results use symbol keys `{raw_id:, status:, amount_cents:}`; `raw_id` is the **reversal/refund operation ID**, `status` is `succeeded`, `pending`, `failed` or `unknown`, and amount must equal `attempt.captured_cents` when positive, otherwise `attempt.approved_cents`. The adapter must validate original account/identity/PI ownership and operation correlation before returning this hash. Only `succeeded` releases inventory reservations and completes compensation.

The core persists `attempt.compensation_provider_id` and `compensation_status`. When the ID exists, it calls `provider.query_reversal(attempt:, operation_key:)` instead of creating another refund; that adapter must query the stored refund ID and verify it belongs to this exact original payment and operation. Pending, failed, exception and unknown outcomes retain the active claim and block fulfillment. With no operation ID, redispatch reuses the same operation key only within 23 hours of `compensation_dispatched_at`; afterward it records manual reconciliation and does not call reverse again. No fresh financial key or provider failover is generated. Increased approval/capture observed after a compensation claim is retained as money evidence and requires manual reconciliation; the core never changes a dispatched operation payload under the same key.

For a confirmed refund, record this in the transaction that marks success:

```ruby
PaymentOutbox.record!(
  effect_key: "refund:#{refund.id}:notification",
  kind: "refund_notification",
  payload: { "refund_id" => refund.id }
)
```

The dispatcher executes fixed consumers, acknowledges only after successful delivery, and retries stale leases. Refund email/SMS and admin SMS recipients have separate delivery rows. Confirmation flags and status sequences advance only after transport success. Admin SMS uses `enable_admin_sms` independently of `enable_order_sms` and stores per-phone acknowledgements instead of preclaiming sent-phone metadata. An explicit controller reset of a delivered flag/sequence authorizes a resend; normal duplicate jobs remain idempotent. Disabled channels are recorded as skipped, with flags left unsent and no automatic historical resend when settings change. Missing transport or failed sends remain pending, with bounded Active Job retries plus the recurring outbox sweep.

## Delivery bounds

Database consumption, stock commitment and outbox effect identity are enforced once. Delivery leases prevent concurrent normal sends, but they cannot make external transports exactly once. A transport can accept a message and lose its response, or a process can die after sending and before acknowledgement; expired leases then retry. ClickSend's existing transport supplies no external idempotency key. Resend is still called through the existing service without a transport idempotency key. Duplicate notifications remain possible across those crash boundaries. Flags mean successful transport acknowledgement, not recipient inbox/carrier delivery. External exactly-once behavior requires a transport with a verified idempotency contract and a stable effect key passed through to it.

Cancellation uses `Payments::UpdateOrder.call(order:, attributes:, user:)` under the same financial lock order. It never restores uncommitted reservations, never reopens cancelled orders, and makes a later capture enter compensation. `Payments::RestoreInventory.call(order:, item_ids: nil, user: nil)` restores only the remaining purchased quantities in the original committed pools. Cancellation and refunds share those quantities; current catalog inventory mode cannot redirect a restoration. Missing historical commitment/pool evidence requires manual review rather than assumed stock restoration.

Guest collection expires after 30 minutes. The same capability can read/reconcile/cancel its saved payment until the separate guest order-access expiry (30 days); expired sessions no longer disclose collection credentials. Expiry never proves a charge failed. Definitive cancelled/failed/compensated outcomes permit an explicit new checkout. POS persists its original request key/payload/staff owner until financial resolution; reader reset and prompt cancellation never clear that financial record. Payment confirm/cancel ingress is throttled and provider queries are spaced durably. Raw-less setup retries reuse the original operation for at most five recovery attempts inside its 23-hour idempotency window; later uncertainty stays held for reconciliation.

Paid order effects also record `admin_push` when `SendAdminPushNotificationJob` is present. Its dispatcher enqueues that job into Solid Queue; the existing push service supplies location-only subscriptions and a stable order tag. Outbox acknowledgement of this kind proves durable queue acceptance, not external delivery. The job's bounded retry policy and worker failure monitoring remain required.

POS validation refusals are persisted in `RejectedPaymentRequest` under the staff owner and caller key before returning `outcome: rejected, no_attempt: true`. That key can never create collection later, including a delayed duplicate request. Only this proof permits the UI to discard the frozen key and correct the cart. Transport/configuration uncertainty does not clear it. Recovery also bootstraps never-dispatched saved intents, or closes expired ones with no provider I/O when their missing dispatch timestamp proves collection never started. Status outbox intents and their channel delivery rows are both acknowledged, so completed status changes cannot fill the sweep batch forever.

## Refund recovery and monitoring

`RefundRecoveryJob` runs every minute from `config/recurring.yml`. It resumes stale reserved operations with their frozen request and key, and queries dispatching, pending and unknown operations. Processor queries have a persisted one-minute minimum spacing; after the 24-hour recovery deadline they run hourly and retain the reservation for reconciliation. They never renew a financial mutation. The adapter contracts are `refund(attempt:, reference:, amount_cents:, operation_key:, metadata:)`, `query_refund(reference:, operation_key:, original_reference:)`, and `query_original_charge(reference:)` for verified historical mappings.

`Payments::StripeRefundEvent.call(identity:, event_id:, refund:, original_references:)` processes individual refunds after signed account/livemode verification. Every page of `charge.refunded` is inspected. Observations are deduplicated and succeeded state cannot be regressed by a later failure event. Unknown external operations are held for reconciliation.

`RefundEffect` persists success effects in the same transaction as financial success. `Payments::DispatchRefundEffects` atomically transfers them into `PaymentOutbox`; its `delivered_at` acknowledges that database handoff only. Inventory uses `Payments::RestoreRefundInventory`; external refund notifications use the existing independently acknowledged delivery rows. The recurring dispatcher rescans both ledgers after a restart. Queue availability is required for notification delivery; it is not evidence of delivery itself.

Monitor held/unknown refund operations, overdue recovery, undelivered refund effects, outbox leases and failed Solid Queue jobs. Notification effects stop automatic retries after ten attempts and require an explicit operator retry after the transport problem is fixed. Keep financial recovery visible separately from notification failures. A deployed worker, scheduler and real transport acceptance remain launch-owner checks; none was provisioned or enabled during Phase 1c.
