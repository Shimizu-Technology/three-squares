# Three Squares Ordering Platform
## Product Requirements Document (PRD)

**Version:** 1.0  
**Date:** February 11, 2026  
**Author:** Jerry (AI Assistant) for Shimizu Technology  
**Client:** B&G Pacific LLC / Three Squares Restaurant  

---

## Executive Summary

Three Squares, a subsidiary of B&G Pacific LLC, is Guam's premier comfort food restaurant and catering service. They currently handle all catering orders via phone, WhatsApp, and email. This project will deliver a modern online ordering platform (forked from Hafaloha V2) to streamline their catering operations, increase order volume, and reduce manual order processing.

---

## Business Overview

### B&G Pacific LLC (Parent Company)

| Attribute | Details |
|-----------|---------|
| **Legal Name** | B&G Pacific LLC |
| **Owners** | Marie Guerrero (CEO), Mark Borja (Managing Director) |
| **Combined Experience** | 50+ years in food & beverage |
| **Revenue** | ~$3M annually |
| **Employees** | 62+ |
| **Certifications** | Woman-owned, HUBZone certified (federal contract eligible) |
| **Website** | bgpacific.com |

### Three Squares Restaurant

| Attribute | Details |
|-----------|---------|
| **Brand Name** | Three Squares |
| **Tagline** | "Good Food, Good Mood, Good Service" |
| **Cuisine** | Guam-style comfort food, Chamorro, American |
| **Phone** | (671) 646-2652 |
| **WhatsApp** | (671) 864-6656 |
| **Email** | sales@bgpacific.com |

#### Locations

| Location | Address | Hours |
|----------|---------|-------|
| **Main Restaurant** | 416 Chalan San Antonio, Tamuning, GU 96913 | Tue-Sat 8am-8pm, Sun 8am-5pm, Mon Closed |
| **Three Squares @ Donki** | Inside Don Quijote, Tamuning | 10am-10pm daily |

### Latte Stone Cookies (Product Line)

| Attribute | Details |
|-----------|---------|
| **Brand** | Latte Stone Cookies |
| **Email** | sales@lattestonecookies.com |
| **Store** | lattestonecookies.com (Shopify) |
| **Description** | Specialty cookies shaped like Guam's iconic latte stones |
| **Products** | 29 items ($5.50 - $37.50) |

---

## Current Pain Points

1. **All catering orders via phone/WhatsApp/email** — labor intensive, error-prone
2. **No online menu with real-time pricing** — customers must call for quotes
3. **Manual order tracking** — no centralized system
4. **Limited reach** — can't capture online-first customers
5. **No self-service** — staff must handle every inquiry manually

---

## Project Goals

### Primary Goals
1. Launch online ordering for **catering/bulk orders** (platters, bentos, cocktail buffets)
2. Enable **dine-in/takeout ordering** for restaurant menu
3. Reduce manual order processing by 60%+
4. Increase catering order volume by 25% in first 6 months

### Secondary Goals
1. Build customer database for marketing
2. Enable repeat ordering and favorites
3. Integrate with Latte Stone Cookies in future phase

---

## Scope

### Phase 1 (MVP for Demo — This Week)
- [ ] Fork Hafaloha V2 monorepo
- [ ] Rebrand: Three Squares colors, logo, name
- [ ] Import menu data (35+ items)
- [ ] Import catering menu (20+ items)
- [ ] Basic ordering flow
- [ ] Demo-ready for Feb 12 meeting

### Phase 2 (Post-Contract)
- [ ] Full catering workflow (lead times, custom requests)
- [ ] Multiple location support (Main + Donki)
- [ ] Payment integration
- [ ] Customer accounts
- [ ] Order notifications (SMS/WhatsApp)
- [ ] Admin dashboard

### Phase 3 (Future)
- [ ] Latte Stone Cookies integration
- [ ] Loyalty program
- [ ] Mobile app

---

## Menu Data

### Restaurant Menu (35 items)

