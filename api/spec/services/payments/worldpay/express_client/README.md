# Express backend contracts

This slice adds six standalone backend ports at base `14209ab`. It uses only
repository contracts: `docs/WORLDPAY-IMPLEMENTATION-SPEC.md` sections 1, 3, 6 and 7,
the existing payment identity/result/setup/reconciliation/refund services, and
the existing `Money`. The application sells server-priced orders online and at
POS. A collection setup or successful report request must never fund an order.
The parent owns provider integration and the existing durable operation ledger.

These are build-ready application ports, not a certified Worldpay adapter.
The local specification supplies endpoint/root/credential facts but does not
include the current XSDs, full response layouts, pagination element names, or
merchant terminal assignments. Required injected wire contracts make those gaps
explicit. The synthetic fixtures use `urn:local:*` namespaces and illustrative
paths; **never copy them into a merchant configuration**.

## Interface

- `Configuration.new(identity:, terminal_profile:, namespaces:, return_origins:,
  env: ENV, credentials: nil, premium_origins: [], token_scheme: nil)` validates
  the original Worldpay/USD sandbox or production identity and fixed
  `worldpay_default` reference. `credentials:` is a unit-port injection; otherwise
  it reads only the six `WORLDPAY_EXPRESS_{ACCOUNT_ID,ACCOUNT_TOKEN,ACCEPTOR_ID,
  APPLICATION_ID,APPLICATION_NAME,APPLICATION_VERSION}` names in spec section 7.
  AccountID must match `identity.external_account_id`. No legacy secret discovery.
- `XmlBuilder.new(configuration:, contract:).build(method:, fields: {},
  amount_cents: nil, idempotency_key: nil)` returns frozen, escaped XML of at most
  65,536 bytes. Every Transaction-interface method requires a direct-root GUID
  `IdempotencyKey`; Reporting and Services reject that key. This conservative
  local requirement does not establish vendor support for every method.
- `ExpressClient.new(configuration:, transport:, wire_contract:,
  setup_contract: nil, report_contract: nil, pagination_request: nil,
  observation_contracts: {})` requires a callable transport. No default transport
  is constructed. Transport signature: `call(interface:, body:) -> XML String`.
- Financial methods `credit_card_sale`, `credit_card_authorization`,
  `credit_card_authorization_completion`, `credit_card_return` take `fields:`,
  positive integer `amount_cents:`, and `idempotency_key:`. `credit_card_void`,
  `credit_card_reversal`, `batch_totals_query`, `batch_close` take `fields:`,
  `idempotency_key:`, and optional `amount_cents:`. Method roots and interface
  routes are fixed allowlists in `XmlBuilder`.
- All five `payment_account_*` methods (create, create_with_trans_id, query,
  update, delete) take `fields:`, `token_scheme:`, `consent:`. The scheme must
  match the explicitly selected `pass` or `omni_token`, and consent must be true.
  These are Services seams, without guessed scheme/collection field mappings.
  Consent must be checked against a durable scoped consent record by the parent;
  a boolean argument alone is not that record. No saved-card UI is added.
- `transaction_setup(fields:, amount_cents:, idempotency_key:, presentation:)`
  returns `HppSetup`; presentation is `legacy` or `premium`. `#status` is `ready`
  only for structurally valid successful setup. `#setup_id` and `#hosted_url` are
  separate. `#validation_code` is server-only; `#to_h` and `#inspect` omit it.
  `#valid_return_code?` checks a return hint without authorizing payment.
- `transaction_query_pagination(fields:, page_number:, page_size: 1000)` returns
  a report observation. `query_all(fields:, page_size: 1000, max_pages: 1000,
  max_rows: 100000)` collects pages, deduplicates by immutable provider/account/
  environment and transaction ID, and returns `complete`, `rows`, `pages_read`.
  Changing counts, missing IDs, differing observations for overlapping IDs,
  malformed later pages, missing totals and limits prevent a complete checkpoint.
  A parent may review a changed overlapping observation and rerun; this port
  never silently chooses one version. Only persist a checkpoint after a complete
  result and durable processing of every row. Use overlapping windows in the
  parent scheduler with the consultant-confirmed timezone.
