# Authorize.net Research Notes

> Historical April–May 2026 source. Read [preservation notes](PRESERVED-WIP-DOCS.md) and the October restart specification before using API or implementation claims.

**Prepared:** 2026-05-12  
**Purpose:** Evaluate Authorize.net as a possible Stripe alternative for Three Squares / B&G Pacific after BOG mentioned it as an option for the rescheduled Worldpay discussion.

## Bottom Line

Authorize.net is a legitimate, mature payment gateway and could be a viable **online card-not-present** alternative to Stripe for how Three Squares currently uses Stripe online.

It is **not** a clean replacement for Stripe Terminal in a browser-based POS. For in-person/card-reader payments, triPOS Cloud still appears to be the better fit for this app.

Best interpretation:

- **Online checkout:** Authorize.net is credible and worth considering.
- **In-person POS/card readers:** use Worldpay triPOS Cloud unless BOG/Worldpay says otherwise.
- **Settlement/DDA:** Authorize.net is usually the gateway; BOG/Worldpay/acquirer still matters for merchant account, pricing, settlement, and funding.

## What Authorize.net Is

Authorize.net is primarily a **payment gateway**. It connects a merchant/app to a merchant service provider/acquiring processor.

It can be sold in different ways:

- **All-in-One:** Authorize.net helps provide both gateway + merchant account.
- **Gateway Only:** merchant already has a merchant account; Authorize.net is only the gateway layer.
- **Reseller/processor path:** Worldpay is listed as an Authorize.net preferred reseller and supported processor connection.

This is important for BOG:

> If BOG suggests Authorize.net, we need to know whether B&G Pacific would still settle through BOG/Worldpay, and whether BOG is simply using Authorize.net as the eCommerce gateway.

## Stripe-Like Online Checkout Options

### Accept.js

Closest match to Stripe Elements if we want the customer to pay on our checkout page.

Authorize.net's Accept.js sends secure payment data directly to Authorize.net and returns a one-time-use token/nonce. The backend then submits a `createTransactionRequest` using that token.

There are two relevant Accept.js modes:

1. **Hosted payment form embedded in our page**
   - Lower PCI burden, SAQ-A style.
   - Less visual control.
2. **Our own custom payment form using Accept.js**
   - More like Stripe Elements in user experience/control.
   - Higher PCI burden, generally SAQ A-EP.

For Three Squares, if we choose Authorize.net, prefer the hosted Accept.js form or Accept Hosted unless we deliberately accept the higher PCI requirements.

### Accept Hosted

Authorize.net's hosted payment form. It can redirect customers to Authorize.net or be embedded in our page.

This maps closely to Worldpay HPP:

1. Backend requests a hosted payment page token.
2. Frontend redirects/embeds Authorize.net's payment form.
3. Customer pays.
4. Customer returns to our site.
5. App receives response/webhook/reporting confirmation.

The form token is valid for 15 minutes.

## API Capabilities

Authorize.net supports the normal payment lifecycle the app needs:

- authorization + capture
- authorization only
- prior authorization capture
- void
- refund of settled transactions
- transaction details/reporting
- customer profiles / stored payment profiles
- webhooks for payment/refund/void/fraud events

The API is not a modern REST API in the Stripe sense. It uses XML/JSON payloads over HTTP POST. Official SDKs and sample code exist, including Ruby, but the API style is older and likely less pleasant than Stripe.

## Webhooks / Reconciliation

Authorize.net supports webhooks for:

- `net.authorize.payment.authorization.created`
- `net.authorize.payment.authcapture.created`
- `net.authorize.payment.capture.created`
- `net.authorize.payment.refund.created`
- `net.authorize.payment.priorAuthCapture.created`
- `net.authorize.payment.void.created`
- fraud held/approved/declined events

Webhook payloads include transaction IDs and merchant references. For production reliability, the app should also use Transaction Reporting APIs rather than depending only on webhooks.

## Reporting / Settlement

Authorize.net has Transaction Reporting APIs for:

- settled batch list
- transaction list
- unsettled transactions
- customer profile transactions
- transaction details
- batch statistics
- merchant details

Authorize.net says it automatically groups transactions into a batch every 24 hours and submits them for settlement.

Important caveat:

Authorize.net reporting does not automatically answer every DDA question. We still need BOG/Worldpay to confirm actual funding schedule, fees, net/gross deposits, and how those settlement batches map to B&G's BOG bank statement.

## In-Person / Card Reader Fit

Authorize.net has an In-Person SDK for semi-integrated EMV payments, but this is **not** the same as Stripe Terminal for browser/web.

