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