- `ExpressTransport.new(configuration:, open_timeout: 5, read_timeout: 10,
  write_timeout: 10, total_timeout: 30)` is the opt-in Net::HTTP implementation.
  Timeouts must be finite, positive and at most 30 seconds. It uses verified TLS
  (minimum TLS 1.2), exact environment endpoint hosts, no proxy discovery, no
  redirect/retry, identity encoding and a 64 KiB response bound. HTTP errors,
  truncation/size failures and timeouts are unknown financial outcomes.
  **Its `#call` has not been executed in this task, including tests.**

## Supplying contracts

The caller supplies server-owned, reviewed data, never browser parameters:

```ruby
wire_contract = {
  "CreditCardSale" => {
    fields: approved_ordered_section_and_field_allowlist,
    required_paths: approved_required_field_paths,
    required_profile_paths: approved_required_terminal_indicator_paths,
    amount_path: approved_amount_path
  },
  # Include an explicit layout for each other enabled method.
  "TransactionSetup" => {
    fields: approved_setup_field_allowlist,
    required_paths: approved_setup_required_paths,
    required_profile_paths: approved_required_terminal_indicator_paths,
    amount_path: approved_setup_amount_path,
    return_url_path: approved_return_url_path
  }
}
```

Fields are two-level string-keyed hashes. Supported sections are `Terminal`,
`Transaction`, `TransactionSetup`, `PaymentAccount`, `Parameters`, `Batch`.
The explicit ordered allowlist controls output order; scalar values must be
strings. Credentials and Application are generated independently. Raw card
sections/fields, arbitrary XML, and opaque browser-handle fields are rejected.
Money is inserted only via existing `Money.format`; client amount methods do not
accept floats. No caller may override the amount, configured return URL, or
approved profile fields with different values.

`namespaces` supplies exact approved namespace strings keyed by `:transaction`,
`:reporting`, `:services`. No namespace is derived from an endpoint or invented
from memory. `terminal_profile` has `approved: true`, `key:` matching
`WORLDPAY_TERMINAL_PROFILE_KEY`, and `fields:` with explicit approved Terminal and
Transaction values. The wire contract must require every assigned indicator,
MarketCode, partial-approval policy, terminal/lane and other mandatory fields.
No terminal indicator or policy defaults are supplied. Setup method, Embedded,
CVVRequired, AutoReturn, billing policy, and Premium HPType=1 must be deliberately
specified and required in the approved layout where applicable.

`setup_contract` declares `setup_id_path`, `validation_code_path`, and optionally
`hosted_url_path`, relative to the single Response. Legacy requires a GUID and
constructs the exact configured environment hostedpayments base plus
TransactionSetupID. The ValidationCode is retained separately, never invented or
included in that URL. Premium accepts only a complete HTTPS URL received in the
configured response path and listed in `premium_origins`; it never changes hosts.
If Premium places the URL in TransactionSetupID, `setup_id` remains nil. A separate
GUID is kept only when a distinct URL path was explicitly configured. The parent
must supply Premium origins approved for this identity's environment.

`report_contract` declares `reporting_data_path`, `rows_path`, `fields`,
`page_path`, `pages_path`, and optional `total_path`. Paths are arrays of element
names relative to Response, except `rows_path` relative to ReportingData (or its
embedded XML root). `fields` maps only `raw_id`, `reference_number`,
`provider_status`, `amount`, `currency` to row-relative paths. `raw_id` is required.
`pagination_request` supplies two-level `page_number_path` and `page_size_path`.
Missing page/count mappings never fall back to an invented empty-page heuristic.
Page counts are 1..1000, page rows at most 1000, aggregate rows at most 100000;
zero totals use an explicit empty page. Confirm actual zero-page semantics before
using a different vendor contract.