Critical findings:

- Authorize.net's In-Person SDK is for iOS, Android, and Windows POS applications.
- The docs state iOS and Android SDKs are deprecated and may not be supported in the near future.
- The Windows SDK is still fully supported.
- Compatible readers are purchased through POS Portal and production/test-device availability differs.
- Official support docs show limited EMV support depending on processor.
- For **Worldpay/Vantiv Core**, the EMV support table currently shows no support for Tap to Terminal, Tap to Pay, EMV, or Swipe through Authorize.net's in-person SDK path.

This makes Authorize.net a poor fit for our browser-based POS card-reader requirement.

For Three Squares POS, continue to prioritize:

> Worldpay triPOS Cloud for card-present browser/web POS.

## Comparison To Current Stripe Usage

| Current Stripe need | Authorize.net fit | Notes |
|---|---:|---|
| Embedded online checkout | Good | Accept.js / Accept Hosted can support this, though less elegant than Stripe Elements. |
| Hosted checkout fallback | Good | Accept Hosted maps to HPP-style flow. |
| Backend charge creation | Good | `createTransactionRequest` supports auth/capture flows. |
| Refunds | Good | Supports refunds for settled transactions and voids for unsettled transactions. |
| Webhooks | Good | Payment/refund/void/fraud events available. |
| Reporting | Good | Transaction and batch reporting APIs exist. |
| DDA settlement clarity | Depends on BOG/acquirer | Authorize.net is gateway; settlement may be processor/acquirer-led. |
| Browser-based card reader POS | Weak | In-person SDK is native/Windows-oriented, not browser POS. |
| Guam/BOG support | Needs confirmation | Worldpay is listed as a reseller/processor; BOG must confirm merchant eligibility. |
| Developer experience | Medium | Legit API, but older and less Stripe-like. |

## Recommendation

Authorize.net is worth keeping as an **online gateway fallback or alternative**, especially if BOG/Worldpay says:

- Hosted Fields/HPP through Worldpay Direct is not ideal;
- Authorize.net is easier for B&G's existing merchant account;
- Authorize.net gives better support/reporting for BOG's accounting workflow;
- Authorize.net is what Worldpay/BOG prefers for eCommerce while triPOS handles card-present.

But do not let Authorize.net replace triPOS Cloud for POS unless Worldpay/BOG can demonstrate a web-compatible reader flow.

Recommended architecture if Authorize.net is selected:

- Online ordering: Authorize.net Accept.js or Accept Hosted.
- POS/card-present: Worldpay triPOS Cloud.
- App data model: keep generic `payment_provider` values, possibly `authorize_net` for online and `worldpay_tripos` or `worldpay` for POS.
- Reporting: app stores transaction IDs, merchant references, batch IDs, refund IDs, and exports those for B&G reconciliation.

## Questions For BOG / Worldpay

1. Is Authorize.net being recommended as the primary eCommerce gateway, a fallback, or simply another option?
2. If Authorize.net is used, does B&G Pacific still settle through its BOG/Worldpay merchant account?
3. Would B&G need an Authorize.net Gateway Only account or All-in-One account?
4. Which processor connection would B&G use behind Authorize.net: Worldpay/Vantiv Core or something else?
5. Are card-not-present, refunds, voids, ACH/eCheck, Apple Pay, Google Pay, and customer profiles enabled?
6. Can we use Accept.js hosted form or Accept Hosted to keep PCI scope low?
7. What credentials are issued: API Login ID, Transaction Key, Signature Key, Public Client Key?
8. What merchant/customer/order reference field should we use for order reconciliation?
9. How do Authorize.net batches map to BOG DDA deposits and fees?
10. Does BOG/Worldpay support any Authorize.net in-person reader flow for browser/web apps, or should POS stay on triPOS Cloud?

## Source Links

- Accept.js: https://developer.authorize.net/api/reference/features/acceptjs.html
- Accept Hosted: https://developer.authorize.net/api/reference/features/accept-hosted.html
- Payment Transactions: https://developer.authorize.net/api/reference/features/payment-transactions.html
- Webhooks: https://developer.authorize.net/api/reference/features/webhooks.html
- Transaction Reporting: https://developer.authorize.net/api/reference/features/transaction-reporting.html
- In-Person SDK: https://developer.authorize.net/api/reference/features/in-person.html
- Processor support: https://support.authorize.net/knowledgebase/article/000001210/
- EMV/In-Person processor support: https://support.authorize.net/knowledgebase/article/KA-07324/
- Worldpay reseller listing: https://www.authorize.net/sign-up/reseller-directory/worldpay.html
