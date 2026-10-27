# Worldpay certification runbook

This is a preparation skeleton. Simulator fixtures prove application behavior without moving money; they are not processor certification, recorded device responses or permission to enable production. Every consultant case ID and signoff below remains blank until assigned. Never record PAN, CVV, track, PIN, signatures, cryptograms, credentials or activation codes in evidence.

Release/commit: ____  Environment/profile: ____  Application version: ____
Assigned Cloud/Express contract: ____  Device/firmware alias: ____
Evidence archive/CI run: ____  Operator: ____  Review/signoff: ____

## Case mapping

| Local case | Simulator/application evidence to attach | Remaining processor acceptance | Consultant case ID |
| --- | --- | --- | --- |
| C01 | Online approve/reload/return recovery; `simulation_spec.rb`, `foundation_spec.rb`; checkout browser receipt and saved order | Assigned Hosted Fields/HPP sale and full original-query proof | ____ |
| C02 | Decline/expired setup and subsequent approval; Express original-setup query integration specs | Assigned decline/retry/expiry limits | ____ |
| C03 | Actual partial amount, compensation claim, no stock commitment; `tri_pos_provider_spec.rb`, `simulation_spec.rb` | Assigned partial/reversal policy and device triggers | ____ |
| C04 | Duplicate request/job/finalizer, frozen key mismatch and reference theft; `checkout_request_concurrency_spec.rb`, `payment_security_spec.rb`, `terminal_workflow_spec.rb` | Native idempotency/host duplicate/legitimate second-purchase cases | ____ |
| C05 | Lost approval response, original query and lane retention; POS 768/1024 browser matrix, `terminal_workflow_spec.rb` | Missing-response/error timing and no-ID recovery procedure | ____ |
| C06 | Capture with failed eligibility/stock, cancellation race and common compensation; `foundation_spec.rb`, `terminal_workflow_spec.rb` | Late approval and failed-finalization compensation scripts | ____ |
| C07 | Simulated AVS/CVV failures and unknown/unsupported code fixtures | Approved fraud rules and trigger/card aliases | ____ |
| C08 | Build-only Express authorization/completion ports; no enabled staff workflow | Assigned auth/completion/release contract and scoped certification | ____ |
| C09 | Full/partial/repeated refunds and over-refund reservation races; `refund_payment_spec.rb`, `refund_concurrency_spec.rb` | Current-batch void, settled linked return, refund windows and debit restrictions | ____ |
| C10 | Refund timeout, query/event replay and independent effects; `refund_events_spec.rb`, `refund_recovery_integration_spec.rb` | Assigned mutation-specific retry/recovery and reordered notifications | ____ |
| C11 | Native synthetic sale parser, POS approval/receipt/stock, last-four/EMV allowlist; `tri_pos_provider_spec.rb` and POS browser evidence | Physical chip/contactless/PIN/wallet/brand and receipt approval | ____ |
| C12 | Simulator offline/busy/wrong PIN, cancel intent and late capture; `terminal_workflow_spec.rb`, two-iPad browser evidence | Device/network interruption and active-sale cancel procedure | ____ |
| C13 | Two-iPad contention, nondefault-location reload, frozen account/lane and original-provider recovery | Assigned account/terminal/location routing | ____ |
| C14 | Offline injected Stripe SDK resume states, webhook/finalizer regressions and scoped Stripe token/listing specs | Stripe sandbox/device regression; no Worldpay certification claim | ____ |
| C15 | Settings changes retain original refund identity/environment; refund authority and payment-security specs | Original-account sandbox/production isolation signoff | ____ |
| C16 | Token service seams and account binding; saved-card UI disabled | Selected PASS/OmniToken, consent and stored-credential scope | ____ |
| C17 | Canonical import, signed allocation concurrency, closed-batch membership and isolated simulated funding cases; `reconciliation/import_spec.rb`, `reconciliation/allocation_concurrency_spec.rb`, `payment_reconciliation_spec.rb`; attach exact-head browser evidence before acceptance | Agreed report/funding format, cutoff, combined/split/lag/missing deposits and accounting signoff | ____ |
| C18 | Durable outbox, duplicate jobs, pre/post-dispatch recovery and retained unknown claims; `foundation_spec.rb`, `terminal_workflow_spec.rb`, worker restart evidence | Repeat assigned sandbox recovery cases; physical platform validation | ____ |

Specs named above live under `api/spec/requests/api/v1/` or `api/spec/services/payments/`. Attach exact test names, tested SHA, fixtures and browser artifacts for each run; a table reference alone is not a passed case.

## Required adversarial checks

- Attempt to reuse a successful reference for another owner, cart, amount, currency, account, environment and order. Reject without reversing the already fulfilled order.
- Race finalization against compensation and cancellation; commit stock once and preserve the paid order's consumed charge.
- Crash before dispatch, after the durable dispatch claim, after host approval, before finalization and around outbox acknowledgement. Recover the original intent; never infer failure from an empty query or elapsed deadline.
- Retain pending/unknown refund reservations across restart. Duplicate/reordered observations cannot issue another refund or repeat restocking/notifications.
- Contend from two iPads and race re-pair/retirement/edit against collection. Keep the exact original lane and staff/location authority.
- Check production boot/request/job guards, bundle exclusion and simulated revenue/export exclusion.

## Per-case evidence record

Local case: ____  Consultant case: ____  SHA/build: ____  Time/timezone: ____
Synthetic fixture or assigned card alias: ____  Expected result: ____
Actual transaction/setup/operation references: ____  Amount/currency: ____
Visible result: ____  Saved money/stock/order result: ____
Recovery/replay result: ____  Receipt artifact: ____
Passed / failed / blocked / not run: ____  Limitation or follow-up: ____
Consultant/accounting signoff: ____

Production remains paused. Enabling credentials, endpoints, device capabilities or live processing is a separate reviewed acceptance step after the assigned contracts and certification evidence are complete.
