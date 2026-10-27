# Canonical accounting CSV

This is an **application-owned canonical interface** for accounting observations:
**format to be confirmed with the bank**. It does not implement a bank or Worldpay
funding format. Parsing does not establish settlement, closed batch membership,
funding, or payment authority. It never writes payments, orders, stock, or records.

## Interface

```ruby
require_relative "../../../../app/services/payments/reconciliation/canonical_csv"

context = { "account_id" => "0007", "environment" => "simulated", "currency" => "USD" }
result = Payments::Reconciliation::CanonicalCSV.parse(csv_text, context: context)
# { records: [ { "schema_version" => "tsq-reconciliation-v1", ... } ], sha256: "..." }
output = Payments::Reconciliation::CanonicalCSV.dump(records: result[:records], context: context)
```

`context` must come from the server. It contains exactly the three string keys
shown above. Account IDs match exactly, including leading zeros; environments are
`production`, `sandbox`, or `simulated`; currency is exactly `USD`. Accepting an
environment here grants no deployment or import authorization. The caller must
enforce those permissions and production/simulation separation.

`parse` returns a frozen hash with symbol keys `:records` and `:sha256`. The array,
each record hash, and every string are frozen. Record keys are strings and include
all 25 columns. Empty optional fields become `nil`. Cents and `location_id` become
Ruby integers; IDs remain exact strings. SHA-256 covers the exact input bytes,
including any BOM and original line endings. Equal rows, repeated external IDs,
and conflicting observations remain in source order for the durable importer to
audit. No financial totals, relationships, signs, or dates are inferred or matched.

`dump` takes an array of string-key hashes. It supplies omitted schema/context
fields, rejects supplied conflicts (including `nil`), and rejects unknown keys.
Present numeric fields must be Ruby integers, never floats or numeric strings;
other present values must be strings. Inputs are not mutated. Output uses UTF-8,
LF endings, no BOM, and the fixed header/record order. Timestamp normalization and
empty-to-`nil` normalization use the same rules as parsing. The generated CSV is
parsed again and checked against the normalized records before returning.

Failures raise `Payments::Reconciliation::CanonicalCSV::Invalid` with only a row,
field, and static reason. CSV row 1 is the header; data starts at row 2; row 0 means
an input/context/export-level failure. Error text never includes source values.

## Columns and validation

The header is mandatory and must match this exact order. Duplicate, reordered,
missing, or extra columns fail:

```text
schema_version,record_type,account_id,environment,currency,external_id,batch_id,deposit_id,transaction_id,original_reference,location_id,terminal_id,entry_type,amount_cents,sales_cents,returns_cents,fees_cents,adjustments_cents,occurred_at,provider_local_time,provider_offset,business_date,provider_batch_date,deposit_date,description
```

Every row requires version `tsq-reconciliation-v1`, the exact context, a supported
record type, and `external_id`. The external ID identifies an observational source
record; callers must not invent a provider financial identifier to fill it.

| Type | Additional required fields |
| --- | --- |
| `batch` | `amount_cents`, `sales_cents`, `returns_cents`, `fees_cents`, `adjustments_cents`, `provider_batch_date`, `business_date` |
| `item` | `batch_id`, `entry_type`, `amount_cents`, `occurred_at`, `business_date` |
| `deposit` | `amount_cents`, `deposit_date` |
| `allocation` | `batch_id`, `deposit_id`, `amount_cents` |

Populated type-specific fields are limited as follows. Blank fields are allowed
where they are not required:

| Fields | Allowed types |
| --- | --- |
| `batch_id`, `provider_batch_date` | batch, item, allocation |
| `deposit_id`, `deposit_date` | deposit, allocation |
| `transaction_id`, `original_reference`, `entry_type` | item |
| `sales_cents`, `returns_cents`, `fees_cents`, `adjustments_cents` | batch |

Item entry types are `sale`, `return`, `void`, `reversal`, `fee`, and `adjustment`.
Other optional fields can accompany any type. These shape checks do not prove
membership, matching, net calculations, or actual settlement/funding status.

All IDs are 1–128 ASCII bytes, start with an ASCII letter or digit, and contain
only letters, digits, underscore, dot, colon, slash, or hyphen. `location_id` is an integer
from 1 through 2147483647. Cents are base-10 integers with optional minus sign and
absolute value at most 2147483647; plus signs, whitespace, decimal points,
scientific notation, and separators fail. Leading zeros parse as base 10. Amounts
and adjustments may be negative or zero; sales, returns, and fees cannot be
negative. No floating-point conversion occurs.

Dates use valid Gregorian `YYYY-MM-DD`. `occurred_at` requires
`YYYY-MM-DDTHH:MM:SS[.fraction]Z` or an explicit signed `HH:MM` offset and becomes
UTC with six fractional digits. Fractions are limited to six digits to avoid
silent precision loss. Hours are 00–23, minutes/seconds 00–59; leap seconds and
24:00 rollover fail. UTC normalization must retain a four-digit year. Provider
local time uses `YYYY-MM-DD HH:MM:SS` and must appear with a signed `±HH:MM` offset
(hours 00–23, minutes 00–59). Both originals are preserved independently of
`occurred_at`. No timezone, cutoff, business date, or deposit date is guessed.

Descriptions are at most 160 Unicode characters and 512 UTF-8 bytes. Control
characters (including tabs, newlines, NUL, DEL and C1 controls) fail in every cell.
CSV quoting preserves commas and double quotes. A description beginning with
`=`, `+`, `-`, or `@`, after optional Unicode whitespace, must already have a **literal
leading apostrophe**, for example `'=SUM(A1:A2)`. Both parse and dump reject unsafe
descriptions instead of inserting an escape. The apostrophe remains part of the
stored text and exported value, making the round trip transparent. Signed integer
money cells remain numeric accounting values. IDs cannot start with formula
characters.

Input is limited to 1 MiB, 1000 data rows, exactly 25 columns, and 512 bytes per
cell. Export enforces the same bounds. Empty input, header-only files, blank or
malformed records, invalid CSV quoting, and invalid UTF-8 fail. Raw UTF-8 bytes are
validated without transcoding; one initial UTF-8 BOM is accepted and any additional
or embedded BOM fails. LF and CRLF are supported. Optional blanks are not trimmed.

## Standalone acceptance

From the repository root, with Ruby and the RSpec components installed:

```sh
ruby api/spec/services/payments/reconciliation/canonical_csv_spec.rb --format progress
```

The spec loads RSpec and this class directly. It does not load Rails, ActiveRecord,
the application spec helper, a database, a server, or provider clients. Fixtures
are synthetic. Coverage includes all four record shapes, exact context isolation,
required/incompatible fields, duplicate preservation, integer and ID boundaries,
strict dates and timestamps, Unicode/quoting/formula policy, invalid bytes and
controls, malformed CSV, exact 1 MiB/1000-row bounds, frozen results, checksums,
deterministic typed exports, and round-trip validation.

This bounded port follows the repository implementation specification §§5.4,
5.5, 6, 9, and slice 7 of §11 at baseline
`54b3b584f70b125789c3efaf765ae35f9e2121ba`. Full importer persistence, authorization,
closed membership, idempotency, duplicate/conflict audits, accounting UI,
integration QA, and bank-format/cutoff confirmation belong to the parent slice.
No bank contract or certification is claimed by these standalone tests.
