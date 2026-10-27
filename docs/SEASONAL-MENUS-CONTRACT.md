# Seasonal menus backend contract

TSQ-28 adds schedules to the existing collection model. It uses the columns reconciled in #42; no migration, publication job, storefront classification change, or location lifecycle is required.

## Time and visibility

Rails uses `Pacific/Guam` (UTC+10). Admin clients should send ISO 8601 timestamps with an offset. Inputs without an offset use the Rails zone. All collection API responses serialize `starts_at` and `ends_at` in Guam with an explicit `+10:00` offset; absent bounds are `null`. For example, Guam `2026-12-25T00:00:00+10:00` is UTC `2026-12-24T14:00:00Z`.

The ordering window includes `starts_at` and excludes `ends_at`. Either bound may be omitted. When both exist, `ends_at` must be strictly after `starts_at`. Invalid datetime strings are rejected. Supported `collection_type` values are `standard`, `seasonal`, `event`, and `limited_time`; the type alone does not impose dates. `banner_text` is optional plain text, limited to 200 characters.

A collection must be published and in an enabled storefront to appear publicly. Upcoming collections always return 404 by ID or slug. Ended collections with `auto_hide: true` also return 404. With `auto_hide: false`, an ended collection remains visible and returns `available: false`, `availability_status: "ended"`, `products: []`, `product_count: 0`, `thumbnail_url: null`, and a zero product total. Shared products remain available through other eligible menus but are not presented for ordering on the ended page.

`Collection.visible_at(at)` and `visible?(at:)` implement publication/time visibility. `Collection.ordering_at(at)` and `ordering_available?(at:)` require publication and an open window. Storefront settings remain a separate filter. All checks run at query time without changing `published`.

## Product eligibility shared with payments

```ruby
MenuEligibility.enabled?(product, at: Time.current)
MenuEligibility.scope(relation, at: Time.current)
```

Both forms apply this rule:

1. A product with no scheduled/special collection association retains existing behavior, including products with no collections or only unpublished regular collections.
2. An association is scheduled/special if either time bound exists or `collection_type != "standard"`, regardless of its publication or visibility.
3. Once any such association exists, at least one associated **published** collection must contain `at` in its ordering window. A published regular collection with no bounds qualifies and keeps a shared product available. An unpublished regular collection does not qualify.
4. `auto_hide` affects collection visibility only. It never extends product ordering after expiry.

These methods check menu eligibility only. Callers must also enforce `StorefrontEligibility`, product publication/archive status, location, inventory, and other existing ordering rules. `StorefrontEligibility` classification and settings methods are unchanged. Payment consumers can use the current time for cart/session checks and `order.created_at` for finalization/recovery. Historical checks use that instant against **current** collection associations, publication, and schedule data; they do not reconstruct historical edits. Reload a previously cached association after changing collection membership/publication in the same process.

Public product lists and direct product APIs combine storefront and menu eligibility. Product collection memberships in responses omit invisible collections. A product-list collection filter returns only products from a published, enabled, currently orderable collection. Collection list/detail counts, thumbnails, and products use the same eligible product relation, with no products on an ended page. Public requests capture a single instant for consistent decisions across all queries and serialization.

## Admin and response fields

Admin create/update permit `collection_type`, `starts_at`, `ends_at`, `auto_hide`, `banner_text`, and `is_featured`, alongside existing fields. Admin list/detail/create/update responses and public collection list/detail responses include those fields plus:

- `available`: boolean; published and within the ordering window, independent of inventory and storefront settings.
- `availability_status`: `unpublished`, `upcoming`, `active`, or `ended`, in that precedence. Public visibility excludes the first two states.

`featured` remains the canonical feature flag and continues to drive the existing `Collection.featured` scope and frontend behavior. `is_featured` is an API compatibility alias: admin writes through either name control `featured`; if both are supplied, `featured` wins even when unchanged. Responses expose the same value under both names. Model saves synchronize the stored seasonal column, including normalizing a legacy null `featured` to false. Existing rows with divergent columns follow `featured` until saved; `is_featured` does not introduce another ranking or promotion mode. Existing collection sort order is preserved.

## Scope and verification

Source context: repository README (restaurant/catering ordering for Three Squares/B&G Pacific); the Brain Dump restart plan dated 2026-10-27 (Phase 1b TSQ-28 port, keep production paused); existing storefront contract; base `f776c34`, main ancestor `5d46a84`. Customers browse available menus/products; staff configure schedules in admin. The parent owns frontend controls, Guam datetime-local conversion, live UI acceptance, QR/location URLs, integration, and merge. Payment enforcement belongs to the payment worker.

Backend acceptance is exercised through isolated model/service specs and Rails request specs: Guam midnight and UTC previous date; inclusive/exclusive bounds; future/current/expired menus with both auto-hide values; publication changes; shared/exclusive items; SQL/record parity across association combinations; invalid dates/types/banner length; list/direct visibility; product types/counts/thumbnails; admin save/reload/serialization and feature alias precedence. Full API RSpec and Brakeman results, exact tested commit, fixture cleanup, and outstanding UI/integration checks are recorded in the worker handoff.
