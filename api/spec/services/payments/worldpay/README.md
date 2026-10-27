# Phase4a response parser interface

These are small, scrubbed representative fixtures for application simulation.
They are not vendor schemas or certification evidence. No parser performs I/O,
binds a transaction to an application attempt, or authorizes fulfillment. The
caller must match immutable identity, raw ID, reference and requested cents.

```ruby
parser = Payments::Worldpay::ExpressParser # or Payments::Worldpay::TriPosParser
wire = parser.fixture(raw_id: "sim_transaction_1", amount_cents: 2305,
                      reference_number: "12345", status: :partial, code: nil)
result = parser.call(wire)
# { status: "partial", raw_id: "sim_transaction_1", requested_cents: 2305,
#   approved_cents: 1152, captured_cents: 1152, currency: "USD",
#   reference_number: "12345", metadata: { ..., compensation_required: true } }
```

`call` accepts an XML/JSON **String**, returns symbol keys and a string status:
`captured`, `collecting`, `failed`, `cancelled`, `unknown`, or `partial`.
Malformed, ambiguous or incomplete approval data returns `unknown`, nil financial
fields and a fixed `metadata[:parse_error]`; raw bodies and exception messages
are not retained. A structurally valid unknown outcome can retain reported money;
only a validated `captured` status represents a full capture. Unknown outcomes
require recovery. Metadata includes raw/normalized Express codes, separate host
code, approval number, raw AVS/CVV codes, `fraud_failed`,
`compensation_required`, operation, and unknown field names/paths without values.
AVS/CVV `N`, `FAIL`, `FAILED`, and `NO_MATCH` are representative failure presets;
the assigned fraud policy must be reconciled before production use. Fraud failure
keeps the financial result and requires compensation when money was approved.
`compensation_required: false` on an unusable response does not prove no charge.

Fixture options shared by both classes:

- Required: `raw_id:`, positive integer `amount_cents:`, `reference_number:`, `status:`.
  References are preserved verbatim; pass the attempt ID as a string.
- Optional: `code: nil`, `approved_cents: nil`, `captured_cents: nil`,
  `currency: "USD"`, `approval_number: "SIM-APPROVED"`, `host_code: nil`,
  `avs_result: nil`, `cvv_result: nil`, `operation:`.
- Default codes: captured/collecting/cancelled `0`, failed `20`, partial `5`,
  unknown `1001`. Explicit codes and amounts allow contradictory test fixtures.
- Requested cents always equal `amount_cents`. Captured defaults to full approval;
  partial defaults to integer half approval and capture. Other statuses default
  to zero approved/captured. Approval numbers are emitted only for positive approval.
- Express operation defaults to `CreditCardSale`; supported alternatives:
  `CreditCardAuthorization`, `CreditCardAuthorizationCompletion`,
  `TransactionSetup`, `TransactionQuery`.
- triPOS operation defaults to `sale`; alternatives: `authorization`,
  `completion`, `setup`, `query`. Setup/query success never yields captured.

The XML fixture uses `<METHODResponse><Response>` with direct processor code
fields and one `<Transaction>` containing identity, amounts, USD currency,
reference, explicit transaction status and approval number. The JSON fixture
uses one object with camelCase counterparts, explicit approval/partial/cancel
booleans, and `_errors: []`. JSON amounts are exact numeric decimal tokens;
strings containing valid decimal amounts are also accepted. Neither shape claims
to cover reporting rows, refunds, reversals or the full vendor response catalog.

Input limits: 65,536 bytes, 16 nesting levels, 100 rows/children per container,
2,048 nodes/values, 256-byte scalar identity/code fields and names. DTDs/entities,
mixed XML namespaces, duplicate fields/JSON keys, conflicting flags and JSON
errors are rejected. Nokogiri uses strict parsing and `NONET`, without entity
substitution, DTD loading or huge mode. JSON uses the locked gem's
`allow_duplicate_key: false`, bounded nesting, disabled additions and preserved
decimal lexemes. Unknown field values are discarded.

`Money.parse` converts decimal dollars to integer USD cents; `Money.format`
converts cents to two decimal places. Both reject floats, negative values,
scientific notation, excess fractional digits and values above `MAX_CENTS`
(9,999,999,999). Zero requires `allow_zero: true`.

Run the focused suite from `api` with Ruby 3.3.4:

```sh
bundle exec rspec spec/services/payments/worldpay
bundle exec rubocop app/services/payments/worldpay spec/services/payments/worldpay
```

Tests require `spec_helper` and these service files directly. They do not load
Rails, access a database, start a server, or contact a payment network.
