# Shared UI foundations

Brand colors are Tailwind v4 theme tokens in `web/src/index.css`. Use `tsPrimary`, `tsNavy`, `tsGold`, `tsAmber`, `tsText` and `tsSurface` through normal utilities, including opacity, gradient, border, ring and focus variants. Legacy CSS variables alias these tokens; avoid adding hand-written copies of individual utility classes.

Body text uses DM Sans and headings use Satoshi, matching the font stylesheets already linked by `web/index.html`. Base typography stays in `@layer base`, so component utility colors and type sizes take precedence. In particular, a white dialog heading remains white on a dark surface.

Muted text uses `warm-400` (#626C58) or darker on white and `warm-50`. Contrast for `warm-400` is 5.52:1 on white and 5.22:1 on `warm-50`; `warm-500` is darker. Pale shades such as `warm-300` are for borders and decoration. Check contrast again on other backgrounds. Gold is an accent, not a default text color on light surfaces.

The cart header uses an explicit `bg-tsPrimary`/white pair (12.41:1). Its close control and Remove action have 44px hit areas. Shared dialog behavior and keyboard focus management are documented with the dialog primitive separately.

## Migration status

This is the contract for new work. Button, IconButton, QuantityStepper, StatusBadge and Notice are implemented in `web/src/components/ui`; the two recovery controls use Button. POS tiles/cart/toolbar and reader controls use the shared recipes; see [POS uniformity](POS-UNIFORMITY.md). Operational admin headers, filters, fields, row actions and order dialogs use the shared recipes. Customer controls and customer form adoption remain in P6. Location offering semantics are implemented in P4; see [Location offerings](LOCATION-OFFERINGS.md). Visible admin groups were adopted in P3 and the remaining admin surfaces and workflow labels in P5. Device acceptance closes in P7. A documented recipe below is not a claim that its consumers already conform.

## Button and IconButton

`web/src/components/ui/Button.tsx` owns native button or anchor rendering, semantics, size, variant, loading and disabled geometry. Required variants are **primary, secondary, ghost, destructive, link**. Use no page-local background, font, radius, height or padding overrides.

| Size | Exact border-box H | Padding T/R/B/L | Type | Radius | Icon / gap | Allowed context |
|---|---:|---|---|---:|---|---|
| sm | 36px | 0 / 12 / 0 / 12px | DM Sans 14px /20px, 600 | 8px | 16px / 8px | Fine-pointer dense desktop tables/toolbars only |
| md | 44px | 0 / 16 / 0 / 16px | 14px /20px, 600 | 8px | 16px /8px | Default admin/customer action, dialogs and toolbars |
| lg | 52px | 0 /24 /0 /24px | 16px /24px, 600 | 8px | 20px /8px | Payment completion and major customer CTA |

Use inline-flex/center alignment and a 1px border in all variants (transparent when visually absent), so fills/borders do not change geometry. All sizes include the border. **On coarse-pointer/touch layouts sm becomes 44px high with a minimum 44px width; POS never uses sub-44px controls even on desktop.** IconButton is 36/44/52px square by size; touch sm becomes44. A 44px interactive row can have a smaller visible icon; the hit area must be real and must not overlap neighboring targets. There is no need to make noninteractive badges44px.

Primary uses `tsPrimary #1F3553`, white text, `tsNavy #15263D` hover/pressed. Secondary is white/transparent with a neutral border and dark text. Ghost has no visible resting border/fill. Destructive uses a consistent dark red for actual refund/delete/cancel confirmation; it does not color ordinary forward workflow commands. Link is text treatment with underline/focus and a 44px target when used as a standalone touch command; ordinary prose links retain prose semantics.

Allow **at most one filled primary per task region**. For POS, Card may be primary and Cash secondary; a chosen cash dialog then has one Complete Cash Payment primary. Simulation remains a distinct marked development region. Do not use action colors to encode future order state. Keep labels single-line at these sizes; shorten presentation text or change the responsive arrangement rather than clipping essential labels or allowing a “same size” button to expand. Place “Simulated” beside the payment choice, not in a wrapping Card label. A spinner occupies a reserved icon slot and retains the accessible label and width. Use a 2px focus ring with 2px offset, ≥4.5:1 normal-text contrast, and one disabled opacity rule. Operational feedback is a short color/opacity change; no position shift or `transition-all` recipe.

## Card and row primitives

- **POSProductTile:** sale mode is a **128px-high text-first tile**, 12px padding, 12px radius, 1px border. Reserve a two-line 14/20 title (40px), 14/20 price row (20px) and 24px state slot, with 4px internal gaps. Empty state space stays reserved. In-cart and sold-out states cannot increase height. Entire tile adds/selects the product; retain variant selection and stock-capacity checks. No photo is needed for the operational sale tile.
- **Availability mode:** a separate explicit Manage availability screen/mode, using a uniform **176px** offered-item card when a 44px availability control is included. Tile/state/action slots are reserved within the card; no button floats beneath it. Offered sold-out products retain a disabled sale tile and a management Restore action. Not-offered products are absent from both POS modes; daily restore never changes membership.
- **CustomerProductCard:** retain **1:1 media**, stable fallback, 12px shell radius, 8px media inset and a flex-column body. Title occupies exactly two lines (14/20 with 40px reserved on phone, 16/24 with 48px reserved desktop). Use a fixed 24px price/eligibility row at the bottom. Show a concise non-purchasable label there; put full reasons on the product page. If actions are present, pin a 44px action region below it. Whole-card links must not contain nested buttons. Card rows have equal height; title, price and action baselines align within1px.
- **MenuManagementCard:** title/status, optional description with a defined two-line slot, schedule/meta, then bottom action region. Use one Manage primary; schedule/preview/delete become secondary/overflow according to frequency. Preserve every capability.
- **CartLine / QuantityStepper:** explicit title/options/amount/quantity slots; 44px +/- targets with aligned numerical text. Long names may use two lines and open the full item context, but cannot push the same-row amount or quantity controls offscreen. Do not make an entire cart row and its nested controls ambiguous competing buttons.
- **Location / collection cards:** use card-specific media recipes (location/collection4:3) and a shared shell/content/action slot contract. They need not look like meal tiles. Missing media preserves the ratio and product/category identity; it is not a reason to vary card anatomy.

## PageHeader, Toolbar and DialogActions

Adapt the existing `AdminPageHeader` and `AdminFilterBar`; do not introduce another unused parallel set. One page gutter:16px narrow,24px desktop. PageHeader uses24/32 title (20/28 on narrow screens),14/20 subtitle,4px title/subtitle gap and16px space to its toolbar; primary action on the right where room permits. Put refresh in the toolbar/overflow with a 44px named icon control, not a separate 53px row. Toolbar fields/actions share44px height,8px horizontal and12px wrap gaps. Preserve filter state and URL return context.

Dialog uses the existing native Dialog top layer. Provide common Header and Actions slots, 16px padding on narrow screens and24px desktop, scrollable `min-h-0` content, and reachable close/cancel actions. Standard md actions, lg only for payment completion. On phone, use intentional stacked actions instead of label-driven expansion. Preserve focus return and pending-operation restrictions. Avoid manual overlays and multiple independently reopened dialogs.

## StatusBadge and Notice

StatusBadge is **24px high**,12/16px type at600 weight,0/8px padding,full radius and optional12px icon with4px gap. Labels stay concise and do not stretch to fill cards. A role-aware label helper maps stored workflow states to customer/staff language consistently.

| Meaning | Text / surface / border | Examples |
|---|---|---|
| Attention / awaiting work | `#92400E / #FFFBEB / #FDE68A` | New paid, needs quote, sold out today |
| In progress / information | `#1E40AF / #EFF6FF / #BFDBFE` | Acknowledged, processing, quote recorded |
| Ready / successful | `#166534 / #F0FDF4 / #BBF7D0` | Ready, paid, available, accepted |
| Completed / neutral | `#374151 / #F3F4F6 / #D1D5DB` | Picked up, delivered, published, role |
| Failed / destructive outcome | `#991B1B / #FEF2F2 / #FECACA` | Payment failed, cancelled, declined |
| Not offered / inactive | `#475569 / #F1F5F9 / #CBD5E1` | Not offered here, draft, retired |

Recheck text/control contrast in actual rendering. “Simulated” uses an attention badge **plus a persistent explanatory Notice** (“no money moves”) when needed. Notices use14/20 body type,12/16px padding and can wrap; they are not oversized badges. Do not truncate critical financial uncertainty or ordering-pause notices to fit a chip.

## Spacing, grids and responsive rules

Use4,8,12,16,24,32,48,64px tokens. Operational cards use16px padding, dense tiles12px, display/admin editor cards24px; document exceptions in the primitive. Default operational grid gap12/16px; page sections24px, major public sections48/64px. Remove accidental12.8/14px padding recipes and local radius proliferation. Align labels above fields at4/8px gaps, and fields at44px height with16px input type on touch.

Use content-aware grids, e.g. `repeat(auto-fill, minmax(min(100%, 160px), 1fr))` for POS and an appropriate larger minimum for public cards. Fixed shortcut groups must use a deliberate count/layout: remove redundant shortcuts, fit the full group, or switch to a compact list; do not leave one orphan action tile. An incomplete final row of a **data-driven catalog** is normal and must not be “fixed” with fake items or unreadably narrow cards. Keep equal card anatomy and row alignment, with no empty layout columns caused by a hardcoded action count. Avoid a second scroll axis where a compact selector/overflow solves the task.

## Enforcement

1. Add Button/IconButton/Badge/Toolbar recipes and a short approved-specialized-control list. A TS/ESLint AST rule flags new raw `<button className=...>` outside `components/ui`, and button-like anchor recipes bypassing the primitive. Keep native buttons inside named Tabs, Disclosure, Stepper, ProductTile and other approved primitive implementations. Do not replace accessible native semantics with clickable divs to evade the check.
2. Baseline existing raw sites with **file + AST location/hash + reason**, not a single global count that can hide one new violation behind an unrelated deletion. Fail new entries and unauthorized geometry/color overrides on shared controls. Ratchet the baseline down per PR; tag old unreferenced pages for deletion separately. A temporary grep gate is acceptable before the AST rule lands, but is less precise about JSX expressions and specialized controls.

   The baseline hashes each raw element’s whole JSX subtree, including its label and nested content. The rule is **touch it, migrate it**: editing an existing legacy raw control counts as new debt and requires migration to the appropriate primitive. For parallel PRs, merge current main first; if `ui-controls-baseline.json` conflicts, keep main’s baseline and rerun `npm run ui:ratchet` against the merged source. Do not regenerate the baseline to accept new entries.

3. Add Playwright geometry assertions on representative populated states at **768×1024,1024×768,1440×900,390×844**, with touch contexts as well as desktop. Same-role action heights/types/radii must match; row tile heights and title/price/action offsets must agree within1px. Explicitly test long titles, in-cart badges, sold-out badges, missing photos, inquiry-only items, empty states, loading, errors and pending payment.
4. Assert touch targets ≥44×44 for applicable independent controls, variant contrast, preserved accessible names, keyboard order and return focus. Screenshots are comparison evidence; geometry and completed saved journeys are the acceptance checks. Add an allowed color/size token snapshot for shared recipes, not hundreds of tests mirroring every Tailwind string.
5. Run lint/build and relevant existing tests. For dialog changes, keep the `docs/DIALOG.md` Chromium/WebKit keyboard/backdrop/nesting cases. Do real iPad Safari acceptance before launch; a resized Chromium screenshot is not a substitute.


## Adoption and checks

```tsx
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';

<Button variant="primary" size="md" loading={saving} type="submit">Save changes</Button>
<Button to="/menu" variant="secondary">View menu</Button>
<Button href="/menu.csv" variant="secondary" download>Download menu</Button>
<IconButton aria-label="Refresh menu" onClick={refresh}><RefreshCw /></IconButton>
```

Button defaults to a native `type="button"`. Supply `type="submit"` for form submission; use `href` for an anchor or `to` for a router Link. Icons use the `icon` prop. IconButton requires `aria-label`, defaults to ghost, and accepts the same variants/sizes/link props. Loading overlays its spinner in a reserved overlay slot while retaining the original label/icon in layout and the accessible name; dimensions never change. Disabled/loading native buttons cannot activate. Disabled/loading links have no href, remain named links, and leave the tab order. The label must stay unchanged while loading; put detailed progress beside the control.

`className` is for static layout utilities only (width, margins, alignment, layout gaps). Do not override color, padding, radius, font, height, border, movement or opacity, including via inline styles. Extend a shared recipe with tests when a new requirement is needed. New recipes live in the components layer; legacy unlayered `.btn-*` and broad admin/public focus/active styles exclude `data-ui-control`. This preserves unmigrated behavior without overriding shared recipes. Never combine legacy classes with shared controls.

Use StatusBadge `tone="attention|info|success|neutral|danger|inactive"`; it carries no automatic workflow label mapping. Notice takes the same tones, permits wrapping content and accepts an explicit `role="status"` or `role="alert"` only when the announcement is appropriate. Neither component assumes every static status is a live region. Workflow label migration remains P5.

`npm run lint:ci` includes `scripts/check-ui-controls.mjs`. The TypeScript AST checker records legacy native buttons and action-like anchor/router recipes outside `components/ui`, and rejects new shared recipe overrides. `ui-controls-baseline.json` records file, enclosing component, normalized JSX SHA-256 prefix, duplicate occurrence, source line/column and reason. Matching uses file/component/hash/occurrence, so harmless line movement does not force a baseline refresh; deletion cannot offset a different new control. Dynamic anchor recipes are treated conservatively as action-like. Existing custom navigation/card recipes remain explicitly baselined until their migration.

Run `npm run ui:check` after changes and `npm run ui:ratchet` to remove retired entries and refresh locations. Ratcheting **refuses added debt**; there is no update command that blesses new sites. The initial baseline cannot be reinitialized over an existing file. Review any manual baseline change as an exception. Approved specialized implementations are exact file/component pairs in `specializedControls` in the checker: POSProductTile. QuantityStepper lives in `components/ui` and needs no specialized exemption. Add Tabs, Disclosure, navigation and other specialized primitives only with semantics, geometry tests and a specific reason; a whole page is never exempt.

Run `npm run test:ci-tools` for enforcement tests and `npm run test:unit` for component props/recipe tests. The standalone `fixtures/ui-controls.html` development page uses the actual primitives, recovery components and retained legacy specimens; it is not a production app route. With the isolated demo running, execute the geometry fixture as documented in `web/fixtures/README.md`. Extend it in every migration slice; screenshots do not replace assertions or saved journey checks.

## Admin adoption (P3)

Menus, Products headers, order commands and obvious Settings action groups now use md controls. Menu cards reserve a two-line description and pin Manage, Schedule, named Preview and Delete controls to the bottom. Preview and Delete use compact IconButtons with item-specific accessible names; deletion still requires confirmation. Counts live with menu metadata. Settings switches and remaining fields migrate in P5.

`ChoiceGroup` is a wrapping single-choice filter/section primitive. It uses native type=button controls, `aria-pressed` selection and a named group. Each choice remains in normal keyboard order; it does not claim ARIA tab semantics or require arrow-key navigation. Its 44px targets and selected navy state are stable on fine and coarse pointers. Use it for queue stages and editor/settings sections, while ordinary actions remain Button.

`ActionTile` is a router navigation link for dashboard shortcuts, with a shared 112px minimum height, 40px icon slot, 20px icon and 14/20 label. The four dashboard shortcuts use two columns on narrow layouts and four where room permits. Settings remains in workspace navigation. Geometry and interaction checks extend the development fixture; real admin saved journeys require separate isolated-demo QA.

## Shared form fields (P5a)

Use named `Field`, `Input`, `Select` and `Textarea` exports from their respective files in `components/ui`. Field wraps exactly one control and associates a visible label with its existing ID or a generated unique ID. Help and error slots add their IDs to existing `aria-describedby` references; errors set `aria-invalid`. The caller retains values, handlers, refs, validation and request state. Static errors are not automatically live regions. Native required semantics remain on the control, with a visible required marker in the label.

```tsx
<Field label="Device name" help="Use a name staff recognize." error={nameError}>
  <Input value={name} onChange={event => setName(event.target.value)} required />
</Field>
<Field label="Location"><Select value={location} onChange={changeLocation}>{options}</Select></Field>
<Field label="Notes"><Textarea value={notes} onChange={changeNotes} /></Field>
```

Input and single-choice Select are exactly44px border-box high,1px neutral border,8px radius,12px horizontal padding and14/20 type; coarse pointers use16/24 type. Field labels sit above controls with4px gaps. Textarea is multiline: default3 rows, minimum96px,12px padding and native vertical resize. It does not force multiline content into a44px box. Help/error type is14/20. Controls have the shared2px focus outline/2px offset and one disabled opacity rule. Keep field `className` layout-only; the existing AST gate rejects geometry/color overrides, inline styles and spread props at adoption sites. Checkboxes, switches, file pickers and multi-select lists keep separate semantic recipes.

Current Device name/location plus Refresh/Save adopt these recipes first. Other forms migrate in the remaining admin/customer slices. The dev-only `fixtures/ui-fields.html` provides label/help/error, native submission, disabled and geometry acceptance; it is excluded from the normal production entry.

## Admin editors (P5b)

Catalog and menu editors, product list actions/filters/pagination, CSV entry points and Settings/Homepage fields use the shared controls. Existing main-form drafts, independent variant/image/offering saves and immediate-save versus explicit-save settings behavior remain with their callers.

- `CheckField` keeps a native checkbox/radio inside a visible label with a 44px minimum hit region and a 20px indicator. `Switch` is a named native button with switch semantics, a 72×44px target and a navy checked state. It does not own saving.
- `FileButton` keeps the native keyboard-focusable file input and picker in a 44px label action. Callers own selection, upload, required status and recovery; visible selected-file feedback belongs alongside the action.
- `Disclosure` retains native details/summary behavior with a 44px minimum summary target. Controlled open state, DOM refs and validation recovery remain available.
- `ActionMenu` is a native disclosure of ordinary command buttons. It closes on a command, Escape or an outside pointer action; commands return focus to the summary before opening a subsequent dialog. It opens upward when the commands would extend below the viewport, and uses normal tab order rather than claiming ARIA menu semantics. Desktop Safari may require Option-Tab for all-control navigation.
- `Pagination` and the existing `AdminPagination` export share md targets, current-page semantics and a bounded set of numbered actions, even for large page counts. The controls wrap on narrow screens.

The existing AdminPageHeader and AdminFilterBar are adopted for these routes; the remaining operational routes and shell gutter contract migrate in P5c. The dev-only `fixtures/ui-admin.html` extends geometry and native interaction acceptance.

## Operational admin adoption (P5c)

The admin shell owns page gutters: 16px below 640px and 24px above. Routes use `AdminPageHeader` and `AdminFilterBar`; page content must not add another page padding layer. POS keeps its dedicated workspace and compact toolbar, with the shared header and matching gutters.

`NavigationLink` is a wrapping native/router navigation or record link with a 44px minimum target. Use Button for commands. `DialogHeader` and `DialogActions` provide common spacing and named close controls. Put scrollable content between them with `min-h-0 overflow-y-auto` and `flex-auto`; this preserves intrinsic form height in WebKit. Actions remain outside the scrolling body. Pending restrictions and saved requests belong to each dialog's caller. Ship over order detail returns focus to the stable detail heading, including when successful shipment removes the Ship action.

`workflowStatus` maps stored facts to role-specific wording without changing stored states. Staff see Acknowledged for confirmed orders and legacy processing pickups, New paid for paid pending orders, and Waiting for payment for pending unpaid orders. Customer confirmed remains Confirmed. Missing payment facts do not imply a paid order. Catering retains Needs quote and Quote recorded; declined/cancelled use danger and completed uses neutral. `OrderStatusBadge` applies this map to admin order views. Payment environments use a concise attention badge with persistent explanatory text; larger contexts use Notice for “no money moves.”

Admin product availability checks `offered_location_ids` before presenting daily availability actions. A non-offered location displays Not offered here. An offered item marked unavailable retains Restore, which changes only the daily availability flag. The offering editor continues to own membership changes.

The unreferenced `pages/AdminPage.tsx` prototype is deleted. P5c retires every remaining admin/payment-control baseline entry; the remaining customer inventory belongs to P6. This migration does not certify physical iPad Safari, installed PWA or screen-reader acceptance; those remain release checks.
