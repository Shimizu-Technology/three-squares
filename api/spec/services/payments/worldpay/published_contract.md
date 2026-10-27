# Published Express XML maps — bounded Phase4a PR2

Checked 2026-10-27 against local base `6d99991` on
`t3/worldpay-published-pagination`. This slice adapts the existing report ports;
the parent owns provider normalization, durable processing, HPP/provider policy,
full integration acceptance, review, PR creation, and merge.

## Context and acceptance

The repository's `docs/WORLDPAY-IMPLEMENTATION-SPEC.md`, sections 1, 3, and 7,
establishes Express online payments, legacy HPP fallback, an unavailable exact
Hosted Fields bridge, and assigned terminal configuration. Three Squares serves
online customers, POS staff, managers, and accounting; B&G Pacific remains the
merchant of record. These maps address the Express backend boundary only.
They do not change checkout, Stripe, fulfillment, accounting, or provider state.
No deployed build or merchant configuration was inspected. Existing project
context was refreshed from the local project status and Phase4a acceptance notes;
no private details from those notes are reproduced here.

Acceptance for this slice: static maps use public primary evidence; unsupported
paths have explicit blockers; approved terminal indicators have no numeric
defaults; existing serializer/setup/observation ports consume the compatible
maps in standalone tests; financial results remain `unknown`. Published reporting
must verify every Item's counts, the exact requested page, fixed 1,000-row page
shape, total/page consistency, unique IDs, and unchanged counts across pages.
Malformed responses, overlapping IDs, and empty results without count proof
must remain incomplete. Tests use synthetic credentials and mocked transport;
no real transport, Rails boot, database, browser, server, or device is needed.

## Interfaces

`Payments::Worldpay::PublishedContract` performs no I/O. All exported hashes,
arrays, paths, keys, strings, and source metadata are frozen recursively.

```ruby
require_relative "published_contract"
contract = Payments::Worldpay::PublishedContract

builder = Payments::Worldpay::XmlBuilder.new(
  configuration: assigned_configuration,
  contract: contract.wire_contract
)

client = Payments::Worldpay::ExpressClient.new(
  configuration: assigned_configuration,
  transport: injected_transport,
  wire_contract: contract.wire_contract,
  setup_contract: contract.setup_contract(presentation: "legacy"),
  observation_contracts: contract.observation_contracts,
  report_contract: contract.report_contract,
  pagination_request: contract.pagination_request
)
```

`assigned_configuration` and `injected_transport` above are integration-owned
inputs, not objects provided or authorized by this module. Construction does
not establish that a complete valid financial request can be sent.

- `wire_contract` returns eight bounded method layouts in the existing
  `XmlBuilder` shape. `request_contract(method)` fetches one, raising
  `PublishedContract::Unsupported < Configuration::Invalid` for unmapped methods.
- `namespaces` returns **only** the verified Transaction and Reporting namespace
  identifiers. They have no trailing slash and do not change with sandbox versus
  production endpoints. `namespace(:services)` raises `Unsupported`.
- `setup_contract(presentation: "legacy")` supplies paths relative to `Response`.
  Other presentations raise `Unsupported`; no Premium contract is supplied.
- `observation_contracts` supplies six credit response maps relative to
  `Response`. They do not classify success, refund, capture, cancellation, or
  partial approval. `ApprovedAmount` is retained as a reported string only.
- `reporting_layout` preserves the original evidence map. `report_contract`
  adapts it to the parser's per-Item count mode and adds the selected P4 row
  fields. `pagination_request` supplies `page_number_path` and
  `fixed_page_size: 1000`; it supplies no `page_size_path`.
- `Configuration` accepts the verified Transaction and Reporting namespaces
  without a Services namespace. A Services operation with no explicit namespace
  fails before transport. No namespace is derived from a hostname.
- `unsupported`, `SOURCES`, and `CHECKED_ON` expose limitations and provenance.
  No map represents merchant assignment or certification.

## Primary sources and age

Age is whole calendar days at 2026-10-27. GitHub dates identify the last commit
publishing the cited file revision, not its original publication or current
processor support. The PDF cover says February 2026; its document history dates
version 3.1.7 to 2026-02-28. Its example response has a March 2026 timestamp; that
example is not an independent publication date or a test performed here.

