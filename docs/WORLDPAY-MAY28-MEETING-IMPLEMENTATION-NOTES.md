# Worldpay May 28 Meeting + Implementation Notes

**Prepared:** 2026-05-28  
**Merchant:** B&G Pacific / Three Squares  
**BOG contact:** Christopher Q. Reyes  
**Worldpay contacts:** Brad Dangelo, Dodie Radliff, Kara Delaney  
**Source transcript:** `Brain-Dump/work/shimizu-tech/three-squares/6) Meeting with BOG and WorldPay - May 28, 2026.md`

## Client follow-up to send tomorrow

Auntie Marie already said there is no rush and to schedule in June once Leon is settled. Still, when ready, send a light update asking for the merchant approval needed to open the Worldpay project:

> Hafa Adai Auntie Marie! Quick update from the BOG/Worldpay meeting — it went well and they confirmed the path we were hoping for.
>
> For online payments, they said we’d likely use Worldpay Express Hosted Fields, which means customers can pay directly through the Three Squares site. For in-person payments/POS, they confirmed triPOS Cloud, which is the Worldpay terminal setup that can work with a web-based app like ours.
>
> The next step is simple: BOG/Worldpay needs B&G to confirm that you want them to open the project for Three Squares. It doesn’t have to be a meeting right now — an email confirmation should be enough, and then BOG can start the formal scoping/onboarding process.
>
> No rush today especially with everything going on. I just wanted to keep you updated since we finally got the Worldpay answer. We can talk more in June when things settle down.

If she confirms, email CJ and include Auntie Marie / B&G on the thread so BOG can attach the approval chain to the project request.

## May 28 meeting outcome

Worldpay confirmed the correct path for this project is:

- **Online / card-not-present:** **Express API + Express Hosted Fields**
- **In-person / card-present POS:** **triPOS Cloud**
- **Likely terminal:** **Ingenico Lane 3600**
- **Project model:** open a project on behalf of the **merchant** rather than opening an ISV project first

This is good news because it matches the two main requirements:

1. embedded online payment fields inside the Three Squares web checkout; and
2. a terminal/card reader that can be controlled by a browser/web-based POS.

## Why merchant project first

Worldpay said a full ISV project has backlog and can take much longer. The faster path is to open a merchant-specific project for B&G / Three Squares first, similar to their GTA example.

Worldpay/BOG needs the merchant to explicitly approve opening the project. Email approval is acceptable.

## Next steps from BOG/Worldpay

1. Leon asks B&G / Auntie Marie to confirm they want BOG/Worldpay to open the integration project.
2. CJ/Dodie include the merchant approval email chain in the project request.
3. BOG/Worldpay submits a solution request.
4. Worldpay assigns a Solution Consultant.
5. Scoping call happens.
6. Worldpay prepares Statement of Work / scope document.
7. Leon reviews/signs scope.
8. Implementation Consultant is assigned.
9. Worldpay provides sandbox access, test scenarios, and test device.
10. Leon implements and certifies.

Important caution from Worldpay: be very thorough in the initial scope. Mid-project scope changes can cause delays or require a separate project.

## Scope to be thorough about

Include at least:

- Express Hosted Fields / online card-not-present checkout
- sales / authorization-capture behavior for prepaid online ordering
- customer return/cancel handling
- transaction lookup/query by app reference
- full and partial refunds
- voids/cancellations before settlement
- duplicate/idempotency handling
- tokenization only if needed; otherwise explicitly out of scope for phase one
- triPOS Cloud for browser-based POS
- Lane 3600 or approved equivalent terminal
- credit, debit, PIN debit, PINless debit if desired/available
- contactless EMV / tap, chip, swipe if supported
- Quick Chip if supported
- per-location/lane setup for Main/Tamuning and Donki
- test device shipment to Guam
- settlement/reporting fields needed for B&G accounting

## Worldpay Express documentation findings

Source reviewed: `https://docs.worldpay.com/assets/pdf/ExpressInterfaceSpecification3.pdf`.

### API style

Express supports XML over HTTPS POST. SOAP is legacy and should not be used.

Credentials in requests generally include:

- `AccountID`
- `AccountToken`
- `AcceptorID`

Application fields generally include:

- `ApplicationID`
- `ApplicationName`
- `ApplicationVersion`

### Hosted Payments / Hosted Fields shape

Express Hosted Payments works by calling `TransactionSetup` first. Worldpay returns a `TransactionSetupID`, which identifies that purchase.

For Hosted Payment Page / Window, the payment UI uses:

```text
https://certtransaction.hostedpayments.com/?TransactionSetupID=...
```

For Three Squares, Worldpay said **Express Hosted Fields**, so we need the exact hosted-fields implementation guide from the Implementation Consultant. Public PDF confirms the broader Hosted Payments/TransactionSetup model, but may not be enough by itself for hosted fields.

`TransactionSetup` required fields include, among others:

- `TransactionAmount`
- `ReferenceNumber`
- `TicketNumber`
- `MarketCode`
- `PartialApprovedFlag`
- `TerminalID`
- `LaneNumber`
- `TransactionSetupMethod`
- `Embedded`

