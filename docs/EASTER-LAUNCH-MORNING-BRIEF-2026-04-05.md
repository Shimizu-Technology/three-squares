# Three Squares Easter Launch Morning Brief

Date: Sunday, April 5, 2026

## What matters today
- Decide launch status by checking only the real blockers: Stripe live, Clerk production, domain path, customer checkout test, and operator/admin test.
- Merge the open PRs in the right order so production reflects the intended Easter launch baseline.
- If `bngpacific.com` is not fully ready, make an explicit temporary-URL decision instead of losing time to DNS uncertainty.
- Do one real end-to-end order test and one real admin/operator test before calling anything live.
- Keep BOG and post-launch cleanup out of today's critical path unless they directly block Easter orders.

## Open PR merge order
1. #31 — TSQ-57: Config cache fix
2. #32 — TSQ-51: Checkout pre-populate
3. #33 — TSQ-40+41: 4-tier RBAC
4. #34 — docs: RBAC training guide
   - Merge only after #33; PR #34 targets the #33 branch and depends on those role changes.
5. #30 — TSQ-56: UX polish
6. #35 — TSQ-62: Product CSV import
   - Nice to have; if time gets tight, this is the easiest merge to defer.

## Launch gates
Go only if all are true:
- Stripe live keys, webhook, and real payment path are confirmed.
- Clerk production app is live and staff/admin auth works in production.
- Launch URL is intentional: `bngpacific.com` works or a temporary URL is explicitly accepted.
- Leon completes one real customer checkout test.
- Leon completes one real operator/admin test and can see/process the order.

No-go if any of the above is still uncertain.

## If one thing slips
- DNS: launch on the best stable temporary URL, communicate it clearly, and do not wait on vague propagation hope.
- Stripe: do not accept live orders until keys and webhook are verified; slip launch rather than fake readiness.
- Clerk: if production auth is not working, treat that as a blocker; do not burn time on partial-workaround complexity.

## Do not spend time on
- BOG / WorldPay as the Easter payment path
- Nice-to-have UX polish beyond what is already in open PRs
- Broad admin cleanup or settings tidying
- Menu import or other non-blocking back-office improvements if launch gates are still red
- Any post-Easter roadmap, documentation cleanup, or perfection passes
