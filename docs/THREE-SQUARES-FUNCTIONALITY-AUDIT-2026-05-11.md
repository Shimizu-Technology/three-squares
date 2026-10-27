# Three Squares Functionality Audit

> Historical April–May 2026 source. Read [preservation notes](PRESERVED-WIP-DOCS.md) and the October restart specification before using API or implementation claims.

**Prepared:** 2026-05-11  
**Sources reviewed:** Three Squares Feb 19 transcript, Three Squares Mar 13 transcript, BOG/Worldpay Apr 3 transcript and recap, project status notes, PRD, current app routes/models/pages.

## Executive Summary

The app covers the main Three Squares launch need: online prepaid ordering for Main/Tamuning and Donki, admin order handling, product/location management, catering inquiry capture, POS mode, refunds, inventory, notifications, and reporting exports.

The biggest unfinished area is not the restaurant workflow. It is the payment-provider migration. The app is still Stripe-heavy in frontend checkout and POS terminal code, but the backend now has provider/reference fields and provider-aware routing so Worldpay can be wired in cleanly once BOG/Worldpay confirms the exact product path.

The second unfinished area is the broader B&G roadmap: Latte Stone Cookies shipping/label purchase, deeper catering quote workflow, accounting/settlement reconciliation, Revel/Clover integration, and future wholesale/reservations/time-clock ideas.

## Functionality Matrix

| Requested capability | Current status | Evidence / notes | Next action |
|---|---:|---|---|
| Replace/host B&G Pacific website under existing domain | Partial | App has full storefront, pages, business-line routing, domain guide exists. Domain transfer/DNS still non-code blocker. | Get Squarespace/domain access and production DNS plan. |
| Online ordering without app download | Done | Public React storefront, cart, checkout, guest orders. | QA on real phones before launch. |
| Main/Tamuning and Donki as separate ordering locations | Done | Location model, product-location availability, location picker, location filters, Donki route/query support. | Confirm final live menus and hours. |
| Donki online prepay because they do not take phone orders | Functionally ready except live Worldpay | Checkout supports prepaid orders; payment provider still pending. | Implement Worldpay online flow before live launch if Stripe is removed. |
| No convenience fee | Done | Current order pricing has subtotal + shipping + tax, no convenience fee line. | Confirm if payment fees stay absorbed by merchant. |
| Location-specific menus and pricing | Mostly done | Products can be scoped to locations; app notes mention location overrides. | Confirm all Donki/Main menu data and market-price items. |
| Cart and checkout | Done | Cart API/store, checkout integration specs, order creation. | Retest after Worldpay checkout replacement. |
| Customer pickup order workflow | Done | Orders have fulfillment type, location, pickup queue, statuses. | Staff training and device setup. |
| Admin order management | Done | Orders index/show/update, filters, CSV export, refund, notify. | Real operational QA with Marie/Liv. |
| Refunds | Backend ready; provider-specific Worldpay pending | Stripe/test refunds work; generic provider fields added; Worldpay refund stub exists. | Ask Worldpay for refund API/event contract. |
| Inventory tracking | Done for normal flow; improved for POS card-present | Product/variant inventory, audits, stock adjustment; POS card-present now deducts only after payment confirmation. | QA partial refunds/cancellations by product type. |
| Catering inquiry system | Done for inquiry capture/admin; partial for full quote lifecycle | Public catering create/info; admin catering index/update/destroy/quote/status. | Validate with Marie if quote/proposal/contract/payment flow is enough. |
| Catering/platter products as orderable menu items | Done if data is loaded/published | Catering product collections/business-line filtering exists. | Confirm final platter pricing, lead times, and market-price handling. |
| Seasonal/special menus and banners | Mostly done | Homepage sections, announcement banner, collections, product publish/archive. | Confirm Thanksgiving/anniversary campaign workflow. |
| Product photos and branding | Partial | Image upload and assets exist; project notes still flag photos/logo as content blockers. | Load final images/logos from Liv/team. |
| Business lines: Three Squares, Latte Stone Cookies, Catering | Mostly done | Storefront gates/settings, business-line filters, routes/pages. | Confirm which storefronts are enabled at launch. |
| Latte Stone Cookies ordering | Partial | Product catalog/business line exists; shipping support exists. | Do not launch until shipping labels/customs/live rates are verified. |
| Off-island shipping rates | Partial | Shipping rate endpoint and EasyPost-style service exist; live mode and label purchase not fully confirmed. | Verify EasyPost credentials, labels, customs, and fulfillment queue. |
| Shipping label purchase/printing | Not confirmed as complete | Routes show rates/address validation, but no obvious live label purchase workflow in routes. | Build or verify label-buy/print workflow before Latte Stone launch. |
| POS mode for in-person orders | Done for app flow; Stripe-specific for card terminal | Admin POS page/API, cash/card flows, Stripe Terminal service. | Replace Stripe Terminal with Worldpay triPOS Cloud if Worldpay-only. |
| Pop-up/festival payments | Partial | POS exists; current terminal code is Stripe-specific. | Scope triPOS Cloud/Mobile devices with Worldpay. |
| Staff/location scoping | Mostly done | User assigned location, effective admin location helper, device routes, scoped orders. | QA with real Donki/Main staff accounts and iPads. |
| Push notifications/PWA | Partial/in progress | Device and push models/services/routes exist, admin devices page exists. | Full end-to-end push/PWA install QA on iOS/Android. |
| Email/SMS notifications | Mostly done | Email/SMS jobs/settings exist for order statuses. | Configure production Resend/ClickSend and sender domain. |
| Accounting reports and CSV exports | Partial | Admin orders CSV and dashboard metrics exist. | Add payment settlement/deposit reconciliation once Worldpay report/API is known. |
| Daily/batched deposit reconciliation | Not done | Current app tracks orders/refunds, not processor funding batches. | Ask BOG/Worldpay for funding/deposit reports and transaction-to-deposit mapping. |
| Customer accounts/order history | Done | Auth/me, my orders, account/order history pages. | Production Clerk config. |
| Admin imports | Done | Imports controller/job/admin page exists. | Use for final product/menu loading if needed. |
| Revel/Clover integration | Not done | Mentioned as future after launch. | Needs vendor/API access and separate scope. |
| Reservations/OpenTable-style workflow | Not done | Discussed as future idea only. | Separate future project. |
| Payroll/time-clock/biometric replacement | Not part of this app | Discussed, but outside Three Squares ordering scope. | Separate product/scope. |
| Wholesale/B2B portal | Not done | Future phase in project status. | Separate phase after restaurant/cookies. |

