# Three Squares Launch Control Pack — April 2026

## Executive summary
Three Squares is not blocked by feature work.

It is blocked by execution:
- Stripe live readiness
- Clerk production readiness
- domain / DNS coordination
- final production verification
- clean decision-making about what must be true before Easter orders go live

This file is the repo-local control surface for the Apr 5 go/no-go decision. Use it with `docs/PRODUCTION-LAUNCH-CHECKLIST.md`, which remains the step-by-step infrastructure checklist.

## True blockers vs parallel work vs post-Easter work

### True blockers
These must be green before accepting real customer orders.

- Stripe live path is confirmed and usable
  - live keys available
  - webhook configured
  - checkout succeeds against live Stripe
- Clerk production is complete
  - production app exists
  - production keys are in place
  - staff/admin login works in production
- Domain strategy is intentional
  - either `bngpacific.com` is live and resolves correctly
  - or Leon explicitly chooses the temporary production URL for Easter
- Minimum production verification is complete
  - customer flow verified end-to-end
  - operator flow verified end-to-end
- B&G-facing expectations match reality
  - no one is being told it is live if payments, auth, or domain are still unresolved

### Parallel work
Important, but not a reason by itself to block launch if the true blockers are green.

- B&G invoice follow-up
- notifying CJ / BOG about the longer-term Worldpay path
- menu or settings cleanup that does not break checkout
- documentation cleanup
- packaging training notes or launch updates
- non-critical QA findings that do not affect ordering or operations

### Post-Easter work
Do not let this contaminate the launch-critical queue.

- BOG / Worldpay migration work
- broader admin polish
- non-blocking UX refinement
- broader cross-repo sync cleanup
- deeper regression coverage beyond the minimum production checks

## Blocker map by owner

### Leon
Leon owns the go/no-go controls.

- Confirm the Easter payment path
  - default answer: Stripe now, BOG / Worldpay later
- Finish Clerk production setup
- Finish Stripe live setup
- Decide the domain plan
  - main domain if ready
  - temporary launch URL if DNS is not ready in time
- Personally verify the customer flow in production
- Personally verify the operator flow in production
- Review and send any B&G-facing status update so expectations stay aligned

### Jerry support
Jerry can reduce confusion and help Leon move faster, but cannot replace Leon on the final decisions.

- Keep this launch-control pack current and binary
- Cross-reference the infrastructure checklist in `docs/PRODUCTION-LAUNCH-CHECKLIST.md`
- Keep scattered drafts and planning notes aligned:
  - `/Users/jerry/clawd/docs/projects/tsq-launch-control-apr-2026.md`
  - `/Users/jerry/clawd/memory/overnight-plan.md`
  - `/Users/jerry/clawd/obsidian-vault/system/open-loops.md`
- Prep clear contingency framing so Leon is not deciding from chaos
- Support environment and validation work where no outside approval is required

### External / shared
These matter when Leon needs external cooperation.

- Marie / B&G
  - payment coordination if anything still depends on business-side confirmation
  - invoice follow-up and launch-status alignment
- Liv / whoever controls Squarespace / DNS
  - DNS change access or coordination for `bngpacific.com`
- B&G leadership
  - alignment on whether Easter launch uses the main domain or a temporary production URL

## Recommended execution order for Apr 5 go/no-go decision-making

### 1. Lock the payment answer first
- Confirm Stripe is the Easter path unless there is a concrete blocker that makes it impossible
- Treat BOG / Worldpay as the next-phase path, not today's launch gate

### 2. Lock production auth
- Confirm Clerk production app exists
- Confirm production keys are installed in the right services
- Confirm staff/admin sign-in works in production

### 3. Lock the launch URL decision
- If `bngpacific.com` is ready, use it
- If DNS is still uncertain, make an explicit call on the temporary production URL
- Do not carry silent ambiguity into launch day

### 4. Run the minimum production verification
- customer flow first
- operator flow second
- if either fails, stop and treat it as a real blocker

### 5. Make the go / no-go call from facts only
Go only if:
- payments are live
- auth is live
- launch URL is intentional and usable
- customer flow passed
- operator flow passed

Do not launch if any of those are still unresolved.

## Contingencies

### DNS delay
If DNS is delayed or still uncertain:
- do not assume it will sort itself out in time
- choose one explicit path:
  - launch on `bngpacific.com` if it is actually ready
  - launch on the temporary production URL if it is stable and Leon accepts the tradeoff
- communicate that choice clearly to B&G

### BOG unresolved
If BOG / Worldpay details are still unresolved:
- do not let that block Easter if Stripe is ready
- treat BOG as the post-launch migration track
- the launch question is whether customers can place real orders this weekend, not whether the long-term processor decision is perfect

### Stripe live not ready
If Stripe live is still not ready:
- no launch for real orders
- do not present the system as live
- protect trust over schedule

### Clerk prod not ready
If Clerk production is still not ready:
- no fuzzy partial launch
- either there is a clearly acceptable fallback for operations or the launch slips
- do not pretend a staging-like setup is production-ready

## Minimum acceptable verification checklist

### Customer flow
- [ ] Browse menu / storefront without obvious confusion
- [ ] Add items to cart
- [ ] Reach checkout successfully
- [ ] Complete payment successfully in the real production path
- [ ] See a confirmation state that makes sense

### Operator flow
- [ ] Staff/admin login works in production
- [ ] New order is visible where operators expect it
- [ ] Core settings do not obviously break storefront behavior
- [ ] Team can tell what to do when an order comes in

### Domain / production sanity
- [ ] The launch URL is the one the team intentionally chose
- [ ] If using `bngpacific.com`, it resolves correctly and HTTPS is valid
- [ ] If using a temporary URL, B&G knows that is the Easter path
- [ ] Production environment variables are aligned with the chosen domain and auth/payment setup

For the detailed infra setup and smoke-test sequence, see `docs/PRODUCTION-LAUNCH-CHECKLIST.md`.

## What needs Leon's attention tomorrow
- Make the final payment-path call: Stripe for Easter unless a real blocker says otherwise
- Finish Clerk production
- Finish Stripe live setup
- Make the domain decision explicit
- Run the minimum production verification himself
- Send the B&G-facing status update that matches the actual launch state

## Source notes
This pack is adapted from the current workspace planning set so the repo has its own source of truth:
- `/Users/jerry/clawd/docs/projects/tsq-launch-control-apr-2026.md`
- `/Users/jerry/clawd/memory/overnight-plan.md`
- `/Users/jerry/clawd/MEMORY.md`
- `/Users/jerry/clawd/obsidian-vault/system/open-loops.md`
- `/Users/jerry/clawd/memory/2026-04-03.md`
- `docs/PRODUCTION-LAUNCH-CHECKLIST.md`
