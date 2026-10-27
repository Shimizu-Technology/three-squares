# Native triPOS client/parser slice — parent handoff

This is a standalone, offline Phase4a port based on the published triPOS Cloud
5.0.4 schemas. It is **not certified**, enabled, wired into a provider, or a
replacement for the existing representative `TriPosParser`. Every parsed result
has `authorizing: false`, `financial_outcome: :unknown`, and `complete: false`.
The parent's assigned-contract gate remains mandatory. Nothing here writes money
or application state.

## Scope and acceptance

Verified base: `7fb2811508fc17377756b515c4863c2ca98b6800`, 2026-10-27.
The client was developed in an isolated worktree; integration and assigned-contract
validation remain separate acceptance requirements.

Repository context: the root README describes restaurant ordering/POS;
`docs/WORLDPAY-IMPLEMENTATION-SPEC.md` sections 1.5 and 2.2 require server-side
triPOS credentials, original account/environment/lane binding and query-based
recovery. This slice supports the parent's POS collection and recovery work,
without establishing those application journeys itself.

Acceptance is standalone request construction, strict bounded native JSON parsing,
correlation checks, credential redaction, and a provably disabled built-in network
path. Only the four new service files and this new spec directory are owned.
No existing foundation, parser, provider, controller, UI or environment files were
modified. No Rails boot, DB operation, runtime server, provider endpoint call,
delegation, push, PR or merge was performed. All test values are synthetic.

## Exact API

Namespace: `Payments::Worldpay`. Require `tri_pos_client.rb` directly; it loads
only Ruby libraries and the existing pure `Money` module. JSON >= 2.18.1 is
required; older JSON libraries fail closed because duplicate-key rejection may
otherwise be silently ignored. The repository pins 2.18.1.

`TriPosConfiguration.new(identity:, env: ENV)` requires an identity exposing
`id`, `provider`, `environment`, `external_account_id`, `external_acceptor_id`,
and `credential_reference`. The provider must be `worldpay`, environment must be
`sandbox` or `production`, and the only credential reference is `worldpay_default`.
It snapshots the six `WORLDPAY_EXPRESS_*` credential/application fields, and checks
exact account AND acceptor equality against the original identity. It does not
discover credentials through arbitrary references.

`WORLDPAY_MODE` must match the identity; `APP_DEPLOYMENT_ENV` must be explicit.
Sandbox allows development/test/staging, production requires production deployment
and `APP_MODE=production`; `PAYMENTS_SIMULATION_ENABLED=true` is rejected.
`endpoint` is a frozen origin String: sandbox `https://triposcert.vantiv.com`,
production `https://tripos.vantiv.com`. Optional `WORLDPAY_TRIPOS_ORIGIN` may only
equal that origin, with an optional trailing slash. Aliases, userinfo, ports,
paths, query strings and fragments cannot override it.

`headers(request_id:, lane_api: false)` validates the UUID and returns immutable
JSON Accept/Content-Type headers, all three Express credentials, all three
application headers, and `tp-request-id`. Transaction requests additionally get
`tp-authorization: Version=2.0`; lane requests omit it. The client generates a
**fresh UUID on every dispatch**, including queries and lane requests. A request
ID is correlation, not an idempotency key or permission to retry.

`TriPosClient.new(configuration:, transport:)` requires an explicit callable.
Transport contract:

```ruby
call(method:, path:, body:, headers:) # => { status: Integer, headers: Hash, body: String }
```

`method` is a lowercase Symbol; `body` is a frozen JSON String or nil for GET/DELETE.
There is one call and zero client retries. The published successful HTTP status
is exactly 200, including lane creation. Transaction calls require one exact,
case-insensitively named `tp-request-id` response header matching the generated
UUID. Lane response echo is unverified in the published assets, so it is not
required and `request_id_echo_verified` is false there. Response errors and
exceptions produce sanitized unknown facts, without provider messages or causes.

| Method | Wire request | Return |
| --- | --- | --- |
| `sale(lane_id:, amount_cents:, reference:, configuration: {})` | POST `/api/v1/sale`; `transactionAmount` is an exact decimal **String** | Parser facts |
| `query(reference:, terminal_id:, begin_time:, end_time:, transaction_id: nil)` | POST `/api/v1/transactionQuery` | Parser facts |
| `pre_read_cancel(lane_id:)` | POST `/api/v1/cancel` | Nonfinancial error-envelope observations only |
| `pair(lane_id:, terminal_id:, activation_code:, description: nil)` | POST `/cloudapi/v1/lanes` | Lane facts, no invented feature flags |
| `lane(lane_id:)` | GET `/cloudapi/v1/lanes/{id}` | Lane facts |
| `lane_status(lane_id:)` | GET `/cloudapi/v1/lanes/{id}/connectionstatus` | Cached facts, maximum documented staleness 75 seconds |
| `update_lane(lane_id:, description:)` | PATCH `/cloudapi/v1/lanes/{id}` | **Blocked plan**, never dispatched |
| `delete_lane(lane_id:)` | DELETE `/cloudapi/v1/lanes/{id}` | Transport observations only; no deletion proof inferred |