`observation_contracts` maps method names to the same five field/path types,
relative to Response. No mapping is inferred from the representative parser.
All financial and report observations have `status: "unknown"`, nil authoritative
money/currency fields, and `metadata[:contract_verified] == false`. Reported
amount/currency/status remain in metadata; decimal USD amounts can be recorded
exactly as `reported_amount_cents`. Unknown field **paths** are retained, values
are discarded. Known credential echoes are rejected. There is no raw-body/result
logging. Configuration, builder, client, transport and setup inspection redact
internal data; callers must also avoid logging XML, credential accessors, full
hosted URLs, ValidationCode and retained tokens.

XML readers use strict Nokogiri NONET parsing with no DTD/entity expansion,
recovery or huge mode. DTD/entity declarations, mixed namespaces, duplicate known
fields/containers, invalid scalars, unexpected row layouts and malformed XML fail
closed. Outer and embedded report XML are bounded to 64 KiB, depth 16, 4096 reader
nodes, 1000 children, and 256-byte observation scalars. No query success code,
setup result, HTTP status, callback or unknown vendor state proves capture.

## Verification and parent handoff

Agent-executed affected-contract QA uses synthetic identities, explicit fixture
profiles, URN namespaces and injected callable transports. No Rails boot, DB,
server, browser, device, real network transport, credential loading, external
message or payment was used. The new specs block Net::HTTP construction. The
transport specs check construction/timeout validation only. Existing parser/money
specs run alongside these tests without changes. No task-owned runtime resources
were started.

Verified on Ruby 3.3.4: the focused Worldpay suite passed 249 examples with zero
failures; RuboCop inspected 20 Worldpay service/spec files with no offenses;
Brakeman reported zero security warnings and zero errors, with one ignored
warning. These checks do not establish vendor schema correctness.

Run from `api` with Ruby 3.3.4 and the installed bundle:

```sh
bundle exec rspec spec/services/payments/worldpay
bundle exec rubocop app/services/payments/worldpay spec/services/payments/worldpay
```

Acceptance cases: exact cents and escaped XML; root/interface/idempotency
allowlists; immutable identity/account/deployment isolation; approved profile and
return/host allowlists; service scheme/consent gates; no handle/PAN mapping; legacy
and Premium setup separation; malformed/unsafe/ambiguous XML; reported unknown
statuses and safe unknown fields; empty/nested/embedded reports; complete pages,
overlap deduplication and conflict detection; 1000-page and aggregate bounds;
sanitized transport exceptions and secret echoes. UI, durable DB journeys,
Net::HTTP execution, full application CI and processor certification are not run
in this implementation slice; the parent owns integration acceptance.

Before dispatch integration, the parent must persist/freeze each operation's
identity, GUID and exact request payload/digest in the existing ledger. Reusing a
key with a changed body is unsafe even when the processor returns IdempotentMatch.
This stateless port cannot enforce that across processes. It never retries,
selects a reversal/void sequence, releases refund reservations, writes payment
state, swaps providers, or authorizes fulfillment. Match original account,
environment, transaction/reference, amount and operation in the parent.

External contract blockers, each requiring scrubbed assigned-contract fixtures:

1. Current enabled XSD namespace strings, section/field order, required fields,
   exact setup/financial/Services response layouts and pagination/count semantics.
   Replace the illustrative injected contracts and add vendor-specific financial
   normalization before any observation may become a paid/refunded result.
2. Approved eCommerce terminal/lane/market/indicator values and partial/fraud
   policies, production processing URLs, Premium merchant enablement, origins,
   HPType discrepancy and setup ValidationCode placement.
3. Express Hosted Fields product/version/SDK, token-only versus hosted execution,
   callback/handle redemption fields, lifetime and binding. No SDK or handle-to-PAN
   mapping has been invented. Confirm PASS versus OmniToken, consent scope and
   stored-credential indicators before enabling token collection/use.
4. Supported idempotent method list/retention and operation-specific timeout,
   duplicate, no-PAN System/Full reversal, linked Return/void and completion
   recovery rules. Unknown observations retain financial reservations.
5. Reporting timezone/window semantics, lag and batch/funding/fee contracts.
   A complete report is neither proof of settlement nor a daily bank deposit.

The parent integrates after the simulator dependency merges, runs the combined
acceptance/review gate, and owns push/PR/merge. This worker has no such rights.
