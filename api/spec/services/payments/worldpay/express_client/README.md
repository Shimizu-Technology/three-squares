# Express backend ports

The backend ports are `Configuration`, `XmlBuilder`, `ExpressTransport`,
`ExpressClient`, `HppSetup` and `ExpressReportParser`. They use exact integer
cents, bounded parsers, fixed method/host allowlists and injected transports.
Construction performs no network request. There are no automatic retries or
redirects; unknown transport outcomes retain financial uncertainty.

`ExpressClient` supplies setup, sale, authorization, completion, linked return,
void, known-ID reversal, original-setup query, paginated reporting, batch and
selected-token service seams. A method without a verified layout fails before
transport. Native GUID IdempotencyKey is serialized on transaction methods;
reporting/services interfaces do not receive that field. The client does not
claim that every transaction method has assigned idempotency support or a known
retention window.

Published Transaction and Reporting maps are described in
[published_contract.md](../published_contract.md). Service namespaces, instrument
mapping, Premium, token consent/usage and no-PAN System reversal still require
assigned contracts. A token service call requires both an explicitly configured
scheme and consent; this stateless guard does not replace durable consent records.
No saved-card or token collection UI is enabled.

`HppSetup` separates legacy GUIDs from reviewed Premium full URLs. ValidationCode
is server-only and omitted from `to_h` and `inspect`. `HostedCheckout` stores its
SHA-256 digest for return comparison. The setup GUID never becomes a charge ID.
Only the shared payment finalizer writes paid fulfillment and inventory.

`ExpressReportParser` produces unknown financial observations. The application
`QueryResult` boundary may classify only the specific, authenticated original-HPP
query proof under its frozen assigned contract. Query success alone, callback
values, setup success, report completeness and HTTP 200 do not mark an order paid.

Run from `api`:

```sh
bundle exec rspec spec/services/payments/worldpay spec/requests/api/v1/worldpay_checkout_spec.rb
bundle exec rubocop app/services/payments/worldpay spec/services/payments/worldpay
```

Tests use synthetic credentials and injected/mock transports. Request tests need
an isolated disposable database. No processor call is part of routine testing.
See [Express operations](../../../../../../docs/WORLDPAY-EXPRESS-OPERATIONS.md).
