# Three Squares Worldpay implementation specification

Prepared 2026-10-27. Research and design only. Baseline: `e5cfcb8` from `wip/tsq-restart-preserve-2026-10-27`, inspected at detached HEAD in `/Users/leonshimizu/.t3/worktrees/three-squares/t3-d5a953e7`. No application implementation or certification is represented by this document.

## 0. Decision, context, and acceptance

Build the complete application payment lifecycle before credentials arrive. Worldpay is the primary provider; Stripe remains a settings-selected alternative for both online and POS payments. B&G Pacific remains merchant of record and receives funds directly. Build Express online payments and triPOS Cloud card-present payments on the same provider-neutral foundation as Stripe. Provide an application simulator that exercises checkout, terminal interaction, refunds, recovery, and accounting without processor credentials.

The May 28 meeting explicitly identifies **Express API + Express Hosted Fields** for online and **triPOS Cloud** for browser-based POS. Lane/3600 was discussed; device and firmware approval remain Worldpay decisions. Hosted Payment Page is the fallback. Do not substitute Access Worldpay APIs or Authorize.net without a new decision. Do not remove Stripe.

Users and journeys: customers order online for pickup at Main/Tamuning or Donki and, where enabled, shipping; staff take walk-in orders on iPads; managers refund/cancel and manage lanes; Marie/accounting reconcile sales, batches, fees, and bank deposits. Preserve location eligibility, fulfillment rules, server pricing, inventory, order history, and existing cash behavior. No surcharge or convenience fee is planned.

Acceptance before credentials:

- All online and POS journeys below run against persistent, deterministic simulation, including failures, partial approval handling, refunds, void/reversal, unknown outcomes, and daily batches.
- A captured payment can fund only its original order. Closing a browser does not lose the order. Requests, Stripe webhooks, and reconciliation converge through one finalizer.
- Every operation uses the original payment's immutable provider/account/environment. Simulation cannot authorize real production fulfillment or change live payment/refund records.
- Provider selection changes affect new sessions only. Historical Stripe payments remain refundable after switching to Worldpay.
- Queue work survives application/worker restarts. Inventory commits once regardless of event order.
- Simulator data is visibly labeled and excluded from financial reporting and real operational integrations.
- Real adapters, serializers, parsing, recovery, and configuration validation are implemented to documented contracts. Unpublished Hosted Fields details are isolated behind one bridge and tracked as a specific external dependency, not presented as completed integration.

Acceptance after credentials: consultant-approved sandbox cases pass on the same commit with the assigned terminal; unresolved contract questions are closed; certification and production activation are recorded. Simulator success is application acceptance, not processor certification. The goal of “credentials only” is achievable for published contracts; the exact Hosted Fields bridge and account-specific timeout recovery cannot honestly be frozen without Worldpay's guide.

### Evidence and precedence

Read with this baseline: `docs/WORLDPAY-INTEGRATION-PLAN.md`, `docs/WORLDPAY-RESEARCH-NOTES-2026-05-11.md`, `docs/WORLDPAY-TECHNICAL-READINESS-PACKET-2026-05-12.md`, `docs/WORLDPAY-MEETING-BRIEF-2026-05-12.md`, `docs/BOG-MEETING-RECAP-2026-05-12.md`, `docs/WORLDPAY-MAY28-MEETING-IMPLEMENTATION-NOTES.md`, and `docs/AUTHORIZE-NET-RESEARCH-NOTES-2026-05-12.md`.

Primary meeting sources are the April 3 and May 28 transcripts at `/Users/leonshimizu/Desktop/ShimizuTechnology/Brain-Dump/work/shimizu-tech/three-squares/4) April 3, 2026 - Meeting with BOG and WorldPay.md` and `6) Meeting with BOG and WorldPay - May 28, 2026.md`. Earlier plans mix Access and Express, propose removing Stripe, and defer POS until credentials. This specification supersedes those choices. The current owner direction and May 28 product decision take precedence.

No deployed version was verified. This is an audit of the named snapshot, not an assertion about the running merchant system. The lead's reproduced findings F01–F04, F07, F08, and F17 are requirements below.

## 1. Official contracts and research findings

Sources were checked on 2026-10-27. Worldpay's public Developer Hub is JavaScript rendered. Its public page content and public Swagger assets were retrieved read-only where text browsing returned empty pages. Some older triPOS knowledge-base links fail intermittently. No credential-protected guide or merchant account was accessed.

### 1.1 Express, endpoints, and request format

