# Shared UI foundations

Brand colors are Tailwind v4 theme tokens in `web/src/index.css`. Use `tsPrimary`, `tsNavy`, `tsGold`, `tsAmber`, `tsText` and `tsSurface` through normal utilities, including opacity, gradient, border, ring and focus variants. Legacy CSS variables alias these tokens; avoid adding hand-written copies of individual utility classes.

Body text uses DM Sans and headings use Satoshi, matching the font stylesheets already linked by `web/index.html`. Base typography stays in `@layer base`, so component utility colors and type sizes take precedence. In particular, a white dialog heading remains white on a dark surface.

Muted text uses `warm-400` (#626C58) or darker on white and `warm-50`. Contrast for `warm-400` is 5.52:1 on white and 5.22:1 on `warm-50`; `warm-500` is darker. Pale shades such as `warm-300` are for borders and decoration. Check contrast again on other backgrounds. Gold is an accent, not a default text color on light surfaces.

The cart header uses an explicit `bg-tsPrimary`/white pair (12.41:1). Its close control and Remove action have 44px hit areas. Shared dialog behavior and keyboard focus management are documented with the dialog primitive separately.

## Adoption status

Shared recipes are adopted across admin, POS and customer surfaces. Location offering semantics are documented in [Location offerings](LOCATION-OFFERINGS.md); POS anatomy and payment restrictions are in [POS uniformity](POS-UNIFORMITY.md). The UI-control baseline is retired: the strict gate requires zero violations. Physical Safari acceptance remains operator-owned and **Not run** in [iPad acceptance](IPAD-ACCEPTANCE.md).

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

1. `npm run ui:check` and `npm run lint:ci` run the TypeScript AST gate. Native `button`, `input`, `select`, `textarea`, `details` and `summary` must live in reviewed primitives in `components/ui`. The allowlist names the exact file, component and native tags; a neighboring component in the same file is not exempt. Checkbox/radio inputs belong to CheckField, file inputs to FileButton. Input and Select retain platform field/picker behavior. There are no outside-ui native-control exceptions.
2. Action-like native/router links must use Button, NavigationLink or a reviewed card primitive. Prose/tel/mail links retain native link semantics. The checker rejects shared-control geometry/color overrides, inline styles, duplicate attributes and prop spreads; static layout classes are allowed. The baseline JSON, initialization and ratchet command are removed. Old flags fail; deleting one violation cannot authorize another. The separate inherited ESLint baseline remains unchanged. Do not replace native controls with clickable divs to evade enforcement.

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

Use `surface="dark"` on a dark brand surface: secondary stays transparent with a white outline/text, ghost/link use white text, and keyboard focus uses white. Size, padding, primary fill, disabled/loading behavior and semantics are unchanged. This is a shared recipe; do not add local inverse color classes.

Button defaults to a native `type="button"`. Supply `type="submit"` for form submission; use `href` for an anchor or `to` for a router Link. Icons use the `icon` prop. IconButton requires `aria-label`, defaults to ghost, and accepts the same variants/sizes/link props. Loading overlays its spinner in a reserved overlay slot while retaining the original label/icon in layout and the accessible name; dimensions never change. Disabled/loading native buttons cannot activate. Disabled/loading links have no href, remain named links, and leave the tab order. The label must stay unchanged while loading; put detailed progress beside the control.

`className` is for static layout utilities only (width, margins, alignment, layout gaps). Do not override color, padding, radius, font, height, border, movement or opacity, including via inline styles. Extend a shared recipe with tests when a new requirement is needed. New recipes live in the components layer; legacy unlayered `.btn-*` and broad admin/public focus/active styles exclude `data-ui-control`. This preserves unmigrated behavior without overriding shared recipes. Never combine legacy classes with shared controls.

Use StatusBadge `tone="attention|info|success|neutral|danger|inactive"`; it carries no automatic workflow label mapping. Notice takes the same tones, permits wrapping content and accepts an explicit `role="status"` or `role="alert"` only when the announcement is appropriate. Neither component assumes every static status is a live region. Use `workflowStatus`/`OrderStatusBadge` for role-aware order labels: stored `confirmed` appears as Acknowledged to staff and Confirmed to customers. Payment status remains separate; workflow labels never prove a payment succeeded.

`npm run ui:check` must report zero violations. To add a specialized control, implement it in `components/ui`, add only its exact native file/component/tag allowance if needed, and extend geometry and semantic checks. POSProductTile lives there; the old POS import is a compatibility re-export. HomeCategoryCard owns the existing branded image/overlay navigation recipe and four bento layouts (feature, half, lead, standard), preserving destination and missing-image fallbacks without nested controls. It is a display-card recipe, so its media, 16px radius and 24/32px text-region padding deliberately differ from operational tiles.

`npm run test:ci-tools` tests enforcement and `npm run test:unit` tests application logic. `npm run ui:geometry` starts an environment-isolated loopback fixture server, owns both browser engines, runs six headless suites and closes its own server/browser process groups on success, failure or interruption. CI installs the lockfile-selected Chromium/WebKit browsers, runs this command and retains fictional fixture artifacts. See [fixture instructions](../web/fixtures/README.md) and [CI](CI.md).

The geometry matrix covers 768×1024, 1024×768, 1440×900 and 390×844 with fine/touch contexts. Controls/POS dimensions use Chromium; admin, fields, operations and customer cards also use WebKit, with a supplemental WebKit reader-dialog case and 375px customer case. These fixtures check real components, not API persistence, operator behavior or live providers. They use browser sans-serif fallbacks without CDN font requests; production still loads DM Sans/Satoshi. CSS type sizes/line heights and slot geometry are asserted, but production font rendering needs real-screen acceptance. Before launch, complete saved journeys and the physical checklist; screenshots alone do not pass them.

## Admin adoption (P3)

Menus, Products headers, order commands and obvious Settings action groups now use md controls. Menu cards reserve a two-line description and pin Manage, Schedule, named Preview and Delete controls to the bottom. Preview and Delete use compact IconButtons with item-specific accessible names; deletion still requires confirmation. Counts live with menu metadata. Settings switches and fields use the shared primitives.

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

Input and single-choice Select are exactly44px border-box high,1px neutral border,8px radius,12px horizontal padding and14/20 type; coarse pointers use16/24 type. Field labels sit above controls with4px gaps. Input/Select accept a decorative `leading` icon or currency prefix; their shared affix slot reserves32px left padding and keeps the native control/ref/label association. Textarea is multiline: default3 rows, minimum96px,12px padding and native vertical resize. It does not force multiline content into a44px box. Help/error type is14/20. Controls have the shared2px focus outline/2px offset and one disabled opacity rule. Keep field `className` layout-only; the existing AST gate rejects geometry/color overrides, inline styles and spread props at adoption sites. Checkboxes, switches, file pickers and multi-select lists keep separate semantic recipes.

Current Device name/location plus Refresh/Save adopt these recipes first. Other forms migrate in the remaining admin/customer slices. The dev-only `fixtures/ui-fields.html` provides label/help/error, native submission, disabled and geometry acceptance; it is excluded from the normal production entry.


### Customer location membership

A product not offered at the selected location is distinct from an offered item sold out today. The detail page uses the server's `Not offered at this location` reason to show “Not available at {location}”, without a payable price, inquiry wording, quantity or Add to cart. Active carrying locations appear under “On the menu at”; membership does not promise today's stock. Each switch preserves the product URL and uses the existing location picker's cart check, confirmation and clear-failure handling. An offered sold-out item retains stock wording, and a genuine inquiry-only item retains its full pricing reason and inquiry destination.

### Customer navigation and location cards

`NavigationLink` renders a router or native anchor for public header/footer/menu destinations. It has a real 44px minimum target, native link semantics, visible keyboard focus and capability-gated hover. `NavigationDisclosure` uses a native non-submit button with an accessible name, expanded state and a stable controlled panel ID; it only changes visibility. Keep field/command buttons on Button/IconButton, and prose links inline.

`CustomerCardFrame` shares the 12px/8px-inset shell for location details, with 4:3 stable media and a bottom action region. It renders an article so separate menu/directions/contact actions remain valid links. It has no whole-card hover/press cue. Product/collection whole-card navigation still uses CustomerCard without nested controls.

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

`NavigationLink context="admin"` is a wrapping native/router navigation or record link with a 44px minimum target. The default public recipe and `surface="dark"` preserve customer navigation styling. Use Button for commands. `DialogHeader` and `DialogActions` provide common spacing and named close controls. Put scrollable content between them with `min-h-0 overflow-y-auto` and `flex-auto`; this preserves intrinsic form height in WebKit. Actions remain outside the scrolling body. Pending restrictions and saved requests belong to each dialog's caller. Ship over order detail returns focus to the stable detail heading, including when successful shipment removes the Ship action.

`workflowStatus` maps stored facts to role-specific wording without changing stored states. Staff see Acknowledged for confirmed orders and legacy processing pickups, New paid for paid pending orders, and Waiting for payment for pending unpaid orders. Customer confirmed remains Confirmed. Missing payment facts do not imply a paid order. Catering retains Needs quote and Quote recorded; declined/cancelled use danger and completed uses neutral. `OrderStatusBadge` applies this map to admin order views. Payment environments use a concise attention badge with persistent explanatory text; larger contexts use Notice for “no money moves.”

Admin product availability checks `offered_location_ids` before presenting daily availability actions. A non-offered location displays Not offered here. An offered item marked unavailable retains Restore, which changes only the daily availability flag. The offering editor continues to own membership changes.

The unreferenced `pages/AdminPage.tsx` prototype is deleted. P5c retired the admin/payment action debt; P6 migrated customer controls and P7 retired the final home-card entry and native field/disclosure blind spots. This migration does not certify physical iPad Safari, installed PWA or screen-reader acceptance; those remain release checks.
