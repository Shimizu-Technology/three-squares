# POS control and tile contract

Sale mode uses 128px text-first POSProductTile controls. Each reserves a two-line
title, price and 24px state slot; adding an in-cart or sold-out label cannot move
its neighbors. Stock capacity and variant selection still use the existing cart
reconciliation and server reservation/finalization checks.

Location, search, category and named Refresh share a compact, wrapping toolbar.
The native category selector keeps the current choice visible and keyboard
accessible. Availability administration is a separate **Manage availability**
mode. Its cards are 176px with one 44px action; returning to sale retains filters.

[Location offerings](LOCATION-OFFERINGS.md) separates menu membership from daily
availability. Offered sold-out products keep their disabled 128px sale tiles and
remain restorable in Manage availability. Non-carried items are absent from both
modes. Physical stock exhaustion also uses the reserved state slot.

Cash is secondary and Card primary, both lg 52px with 16/24px type. The Card label
stays short; simulation status appears outside it. The cash dialog uses the same
lg completion action. Completed sale, cash change and receipt access remain until
the next item is added or the operator dismisses the completion. Cash receipts
show recorded total/tender/change; card receipts retain their original factual
receipt component and allowlisted data. No UI result authorizes a payment.

The shared `components/ui/QuantityStepper.tsx` exports a named `QuantityStepper`:

```tsx
<QuantityStepper value={quantity} onChange={setQuantity} itemLabel={product.name}
  min={1} max={capacity} disabled={locked} pending={saving} size="md" />
```

`onChange` receives an absolute quantity. Minimum defaults to 1; POS opts into 0
for removing a line. Maximum is optional. Pending/disabled blocks both controls
without replacing the number or label. Sizes md/lg are 44/52px square, never sm;
the numeric display has a fixed width and tabular figures. The caller owns stock
rules, persistence and removal. No POS logic lives in the shared component.

The registered-reader picker uses shared Dialog with a visible close control,
keyboard containment, Escape/backdrop dismissal, pending restrictions and return
focus. Real provider discovery is unchanged.

## Verification

Run `npm run test:unit`, `npm run test:ci-tools`, `npm run lint:ci`, and
`npm run build` from `web`, plus the API/security gate. Every migration ratchets
its retired raw controls using `npm run ui:ratchet`.

With an isolated local demo running, use:

```sh
UI_EVIDENCE_DIR=/absolute/private/evidence \
DEV_LIFECYCLE_SESSION=<your-session-id> \
node scripts/run-with-project-node.mjs node scripts/measure-pos-controls.mjs
```

The development-only `fixtures/pos-controls.html` imports the actual primitives.
The runner checks four tile states, title/price/state offsets, shared stepper
bounds and pending geometry, all four required dimensions with fine and touch
contexts, and reader-dialog keyboard/dismissal/return behavior in Chromium and
WebKit. Live Main cash and simulated reader journeys require separate browser
execution and saved-outcome checks. The fixture does not certify real readers,
printer output, physical iPad Safari, or production readiness.

P4 replaces the temporary `available=false` hiding rule with explicit [location offerings](LOCATION-OFFERINGS.md). Offered sold-out tiles retain their sale-grid position; non-carried items are excluded in both modes. POS remembers an authorized location per user and otherwise chooses Main/the active location with the richest offered menu. At 1024px the category joins the location/search toolbar row; the completed-sale order reference occupies its own line.
