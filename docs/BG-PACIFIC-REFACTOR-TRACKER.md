# B&G Pacific Refactor Tracker

**Project:** Three Squares Platform (forked from Hafaloha)  
**Owner:** Shimizu Technology / B&G Pacific  
**Last Updated:** 2026-02-11  
**Status:** Phase 1 implementation complete; Phase 2 largely complete; Phase 3 started (split storefront routes first slice)

---

## Purpose

This is the living source of truth for the B&G Pacific refactor.  
Use it to track:

- what we already fixed
- what we need to build next
- what decisions are locked
- what is intentionally deferred

---

## Business Context (Why this refactor exists)

B&G Pacific operates multiple business lines with different fulfillment and menu/location logic:

1. **Three Squares** restaurant operations (Main + Donki, different menu contexts)
2. **Catering / wholesale** services
3. **Latte Stone Cookies** (ecommerce/shippable, may also allow pickup)

The app was forked from Hafaloha and currently still carries single-store assumptions in key flows.

---

## Decision Log (Locked)

These are confirmed decisions from stakeholder discussion:

1. **Fulfillment should be configurable per product** (allow pickup and/or shipping).
2. **Mixed fulfillment carts are blocked for now** (one order type at a time).
3. **Do location modeling properly now** (not just UI-level filtering hacks).
4. **Keep one storefront for now**; split route experiences can come later.

---

## Pre-Build Gate Checklist (Keep It Simple)

Complete this before coding Phase 1. If all boxes are checked, build can start.

- [x] **Location scope locked:** pickup location is required for pickup orders.
- [x] **Fulfillment matrix locked:** each product explicitly allows pickup, shipping, or both.
- [x] **Cart policy locked:** mixed incompatible fulfillment carts are blocked with clear UX copy.
- [x] **Order model locked:** one order = one fulfillment type + one location (when pickup).
- [x] **Pricing rule locked:** global product price + optional location override (no extra complexity yet).
- [x] **Tax/fee rule locked:** confirm tax/fees by fulfillment and location behavior.
- [x] **Backfill plan locked:** default values for existing products/orders are defined before migration.
- [x] **Admin minimum locked:** product fulfillment toggles + location availability are editable in admin.
- [x] **Acceptance tests locked:** basic matrix agreed (pickup-only, shipping-only, both, mixed-cart blocked).

Guardrail: if a new requirement is not in this list and is not a production blocker, move it to Future Improvements instead of expanding Phase 1 scope.

---

## Quick Decision Workshop (10-15 Minutes)

Use this to lock decisions fast. One answer per line, no debate loops.  
Target output: all items marked `Locked` so Phase 1 can start immediately.

| # | Decision | Options | Current Recommendation | Final Answer | Status |
|---|----------|---------|------------------------|--------------|--------|
| 1 | Pickup location required? | A) Required for pickup, B) Optional | A | A | Locked |
| 2 | Product fulfillment flags | A) Pickup only, B) Shipping only, C) Both | Per product (A/B/C) | Per product (A/B/C) | Locked |
| 3 | Mixed incompatible carts | A) Block, B) Auto-split now | A | A | Locked |
| 4 | Order ownership model | A) One order = one fulfillment + one location, B) Multi-location order | A | A | Locked |
| 5 | Price model for Phase 1 | A) Global price only, B) Global + location override, C) Full variant/location matrix | B | B | Locked |
| 6 | Tax/fee behavior | A) Same for all, B) By fulfillment and location | B | B | Locked |
| 7 | Migration/backfill defaults | A) Conservative defaults + explicit admin review, B) Aggressive auto-mapping | A | A | Locked |
| 8 | Admin minimum controls | A) Fulfillment toggles only, B) Toggles + location availability | B | B | Locked |
| 9 | Acceptance test minimum | A) Smoke tests only, B) Fulfillment/location matrix + mixed-cart block | B | B | Locked |

### Workshop Rules

- Timebox each decision to 60-90 seconds.
- If unclear, choose the safer option and log follow-up.
- Do not add new scope during this workshop.

### Completion Criteria (Go/No-Go)

- [x] All 9 rows have a Final Answer.
- [x] All 9 rows marked `Locked`.
- [x] Any non-blocking ideas moved to Future Improvements.
- [ ] Phase 1 work tickets created from locked answers.

---

## Current Architecture Mismatch Summary

- No first-class `Location` entity for Main vs Donki at order/fulfillment level.
- Checkout logic does not fully enforce business-line fulfillment constraints.
- Catalog boundaries are mostly inferred by collections instead of explicit domain rules.
- Order model needs clearer fulfillment semantics for local vs shippable items.

---

## Target Architecture (Phased)

## Phase 0: Foundation polish and UX stabilization (DONE)

- Storefront visual polish aligned to B&G style direction
- Hero/banner text readability fixes
- Embedded location maps
- Catering modal accessibility and scroll behavior fixes
- Image rendering/fallback reliability improvements
- Seeds reverted to only assign real mapped product images

