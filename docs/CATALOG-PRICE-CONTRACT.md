# Catalog prices and purchase eligibility

`CatalogPrice.resolve(product:, variant: nil, location_id: nil)` returns the customer contract: unit cents, optional compare cents, purchasable/reason, a range indicator and location context. Public cards, detail variants, collections, cart, checkout snapshots and POS share this resolver. Range filtering/sorting uses its SQL companion before pagination, with contract specs checking both implementations.

A product-level location override replaces the global sale only when all variants share one regular price. Differently priced sizes retain their own prices; legacy ambiguous overrides are ignored and new ProductLocation saves reject them with a staff-facing explanation. Without an applicable override, a configured global sale replaces the selected variant's price (or the cheapest available variant/base for a listing). Only that same variant's higher regular price may appear as “was”; location overrides have no compare price. Multi-price listings say “From”. A global sale does not stack on an override.

`market_price` and `quote_only` items never enter payable carts, even if their placeholder cents are positive. Unresolved zero prices also require a quote. An explicit zero sale can represent a promotion. `complimentary_with_meal` identifies the seeded tea: it can be zero, but cart addition and checkout require a payable `local` meal. Removing that meal prevents checkout. Checkout still requires a positive total. Quote items already in a legacy cart stay viewable/removable, show their unresolved state and cannot proceed to payment.

Location context is a request parameter for catalog queries and `X-Location-ID`/pickup attributes for cart/checkout. Shipping does not inherit a browsing-location override. Checkout snapshots freeze resolved item cents; finalization never recharges a changed catalog price. No provider behavior or checkout/payment UI changes are included here.

Seeds and decimal-money setters round decimal input at the cents boundary. Seeds are demo data, not an authorization to repair production prices.
