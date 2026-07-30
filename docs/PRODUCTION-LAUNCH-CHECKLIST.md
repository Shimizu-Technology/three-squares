# Three Squares Production Launch Checklist

**Target:** Easter Sunday, April 5, 2026
**Status:** Launch only if the blockers below are green
**Last updated:** April 5, 2026

---

## Launch decision

Launch only if all five of these are true:

- [ ] **Stripe live readiness is confirmed**
  - Live API keys are available
  - Live webhook is configured for `https://three-squares-api.onrender.com/webhooks/stripe`
  - If BOG / Worldpay is still unresolved, **Stripe remains the Easter path**
- [ ] **Clerk production readiness is confirmed**
  - Production app exists
  - Production keys are in place
  - Staff/admin auth works in production
- [ ] **Domain / DNS path is intentional**
  - `bngpacific.com` is ready and resolves correctly, or
  - Leon explicitly chooses a temporary launch URL for Easter
  - If DNS is not actually ready, do not leave this ambiguous
- [ ] **Minimum customer-path validation passed**
  - Browse menu
  - Add items to cart
  - Complete checkout
  - See confirmation
- [ ] **Minimum operator-path validation passed**
  - Admin login works in production
  - Order appears correctly
  - Team can tell what to do when an order comes in

If any item above is not green, do not launch.

---

## 1. Must be green before launch

### Stripe live readiness

1. Go to Stripe live mode and confirm live access is usable.
2. Copy live keys:
   - `pk_live_...`
   - `sk_live_...`
3. Configure the live webhook:
   - Endpoint: `https://three-squares-api.onrender.com/webhooks/stripe`
   - Events:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `payment_intent.canceled`
4. Save the webhook signing secret:
   - `whsec_...`

**Contingency:**
- If BOG / Worldpay is not resolved, keep Stripe as the Easter processor.
- If Stripe live is not actually ready, do not launch.

### Clerk production readiness

1. In Clerk, create or confirm the production application.
2. Confirm production keys:
   - `pk_live_...`
   - `sk_live_...`
3. Verify production sign-in works for the staff/admin path.

**Contingency:**
- If Clerk production auth is not working in production, do not launch.

### Domain / DNS decision

Choose one path before launch:

- **Path A: Launch on `bngpacific.com`**
  - Netlify custom domain is configured
  - DNS records are updated
  - HTTPS is green
  - `bngpacific.com` resolves correctly

- **Path B: Launch on an intentional temporary URL**
  - Use `https://three-squares.netlify.app` intentionally if the main domain is not ready
  - Make sure B&G knows this is the Easter launch URL

**Contingency:**
- If DNS slips, do not quietly hope it resolves in time.
- Use an intentional temporary URL or delay launch.
- No ambiguous middle state.

### Minimum customer-path validation

Run one real customer-path test:

- [ ] Open the launch URL
- [ ] Browse menu / locations without confusion
- [ ] Add items to cart
- [ ] Complete checkout
- [ ] See confirmation

### Minimum operator-path validation

Run one real operator-path test:

- [ ] Sign in to admin in production
- [ ] Confirm the order appears
- [ ] Confirm core settings do not obviously break storefront behavior
- [ ] Confirm the team can receive/process the order

---

## 2. Can run in parallel

These matter, but they are not the launch gate if the five blockers above are green.

- Update Render environment variables with production Stripe / Clerk values
- Update Netlify environment variables with the production Clerk publishable key
- Restart Render after env updates
- Trigger a Netlify deploy after env updates
- Invoice follow-up with B&G
- Payment-options / BOG context and communication
- Training / status communication to B&G
- Non-blocking menu or settings cleanup

### Relevant environment variables

**Render (`three-squares-api`)**

```env
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=https://bngpacific.com
ALLOWED_ORIGINS=https://bngpacific.com,https://www.bngpacific.com,https://three-squares.netlify.app
```

Notes:
- Restart the service after env updates.
- `ALLOWED_ORIGINS` must match exactly.

**Netlify (`three-squares`)**

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_API_BASE_URL=https://three-squares-api.onrender.com
```

---

## 3. Can wait until after Easter

- BOG / Worldpay longer-term migration work
- Non-blocking UX polish
- Broader admin refinements
- Broader settings cleanup
- Nice-to-have docs or training improvements
- Anything that does not change whether a real customer can order and staff can receive/process that order

---

## 4. Launch-morning go / no-go

### Go

Launch only if all are true:

- [ ] Stripe live path works
- [ ] Clerk production auth works
- [ ] Domain path is intentional and usable
- [ ] Customer-path test passed
- [ ] Operator-path test passed

### No-go

Do not launch if any are true:

- [ ] Payments are still not actually live
- [ ] Production auth is incomplete or broken
- [ ] DNS / domain state is confused
- [ ] Leon has not personally verified the end-to-end customer path
- [ ] Leon has not personally verified the operator/admin path

---

## 5. Security notes

- Never commit live Stripe or Clerk keys to git
- Do not mix Clerk test keys with production
- Rotate webhook secrets if they were exposed in plain text

---

## Contacts

- **Marie Guerrero** (B&G Pacific): mguerrero@bgpacific.com
- **Liv** (domain / Squarespace coordination): coordinate through Marie
- **Stripe support** (if identity verification issues): 1-888-926-2289
