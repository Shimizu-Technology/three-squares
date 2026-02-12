# Three Squares Discovery Meeting Notes

**Date:** February 12, 2026  
**Attendees:** Leon Shimizu, Auntie Marie (Three Squares/B&G Pacific)  
**Next Meeting:** Thursday, February 20, 2026  
**Purpose:** Initial discovery meeting to understand Three Squares' needs

---

## Meeting Outcome

✅ **Very positive reception** — Three Squares is excited to move forward  
✅ **Follow-up meeting scheduled** for detailed requirements walkthrough  
✅ **Clear understanding** of their multi-faceted business needs

---

## Key Requirements Identified

### 1. Online Catering Orders & Inquiries
**Priority:** HIGH  
**Status:** Partially built in demo

- Allow customers to order catering online
- Support catering inquiries (request for quote flow)
- Lead time requirements for large orders
- Bulk quantity pricing

### 2. Pop-up POS System
**Priority:** HIGH  
**Status:** Not yet built

**Use Case:** Three Squares does pop-up events at various locations. They need:
- Ability to **create a new location on the fly** in the system
- **Import menu items** from existing menus (maybe a "copy from" feature?)
- Generate a **QR code** that takes customers directly to the ordering page filtered to that location
- Full **POS functionality** at the pop-up:
  - Take orders in person
  - Accept payments: **card, cash, etc.**
  - Everything seamless in one system

**Technical Implication:** This is essentially requesting:
- Dynamic location creation (admin feature)
- Menu item duplication/templating across locations
- QR code generation with location-filtered URLs
- In-person POS mode with Stripe Terminal integration

### 3. Unified Brand Portal
**Priority:** HIGH  
**Status:** Architecture supports this

Three Squares wants all their business lines under one roof:
- **B&G Deli** (people know this brand)
- **Three Squares** (people know this brand separately)
- **Latte Stone Cookies** (specialty product line)

**Problem:** Many customers know B&G but not Three Squares, and vice versa. Cross-promotion opportunity.

**Technical Implication:** Already architected with business_line filtering and split storefront routes.

### 4. Wholesale Ordering System
**Priority:** HIGH (per Leon)  
**Status:** Not yet built (but legacy Hafaloha has wholesale module)

**Customers:**
- ABC Stores (all locations in Guam)
- Anderson Air Force Base
- Naval Base Guam
- Foody's (Shell gas stations)

**Workflow:**
1. Wholesale customer places order for their location
2. Specifies quantities needed
3. B&G/Three Squares sees order in admin
4. Fulfills order and communicates timeline back to customer

**Technical Implication:**
- B2B ordering portal (different from retail)
- Wholesale pricing tiers (different from retail)
- Order fulfillment tracking with timeline communication
- Customer accounts for wholesale buyers
- Possible: recurring orders, order templates

### 5. Revel POS Integration
**Priority:** MEDIUM (future phase, but exciting to them)  
**Status:** Not yet built

**Problem:** Three Squares uses Revel POS in their physical locations. If they use our online ordering system:
- Orders come into our system
- Staff must manually re-enter orders into Revel
- Double work, error-prone

**Solution:** Direct Revel API integration
- Online orders automatically push to Revel
- No manual re-entry required
- Single source of truth for all orders

**Technical Implication:**
- Revel has REST API (`https://[subdomain].revelup.com/resources/`)
- API key authentication
- Would need Three Squares' Revel credentials
- **Cost:** They would pay Revel extra monthly for API access (not us)

**Note:** Last year, this was explored for Hafaloha but they declined the extra Revel fee. Three Squares is likely willing to pay.

### 6. Stripe Terminal (Card Reader) Integration
**Priority:** HIGH  
**Status:** Research phase

**Current Workaround (Hafaloha Legacy):**
1. Mark order as "Stripe Reader" payment in our app
2. Open separate "Payment with Stripe" app
3. Process card payment there
4. Return to our app and confirm

**Problem:** Two apps, context switching, clunky UX

**Solution:** Stripe Terminal smart readers (S700, WisePOS E)
- Connect directly to web app via JavaScript SDK
- No separate app needed
- Seamless payment flow

**Leon has:** Stripe Reader S700 for testing ✅

---

## Technical Priorities for Next Phase

### Immediate (Before Next Meeting)
1. ✅ Fix Greptile review comments
2. Research Stripe Terminal S700 integration
3. Audit Hafaloha V2 for cross-pollination opportunities

### Short-term (For Next Meeting Demo)
1. Document current capabilities clearly
2. Prepare POS mode mockups/wireframes
3. Prepare wholesale module proposal

### Medium-term (Post-Contract)
1. Stripe Terminal integration
2. Dynamic location/pop-up support
3. Wholesale ordering module
4. QR code generation

### Long-term
1. Revel POS integration
2. Advanced reporting by location/business line

---

## Questions for Next Meeting

1. **Pop-up frequency:** How often do they do pop-ups? How many locations typically?
2. **Wholesale volume:** How many wholesale customers? Order frequency?
3. **Revel commitment:** Are they willing to pay Revel's API fees?
4. **Timeline:** When do they want to go live? Any events coming up?
5. **Budget:** What's their budget for:
   - Initial build
   - Monthly SaaS fee
   - Hardware (card readers)

---

## Action Items

| Owner | Task | Due |
|-------|------|-----|
| Jerry | Fix Greptile comments, push to PR | ✅ Done |
| Jerry | Research Stripe Terminal S700 integration | Feb 13 |
| Jerry | Audit Hafaloha V2 | Feb 14 |
| Jerry | Create detailed feature roadmap | Feb 19 |
| Leon | Schedule next meeting with Three Squares | ✅ Done (Feb 20) |
| Leon | Get Revel API access info from Three Squares | Next meeting |

---

## Appendix: Business Context

### B&G Pacific LLC (Parent Company)
- **Owners:** Marie Guerrero (CEO), Mark Borja (Managing Director)
- **Experience:** 50+ years combined in F&B
- **Employees:** 62+
- **Revenue:** ~$3M annually
- **Certifications:** Woman-owned, HUBZone (federal contract eligible)

### Locations
| Location | Address | Hours |
|----------|---------|-------|
| Main Restaurant | 416 Chalan San Antonio, Tamuning | Tue-Sat 8am-8pm, Sun 8am-5pm |
| Three Squares @ Donki | Inside Don Quijote, Tamuning | 10am-10pm daily |

### Contact
- Phone: (671) 646-2652
- WhatsApp: (671) 864-6656
- Email: sales@bgpacific.com
