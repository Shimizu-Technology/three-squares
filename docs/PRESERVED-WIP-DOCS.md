# Preserved research and meeting notes

The Worldpay, Bank of Guam, Authorize.net and functionality-audit documents dated April–May 2026 were recovered from `wip/tsq-restart-preserve-2026-10-27` (`e5cfcb8`). They preserve the research, questions and meeting context available then. Provider behavior, API assumptions and implementation status in those notes need to be checked against the October 27 restart audit and Worldpay implementation specification before use.

The current direction is Worldpay primary with Stripe as an alternative, shared durable checkout/payment records, server-side eligibility, one locked finalizer, idempotent refunds and recoverable delivery. The May functionality audit does not close the October findings F01–F18. Express XML/triPOS Cloud details in the October specification take precedence over older generic Worldpay SDK or webhook assumptions.

These files do not authorize production setup, migrations, payments, messages or resuming the suspended API. The existing paused-preview entry remains the production behavior.
