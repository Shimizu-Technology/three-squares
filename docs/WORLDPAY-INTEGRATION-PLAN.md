# Worldpay Integration Plan

**Status:** Backend readiness in progress / waiting on Worldpay scoping
**Last updated:** 2026-05-11
**Primary merchant:** B&G Pacific dba Three Squares
**Processor relationship:** Bank of Guam / Worldpay

## Purpose

This document captures the recommended path for preparing Three Squares to support Worldpay properly without breaking the current Stripe-based checkout and POS flows during the transition.

The goal is to make the codebase ready before Worldpay returns with credentials, project scope, and implementation details, so the remaining work is mostly provider-specific wiring rather than a rushed architectural rewrite.

## May 11 Readiness Update

The backend now has the first provider-aware payment layer in place:

- `orders` can store `payment_provider`, `payment_reference`, and `payment_session_id` alongside the legacy Stripe `payment_intent_id`
- `refunds` can store `payment_provider` and `provider_refund_id` alongside `stripe_refund_id`
- `PaymentService` delegates verification and refunds through provider adapters
- Stripe refunds route through the provider recorded on the original order when available
- online order authorization no longer calls Stripe directly from the order controller
- Stripe webhooks backfill the generic provider/reference fields
- POS card-present inventory deduction now waits until terminal payment confirmation
- a conservative Worldpay webhook endpoint exists but is intentionally disabled until signature and event details are confirmed

This is readiness work, not a production Worldpay implementation. Live Worldpay checkout, HPP return handling, event parsing, refunds, and triPOS still require Worldpay/BOG credentials, product confirmation, sandbox cases, and certification guidance.

## Executive Summary

Three Squares is currently built around Stripe for:

- Online checkout
- Refund processing
- Payment webhooks
- POS card-present terminal flows

Worldpay is viable for this project, but it is not a drop-in key swap. The current application is Stripe-shaped at the data model, backend service, frontend checkout, webhook, and POS levels.

The safest plan is:

1. Keep Stripe working during the migration.
2. Prepare the codebase now for multiple payment providers.
3. Implement Worldpay online checkout first.
4. Treat Worldpay card-present/POS as a separate follow-up track.
5. Support both a simulated test mode and a real live mode.

## Recommended Worldpay Direction

Based on the Worldpay meeting, the completed Solutions Consultant Engagement Request, and Worldpay documentation, the current best-fit working assumptions are:

- **Online / card-not-present:** Worldpay Hosted Payment Pages (HPP), ideally redirect or iframe flow
- **Card-present / POS:** Worldpay triPOS Cloud
- **Merchant funding:** Funds settle directly to the merchant MID, not to Shimizu Technology
- **Rollout approach:** Start with Three Squares only, then expand to future merchants

This should be treated as the default plan until Worldpay confirms a different product path in discovery.

## What We Know So Far

### Confirmed or strongly implied

- B&G Pacific / Three Squares is an existing Bank of Guam merchant.
- The merchant wants both online ordering payments and in-person POS payments.
- Worldpay indicated there is a standard merchant integration path where the merchant keeps its own account and MID.
- Worldpay described triPOS variants for card-present:
  - direct
  - cloud
  - mobile
- Worldpay described hosted/Express-style options for online card-not-present payments.
- The submitted engagement form selected:
  - Credit
  - PIN Debit
  - PINless Debit
  - International Acceptance
  - Hosted Payment Page / iFrame

### Still pending from Worldpay

- Final confirmation of the online product:
  - Hosted Payment Page / iframe
  - Hosted fields / checkout SDK
  - another Express-style integration
- Final confirmation of the POS product:
  - triPOS Cloud is the current best assumption
- Approved terminal hardware for this merchant
- Exact credential package and naming
- Webhook/event registration process
- Refund capabilities and operational flow
- Wallet support such as Apple Pay / Google Pay
- Whether the existing MID requires additional features enabled

## Current Codebase Reality