Use HTTPS XML POST, not legacy SOAP. Route payment/hosted/batch methods to the Transaction interface, account-token methods to Services, and queries to Reporting. Credentials are `AccountID`, `AccountToken`, `AcceptorID`; application identity is `ApplicationID`, `ApplicationName`, `ApplicationVersion`. XML roots identify methods; responses contain `Response` with response codes and method-specific nested data. Preserve unknown fields safely and fail closed on malformed/missing approval data. See [Express XML overview](https://docs.worldpay.com/apis/express/express-xml), [classes](https://docs.worldpay.com/apis/express/express-xml/classes), and [method catalog](https://docs.worldpay.com/apis/express/express-xml/methods).

| Interface | Certification XML endpoint | Production host/base to confirm at onboarding |
| --- | --- | --- |
| Transaction | `https://certtransaction.elementexpress.com/` | `https://transaction.elementexpress.com/` |
| Reporting | `https://certreporting.elementexpress.com/` | `https://reporting.elementexpress.com/` |
| Services | `https://certservices.elementexpress.com/` | `https://services.elementexpress.com/` |

Certification endpoints are published; production bases above are derived from the official production XSD hosts. Have the consultant confirm the exact enabled processing URLs. Schemas: `express.xsd`, `expressreporting.xsd`, and `expressservices.xsd` on their corresponding hosts. See [official cert/production XSD links](https://docs.worldpay.com/apis/express/express-xml/xsd). Use DNS and verified TLS, with current CA trust; never pin processing IP addresses.

The [Express Interface Specification v3.1.7, February 2026](https://docs.worldpay.com/assets/pdf/ExpressInterfaceSpecification3.pdf), appendix “Idempotency in Express,” adds a GUID `IdempotencyKey` directly beneath the transaction method root. A repeated key/type under the same AcceptorID can return the original result with `IdempotentMatch`; a type mismatch returns 108; an invalid key returns 101. This applies to XML/REST Transaction interfaces, not Services/Reporting, and not necessarily non-payment operations. Obtain the retention window and supported-method list from Worldpay. Do not infer amount/body validation from a key match. Freeze each operation's payload locally. The same PDF also flags setup expiration after ten minutes, five declines, or one approval. Treat those as refresh/recovery boundaries, never proof that no money moved.

### 1.2 Transactions and codes

Implement adapter methods for `CreditCardSale`, `CreditCardAuthorization`, `CreditCardAuthorizationCompletion`, `CreditCardReversal`, `CreditCardReturn`, and `CreditCardVoid`. A sale is the default prepaid-order operation. Authorization/completion must be supported and certified as an explicit capability, with staff exposure controlled by the agreed scope. Linked Return requires the original transaction and has a documented 45-day limit. Void is full amount/current batch; Express describes reversal before void for sale cancellation. System reversal is specifically for missing responses/communications errors; Full reversals use a known original transaction. A System reversal can require card/token data, so Hosted Fields recovery must be confirmed without acquiring PAN. Return/completion timeout handling differs from sale timeout handling. See [Credit methods](https://docs.worldpay.com/apis/express/express-xml/methods/credit).

Normalize **Express** codes independently of host codes. In particular, Express `0` is success; host `00` is not the Express response contract. Keep original strings in audit metadata and normalize numeric codes for classification.

| Express code | Meaning | Application treatment |
| --- | --- | --- |
| 0 | Approved/success | Verify transaction state, identity, and amount; setup/query success alone is not a captured sale |
| 5 | Partial approval | Record approved amount; compensate unless split tender is explicitly enabled |
| 7 / 8 | DCC requested / non-financial card | No paid order; unsupported flow |
| 20 / 21 | Declined / expired | Definitive failure when provider confirms no approval |
| 22 / 23 | Duplicate approved / duplicate | Query and match original attempt; never grant a second order |
| 24 / 25 | Pick up / call issuer | Decline/refer according to approved staff guidance |
| 30 / 90 | Balance unavailable / undefined | No success inference |
| 101–105 | Data/account/request/authentication/authorization error | Configuration or validation failure; no blind retry |
| 108 / 120 | Idempotency mismatch / out of balance | Stop and investigate |
| 1001 / 1002 / 1009 | Communication / host / general error | Unknown financial outcome until recovered |

Source: [Express response codes](https://docs.worldpay.com/apis/express/express-xml/responses), with 8 and 108 also in the current interface PDF. AVS/CVV results are independent of authorization. An approved sale with a failed fraud-policy check needs compensation; changing its label to declined does not undo the charge.

Host duplicate checking compares card, amount, transaction category, and a limited batch window. Keep duplicate checking enabled and override/disable flags false. It is not application idempotency. An explicit manager-approved legitimate second purchase requires a new attempt and a documented duplicate-resolution path, never an automatic override. See [Duplicate checking](https://docs.worldpay.com/apis/express/features/duplicate-checking).

### 1.3 Hosted Fields and HPP: verified facts versus missing contract

**Missing:** the public Express navigation does not provide a separate, verifiable Express Hosted Fields JavaScript/tokenization contract. Do not invent a script URL, publishable key, `tokenize()` signature, or assume an Access session token works with Express. Worldpay must provide the exact product/version and identify whether its “Hosted Fields” means independent fields, a hosted payment iframe, or Hosted Payments Premium.

**Verified fallback:** legacy Express Hosted Payments uses backend `TransactionSetup`, then loads `https://certtransaction.hostedpayments.com/?TransactionSetupID=...`. It returns result hints in the `ReturnURL` query string; retain the original ValidationCode and compare it on return. Query the backend for financial truth. A setup can have several transaction results, including decline followed by approval. See [Hosted Payments](https://docs.worldpay.com/apis/express/hosted-payments).

For setup, supply server amount/reference/ticket/market/partial-approval policy, assigned terminal/lane, application/credentials, `TransactionSetupMethod`, `Embedded`, required terminal indicators, and allowlisted return URL. `CVVRequired`, `AutoReturn`, billing fields, and optional tokenization are configured deliberately. Never copy terminal indicator values from a generic example; obtain the eCommerce terminal profile. See [Hosted methods](https://docs.worldpay.com/apis/express/express-xml/methods/hosted) and [Hosted requirements](https://docs.worldpay.com/apis/express/hosted-payments/requirements).

A current official **Express Hosted Payments Premium** guide exists. It describes `HPType=1`, full redirect or JavaScript SDK iframe, and a full URL returned in `TransactionSetupID`; the example uses `payments-test.worldpay.com`. It processes the transaction in the hosted UI; it is not evidence of a token-only callback. This guide is newer than PDF fields marked future use. Worldpay must reconcile that discrepancy and confirm merchant enablement. Model setup ID and hosted URL separately; do not assume the returned value is always a GUID. See [Hosted Payments Premium](https://docs.worldpay.com/apis/express/hosted-payments-premium).

**Application bridge contract proposed here:** `mount(config, callbacks)`, `submit()`, `destroy()`, with `ready`, `validation`, `instrumentReady(opaqueHandle)`, `completed(resultHint)`, `cancelled`, and `error` events. A deployment supports either token collection (`instrumentReady`, backend submits exactly once) or hosted execution (`completed`, backend queries); it must never execute both sales. These are Three Squares events, not claimed vendor callback names. The real bridge translates the consultant's SDK. The fake component uses these identical events now.

### 1.4 Tokenization

Express supports TransForm/PASS and OmniToken. Implement `PaymentAccountCreate`, `PaymentAccountCreateWithTransID`, `PaymentAccountQuery`, `PaymentAccountUpdate`, and `PaymentAccountDelete` only for the selected enabled scheme. Tokens are scoped to merchant/account/environment and need explicit customer consent for retained card-on-file use. Do not treat a setup ID or one-time browser handle as a reusable token. Preserve network transaction identifiers and stored-credential indicators when the agreed recurring/CIT/MIT scope requires them. See [Services methods](https://docs.worldpay.com/apis/express/express-xml/methods/services), [PASS](https://docs.worldpay.com/apis/express/vas/pass), and [credential-on-file guidance](https://docs.worldpay.com/apis/express/features/credential).

Build token capability and consent records now; disable saved-card UI until the consultant confirms the exact collection method and scope. No CVV, PAN, track, PIN, or device cryptogram storage. Do not tokenize wallet transactions for future recurring use without the applicable product permission.

### 1.5 triPOS Cloud

The current [Cloud API overview](https://docs.worldpay.com/apis/tripos/tripos-cloud/api-overview) publishes:

- Certification Transaction API: `https://triposcert.vantiv.com/api/v1`; production: `https://tripos.vantiv.com/api/v1`.
- Lane API: the same hosts with `/cloudapi/v1/lanes`.
- JSON over HTTPS; `Accept` and `Content-Type: application/json`.
- Headers: `tp-authorization: Version=2.0`, `tp-application-id`, `tp-application-name`, `tp-application-version`, `tp-express-acceptor-id`, `tp-express-account-id`, `tp-express-account-token`, and a unique GUID `tp-request-id` for every HTTP request.

The `*.worldpay.com` certification alias also serves official documentation. Use one consultant-confirmed host pair; do not silently alternate hosts on a failed financial request. Cloud authentication is not a guessed local triPOS Direct HMAC/secret scheme. All merchant headers stay on the Rails server.

The official current API assets advertise version 5.0.4:

- [Lane API reference](https://docs.worldpay.com/apis/tripos/tripos-cloud/tripos-lane/api-specification), [downloadable YAML](https://docs.worldpay.com/assets/api-specs/tripos-lane/api-specification/triPOS%20Lane%20API-5.0.4.yaml).
- [Transaction API reference](https://docs.worldpay.com/apis/tripos/tripos-cloud/tripos-transaction/api-specification), [downloadable YAML](https://docs.worldpay.com/assets/api-specs/tripos-transaction/api-specification/triPOS%20Transaction%20API-5.0.4.yaml).

Lane operations include list/create, get/patch/delete, configuration, connection status, device info, and generating an additional activation code. Transaction operations include sale, authorization/completion, linked return, refund, void, reversal, query, and pre-read cancellation. The 5.0.4 asset does **not** establish a general transaction-status polling resource or a general cancel-any-active-sale operation. `/api/v1/cancel` is documented for pre-read. `POST .../lanes/{id}/command` reconfigures the PIN pad, not arbitrary cancellation. Do not invent either operation. The older runtime metadata exposes `lastTransaction/{laneId}`, absent from the downloaded 5.0.4 specification: treat cached-last-response use as optional, consultant-confirmed, and always correlated, never authoritative solely because it is last.

Pair by displaying a network-connected PIN pad's activation code in an admin form and submitting `POST /cloudapi/v1/lanes` with lane ID, description, activation code, and assigned terminal ID. Supported contactless/Quick Chip features depend on device, software, and account. See [Create lane](https://triposcert.worldpay.com/api/help/kb/cloud/LaneRequest-Post.html), [Update lane](https://triposcert.worldpay.com/api/help/kb/cloud/LaneRequest-Patch.html), and [core concepts](https://docs.worldpay.com/apis/tripos/tripos-cloud/core-concepts).

### 1.6 Notifications and reporting

No authenticated Express payment webhook contract was found in the reviewed official Express material. triPOS's documented flow returns a transaction result to the initiating call. **Do not implement Access Events or assume `/webhooks/worldpay` will confirm Express payments.** Keep that placeholder disabled/unregistered until a specific authenticated notification product is provided. Query-based recovery is mandatory even if notifications are later supplied.

Express `TransactionQuery` returns non-sensitive XML `ReportingData`, supports setup/transaction/reference filters, retains up to 365 days, and caps results at 1,000. The February 2026 `TransactionQueryPagination` adds numbered pages and count metadata. Implement pagination or bounded range splitting and overlap/deduplication. A query's success code means the query worked, not that every returned payment succeeded. See [Reporting methods](https://docs.worldpay.com/apis/express/express-xml/methods/reporting).

`BatchTotalsQuery` provides complete totals for the open batch; previous-batch detail is limited. `BatchClose` depends on merchant-initiated versus time-initiated close configuration. Prefer processor auto-close; do not automatically force-close at Guam midnight. These methods are not a bank-deposit/funding API. See [Batch methods](https://docs.worldpay.com/apis/express/express-xml/methods/batch). An official Express-linked funding API/export and fee/deposit identifiers for B&G were not established: obtain those from BOG/Worldpay. Do not borrow Access Account Payouts or Authorize.net reporting contracts.

## 2. Provider-neutral foundation

### 2.1 Snapshot assessment and required fixes

The existing `Payments::BaseProvider`, `ProviderResolver`, `StripeProvider`, `TestProvider`, and stub `WorldpayProvider` are useful seams. Their current create/process/verify/refund interface is too narrow and returns inconsistent untyped hashes. `PaymentService` still derives identity from current settings. `CheckoutSessionsController` creates no durable session and passes `order_id: 0`. `OrdersController` verifies a caller-supplied Stripe-shaped ID and contains Stripe-only compensation. `ProcessPaymentReversalJob` is Stripe-only. POS collection and confirmation call Stripe directly. `PaymentForm` invokes Stripe hooks even for other modes. `LIVE_PAYMENT_PROCESSORS` permits only Stripe. The provider-field migration is insufficient for uniqueness, environment, ownership, or recovery.

The lead audit reproduced:

- **F01:** payment reuse across paid orders and cross-order reversal on mismatched total. Fix with precollection ownership, immutable snapshot, unique consumption, and guarded compensation.
- **F02:** prefix-only test verification and simulated refund of a live order after toggling settings. Fix with separate environments and immutable identities.
- **F03:** captured-but-unfinalized orders cannot be recovered after browser closure/validation failure. Persist the entire order intent and finalization state first.
- **F04:** webhook-first POS payment skips stock deduction. Track inventory commitment separately and finalize once under lock.
- **F07:** refunds lack idempotency, pending reservations, and monotonic event handling. Model durable refund operations.
- **F08:** production defaults to `:async`. Require database-backed jobs and a running worker before live use.
- **F17:** global provider selection lacks account/location/environment/lane identity. Resolve new sessions from payment profiles and preserve that choice.

These are release gates, not optional Worldpay enhancements. Stripe must adopt them too.

### 2.2 Identity and selection

Separate `provider` (`stripe` or `worldpay`), `environment` (`simulated`, `sandbox`, `production`), `channel` (`online`, `pos`), and credential/account identity. The old `payment_test_mode` cannot select adapters, validate payments, or route refunds. Migrate it to a compatibility display field, reject unsafe production writes, then remove it from money-moving paths.

Add immutable `PaymentIdentity` records: UUID, provider, environment, non-secret external account/AcceptorID identifiers, merchant-profile key, USD currency, and secret-manager reference. Credentials may rotate behind that reference without changing the logical identity; changing account/MID/environment creates a new identity. Never expose tokens in admin JSON.

Add payment profiles keyed by location/channel with identity, checkout presentation, terminal configuration, capabilities, and enabled state. Online orders that lack a pickup location (shipping) use an explicit online merchant profile. Start with common B&G credentials if assigned, but permit distinct CNP/CP and location MIDs. Do not assume each iPad requires its own merchant account.

Resolution for a **new** session: authorized location/channel override → site default Worldpay profile → explicitly configured env default. Missing/invalid selection fails closed. Stripe is an explicit alternative setting. No automatic provider failover after a financial call or unknown result. Switching the default does not change existing sessions, tokens, refunds, batches, or lanes. Hide unsupported PayPal rather than allowing test mode to imply support.

### 2.3 Durable data and constraints

Use typed columns for invariants and normalized metadata for provider extras. Suggested models/migrations (names may align with an already-landed provider port, but invariants may not change):

- `CheckoutSession`: UUID; owner user ID or hashed high-entropy guest capability; location/channel; pending order ID; immutable cart/line/contact/fulfillment/pricing snapshot and hash; currency; identity ID; expiry; state; consumed timestamp. A guest session header alone is not ownership. Use a signed/unguessable capability, keep it out of URLs/logs, and authorize status/return access.
- `PaymentAttempt`: UUID; session/order/identity; operation and parent attempt; integer requested/approved/captured cents; currency; GUID operation idempotency key; canonical payload digest; operation state; setup ID; hosted URL; encrypted setup validation code; provider transaction ID; reference/ticket; lane/terminal snapshot; persisted retry/recovery timestamps/counters and error classification. One active collection attempt per session under lock. Retry the same operation; create a new attempt only after a definitive terminal outcome.
- `PaymentTransaction`: ledger entry for each externally observed financial operation, linked to attempt and original charge; identity; provider; raw provider ID; **canonical reference**; amount/currency; approval code; masked last four/brand; actual payment type and entry mode; network/host IDs; original timestamps/offset; batch/item identifiers; settlement state; first/last observation. Store only allowlisted data. Some mutation responses may reuse the original transaction ID: keep that transaction as one provider record and append operation/event facts keyed by the local operation UUID; do not assume every reversal/void yields a new external ID.
- `Refund`/refund operation: original charge identity/attempt, positive amount, caller idempotency key, operation kind (`return`, `void`, `reversal`), reserved amount, pending/unknown/succeeded/failed state, provider ID, audit actor/reason, original and resulting transaction links. Mirror legacy Stripe fields only for real Stripe IDs.
- `PaymentEvent` and transactional outbox: deduplicated external events or query observations, payload digest, normalized event facts, processed state; outbox records for finalization, recovery, fulfillment notifications, and refunds.
- `PaymentTerminal`: location/profile/identity; lane ID, terminal ID, device serial/model, enabled state, capabilities, last verified connection, and application lease. Unique lane per identity. iPad selection is a scoped preference; server validates location and access on every action.
- `PaymentBatch`, batch items, `FundingDeposit`, deposit-batch allocations, and reconciliation exceptions: environment/account/terminal scoped, cents, provider dates, source identifiers/checksums, import cursor, and immutable source facts.
- `SavedPaymentInstrument`, if enabled: identity/customer/token type/encrypted token, consent evidence, network references, brand/last four, disabled timestamp; never CVV.

Order additions: `checkout_session_id`, immutable `payment_identity_id`, `payment_environment`, `simulated`, `payment_attempt_id`, `payment_metadata`, `inventory_committed_at`, and unique inventory commitment ID. Preserve existing `payment_provider`, `payment_reference`, `payment_session_id`, and Stripe compatibility columns through migration. Use `card_online`/`card_present`/`cash` as method concepts; provider is separate. Backfill historical Stripe identity from evidence, not current settings; uncertain rows require reconciliation and cannot be guessed into simulation.

Database constraints:

1. Unique session-to-order association and one successful consumption per captured charge.
2. Unique `(provider, reference)` on `PaymentTransaction`, with `reference = identity_uuid + ':' + raw_provider_transaction_id`; keep the raw external ID separately. This satisfies payment-reference uniqueness while preventing numeric Express ID collisions between accounts/cert and production. Also unique `(payment_identity_id, raw_provider_transaction_id)` for the corresponding financial record. Unknown IDs remain null, never a shared placeholder.
3. Unique operation idempotency key within identity; unique `(session_id, caller_idempotency_key)` for create/confirm; same key/different digest returns 409.
4. Unique refund request key scoped to the original charge; provider refund IDs unique within identity. Migrate the existing unscoped refund index carefully.
5. Unique inventory commitment per order and unique outbox effect keys. Nonnegative cents/checks, approved/captured/refund bounds, and foreign keys.

Reference strategy: allocate a database sequence for every logical financial operation and serialize it as a decimal numeric string (at most 19 digits) in `ReferenceNumber`; retries retain it. Use the pending order's separate numeric sequence as `TicketNumber`, stable across that order's sale/refund operations. Store the human order number separately. Express documents both as strings up to 50 characters with numeric values recommended; confirm downstream processor restrictions/truncation before certification. Refunds/reversals have their own operation reference, parent charge link, and idempotency GUID. Never derive references from amount/email, truncate a UUID into a short collision-prone suffix, recycle a sequence, or use `order_id: 0`. `MerchantSuppliedTransactionID` can carry a separate correlation value only within the confirmed profile's limits. Source: [Express classes](https://docs.worldpay.com/apis/express/express-xml/classes).

Persist ownership binding before any remote call. A client supplies an attempt/session capability, never an arbitrary reference to spend. Verify owner, snapshot, amount, currency, provider, account, environment, and order association on every completion. For Express responses without currency, verify via the immutable USD merchant profile and authenticated query context; consultant must confirm currency guarantees. Do not pretend an absent response field was returned.

### 2.4 One finalizer and safe compensation

Introduce `Payments::FinalizeOrder` as the only path that commits paid fulfillment and inventory. Invoke it from checkout requests, Stripe webhook ingestion, optional future Worldpay notifications, POS confirmation, and recovery jobs.

1. Commit a pending order, line items, validated fulfillment/contact data, and payment session before collection. Preserve the full snapshot required to finish without a browser. Reserve finite stock under a short transaction with expiry; do not hold DB locks across network calls.
2. Record operation intent/outbox durably, perform the provider call outside the DB transaction, then persist the observed result. A stale `dispatching` attempt is unknown and recoverable after a crash.
3. Finalizer locks the session, attempt, charge, and pending order in a consistent order. Validate the full binding and authenticated provider outcome. If the transaction is already assigned to this order, resume missing effects; if assigned elsewhere, reject without reversal.
4. Under one DB transaction, consume the verified charge, update payment totals/status, commit inventory using the reservation or a locked stock check, and record the inventory commitment and outbox effects. A paid flag alone never suppresses stock commitment. Authorization-only is not paid. Settlement is tracked independently from capture.
5. Send email, kitchen tickets, shipping, analytics, and cart cleanup through idempotent after-commit/outbox consumers. Clear only the purchased cart rows/version; preserve items added after collection. A repeated callback returns the original order.
6. If stock or fulfillment cannot be completed after capture, retain the pending order and payment evidence, mark `compensation_required`, and queue an owned compensation operation. Show recovery/refund pending, never promise refund success before evidence.

Compensation gate **both before enqueue and inside the locked job**: original attempt exists, belongs to this owner/session/order/identity, external charge matches it, there is no committed paid order consuming it, and no active/succeeded duplicate compensation. A foreign caller's amount mismatch or supplied reference never authorizes reversal. Recheck immediately before dispatch with a persisted compensation claim that prevents concurrent fulfillment; commit claim, then call outside locks. Finalizer must respect that claim. If fulfillment already committed, only the ordinary authorized refund workflow can move money.

Unknown outcomes remain `unknown`/`reconciliation_required`, not declined or retryable-as-new. Reconciliation and compensation share operation locks so a late approval cannot race a refund and create paid fulfillment. Financial state transitions are monotonic: a late decline cannot overwrite captured, voided, or refunded evidence; corrections append ledger facts.

### 2.5 Provider interfaces and durable jobs

Keep `PaymentService` as compatibility coordinator. Define typed results with `status`, identity, raw/canonical IDs, requested/approved/captured cents, currency, codes, card summary, batch facts, and retry classification. Do not use a truthy `captured: :unknown` as payment success.

Provider capabilities and methods: checkout setup, collect/confirm, query/recover, authorize, capture, sale, cancel pending collection, reverse, void, refund, tokenize/manage token, terminal operations, and batch/transaction reporting. Unsupported methods return explicit capability errors. `verify_payment` becomes identity-bound query/validation of a stored attempt. Shared services own DB transitions and refunds; adapters do not create independent refund/order rows.

`WorldpayProvider` composes `ExpressClient`, `HostedCheckoutBridge`, and `TriPosCloudClient`; Stripe retains its SDK inside `StripeProvider` and a Stripe terminal adapter. Inject real or simulated clients based on immutable identity. A provider-neutral frontend checkout controller and terminal service dispatch by returned capability, with Stripe hooks confined inside Stripe components.

F08 gate: use Solid Queue in production; the gem and `api/db/queue_schema.rb` already exist, but `api/config/environments/production.rb` defaults to async. Set a required durable adapter, provision/migrate the queue database, start an explicit worker with the web deployment, and verify worker health. Schedule recovery and reconciliation in `api/config/recurring.yml`. Use an application-DB outbox plus a dispatcher/sweeper so order state and enqueue across separate databases cannot lose work. Persist retry counts/deadlines, not the current reversal job's in-memory map. Alert on oldest unknown attempt, failed compensation, queue lag, and reconciliation discrepancies. Keep Stripe's existing reversal entry point as a compatibility wrapper during migration.

## 3. Online checkout

### 3.1 API and frontend contract

Proposed application endpoints, all authenticated or guest-capability scoped and rate limited:

- `POST /api/v1/checkout_sessions`: idempotency key plus cart version, contact/fulfillment/location/shipping choice. Server runs existing `FulfillmentValidator` and `CheckoutPricingService`, validates rates/prices, reserves stock, and creates the pending order/session/attempt.
- `GET /api/v1/checkout_sessions/:id`: safe resumable state and original order link. Never disclose account tokens or validation secrets.
- `POST /api/v1/checkout_sessions/:id/confirm`: idempotency key plus opaque instrument handle or hosted completion hint. Server validates binding and either submits the token sale once or queries hosted execution.
- `POST /api/v1/checkout_sessions/:id/cancel`: requests cancellation/expiration and recovery; it does not assert no charge.
- `GET /payments/worldpay/return`: fixed application return handler with signed state. Compare setup ValidationCode when a return is present, query with server credentials, and hand off to the common finalizer. An invalid return cannot mutate payment state; background recovery remains available.

Return a discriminated contract: session/attempt IDs, amount cents/USD, order reference, expiration, provider/environment/simulated, and `flow` of `stripe_embedded`, `worldpay_hosted_fields`, or `worldpay_hosted_page`. Public `collection_config` contains only vendor-approved setup/URL/config fields. Production never returns simulation controls. Generic frontend `PaymentForm` loads one provider-specific component; do not mount global Stripe context for Worldpay. Server config, not Vite flags or local storage, controls payment authority.

### 3.2 Hosted Fields primary

Validate contact, cart, location, fulfillment, and totals before mounting short-lived collection. On submit, freeze the session snapshot and disable double submission while retaining a visible status/retry path. The browser sends sensitive data only to Worldpay-hosted fields. Rails receives an opaque handle or setup-completion hint, never PAN/CVV.

The real bridge has two possible vendor-confirmed modes:

- Token-only fields: backend consumes the single-use handle in exactly one Express sale/authorization using the assigned token field. Retained token creation is separately consented. Do not implement the handle-to-Express XML mapping until documented.
- Hosted execution fields/iframe: Worldpay executes the sale; backend **only queries** its result. Never follow an approval callback with a second sale.

The simulator implements both modes now. The consultant guide must establish actual callback names, token type/TTL/single-use behavior, setup needs, parent origin restrictions, SDK load URL/version, CSP/frame origins, accessibility, supported Safari/iPadOS versions, wallet availability, and whether required fraud controls are account-side or app-side. Approval hints from JavaScript cannot mark an order paid.

### 3.3 HPP fallback

Backend performs `TransactionSetup` for the same persisted session. Legacy mode stores the GUID and ValidationCode and constructs the allowlisted hosted URL; Premium mode stores the returned full hosted URL and any separate transaction identifier, then uses its confirmed SDK or redirect contract. Do not extract a GUID from arbitrary URLs or accept a client-supplied redirect host.

Use full-page redirect as the simplest fallback. Preserve owner/session/cart and return location through signed state; query on return and periodically in the background. Browser back, missing return, cancel, expired setup, and decline/retry all retain the pending order intent. Expire the previous setup before issuing a replacement where supported, but reconcile it first if it might have executed. A new setup never excuses duplicate charging.

Return handlers may receive transaction ID, codes, approval number, last four, AVS/CVV, amount, token, and setup ID. Treat all as hints until server verification. Enforce exact expected setup/attempt/account association and examine all query rows; one decline plus one approved sale is not two charges, and an unrelated approval is not proof of payment. Unexpected multiple approvals create an exception and block automatic fulfillment beyond the one legitimate charge.

### 3.4 Failure and timeout recovery

A customer closing the page is not payment cancellation. The recovery worker owns unfinished attempts and finalizes from the persisted snapshot when approval is proven. Start application polling at 2 seconds, back off to 10 seconds, stop after 90 seconds of foreground waiting, and show “Payment status is being checked” with the order reference. Background work continues with a persisted schedule; these are app defaults, not Worldpay timing guarantees.

For Express sale missing response or codes 1001/1002, schedule recovery immediately. The official credit guide requires System reversal for relevant sale communications failures. Querying can identify a known transaction and choose a Full reversal, but must not silently replace a required System reversal. Obtain the hosted/token-safe procedure and deadlines from Worldpay. System reversal without a known ID may use a PaymentAccount token; never collect PAN just to reverse. If no safe supported path exists, preserve unknown state and escalate rather than fabricate a no-ID reversal.

Native idempotency reduces duplicate dispatch but does not erase reversal obligations. Returns/completions use their documented retry/query recovery with frozen payload and duplicate checking enabled. New requests after a timeout use neither a new financial operation key nor automatic provider failover. Definite pre-dispatch transport failure may retry the same operation; a connection lost after dispatch is unknown.

### 3.5 Cancellation, refunds, and partial approvals

Expose a generic manager action with actual processor operation/status in the audit trail:

- Before financial execution: cancel/expire collection, then verify no late approval before releasing the session.
- Open batch/full cancellation: select the certified Full reversal/void sequence based on transaction type and provider status. “Same day” alone does not establish open batch. Do not issue both unconditionally.
- Settled credit payment: linked `CreditCardReturn` against original ID, including partial amounts if enabled. Older-than-window returns require explicit operational handling; never use an unlinked credit automatically.
- Open-batch partial refund: do not attempt a partial Void. Use only a certified partial-return/adjustment/reversal path; otherwise show pending settlement/manual review. Partial reversal of an authorization is not necessarily a refund of a captured sale.

Reserve requested refund cents under a lock against captured minus succeeded and pending/unknown refunds. Concurrent different keys cannot over-refund; same key returns the same operation. A timeout retains its reservation until outcome is resolved. Ingest duplicate/out-of-order refund events by upsert/deduplication; succeeded never regresses to pending or failed. Store provider operation ID only after correlation. Refund notifications follow confirmed success. Inventory restoration is a distinct audited effect keyed to the refund/cancellation decision.

Default partial-approval policy for both channels: request no partial approval where allowed; still handle an unexpected partial by recording the actual amount, keeping the order unpaid, and reversing/voiding that approval through recovery. Customer retries only after compensation is resolved. Certify this behavior. Split tender is a separate explicitly approved capability; do not silently charge a second card or mark a partially funded order paid.

AVS/CVV policy: require CVV and billing ZIP/address for online where supported; define merchant-approved match/unsupported/international rules before certification. A simulator can approve then return AVS/CVV mismatch to verify compensation. Never hardcode “any mismatch equals no charge.”

## 4. POS with triPOS Cloud

### 4.1 Setup and access

Admin Payment Terminals page lists location, identity/environment, lane/terminal/device, connection state, and assigned iPads. A manager selects location/profile, enters the PIN pad's activation code and consultant-assigned terminal ID, and pairs via Rails. Do not log activation codes or show credential fields. Persist only successful pairing. Expired code, duplicate lane, wrong account, unavailable device, and unauthorized cross-location actions have explicit recovery messages.

Application endpoints: `GET/POST /api/v1/admin/payment_terminals`, scoped `GET/PATCH/DELETE /:id`, `POST /:id/pair`, `GET /:id/status`. Backend forwards the relevant Lane API operations. Re-pair/delete cannot occur during an active attempt; manager confirmation identifies the exact device/location. Retain historical lane snapshots after deletion.

Use lane locking in triPOS and an application DB lease per terminal. A lease's age alone never proves a transaction ended. The lease remains quarantined while financial outcome is unknown. Two iPads selecting the same reader get “Reader in use” with the active order reference. A location switch does not move a pending sale to another merchant or reader.

### 4.2 Collection, return, and cancellation

`POST /api/v1/admin/pos/orders` creates the pending order through the shared foundation. `POST /api/v1/admin/pos/orders/:id/payments` starts a card-present attempt with terminal ID and idempotency key; returns 202 plus attempt status URL. A durable worker sends triPOS sale, allowing the HTTP provider call to wait for card interaction without holding a web request or DB transaction. Staff polls our attempt, not a fictitious triPOS async sale-status endpoint.

| triPOS operation | Provider endpoint |
| --- | --- |
| Sale | `POST /api/v1/sale` |
| Authorization/completion | `POST /api/v1/authorization`; `POST /api/v1/authorization/{transactionId}/completion` |
| Linked credit return | `POST /api/v1/return/{transactionId}/{paymentType}` |
| Card-present refund, including debit path | `POST /api/v1/refund` |
| Void | `POST /api/v1/void/{transactionId}` |
| Known-transaction reversal | `POST /api/v1/reversal/{transactionId}/{paymentType}` |
| Recovery query | `POST /api/v1/transactionQuery` |
| Pre-read cancel only | `POST /api/v1/cancel` |

Use [Transaction API 5.0.4](https://docs.worldpay.com/assets/api-specs/tripos-transaction/api-specification/triPOS%20Transaction%20API-5.0.4.yaml) for exact request definitions. JSON sale amounts are decimal strings; parse numeric response amounts as decimals. Every HTTP request gets a new `tp-request-id`; do not mistake it for a documented financial idempotency guarantee. Maintain separate stable app operation keys and references. Confirm whether the assigned Cloud release supports any additional financial idempotency field.

UI states: ready, waiting for card, processing, approved/finalizing, paid, declined, cancelled, reader offline/busy, unknown/checking, compensation pending. Preserve cart/order/terminal after reload and resume via server attempt ID. A successful triPOS call goes through `FinalizeOrder`, including inventory commitment. Neither browser success nor a separate terminal-confirm route can set paid directly. Stripe S700 uses the same state/finalizer with its own adapter.

Credit linked return does not require another swipe; the official triPOS guide says debit is not supported through that linked return route. Debit refund must use its supported device/PIN workflow with manager authorization and linkage in our ledger. See [Return guidance](https://triposcert.worldpay.com/api/help/kb/return.html). Gate card type, refund capability, and processor restrictions in the adapter.

For staff Cancel: before provider dispatch, cancel locally; during pre-read, use its documented cancel; during an ordinary active sale, show cancellation requested and use only the consultant-approved device procedure. The current public spec does not establish remotely cancelling every active sale. Never reboot/re-pair an active reader to simulate cancellation. After approval, cancellation is a financial reversal/void. Certify cancel/approval races.

### 4.3 Timeout, offline behavior, and receipts

Set `userInputTimeout` explicitly; the Lane configuration documents milliseconds (for example 30000). Use 60 seconds as the initial application configuration target and confirm the accepted per-request units/range and total call budget with the consultant. Worker/provider read timeout must exceed the device interaction budget plus the agreed host grace period. Load balancer/web timeouts must not govern payment outcome. A timed-out worker leaves a durable unknown attempt and quarantined lane.

Unknown sale → query by original reference/account/terminal and time bracket → recover approval or execute the required certified reversal path. A no-row response immediately after timeout is not proof of failure; reporting can lag. Configure query/reversal deadlines per operation after certification. Do not send another sale to “see if it worked.” A provider reversal without transaction ID is an explicit consultant question.

Reader or network offline: no card-present paid order and no local fake approval. Store-and-forward/offline acceptance is disabled unless separately scoped and certified; cash is available only once the card attempt is definitively cancelled/compensated or a manager handles a recorded exception. Do not let an unknown card payment silently become a second cash payment.

Persist receipt facts: original order/location/date, amount/currency, approval/reference/transaction IDs, card brand/last four, actual credit/debit type, entry mode, terminal/lane, network label, and provider-specified EMV receipt fields (AID/application label/TVR/TSI and other required fields when returned). Preserve required signature evidence under restricted retention, not generic logs. Receipts and reprints show the actual payment/refund state and simulated banner where applicable. Confirm exact merchant/customer receipt requirements using [Express receipt requirements](https://docs.worldpay.com/apis/express/features/receipt-requirements) and the assigned device's certification script.

## 5. Simulator: required implementation before credentials

### 5.1 Scope and shared interfaces

`WORLDPAY_MODE=simulated|sandbox|production` selects which clients a **new Worldpay identity** uses. Existing attempts always select by stored identity. `SimulatedExpressClient` and `SimulatedTriPosCloudClient` implement the same Ruby client ports as real clients, with injectable time, scheduler, scenario, and transport faults. A common `Payments::Simulation::ScenarioEngine` also supports Stripe simulation through `SimulatedStripeClient`. Retire `TestProvider`'s prefix-based authority; retain a temporary facade only if it uses the common engine and durable attempts.

Sandbox means contacting the actual provider's certification environment. Simulation means local application test doubles with no network payment traffic. Stripe sandbox/test keys remain Stripe sandbox. Do not implement an open server impersonating Express or redistribute a processor emulator. Generate application test outcomes and small scrubbed contract fixtures through injected ports; confirm licensing for any broader copied assets. Simulator responses are representative, not a claim to reproduce every host rule.

Persist simulated processor transactions, tokens, terminal state, batch membership, and idempotent operation results in environment-scoped tables. Restarting Rails or workers must not erase a charge, refund, lane interaction, or pending timeout. No `sleep` in application requests; use virtual clock/scheduled state transitions. A reset command operates only on a dedicated simulation dataset with no active jobs; no shared/live data deletion.

### 5.2 Scenario contract

Each scenario is selected by a dev/test-only control or a fake card alias, bound server-side to its attempt. Card aliases are a **Three Squares convention**, not Worldpay test PANs. Prefer a dropdown/fake alias so staff never type real card details into fake fields. If a card-number UI is needed, accept only a documented finite allowlist of dummy values, drop the value immediately after local scenario selection, and never send it to Rails, analytics, or logs.

Required deterministic scenarios:

| Scenario | Simulated financial behavior | Required application observation |
| --- | --- | --- |
| `approve` | Exact full approval, approval code, transaction ID, card summary, open batch | One paid order and one stock commitment |
| `decline` / `expired` | Express 20/21 or matching triPOS decline | No capture, cart retained; new attempt allowed |
| `partial` | Express 5, approved cents below requested | Unpaid order, recorded partial money, compensation required |
| `duplicate` | Existing approval then 22/23 | Recover original attempt; no second order or charge |
| `idempotent_replay` / `key_mismatch` | Same operation returns original; incompatible key/type produces 108 | One charge; mismatched request rejected |
| `timeout_before_dispatch` | No processor transaction created | Retry same operation safely |
| `timeout_after_approval` | Processor ledger approved; transport loses response | Unknown locally; query/reversal recovery, never a second sale |
| `network_error` / `host_error` | Failure before or after dispatch, explicitly distinct | Durable unknown where needed |
| `avs_fail` / `cvv_fail` | Approval plus failed AVS/CVV | Fraud-policy handling compensates existing money |
| `cancel_before_card` / `cancel_race` | No charge or late approval after cancel request | Correct cancellation or compensated late approval |
| `query_lag` / `malformed_response` | Temporarily invisible transaction or unusable response | No false decline; durable recovery |
| `refund_timeout` / `refund_decline` | Refund approved with lost response, or definitive failure | Reserved amount retained or released correctly |
| `terminal_offline` / `busy` / `invalid_pin` | No valid sale or lane unavailable | Clear staff recovery; no inventory deduction |
| `late_event` / `duplicate_event` | Reordered/repeated captured/refunded facts | Monotonic state and exactly-once effects |

Also support an amount-trigger profile to mirror the **documented Express NULL** subset: $1.00 approve, $23.05 partial, $0.20 decline, $0.21 expired, $0.22/$0.23 duplicate, $10.01 communication error, $10.02 host error. This is opt-in; ordinary menu totals must not accidentally select a scenario. AVS/CVV test presets are independent from payment approval. Source: [Express NULL processor](https://docs.worldpay.com/apis/express/express-xml/null).

The engine returns fixture XML to the real Express parser and fixture JSON to the real triPOS parser at the transport boundary, so malformed/nested/unknown-field cases exercise parsing too. Separate business-result doubles are allowed for narrow unit tests. Unknown outcomes must have both variants: money moved and money did not move. Duplicate results and attempts to spend another session's fake reference must fail the same binding checks as real payments.

### 5.3 Fake Hosted Fields and terminal panel

`SimulatedHostedFieldsForm` mounts through the application bridge from section 1.3, renders isolated fake fields, emits ready/validation, and supplies an opaque `sim_` handle bound to the session/scenario. Support token-only and hosted-execution contracts. Backend handle redemption validates database ownership, amount, identity, expiry, and one-time use; a string prefix grants no authority. Include setup expiry, invalid token, lost callback, cancel, and duplicate submit.

The admin simulation panel lists fake lanes by location. Staff presses “Take card payment”; lane displays waiting for card; dev panel offers **Tap card**, **Approve**, **Decline**, **Enter wrong PIN**, **Disconnect**, and **Delay/lose response**. Controls target a specific attempt and require simulation authorization. They cannot accept arbitrary order IDs from production. Render card inserted/remove-card and busy states; simulate cancelled/late approval races. A second iPad attempting the lane must get the same busy semantics as a real reader.

### 5.4 Simulated settlement and funding

Use virtual clock advancement to close the configured simulated batch per identity/terminal, preserving originals, voids, returns, and next-batch refunds. Generate deterministic batch IDs/items and a separate simulated funding export with configurable lag/fees. Include multiple batches to one deposit, one batch split across deposits, weekend lag, missing/duplicate import, out-of-band refund, and amount mismatch. Reconciliation consumes these through the same report/import interfaces as real data. Always label synthetic fees and deposits; never imply a funding promise from test data.

### 5.5 Production isolation and visible state

Boot-time invariant: abort if `Rails.env.production?` **or** `APP_DEPLOYMENT_ENV=production` and any selected/default/available payment profile is simulated, the legacy test flag is enabled, or simulation routes are enabled. Reject mismatched/missing environment declarations. Production enables only production payment identities; sandbox cannot authorize production fulfillment either. Dedicated simulation QA runs in development/test or a separately configured Rails staging environment/database, never by toggling a production site's test switch.

Enforce again at request dispatch, handle redemption, finalization, refund, reporting, and job execution. Jobs recheck immutable environment and deployment authority, not just boot configuration. Production rejects `sim_`, `test_pi_`, fake tokens, and simulated identities even if DB settings are tampered with. Worker configuration has the same guards as web.

Frontend bundle excludes fake fields/dev panels from production builds; server omission and authorization are the actual control. No provider credentials loaded or payment network egress in simulation. Simulation cannot target a production order, token, lane, batch, or merchant profile. Do not allow switching an existing record's environment.

Show persistent **“Simulated payments — no money moves”** badges on checkout, POS, admin order/refund pages, receipts, and simulation reports. Sandbox has a distinct “Sandbox payments” label. Stamp orders/attempts/refunds/batches immutably. Default financial reports, CSV exports, dashboards, totals, and accounting feeds include only production financial records (with cash environment stamped from the deployment and simulated cash excluded too); never rely on a frontend filter. Offer a clearly separate simulation view. Fake orders use fake stock/fixtures and do not send real customer emails, kitchen tickets, shipping labels, loyalty credits, or real analytics revenue.

## 6. Money, batches, and accounting

All application money is integer USD cents with bounded positive input and exact comparisons. Express serialization uses `BigDecimal(cents) / 100`, formatted to exactly two decimal places with no commas/scientific notation; never binary float division. triPOS request fields that require numeric JSON use an exact decimal serializer; use strings where its schema requires strings. Parse returned numeric lexemes with decimal precision before converting to cents, reject unsupported currency/excess fractional digits, and do not compare rounded floats.

Store UTC event timestamps plus provider's original local time and offset. Business dates/display use `Pacific/Guam` (UTC+10). Processor query windows and batch cutoffs are separate configuration: triPOS's legacy query guide states US Central time for US processing, so translate through `America/Chicago` with DST where confirmed, not a hardcoded six-hour offset. See [triPOS transaction-query guidance](https://triposcert.worldpay.com/api/help/kb/transactionQuery.html). Confirm the assigned account's reporting timezone.

Use a business date, provider batch date, and actual deposit date as distinct fields. Online, POS, terminals, brands, or MIDs may settle separately. Marie's desired **one deposit per day** is an acquiring/funding configuration request; the application cannot guarantee it by summing rows or closing a batch. BOG must confirm consolidated funding, cutoff, weekends/holidays, gross/net fees, debit timing, and adjustments across both locations/channels.

Reconciliation pipeline:

1. Poll unresolved attempts frequently with bounded backoff, then pull transaction reports per account in overlapping windows and paginate completely. Deduplicate by immutable identity and transaction ID; retain checkpoint only after durable processing. Include declined attempts without counting them as revenue.
2. Capture open-batch totals before close when supported; import closed-batch facts and transaction membership from the agreed report. Do not label open-batch totals as settled funds.
3. Import BOG/Worldpay funding data through an agreed API or idempotent restricted CSV upload if no API is available. Match deposit/batch IDs, account, amounts, currency, and dates. Model allocations many-to-many. If source has no exact identifier, suggest matches for accounting review; never silently guess.
4. Explain expected net deposit from settled sales less settled returns and separately recorded fees/adjustments. Exclude voided/reversed transactions from settlement without subtracting the same refund twice. Keep cash outside processor settlement.
5. Manager/accounting view shows sales, returns, reversals, settled net, fees, actual deposits, variance, stale unknowns, unassigned provider transactions, and unmatched deposits by Guam business date/location/account. Export original IDs and both business/provider dates.
6. Flag out-of-band portal refunds, missing transactions, duplicate batches, partial funding, imported corrections, and reopened periods. Preserve an audit trail and require actor/reason on manual matches. Ordinary revenue reports use captured less succeeded refunds, with settlement/funding shown separately; repair the current paid-order-only totals that mishandle partial/full refunds.

## 7. Credentials and configuration checklist

The snapshot's `api/.env.example` uses `WORLDPAY_MERCHANT_ID`, `WORLDPAY_ACCOUNT_ID`, `WORLDPAY_USERNAME`, `WORLDPAY_PASSWORD`, and `WORLDPAY_WEBHOOK_SECRET`. That is not the chosen Express credential contract. The implementation worker must replace that block with the application names below and update config documentation. **This research task changes only this spec.** Do not migrate unknown existing secret values by name guessing.

```dotenv
# Three Squares configuration names; values supplied privately at onboarding.
APP_DEPLOYMENT_ENV=development
PAYMENTS_DEFAULT_PROVIDER=worldpay
WORLDPAY_MODE=simulated
WORLDPAY_CHECKOUT_PRESENTATION=hosted_fields
WORLDPAY_EXPRESS_ACCOUNT_ID=
WORLDPAY_EXPRESS_ACCOUNT_TOKEN=
WORLDPAY_EXPRESS_ACCEPTOR_ID=
WORLDPAY_EXPRESS_APPLICATION_ID=
WORLDPAY_EXPRESS_APPLICATION_NAME=Three Squares
WORLDPAY_EXPRESS_APPLICATION_VERSION=
WORLDPAY_EXPRESS_TRANSACTION_URL=https://certtransaction.elementexpress.com/
WORLDPAY_EXPRESS_REPORTING_URL=https://certreporting.elementexpress.com/
WORLDPAY_EXPRESS_SERVICES_URL=https://certservices.elementexpress.com/
WORLDPAY_EXPRESS_HOSTED_BASE_URL=https://certtransaction.hostedpayments.com/
WORLDPAY_TRIPOS_ORIGIN=https://triposcert.vantiv.com
WORLDPAY_ONLINE_TERMINAL_ID=
WORLDPAY_ONLINE_LANE_NUMBER=
WORLDPAY_TERMINAL_PROFILE_KEY=
WORLDPAY_RETURN_URL=
PAYMENTS_BUSINESS_TIME_ZONE=Pacific/Guam
WORLDPAY_REPORTING_TIME_ZONE=
ACTIVE_JOB_QUEUE_ADAPTER=solid_queue
```

These are app-owned variable names mapping to exact vendor fields, not vendor-issued environment variable names. Origin is host-only; clients add `/api/v1` or `/cloudapi/v1`. Validate HTTPS, allowlisted environment hosts, return origin, and required profile fields before a real adapter is usable. Distinct location/channel credentials use secret-manager profile references, not a growing set of guessed `AUTH_*` variables. triPOS can reference the same Express identity or a separately issued CP identity with the same three credential fields. Lane IDs/terminal IDs/device assignments are non-secret database configuration, not one global terminal env var.

Terminal profile stores approved MarketCode, entry/CVV/cardholder/terminal capability/environment/type/MOTO indicators, partial-approval policy, currency, token scheme, and refund capabilities. Defaults in this block do not authorize a guessed terminal profile. `WORLDPAY_EXPRESS_APPLICATION_VERSION` identifies the certified release. Retain original payment identity even across application upgrades.

Do not add an Express webhook secret, Access Basic Auth, Checkout ID, JavaScript URL, or Hosted Fields public key until the actual guide requires it. Add exact Hosted Fields configuration to the bridge and example file once received. Premium URLs come from setup and must be allowlisted; never manufacture them by string replacement. Stripe retains existing publishable/secret/webhook/Terminal credentials, attached to its sandbox or production identity. Only publishable data reaches `web`; never any `VITE_*` merchant secret.

Sandbox plug-in sequence:

1. Obtain merchant approval, signed complete SOW, named implementation consultant, current guides/XSDs, credentials, test cards/device, enabled products, and certification script. Confirm CNP/CP/location identity mapping.
2. Create sandbox profiles in an isolated staging DB, fill the Express credentials/application identity, approved terminal profile, exact endpoints and return origins. Set `WORLDPAY_MODE=sandbox`. Validate deployment/identity isolation. Simulation is not selected implicitly when credentials are missing.
3. Install the real Hosted Fields bridge from the supplied guide; if it differs from this app bridge, adapt only that boundary and add scrubbed contract fixtures. Verify script/frame CSP, origin checking, callbacks, setup/token lifetime, and backend redemption. Verify whether Premium replaces legacy HPP.
4. Migrate queue DB, start durable worker/dispatcher/sweeper, prove restart recovery, and health-check credentials without collecting payment. Confirm network access and current CA trust.
5. Pair the key-injected test PIN pad to sandbox location/lane. Record model, firmware, merchant/terminal configuration, and receipt settings. Do not use Stripe S700 as a triPOS reader.
6. Run section 9 scenarios and Worldpay's assigned scripts. Capture release SHA, profile identifiers (non-secret), case IDs, timestamps/request IDs/transaction IDs, receipts, expected/actual behavior, and consultant disposition. Attach evidence without PAN/CVV/tokens/secrets.

Production plug-in sequence:

1. Obtain certification approval, production credential/terminal assignments, approved host/return/CSP domains, funding setup, and cutover owner. The consultant must close section 10 blockers.
2. Create new production identities; never mutate sandbox records. Set `APP_DEPLOYMENT_ENV=production`, `WORLDPAY_MODE=production`, exact production endpoints and secret references; clear legacy simulation/test selection. Boot must fail if any unsafe selection remains.
3. Verify queue migrations/worker health, recovery jobs, backup/alerts, per-location routing, receipt details, and reconciliation permissions. Deploy the certified code and confirm its actual SHA/build.
4. Run the merchant/consultant-approved small real sale/refund/receipt/funding checks and accounting signoff. Keep explicit Stripe alternative configuration available; switching applies to new sessions only. Stop new Worldpay collection if a material issue appears while continuing recovery/refunds for existing Worldpay attempts.

No test card, simulated success, or sandbox approval is a production health check.

## 8. SOW scope to send Worldpay

This is a draft scope list, not a sent message. Resolve every item as **certify now**, **not supported**, or **explicitly excluded** before signing; do not let unanswered items default to omission.

1. Merchant: B&G Pacific dba Three Squares, Main/Tamuning and Donki; browser React/Rails SaaS; iPad staff; merchant-specific project, direct BOG merchant settlement; future ISV status is separate.
2. CNP: Express Hosted Fields exact product/SDK/version and PAN-free contract; Express Hosted Payments redirect fallback; Premium versus legacy choice; desktop/mobile Safari/Chrome; cancellation/back/reload/expiry/missing return; TLS/CSP/domain requirements.
3. Payment methods: approved Visa/Mastercard/Amex/Discover and other locally required brands; domestic/international cards; online debit routing; CP credit/PIN debit/PINless debit; EMV chip/contactless/mobile wallets; device swipe/fallback/manual entry only as approved. No surcharge/convenience fee. Confirm tax/tip behavior and whether tips are excluded or certified; no guessed tip adjustment support.
4. Lifecycle: sale, auth-only, authorization completion, partial capture/release of remainder if supported, full cancellation, Full/System/Partial reversal, current-batch void, linked settled return, partial/repeated refunds and refund window, debit refund and PIN requirements. No unlinked credits by default.
5. Partial approvals: disable where allowed and certify safe unexpected-partial compensation. Explicit decision on split tender, cashback, DCC, offline/store-and-forward, force/voice authorization, gift/EBT/ACH; default excluded from UI but declared to scoping.
6. Reliability: Express native idempotency methods/retention/key scope, triPOS financial retry semantics, host duplicates and legitimate second purchase, unknown-outcome query/reversal deadlines, lost responses, delayed approval, worker restart, no-ID hosted/Cloud System reversal, cancellation races, and duplicate callbacks.
7. Tokenization: exact PASS/OmniToken scheme, collection, transaction-to-token method, customer consent, saved-card CIT/MIT and network references if desired, deletion/update/expiry; whether online and CP tokens can be shared across these accounts. Certify capability now if future card-on-file use is requested; otherwise explicitly exclude its customer UI. Wallet stored-credential restrictions included.
8. triPOS: Cloud Lane + Transaction APIs and certified versions; two-location/iPad lane setup; pairing/activation/re-pairing, lane locking, connection monitoring, busy/offline behavior, ordinary-sale cancellation procedure, Quick Chip decision, device/firmware/key injection, test device shipment to Guam (first free per meeting), production procurement/support.
9. Security/operations: assigned CNP/CP terminal profiles/MIDs/accounts, environment separation, no sensitive card logging, credential rotation, required receipts/EMV/signature retention, PCI responsibilities and merchant attestation confirmed by Worldpay; no claim that using a hosted UI eliminates every PCI obligation.
10. Notifications/reporting: whether any Express/Cloud payment notification exists and its authentication/retry/registration contract; query-by-reference/setup/ID, report pagination/retention/timezone, external portal adjustments, batch IDs/status/totals, automatic close/cutoffs, settlement/funding/deposit/fee export or API and access rights.
11. Funding acceptance: one deposit per day desired across both locations/channels; whether possible with chosen MIDs, debit and brands; gross/net fees, weekend/holiday timing, bank reference identifiers, consolidated versus separate deposits, variance/adjustment handling, accounting test dataset and production funding verification.
12. Delivery: assigned case IDs/test cards/credentials/PIN pad/firmware, certification evidence format and review cycle, merchant enablement changes, production credentials/cutover/release identification, and ongoing support escalation for unknown charges/refunds. Stripe remains an independent application alternative.

## 9. Verification and certification plan

No tests were executed in this research task and no servers were started. Later implementation uses the `application-qa` skill for agent-executed affected-flow QA at each slice, then end-to-end acceptance. Record exact commit/build, fixture identity, device/browser/OS, passed/failed/blocked/not-run cases, evidence, and unresolved work. Real hardware/certification actions require the assigned device and consultant; local simulator tests cannot mark those passed.

### 9.1 Automated layers

Unit/contract fixtures: scrubbed XML for setup, sale/auth/completion, partial, declines, 22/23, 108, 1001/1002, void/reversal/return, token methods, empty/multiple/nested `ReportingData`, pagination, malformed/truncated XML and unknown fields. Disable DTD/external entity expansion, bound response sizes, and normalize namespaces. Scrubbed triPOS JSON for lane pairing/status, sale/debit/EMV, `_hasErrors` despite HTTP 200, partial approval, offline/busy, refund/void/reversal, and query. Use actual parser/serializer paths. HTTP 200 alone is never success. No live calls in routine tests and no credentials/raw card data in recordings.

Request/model/job specs: owner/capability authorization; cart/pricing/fulfillment snapshot binding; exact cents/USD/account/environment; foreign reference rejection; atomic unique consumption under concurrent submissions; queue/outbox crash boundaries; persisted retries; monotonic events; worker restart; inventory committed exactly once; refund reservation/concurrency; original-provider routing after settings changes. Use database concurrency tests where locking/uniqueness is the behavior under test.

Frontend/integration: fake Hosted Fields contract, exactly one collection mode, no Stripe hook dependency in Worldpay flow, accessible errors/focus, disabled double submit, setup refresh/recovery, return URL/state validation, POS resume and cancellation races. iPad Safari is a required release target; browser emulation is useful but not a substitute for physical iPad/device certification.

Guardrail tests spawn the configuration/boot path in a subprocess: production simulation, sandbox identity in production, legacy test flag, Vite-only overrides, queued simulated job, arbitrary fake reference, and imported simulated financial rows all fail closed. Query dashboards/exports to prove synthetic revenue exclusion.

### 9.2 Scenario mapping

| Case | Simulator/application acceptance | Worldpay certification mapping |
| --- | --- | --- |
| C01 | Online approve, reload/no return, finalize once | Assigned Hosted Fields/HPP sale case; full query proof |
| C02 | Decline/expired then approved retry; two rows for setup | Assigned CNP decline/retry and setup expiry cases |
| C03 | Partial approval compensated; no fulfillment | Assigned partial-approval/reversal case and policy signoff |
| C04 | Duplicate submit/concurrent finalize/reference theft | Native idempotency, host duplicate, distinct legitimate-purchase cases |
| C05 | Approval lost over network, crash, recover/reverse | Missing response/1001/1002 and timing scripts |
| C06 | Captured payment + invalid fulfillment/stock failure | Failed-finalization compensation and late event race |
| C07 | AVS/CVV mismatches/unsupported results | Consultant-approved fraud rules and trigger cases |
| C08 | Auth-only → completion; cancel unused authorization | Assigned auth/capture/release cases if enabled |
| C09 | Full/partial/repeated refund; concurrent over-refund blocked | Current-batch cancel, settled Return, partial Return, window limits |
| C10 | Refund approved then timeout; duplicate/reordered event | Return/completion retry/duplicate recovery scripts |
| C11 | POS tap/chip/PIN/wallet approval, receipt and stock | Assigned device/brand/entry-mode cases and receipt review |
| C12 | POS offline/busy/invalid PIN/cancel/late approval | Terminal/device/network interruption and cancellation scripts |
| C13 | Two iPads, two locations, reload and provider switch | Account/lane/terminal-routing validation |
| C14 | Stripe webhook before terminal confirm and converse | Stripe regression; same inventory/finalizer invariants |
| C15 | Toggle settings after live sale; refund original identity | Application F02/F17 gate plus sandbox/production isolation |
| C16 | Tokens create/use/delete and wrong-account rejection | Assigned PASS/OmniToken and stored-credential cases if scoped |
| C17 | Batch close, delayed/combined/split/missing deposits | Agreed batch/report/funding cases and accounting signoff |
| C18 | Kill/restart worker at pre/post-dispatch and outbox boundaries | Application durability gate; repeat relevant sandbox recovery cases |

F01-specific adversarial checks: use a successful reference for a second owner, same owner/different cart, different amount, currency, account, environment, and second order. All must reject without reversing the committed order. Run a race between finalizer and compensation enqueue/job. F07-specific checks include duplicate refund webhook/event after success and pending/unknown refund cents reserved across a worker restart.

### 9.3 Official test values and limits

Use [Vantiv test triggers](https://docs.worldpay.com/apis/express/features/test-triggers) only with its assigned test processor/credentials/cards: EMV $1.00 approves; Visa/MC $9.01–$9.99 exercises partial; Visa $0.51 declines. AVS uses `123 Main Street` and ZIP triggers (45203 gives N; 45209 gives Y); CVV 222 matches and 333 mismatches on applicable tests. The guide distinguishes EMV, swiped/keyed cards, and PIN debit. Obtain exact certification card PANs and physical test cards from the consultant rather than inventing them from printed last-four references.

The [NULL processor](https://docs.worldpay.com/apis/express/express-xml/null) supports separate non-EMV trigger amounts. Do not apply those automatically to the Vantiv test platform. The PDF example includes the familiar Visa `4111111111111111`, but this is not proof it is the assigned Hosted Fields certification card. Use it only when Worldpay confirms that test profile. Access's [test-card page](https://docs.worldpay.com/access/products/card-payments/testing) belongs to another API family and is not the Express card list.

For each assigned case, retain `local_case_id`, Worldpay case ID, environment/processor/device profile, trigger/card alias, request/response expectation, actual IDs/times/receipt, recovery outcome, and signoff. Certification cannot be called complete while unknown-outcome or refund cases remain blocked. Never test real PANs in the simulator.

## 10. Consultant questions that block exact production contracts

1. **Hosted Fields identity:** exact guide/SDK/script/origins/callbacks; token-only versus hosted execution; whether Premium iframe is the current equivalent; setup/handle lifetime; amount/account binding; supported Safari/iPadOS; HPType enablement and PDF future-use discrepancy. This is the largest remaining implementation uncertainty.
2. **Recovery/cancellation:** correct no-PAN System reversal for a lost hosted or triPOS sale response without a transaction ID; auto-reversal responsibilities; query visibility lag; mandatory deadlines; safe cancellation of an ordinary active Cloud sale; supported financial idempotency in Cloud and Express key retention/method coverage.
3. **Boarding/profile:** exact CNP/CP/location account/MID/AcceptorID/terminal/lane/MarketCode and terminal indicators, production hosts, enabled credit/debit/PINless/partial-return/auth-capture/token capabilities, assigned device/firmware and certification cards/cases. No-ID reversal, debit returns, partial refunds, and long-window returns must be explicit.
4. **Funding:** one daily deposit feasibility; automatic close/cutoff/timezone; batch/deposit/fee identifiers; accessible funding API or CSV format; brand/debit/holiday/adjustment exceptions. Express batch totals alone do not answer this.
5. **Notifications and compliance:** any Express/triPOS notification contract and authentication; receipt/signature requirements; approved fraud policy and PCI responsibilities. Until documented, rely on queries and keep the webhook placeholder disabled.

These questions block claiming credentials-only certification readiness for their specific boundaries. They do not block building the foundation, simulator, published XML/JSON clients, recovery framework, HPP fallback, terminal UI, and report/import interfaces now.

## 11. Ordered implementation slices for one worker

All slices use a separate isolated branch/worktree and the normal repository PR workflow when implementation is authorized. This research task creates no PR. Each slice must keep existing Stripe journeys working and pass affected acceptance before the next one. The provider-abstraction port is a dependency: inspect its actual merged state and adapt names once; do not create parallel payment engines or stack on unverified WIP assumptions.

1. **Identity, production guard, and durable attempts (F01/F02/F17).** Files: `api/db/migrate/*_create_payment_identities_and_checkout_sessions.rb`, `*_create_payment_attempts_and_transactions.rb`, `api/app/models/{payment_identity,checkout_session,payment_attempt,payment_transaction}.rb`, `api/app/models/{order,refund,site_setting}.rb`, `api/app/services/payments/{base_provider,provider_resolver}.rb`, new `payments/configuration.rb`, initializer, `api/.env.example`, config serializer/settings controller, focused specs. Backfill known Stripe identities; implement unique reference consumption and owner/snapshot binding. Reject unsafe production/test selection immediately; preserve pending legacy Stripe sessions through an explicit compatibility path, never prefix authority. Dependency: verified provider port.
2. **Common finalizer, inventory, and durable recovery (F01/F03/F04/F08).** Files: new `payments/{finalize_order,compensate_attempt,reconcile_attempt,dispatch_outbox}.rb`, outbox/inventory commitment migrations/models, `api/app/controllers/api/v1/{checkout_sessions,orders}_controller.rb`, admin POS controller, Stripe webhook, `api/app/jobs/{process_payment_reversal_job,payment_recovery_job,outbox_dispatch_job}.rb`, `api/config/{environments/production.rb,queue.yml,recurring.yml}`, queue deployment/worker configuration, request/job/concurrency specs. Persist full intent first; move network calls outside DB locks; ensure webhook/request/POS/reconciliation converge. Prove browser loss and process restart recovery with Stripe fixtures. Dependency: 1.
3. **Refund ledger and original-identity routing (F02/F07).** Files: refund operation migration/model; `payments/{refund_payment,reserve_refund,apply_payment_event}.rb`; `payment_service.rb`, `stripe_provider.rb`, admin orders/refund actions, Stripe webhook, refund/reversal jobs, request/contract specs. Idempotent requests/events, pending amount reservation, monotonic states, lock against concurrent compensation/finalization. Preserve old Stripe refunds through a verified identity mapping. Dependency: 1–2.
4. **Shared simulator and provider-neutral frontend/terminal ports.** Files: `api/app/services/payments/simulation/*`, `worldpay/{simulated_express_client,simulated_tri_pos_cloud_client}.rb`, Stripe simulation client, replacement/facade `test_provider.rb`, simulation tables/routes/authorization, config serializer; `web/src/components/payment/{PaymentForm,SimulatedHostedFieldsForm,PaymentEnvironmentBadge}.tsx`, new `web/src/services/payments/*` and `terminal.ts`, `CheckoutPage.tsx`, `AdminPOSPage.tsx`, dev panel, E2E fixtures. Implement full failure matrix and fake settlement source; badges/report exclusion and production bundle guards. Run F01–F04/F07 attacks against simulation. Dependency: 1–3. This is the first complete no-credentials acceptance milestone.
5. **Express XML clients and online checkout.** Files: `api/app/services/payments/worldpay/{express_client,xml_builder,response_parser,hosted_checkout,token_service}.rb`, `worldpay_provider.rb`, typed contracts/fixtures, session/confirm/return endpoints/routes; `web/src/components/payment/{WorldpayHostedFieldsForm,WorldpayHostedPage}.tsx`, real/fake bridge adapters, checkout resume/status, CSP/config docs. Implement published setup/query/sale/auth/capture/return/void/reversal/token methods and operation-specific recovery. Add legacy HPP fallback and Premium support only to verified contract. Real independent Hosted Fields mapping is blocked only on question 1; do not mark an unimplemented stub ready. Dependency: 4 and consultant bridge guide for the final real-fields adapter.
6. **triPOS Cloud POS and lane administration.** Files: terminal/profile migrations/models, `worldpay/tri_pos_cloud_client.rb`, `payments/terminal_provider.rb`, Stripe terminal adapter, admin terminal/payment controllers/routes/jobs; `AdminPOSPage.tsx`, `AdminPaymentTerminalsPage.tsx`, provider-neutral terminal service and `stripeTerminal.ts` wrapper, JSON fixtures/E2E. Implement pairing, lease/locking, status/resume, sale/debit refund/void/reversal, documented pre-read cancel, ordinary-sale cancel procedure once confirmed, timeout recovery, and receipts. Validate on two-location/two-iPad simulation first, then assigned terminal. Dependency: 2–5; hardware and question 2 for certification.
7. **Settlement and funding reconciliation.** Files: batch/funding/allocation/exception migrations/models, `payments/worldpay/{reporting_client,batch_service}.rb`, `payments/reconciliation/*`, scheduled jobs/import controllers, accounting view/export, `api/app/controllers/api/v1/admin/{dashboard,orders}_controller.rb` report scopes, report specs/E2E. Consume simulated and real paginated reports via same ports; import agreed funding source; repair production revenue/refund calculations and exclude synthetic data. Dependency: 4–6; funding format and cutoff confirmation for exact real import.
8. **Certification pack and activation gate.** Files: `docs/WORLDPAY-CERTIFICATION-RUNBOOK.md`, scrubbed contract fixtures and case mapping, `.env.example` final bridge variables, operational health/alert setup, full affected QA evidence. Fill actual consultant case IDs; close external questions; record certification SHA/device/profile and production funding signoff. Preserve Stripe and old-payment recovery. Dependency: all prior slices and merchant/Worldpay access.

Do not merge a slice with unresolved material acceptance failures. If the provider port is already ahead of this baseline, carry over its good changes and assess migrations/data compatibility before implementing; the defects and invariants above still apply.

## 12. Source index

Official Worldpay documentation used for product/API facts:

- [Express overview](https://docs.worldpay.com/apis/express)
- [Express XML overview](https://docs.worldpay.com/apis/express/express-xml)
- [Express Interface Specification, current PDF](https://docs.worldpay.com/assets/pdf/ExpressInterfaceSpecification3.pdf)
- [Methods](https://docs.worldpay.com/apis/express/express-xml/methods), [Credit](https://docs.worldpay.com/apis/express/express-xml/methods/credit), [Hosted](https://docs.worldpay.com/apis/express/express-xml/methods/hosted), [Services](https://docs.worldpay.com/apis/express/express-xml/methods/services)
- [Classes](https://docs.worldpay.com/apis/express/express-xml/classes), [Enumerations](https://docs.worldpay.com/apis/express/express-xml/enumerations), [Response codes](https://docs.worldpay.com/apis/express/express-xml/responses), [XSD links](https://docs.worldpay.com/apis/express/express-xml/xsd)
- [Hosted Payments](https://docs.worldpay.com/apis/express/hosted-payments), [Requirements](https://docs.worldpay.com/apis/express/hosted-payments/requirements), [Premium](https://docs.worldpay.com/apis/express/hosted-payments-premium)
- [Duplicate checking](https://docs.worldpay.com/apis/express/features/duplicate-checking), [credential on file](https://docs.worldpay.com/apis/express/features/credential), [PASS](https://docs.worldpay.com/apis/express/vas/pass), [receipt requirements](https://docs.worldpay.com/apis/express/features/receipt-requirements)
- [Reporting](https://docs.worldpay.com/apis/express/express-xml/methods/reporting), [Batch methods](https://docs.worldpay.com/apis/express/express-xml/methods/batch)
- [Vantiv test triggers](https://docs.worldpay.com/apis/express/features/test-triggers), [NULL simulator](https://docs.worldpay.com/apis/express/express-xml/null)
- [triPOS Cloud](https://docs.worldpay.com/apis/tripos/tripos-cloud), [Get started](https://docs.worldpay.com/apis/tripos/tripos-cloud/get-started), [Core concepts](https://docs.worldpay.com/apis/tripos/tripos-cloud/core-concepts), [API overview](https://docs.worldpay.com/apis/tripos/tripos-cloud/api-overview)
- [Lane API](https://docs.worldpay.com/apis/tripos/tripos-cloud/tripos-lane/api-specification), [Transaction API](https://docs.worldpay.com/apis/tripos/tripos-cloud/tripos-transaction/api-specification), and the 5.0.4 YAML downloads linked in section 1.5
- [Create lane](https://triposcert.worldpay.com/api/help/kb/cloud/LaneRequest-Post.html), [Update lane](https://triposcert.worldpay.com/api/help/kb/cloud/LaneRequest-Patch.html), [Lane locking](https://triposcert.worldpay.com/api/help/kb/cloud/LaneLocking.html), [Post-response cleanup](https://triposcert.worldpay.com/api/help/kb/cloud/PostResponseCleanup.html)
- [triPOS return](https://triposcert.worldpay.com/api/help/kb/return.html), [transaction query](https://triposcert.worldpay.com/api/help/kb/transactionQuery.html), [request ID](https://triposcert.worldpay.com/api/help/kb/requestid.html)

Access documentation was used only to distinguish a separate API family, not as an Express implementation contract. No vendor messages were sent. Only this spec was written in the research worktree; no commits, pushes, PRs, application servers, device sessions, or main-checkout edits were made. The research browser tab was closed; lifecycle session has no task-owned running resources.
