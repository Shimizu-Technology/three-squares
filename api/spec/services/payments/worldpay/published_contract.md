# Published Express XML maps — bounded Phase4a PR2

Checked 2026-10-27 against local base `2e5dacb` (main baseline `323ad77`).
Worktree: `/Users/leonshimizu/.t3/worktrees/three-squares/t3-9dd2c273`, branch
`t3/worldpay-published-contract` (T3 renamed the initial `t3/9dd2c273` branch).
Only the three assigned new files belong to this worker. The
parent owns integration, provider normalization, the durable ledger, review,
PR creation, and merge. This worker has no merge authority.

## Context and acceptance

The repository's `docs/WORLDPAY-IMPLEMENTATION-SPEC.md`, sections 1, 3, and 7,
establishes Express online payments, legacy HPP fallback, an unavailable exact
Hosted Fields bridge, and assigned terminal configuration. Three Squares serves
online customers, POS staff, managers, and accounting; B&G Pacific remains the
merchant of record. These maps address the Express backend boundary only.
They do not change checkout, Stripe, fulfillment, accounting, or provider state.
No deployed build or merchant configuration was inspected. No private Brain Dump
content was read.

Acceptance for this slice: static maps use public primary evidence; unsupported
paths have explicit blockers; approved terminal indicators have no numeric
defaults; existing serializer/setup/observation ports consume the compatible
maps in standalone tests; financial results remain `unknown`. No credential,
real transport, Rails boot, database, browser, server, or device is needed.

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
  observation_contracts: contract.observation_contracts
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
- `reporting_layout` records verified request, row, and **per-item** count facts
  for future integration work. It is deliberately not a usable report-parser
  contract. `report_contract` and `pagination_request` raise `Unsupported`.
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

All source access was read-only public GitHub or `docs.worldpay.com` documentation.
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
| Reporting rows/count facts | P4 `ParseResponse` plus P1 pp. 67–68: ReportingData, Items/Item; row TransactionID, ReferenceNumber, TransactionStatus, TransactionAmount. P1 puts CurrentPageNumber, MaxPageCount, MaxRows in each Item. Currency is unmapped. |

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
4. **Reporting requires a different adapter shape.** Current
   `ExpressReportParser.call` requires singular page-count paths relative to
   `Response`. P1 locates counts inside each repeated Item. Current
   `ExpressClient` also requires `page_size_path`, while P1 has fixed pages of
   1,000 and no PageSize input. There is no honest map-only repair for repeated
   counts, encoded/CDATA payloads, empty results, or count consistency. Accessors
   raise explicit unsupported errors; the client without these contracts fails
   before transport. Parent must adapt the port and add primary-backed fixtures.
   Do not turn `reporting_layout` into a parser contract by inventing PageCount,
   TotalCount, top-level CurrentPageNumber, or PageSize.
5. **Currency and some response amounts are unmapped.** The selected credit
   output tables do not establish a transaction CurrencyCode. BalanceCurrencyCode
   is not transaction currency. Completion/Return/Void output tables do not
   establish ApprovedAmount or TransactionAmount. Those observation keys are
   omitted with reasons in `unsupported`. The parser retains no financial cents
   or authoritative currency; all responses remain `unknown`, with
   `contract_verified: false`, even for Express code 0 and status Approved.
6. **Services namespace is unverified in this slice.** No Services methods are
   provided. Existing `Configuration` nevertheless requires all three namespaces.
   `namespaces` alone cannot satisfy it. Parent must obtain independent primary
   evidence or adjust that configuration boundary; never fill the gap by host
   string substitution. Unit tests use an explicitly synthetic Services namespace
   borrowed from local fixture support, never a production fallback.
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

## Verification record and parent continuation

Agent-executed affected-flow unit coverage on Ruby 3.3.4, macOS arm64, local base
`2e5dacb` plus these new files. Fixtures use synthetic account/profile/transaction
identifiers, no PAN, and mocked transport. Test helpers prohibit real
`ExpressTransport` construction and `Net::HTTP.new`. No Rails environment is
loaded and no database is accessed.

| Case | Result | Evidence |
| --- | --- | --- |
| Q1: seven Transaction layouts serialize assigned profile and exact cents; Reporting request uses published parameters | Passed | `published_contract_spec.rb`, per-method builder and pagination examples |
| Q2: missing profile fields, conflicting fields, missing original IDs, PAN/handle/token/invented fields fail closed | Passed | New unit contract examples; transport receives no invalid requests |
| Q3: legacy setup keeps validation server-side, uses configured return URL, refuses missing paired fields/Premium URL | Passed | New setup examples through actual HppSetup and mock ExpressClient |
| Q4: six financial methods retain only mapped observations and never approve money; partial/duplicate/error codes remain unknown | Passed | Actual ExpressReportParser and mock ExpressClient examples |
| Q5: unsupported pagination accessors raise; incomplete client fails before dispatch | Passed | New reporting boundary examples |
| Q6: real Hosted Fields, merchant profile, live HPP/reporting, recovery, durable ledger, UI/device/certification journeys | Not run / blocked | Outside worker scope; dependencies above remain open |

The first focused run had one test expectation using a path without the existing
parser's `Response/` prefix. Corrected the test expectation; no parser change was
needed. The subsequent standalone directory run passed **268 examples, 0 failures**,
including all **19 new examples**. Focused lint passed **2 files, no offenses**.

Commands from `api` (absolute Ruby/Bundler avoids the host's system-Ruby launcher):

```sh
/Users/leonshimizu/.rbenv/versions/3.3.4/bin/ruby /Users/leonshimizu/.rbenv/versions/3.3.4/bin/bundle exec rspec spec/services/payments/worldpay
/Users/leonshimizu/.rbenv/versions/3.3.4/bin/ruby /Users/leonshimizu/.rbenv/versions/3.3.4/bin/bundle exec rubocop app/services/payments/worldpay/published_contract.rb spec/services/payments/worldpay/published_contract_spec.rb
```

Parent's next action: inspect/cherry-pick the local worker commit reported in the
worker response, preserve these unsupported gates, and integrate normalization
and ledger changes separately. Re-test the combined commit before review/merge.
No push, PR, merge, or delegation was performed. No runtime resources were started;
lifecycle session `01a17ca4-ce65-7902-9c68-6e383568bdd1` had no owned resources.
The clean committed worktree is retained for the parent.
