# Worldpay Product Research Notes

> Historical April–May 2026 source. Read [preservation notes](PRESERVED-WIP-DOCS.md) and the October restart specification before using API or implementation claims.

**Prepared:** 2026-05-11  
**Purpose:** Validate the Worldpay products mentioned in the April 3 BOG/Worldpay meeting and translate them into Three Squares implementation decisions.

## Bottom Line

Worldpay's suggested products are legitimate Stripe alternatives for this project, but they are not a one-for-one Stripe clone.

- **Hosted Payment Pages (HPP)** is a real Worldpay hosted checkout product and is the closest fit if we want the lowest PCI burden and fastest online implementation.
- **Checkout SDK / hosted fields** is a real embedded-card-fields option and is closer to the current Stripe Elements experience, but it likely requires more direct payment API work.
- **Express API / Hosted Payment Page** is part of Worldpay's integrated payments stack and appears consistent with what the Worldpay team described in the call.
- **triPOS Cloud** is a real Worldpay card-present product for cloud/SaaS POS integrations and is the right product family to discuss for the browser-based Three Squares POS.

## Product Fit

| Need | Best-fit Worldpay product | Why |
|---|---|---|
| Online prepaid ordering | Hosted Payment Pages or Checkout SDK + Payments API | Both keep card data out of our backend. HPP is simpler; Checkout SDK is more embedded/custom. |
| Donki QR/order-ahead flow | Hosted Payment Pages | Redirect/hosted checkout is fine for mobile order-ahead if return/webhook handling is strong. |
| In-restaurant / pop-up POS | triPOS Cloud | Worldpay positions triPOS Cloud for SaaS/cloud integrations; April 3 transcript also pointed us there. |
| Refunds | Card Payments refund actions / event webhooks | Worldpay supports refund flows, but enablement and exact action links/events must be confirmed. |
| Reconciliation | Payment Queries + event webhooks + BOG settlement/funding report | TransactionReference can map app orders to Worldpay transactions; DDA deposit grouping still needs BOG/Worldpay confirmation. |

## Express API Clarification

Worldpay appears to have at least two relevant product/documentation families:

1. **Access Worldpay** — newer API family for HPP, Checkout SDK/hosted fields, Card Payments API, payment queries, events, refunds, and related eCommerce APIs.
2. **Express / Integrated Payments** — an older/integrated-payments platform that includes Express XML and Hosted Payments as a value-added service.

The screenshot from `docs.worldpay.com/apis/express/hosted-payments` describes **Express Hosted Payments** as a Value Added Service that works with the Express platform and is managed through an iframe. Its sample flow uses a `TransactionSetupID` and a hosted payments URL such as:

`https://certtransaction.hostedpayments.com/?TransactionSetupID=...`

This suggests "Express API" is not just a generic name for every Worldpay API. It is a specific Worldpay platform/product lane. For Three Squares, we need BOG/Worldpay to confirm whether they are onboarding us on:

- **Access Worldpay HPP / Checkout SDK**, or
- **Express Hosted Payments / Express XML**, or
- a combination of Express for POS/Integrated Payments and Access for online.

Implementation details differ materially:

| Area | Access Worldpay HPP / Checkout SDK | Express Hosted Payments |
|---|---|---|
| Session/reference | `transactionReference`, HPP URL, payment query links | `TransactionSetupID`, Express transaction IDs |
| API style | modern REST/HAL media types | Express XML / Integrated Payments patterns |
| Checkout shape | redirect, iframe/lightbox HPP, or Checkout SDK hosted fields | hosted iframe/window/page using TransactionSetupID |
| Best question | "Should we use Access HPP or Checkout SDK?" | "Should we use Express Hosted Payments and TransactionSetup?" |

Meeting phrasing:

> "We saw both Access Worldpay HPP/Checkout SDK docs and Express Hosted Payments docs. Which product family will B&G Pacific be onboarded to, and which API should we implement for online ordering?"

## triPOS Cloud Device Research

Official triPOS docs and release notes show that device support is version-, processor-, account-, gateway-, and feature-dependent. This is similar to the Stripe reader issue: not every cheaper reader necessarily supports every integration mode or feature.

### Devices found in official triPOS Cloud docs

The triPOS knowledge base lists these as supported for **triPOS Cloud display/custom-form endpoints**:

- Verifone Mx915
- Verifone Mx925
- Ingenico Link2500
- Ingenico Lane3000
- Ingenico Lane3000 Deluxe
- Ingenico Lane3600
- Ingenico Lane5000
- Ingenico Lane7000
- Ingenico Lane7000 Deluxe
- Ingenico Lane8000
- Ingenico Lane8000 Deluxe
- Ingenico Move5000

The triPOS Cloud 5.0.0 release notes list Worldpay EMV Contact/Contactless/QuickChip certification for:

- Verifone Mx915, Mx925
- Ingenico iSC250, iSC480, iPP320, iPP350, iSMP4
- Ingenico Lane 3000, Lane 3600, Lane 5000, Lane 7000, Lane 8000 Deluxe, Link 2500, Link 2500 CL3, Move 5000
- Pilot Android devices: Ingenico DX4000, DX8000, EX8000; Verifone P630, P660, Portable/P100, Mobile/M100

Important caveats from the docs:

- Some features are device and software-version specific.
- Merchant account and gateway support may also be required for features.
- Older PCI4 hardware may have degraded performance and may not support newer features.
- triPOS Cloud has lanes, and lane/device configuration matters.

### Practical card-reader recommendation

For Three Squares, do not buy any device until Worldpay/BOG confirms the exact supported model for this merchant and product lane.

