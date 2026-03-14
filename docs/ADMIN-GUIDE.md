# Three Squares — Admin Guide

**For:** Olivia (Liv) and Marie Guerrero, B&G Pacific  
**Last updated:** March 14, 2026  
**Support:** Leon Shimizu (671-483-0219)

---

## Table of Contents

1. [Logging In](#1-logging-in)
2. [Dashboard Overview](#2-dashboard-overview)
3. [Managing the Menu (Products)](#3-managing-the-menu-products)
4. [Managing Categories](#4-managing-categories)
5. [Processing Orders](#5-processing-orders)
6. [Settings & Configuration](#6-settings--configuration)
7. [Managing Staff Accounts](#7-managing-staff-accounts)
8. [POS Mode (Counter Orders)](#8-pos-mode-counter-orders)
9. [Common Tasks — Quick Reference](#9-common-tasks--quick-reference)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Logging In

**Website:** https://threesquaresgrill.com *(after domain transfer)* or https://three-squares-web.netlify.app

1. Click **Sign In** in the top-right corner
2. Enter your email address and password
3. You'll land on the **Admin Dashboard** automatically if your account has admin access

> **First time?** Leon will set up your admin account before the training week. You'll receive an email to set your password.

---

## 2. Dashboard Overview

After signing in as admin, you'll see the **Admin Panel** accessible from the top navigation.

The admin panel has these main sections:

| Section | What it's for |
|---------|--------------|
| **Orders** | View and manage customer orders |
| **Menu** | Add/edit/remove products |
| **Categories** | Organize products into groups |
| **Settings** | Store hours, payment mode, announcements |
| **Staff** | Manage who has admin/staff access |
| **Reports** | Order history and revenue summaries |

---

## 3. Managing the Menu (Products)

### Viewing Products

Go to **Admin → Menu** to see all your products listed.

You can filter by:
- Category (e.g., Breakfast, Lunch, Beverages)
- Active / Inactive status

### Adding a New Product

1. Click **+ Add Product**
2. Fill in:
   - **Name** — e.g., "Spam Musubi"
   - **Description** — brief description (shows on the menu)
   - **Price** — e.g., `4.50`
   - **Category** — pick from existing categories
   - **Image** — upload a photo (JPG or PNG, max 5 MB)
3. Toggle **Active** to ON so it shows on the menu
4. Click **Save**

> **Tip:** Products with photos get more clicks. Take photos on your phone and upload directly.

### Editing a Product

1. Find the product in the list
2. Click the **pencil icon** (edit) next to it
3. Make your changes
4. Click **Save**

### Deactivating / Hiding a Product Temporarily

If an item is sold out or you want to hide it without deleting:
1. Click edit on the product
2. Toggle **Active** to OFF
3. Click **Save** — it disappears from the public menu immediately

> You can reactivate it anytime by toggling Active back to ON.

### Deleting a Product

1. Click the **trash icon** next to the product
2. Confirm deletion
3. ⚠️ Deleted products cannot be recovered. Use **Deactivate** if you might want it back later.

### Product Variants (Sizes / Options)

For products that come in multiple sizes or options (e.g., Small / Large):
1. In the product edit view, scroll to **Variants**
2. Click **+ Add Variant**
3. Enter the variant name (e.g., "Large") and its price
4. Save

Customers will see a dropdown to select their variant during checkout.

---

## 4. Managing Categories

Categories organize your menu (e.g., Breakfast, Lunch, Beverages, Catering).

### Adding a Category

1. Go to **Admin → Categories**
2. Click **+ Add Category**
3. Enter the **Name** and optionally a **Description**
4. Click **Save**

### Reordering Categories

Drag categories up or down to change the order they appear on the menu.

### Hiding a Category

Toggle a category to **Inactive** to hide all its products from the public menu at once. Useful for seasonal menus or when you close a section temporarily.

---

## 5. Processing Orders

### Viewing Incoming Orders

Go to **Admin → Orders** to see all orders, or watch for the order notification sound when a new order comes in.

Orders are color-coded by status:
- 🟡 **Pending** — just placed, awaiting confirmation
- 🔵 **Confirmed** — you've acknowledged it
- 🟢 **Ready** — food is ready for pickup/delivery
- ✅ **Completed** — picked up / fulfilled
- ❌ **Cancelled** — cancelled by customer or staff

### Confirming an Order

1. Click on the order to open it
2. Review the items and customer info
3. Click **Confirm Order** — customer receives a confirmation email/text
4. Start preparing the food

### Marking an Order Ready

When the food is ready:
1. Open the order
2. Click **Mark as Ready** — customer is notified their order is ready

### Completing an Order

When the customer picks up:
1. Open the order
2. Click **Complete**

### Cancelling an Order

If you need to cancel (e.g., item out of stock):
1. Open the order
2. Click **Cancel Order**
3. Enter a reason (optional but helpful for the customer)
4. The customer's payment is refunded automatically

> **Note:** Refunds may take 3-5 business days to appear on the customer's card statement.

### Filtering Orders

Use the filters to find orders by:
- Date range
- Status
- Customer name or order number

---

## 6. Settings & Configuration

Go to **Admin → Settings** to configure your store.

### Store Information

- **Store Name** — appears in the header and emails
- **Announcement Banner** — shows a colored banner at the top of the site (great for promotions, holiday hours, etc.)
  - Example: "We're open Christmas Eve 8 AM–2 PM!"
  - Turn it off by clearing the text

### Store Hours

Set your pickup/ordering hours for each day of the week. Customers cannot place orders outside these hours.

### Payment Mode

- **Live mode** — real payments (use this for actual business)
- **Test mode** — no real charges (for training/testing only)

> During the training week, we'll use **test mode**. Leon will switch it to **Live mode** before the official launch.

### Storefronts

The app has multiple "storefronts" — think of these as separate sections:
- **Donki** — main online ordering
- **Catering** — catering/platter orders
- **Latte Stone Cookies** — currently disabled

To enable or disable a storefront:
1. Go to Settings → Storefronts
2. Toggle the storefront on/off
3. Click Save — changes take effect within 2 minutes for all visitors

### Email Notifications

Configure which events trigger automatic emails:
- New order received
- Order confirmed
- Order ready for pickup
- Order cancelled

We recommend keeping all notifications on.

---

## 7. Managing Staff Accounts

### Adding a Staff Member

1. Go to **Admin → Staff**
2. Click **+ Add Staff Member**
3. Enter their email address
4. Select their role:
   - **Admin** — full access to everything
   - **Staff** — can process orders and use POS, but cannot edit settings or menu
5. They'll receive an invitation email to create their account

### Removing a Staff Member

1. Go to **Admin → Staff**
2. Find the person
3. Click **Remove** — they immediately lose access

---

## 8. POS Mode (Counter Orders)

POS (Point of Sale) mode is for taking orders at the counter in person.

### Opening POS Mode

1. From the admin panel, click **POS Mode** in the navigation
2. The screen switches to a full-screen order-taking interface

### Taking an In-Person Order

1. Browse the menu or search for items
2. Tap items to add them to the cart
3. Adjust quantities as needed
4. When the customer is ready to pay:
   - **Cash:** Select "Cash" — enter amount tendered → calculate change
   - **Card (manual):** Select "Card (Manual)" — charge the card on your card reader
5. Confirm the order — it enters the system just like an online order

### Exiting POS Mode

Click the **X** or **Exit POS** button to return to the regular admin panel.

---

## 9. Common Tasks — Quick Reference

| Task | Where to Go |
|------|------------|
| See today's orders | Admin → Orders → filter by Today |
| Add a new menu item | Admin → Menu → + Add Product |
| Temporarily hide an item | Admin → Menu → Edit → toggle Active OFF |
| Change store hours | Admin → Settings → Store Hours |
| Post an announcement | Admin → Settings → Announcement Banner |
| Add a staff member | Admin → Staff → + Add Staff Member |
| Disable a storefront | Admin → Settings → Storefronts → toggle off |
| Cancel and refund an order | Admin → Orders → open order → Cancel |
| Switch to POS mode | Admin → POS Mode |

---

## 10. Troubleshooting

### "I can't log in"
- Double-check your email and password
- Click **Forgot Password** to reset
- If still stuck, contact Leon at 671-483-0219

### "A product isn't showing on the menu"
1. Check that the product is set to **Active** (Admin → Menu)
2. Check that its **Category** is also Active
3. Check that the **Storefront** for that product is enabled (Admin → Settings → Storefronts)

### "A customer says their order disappeared"
- Check Admin → Orders — use the search box with their name or email
- Look in **Cancelled** status — the order may have been auto-cancelled
- Contact Leon if you can't find it

### "Payments aren't going through"
- Verify the store is in **Live mode** (not Test mode) in Settings
- If test mode is on, no real payments will be processed
- Contact Leon to switch to live mode

### "The site looks different / announcement isn't showing"
- Announcement changes may take up to 2 minutes to appear for all visitors
- Try hard-refreshing: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

---

*For urgent issues during business hours: call Leon at 671-483-0219*  
*For non-urgent issues: text or email leon@shimizu-technology.com*
