import { test } from '@playwright/test';

/**
 * Customer Account Tests
 * 
 * Tests signed-in customer (non-admin) flows:
 * - Order history viewing
 * - Profile management
 * - Account settings
 * 
 * Note: Uses admin auth but tests customer-facing pages
 * In a production setup, you'd have a separate customer test account
 */

test.describe('Customer Account - Order History', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('View order history page', async ({ page }) => {
    // Navigate to orders/account page
    await page.goto('/account/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Screenshot: Order history page
    await page.screenshot({ path: 'test-results/comprehensive/customer-01-order-history.png', fullPage: true });

    // Check if page loads (might be empty or have orders)
    const pageContent = await page.content();
    const hasOrders = pageContent.includes('HAF-') || pageContent.includes('Order');
    const hasEmptyState = pageContent.toLowerCase().includes('no orders') || pageContent.toLowerCase().includes('empty');
    
    console.log(`Order history: ${hasOrders ? 'Has orders' : hasEmptyState ? 'Empty state shown' : 'Page loaded'}`);
  });

  test('View individual order details', async ({ page }) => {
    await page.goto('/account/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for an order to click on
    const orderLink = page.locator('a[href*="/orders/"], tr:has-text("HAF-"), button:has-text("View")').first();
    
    if (await orderLink.isVisible()) {
      await orderLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Screenshot: Order detail
      await page.screenshot({ path: 'test-results/comprehensive/customer-02-order-detail.png', fullPage: true });

      // Verify order details are shown
      const orderNumber = page.locator('text=/HAF-[RAW]-\\d+/').first();
      if (await orderNumber.isVisible()) {
        console.log('Order detail page loaded successfully');
      }
    } else {
      console.log('No orders found to view - skipping detail test');
      await page.screenshot({ path: 'test-results/comprehensive/customer-02-no-orders.png', fullPage: true });
    }
  });

  test('Track order status', async ({ page }) => {
    await page.goto('/account/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for status indicators
    const statusBadges = page.locator('span, div').filter({ 
      hasText: /pending|processing|shipped|delivered|ready|completed/i 
    });
    
    const statusCount = await statusBadges.count();
    console.log(`Found ${statusCount} status indicators`);

    // Screenshot: Order statuses
    await page.screenshot({ path: 'test-results/comprehensive/customer-03-order-status.png', fullPage: true });
  });
});

test.describe('Customer Account - Profile Management', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('View profile page', async ({ page }) => {
    // Try different possible profile URLs
    const profileUrls = ['/account', '/account/profile', '/profile', '/settings'];
    
    for (const url of profileUrls) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      
      // Check if we found a profile page (not 404 or redirect to home)
      const isProfilePage = !page.url().endsWith('/') && 
                           !page.url().includes('404') &&
                           (await page.content()).toLowerCase().includes('profile') ||
                           (await page.content()).toLowerCase().includes('account') ||
                           (await page.content()).toLowerCase().includes('email');
      
      if (isProfilePage) {
        console.log(`Profile page found at: ${url}`);
        await page.screenshot({ path: 'test-results/comprehensive/customer-04-profile.png', fullPage: true });
        break;
      }
    }
  });

  test('Access account via user button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click on user button (Clerk UserButton)
    const userButton = page.locator('[class*="cl-userButton"], button:has([class*="avatar"]), button:has(img[alt*="user"])').first();
    
    if (await userButton.isVisible()) {
      await userButton.click();
      await page.waitForTimeout(500);

      // Screenshot: User menu open
      await page.screenshot({ path: 'test-results/comprehensive/customer-05-user-menu.png' });

      // Look for account/profile options
      const accountOption = page.locator('button:has-text("Account"), a:has-text("Account"), button:has-text("Profile")').first();
      if (await accountOption.isVisible()) {
        console.log('Account option found in user menu');
      }
    } else {
      console.log('User button not found - user may not be signed in');
    }
  });
});

test.describe('Customer Account - Saved Information', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('View saved addresses (if available)', async ({ page }) => {
    await page.goto('/account/addresses');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Screenshot: Addresses page
    await page.screenshot({ path: 'test-results/comprehensive/customer-06-addresses.png', fullPage: true });

    // Check for address content or empty state
    const hasAddresses = (await page.content()).includes('street') || 
                         (await page.content()).includes('address') ||
                         (await page.content()).includes('shipping');
    
    console.log(`Addresses page: ${hasAddresses ? 'Has content' : 'May be empty or not implemented'}`);
  });

  test('Checkout pre-fills saved info', async ({ page }) => {
    // Add an item to cart first
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const productLink = page.locator('a[href^="/products/"]').first();
    if (await productLink.isVisible()) {
      await productLink.click();
      await page.waitForLoadState('networkidle');
      
      // Select variant if needed
      const variantButton = page.locator('button').filter({ hasText: /^(S|M|L|XL)$/ }).first();
      if (await variantButton.isVisible()) {
        await variantButton.click();
        await page.waitForTimeout(300);
      }

      // Add to cart
      await page.locator('button:has-text("Add to Cart")').first().click();
      await page.waitForTimeout(1000);

      // Go to checkout
      await page.goto('/checkout');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Screenshot: Checkout with potentially pre-filled info
      await page.screenshot({ path: 'test-results/comprehensive/customer-07-checkout-prefill.png', fullPage: true });

      // Check if email is pre-filled (since user is signed in)
      const emailInput = page.locator('input[name="email"], input[type="email"]').first();
      if (await emailInput.isVisible()) {
        const emailValue = await emailInput.inputValue();
        console.log(`Email pre-filled: ${emailValue ? 'Yes' : 'No'}`);
      }
    }
  });
});
