# Three Squares — Staging Test Script

**Date:** Feb 20, 2026
**Branch:** staging (13 PRs merged)
**What to test:** Everything that's been added since last prod deploy

## Setup
```bash
cd ~/work/three-squares
git checkout staging && git pull
# API
cd api && bundle install && rails db:migrate && rails s -p 3000
# Frontend (new terminal)
cd web && npm install && npm run dev
```

## 1. Multi-Location Ordering (TSQ-24)
- [ ] Homepage shows location picker (Tamuning + Donki)
- [ ] Selecting a location filters products
- [ ] Cart clears with confirmation when switching locations
- [ ] Order includes correct location

## 2. Site Branding (TSQ-25)
- [ ] Logo, colors, tagline look correct
- [ ] Landing page matches B&G Pacific branding

## 3. Notifications (TSQ-23)
- [ ] Create a test order → check for email confirmation
- [ ] Update order status → check for email update
- [ ] (SMS requires ClickSend env vars — skip if not set locally)

## 4. Toggle-able Locations (TSQ-35)
- [ ] Admin > Locations page shows both locations
- [ ] Can toggle a location inactive
- [ ] Inactive location hidden from public menu
- [ ] Can set start/end dates for popup locations

## 5. QR Codes (TSQ-36)
- [ ] Admin > Locations > QR Code button on each location
- [ ] QR modal shows with download/print/copy options
- [ ] QR code links to `/menu?location=<slug>`

## 6. Direct Menu URL (TSQ-37)
- [ ] Visit `http://localhost:5173/menu?location=donki`
- [ ] Should auto-select Donki location, skip picker
- [ ] Products filtered to Donki menu

## 7. Admin Location Lifecycle (TSQ-38)
- [ ] Can create a new popup location with dates
- [ ] Can edit location details
- [ ] Auto-deactivate toggle works

## 8. Dashboard Metrics (TSQ-4)
- [ ] Admin dashboard shows order counts, revenue
- [ ] Charts render correctly
- [ ] Date filters work

## 9. Business Line Sections (TSQ-19)
- [ ] Admin sidebar shows Three Squares / Latte Stone / B&G sections
- [ ] Pill selector filters products by business line
- [ ] Colors are distinct per line

## 10. iPad Fulfillment (TSQ-18)
- [ ] Fulfillment page shows pending orders
- [ ] Can update order status (confirmed → ready → picked up)
- [ ] Status-aware buttons (right transitions only)

## 11. Seasonal Menus (TSQ-28)
- [ ] Admin > Collections > can set collection type (seasonal/limited)
- [ ] Date pickers for seasonal ranges
- [ ] Auto-hide toggle
- [ ] Featured collections show on homepage with countdown

## 12. POS Card Fallback (TSQ-34)
- [ ] POS page: F8 = Cash, F9 = Tap Card, F10 = Type Card
- [ ] Manual card entry modal opens on F10
- [ ] Cash modal with change calculation
- [ ] Closing modal cancels/restores inventory

## Quick Smoke Test (5 min version)
If short on time, just do:
1. Homepage → pick Tamuning → browse menu → add to cart → checkout
2. Admin dashboard → check metrics
3. Admin locations → view QR code → toggle one off
4. Visit `/menu?location=donki` → verify it works
5. POS → create a cash order (F8)

## Notes
- Stripe test mode — use card `4242 4242 4242 4242`
- If something looks broken, screenshot it and send to Jerry
