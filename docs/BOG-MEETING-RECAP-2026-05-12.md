# BOG Meeting Recap

**Date:** 2026-05-12  
**Attendees:** Leon Shimizu, Christopher Q. Reyes / BOG  
**Context:** Worldpay had to reschedule, so this became a Bank of Guam-only prep call.

## Summary

The meeting focused on explaining the current Stripe process and clarifying what BOG needs to send back to Worldpay before the rescheduled technical call.

Worldpay was not on the call, so no final product decisions were made. The current preferred direction remains:

- **Online:** Hosted Fields / Checkout SDK if feasible; Hosted Payment Page as acceptable phase-one fallback.
- **POS:** triPOS Cloud for browser/web-based card-present payments.
- **Processor model:** B&G Pacific remains merchant of record; funds should settle directly to B&G's BOG/DDA account.

## What BOG Asked About

### Stripe account and DDA setup

BOG asked how Stripe setup works today, specifically around DDA settlement and account setup.

Answer given:

- Stripe is mostly self-service.
- Merchant creates/signs into a Stripe account.
- Merchant links a bank account/card for payouts.
- Developer retrieves API/webhook credentials from Stripe's developer section.
- The app uses those credentials so payments point to that merchant's Stripe account.
- Shimizu does not need to work with Stripe's team for normal setup.

Important distinction for Worldpay:

- Stripe hardware/account onboarding felt self-service.
- BOG/Worldpay hardware is expected to be more formally configured, including possible key injection and merchant/device setup.

### Card reader / terminal behavior

BOG asked whether Stripe's reader needed to be key-injected or specially configured.

Answer given:

- The Stripe smart reader was purchased directly from Stripe.
- It was registered in Stripe's dashboard/app using its serial number.
- It did not require manual coordination with Stripe's team.
- The cheaper Stripe reader did not work for the browser/web-app flow and required an iOS/mobile-app path.
- The more expensive/smarter Stripe reader could connect to the web application.

Important implication for Worldpay:

- We need triPOS Cloud devices that can be controlled by a browser-based web app.
- We should not assume every cheaper card reader works for web POS.
- BOG noted Worldpay hardware usually needs Worldpay key injection/configuration.

### Debit / PIN support

BOG asked if the Stripe reader accepted debit or only credit.

Answer given:

- Understanding was that it accepted both credit and debit.
- Debit/PIN capability should be confirmed for the Worldpay/triPOS device path.

## Hosted Fields vs Hosted Payment Page

Leon explained the preferred online checkout UX:

- **Hosted Fields:** customer enters card details directly on our checkout page; Worldpay hosts/secures the card fields. This is closest to Stripe Elements and is the ideal target.
- **Hosted Payment Page:** customer is redirected or shown a Worldpay-hosted payment page, pays there, then returns to our app. This is acceptable if it is Worldpay's recommended first/faster/simpler path.

Current position:

- Prefer Hosted Fields / Checkout SDK.
- Accept HPP as a phase-one path if Worldpay recommends it.
- Keep the door open to move from HPP to Hosted Fields later.

## Authorize.net Mention

Christopher said Brad had mentioned **Authorize.net** as another payment gateway option and that it may come up in the rescheduled Worldpay discussion.

Current interpretation:

- This is not yet a decision or recommendation.
- It may be a gateway option BOG/Worldpay can support if direct Worldpay HPP/Hosted Fields is not the best fit.
- We researched it after the call. It appears viable for online card-not-present checkout, but weaker for browser-based card-reader POS than triPOS Cloud.

Key question for next call:

> Is Authorize.net being suggested as a fallback gateway, a preferred gateway, or simply another option? If BOG/Worldpay supports both, which path is best for B&G Pacific's online ordering + POS requirements?

Detailed research: `docs/AUTHORIZE-NET-RESEARCH-NOTES-2026-05-12.md`.

## Next Meeting

Christopher planned to check with Brad/Worldpay and attempt to reschedule for:

- preferred: Thursday, May 14, 2026
- fallback: Tuesday, May 19, 2026

## Updated Questions For Rescheduled Worldpay Call

1. Should B&G Pacific use Worldpay Hosted Fields / Checkout SDK, HPP, Express Hosted Payments, Authorize.net, or another gateway?
2. If Hosted Fields is available, is it approved/recommended for a food-ordering checkout page?
3. If HPP is recommended first, can we later move to Hosted Fields without changing merchant setup?
4. For POS, which triPOS Cloud devices are web-app compatible?
5. Which devices require native mobile apps, if any?
6. Which devices support credit, debit, PIN, contactless, chip, refunds/voids, and QuickChip?
7. What hardware needs key injection before shipment?
8. Can test devices ship to Guam, and who orders/owns them?
9. Does B&G's existing merchant account/MID support eCommerce, triPOS, tokenization, refunds, and debit today?
10. How does BOG want transaction/deposit reporting structured for DDA reconciliation?

## Decision Status

No final technical decision was made on May 12 because Worldpay was not present.

The app remains prepared for Worldpay integration, and Stripe remains an interim/reference implementation only.