Query timestamps are required Strings in `YYYY-MM-DD HH:MM:SS` format, including
when a transaction ID is supplied. Invalid calendar values and reversed windows
are rejected. The parent must supply the assigned reporting timezone and window;
the client performs no timezone conversion.

Sale configuration accepts an explicitly typed subset of the published fields:
booleans `allowDebit`, `allowPartialApprovals`, `checkForDuplicateTransactions`;
strings `marketCode`, `promptForSignature`, `userInputTimeout`, `isGiftSupported`,
`isManualEntryAllowed`, `confirmOriginalAmount`,
`processUSMaestroDebitOffLinePinCvmAsDebit`; integer `cardReadRetries` (local bound
0–10); and 1–8 `allowedPaymentTypes` strings. Unknown/nested fields and coercions
are rejected. No policy values, capability values or flag mappings are chosen.
Parent policy must validate every supplied value before use.

Build-only mutation methods return immutable `TriPosClient::RequestPlan` objects
with `operation`, `method`, `path`, `body`, `blockers`, `dispatchable? == false`,
`authorizing? == false`, and `financial_outcome == :unknown`:

```ruby
refund(lane_id:, amount_cents:, reference:)
linked_return(lane_id:, transaction_id:, payment_type:, amount_cents:, reference:)
void(lane_id:, transaction_id:, reference:)
reversal(lane_id:, transaction_id:, payment_type:, amount_cents:, reference:, type:)
```

Refund uses `/api/v1/refund` with a decimal String. Linked return uses
`/api/v1/return/{transactionId}/{paymentType}` with an exact numeric JSON lexeme.
Reversal uses `/api/v1/reversal/{transactionId}/{paymentType}` with an exact numeric
lexeme and explicitly supplied body `type`. Void uses `/api/v1/void/{transactionId}`
and has **no amount field** in the published schema. Numeric money generation
reuses `Money::DecimalLexeme`; it never goes through Float. All require an assigned
mutation contract before any separately implemented dispatch. No payment-type,
reversal-type, success or safe-retry mapping is asserted.

`TriPosTransport.new(configuration:)` is an intentionally disabled seam.
Its `call` always raises `Disabled`; there is no opt-in flag or HTTP implementation.
Any future network implementation needs separate review, an explicit enable flag
and valid bound configuration, verified TLS/hostname/current CA, strict streamed
size and connect/read/write/total-time limits, no proxy discovery, no redirects,
no retries, and preservation of the response request-ID header. It was not executed
against a provider; tests exercise only its disabled exception.

## Parser facts and limits

`TriPosResponseParser.call(wire, operation:)` accepts only a JSON String and symbol
operation `:sale`, `:query`, `:pre_read_cancel`, `:pair`, `:lane`, `:lane_status`,
`:update_lane`, or `:delete_lane`. It returns a deeply frozen Hash with `operation`,
`authorizing`, `financial_outcome`, `financial_operation`, `observations`, `rows`,
`malformed_rows`, `complete`, `ambiguity_hints`, and `schema_gaps`. Successful client
transport validation adds `http_status`, `request_id`, `request_id_echo_verified`.
There is no `Outcome`/capture normalization and no `success` field.

Sale exposes native `_processor` codes separately, typed flags, transaction and
terminal IDs, currency and exact approved/subtotal/total cents. It does **not**
infer requested/captured money or statuses. Error messages, raw requests/responses,
logs and links are discarded; error-envelope booleans/counts and contradictions
are observations. Unknown `XX` codes remain unknown strings.

Query exposes native `reportingData` paths, including uppercase `HostResponseCode`
and both the published `AccountId.Value` wrapper and lowercase `accountId`.
Conflicts/missing context flag a malformed row. Every malformed row retains its
index and a possible-financial-result hint; malformed money cannot disappear
into an apparently empty/no-charge report. Multiple/duplicate rows and the
1,000-row ceiling receive ambiguity hints. No report proves completeness, even
when empty or below that ceiling. No request fields are copied into a response to
fill missing evidence.

Bounds are 2 MiB wire, depth 16, 65,000 nodes, 1,000 items per object/array, 128-byte
keys, 4,096-byte strings and 32-byte numeric tokens. Numeric tokens are checked
before JSON allocates integers, including rejecting integer `-0` before its sign
can be lost. Observation text is further limited to 256 bytes;
controls, track delimiters and PAN-like sequences of 12+ digits are rejected,
including in purported identifiers. That conservative local rule may require
assigned-contract reconciliation for long numeric merchant/transaction IDs.
Money must match the schema's JSON numeric type and the existing exact-cent
grammar/bound; exponent notation, extra fractional digits, negatives, strings in
numeric response fields, Float values, and overflow fail closed. Duplicate keys,
including escaped-equivalent keys, are rejected before observation extraction.

Lane metadata has a narrow allowlist; contactless/Quick Chip flags are deliberately
not mapped. Receipt facts allow card logo, entry mode, approval number, and only
the final four digits of `accountNumber`/`cardNumberMasked`. Full PAN, tracks,
expiry, cardholder name, signatures, tokens, raw EMV and processor blobs do not
survive. Objects with retained state have redacted `inspect`/`to_s`; no logging is
implemented. Facts/request bodies remain sensitive and should not be logged by
the parent.

