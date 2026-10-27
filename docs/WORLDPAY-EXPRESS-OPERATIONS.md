# Express online preparation

Worldpay online uses the existing payment identity, immutable checkout snapshot,
attempt, recovery worker, finalizer and inventory services. Stripe remains an
explicit alternative for new sessions. Existing sessions never follow a changed
default provider or edited profile.

The legacy hosted-page path is implemented with injected XML transports. It is
disabled for real dispatch by default. This is not certification or a claim that
credentials alone complete merchant onboarding. The real Hosted Fields adapter
remains a marked stub; Premium, instrument/token mapping, no-PAN System reversal
and operation-specific refund recovery still need assigned contracts.

## Configuration

Use `api/.env.example`. Express credentials map to AccountID, AccountToken and
AcceptorID; application fields are separate. Do not migrate old secret values by
name guessing. Never put credentials in PaymentProfile capabilities, frontend
configuration or logs. Only the fixed `worldpay_default` credential slot is
currently supported. Additional accounts require explicit secret-slot resolution.

Before enabling a real online profile, supply and verify its non-secret
capabilities:

- `terminal_profile`: `approved: true`, assigned `key`, and `fields` containing
  the assigned Terminal indicators and Transaction MarketCode/PartialApprovedFlag.
  There are no numeric defaults. `WORLDPAY_TERMINAL_PROFILE_KEY` must match.
- `hosted_page_variant: legacy`; presentation `worldpay_hosted_page`.
- `setup_fields`: assigned TransactionSetupMethod, Embedded, CVVRequired and
  AutoReturn values. Confirm sale execution and processor-enforced fraud policy.
- `return_origins`: exact HTTPS origins for the backend ReturnURL. Set
  `WORLDPAY_RETURN_URL` to `/api/v1/payments/worldpay/return` with no query/fragment.
  The server adds signed state and the original attempt ID. `FRONTEND_URL` is the
  fixed application destination after a valid return.
- `application_version`: the assigned release matching
  `WORLDPAY_EXPRESS_APPLICATION_VERSION`; original attempts require that release
  profile to remain available during recovery.
- `reporting_time_zone`: consultant-confirmed zone, separate from the Guam
  business-date zone. Do not guess reporting boundaries from the browser clock.
- `usd_query_contract: true` and `fraud_policy: processor_enforced` only after
  confirmation that the original authenticated merchant query guarantees USD
  and enforces the required AVS/CVV/fraud rejection policy. These flags record an
  assigned contract; setting them is not evidence that the contract exists.

The snapshot copies only the permitted non-secret profile fields. Environment,
account identity, request amount/reference and original profile stay bound to the
attempt. Validate sandbox/production endpoints and all required fields before
setting `WORLDPAY_TRANSPORT_ENABLED=true`. Simulation never creates this runtime
or loads its credentials. Production pause and durable-worker activation gates
remain in force.

## Hosted-page lifecycle

1. Validate/review the customer request and save its idempotency key/capability in
   the browser before posting. Persist server pricing, identity, order, stock
   reservation, profile and operation GUID before setup dispatch.
2. Preflight assigned configuration without network access. TransactionSetup
   records its method/key/payload digest before transport. Store its GUID and
   hosted URL separately from the financial charge ID; store only the
   ValidationCode digest. Do not log the return query or wire credentials.
3. Save the returned order/session in the browser before navigating to the
   allowlisted hosted page. The browser sends no PAN/CVV to Rails. Existing
   Hosted Fields simulation remains a separate development-only adapter.
4. A return requires signed original state, setup GUID and ValidationCode match.
   Ignore returned amount, approval and charge hints. Query the original setup
   GUID on the authenticated Reporting interface; never follow hosted execution
   with a sale. The common finalizer owns fulfillment exactly once.
5. Back/reload/no return uses the saved session and worker recovery. A lost
   creation response replays its original request key, without collecting again.
   Switching accounts pauses that recovery until the original owner returns.

Legacy HPP setup lasts at most ten minutes. Expiry removes the collection URL;
it does not prove cancellation. A lost setup response cannot safely create a
replacement setup under the unconfirmed replay contract. Preserve unknown state
and escalate for manual reconciliation. Browser cancellation only queries; it
cannot release an unknown financial claim.

## Recovery limits and activation evidence

Empty, capped, malformed or ambiguous queries remain unknown. Full paid proof
requires the original setup query plus one matching reference, account, acceptor,
terminal, sale type, exact amount, approval and eligible transaction status.
Partial/duplicate/communications outcomes remain quarantined. No-PAN reversal,
refund/void sequencing, token usage, reporting lag and funding import formats
need assigned-contract fixtures before enabling their real financial operations.
Generic XML ports are not authority to send those operations.

The simulator and injected fixtures establish application behavior only. Record
the release SHA, assigned case/profile IDs, device, scrubbed receipts and recovery
evidence in the certification runbook once access and consultant scripts exist.
Do not send processor traffic during ordinary local tests.
