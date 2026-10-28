# Order number assignment

Orders keep `TSQ-{P|R|W}-YYYYMMDD-NNNN`: POS uses P, otherwise wholesale
uses W and retail uses R. The date is `Time.current` in Pacific/Guam.
The suffix is at least four digits and increments from the numeric maximum
for that prefix, including numbers above 9999. Malformed suffixes are ignored.
Existing orders and explicitly supplied numbers are preserved.

## Transaction and lock order

`Order#generate_order_number` takes
`pg_advisory_xact_lock(5526353, hashtext('order_number:' || prefix))`
before reading the maximum. The two-integer advisory namespace is separate
from the bigint owner/idempotency-key locks used by payments. A hash collision
only serializes two otherwise independent prefixes; it cannot duplicate numbers.
The maximum query bypasses the Rails query cache so it sees the preceding
writer's commit after waiting for the lock under PostgreSQL's default
READ COMMITTED isolation.

In Rails 8.1.2, `ActiveRecord::Transactions#save` and `#save!` call
`with_transaction_returning_status` around `super`, which invokes
`ActiveRecord::Validations#perform_validations` before insertion. Therefore
`before_validation` runs inside the save transaction. A standalone `valid?`
does not provide that lifetime: its generated candidate is refreshed on save.
The concurrency specs verify both save methods and the lock lifetime through
outer commit and rollback. They run without transactional fixtures.

Current creation paths acquire these locks in this order:

- Online checkout: owner/key advisory lock, cart rows, number prefix, new order,
  new session/attempt, order, products by ID, variants by ID, reservation rows.
- POS: POS owner/key advisory lock, number prefix, new order. Cash finalization
  then locks order/products/variants/reservations; card setup creates its new
  checkout session and attempt before reserving inventory.

The number lock stays held through the entire outer transaction, including
reservation/finalization. Creation does not lock existing session/attempt/charge
rows before assigning a number. Newly created rows cannot be locked by another
transaction until commit. Existing payment flows keep their
session → attempt → charge → order → product/variant order: updates to persisted
orders never acquire the number lock. No product-lock holder creates an order
or requests the number lock, so the added lock does not create a reverse edge.
Future creation paths must keep number assignment before inventory locks.

On current main, `/api/v1/admin/orders` supports list/show/update, with no create
route. Its private `build_order` helper is unused. Staff checkout uses the same
checkout creation service; compatibility `POST /api/v1/orders` completes an
existing session without creating or renumbering an order.

## Collision defense and scope

The unique index remains the final constraint for explicit/imported numbers or
writers bypassing model callbacks. Only a PostgreSQL unique violation naming
`index_orders_on_order_number` maps to HTTP 409. Handling occurs after the
request's transaction/savepoints unwind, so no partial order, checkout decision,
attempt, reservation or stock change remains. Other unique violations keep
their existing error handling. POS/checkout clients retain the idempotency key on 409
and can retry the same request.

This deliberately uses the requested 409 fallback instead of automatically
replaying payment transactions, callbacks or provider operations. No payment,
idempotency, reservation or finalization logic changes. No migration, counter
backfill, renumbering, or production data update is needed.

## Regression coverage

`order_number_concurrency_spec` creates 24 orders concurrently for each prefix,
checks contiguous unique numbers, observes a waiting PostgreSQL advisory lock
until outer commit/rollback, and checks that a different prefix can proceed.
`order_number_spec` covers Guam midnight, numeric suffixes, prevalidation/cache,
and preserved numbers. Request specs cover cash/card POS, guest/staff checkout,
compatibility completion, real forced unique violations, rollback and retry.
Use a dedicated disposable PostgreSQL database ending in `_test`; the race
group refuses the shared development/test databases.