#### Breakfast (7 items) — Served 8am-11am
| Item | Price |
|------|-------|
| French Toast, Bacon & Eggs | $12.95 |
| Stack O' Cakes | $8.95 |
| French Toast Only | $9.95 |
| Waffles | $9.95 |
| Chicken & Waffles | $14.95 |
| Loco Moco | $13.95 |
| Corned Beef Hash | $12.95 |

#### Starters (8 items)
| Item | Price |
|------|-------|
| The Local Sampler | $21.95 |
| Tinala Katne Appetizer | $14.50 |
| Tinala Katne Fries | $8.95 |
| Smoked Pork Appetizer | $12.95 |
| Three Squares Nachos | $10.95 |
| Chicken Kelaguen | $9.95 |
| Fried Lumpia | $4.95 |
| Soup of the Day | $5.95 |

#### Main Dishes (14 items)
| Item | Price | Notes |
|------|-------|-------|
| **Three Squares Famous Fried Chicken** | $15.95 | ⭐ Signature dish |
| Pot Roast | $16.95 | |
| Meatloaf | $14.95 | |
| BBQ Kalbi Shortribs | $18.95 | |
| Teriyaki Chicken | $14.95 | |
| Tinaktak | $14.95 | Chamorro specialty |
| Veggie Tinaktak | $13.95 | Vegetarian |
| Estufao | $15.95 | |
| Grilled Salmon | $19.95 | |
| Teriyaki Salmon | $19.95 | |
| Salmon Tinaktak Style | $19.95 | |
| Philly Cheese Steak Sandwich | $14.95 | |
| Bleu Cheese Burger | $14.95 | |
| Cheeseburger | $12.95 | |

#### Desserts (3 items)
| Item | Price | Notes |
|------|-------|-------|
| Bread Pudding Ala Mode | $8.95 | |
| Fried Banana with Ice Cream | $7.95 | |
| **Coconut Banana Cake** | $7.95 | ⭐ Customer favorite |

#### Drinks
| Item | Price |
|------|-------|
| House Cocktails | $10.00 |
| Draft Beer | $6.00 |
| Calamansi Tea | Free with meal |

---

### Catering Menu (20+ items)

#### Family Platters
| Item | Price | Serves |
|------|-------|--------|
| BBQ Kalbi Shortribs - Small | $85.00 | 10-15 |
| BBQ Kalbi Shortribs - Large | $150.00 | 20-30 |
| Fried Chicken - Small | $65.00 | 10-15 |
| Fried Chicken - Large | $120.00 | 20-30 |
| Chicken Kelaguen Platter | $55.00 | 10-15 |
| Tinala Katne Platter | $75.00 | 10-15 |
| Whole Fried Parrot Fish | $95.00 | 10-15 |
| Seafood Kaddo (Soup) - Small | $45.00 | 10-15 |

#### Bulk Bentos
| Item | Price | Notes |
|------|-------|-------|
| Standard Bento | $12.00 | Choice of protein |
| Mini Bento | $8.00 | Smaller portion |
| Breakfast Mini Bento | $8.00 | Morning meetings |
| Shrimp Fried Rice Bento | $14.00 | Popular choice |

#### Cocktail Buffet
| Item | Price | Serves |
|------|-------|--------|
| Kelaguen Poppers | $65.00 | 25 pieces |
| Charcuterie Board | $85.00 | 10-15 |
| Mini Salad Cups | $45.00 | 25 cups |
| Assorted Canapes | $75.00 | 30 pieces |

#### Special Items (2-3 days notice)
| Item | Price |
|------|-------|
| Roast Pig Carving | Market price |
| Shish Kabobs | Custom quote |
| Latiya Cake | $65.00 |
| Banana Donuts Platter | $35.00 (24pc) |

---

### Latte Stone Cookies (29 products)