`TransactionSetupID` expires after one of:

- 10 minutes,
- 5 decline attempts,
- or 1 approval.

### Return / result fields

Hosted Payments return/query fields may include:

- `HostedPaymentStatus` (`Complete` or `Cancelled`)
- `TransactionSetupID`
- `TransactionID`
- `ExpressResponseCode`
- `ExpressResponseMessage`
- `AVSResponseCode`
- `CVVResponseCode`
- `ApprovalNumber`
- `LastFour`
- `ValidationCode`
- `CardLogo`
- `ApprovedAmount`
- `PaymentAccountID`

Store at minimum:

- `TransactionSetupID` → `orders.payment_session_id`
- `TransactionID` → `orders.payment_reference`
- `ReferenceNumber` / app order reference → app-generated value like `TSQ-{order_number}` or checkout-session reference
- response/status fields for audit/debugging, preferably in future `payment_metadata` JSONB

### Refunds and voids

Express has:

- `CreditCardReturn` for refunding a prior transaction; it requires the previous `TransactionID` and can only be used for transactions no greater than 45 days old.
- `CreditCardVoid` for backing out a previous sale/current-batch transaction; full amount only.

This means admin refund logic must distinguish:

- unsettled/current-batch transaction → void if appropriate;
- settled transaction → return/refund;
- older than allowed window → operational/manual handling may be needed.

### Transaction lookup

`TransactionQuery` retrieves non-sensitive transaction data. Public docs say non-sensitive transaction data is available up to 365 days and query output includes XML reporting data.

This should be used as fallback reconciliation in addition to any return/webhook flow.

### Idempotency

Express supports `IdempotencyKey` for XML/REST transaction requests. Use a unique GUID per app payment attempt to avoid duplicate charges on retries/timeouts.

## triPOS Cloud documentation findings

Sources reviewed:

- `https://triposcert.worldpay.com/api/help`
- `https://triposcert.worldpay.com/api/help/kb/cloud/LaneRequest-Patch.html`
- `https://triposqa.vantiv.com/api/help/kb/display.html`

triPOS Cloud is specifically for web/cloud-based POS control of payment devices.

Supported triPOS Cloud display/custom-form devices listed publicly include:

- Verifone Mx915, Mx925
- Ingenico Link2500
- Ingenico Lane3000 / Lane3000 Deluxe
- Ingenico Lane3600
- Ingenico Lane5000
- Ingenico Lane7000 / Lane7000 Deluxe
- Ingenico Lane8000 / Lane8000 Deluxe
- Ingenico Move5000

Worldpay/BOG specifically mentioned **Lane 3600** as a good/easy option.

Optional lane features can include:

- Quick Chip
- Contactless MSD
- Contactless EMV
- Quick Chip data lifetime
- Language

Caveat: these are device/software/account/gateway dependent. BOG/Worldpay must confirm which features are enabled for B&G.

## Current codebase state

The codebase is already partially provider-aware:

- `PaymentService` delegates to provider adapters.
- `Payments::WorldpayProvider` exists but is a stub.
- Orders/refunds have generic provider/reference fields.
- `CheckoutSessionsController` exists and can return provider-aware session data.
- `ConfigController` exposes `payment_processor` and `payment_checkout_mode`.
- Worldpay webhook route/controller exists but is intentionally not implemented.

Still Stripe-specific:

- `web/src/pages/CheckoutPage.tsx` only supports Stripe embedded checkout in production.
- `web/src/components/payment/StripeProvider.tsx` wraps the page globally.
- `web/src/components/payment/PaymentForm.tsx` is Stripe-shaped for embedded card entry.
- `api/app/controllers/api/v1/admin/pos_orders_controller.rb` creates Stripe Terminal PaymentIntents directly.
- `web/src/services/stripeTerminal.ts` is Stripe Terminal SDK-specific.
- `SiteSetting::LIVE_PAYMENT_PROCESSORS` only allows `stripe` in production.

## Implementation plan before credentials arrive

### Phase 1 — Data/model prep

Add if not already present:

- `payment_metadata` JSONB on `orders`
- maybe `refund_metadata` JSONB on `refunds`
- `payment_attempts` table if we want robust idempotency/audit before final implementation

Recommended `payment_attempts` fields:

- order/check-out-session reference
- provider
- idempotency_key
- amount_cents
- status
- transaction_setup_id
- transaction_id
- raw_request_summary
- raw_response JSON/XML parsed summary

### Phase 2 — Express client service

Create service classes:

- `Payments::Worldpay::ExpressClient`
- `Payments::Worldpay::XmlBuilder`
- `Payments::Worldpay::ResponseParser`
- `Payments::Worldpay::HostedFieldsSession`

Initial methods:

- `health_check`
- `transaction_setup(amount_cents:, reference_number:, ticket_number:, return_url:, embedded: true, ...)`
- `transaction_query(transaction_setup_id: nil, transaction_id: nil, reference_number: nil)`
- `credit_card_return(transaction_id:, amount_cents:, reference_number:)`
- `credit_card_void(transaction_id:, reference_number:)`

