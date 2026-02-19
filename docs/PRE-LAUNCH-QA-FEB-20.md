# Pre-Launch QA Report — Feb 20, 2026

**Purpose:** Summary of platform readiness for today's meeting with Marie

---

## ✅ What's Working

### Backend (API)
- **92/92 tests passing** — all models, controllers, services
- 110 products across 16 collections
- 2 locations configured (Main + Donki) with correct hours
- Order notifications: email + SMS at every status change
- Multi-location ordering with location-specific menus
- Catering inquiry system
- Stripe payment integration (test mode)
- Cart with session management
- CSV product import
- Admin order management with filtering, CSV export

### Frontend
- Homepage with hero, business line cards, featured products, about section
- Location picker with hours
- Product browsing with filters (business line, collection, search, sort)
- Cart drawer with quantities
- Checkout flow (pickup + shipping)
- Responsive mobile layout
- Announcement banner (configurable)
- Catering inquiry form
- Admin dashboard

### Infrastructure
- API: Render (Singapore region)
- Frontend: Netlify
- Auth: Clerk
- Payments: Stripe
- Email: Resend
- Images: AWS S3 + imgix CDN

---

## ⚠️ Needs Attention Before Launch

### Content (Marie's Team)
1. **No product images** — All 110 products show placeholder logo. Need food photography.
2. **8 "Market Price" items** — Chicken Kelaguen, Potato Salad, Broccoli & Crab Salad, Chocolate Coconut Sago, Tropical Sago, Champuladu, Shish Kabobs, Roast Pig Carving. Confirm these should display "Market Price" vs a fixed price.
3. **Menu accuracy** — 110 items seeded from original data. Marie should review for:
   - Correct pricing (especially catering: $55-$150 range)
   - Items to add/remove
   - Seasonal availability

### Technical
4. **Stripe live mode** — Currently test keys. Need Marie's Stripe account connected.
5. **Domain setup** — See `DOMAIN-TRANSFER-GUIDE.md` for bngpacific.com options.
6. **EasyPost live mode** — Shipping rates are test mode for Latte Stone Cookies.
7. **SMS sender** — Need to register production phone number/sender ID.
8. **Resend domain verification** — Emails currently from noreply@shimizu-technology.com, should be from bngpacific.com or threesquaresguam.com.

### Nice-to-Have (Post-Launch)
9. **Stripe Terminal S700** — In-store POS payments (TSQ-2, in progress)
10. **Revel POS sync** — Sync online orders to existing POS (TSQ-29)
11. **Staff RBAC** — Admin vs employee roles (TSQ-20)
12. **Dashboard metrics by location** (TSQ-4)

---

## 📊 Data Summary

| Metric | Count |
|--------|-------|
| Products | 110 |
| Collections | 16 |
| Locations | 2 |
| Business Lines | 3 (Three Squares, Latte Stone Cookies, Catering) |
| Products with images | 0 ⚠️ |
| Products with price | 102 |
| Market price items | 8 |
| Catering platters | 11 ($55-$150) |

---

## 🚀 Launch Readiness Score: 7/10

**Blockers to resolve:**
- Product images (can soft launch without, but looks incomplete)
- Stripe live keys
- Domain pointing

**Everything else is production-ready.**
