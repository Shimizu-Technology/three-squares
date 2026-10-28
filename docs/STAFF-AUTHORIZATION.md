# Staff authorization integration contract

The canonical registry is `api/app/policies/staff_access_policy.rb`. The explicit controller/action map is `staff_route_capabilities.rb`; a route inventory spec rejects any administrative action without a mapping or shared guard. Unmapped admin actions return 403 even for owners. Model `admin?` compatibility means owner only, never staff-or-higher.

The shared `StaffAuthorization` concern is included through `Authenticatable`, covering direct controllers as well as `Admin::BaseController` inheritors. It authenticates before making a policy decision even when legacy controllers re-declare authentication callbacks. Existing `require_admin!` calls dispatch through the same mapped guard. Automatic staff authorization applies only to `Api::V1::Admin::*`; legacy order index/update use an explicit mapped guard. Public checkout endpoints never instantiate the staff policy.

Controller helpers:

```ruby
staff_access_policy                         # StaffAccessPolicy for current_user
require_staff_capability!("payments.collect") # renders 403 and returns false on denial
staff_scope(Order.all)                       # relation: all / assigned location / none
staff_scope(relation, location_column: :location_id)
staff_access_policy.location_allowed?(location_id)
```

A capability check admits the action category; pair it with scoped record lookup and any resource ownership requirement. `allowed?(capability, location_id: nil, device: nil)` checks a supplied location/device when relevant. An omitted location is not proof that a particular record is authorized. Blank/invalid staff assignments have scope `none`. Device headers never influence account scope.

| Capability | Purpose |
| --- | --- |
| `account.self` | Own account, with record ownership enforced by the endpoint |
| `orders.read`, `orders.counts`, `orders.status` | Operational queue/detail/counts and state-machine transitions |
| `orders.manage`, `orders.notify`, `orders.export` | Broader notes/tracking, notification resend, CSV |
| `pos.sell`, `payments.collect` | Scoped POS sales, reader listing/collection/status/confirmation |
| `payments.refund` | Scoped refunds/reconciliation through payment services |
| `payments.terminals.manage` | Owner/all-locations manager reader provisioning/pairing/deletion |
| `payments.reconcile` | Owner/all-locations manager account-wide settlement, funding, canonical import/export and audited allocation/review |
| `payments.terminals.discover` | Owner-only Stripe reader discovery/connection tokens |
| `payments.simulate` | Owner-only administrative simulator commands |
| `analytics.read` | Scoped aggregate revenue/reporting |
| `devices.self`, `devices.manage` | Own-device controls versus scoped management of others |
| `availability.manage` | Local product sold-out/restore, separate from catalog and shared stock |
| `catalog.manage`, `catalog.import`, `seasonal.manage` | Shared catalog/menu/collection operations |
| `catalog.offerings.manage` | Owner/all-locations manager menu membership; separate from daily sold-out flags |
| `stock.read`, `stock.manage` | Shared history versus writes; writes require all-locations manager/owner |
| `catering.manage` | Global manager/owner inquiry inbox |
| `locations.read`, `locations.update`, `locations.qr` | Scoped location operations; manager update permits hours/active only |
| `locations.manage` | Owner location creation/deletion and full location settings |
| `homepage.manage` | Owner/all-locations manager merchandising |
| `users.manage`, `settings.manage`, `payment_settings.manage`, `ordering.manage` | Owner-only account/site/storefront/payment administration |

`GET /api/v1/me` returns `role`, `capabilities`, `operational_scope` (`all`, `specific`, `none`), assignment fields, and minimal `authorized_locations: [{id,name,slug}]`. Notification contacts are excluded from these choices. The frontend shares this response through `StaffAccessProvider` / `useStaffAccess().can(capability)`; standalone POS has its own provider. UI hiding supplements server enforcement.

`PATCH /api/v1/admin/products/:id/availability` accepts only:

```json
{"availability":{"location_id":1,"available":false}}
```

`available` must be a JSON boolean. The endpoint changes no price, publishing, shared stock or other location's effective availability. It materializes the pre-existing all-location meaning before creating the first location row. Full product updates and CSV imports enforce location scope separately; scoped managers cannot use embedded stock fields or legacy inventory imports to gain shared-stock write access.

Payment controllers retain provider, attempt, checkout-user, idempotency, lease, offline/busy, refund-ledger and restoration behavior. The central map scopes terminal and POS record access before those handlers. Future payment admin actions must declare a capability and retain their existing ownership checks. Customer checkout simulation remains session/capability/opaque-handle authorized with existing nonproduction/simulation guards; it is not an administrative control.

Accounting access deliberately denies location-assigned managers: one deposit can combine several locations, so a partial disclosure could leak totals or invent variance. `payment_reconciliation` read/import/export/allocation/review actions map to `payments.reconcile`. Simulated close, funding export, accounting-time advance and full current-batch void map to owner-only `payments.simulate` and recheck the simulated identity/environment guard. The accounting clock is isolated from all checkout/terminal attempts. Imports never grant capture/refund authority or write order/stock outcomes; see `PAYMENT-RECONCILIATION.md`.

Role writes/deletions must use model callbacks. A transaction advisory lock protects last-owner changes across different rows; callback-skipping SQL can bypass it and belongs only in reviewed migrations/isolated fixture setup. The irreversible role migration converts only legacy `admin` records to `owner`, preserving explicit roles and profile data. Fresh replay must regenerate `schema.rb`.


Payment configuration status (`GET /api/v1/admin/site_settings/payment_status`) is read-only and requires owner capability `payment_settings.manage`. It uses the selected provider, enabled effective location/channel profiles, immutable identities and server gates; it never sends provider requests or returns credentials. Both manager scopes remain denied by the existing settings policy. Legacy `payment_test_mode` remains readable for operational compatibility, but both settings update endpoints ignore it; only deployment preparation may reconcile that field. Profile/provider assignment stays in the existing operator/API workflow.
`GET/PUT /api/v1/admin/online_ordering` maps to owner-only `ordering.manage`. It controls the explicit public ordering pause and optional message; changes retain actor, state, message and time. It grants no payment capture or recovery authority.

Location menu membership uses a separate capability and endpoint; see [Location offerings](LOCATION-OFFERINGS.md). Daily restore rejects non-carried products and never changes membership.
