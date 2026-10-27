# Storefront and pickup eligibility

`StorefrontEligibility.key_for(product)` returns `latte_stone` for products in cookies, cookie-boxes or mini-cookies; otherwise `catering` for catering-* collections; otherwise `three_squares`, including unclassified products. Cookies take precedence when a product is in several business categories. `enabled?(product, settings:)` and `scope(relation, settings:)` implement the same rule. Public product and collection endpoints use it. Cart, checkout, POS and recovery enforcement belongs to the Phase 1c `Payments::Eligibility` wrapper.

Cookies are disabled for launch by a forward migration that changes the database default and disables the existing setting. This is a one-time launch decision; later explicit admin changes persist. The Three Squares and catering flags keep their existing defaults. No payment-setting validation changes are part of this slice.

`Location#accepting_orders_at?(time)` evaluates the supplied instant in Pacific/Guam and requires an active location. `accepting_orders_now?` uses the current time. Daily and grouped weekday keys normalize into exactly seven full weekday names when saved. Explicit days override grouped ranges, which override Daily. Hours support 24-hour or AM/PM times, multiple windows separated by semicolons/commas, and overnight windows attributed to the opening day. Opening is inclusive; closing is exclusive. `00:00 - 24:00` explicitly represents a full day.

An empty schedule means closed on all days. Unknown days, incomplete weeks, conflicting equal-priority entries, malformed times and zero-length windows are rejected when saving and fail closed when encountered in legacy data. Existing grouped restaurant seed data is interpreted correctly without requiring a production data rewrite. Main is closed Monday, open Tuesday–Saturday 08:00–20:00 and Sunday 08:00–17:00; Donki is open daily 10:00–22:00. Both are closed at 23:00.

The payments worker evaluates now when accepting a cart/session and the pending order's accepted timestamp during finalization/recovery. This preserves an accepted snapshot across closing time. That wrapper must still check current publication, storefront settings and location assignments at each required boundary.

Dashboard daily order/revenue grouping converts UTC database timestamps into Guam calendar dates and includes today in the requested series. This does not port staging's separate analytics feature.

ServiceCheck, useBackendAvailability and PausedPreviewPage remain the production entry. No production migration or hosting configuration is performed by this work.