## Phase 1: Domain correctness (NEXT BUILD PHASE)

- Add first-class locations and pickup location selection
- Add product-level fulfillment flags
- Add fulfillment validation at checkout/order creation
- Block mixed-incompatible carts
- Add location-aware product availability controls

## Phase 2: Operational segmentation

- Better admin/reporting by location and line of business
- Stronger catalog IA for Three Squares vs Latte Stone vs Catering

### Phase 2 Goal

Make day-to-day operations easier by clearly segmenting admin workflows, reporting, and storefront information architecture by location and business line while keeping a single storefront.

### Phase 2 Scope (Locked)

- Keep one storefront, but add clearer business-context entry points.
- Segment admin surfaces by `location`, `fulfillment_type`, and `business_line`.
- Add reporting views/exports that answer "what sold, where, and under which line of business."
- Do not introduce auto-splitting mixed carts in Phase 2 (still deferred to Phase 3).

### Phase 2 Workstreams

#### 1) Admin and Reporting Segmentation

- [ ] Orders UI/API filters: location, business line, fulfillment type.
- [ ] Product list filters: location and business line.
- [ ] Dashboard cards:
  - [ ] sales by location
  - [ ] sales by business line
  - [ ] pickup vs shipping mix
- [ ] Daily/period CSV export with location + business line breakdown.

#### 2) Catalog IA (Single Storefront, Clearer Paths)

- [ ] Add clear customer entry paths for:
  - [ ] Three Squares
  - [ ] Latte Stone Cookies
  - [ ] Catering
- [ ] Tighten product browse logic so users mostly see relevant context first.
- [ ] Preserve direct links/search behavior without breaking current URLs.

#### 3) Operations Workflow Views

- [ ] Pickup queue view (grouped by location and readiness/status).
- [ ] Shipping queue view (ready-to-ship and shipped tracking workflow).
- [ ] Basic operational status quick-actions where safe.

### Phase 2 Suggested Ticket Sequence

- [ ] P2-01 Orders filtering and API query support (location/business line/fulfillment).  
  _Progress: location + fulfillment + business-line filters implemented in admin/API. Pending: add focused request coverage for business-line filtering._
- [ ] P2-02 Dashboard metrics segmented by location and business line.
- [ ] P2-03 Storefront IA entry points and routing/query-state guardrails.  
  _Progress: nav + mobile "Shop by Business" entry links and URL-backed `business_line` filter added on products page/API._
- [ ] P2-04 Pickup queue admin view.  
  _Progress: added dedicated `/admin/orders/pickup-queue` page/route with pickup-first defaults, queue status chips, and API-backed queue summary counters._
- [ ] P2-05 Shipping queue admin view.  
  _Progress: added dedicated `/admin/orders/shipping-queue` page/route with shipping-first defaults, queue status chips, and API-backed queue summary counters._
- [ ] P2-06 Export/report endpoint and CSV admin action.  
  _Progress: added `/api/v1/admin/orders/export` CSV endpoint with all key filters and wired Admin Orders "Export CSV" button._
- [ ] P2-07 Test matrix + QA pass + docs update.
  _Progress: added request coverage for storefront `business_line` product filtering (`latte_stone`, `catering`, `three_squares`)._

### Phase 2 QA Matrix (Current Slice)

- [x] Products API `business_line` filter returns expected segments.
- [x] Admin Orders filters work for location, fulfillment type, and business line.
- [x] Admin CSV export respects active filters.
- [x] Pickup/Shipping queue pages load with queue-first defaults.
- [x] Queue summary counters (status/paid/total) load from API.
- [ ] Manual browser QA pass on staging (desktop + mobile nav entry paths).

### Phase 2 Acceptance Criteria (Definition of Done)

- [ ] Staff can filter and process orders quickly by location and business line.
- [ ] Storefront users can find the right business context without confusion.
- [ ] Reports clearly show segmented performance by location/business line.
- [ ] No regressions in Phase 1 fulfillment/location enforcement.

### Phase 2 Test Plan (Minimum)

- [ ] Request specs for segmented order/product filtering.
- [ ] Request specs for reporting/export correctness.
- [ ] UI test coverage for admin queue filters and status transitions.
- [ ] Storefront flow tests for each business-context entry path.

## Phase 3: Future growth

### Phase 3 Goal

Introduce clearer split storefront experiences by business line while preserving one backend domain model and backward-compatible URLs.

### Phase 3 Scope (Current Build Slice)

- [x] Add dedicated business-line storefront entry routes:
  - [x] `/shop/three-squares`
  - [x] `/shop/latte-stone-cookies`
  - [x] `/shop/catering`
