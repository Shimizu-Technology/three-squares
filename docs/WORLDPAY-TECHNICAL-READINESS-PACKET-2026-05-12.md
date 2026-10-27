# Worldpay Technical Readiness Packet

**Prepared:** 2026-05-11  
**Meeting:** BOG / Worldpay follow-up on 2026-05-12  
**Project:** B&G Pacific / Three Squares  
**Goal:** Be ready to explain our current payment architecture, desired Worldpay flow, and exact technical asks.

## May 12 Update

Worldpay had to reschedule, so the May 12 call was BOG-only. Christopher Reyes used the call to collect information about the current Stripe account/DDA setup, Stripe reader setup, debit/PIN behavior, and our preference between Hosted Fields and HPP.

New items to carry into the rescheduled Worldpay call:

- BOG expects Worldpay hardware may require key injection/configuration before shipment.
- We need a triPOS Cloud device that can be controlled from a browser/web app, not a reader that only works through a native iOS/mobile app.
- Our online preference is Hosted Fields / Checkout SDK, with HPP as an acceptable phase-one fallback.
- BOG mentioned Authorize.net as another gateway option Brad may discuss.
- Follow-up research suggests Authorize.net is credible for online card-not-present checkout, but triPOS Cloud is still the better card-present/POS fit for a browser-based app.
- No final product decision was made because Worldpay was not present.

## Current Position

Stripe was the interim/reference implementation. The preferred production direction is Worldpay-only through Bank of Guam, assuming BOG/Worldpay confirms the products and onboarding path tomorrow.

The app is a custom Rails API + React storefront/POS. It supports:

- customer online ordering
- prepaid checkout before order finalization
- admin order management
- refunds
- POS/card-present order flow
- inventory tracking
- location-specific menus for Main/Tamuning and Donki
- reporting/CSV exports

The app does **not** custody funds or pay the merchant. The intended payment model is:

`Customer -> Worldpay/BOG merchant account -> B&G Pacific DDA`

Shimizu Technology is only the software layer.

## Readiness Work Already Done

The following code changes prepare the app for Worldpay without enabling live Worldpay traffic yet:

- added `orders.payment_provider`
- added `orders.payment_reference`
- added `orders.payment_session_id`
- added `refunds.payment_provider`
- added `refunds.provider_refund_id`
- added provider-aware payment service routing
- added Stripe, test, and Worldpay provider classes
- changed admin refunds to use the original order provider/reference
- changed online payment verification to go through provider logic instead of direct Stripe calls in the order controller
- changed POS card-present flow so inventory is deducted only after terminal payment confirmation
- added a disabled/conservative Worldpay webhook route

## Review Findings Addressed

### Refund routing

Before readiness work, refunds could route to whichever processor was selected in admin settings at refund time.

Now the app can store the original provider/reference on the order and route refunds through the order's effective provider.

### Online authorization

Before readiness work, online checkout treated `payment_intent_id` as a Stripe PaymentIntent and verified it directly with Stripe.

Now order authorization delegates to `PaymentService.verify_payment`, which lets Worldpay use a different reference model later.

### POS inventory timing

Before readiness work, POS card-present orders deducted inventory when the pending terminal payment was created.

Now card-present POS inventory deduction waits until the terminal payment is confirmed paid.

## Preferred Online Worldpay Flow

Our preferred online checkout target is Hosted Fields / Checkout SDK because it keeps the customer on the Three Squares checkout page, closest to the current Stripe Elements experience. Hosted Payment Pages remains an acceptable phase-one fallback if Worldpay says it is the faster or required certification path.

Expected HPP fallback flow:

1. Customer reviews cart and submits checkout.
2. App creates a pending order or checkout session.
3. Backend calls Worldpay to create an HPP payment session.
4. Backend sends the hosted payment URL/session payload to the frontend.
5. Customer pays on Worldpay-hosted checkout.
6. Worldpay redirects customer back to success/pending/failure/cancel URL.
7. Worldpay webhook confirms final payment status.
8. App marks order paid/confirmed and stores Worldpay references.
9. Admin refunds use the stored Worldpay payment reference.

We need Worldpay to confirm whether order creation should occur before payment as a pending order, or after payment return/webhook using a checkout session reference. The app can support either, but pending order before HPP is usually easier for reconciliation.

## Preferred POS Worldpay Flow

The app is browser/web based, so the likely POS product is triPOS Cloud.

Expected triPOS Cloud flow:

1. Staff creates POS cart in the admin POS screen.
2. Backend creates a pending POS order.
3. App initiates a triPOS Cloud transaction for the selected device/lane.
4. Customer taps/inserts/swipes card on terminal.
5. triPOS/Worldpay confirms approval/capture.
6. App marks order paid/confirmed.
7. App deducts inventory only after successful payment confirmation.

## Data We Plan To Store

We need Worldpay to tell us the exact fields, but the app is prepared to store:

| App field | Intended Worldpay value |
|---|---|
| `orders.payment_provider` | `worldpay` |
| `orders.payment_reference` | durable Worldpay transaction reference, likely `transactionReference` or transaction/payment ID |
| `orders.payment_session_id` | HPP session ID, setup ID, or hosted checkout session reference |
| `refunds.payment_provider` | `worldpay` |
| `refunds.provider_refund_id` | Worldpay refund reference |

