# Domain Transfer Guide: bngpacific.com

**Ticket:** TSQ-22
**Status:** Ready for Leon + Marie to action
**Last updated:** Feb 20, 2026

---

## Current State
- **Domain:** bngpacific.com
- **Registrar:** Likely Squarespace (previously used for site)
- **DNS:** Managed by Squarespace
- **Goal:** Point bngpacific.com → Three Squares app on Netlify

## Option A: DNS-Only Redirect (Recommended — No Transfer Needed)

The fastest path. Keep the domain at Squarespace, just change DNS records.

### Steps
1. **Log into Squarespace** → Domains → bngpacific.com → DNS Settings
2. **Remove** existing A/AAAA/CNAME records pointing to Squarespace
3. **Add CNAME record:**
   - Host: `www`
   - Value: `[netlify-site-name].netlify.app` (get from Netlify dashboard)
4. **Add A record for apex domain:**
   - Host: `@`
   - Value: `75.2.60.5` (Netlify load balancer)
5. **In Netlify Dashboard:**
   - Site Settings → Domain management → Add custom domain
   - Add `bngpacific.com` and `www.bngpacific.com`
   - Enable HTTPS (automatic via Let's Encrypt)
6. **Wait 15-60 min** for DNS propagation
7. **Verify:** Visit bngpacific.com in browser

### Pros
- No downtime risk
- No registrar transfer fees
- Can revert in minutes if needed
- SSL auto-provisioned by Netlify

### Cons
- Domain renewal still through Squarespace
- Two accounts to manage

---

## Option B: Full Domain Transfer to Netlify

Transfer the domain registration itself to Netlify.

### Steps
1. **At Squarespace:**
   - Unlock domain (Domains → bngpacific.com → Transfer → Unlock)
   - Get authorization/EPP code
   - Disable WHOIS privacy temporarily
2. **At Netlify:**
   - Domains → Add or register domain → Transfer
   - Enter `bngpacific.com` and the EPP code
   - Pay transfer fee (~$15, includes 1 year renewal)
3. **Confirm transfer** via email (check Marie's email)
4. **Wait 5-7 days** for ICANN transfer to complete
5. DNS will auto-configure for the Netlify site

### Pros
- Single account for hosting + domain
- Simpler long-term management
- Netlify DNS is fast (global anycast)

### Cons
- 5-7 day transfer window
- Domain must be >60 days old at current registrar
- Brief email confirmation step required

---

## Option C: Subdomain Approach (Interim)

Use `order.bngpacific.com` or `threesquares.bngpacific.com` while keeping main site.

### Steps
1. Add CNAME: `order` → `[site].netlify.app`
2. Add custom domain in Netlify
3. Main site stays on Squarespace

### Pros
- Zero risk to existing site
- Can run both simultaneously
- Good for soft launch / testing

---

## Recommendation

**Start with Option A** (DNS redirect) for the launch. It's the fastest, lowest-risk path. Marie can do it in 15 minutes.

If they want to consolidate later, do Option B after launch when there's no time pressure.

For a soft launch or testing period, Option C lets them share `order.bngpacific.com` with select customers first.

---

## Pre-Launch Checklist

- [ ] Confirm current Squarespace login credentials with Marie
- [ ] Get Netlify site URL (deploy to Netlify first)
- [ ] Configure custom domain in Netlify dashboard
- [ ] Update DNS records per Option A
- [ ] Verify HTTPS certificate is provisioned
- [ ] Test all pages load correctly on custom domain
- [ ] Update any hardcoded URLs in the app (emails, meta tags)
- [ ] Set up 301 redirect: www → apex (or vice versa)
- [ ] Test email delivery (order confirmations, etc.)
- [ ] Update Google Business Profile with new URL

## Environment Variables to Update on Deploy

When going live, update these in Netlify:
```
VITE_API_BASE_URL=https://three-squares-api.onrender.com
```

And in Render (API):
```
ALLOWED_ORIGINS=https://bngpacific.com,https://www.bngpacific.com
FRONTEND_URL=https://bngpacific.com
```