## Worldpay-Only Recommendation

If B&G/Three Squares is committed to BOG/Worldpay and Stripe is not acceptable for Guam, the final production app should be Worldpay-only. That removes operational ambiguity, avoids maintaining two live processors, and aligns with the direct merchant/DDA settlement model BOG wants to discuss.

However, Stripe should not be ripped out blindly before Worldpay confirms the online and POS products. The safer approach is:

1. keep the temporary provider abstraction in place during implementation;
2. implement Worldpay online first;
3. certify and test refunds/webhooks/settlement reporting;
4. replace Stripe Terminal with triPOS Cloud for POS;
5. then remove Stripe UI, routes, env vars, gems, jobs, webhooks, docs, and tests in one cleanup pass.

That gives the simplicity of a Worldpay-only production system without losing a working payment reference before the Worldpay contract is known.

## What The April 3 Worldpay Transcript Says We Will Likely Use

- **Card-present / POS:** triPOS, likely **triPOS Cloud** because the Three Squares POS is web/cloud based.
- **Mobile app-based card present:** triPOS Mobile if future native iOS/Android apps need devices.
- **Online card-not-present:** Express API with **Hosted Payment Page** or **Hosted Fields**.
- **Merchant setup:** each merchant has its own merchant account; funds flow directly to the merchant, not Shimizu.
- **Existing MID:** Worldpay said they can build on an existing MID if B&G already has one.
- **Process:** solution consultant, scoping call, SOW, project/implementation consultant, sandbox credentials, test cases, certification, production credentials.
- **Timeline:** usually 1 to 3 months, depending heavily on implementation/certification pace.
- **Pricing:** merchant-specific/a la carte; depends on card-present/card-not-present, tokenization, debit, surcharge, volume, and existing merchant setup.

## Meeting-Ready Talking Points

Current Stripe process:

- customer pays in embedded card checkout;
- backend creates/verifies a payment reference;
- app creates order only after payment confirmation;
- webhooks reconcile payment/refund status;
- refunds use the original provider/reference;
- processor handles merchant onboarding, bank account/DDA, payout batching, fees, and settlement reports outside the app.

Desired Worldpay process:

- B&G/Three Squares remains merchant of record;
- funds settle directly to B&G's merchant account/DDA through BOG/Worldpay;
- app receives session/transaction references and webhook/event updates;
- app maps transactions to orders/refunds and exposes reports for operations/accounting;
- app does not custody or redistribute merchant funds.

Questions to get answered:

1. For online ordering, should we use Hosted Payment Page, Hosted Fields, or direct Express API?
2. For POS, is triPOS Cloud the correct product for a browser-based iPad/web POS?
3. Can B&G's existing MID be used, and what features must be enabled?
4. What are the exact credential fields for sandbox and production?
5. What transaction/session/refund identifiers should we store?
6. What webhook/event types and signature verification should we implement?
7. What settlement/funding report maps transaction IDs to DDA deposits and fees?
8. Are refunds, voids, partial refunds, debit, PINless debit, tokenization, Apple Pay/Google Pay, and surcharge/no-surcharge in scope?
9. What test cases and certification checklist determine go-live?
10. Which device models are approved for triPOS Cloud, and can a test device ship to Guam?

## Recommended Next Build Steps

1. Confirm Worldpay product path in the May 12 meeting.
2. Update the codebase from "multi-provider transition" to "Worldpay-only target" after confirmation.
3. Implement Worldpay online checkout session creation and frontend hosted/fields flow.
4. Implement Worldpay webhook verification and idempotent order reconciliation.
5. Implement Worldpay refund/void handling.
6. Add settlement/deposit report fields or import once BOG/Worldpay confirms reporting format.
7. Replace Stripe Terminal with triPOS Cloud.
8. Remove Stripe-specific dependencies and docs after Worldpay online/POS paths are certified.