The application is deeply coupled to Stripe today.

### Backend

- `api/app/models/site_setting.rb`
  - allows `worldpay` in test mode but live checkout remains Stripe-only until the Worldpay integration is complete
- `api/app/services/payment_service.rb`
  - now acts as a compatibility coordinator over provider adapters for verification and refunds
- `api/app/services/payments/`
  - contains Stripe, test, and Worldpay provider classes
- `api/app/controllers/api/v1/payment_intents_controller.rb`
  - still creates Stripe payment intents for the current embedded checkout
- `api/app/controllers/api/v1/orders_controller.rb`
  - uses provider verification for paid online orders while preserving legacy `payment_intent_id` compatibility
- `api/app/controllers/webhooks/stripe_controller.rb`
  - handles Stripe webhook events and stores generic provider/reference fields
- `api/app/controllers/webhooks/worldpay_controller.rb`
  - exists as a disabled placeholder until Worldpay confirms signature and event contracts
- `api/app/controllers/api/v1/admin/stripe_terminal_controller.rb`
  - creates Stripe Terminal connection tokens
- `api/app/controllers/api/v1/admin/pos_orders_controller.rb`
  - still creates Stripe POS payment intents, but no longer deducts inventory for card-present orders before terminal confirmation

### Frontend

- `web/src/pages/CheckoutPage.tsx`
  - uses Stripe Elements and `confirmCardPayment`
- `web/src/components/payment/StripeProvider.tsx`
  - wraps the checkout in Stripe Elements
- `web/src/components/payment/PaymentForm.tsx`
  - renders Stripe card input
- `web/src/services/stripeTerminal.ts`
  - uses the Stripe Terminal JS SDK
- `web/src/pages/admin/AdminPOSPage.tsx`
  - assumes Stripe terminal behavior

### Data model constraints

- `orders.payment_intent_id`
  - Stripe-oriented naming
- `refunds.stripe_refund_id`
  - Stripe-oriented naming
- `order.payment_method`
  - includes values such as `stripe`, `cash`, `card_present`

## Core Design Decision

The correct way to implement Worldpay is **not** to bolt Worldpay logic into existing Stripe classes. The correct way is to first create a provider-aware payment architecture, then implement Worldpay within that structure.

## Target Architecture

### Provider abstraction

Introduce a provider boundary in the backend with a consistent interface for payment operations.

Suggested responsibilities:

- create checkout session or payment intent
- verify payment completion
- issue refund
- process webhook events
- expose provider-specific configuration needed by the frontend

Suggested backend structure:

- `api/app/services/payments/`
- `api/app/services/payments/provider_resolver.rb`
- `api/app/services/payments/stripe_provider.rb`
- `api/app/services/payments/worldpay_provider.rb`
- `api/app/services/payments/test_provider.rb`

The existing `PaymentService` can be refactored into a thin coordinator or compatibility layer during migration.

### Generic payment concepts

The codebase should move toward generic terms:

- `payment_provider`
- `payment_reference`
- `payment_session_id`
- `provider_refund_id`
- `payment_status`

Provider-specific IDs can still be stored in metadata if needed.

## Recommended Phases

### Phase 0: Documentation and architecture prep

This phase is covered by this document.

### Phase 1: Make the backend provider-aware

Goals:

- Add `worldpay` as a valid site setting value
- Introduce provider resolution based on site settings
- Stop hardcoding Stripe assumptions inside shared order flow
- Add generic payment field support while preserving backwards compatibility

Deliverables:

- provider resolver
- Stripe provider adapter
- Worldpay provider stub
- test provider
- generic webhook/event logging support

### Phase 2: Prepare the online checkout flow for hosted payments

Goals:

- decouple checkout from Stripe Elements-only flow
- support a session-based hosted payment flow
- allow redirect/iframe return and webhook-driven confirmation

Recommended direction:

