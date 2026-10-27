import { test, expect } from '@playwright/test';

/**
 * Visual Testing Suite with Screenshots
 * This suite captures screenshots at each step for manual review
 */

test.describe('Visual Inspection - Public Pages', () => {
  test('Homepage visual check', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take full page screenshot
    await page.screenshot({ path: 'test-results/visual/01-homepage-full.png', fullPage: true });
    
    // Check hero section
    await expect(page.locator('h1, h2').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/visual/02-homepage-hero.png' });
    
    // Scroll to featured products
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/visual/03-homepage-featured.png' });
    
    // Scroll to footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/visual/04-homepage-footer.png' });
  });

  test('Navigation dropdown visual check', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Hover on Shop to show dropdown
    const shopLink = page.locator('nav >> text=Shop').first();
    await shopLink.hover();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/visual/05-nav-dropdown-open.png' });
    
    // Check dropdown has collections
    const dropdownContent = page.locator('nav a:has-text("All Products")').first();
    await expect(dropdownContent).toBeVisible();
  });

  test('Products page visual check', async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/visual/06-products-page.png', fullPage: true });
    
    // Check product cards are visible
    const productLinks = page.locator('a[href^="/products/"]').filter({ has: page.locator('img') });
    const count = await productLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Product detail with breadcrumbs visual check', async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Click first product
    const productLink = page.locator('a[href^="/products/"]').filter({ has: page.locator('img') }).first();
    await productLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: 'test-results/visual/07-product-detail.png', fullPage: true });
    
    // Check breadcrumbs
    const homeLink = page.locator('a:has-text("Home")').first();
    await expect(homeLink).toBeVisible();
    
    // Check product info
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('Acai Cakes page visual check', async ({ page }) => {
    await page.goto('/acai-cakes');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/visual/08-acai-page.png', fullPage: true });
    
    // Check for base options
    await expect(page.locator('text=/Granola|Peanut Butter|Nutella/i').first()).toBeVisible();
  });

  test('Fundraiser page visual check', async ({ page }) => {
    await page.goto('/fundraisers/wings-fan-gear');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/visual/09-fundraiser-page.png', fullPage: true });
    
    // Check fundraiser name
    await expect(page.locator('text=Wings Fan Gear')).toBeVisible();
  });
});

test.describe('Visual Inspection - Full User Flow: Add to Cart & Checkout', () => {
  test('Complete shopping flow with screenshots', async ({ page }) => {
    // Clear cart first
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('three-squares-cart');
      localStorage.removeItem('cart_session_id');
    });
    await page.reload();
    
    // Step 1: Browse products
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/visual/flow-01-products-browse.png' });
    
    // Step 2: Click on a product
    const productLink = page.locator('a[href^="/products/"]').filter({ has: page.locator('img') }).first();
    await productLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/visual/flow-02-product-detail.png' });
    
    // Step 3: Select variant if available
    const variantButton = page.locator('button').filter({ hasText: /^(S|M|L|XL|One Size)$/ }).first();
    if (await variantButton.isVisible()) {
      await variantButton.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/visual/flow-03-variant-selected.png' });
    }
    
    // Step 4: Add to cart
    const addToCartButton = page.locator('button:has-text("Add to Cart")').first();
    await addToCartButton.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/visual/flow-04-cart-drawer-open.png' });
    
    // Step 5: View cart contents
    const cartDrawer = page.locator('[class*="fixed"][class*="right-0"]').first();
    await expect(cartDrawer).toBeVisible();
    await page.screenshot({ path: 'test-results/visual/flow-05-cart-contents.png' });
    
    // Step 6: Go to checkout
    const checkoutButton = page.locator('button:has-text("Checkout"), a:has-text("Checkout")').first();
    await checkoutButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/visual/flow-06-checkout-page.png', fullPage: true });
  });
});

test.describe('Visual Inspection - Edge Cases', () => {
  test('Empty cart state', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('three-squares-cart');
      localStorage.removeItem('cart_session_id');
    });
    await page.reload();
    await page.waitForTimeout(1000);
    
    // Click cart icon
    const cartButton = page.locator('nav button:has(svg)').first();
    await cartButton.click();
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'test-results/visual/edge-01-empty-cart.png' });
  });

  test('Products search with no results', async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    
    // Search for something that won't exist
    const searchInput = page.locator('input[placeholder*="Search"], input[type="text"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('xyznonexistent123');
      await page.waitForTimeout(500);
      
      // Click search or wait for auto-search
      const searchButton = page.locator('button:has-text("Search")');
      if (await searchButton.isVisible()) {
        await searchButton.click();
      }
      
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/visual/edge-02-no-search-results.png' });
    }
  });

  test('404 page', async ({ page }) => {
    await page.goto('/nonexistent-page-12345');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/visual/edge-03-404-page.png' });
  });
});

test.describe('Visual Inspection - Admin Pages', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('Admin dashboard visual check', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/visual/admin-01-dashboard.png', fullPage: true });
  });

  test('Admin products page with actions', async ({ page }) => {
    await page.goto('/admin/products');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/visual/admin-02-products-list.png', fullPage: true });
    
    // Open more actions menu
    const moreButton = page.locator('table button').filter({ has: page.locator('svg') }).first();
    if (await moreButton.isVisible()) {
      await moreButton.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/visual/admin-03-products-actions-menu.png' });
    }
  });

  test('Admin orders page visual check', async ({ page }) => {
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/visual/admin-04-orders-list.png', fullPage: true });
    
    // Open order details
    const viewButton = page.locator('button:has-text("View Details"), button:has-text("Details")').first();
    if (await viewButton.isVisible()) {
      await viewButton.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/visual/admin-05-order-detail-modal.png' });
    }
  });

  test('Admin fundraisers page visual check', async ({ page }) => {
    await page.goto('/admin/fundraisers');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/visual/admin-06-fundraisers-list.png', fullPage: true });
    
    // Click manage if available
    const manageLink = page.locator('a:has-text("Manage")').first();
    if (await manageLink.isVisible()) {
      await manageLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/visual/admin-07-fundraiser-detail.png', fullPage: true });
    }
  });

  test('Admin Acai settings visual check', async ({ page }) => {
    await page.goto('/admin/acai');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/visual/admin-08-acai-settings.png', fullPage: true });
  });
});
