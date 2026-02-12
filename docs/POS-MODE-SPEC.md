# POS Mode — Implementation Spec

## TSQ-8: Phase 1 (Staff Order Creation + Cash/Card)

### Backend Changes

#### New Migration
```ruby
# Add to orders table
add_column :orders, :source, :string, default: 'online'  # online, pos, phone
add_column :orders, :staff_created, :boolean, default: false
add_column :orders, :payment_method, :string  # stripe, cash
add_column :orders, :created_by_user_id, :integer
```

#### New Endpoint: `POST /api/v1/admin/orders`
Staff creates order on behalf of customer. Requires admin auth.

```json
{
  "order": {
    "customer_name": "Walk-in",
    "order_type": "pickup",       // pickup or dine_in
    "source": "pos",
    "payment_method": "cash",     // cash or stripe
    "location_id": 1,
    "special_instructions": "",
    "items": [
      {
        "product_variant_id": 123,
        "quantity": 2
      }
    ],
    "cash_received": 25.00       // only for cash payments
  }
}
```

**Cash flow:**
1. Create order with status=confirmed, payment_status=paid
2. Return order + change_due in response

**Card flow:**
1. Create order with status=pending, payment_status=pending  
2. Return Stripe PaymentIntent client_secret
3. Frontend completes payment via Stripe Elements
4. Webhook confirms → status=confirmed, payment_status=paid

#### Order Model Changes
- `source` enum: online, pos, phone
- `staff_created` flag: skip customer emails when true
- `payment_method`: stripe, cash
- `created_by_user_id`: which admin/staff created it

### Frontend: `/admin/pos`

#### Layout (Desktop)
```
┌─────────────────────────────────┬──────────────────┐
│  POS Mode              [Search] │  Cart             │
├─────────────────────────────────┤  Customer: Walk-in│
│ [All] [Breakfast] [Mains] ...   │  Type: [Pickup]   │
│                                 │  Location: [Main] │
│ ┌─────┐ ┌─────┐ ┌─────┐       │                   │
│ │ Item│ │ Item│ │ Item│        │  Biscuits & Gravy │
│ │$11.95│ │$14.00│ │$10.95│      │  x2     $23.90   │
│ └─────┘ └─────┘ └─────┘       │                   │
│ ┌─────┐ ┌─────┐ ┌─────┐       │  Fried Chicken    │
│ │ Item│ │ Item│ │ Item│        │  x1     $10.95    │
│ └─────┘ └─────┘ └─────┘       │                   │
│                                 │  Total:   $34.85  │
│                                 │                   │
│                                 │ [💵 Cash] [💳 Card]│
└─────────────────────────────────┴──────────────────┘
```

#### Key Components
1. **POSPage.tsx** — Main full-screen page
2. **POSMenuGrid.tsx** — Product cards in grid, grouped by category
3. **POSCart.tsx** — Right-side cart panel
4. **POSCashModal.tsx** — Cash payment with denomination buttons + change calc
5. **POSCardPayment.tsx** — Stripe Elements for card payment

#### Product → Cart Flow
- Products have variants (e.g., "Regular" / "Large")
- If single variant → add directly to cart
- If multiple variants → show variant picker
- Quantity +/- in cart
- Products filtered by location (product_locations join)

#### Cash Payment UX (from legacy)
- Quick denomination buttons: $5, $10, $20, $50, $100, Exact
- Custom amount input
- Change due calculation with green highlight
- "Complete Cash Payment" button

---

## TSQ-10: Phase 2 (Future)
- Staff discounts (50% on-duty / 30% off-duty)
- House accounts
- Stripe Terminal S700 (TSQ-2)
- Receipt printing
- Order status board
- Payment links

## Legacy Reference Files
- **Backend model:** `~/shimizu-technology/Order-Suite/shimizu-order-suite/app/models/order.rb`
- **Staff modal:** `~/shimizu-technology/Order-Suite/frontends/hafaloha_frontend/src/ordering/components/admin/StaffOrderModal.tsx`
- **Staff options:** `~/shimizu-technology/Order-Suite/frontends/hafaloha_frontend/src/ordering/components/admin/StaffOrderOptions.tsx`
- **Simpler POS ref:** `~/shimizu-technology/ordering-platform/frontends/threesquares/src/pages/admin/POSPage.tsx`