- Worldpay online should use a hosted payment flow unless Worldpay explicitly steers the project elsewhere.
- The frontend should be able to render one of these modes:
  - Stripe embedded card form
  - Worldpay hosted session launch
  - simulated test checkout

Deliverables:

- generic checkout session endpoint
- frontend payment method switch by provider
- pending payment flow that can survive redirect/return
- clear success, cancel, and failure handling

### Phase 3: Implement Worldpay webhook/event processing

Goals:

- consume Worldpay payment outcome events safely
- make order finalization idempotent
- support refunds and state transitions without duplicate effects

Deliverables:

- Worldpay webhook endpoint
- signature/authentication verification
- event idempotency strategy
- event-to-order matching strategy
- payment audit logging

### Phase 4: Implement POS/card-present support

Goals:

- add Worldpay card-present support without destabilizing online checkout
- keep Stripe terminal isolated until triPOS details are confirmed

Recommended direction:

- treat triPOS Cloud as a separate implementation track
- do not block the online checkout migration on POS work

Deliverables:

- provider-aware admin POS payment flow
- Worldpay card-present session handling
- terminal/device handling once Worldpay confirms supported hardware

## Test Mode and Live Mode

This project should explicitly support both:

- **test mode:** simulated or sandboxed payments for development and QA
- **live mode:** real payment processing against configured production credentials

### Guiding principle

The application should behave like a real checkout in test mode even when Worldpay production credentials are not available yet.

### Recommended test-mode behavior

For development and staging, support a provider-aware simulation mode that:

- does not require real card entry
- does not contact live payment systems
- produces realistic payment lifecycle states
- supports success and failure cases
- supports refund simulations

Suggested simulated behaviors:

- online checkout success
- online checkout decline
- hosted payment canceled by user
- payment authorized but order finalization fails
- full refund
- partial refund

### Suggested mode model

- `payment_test_mode = true`
  - default to simulated checkout unless sandbox credentials are present and intentionally enabled
- `payment_test_mode = false`
  - live credentials required

### Important rule

Test mode should be independent of the provider where practical.

That means:

- Stripe can continue using its current test keys if desired
- Worldpay can use a simulated provider until sandbox onboarding is complete
- QA should still be able to validate the Three Squares checkout flow before Worldpay setup is finished

## Data Model Changes

These changes are now partially implemented while preserving current Stripe behavior.

### Site settings

`site_settings.payment_processor` should support:

- `stripe`
- `paypal`
- `worldpay`

Potential future additions:

- `worldpay_environment`
- `worldpay_merchant_entity`
- `worldpay_checkout_mode`

Credential secrets should stay in environment variables or secret management, not the database.

### Orders

Current fields are generalized with backwards compatibility:

- keep `payment_intent_id` temporarily for backward compatibility
- add generic payment reference fields as needed

Added:

- `payment_provider`
- `payment_reference`
- `payment_session_id`
Potential future addition:

- `payment_metadata` as JSONB

### Refunds

Added:

- `payment_provider`
- `provider_refund_id`

`stripe_refund_id` can remain temporarily during migration, then be retired later.

## Online Checkout Shape

### Current Stripe flow

1. Frontend creates Stripe payment intent
2. Frontend confirms payment with Stripe Elements
3. Frontend creates order with `payment_intent_id`
4. Backend verifies Stripe payment intent
5. Stripe webhook also updates final payment state

### Desired provider-aware flow

1. Frontend requests a checkout session from the backend
2. Backend delegates to the active provider
3. Provider returns one of:
   - embedded card configuration
   - hosted redirect URL
   - hosted iframe/session payload
   - simulated test payment contract
4. Frontend completes the provider-specific payment step
5. Backend finalizes the order once payment is confirmed or verified
6. Webhooks reconcile final state and refunds

### Worldpay-first online assumption

For Worldpay HPP, the likely shape is:

1. frontend asks backend to create hosted payment session
2. backend creates Worldpay session
3. frontend redirects or embeds session
4. Worldpay returns user to site
5. Worldpay webhook confirms payment outcome
6. backend updates order payment state

