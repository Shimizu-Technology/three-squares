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

## Admin editor controls

`ui-admin.html` uses the real Switch, CheckField, FileButton, Disclosure, ActionMenu and Pagination. With the isolated demo running, use:

```sh
node scripts/measure-ui-admin.mjs http://localhost:5173 /tmp/three-squares-ui-admin
```

The runner checks all four foundation viewports, fine/touch input and Chromium/WebKit. It verifies target dimensions, keyboard disclosure/command dismissal and focus return, native file selection, switch/checkbox state and pagination with 10,000 pages. WebKit uses Option-Tab for all-control keyboard navigation. Saved catalog, menu and settings journeys still require the isolated application and database.