Use env vars:

```text
WORLDPAY_EXPRESS_ACCOUNT_ID
WORLDPAY_EXPRESS_ACCOUNT_TOKEN
WORLDPAY_EXPRESS_ACCEPTOR_ID
WORLDPAY_EXPRESS_APPLICATION_ID
WORLDPAY_EXPRESS_APPLICATION_NAME=Three Squares
WORLDPAY_EXPRESS_APPLICATION_VERSION=...
WORLDPAY_EXPRESS_CERT_URL=https://certtransaction.elementexpress.com
WORLDPAY_EXPRESS_HOSTED_URL=https://certtransaction.hostedpayments.com
WORLDPAY_EXPRESS_PROD_URL=... # provided by implementation consultant
WORLDPAY_EXPRESS_HOSTED_PROD_URL=... # provided by implementation consultant
```

Exact production URLs and application credentials must be confirmed by Worldpay.

### Phase 3 — Online checkout flow

Because `TransactionSetupID` expires quickly, create payment setup only after cart/contact/fulfillment is validated.

Recommended flow:

1. Customer submits checkout form.
2. Backend validates cart and pricing.
3. Backend creates a **pending order** or **checkout session record** with amount and line items.
4. Backend calls Express `TransactionSetup` / hosted-fields setup.
5. Backend returns hosted-fields config/session to frontend.
6. Frontend renders Express Hosted Fields and completes payment.
7. Frontend receives result or returns to app.
8. Backend verifies via `TransactionQuery` before finalizing order.
9. Order is marked paid/confirmed and generic Worldpay fields are stored.

Need Worldpay to provide the hosted-fields JavaScript/iframe details.

### Phase 4 — Frontend provider-aware checkout

Refactor checkout so production can handle:

- `provider: stripe, flow: embedded`
- `provider: worldpay, flow: hosted_fields`
- `provider: worldpay, flow: hosted_page` as fallback if needed
- `provider: test, flow: simulated`

Likely files:

- Replace hardcoded Stripe branch in `CheckoutPage.tsx`.
- Add `WorldpayHostedFieldsForm.tsx`.
- Make `PaymentForm` provider-aware.
- Avoid wrapping entire checkout in `StripeProvider` when active provider is Worldpay.

### Phase 5 — Refunds/voids

Implement in `WorldpayProvider.refund_payment`:

1. Check order/provider metadata.
2. If unsettled/current batch and full amount, use `CreditCardVoid` if allowed.
3. Otherwise use `CreditCardReturn` with original `TransactionID`.
4. Store provider refund/void reference and raw response summary.

Need Worldpay to confirm partial refund support for this merchant/path.

### Phase 6 — triPOS Cloud POS

Do after online scope is stable.

Needed pieces:

- backend triPOS Cloud client
- lane/device configuration model/table
- admin UI to select lane/device per location
- endpoint to initiate card-present sale
- endpoint/polling/webhook/confirmation to mark POS order paid
- replace `stripeTerminal.ts` with provider-aware terminal service

Potential env vars:

```text
WORLDPAY_TRIPOS_BASE_URL
WORLDPAY_TRIPOS_AUTH_* # exact auth scheme TBD
WORLDPAY_TRIPOS_ACCEPTOR_ID / ACCOUNT_ID / ACCOUNT_TOKEN if shared
```

Exact triPOS auth, lane IDs, and request/response contract must come from the Implementation Consultant.

## Questions still needed from Implementation Consultant

1. Exact Express Hosted Fields guide and JS/iframe integration steps.
2. Does Hosted Fields still use `TransactionSetupID`, and which `TransactionSetupMethod` value?
3. Required terminal settings for eCommerce hosted fields.
4. Exact `MarketCode`, `TerminalID`, `LaneNumber`, and terminal class values for online CNP.
5. Return URL behavior for Hosted Fields.
6. Whether webhooks/callbacks exist for Express Hosted Fields, or if we should rely on synchronous result + `TransactionQuery`.
7. Sandbox/cert URLs and production URLs.
8. Test trigger amounts/cards for B&G's processor path.
9. Whether partial refunds are enabled.
10. Settlement/report fields that map to BOG deposits.
11. triPOS Cloud auth scheme and lane/device provisioning steps.
12. Lane 3600 feature support: chip, tap/contactless EMV, debit/PIN, PINless debit, Quick Chip, refunds/voids.

## Immediate recommendation

Do **not** wait to start all work. Before credentials arrive, we can safely:

1. Add payment metadata/audit tables.
2. Build the Express XML client skeleton with mock/test responses.
3. Refactor frontend checkout to support non-Stripe providers.
4. Implement Worldpay provider methods behind feature flags/env checks.
5. Add tests around provider-aware checkout, idempotency, verification, refund/void decisioning.

Do **not** hardcode final Express field values until Worldpay provides the official project scope and credential package.