If Worldpay has both merchant-supplied and Worldpay-generated IDs, we should store both. The merchant/app reference should be unique and human-traceable, such as:

`TSQ-{order_number}-{short_random_suffix}`

## Technical Details To Ask Worldpay

### Product selection

1. Are we using Access Worldpay Hosted Payment Pages, Checkout SDK/Hosted Fields, Express API Hosted Payments, or another product?
2. Is B&G Pacific being onboarded as Worldpay eCommerce/SMB, Enterprise, or another program?
3. Does the April 3 "Express API" recommendation still apply, or should we use Access Worldpay APIs?
4. Is Authorize.net being suggested as a fallback gateway, a preferred path, or simply another option BOG/Worldpay supports?

### Online checkout

5. For online prepaid orders, should we use redirect, iframe, lightbox, or embedded hosted fields?
6. If HPP is faster for phase one, can the same merchant setup later move to Hosted Fields / Checkout SDK?
7. Should the app create a pending order before redirecting to Worldpay?
8. What success, pending, failure, error, cancel, and expiry return URLs should we register/use?
9. What is the payment session expiration window?
10. Is auto-settlement enabled by default?

### Identifiers

11. Which identifier is durable for lookup/refund/reconciliation?
12. Should we store `transactionReference`, `paymentId`, `TransactionSetupID`, `TransactionID`, or all of them?
13. Can we control the `transactionReference` format?
14. Is there a maximum length or allowed character set for references?

### Webhooks and reconciliation

15. Which events should be enabled for authorization, sent-for-settlement/capture, settlement, failure, cancel/expiry, refund, and chargeback?
16. How are webhooks signed: HMAC header, client certificate, IP allowlist, or some combination?
17. Can they provide sample event payloads?
18. What response code and timeout do they require for webhook acknowledgement?
19. Can events be resent from a dashboard if our endpoint is down?

### Refunds and voids

20. Are full and partial refunds enabled?
21. Are voids/cancellations supported before settlement?
22. What identifier is required to refund?
23. What event confirms refund success/failure?
24. How long do refunds take to appear in merchant/customer reporting?

### Settlement / DDA / accounting

25. What is the expected funding schedule to the B&G Pacific DDA?
26. Are deposits batched daily?
27. Are fees netted from settlement or billed separately?
28. What report/API maps transactions to deposits and fees?
29. Can BOG/Worldpay provide a daily settlement/funding export?
30. Which fields should the app include in reports for B&G accounting?

### POS / triPOS

31. Is triPOS Cloud confirmed for a browser-based POS?
32. Which devices are certified/recommended for B&G/Three Squares?
33. Which lowest-cost device still works with a browser/web app and supports credit, debit/PIN, EMV chip, contactless, refunds/voids, and required certification?
34. Which devices require native iOS/mobile apps or standalone workflows and should be avoided for our web POS?
35. Can the test device ship to Guam?
36. Which devices require Worldpay key injection/configuration before shipment?
37. How are terminals paired to a merchant/location/lane?
38. Does each location need separate device/lane credentials?
39. What is the test/certification checklist for triPOS Cloud?
40. How do we handle abandoned/failed terminal payments?

### Merchant account / pricing

41. Can B&G's existing MID be used?
42. What features need to be enabled on the MID: eCommerce, tokenization, debit, PINless debit, refunds, HPP, triPOS?
43. Are Apple Pay / Google Pay included in scope?
44. Are surcharges/convenience fees disabled? Three Squares does not want a convenience fee.
45. What are the card-present and card-not-present fee structures?

## What We Can Tell Them If Asked

### Application stack

- Backend: Ruby on Rails API
- Frontend: React/Vite web app
- Database: PostgreSQL
- Hosting: web/API deployed as standard HTTPS services
- Webhook endpoint can be served over HTTPS with a trusted certificate

### Current payment model

- App currently has a Stripe reference implementation.
- Payment is required before online order finalization.
- App stores order payment status and refund history.
- App can store generic provider references.
- App can process webhooks idempotently once event IDs/schema are confirmed.

### Desired go-live model

- Worldpay-only production processing.
- B&G Pacific remains merchant of record.
- Funds settle directly to B&G's Bank of Guam DDA.
- App does not touch or redistribute funds.
- App stores transaction/refund references for order management and reconciliation.

### Timeline posture

We are ready to begin implementation as soon as Worldpay confirms:

- product path
- credentials
- sample requests/responses
- webhook signature details
- sandbox/test cases
- certification checklist
- POS device details

## Recommended Implementation Plan After Meeting

1. Update docs with confirmed product path.
2. Replace the placeholder Worldpay provider with real Hosted Fields / Checkout SDK or HPP session creation, based on Worldpay's confirmed path.
3. Add frontend payment launch/return states for the confirmed flow.
4. Add Worldpay webhook verification and payment event handling.
5. Add Worldpay refund/void support.
6. Add payment query/reconciliation fallback.
7. Add settlement report fields/import/export once BOG confirms data format.
8. Implement triPOS Cloud after online payment scope is stable.
9. Remove Stripe code after Worldpay online + POS are certified.

## Do Not Commit To Tomorrow

Avoid promising:

- exact go-live date before sandbox/certification details
- exact fees before BOG prices merchant account/services
- exact settlement behavior before BOG confirms DDA funding reports
- complete Stripe removal before Worldpay online and POS flows are certified
- Latte Stone shipping launch before live label/customs workflow is tested
