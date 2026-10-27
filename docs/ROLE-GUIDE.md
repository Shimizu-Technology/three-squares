# Staff roles and location access

An owner assigns each account a role in **Users**, chooses its location when required, and selects **Save access**. Device registration never grants an account more access. The workspace displays the current role and location scope.

| Task | Owner | Manager | Staff | Customer |
| --- | --- | --- | --- | --- |
| Pickup/shipping queues, order details and status, POS sales | All locations | All locations or one assigned location | Assigned location | Own orders only |
| Local sold-out/restore | Any location | Authorized locations | Assigned location | — |
| Refunds, revenue reports and CSV exports | All locations | Authorized locations | — | — |
| Account-wide settlement/funding reconciliation | Yes | All-locations managers only | — | — |
| Catalog, collections, menu CSV and seasonal menus | Yes | Yes | — | — |
| Shared stock history | Yes | Read; order-linked entries respect location scope | — | — |
| Change shared stock | Yes | All-locations managers only | — | — |
| Catering inquiries | Yes | Global shared inbox | — | Submit inquiry |
| Location hours, active state and menu QR | Any location | Authorized locations | — | — |
| Create/delete locations | Yes | — | — | — |
| Homepage merchandising | Yes | All-locations managers only | — | — |
| Register own device and manage its alerts | Yes | Yes | Assigned location | — |
| Manage other devices | Any device | Within location scope | — | — |
| Users, roles, site/storefront/payment settings | Yes | — | — | — |

Owners always have all-location access. Managers may have all locations or one assignment. Staff must have a valid assignment; without one, the workspace says **Ask a manager to assign your location**. A location selector cannot expand that assignment. The last owner cannot be demoted or deleted, including by simultaneous requests.

Authorization changes apply on the next server request. After an owner changes another account, refresh that account's workspace to update its displayed role, location choices and navigation. Changing your own access refreshes it automatically.

Staff can change an order's status. Managers can also edit internal notes/tracking and resend notifications. A refund requires manager or owner access. Individual order and POS amounts remain visible where needed for fulfillment and cash handling; staff cannot access aggregate revenue or exports.

Only the device currently owned by the signed-in account can use the current-device registration and push controls. Managers and owners use the device management list for other devices. Changing a device's user/location disables its old push subscriptions. Alerts require an active device and subscription at the exact order location; unassigned devices and locationless orders receive no global fan-out.

Reader collection/status retains checkout-user and terminal-lease checks. Reader provisioning/pairing belongs to owners and all-locations managers. Stripe reader discovery remains owner-only until it can enforce reader location. Administrative simulator commands are owner-only and unavailable in production. The customer's local fake checkout form retains its separate session capability and opaque handle checks; it grants no staff access.

**Payment Reconciliation** shows Guam business dates, provider batch dates and actual deposit dates separately. A deposit retains its full account amount when batches are filtered by location. The CSV interface is labeled **Format to be confirmed with the bank**. Manual allocations and exception reviews require a reason and retain an audit trail. Reviewing an exception acknowledges it; it does not repair a mismatch or change an order/refund/stock result. Simulated batches, funding and accounting-time controls are owner-only, move no money and do not advance payment recovery clocks.

Menu CSV import is available to managers. The legacy Shopify importer also writes shared inventory and requires an owner or all-locations manager. Raw upload-blob purging remains owner-only; managers use the product's image controls. The fast local86 interface and consolidated CSV workflow are delivered in their subsequent Phase 3 slices; the narrow local availability API already enforces this matrix.

Existing legacy administrators migrate to owners. Allowlisted login bootstraps a new/unclassified account only; it never reverses an owner-set role. This guide supersedes the earlier role implementation/training proposals in PRs #33/#34 and staging TSQ-20. Assign actual people according to the business's acceptance decision; the guide intentionally names no individuals.

Production remains paused during restart work. A deployed frontend does not mean production ordering or payment acceptance is enabled. Physical iPad/Safari/PWA rehearsal and operator acceptance remain required before launch.

All-location managers open **Homepage** in the workspace navigation to edit banners and featured content. General **Settings** stays owner-only. Older homepage-tab links redirect to the dedicated editor.