- [x] Keep backward compatibility by mapping these routes into existing `/products` filtering.
- [x] Update desktop/mobile nav links to use dedicated storefront routes.
- [x] Add business-line specific hero/header treatment in products browsing context.
- [x] Add storefront guardrail UX for cross-business context switching when cart has active items.
- [x] Add direct homepage entry cards for each storefront route.
- [ ] Add end-to-end test coverage for each dedicated storefront route.

### Phase 3 Next Tickets

- [x] P3-01 Business-line visual context (copy + hero variants on products page).
- [x] P3-02 Cart guardrail for business-context switching (warn/confirm when cart has active line context).
- [x] P3-03 Homepage/storefront IA split entry cards and CTAs.
- [ ] P3-04 E2E coverage for storefront routes and cart guardrails.
- [ ] P3-05 Evaluate optional auto-split mixed-cart architecture proposal.
- [ ] P3-06 Admin order workflow split for pickup vs shipping (queue defaults, labels, and primary actions by fulfillment type).

### Phase 3 Deferred

- [ ] Mixed-cart auto-splitting (multi-order flow)
- [ ] Enhanced fulfillment windows and constraints

---

## Phase 1 Implementation Checklist

## 1) Data Model / Migrations

- [x] Create `locations` table (`name`, `slug`, `address`, `phone`, `hours_json`, `active`)
- [x] Add `location_id` to `orders`
- [x] Add `fulfillment_type` to `orders` (`pickup`, `shipping`)
- [x] Add `allow_pickup` and `allow_shipping` to `products`
- [x] Create `product_locations` join (`product_id`, `location_id`, `available`, optional `price_override_cents`)
- [x] Seed `three-squares-main` and `three-squares-donki`

## 2) Backend/API

- [x] Add public `GET /locations`
- [x] Update checkout/order API contract to accept `fulfillment_type` and `location_id`
- [ ] Add server validation:
  - [x] disallow shipping for products with `allow_shipping = false`
  - [x] disallow pickup for products with `allow_pickup = false`
  - [x] require `location_id` for pickup orders
  - [x] block mixed incompatible carts
  - [x] enforce strict no-mix carts for shippable + pickup-only combinations

## 3) Frontend

- [x] Add fulfillment selector behavior tied to valid cart options
- [x] Add required pickup location selector when pickup is chosen
- [x] Add clear error message for mixed cart blocking
- [x] Add location filter/toggle where appropriate (menu/catalog)

## 4) Admin

- [x] Product form: fulfillment toggles (`allow_pickup`, `allow_shipping`)
- [x] Product form: location availability controls
- [x] Locations management (basic edit/configuration UI)

## 5) QA / Tests

- [x] API tests for fulfillment validation matrix
- [x] Checkout integration tests for pickup/shipping paths
- [x] Mixed cart blocked test coverage
- [x] Location-required validation tests

---

## Progress Board

## Completed

- [x] Storefront visual polish (B&G-inspired)
- [x] Logo cleanup and alignment improvements
- [x] Hero/banner readability improvements
- [x] Locations map upgraded to embedded maps
- [x] Catering modal redesign and accessibility improvements
- [x] Catering modal scroll behavior fixed (background lock + internal scroll routing)
- [x] Image loading/fallback hardened
- [x] Removed synthetic seed image backfill behavior (real images only)
- [x] Enforced strict mixed-fulfillment cart blocking (shippable + pickup-only cart combinations)

## In Progress

- [ ] PR review and merge

## Next Up (Ordered)

1. [x] Final QA + PR prep

---

## Risks and Mitigations

- **Risk:** Mixed carts create user confusion.  
  **Mitigation:** Block clearly now; design auto-split for Phase 3.

- **Risk:** Location complexity leaks into many surfaces.  
  **Mitigation:** Centralize location + fulfillment validation server-side.

- **Risk:** Legacy fork assumptions reappear.  
  **Mitigation:** Track refactor work against this document and update test matrix.

---

## Future Improvements Backlog (Intentionally Deferred)

- [ ] Auto-split mixed carts into multiple orders
- [ ] Split route/storefront experiences by business line
- [ ] Delivery mode and expanded fulfillment types
- [ ] Time-window / menu-window availability by location
- [ ] Dedicated Latte Stone storefront entry experience
- [ ] **Hafaloha legacy cleanup pass (phase-out plan):**
  - [ ] remove/rename remaining Hafaloha-specific copy, comments, and legacy assumptions
  - [ ] audit and de-scope Acai-specific flows/settings if not part of B&G Pacific storefront scope
  - [ ] consolidate or archive non-core legacy routes/components after stakeholder sign-off
- [ ] **Default image reliability hardening:**
  - [ ] investigate why admin/default placeholder previews intermittently fail to load
  - [ ] standardize fallback image source resolution across API + web + admin surfaces
  - [ ] add smoke test coverage for missing-image fallback rendering (storefront + admin)

---

## Working Notes

- Keep this file updated whenever scope decisions change.
- Update checklist status in PRs as work is completed.
- Treat this as the implementation contract for the refactor effort.

