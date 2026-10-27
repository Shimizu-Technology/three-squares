# Payment settlement and funding reconciliation

Accounting observations do not mark orders paid, authorize refunds or change stock. Those effects remain in the payment foundation. Production processing stays paused, and real funding formats, cutoffs, reporting timezones and transport activation still require the assigned bank/processor contract.

Owners and all-locations managers use **Payment Reconciliation**. Location-assigned managers and staff cannot open account-level batches/deposits: a deposit can contain several locations, so hiding some allocations would disclose or misstate its total. Every accounting action requires `payments.reconcile`; simulated controls additionally require owner-only `payments.simulate`, an explicitly simulated identity, the local simulation flag and a dedicated fixture database. Production has no simulator routes.

## Dates and balances

Keep three dates separate:

- **Guam business date:** the transaction's explicit instant converted to `Pacific/Guam`.
- **Provider batch date:** the date supplied by the source; it is not inferred from deposit timing.
- **Deposit date:** the actual date reported for the funding movement.

Original provider local time and offset are retained when supplied. A provider timezone or daylight-saving rule must come from its assigned contract; the application does not guess one. Location/business-date filters select batches. A displayed deposit keeps its complete account-level amount, including allocations outside those filters.

Batch net is sales minus returns minus fees plus signed adjustments. Combined deposits and split funding use signed allocations with exact integer cents. Allocation groups lock the account, then batches and deposits in stable order, and validate their final balances atomically. This also supports a combined credit/debit deposit without relying on CSV row order. A manual allocation requires an actor, reason and original request key. It cannot cross identity, account, environment or currency.

A close freezes its observed membership. Later imports can replay identical items; they cannot append to an earlier closed batch or rewrite source facts. Changed identifiers/facts, missing links, out-of-band returns and inconsistent batch totals create exceptions. Reviewing an exception records an acknowledgement and reason; it does not correct the source, remove variance, create payment authority or trigger fulfillment/restocking. Corrections are new observations with new source identifiers and an audit trail.

## Canonical import interface

**Format to be confirmed with the bank.** `tsq-reconciliation-v1` is an application-owned CSV interface for a future bank CSV/API adapter, not a claim that a bank export already matches it. Both adapters must feed the same observational importer.

The exact ordered headers and field/type rules live in `Payments::Reconciliation::CanonicalCSV` and its adjacent spec README. Files are UTF-8, at most 1 MiB and 1,000 records; fields and identifiers are bounded. Money is integer USD cents. Dates are strict, and event timestamps require an explicit offset. Opaque references preserve leading zeros and permitted `/` characters. Formula-leading descriptions require a preserved literal apostrophe. Invalid-file errors identify the row/field without echoing uploaded contents.

Record types are `batch`, `item`, `deposit` and `allocation`; item types are sale, return, void, reversal, fee and adjustment. Identity/account/environment come from the authorized account selection and must match every row. Matching uses exact identifiers and financial bindings, never similar dates/amounts. Unknown transactions remain observations with exceptions. External refunds never manufacture a `RefundOperation`, legacy capture binding or inventory effect.

An import key binds original actor, account, exact file SHA-256 and source. Identical replay returns the durable result. A changed file under the same key returns a conflict. After a lost response, query the saved key; if it is not found, reselect the same file and replay the original request. Do not create a fresh key merely because a response was lost. The browser retains request identity/digest, not uploaded CSV or payment data. Exports are bounded and fail explicitly rather than silently truncate.

Validation refusals use the foundation's `RejectedPaymentRequest` ledger under the same accounting lock. A savepoint rolls back partial observations before the actor/account/kind/key and payload digest are durably fenced. Import status and exact replay return that refusal after reload. The UI permits acknowledgement only for a matching original-key refusal, or the existing refund service's bound `no_operation` proof for a stale simulated void. A generic 422, unknown response or key conflict is not abandonment proof. Corrected details require a new key after acknowledgement; the refused key can never later create an operation.

## Simulated accounting

Simulated payments move no money. Batch close reads the persisted local processor ledger and feeds the canonical importer. Synthetic flat fees and funding plans are labeled examples; they make no pricing or bank-deposit promise. Available cases include ordinary funding, combined batches, split deposits, weekend lag, missing deposits, duplicate records, amount mismatch and an out-of-band refund.

The synthetic source uses a UTC provider batch date and Guam transaction/deposit dates. This is a deterministic fixture choice, not a statement about the assigned processor cutoff or timezone. A combined example keeps each original sale and its same-close mutations together; it requires at least two independent payments when only one lane/location group exists.

The accounting timeline is separate from `SimulationClock` and every attempt's offset, expiry, query schedule and event delivery. Advancing it only makes planned accounting observations visible. Download the synthetic funding CSV and import it through the same canonical interface. Missing funding remains unfunded; duplicate source records do not add money twice.

A full current-batch simulated void targets an explicitly selected original attempt. It reserves and applies the mutation through the existing refund services, has its own immutable key and does not restock. A closed sale cannot be voided; its definitive simulated failure releases the refund reservation while the paid order stays paid. A later linked return belongs in a later batch. Sale plus successful void/reversal is excluded once from settlement; later-visible reversals preserve the old batch and produce a separate correction. Real void/return/reversal activation remains blocked by the assigned contracts.

## Revenue reports

Ordinary dashboard totals, charts, period comparisons, business/location breakdowns, order summary and CSV financial columns use one calculation: verified consumed captures minus succeeded refund ledger rows. Pending, unknown or failed refunds reserve money but do not reduce recognized net revenue. A full refund contributes zero net even when the order's display status is `refunded`. Separate equal-valued orders count separately; duplicate item joins cannot multiply revenue.

Production is the server-side default. Sandbox, simulated and unstamped orders are excluded. Historical card orders require an independently verified `LegacyCaptureBinding`; a `paid` label or current payment setting is insufficient. Unverified history therefore contributes zero until its original evidence is verified through the established foundation. Imports cannot fill that authority gap. Staff POS cash requires its committed inventory/order evidence and remains in ordinary revenue, outside processor settlement. CSV preserves gross order totals and adds captured, succeeded-refund and net-revenue cents.

For a non-production demo with simulation enabled, dashboard and analytics show an all-time, location-scoped count with **Simulated orders aren't counted in revenue**. Their totals and charts still use production-only net revenue; the notice never mixes simulated cents into those queries. Production responses omit the notice and retain the existing reporting data contract.

This slice supplies simulator/application evidence for C09 and C17. It is not processor certification, proof of a physical device, an assigned funding format or permission to resume production.