The safest shortlist to discuss:

- **Ingenico Lane 3000 / Lane 3600** — likely lower-cost countertop lane devices, good candidate for Donki/Main if supported.
- **Ingenico Lane 5000 / Lane 7000** — larger/touch/signature-capable countertop options.
- **Ingenico Link 2500 / Move 5000** — more mobile/portable style options, potentially useful for pop-ups.
- **Verifone Mx915 / Mx925** — older/common countertop devices; docs warn older PCI4 hardware may have degraded/new-feature limitations.

Meeting phrasing:

> "Our POS is a browser-based web app, so we need triPOS Cloud devices that can be controlled from the web app without building a native iOS app. Which device model do you recommend for Main and Donki, which one is lowest-cost but fully supported, and which features would we lose by choosing the cheaper device?"

Sources:

- https://www.worldpay.com/en-CA/products/tripos
- https://triposqa.vantiv.com/api/help/kb/display.html
- https://triposcert.worldpay.com/api/help/kb/cloud/LaneRequest-Patch.html
- https://docs.worldpay.com/assets/pdf/tripos-cloud-releasenote.pdf

## Key Official Findings

### Hosted Payment Pages

Worldpay describes Hosted Payment Pages as a low-code way to take payments securely. The setup flow creates a payment page with `POST /payment_pages`, using test and live Access Worldpay hosts, and returns:

- a `url` for redirecting the customer to Worldpay's payment page
- a query `href` for payment lookup/next actions

The API uses a merchant `entity` created during onboarding and a merchant-supplied `transactionReference` to identify the payment lifecycle.

Sources:

- https://docs.worldpay.com/access/products/hosted-payment-pages
- https://docs.worldpay.com/access/products/hosted-payment-pages/setup-a-payment
- https://docs.worldpay.com/access/products/hosted-payment-pages/openapi

### Hosted Fields / Checkout SDK

Worldpay's Checkout SDK is a hosted-fields-style option. It creates secure card sessions from Worldpay-hosted card fields, which can then be used with Worldpay payment APIs.

This is closer to Stripe Elements than HPP, but it creates a more involved implementation path because the app controls more of the checkout form and server-side payment flow.

Sources:

- https://docs.worldpay.com/access/products/checkout
- https://docs.worldpay.com/access/products/checkout/web/card-only
- https://docs.worldpay.com/access/products/articles/introducing-checkout

### Express API / Hosted Payments

The Express Interface Specification describes a Hosted Payment Page/Window flow where the POS/app first calls `TransactionSetup`, receives a `TransactionSetupID`, redirects or opens hosted payments, and then receives or queries transaction results.

This matches the April 3 transcript language about Express API, Hosted Payment Page, and Hosted Fields.

Source:

- https://docs.worldpay.com/assets/pdf/ExpressInterfaceSpecification3.pdf

### triPOS Cloud

Worldpay positions triPOS as payment APIs for secure integrations across cloud applications, mobile platforms, and direct installations. The public triPOS page specifically lists triPOS Cloud as suitable for SaaS models. Recent release notes show active triPOS Cloud versions, certified device families, and ongoing support.

Sources:

- https://www.worldpay.com/en/products/tripos
- https://docs.worldpay.com/assets/pdf/tripos-cloud-releasenote.pdf

### Events, Queries, Refunds

Worldpay has:

- event webhooks for payment lifecycle updates
- Payment Queries API for querying by `transactionReference` and `paymentId`
- online refund support that can emit `sentForRefund` / `refundFailed` style events

Important caveat: webhook setup is done through the Implementation Manager, and online refunds may require enablement.

Sources:

- https://docs.worldpay.com/access/products/events
- https://docs.worldpay.com/access/products/events/openapi/payment/sentforsettlementpayment
- https://docs.worldpay.com/access/products/payment-queries
- https://docs.worldpay.com/access/products/access/card-payments/features/online-refunds

## Recommendation For Three Squares

The cleanest initial path is:

1. **Online:** Worldpay Hosted Payment Pages first, unless Worldpay strongly recommends Checkout SDK/Hosted Fields for this merchant.
2. **POS:** triPOS Cloud as a separate track after online checkout scope is locked.
3. **Data model:** use `transactionReference` as our `orders.payment_reference` or store it alongside a Worldpay `paymentId/sessionId`.
4. **Settlement:** ask BOG/Worldpay how to map transaction references to DDA deposits, because the app needs accounting reconciliation and Worldpay docs alone do not fully answer merchant deposit batching.
5. **Stripe cleanup:** remove Stripe only after Worldpay online/refund/webhook flow and POS path are confirmed/certified.

## Tomorrow's Must-Confirm Items

1. Are they putting Three Squares on Access Worldpay HPP, Access Checkout SDK, Express HPP, or another product?
2. If HPP: redirect, iframe, or lightbox?
3. What credentials will be issued: entity, checkout ID, merchant ID/MID, account ID, username/password, webhook secret, terminal credentials?
4. What should we use as the durable app reference: `transactionReference`, `paymentId`, `TransactionSetupID`, `TransactionID`, or another field?
5. Which event types should be enabled for online orders and refunds?
6. How do they sign webhooks?
7. Is auto-settlement enabled by default, and when does the merchant DDA receive deposits?
8. What report/API maps payments/refunds/fees to actual BOG deposits?
9. Are partial refunds, voids/cancellations, debit/PINless debit, Apple Pay/Google Pay, and tokenization enabled?
10. Is triPOS Cloud confirmed for the browser POS, and which device model should Three Squares use?
