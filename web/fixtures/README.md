# Shared-control geometry and recovery fixture

Start an isolated demo using `docs/DEMO.md` (own DB and ports), then open
`http://localhost:5391/fixtures/ui-controls.html`. This dev-only HTML entry imports
actual UI primitives and recovery components. The regular production build has
only the app entry; this fixture is not an application route.

From `web`:

```sh
UI_FIXTURE_URL=http://localhost:5391/fixtures/ui-controls.html \
UI_EVIDENCE_DIR=/absolute/private/evidence \
DEV_LIFECYCLE_SESSION=<your-session-id> \
node scripts/run-with-project-node.mjs node scripts/measure-ui-controls.mjs
```

The runner creates Chromium contexts at 768×1024, 1024×768, 1440×900 and 390×844,
each with fine pointer and touch. It asserts 36/44/52px border-box recipes, touch
promotion, square icon targets, type/line/radius/borders/icons/gaps, unchanged
loading width, visible keyboard focus, native/router links, blocked navigation,
form submission, and the actual Retry/Reload recovery controls. It saves geometry
JSON plus before/after recipe specimens and recovery viewport PNGs. It asserts
that screenshot capture retains the requested pointer media; full-page resizing
can reset coarse-pointer emulation in Chromium and is deliberately avoided. It closes all contexts
and Chromium in `finally`; when given a lifecycle session, it claims/releases its
root process and descendants. Stop the owned demo and close owned visible QA tabs
after the phase. No real authentication/provider is needed by this fixture.

Extend this runner and fixture for later slices. Add real screen-specific
assertions and saved-outcome journey QA where applicable; this component fixture
does not certify POS payments, stock, customer checkout, or physical Safari.

## Customer cards and pickup journey

`customer-cards.html` imports the actual customer card, pricing and image components.
Its fictional specimens cover long titles, inquiry eligibility, failed/missing photos,
sale/variable prices and complimentary sides. With your isolated demo running:

```sh
CUSTOMER_FIXTURE_URL=http://localhost:5691/fixtures/customer-cards.html \
UI_EVIDENCE_DIR=/absolute/private/evidence \
DEV_LIFECYCLE_SESSION=<your-session-id> \
node scripts/run-with-project-node.mjs node scripts/measure-customer-cards.mjs

CUSTOMER_BASE_URL=http://localhost:5691 CUSTOMER_API_URL=http://localhost:3601 \
CUSTOMER_DEMO_DB=tsq_uniform_c_demo \
UI_EVIDENCE_DIR=/absolute/private/evidence DEV_LIFECYCLE_SESSION=<your-session-id> \
node scripts/run-with-project-node.mjs node scripts/verify-customer-journey.mjs
```

The geometry runner checks all four viewports with fine/touch contexts in Chromium
and WebKit, including square product media, 4:3 collection media, reserved title and
price slots, row alignment within 1px, and whole-card links without nested controls.
The journey runner uses the restaurant demo catalog, selects Main through the UI,
searches for a meal, edits/removes/re-adds it, verifies drawer focus and persisted cart,
then submits an **approved simulated** checkout using fictional contact details and
verifies the saved paid order via its guest capability. It also opens inquiry-only
details, catering inquiry entry and collections. Run only against a dedicated demo
with email/SMS and real processor transports disabled; it creates retained orders.

The separate `verify-customer-availability.mjs` also requires
`CUSTOMER_DEMO_DB=tsq_uniform_c_demo` (or another owned Track C demo DB). It changes
only that DB's pause fixture, restores the original pause/message in `finally`, and
verifies pause rejection, retained cart/menu during lost config connectivity, manual
retry, and first-load connection recovery. Run it **sequentially** after ordering
journeys so its pause fixture cannot interfere with another case.

Both runners restrict URLs to localhost, claim their browser process tree when given
a lifecycle session, and close contexts/browsers in `finally`. They do not certify
physical iPad/phone Safari, live payments, email/SMS delivery or real keyboard/gesture
behavior. Stop the owned demo and clean its isolated fixtures after QA.

The customer pages also consume the shared `ui/QuantityStepper` from the POS slice.
`verify-customer-quantity.mjs` uses the same URL/evidence/lifecycle variables plus
`CUSTOMER_DEMO_DB=tsq_uniform_c_demo`. Run it sequentially after checkout journeys:
it temporarily sets only the owned demo meal to product stock two and variant stock three, checks the product
and cart maximums through UI and saved cart API output at all four sizes in both
browsers, removes the test line, and restores the inventory fixture in `finally`.
The ordinary journey runner also verifies both product-page targets, absolute cart
quantities, disabled pending controls, and unchanged stepper width during a delayed
cart save. Removal remains a separate command; the stepper never reduces below one.

For shared fields, open `fixtures/ui-fields.html` on the same isolated demo and run:

```sh
UI_FIXTURE_URL=http://localhost:5593/fixtures/ui-fields.html \
UI_EVIDENCE_DIR=/absolute/private/evidence \
DEV_LIFECYCLE_SESSION=<your-session-id> \
node scripts/run-with-project-node.mjs node scripts/measure-ui-fields.mjs
```

This runner checks all four sizes with fine/touch Chromium and WebKit: 44px
single-line fields, 16px touch type, 4px label gap, explicit labels, help/error
association, native form values, disabled controls and keyboard focus. Textarea
has a 96px minimum and native vertical resize. Select uses a shared chevron and
CSS appearance while retaining its native picker and keyboard behavior. Screenshot
capture is followed by pointer/height checks. Real saved admin/customer journeys
remain separate QA; these development fixtures do not provide authentication.

Customer journey checks require `CUSTOMER_DEMO_DB=tsq_uniform_c_*demo` and `DEV_LIFECYCLE_SESSION`, and verify the live launcher ledger and API listener before creating simulated orders. Customer runners include WebKit at 375×812. Compact prices retain the fixed 24px row: long values use ellipsis within the card, keeping full server text accessible and on the detail page. A product quantity shortcut uses shared Field/Input for direct bulk entry without changing QuantityStepper.

The isolated collection fixture checks the shared shell and 4:3 media only; it does not claim schedule, description, or action-row alignment coverage. Those rows remain the existing collection content.