- **P1:** [Worldpay Express Interface Specification 3.1.7](https://docs.worldpay.com/assets/pdf/ExpressInterfaceSpecification3.pdf),
  history date 2026-02-28; age **241 days**. SHA-256 of the public PDF read here:
  `9c35a5590fc4e702911232b71fb0e1ec1e040f20f03a60c009e429153ff333c3`.
  Page references below use the printed page numbers. The URL can change;
  re-check its version and hash when integrating.
- **P2:** [ElementPS Express.CSharp README, pinned revision](https://github.com/ElementPS/Express.CSharp/blob/ad180f2dead0cf93efa29d139e51aa2b1bcce415/README.md),
  updated 2018-07-19; age **3,022 days**. Steps 1 and 3 show XML sale request and
  response, distinct from the SOAP examples. The response's transaction date is
  2015; it does not prove a present-day merchant profile.
- **P3:** [ElementPS HostedPayments.CSharp README, pinned revision](https://github.com/ElementPS/HostedPayments.CSharp/blob/2197ca44802ad3aa24bc6c13f0ec0c7473b38a91/README.md),
  updated 2018-07-19; age **3,022 days**. Steps 1 and 3 show legacy setup XML and
  the paired setup ID/validation code. P1 pp. 82–83 independently lists these
  fields. No browser-return hint is used as financial truth.
- **P4:** [ElementPS TransactionQuery.CSharp HomeController, pinned revision](https://github.com/ElementPS/TransactionQuery.CSharp/blob/734635bbe67364a90613d6cad851836c73e1fd85/TransactionQuery.CSharp/Controllers/HomeController.cs),
  updated 2018-12-16; age **2,872 days**. `buildTransactionQuery` establishes the
  Reporting namespace and date-range parameter section; `ParseResponse` selects
  `Response/ReportingData/Items/Item` and reads the mapped row fields. This is
  **TransactionQuery**, not evidence of pagination by itself. P1 pp. 67–68
  establishes pagination and specifies the same reporting-data format.

This adaptation re-read the supplied PDF text and pinned P4 controller source.
The PDF SHA-256 matched P1 above. The parent had visually inspected printed
pp. 67–68 (physical PDF pages 68–69). No further source download was needed.
No Worldpay transaction, hosted, health, reporting-query, Services, or other
processing endpoint was contacted. Endpoint names appearing in XML or fixtures
are identifiers, not network calls. No sample programs were executed.

## Map provenance

| Map | Exact evidence and bounded selection |
| --- | --- |
| Transaction namespace and sale root/envelope | P2 Steps 1/3; P1 pp. 117–118. `CreditCardSale`, `CreditCardSaleResponse`, `Response`, and the namespace identifier are published. |
| Reporting namespace | P4 `buildTransactionQuery` / `ParseResponse`. It is reused for the Reporting-interface method established by P1 pp. 67–68, not derived from a certification host. |
| Credential/application envelope | P2/P3 Step 1 and every selected P1 method table. Existing `XmlBuilder` owns credentials, application identity, and root `IdempotencyKey`; this module does not introduce another credential map. P1 pp. 117–119 supports transaction-root idempotency, excludes Reporting/Services, and leaves some non-payment method support conditional. |
| Terminal names | P2/P3 Step 1: TerminalID and seven presence/input/capability/environment/MOTO/CVV indicators. P1 p. 95 Terminal class adds LaneNumber and TerminalType. No sample numeric values are copied. |
| Common Transaction fields | P1 pp. 34–39, 41, 43, 46, 82 and Transaction class pp. 96–97: TransactionAmount, ReferenceNumber, TicketNumber, MarketCode, PartialApprovedFlag. Method tables explicitly require the flag for sale/auth/setup; generic optional Transaction fields permit its inclusion elsewhere. |
| Sale request / observations | P1 pp. 34–36 plus P2 Steps 1/3. Request uses the common subset; response maps Transaction/TransactionID, Transaction/ReferenceNumber, Transaction/TransactionStatus, Transaction/ApprovedAmount. Reference is conditional in the output table. |
| Authorization request / observations | P1 pp. 36–38. Common request subset and the same four response paths, independently verified for this method. No capture is inferred from authorization. |
| Completion request / observations | P1 pp. 38–39. Adds required original TransactionID; maps response TransactionID, ReferenceNumber, TransactionStatus. No method-specific response amount is established by this output table. |
| Linked Return request / observations | P1 pp. 41–42. Adds required original TransactionID; maps response TransactionID, ReferenceNumber, TransactionStatus. No guessed response amount. The documented return window does not become application authorization here. |
| Void request / observations | P1 pp. 43–44. Adds required original TransactionID; maps response TransactionID, ReferenceNumber, TransactionStatus. No guessed response amount. Full original amount/current batch and recovery sequencing remain integration responsibilities. |
| Known-ID Reversal request / observations | P1 pp. 46–47. ReversalType, TransactionID, common request subset; response TransactionID, ReferenceNumber, TransactionStatus, ApprovedAmount. Full/Partial require an original ID. System omits it and requires a separate instrument group, which is unsupported here. |
| Legacy setup request | P1 pp. 82–83 and P3 Step 1. Common request subset plus TransactionSetup/TransactionSetupMethod, Embedded, CVVRequired, AutoReturn, ReturnURL. ReturnURL comes from server configuration. |
| Legacy setup response | P1 p. 83 and P3 Step 3: Response/TransactionSetup/TransactionSetupID and Response/TransactionSetup/ValidationCode. Other copies of the ID are not fallback paths. |
| Pagination request | P1 pp. 67–68: Parameters/TransactionDateTimeBegin, TransactionDateTimeEnd, PageNumber; optional ReferenceNumber, TransactionStatusCode, TransactionType, LaneNumber, ReverseOrder. Other published optional filters are outside this subset. No PageSize is published. |
| Reporting rows/count facts | P4 `HomeController.cs` lines 132–155 plus P1 pp. 67–68: ReportingData/Items/Item; TransactionID, AccountID, AcceptorID, TerminalID, ApprovalNumber, ExpressResponseCode, ReferenceNumber, TransactionAmount, TransactionStatus, TransactionStatusCode, TransactionType. P1 puts CurrentPageNumber, MaxPageCount, MaxRows in each Item. Currency is unmapped. |

Field lists are a deterministic application serialization order. No downloaded
XSD was consulted and no claim of schema-validation or complete vendor-field
coverage is made. Paths contain the exact case shown by the cited evidence.

## Explicit unsupported boundaries and integration blockers

1. **Assigned profile remains unavailable.** The public terminal names are not
   assigned values or a complete merchant-specific requirements guide. This
   slice requires every listed Terminal field plus MarketCode and
   PartialApprovedFlag from the approved server profile. That is an application
   precondition, including the partial policy on methods where it is optional.
   `TransactionSetupMethod`, Embedded, CVVRequired and AutoReturn must also be
   explicitly supplied; the last two are deliberately required application
   policy even though the vendor table makes them optional. No numeric defaults,
   sample terminal settings, lane values, or flag values are installed.
2. **Instrument mapping remains unavailable.** Sale/auth layouts are partial
   request shapes: no Card/PAN, PaymentAccount, Token, or Hosted Fields handle
   mapping is included. Their successful local serialization is not proof of
   a sendable sale/auth request. The external Hosted Fields guide is still
   unavailable. Parent must gate instrument-dependent dispatch.
3. **Reversal conditions need integration enforcement.** The static required-ID
   layout represents Full/Partial only. The existing builder validates names and
   required paths, not enum values, reversal policy, original identity/amount,
   open-batch state, or timing. Parent must validate the assigned ReversalType
   and allowed operation before dispatch. A supplied System value is not made
   valid by including an ID. No-ID/System recovery remains explicitly unsupported
   without the no-PAN instrument contract. No automatic recovery sequence is added.
4. **Reporting enumeration now uses the verified layout.** Pass both published
   accessors to `ExpressClient`. It sends `Parameters/PageNumber` only and refuses
   a custom size. Each Item must supply the same three counts. The parser checks
   `MaxPageCount == ceil(MaxRows / 1000)` and the exact expected row count for
   the page. `query_all` checks requested page, stable counts, and all unique IDs;
   any overlap, including identical IDs, makes published enumeration incomplete.
   An empty published report has no per-Item count proof and stays incomplete,
   even if unverified top-level count fields appear. No complete empty checkpoint
   is inferred. Generic top-level contracts remain available for existing tests.
5. **Currency and some response amounts are unmapped.** The selected credit
   output tables do not establish a transaction CurrencyCode. BalanceCurrencyCode
   is not transaction currency. Completion/Return/Void output tables do not
   establish ApprovedAmount or TransactionAmount. Those observation keys are
   omitted with reasons in `unsupported`. The parser retains no financial cents
   or authoritative currency; all responses remain `unknown`, with
   `contract_verified: false`, even for Express code 0 and status Approved.
6. **Services namespace remains unverified.** No Services mapping is supplied.
   `PublishedContract.namespaces` can now configure Transaction/Reporting without
   a placeholder. Calling a Services operation without its namespace fails before
   HTTP construction. Obtain independent primary evidence before enabling it;
   never fill the gap by host substitution.
7. **Premium and non-sale HPP variants are outside this map.** No HPType, separate
   hosted URL path, Premium setup contract, token-creation setup, force approval
   field, or SDK mapping is supplied. Parent must constrain allowed assigned setup
   methods; the generic builder does not enforce enum-specific conditional fields.
   A legacy setup contract must not be reused to authorize Premium behavior.
8. **Integration and certification remain pending.** Parent owns identity/amount/
   reference matching, duplicate/recovery policy, financial normalization, durable
   persistence, review, and the final acceptance ledger. No client observation was
   promoted to captured/refunded. No contract is marked assigned or certified;
   this slice does not establish credentials-only or production readiness.

## Reporting bounds and retained observations

`ExpressReportParser.call` accepts `requested_page:`; published mode requires an
integer from 1 through 1,000. `ExpressClient` always supplies it. Direct XML must
have `ReportingData/Items/Item`. Escaped or CDATA payloads are parsed once, using
explicit embedded roots `ReportingData` or `Items`, with either no namespace or
the verified Reporting namespace. Other wrappers, mixed namespaces, duplicate
containers/scalars, nested mapped scalars, and DTD/entities are rejected. These
embedded wrappers are bounded parser compatibility shapes, not a claim that a
specific merchant deployment emits them.

Reporting responses have an **8 MiB** byte cap and **200,000** XML-reader node
cap. Transaction and Services responses retain **64 KiB** and **4,096** nodes.
Both modes retain depth **16** and at most **1,000** element children per node;
reports also have at most **1,000** Item rows. The transport selects response
limits by interface and checks both Content-Length and streamed bytes. Requests
retain the 64 KiB cap. `query_all` defaults to and caps aggregate retained rows
at **10,000**, with a 1,000-page bound; larger windows need parent-owned bounded
range splitting. An incomplete result may retain earlier bounded observations
but must never authorize a durable complete checkpoint.

Rows retain `raw_id` and `reference_number` at the top level. Their metadata adds
`account_id`, `acceptor_id`, `terminal_id`, `approval_number`,
`express_response_code`, `transaction_type`, and `status_code`, alongside
`provider_status` and the string `reported_amount`. Missing or empty optional
facts are omitted; missing/empty/invalid IDs invalidate the page. Exact mapped
AccountID/AcceptorID echoes may be retained for identity matching. The
AccountToken remains forbidden everywhere, as do identifiers echoed in other
mapped fields. Parent owns matching these observations to the assigned identity.

No CurrencyCode is mapped. `reported_currency`, `reported_amount_cents`, all
financial cents, and authoritative currency stay nil; financial status stays
`unknown`. Unknown field **names** may be recorded, with bounded cardinality;
unknown values, card/PAN, expiry, and card-token values are discarded. Contracts
cannot alias mapped observations onto sensitive field paths.

## Verification record and parent continuation

Agent-executed affected-flow unit coverage on Ruby 3.3.4, macOS arm64, local base
`6d99991` plus this worker's changes. Fixtures contain synthetic identifiers.
Report/client tests prohibit real ExpressTransport construction and HTTP access;
transport tests stub the entire Net::HTTP connection and open no sockets.
No Rails environment was loaded and no database was accessed.

| Case | Result | Evidence |
| --- | --- | --- |
| Q1: existing financial serialization/setup/observation contracts and financial outcomes | Passed | Existing standalone Worldpay directory; financial maps unchanged |
| Q2: published request has PageNumber and no PageSize; verified namespaces need no Services placeholder | Passed | Published-contract, configuration, and client specs; missing Services fails before dispatch |
| Q3: primary-backed observations, discarded unknown/card/expiry/token values, unknown currency/money | Passed | Published report-parser examples through real parser and injected client |
| Q4: every Item count, requested page, page/total/row consistency, duplicate/missing/malformed IDs | Passed | Report-parser adversarial examples |
| Q5: full 1,000-row direct/CDATA pages above 64 KiB, known embedded roots, XML and transport limits | Passed | Report-parser and mocked HTTP transport examples |
| Q6: multiple pages, stable totals, changed/identical overlaps, later malformed pages, aggregate/page limits, unproven empty results | Passed | Published client examples; generic contracts retained |
| Q7: live reporting/HPP, provider normalization, durable checkpoints, full API/web/release gate, UI/device/certification | Not run | Parent-owned integration or outside the authorized worker scope |

The first directory run found the old unsupported-accessor expectation; it was
updated for the implemented interface. The final standalone directory run passed
**292 examples, 0 failures**, including all original contracts and 22 additional
examples. Final focused lint passed **12 files, no offenses**. `git diff --check`
passed. Bounds examples assert the specific byte/node/child/depth errors so a
malformed fixture cannot conceal an ineffective limit.

Commands from `api`, using Ruby/Bundler 3.3.4:

```sh
bundle exec rspec spec/services/payments/worldpay --format progress
bundle exec rubocop app/services/payments/worldpay/{configuration,express_client,express_report_parser,express_transport,hpp_setup,published_contract}.rb spec/services/payments/worldpay/{client_contract_support,configuration_spec,express_client_spec,express_report_parser_spec,express_transport_spec,published_contract_spec}.rb
```

Parent's next action: review/cherry-pick the worker commit, consume both published
reporting accessors, and retest the combined implementation. Durable persistence,
normalization, HPP/provider policy, required review, and the full acceptance gate
remain parent-owned. No push, PR, merge, delegation, provider query, credentials
lookup, database, Rails boot, or runtime service was performed by this worker.
The committed worker worktree is retained for the parent; lifecycle ownership is
reported in the local handoff and final worker response.
