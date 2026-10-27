# Native triPOS wire contract

This port uses synthetic fixtures derived from published triPOS 5.0.4 schemas. It is not certification evidence. Parsing returns nonauthorizing facts; only the provider's frozen intent/context validation and the common finalizer can change payment or stock state.

## Interfaces

`Payments::Worldpay::TriPosConfiguration.new(identity:, env: ENV)` accepts a Worldpay sandbox/production identity with credential reference `worldpay_default`. It binds both the original AccountID and AcceptorID. Deployment and processor modes must agree. Certification and production origins are fixed; aliases, alternate hosts, ports and paths are rejected. Credentials remain server-side and inspect output is redacted.

`TriPosClient.new(configuration:, transport:)` takes an injected callable:

```ruby
call(method:, path:, body:, headers:) # => {status: Integer, headers: Hash, body: String}
```

Bodies are JSON strings or nil. Each HTTP call gets a fresh request UUID. Transaction responses require the echoed request UUID; a request UUID is correlation, not financial idempotency. There are no retries or redirects. Lane response echo is not established by the published schema and is not fabricated. Success HTTP status is exactly 200. Exceptions and communication failures become sanitized unknown observations.

| Method | Published request | Evidence |
| --- | --- | --- |
| `sale(lane_id:, amount_cents:, reference:, configuration: {})` | POST `/api/v1/sale`, decimal-string amount | Native sale observations |
| `query(reference:, terminal_id:, begin_time:, end_time:, transaction_id: nil)` | POST `/api/v1/transactionQuery` | Reporting rows, no inferred completeness/currency |
| `pre_read_cancel(lane_id:)` | POST `/api/v1/cancel` | Pre-read envelope only; no active-sale cancellation proof |
| `pair(lane_id:, terminal_id:, activation_code:, description: nil)` | POST `/cloudapi/v1/lanes` | Exact lane/device facts |
| `lane(lane_id:)` | GET `/cloudapi/v1/lanes/{id}` | Lane/device facts |
| `lane_status(lane_id:)` | GET `/cloudapi/v1/lanes/{id}/connectionstatus` | Cached connection status, potentially 75 seconds old |
| `delete_lane(lane_id:)` | DELETE `/cloudapi/v1/lanes/{id}` | Transport observations; empty success is not deletion proof |
| `update_lane(lane_id:, description:)` | PATCH plan | Blocked: description absent from the published update schema |

`refund`, `linked_return`, `void` and `reversal` return immutable **blocked RequestPlan objects**, never dispatch. Refund uses a decimal-string amount; linked return and known-ID reversal use exact numeric JSON amounts. Void has no request amount. No payment-type, reversal-type, success, safe-retry, ordinary-sale cancel or no-ID recovery contract is invented.

`TriPosResponseParser.call(wire, operation:)` returns deeply frozen `operation`, `authorizing: false`, `financial_outcome: :unknown`, `observations`, `rows`, `malformed_rows`, `complete: false`, `ambiguity_hints` and `schema_gaps`. `.fixture(...)` generates synthetic wire data through this same parser. Immediate sale and query simulation use these native shapes.

Bounds: 2 MiB wire, depth16, 65,000 nodes, 1,000 items per container, 128-byte keys, 4,096-byte strings and 32-byte numeric tokens. Exact-cent parsing rejects exponents, negatives, overflow, extra fractions, numeric strings in numeric response fields and Float coercion. Duplicate keys (including escaped equivalents) fail closed; JSON >=2.18.1 is required. Malformed report positions remain financial-ambiguity evidence. Opaque identifiers preserve long numeric strings; descriptive/card data cannot carry a full PAN. Receipt projection retains last four only and an explicit safe EMV tag allowlist; PAN/track tags, signature, raw processor data and logs are excluded.

`TriPosTransport.new(configuration:, enabled: false, total_timeout: 90)` defaults to disabled. The opt-in implementation verifies TLS/hostname, disables environment proxies, retries and redirects, streams a bounded response, and bounds connect/read/write/total time. `TriPosRuntime` requires an explicitly approved frozen assigned profile plus `WORLDPAY_TRIPOS_TRANSPORT_ENABLED=true`. Simulation never uses this HTTP transport. No processing endpoint was called during implementation.

## Application policy and unresolved contracts

The provider binds the frozen account/acceptor/lane/terminal/reference/amount and assigned response policy. A durable dispatch claim precedes sale I/O. Duplicate jobs and recovery query the original operation; they never send another sale. Unknown money retains lane and inventory claims. Ambiguous financial observations persist quarantine and cannot be cleared by a later empty or single-approval query. Receipt facts never authorize a payment.

The assigned Cloud release/auth/production host, response status and USD query semantics, query completeness/timezone/lag, financial mutation/recovery contracts, device/PIN capabilities, receipts and certification still need approval. Sale responses omit reference/requested/captured fields; queries omit currency and pagination/completeness. Application integration does not remove those published-schema gaps. Hosted Fields, Premium and no-PAN/no-ID reversal remain separate external blockers. This is not a credentials-only readiness claim.

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

