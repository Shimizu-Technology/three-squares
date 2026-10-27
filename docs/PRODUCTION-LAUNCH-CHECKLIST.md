# Three Squares — Production Launch Checklist

**Target:** Easter Sunday, April 5, 2026
**Deadline to start DNS:** Tuesday, April 1 (72-hr propagation buffer)
**Last updated:** March 29, 2026

---

## 🔴 CRITICAL PATH (Must complete in order)

### Step 1: Merge open PRs (Leon — 1-2 hours)

All 6 open PRs are mergeable (no conflicts). Suggested order:

| PR | Title | Notes |
|----|-------|-------|
| #31 | TSQ-57: Config cache fix | Fixes settings propagation bug |
| #32 | TSQ-51: Checkout pre-populate | Quality of life for customers |
| #33 | TSQ-40+41: 4-tier RBAC | Staff/Manager role support |
| #34 | Docs: RBAC training guide | Update after #33 merges |
| #30 | TSQ-56: UX polish | Location picker, responsive header |
| #35 | TSQ-62: Product CSV import | Nice-to-have for menu setup |

> **PR #34 must come after PR #33** (docs reference the new roles)

---

### Step 2: Create Clerk Production App (TSQ-59) (Leon — 15 min)

1. Go to [https://dashboard.clerk.com](https://dashboard.clerk.com)
2. Click **"Create Application"**
3. Name: `Three Squares Production`
4. Enable **Email** sign-in method
5. Once created, go to **API Keys**
6. Copy:
   - `Publishable Key` → starts with `pk_live_...`
   - `Secret Key` → starts with `sk_live_...`

> **Do NOT use test keys (`pk_test_...`) in production — Clerk won't allow real users**

---

### Step 3: Activate Stripe Live Mode (TSQ-60) (Leon + Marie — 20 min)

**Pre-req:** Marie needs to complete Stripe identity verification (if not done)

1. Go to [https://dashboard.stripe.com](https://dashboard.stripe.com)
2. Toggle from **Test mode → Live mode** (top-right toggle)
3. Go to **Developers → API Keys**
4. Copy:
   - `Publishable key` → starts with `pk_live_...`
   - `Secret key` → starts with `sk_live_...`
5. Set up **Stripe Webhook** for live mode:
   - Developers → Webhooks → Add endpoint
   - URL: `https://three-squares-api.onrender.com/webhooks/stripe`
   - Events to listen for:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `payment_intent.canceled`
   - Copy the **Webhook Signing Secret** → starts with `whsec_...`

---

### Step 4: Update Render Environment Variables (Jerry can prep, Leon activates)

**Service:** `three-squares-api` on Render

Update these env vars (use Render dashboard, restart service — do NOT redeploy):

```
# Clerk (production keys)
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...

# Stripe (production keys)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# CORS — add production domain BEFORE DNS goes live
FRONTEND_URL=https://bngpacific.com
ALLOWED_ORIGINS=https://bngpacific.com,https://www.bngpacific.com,https://three-squares.netlify.app
```

> After updating env vars: use **Restart** (not Deploy) in Render dashboard

---

### Step 5: Update Netlify Environment Variables

**Site:** `three-squares` on Netlify

Update these env vars:

```
# Clerk (production publishable key)
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...

# API URL (already correct if pointing to Render)
VITE_API_BASE_URL=https://three-squares-api.onrender.com
```

Then trigger a **new deploy** (or push to main to auto-deploy).

---

### Step 6: Configure Custom Domain in Netlify (Leon — 10 min)

1. Netlify Dashboard → three-squares site → **Domain management**
2. Click **"Add custom domain"**
3. Add: `bngpacific.com`
4. Add: `www.bngpacific.com`
5. Note the Netlify site URL (e.g., `three-squares-abc123.netlify.app`) — needed for DNS step
6. HTTPS will auto-provision once DNS propagates

---

### Step 7: DNS Redirect — bngpacific.com → Netlify (Marie — 15 min)

**⚠️ Must start by Tuesday April 1 for propagation before Easter**

Option A (recommended — keep domain at Squarespace, just change DNS):

1. Marie logs into Squarespace → **Domains** → `bngpacific.com` → **DNS Settings**
2. Delete existing A record(s) pointing to Squarespace servers
3. Delete existing CNAME for `www` (if any)
4. Add new records:
   ```
   Type: A
   Host: @
   Value: 75.2.60.5
   TTL: 3600

   Type: CNAME
   Host: www
   Value: [netlify-site-name].netlify.app
   TTL: 3600
   ```
5. Save changes
6. DNS propagates in 15 min to 72 hours (usually ~1 hour)
7. Netlify auto-provisions HTTPS certificate (takes ~5 min after DNS propagates)

---

### Step 8: Final Smoke Test (Leon — 30 min before Easter)

- [ ] Visit `https://bngpacific.com` — loads correctly
- [ ] HTTPS certificate is green
- [ ] Sign in with Clerk (real account, not test)
- [ ] Place a test order with Stripe live mode (use real card, $1 item)
- [ ] Confirm order appears in admin panel
- [ ] Confirm order email arrives
- [ ] POS terminal can connect and process a transaction
- [ ] Refund the test order in Stripe dashboard

---

## 📅 Timeline

| Day | Date | Action | Owner |
|-----|------|--------|-------|
| Monday | Mar 30 | Merge PRs #31, #32, #33, #34, #30 | Leon |
| Monday | Mar 30 | Create Clerk prod app + get keys | Leon |
| Monday | Mar 30 | Activate Stripe live + get keys + webhook | Leon/Marie |
| Monday | Mar 30 | Update Render + Netlify env vars | Leon/Jerry |
| Tuesday | Apr 1 | **DNS records updated (MUST START TODAY)** | Marie |
| Tuesday | Apr 1 | Confirm DNS is propagating | Leon |
| Wednesday | Apr 2 | Verify bngpacific.com loads, HTTPS green | Leon |
| Thursday | Apr 3 | Run full smoke test with real card | Leon |
| Friday | Apr 4 | Train Liv on live system (if needed) | Leon |
| **Sunday** | **Apr 5** | **🎉 EASTER LAUNCH** | — |

---

## 💰 Outstanding Invoice

**$2,500 invoice** sent March 13 — 16 days outstanding as of March 29.
Check-in email draft: `jerry/drafts/tsq-checkin-email.md`
Leon: review + send Monday morning before the day gets away from you.

---

## 🔒 Security Notes

- Never commit live Stripe/Clerk keys to git
- Rotate webhook secrets if they were ever in plain-text in Slack/email
- ALLOWED_ORIGINS must match exactly (no trailing slashes)
- Clerk production app is separate from dev — don't mix keys

---

## 📞 Contacts

- **Marie Guerrero** (B&G Pacific): mguerrero@bgpacific.com
- **Liv** (domain/Squarespace access): coordinate through Marie
- **Stripe support** (if identity verification issues): 1-888-926-2289

---

*Generated by Jerry — March 29, 2026*