The implementation should be built to support this flow even before the final Worldpay credentials arrive.

## POS / Card-Present Shape

This should be treated as a separate workstream from online checkout.

### Current state

The current POS is tightly coupled to Stripe Terminal.

### Recommended interim strategy

- Keep current Stripe POS behavior intact until Worldpay online is stable
- Introduce provider seams in the admin POS flow
- Wait for Worldpay confirmation before implementing triPOS-specific device logic

### Worldpay assumption

The best current assumption is triPOS Cloud for the web-based POS environment.

## Worldpay Questions To Resolve

When Worldpay responds, we should explicitly confirm:

1. Is the online integration for Three Squares **Hosted Payment Pages**?
2. If yes, should it be **redirect**, **iframe**, or another embedding model?
3. If no, what exact Worldpay product should be used instead?
4. Is the card-present integration for Three Squares **triPOS Cloud**?
5. Which terminal hardware models are approved?
6. What credentials will be provided for sandbox and live?
7. How are webhooks/events configured and authenticated?
8. Which event types should we subscribe to?
9. Are online refunds enabled?
10. Are Apple Pay and Google Pay in scope?
11. Does the merchant’s existing MID need additional services enabled?
12. Are there certification steps that differ between online and POS?

## Pre-Implementation Work We Can Do Now

The following work does **not** require waiting for Worldpay:

- document the migration plan
- introduce provider abstractions: **partially done**
- generalize payment terminology in code: **partially done**
- add `worldpay` to settings and config surfaces
- refactor checkout to support provider-specific flows: **backend started, frontend still mostly Stripe-shaped**
- add simulated test-mode payment provider: **done for backend payment/refund compatibility**
- add generic payment event logging
- isolate Stripe terminal-specific logic behind a provider seam: **started; POS remains Stripe Terminal-specific**

## Work We Should Not Guess Yet

These pieces should wait for Worldpay clarification:

- exact Worldpay credential names and env vars
- final hosted checkout payload structure
- final webhook signature verification scheme
- triPOS device handling details
- exact refund API contract

## Rollout Strategy

### Recommended sequence

1. Land the documentation and architecture changes
2. Refactor the backend into provider-based payment handling
3. Add a simulated provider-aware test flow
4. Update the frontend checkout to support more than Stripe
5. Plug in the real Worldpay online flow once credentials arrive
6. Validate webhooks, refunds, and reconciliation
7. Only then begin POS/triPOS implementation

### Stripe transition strategy

Stripe should remain in place until:

- Worldpay online checkout works end to end
- webhook reconciliation is stable
- refunds are tested
- Three Squares can safely run live traffic on Worldpay

## QA Expectations

Before live launch, QA should cover:

- simulated success path
- simulated decline path
- simulated cancellation path
- Worldpay sandbox success path
- order creation after hosted payment return
- webhook-only payment confirmation path
- duplicate webhook delivery handling
- full refund
- partial refund
- provider switching in admin settings
- regression check for current Stripe flow

## Documentation References

Worldpay documentation reviewed while preparing this plan:

- Hosted Payment Pages: <https://docs.worldpay.com/access/products/hosted-payment-pages>
- Hosted Payment Pages setup: <https://docs.worldpay.com/access/products/hosted-payment-pages/setup-a-payment>
- Events webhook: <https://docs.worldpay.com/access/products/events>
- Online refunds: <https://docs.worldpay.com/access/products/card-payments/features/online-refunds>
- triPOS developer docs: <https://tripos.vantiv.com/api/help/>

## Implementation Readiness Summary

We have enough information to begin preparing the codebase now.

We do **not** yet have enough information to finish a production-ready Worldpay implementation without a few answers from Worldpay.

The right next move is to implement the architecture needed for provider-aware payments and a simulated test mode, then plug in Worldpay once the processor-specific details arrive.
