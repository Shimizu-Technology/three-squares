# Location offerings

`ProductLocation.offered` describes whether a location carries an item. `available` is its daily availability. Both must be true for a pickup sale. Shared inventory, variant availability, menu schedules, location hours and payment checks still apply.

| Offered | Available | Meaning |
| --- | --- | --- |
| true | true | On this location's menu; stock and other eligibility checks apply |
| true | false | Sold out today; stays visible to customers and in POS Manage availability |
| false | either | Not carried; hidden from this location's customer/POS menus |

The product editor's **Pickup menus & daily availability** section saves each operation immediately. Owners and all-locations managers can offer/remove items; scoped managers can read membership and change daily availability only at their assigned location. Staff use POS **Manage availability** for daily changes. Restoring never offers a non-carried item. Removing/re-offering preserves daily state and price overrides, so an item that was sold out remains sold out when offered again.

New catalog creation/import retains the existing scoped initial location assignment. After creation, membership changes use the separate `catalog.offerings.manage` operation. Existing catalog editor saves omit legacy `location_ids`; legacy API clients may still change authorized daily flags, but cannot restore a non-carried item through that field.

## API contract

- `GET /api/v1/admin/products/:product_id/offerings`: `catalog.manage`; lists location membership, daily state and the caller's daily edit scope.
- `PATCH /api/v1/admin/products/:product_id/offerings`: `catalog.offerings.manage`; JSON `{"offering":{"location_id":1,"offered":false}}`. Only those two keys are accepted; `offered` is a JSON boolean.
- Admin product summaries expose `offered_location_ids` separately from effective daily `location_ids`; list controls use membership to distinguish not carried from sold out.
- The existing `/availability` endpoint changes only `available`, requires `availability.manage` and location authorization, and rejects non-carried items.
- Public product/collection `location_id` filters use membership and return offered sold-out items with `actually_available: false`. A direct non-carried product URL with `location_id` returns 404. Pricing cannot provide a payable location price for a non-carried item.
- POS excludes non-carried items in both modes. Sale mode retains disabled sold-out tiles; **Manage availability** restores offered items. The location is an authorized saved preference, otherwise Main, otherwise the active location with the most offered published pickup items. Pending payment recovery retains its original location validation.

## Production launch checklist

The migration adds a non-null boolean with default `true`. **Every existing row becomes offered, with `available` unchanged. Never infer membership from old false rows.** Products without any location rows retain legacy all-location eligibility; the first membership/daily operation materializes that meaning. Once rows exist, a missing location row is not offered.

1. Apply the schema migration through the normal release process. It alone does not change catalog eligibility.
2. Have the operator approve a CSV with the exact headers `location_slug,product_slug,offered`. Use exact slugs and literal `true`/`false`, with one row per pair. List every intended change; omitted pairs are untouched. Keep the approved mapping and preview in the private launch record.
3. Preview against the intended database using `FILE=/absolute/path/approved.csv bin/rails catalog:map_offerings`. The default is read-only. Unknown slugs, duplicate pairs, invalid booleans or invalid headers fail the entire mapping before any writes.
4. Review the preview with the operator. Apply the same approved file using `FILE=/absolute/path/approved.csv APPLY=true bin/rails catalog:map_offerings`. The whole mapping is transactional; repeated apply is idempotent and preserves daily flags and prices. Membership changes lock products in the same ID order used by sales.
5. Re-run the preview: it should report zero changes. Verify Main/Donki customer menus, POS sale/management modes and sold-out restoration before enabling ordering. Removing an offering can reject an in-flight sale at finalization; the existing payment recovery/compensation path remains authoritative.

The development restaurant seed models Main's catalog and only the ten Donki collection items at Donki. Other items at Donki are `offered: false, available: true`, rather than sold out. **Do not use catalog reseeding as a production membership repair:** seeds intentionally reset development menu membership/daily state; use the approved mapping for existing production rows.
