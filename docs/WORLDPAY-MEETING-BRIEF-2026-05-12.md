# Worldpay / Bank of Guam Meeting Brief

> Historical April–May 2026 source. Read [preservation notes](PRESERVED-WIP-DOCS.md) and the October restart specification before using API or implementation claims.

**Meeting date:** 2026-05-12  
**Prepared:** 2026-05-11  
**Merchant:** B&G Pacific dba Three Squares  
**Current processor:** Stripe  
**Target processor:** Worldpay through Bank of Guam

## Current Direction

Stripe should be treated as an interim implementation/reference point, not the preferred production processor for Three Squares. If BOG/Worldpay confirms the online and POS product path, the cleanest production target is Worldpay-only: online prepaid ordering through Worldpay and card-present POS through triPOS, with funds settling directly to B&G Pacific's merchant account/DDA.

The app has been prepared for this direction by adding provider-neutral payment references and routing refunds through the original order provider. The remaining work is to replace the Stripe-specific frontend checkout and terminal code after Worldpay confirms exact products, credentials, events, and certification steps.

## Why This Meeting Matters

Bank of Guam asked us to be ready to explain the current Stripe process, especially DDA settlement and account setup. The key message is that the application does not hold merchant funds. Today, Stripe owns card processing, merchant onboarding, bank-account setup, settlement timing, and payout reporting. The app creates and verifies payments, stores order/refund references, and reconciles webhook updates.

The Worldpay integration should preserve that same merchant-of-record model: B&G Pacific/Three Squares should keep its own Worldpay/BOG merchant account and DDA settlement path, with Shimizu Technology only providing the software integration.

## Current Stripe Process

1. The customer checks out online in the Three Squares site.
2. The frontend uses Stripe Elements to collect card details.
3. The backend creates/verifies a Stripe PaymentIntent.
4. Once Stripe confirms payment, the app creates the order and stores the Stripe reference.
5. Stripe webhooks reconcile final payment/refund state.
6. Admin refunds call Stripe against the original order's stored Stripe reference.
7. Stripe handles payout batching, bank-account funding, processing fees, and settlement reporting outside the app.

## Current POS Process

1. Admin creates a POS order.
2. For cash, the order can be completed immediately.
3. For card-present orders, Stripe Terminal creates a payment intent for a connected reader.
4. Inventory is now deducted only after terminal payment confirmation.
5. The current POS terminal code is Stripe-specific and should be treated separately from online checkout.

## DDA / Settlement Position

- Current Stripe settlement is managed in Stripe, not inside the Three Squares app.
- The app does not split funds, custody funds, or pay out the merchant.
- For Worldpay, the desired model is direct settlement to B&G Pacific's merchant DDA through Bank of Guam/Worldpay.
- We need BOG/Worldpay to confirm funding schedule, deposit grouping, fee handling, and reporting/export availability.

## Product Path To Confirm

- Online card-not-present: Express API with Hosted Payment Page, iframe/Hosted Fields, or another confirmed Worldpay product.
- Card-present/POS: triPOS Cloud is the current assumption for a browser-based POS, but needs confirmation.
- Existing merchant account: confirm whether the existing MID can be used and which features must be enabled.
- Terminal hardware: confirm approved devices, Guam availability, ordering path, and certification requirements.

## Technical Questions

1. Which exact Worldpay product should Three Squares use for online prepaid ordering?
2. Should online checkout be redirect, iframe, Hosted Fields, or server-to-server?
3. What identifiers will Worldpay return for session, transaction, authorization, capture, refund, and settlement?
4. Which webhook/event types should we subscribe to for authorized, captured/sent-for-settlement, settled, failed, canceled, and refunded payments?
5. How are webhook signatures verified, and can we get sample payloads?
6. Can refunds be created from the API, and what event confirms refund success/failure?
7. How should the app map Worldpay transactions back to orders during hosted checkout return and webhook delivery?
8. What sandbox credentials, test cards, test cases, and certification checklist will be provided?
9. For triPOS, what is the cloud pairing/device lifecycle and how does the browser app initiate and confirm payments?
10. What settlement reports or APIs map transactions to DDA deposits and fees?

## Codebase Readiness As Of May 11

- Added generic provider/reference fields for orders and refunds.
- Added provider-aware verification/refund delegation.
- Preserved legacy Stripe behavior while enabling future Worldpay wiring.
- Prevented migrated refunds from accidentally routing to the currently selected provider instead of the original order provider.
- Added a disabled Worldpay webhook placeholder so routes/config are prepared without accepting live traffic.
- Adjusted POS inventory handling so card-present orders deduct inventory only after terminal payment confirmation.

## Still Blocked On Worldpay / BOG

- final product selection
- sandbox and production credential package
- webhook signature scheme and payload examples
- hosted payment return/cancel URL behavior
- refund API contract
- settlement/DDA report format
- triPOS hardware, pairing, and certification details

## May 12 BOG-Only Update

Worldpay had to reschedule, so the May 12 call was with Bank of Guam only. BOG asked about the current Stripe account/DDA setup and the Stripe reader setup. We explained that Stripe is largely self-service: the merchant links its bank account, the developer retrieves API credentials, and the app points payments to that merchant account.

BOG also raised a hardware distinction that matters for triPOS: Worldpay hardware may need key injection/configuration, and not every reader necessarily works with a browser/web app. The rescheduled Worldpay call should explicitly confirm which triPOS Cloud devices support a web-based POS and which lower-cost devices should be avoided.

BOG also mentioned Authorize.net as another possible gateway option Brad/Worldpay may discuss. This is not yet a decision. The next call should clarify whether Authorize.net is a fallback, a preferred gateway, or simply another supported option.
