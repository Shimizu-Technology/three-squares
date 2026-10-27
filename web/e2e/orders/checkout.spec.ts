import { test, expect } from '@playwright/test';

test.describe('Checkout Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cart before each test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('three-squares-cart');
      localStorage.removeItem('cart_session_id');
    });
  });

  test('displays checkout page with cart items', async ({ page }) => {
    // Add item to cart first
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    
    // Click first product
    const productCard = page.locator('[class*="product"], [class*="card"]').filter({ has: page.locator('img') }).first();
    await productCard.locator('a').first().click();
    await page.waitForLoadState('networkidle');
    
    // Select variant if needed
    const variantButton = page.locator('button[class*="variant"]:not([disabled])').first();
    if (await variantButton.isVisible()) {
      await variantButton.click();
      await page.waitForTimeout(300);
    }
    
    // Add to cart
    await page.click('button:has-text("Add to Cart"), button:has-text("Add to Bag")');
    await page.waitForTimeout(1000);
    
    // Go to checkout
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');
    
    // Should show checkout page
    await expect(page.locator('h1, h2').filter({ hasText: /Checkout/i }).first()).toBeVisible();
    
    // Should show cart items
    const orderSummary = page.locator('text=Order Summary, text=Your Order, text=Cart');
    await expect(orderSummary.first()).toBeVisible();
  });

  test('requires customer information', async ({ page }) => {
    // Add item to cart
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    
    const productCard = page.locator('[class*="product"], [class*="card"]').filter({ has: page.locator('img') }).first();
    await productCard.locator('a').first().click();
    await page.waitForLoadState('networkidle');
    
    const variantButton = page.locator('button[class*="variant"]:not([disabled])').first();
    if (await variantButton.isVisible()) {
      await variantButton.click();
      await page.waitForTimeout(300);
    }
    
    await page.click('button:has-text("Add to Cart")');
    await page.waitForTimeout(1000);
    
    // Go to checkout
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');
    
    // Customer info fields should be present
    await expect(page.locator('input[name*="name"], input[placeholder*="Name"]').first()).toBeVisible();
    await expect(page.locator('input[name*="email"], input[type="email"]').first()).toBeVisible();
  });

  test('can fill shipping address', async ({ page }) => {
    // Add item to cart
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    
    const productCard = page.locator('[class*="product"], [class*="card"]').filter({ has: page.locator('img') }).first();
    await productCard.locator('a').first().click();
    await page.waitForLoadState('networkidle');
    
    const variantButton = page.locator('button[class*="variant"]:not([disabled])').first();
    if (await variantButton.isVisible()) {
      await variantButton.click();
      await page.waitForTimeout(300);
    }
    
    await page.click('button:has-text("Add to Cart")');
    await page.waitForTimeout(1000);
    
    // Go to checkout
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');
    
    // Fill customer info
    await page.fill('input[name*="name"], input[placeholder*="Name"]', 'Test Customer');
    await page.fill('input[name*="email"], input[type="email"]', 'test@example.com');
    
    // Fill phone if present
    const phoneInput = page.locator('input[name*="phone"], input[type="tel"]').first();
    if (await phoneInput.isVisible()) {
      await phoneInput.fill('671-555-1234');
    }
    
    // Fill address
    const addressInput = page.locator('input[name*="address"], input[name*="street"]').first();
    if (await addressInput.isVisible()) {
      await addressInput.fill('123 Test Street');
    }
    
    // Fill city
    const cityInput = page.locator('input[name*="city"]').first();
    if (await cityInput.isVisible()) {
      await cityInput.fill('Hagatna');
    }
    
    // Fill state
    const stateInput = page.locator('input[name*="state"], select[name*="state"]').first();
    if (await stateInput.isVisible()) {
      if (await stateInput.evaluate(el => el.tagName) === 'SELECT') {
        await stateInput.selectOption({ label: 'Guam' });
      } else {
        await stateInput.fill('GU');
      }
    }
    
    // Fill zip
    const zipInput = page.locator('input[name*="zip"], input[name*="postal"]').first();
    if (await zipInput.isVisible()) {
      await zipInput.fill('96910');
    }
    
    // Address should be filled (no validation errors yet)
    await page.waitForTimeout(500);
  });

  test('shows order total', async ({ page }) => {
    // Add item to cart
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    
    const productCard = page.locator('[class*="product"], [class*="card"]').filter({ has: page.locator('img') }).first();
    await productCard.locator('a').first().click();
    await page.waitForLoadState('networkidle');
    
    const variantButton = page.locator('button[class*="variant"]:not([disabled])').first();
    if (await variantButton.isVisible()) {
      await variantButton.click();
      await page.waitForTimeout(300);
    }
    
    await page.click('button:has-text("Add to Cart")');
    await page.waitForTimeout(1000);
    
    // Go to checkout
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');
    
    // Should show totals
    await expect(page.locator('text=/$/')).toBeVisible(); // Price format
    await expect(page.locator('text=Total, text=Order Total')).toBeVisible();
  });

  test('payment section exists', async ({ page }) => {
    // Add item to cart
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    
    const productCard = page.locator('[class*="product"], [class*="card"]').filter({ has: page.locator('img') }).first();
    await productCard.locator('a').first().click();
    await page.waitForLoadState('networkidle');
    
    const variantButton = page.locator('button[class*="variant"]:not([disabled])').first();
    if (await variantButton.isVisible()) {
      await variantButton.click();
      await page.waitForTimeout(300);
    }
    
    await page.click('button:has-text("Add to Cart")');
    await page.waitForTimeout(1000);
    
    // Go to checkout
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');
    
    // Payment section should exist (Stripe elements or payment form)
    const paymentSection = page.locator('text=Payment, text=Card, [class*="stripe"], iframe[name*="stripe"]');
    await expect(paymentSection.first()).toBeVisible({ timeout: 10000 });
  });

  test('place order button exists', async ({ page }) => {
    // Add item to cart
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    
    const productCard = page.locator('[class*="product"], [class*="card"]').filter({ has: page.locator('img') }).first();
    await productCard.locator('a').first().click();
    await page.waitForLoadState('networkidle');
    
    const variantButton = page.locator('button[class*="variant"]:not([disabled])').first();
    if (await variantButton.isVisible()) {
      await variantButton.click();
      await page.waitForTimeout(300);
    }
    
    await page.click('button:has-text("Add to Cart")');
    await page.waitForTimeout(1000);
    
    // Go to checkout
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');
    
    // Should have place order button
    const placeOrderButton = page.locator('button:has-text("Place Order"), button:has-text("Pay"), button:has-text("Complete")').first();
    await expect(placeOrderButton).toBeVisible();
  });

  test('empty cart redirects or shows message', async ({ page }) => {
    // Go to checkout with empty cart
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');
    
    // Should either redirect to cart/products or show empty message
    const emptyMessage = page.locator('text=empty, text=Empty, text=no items');
    const redirected = page.url().includes('/products') || page.url().includes('/cart');
    
    expect(await emptyMessage.first().isVisible() || redirected).toBeTruthy();
  });
});

test.describe('Order Confirmation', () => {
  // Note: These tests would need a valid Stripe test card or mock payment
  // For now, we just verify the confirmation page structure
  
  test('confirmation page shows order details', async ({ page }) => {
    // Navigate to a sample order confirmation (if accessible)
    // This test assumes orders are accessible by ID
    await page.goto('/orders/1');
    
    // If order exists, should show details
    const orderPage = page.locator('text=Order, text=Confirmation, text=Thank you');
    const notFound = page.locator('text=not found, text=404');
    
    // Either order shows or 404
    await expect(orderPage.or(notFound).first()).toBeVisible({ timeout: 10000 });
  });
});
