# Published Express XML contracts

`Payments::Worldpay::PublishedContract` contains immutable XML names and paths.
It performs no I/O and supplies no assigned merchant or terminal values.

Sources checked on 2026-10-27:

| Source | Published evidence used |
| --- | --- |
| [Express Interface Specification 3.1.7](https://docs.worldpay.com/assets/pdf/ExpressInterfaceSpecification3.pdf), dated 2026-02-28 | Request/response fields, HPP lifetime and return validation, TransactionQuery by setup ID, fixed-page reporting, status enumerations |
| [Sale sample](https://github.com/ElementPS/Express.CSharp/blob/ad180f2dead0cf93efa29d139e51aa2b1bcce415/README.md), 2018-07-19 | Transaction namespace and response nesting |
| [Hosted Payments sample](https://github.com/ElementPS/HostedPayments.CSharp/blob/2197ca44802ad3aa24bc6c13f0ec0c7473b38a91/README.md), 2018-07-19 | Paired setup ID and ValidationCode paths |
| [Query sample](https://github.com/ElementPS/TransactionQuery.CSharp/blob/734635bbe67364a90613d6cad851836c73e1fd85/TransactionQuery.CSharp/Controllers/HomeController.cs), 2018-12-16 | Reporting namespace, ReportingData/Items/Item and mapped transaction facts |

PDF SHA-256: `9c35a5590fc4e702911232b71fb0e1ec1e040f20f03a60c009e429153ff333c3`.
Printed pages 19–20 establish HPP return hints and querying by the stored setup ID;
66–68 establish the two reporting methods. Printed pages 113–114 define setup
methods and transaction status codes. These are published interface facts, not
proof of merchant assignment, certification, or the exact Hosted Fields SDK.

## Interfaces

- `wire_contract`: bounded transaction/setup/query layouts. Raw card fields and
  unverified instrument mappings are excluded. Sale and authorization therefore
  remain serialization ports until the assigned instrument contract is supplied.
- `namespaces`: verified Transaction and Reporting namespace identifiers. They
  are independent of sandbox endpoint hosts. Services remains unsupported.
- `setup_contract(presentation: "legacy")`: paired GUID and ValidationCode paths.
  Premium raises an explicit unsupported-contract error. The generic HPP parser
  supports an injected, separately reviewed Premium URL contract; the application
  does not enable one.
- `observation_contracts`: six financial response maps. Observations retain facts
  but have `unknown` status and no inferred financial amounts or currency.
- `report_contract` and `pagination_request`: per-Item counts, fixed 1,000-row
  pages, PageNumber without a fabricated PageSize field. Every Item count must
  agree; requested page, page count, total and row counts must match.
- `ExpressClient#transaction_query(setup_id:)`: non-paginated original-setup
  query, following the published HPP recovery procedure. An empty result or a
  result at the 1,000-row cap is incomplete. Multiple matches cannot fulfill.

Direct and bounded escaped/CDATA reporting XML accept only the configured
ReportingData/Items roots. Reporting responses are limited to 8 MiB, depth 16,
200,000 reader nodes and 1,000 rows. Pagination aggregates at most 10,000 rows;
changed counts, missing/duplicate IDs, conflicting overlap or malformed later
pages retain incomplete status. Transactions remain limited to 64 KiB and 4,096
reader nodes. DTDs, external entities, attributes and mixed namespaces fail closed.
Unknown field names are bounded; unknown values and card/expiry/token fields are
not retained. Reporting account identifiers are compared server-side and never
published through the checkout/config serializer.

`QueryResult` is a separate application policy boundary. Only a complete query
of the stored setup GUID, one original reference, matching account/acceptor/
terminal/type, exact amount, approval and approved/settled sale state can become
a typed captured result. It additionally requires the frozen assigned USD and
processor-enforced fraud contracts. USD is a merchant/query-context guarantee,
not an invented response field. Partial, duplicate, absent and unknown proof
remain quarantined. No report observation authorizes a refund or settlement.

## Verification

Fixtures are synthetic and use injected transports. Unit and request tests block
real HTTP. Run the Worldpay directory and `worldpay_checkout_spec.rb` with the
project Ruby version; request tests require a dedicated disposable test database.
See [Express operations](../../../../../docs/WORLDPAY-EXPRESS-OPERATIONS.md) for
configuration, rollout limits and remaining assigned-contract requirements.