`TriPosResponseParser.fixture(operation: :sale, **overrides)` builds synthetic
wire data and passes it through the real parser. It returns parsed facts, not a
wire String and not preauthorized normalization. Specs also use synthetic native
query/lane bodies. No captured/certified fixtures are claimed.

## Blockers for parent integration

- The assigned contract, approved code/currency/context policies, original
  identity/lane/reference correlation, capability checks, serialization,
  recovery and existing foundation normalization remain parent responsibilities.
- SaleResponse does **not** define `referenceNumber`, `capturedAmount`,
  `transactionStatus`, or `transactionType`. `_processor.processorReferenceNumber`
  is deprecated and is not substituted for a response reference.
- ReportingDataItemDto has **no currency** or captured amount, and the query
  endpoint caps reportingData at 1,000 without pagination/completeness metadata.
- Lane 5.0.4 `LaneUpdateConfigurationRequest` does **not** define `description`.
  The requested description PATCH is retained only as a blocked plan until
  Worldpay supplies a compatible assigned contract. Older linked KB pages were
  unavailable during GET documentation research; no undocumented write is sent.
- No verified lane response-echo contract, live readiness proof, active-sale
  cancellation, no-PAN/no-ID system reversal, or safe financial retry is supplied.
- Real transport, application integration, DB-backed behavior, device QA and
  certification are not implemented/tested by this bounded task.

## Primary provenance

Read-only documentation GETs on 2026-10-27; **no processing endpoint calls**:

- [Transaction API 5.0.4 YAML](https://docs.worldpay.com/assets/api-specs/tripos-transaction/api-specification/triPOS%20Transaction%20API-5.0.4.yaml),
  SHA-256 `9cf8d745a99abc956cb37c9a071346503c739acd5731fc71f87e307b78c35424`.
  Paths: sale, transactionQuery, cancel, refund, return, reversal, void.
  Definitions: SaleResponse, Processor, TransactionQueryResponse,
  ReportingDataItemDto, CancelTransactionResponse, corresponding POST requests.
- [Lane API 5.0.4 YAML](https://docs.worldpay.com/assets/api-specs/tripos-lane/api-specification/triPOS%20Lane%20API-5.0.4.yaml),
  SHA-256 `ef13ef7fa55765687ecd6e85a9c9fc73cd4ae9caaef820e963d69c1b266918c4`.
  `basePath: /cloudapi`; paths `/v1/lanes`, `/v1/lanes/{laneId}`,
  `/v1/lanes/{laneId}/connectionstatus`; LaneRequest, LaneDto,
  LaneUpdateConfigurationRequest and ConnectionStatusDto. The connection-status
  operation documents up to 75 seconds of delay and an aggregate health-check
  interval of two minutes; this client schedules no polling.
- [Cloud API overview](https://docs.worldpay.com/apis/tripos/tripos-cloud/api-overview),
  also captured in repository implementation-spec section 1.5 for the fixed
  certification/production origins and Cloud headers. No alias fallback or Direct
  HMAC authentication is introduced.

The public YAMLs were inspected outside the repository; they are not vendored.
Only their paths, schema facts and synthetic values inform this slice.

## Verification and lifecycle

From the repository root, without Rails, Bundler boot, or DB setup:

```sh
ruby -e 'gem "json", "2.18.1"; load Gem.bin_path("rspec-core", "rspec")' -- --options /dev/null api/spec/services/payments/worldpay/tri_pos_client --format progress
ruby -e 'gem "json", "3.1.0"; load Gem.bin_path("rspec-core", "rspec")' -- --options /dev/null api/spec/services/payments/worldpay/tri_pos_client --format progress
```

Both runs: **65 examples, 0 failures**, Ruby 3.3.4 / RSpec 3.13.6. Coverage includes
native sale/query parsing, exact money, duplicate/escaped keys, all bounds,
malformed/ambiguous rows, saturation, secret/card-data noise, immutable identity
binding, endpoints/headers/new UUIDs, strict echoed request IDs, HTTP failures,
path injection, blocked mutations and no default network. Network constructors
are stubbed to fail. The only transport used for requests is in-memory.

Rubocop 1.91.0: owned Ruby paths pass. `git diff --check`: pass.
Brakeman 8.1.0 scanned `api` without booting Rails or accessing a DB: **0 warnings,
0 scan errors**. The ordinary Bundler entrypoint on this machine could not locate
Bundler 2.7.2, so standalone checks used the installed Ruby 3.3.4 executables;
no dependencies or lockfiles were changed. Full application gates and real UI/
device QA are not run because DB/runtime/provider activity is outside this task.

Lifecycle session `01a17d40-b168-77f3-a5b2-25633dc656f3`: no development resources
started or claimed; no resources are handed off. Preserve this clean, unpushed
worktree/branch for the parent to review and integrate. The parent should first
review the blockers above, then adapt these facts behind its existing mandatory
assigned-contract/policy gate; do not wire observations directly to money state.