| Product | Price |
|---------|-------|
| 30pc Grand Assortment | $37.50 |
| 20pc Classic Assortment Tin | $31.50 |
| 9pc Classic Assortment Tin | $22.50 |
| 12pc Grand Assortment | $17.00 |
| 8pc Fruit Assortment | $14.00 |
| 6pc Chocolate Dipped | $11.00 |
| 3pc Chocolate Dipped | $5.50 |
| Mini Pineapple Cookies | $5.50 |
| Mini Coconut Cookies | $5.50 |
| Mini Mango Cookies | $5.50 |
| Premium Box | $21.99 |
| Classic Mini Cookies | $5.99 |
| *+ 17 more items* | $5.50-$24.99 |

---

## Brand Guidelines

### Color Palette

#### Primary (B&G Pacific)
| Color | Hex | Usage |
|-------|-----|-------|
| Pacific Blue | `#4A7FB5` | Primary brand |
| Dark Navy | `#1E3A5F` | Text, accents |
| Golden Sun | `#F5C518` | Accent |
| White | `#FFFFFF` | Backgrounds |

#### Warm Tones (Food-inspired)
| Color | Hex | Usage |
|-------|-----|-------|
| Rich Brown | `#8B5E3C` | Warmth |
| Amber | `#D4A030` | Highlights |
| Fresh Green | `#4A7C3F` | Accents |

### Typography
- **Headlines:** Brush/script font (casual, handwritten feel)
- **Body:** Clean sans-serif (modern, readable)

### Visual Style
- Warm, approachable photography
- Natural lighting, authentic feel
- Social media-friendly aesthetic
- Polaroid-style frames for images

### Social Media
- **Handle:** @threesquaresguam
- **Platforms:** Instagram, Facebook, Pinterest, TripAdvisor, Yelp

---

## Technical Requirements

### Platform
- **Frontend:** React (Vite) — forked from Hafaloha web
- **Backend:** Ruby on Rails API — forked from Hafaloha API
- **Database:** PostgreSQL
- **Hosting:** TBD (likely Render or Railway)

### Integrations (Phase 2+)
- Payment: Stripe
- SMS: Twilio
- WhatsApp: WhatsApp Business API
- Email: SendGrid

---

## Assets Available

### Images (23 files)
Located in: `~/work/three-squares-assets/images/`

- BG-Truck.jpg (brand truck with logo)
- Bleu_Chz_Burger.jpg
- Cheeseburger.jpg
- Loco_Moco.JPG
- BBQ_Chicken.JPG
- Charcutterie_Board.JPG
- Bulk_Bento_-_Shrimp_Fried_Rice.jpeg
- Cocktail_Stations_-_Assorted_Poppers.jpg
- Three_Squares_%40_Donki.png
- *+ 14 more food/catering images*

### Latte Stone Cookies Images (15 files)
Located in: `~/work/three-squares-assets/images/latte-stone-cookies/`

### Data Files
- `menu.json` — Full restaurant + catering menu
- `latte-stone-cookies.json` — Full product catalog
- `brand-guide.md` — Color/typography guide
- `research-report.md` — Business research

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Demo ready | Feb 12, 2026 |
| MVP launch | TBD (post-contract) |
| Online orders/month | 50+ by month 3 |
| Order processing time | <2 min (vs 10+ min manual) |
| Customer satisfaction | 4.5+ stars |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Client unfamiliar with tech | Provide training + simple admin UI |
| Complex catering requirements | Start simple, iterate based on feedback |
| Multiple locations | Support location selection in Phase 2 |

---

## Next Steps

1. ✅ Fork Hafaloha V2 → `~/work/three-squares/`
2. ✅ Create PRD with all collected data
3. ⏳ Update branding (colors, name, logo placeholder)
4. ⏳ Seed database with menu items
5. ⏳ Prepare demo for Feb 12 meeting
6. ⏳ Discuss pricing and contract with Marie/Mark

---

## Appendix

### Contact Information

**B&G Pacific / Three Squares**
- Phone: (671) 646-2652
- WhatsApp: (671) 864-6656
- Email: sales@bgpacific.com
- Address: 416 Chalan San Antonio, Tamuning, GU 96913

**Shimizu Technology**
- Leon Shimizu
- Email: leon@shimizu-technology.com

---

*Document generated from scraped data, image analysis, and business research.*
