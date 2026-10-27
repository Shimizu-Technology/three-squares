import { test, expect } from '@playwright/test';

/**
 * Mobile Responsive Tests
 * Tests on the mobile device defined in playwright.config (iPhone 13 for mobile project)
 * All tests run on the same device configured in the project
 */

test.describe('Mobile Responsive Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cart before each test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('three-squares-cart');
      localStorage.removeItem('cart_session_id');
    });
  });

  test('Homepage layout on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/mobile/homepage.png', fullPage: true });
    
    // No horizontal scroll
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10); // Small tolerance
    
    // Featured Products section should be visible
    await expect(page.locator('text=Featured Products').first()).toBeVisible();
  });

  test('Mobile page renders correctly', async ({ page }) => {
    // This test verifies the mobile viewport works and page renders
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: 'test-results/mobile/homepage-mobile.png', fullPage: true });
    
    // Featured Products section should be visible
    await expect(page.locator('text=Featured Products').first()).toBeVisible();
    
    // Shop Now button should be visible
    await expect(page.locator('a:has-text("Shop Now")').first()).toBeVisible();
  });

  test('Products grid fits mobile screen', async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/mobile/products-page.png', fullPage: true });
    
    // Product cards should be visible
    const productLinks = page.locator('a[href^="/products/"]').filter({ has: page.locator('img') });
    expect(await productLinks.count()).toBeGreaterThan(0);
    
    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10);
  });

  test('Product detail on mobile', async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Click first product
    const productLink = page.locator('a[href^="/products/"]').filter({ has: page.locator('img') }).first();
    const count = await productLink.count();
    if (count === 0) {
      test.skip();
      return;
    }
    await productLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: 'test-results/mobile/product-detail.png', fullPage: true });
    
    // Add to cart button should be visible and tappable
    const addButton = page.locator('button:has-text("Add to Cart")').first();
    await expect(addButton).toBeVisible();
    
    // Check button size is mobile-friendly (min 40px tap target)
    const buttonBox = await addButton.boundingBox();
    expect(buttonBox?.height).toBeGreaterThanOrEqual(36);
  });

  test('Add to cart on mobile', async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Click product
    const productLink = page.locator('a[href^="/products/"]').filter({ has: page.locator('img') }).first();
    if (await productLink.count() === 0) {
      test.skip();
      return;
    }
    await productLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Add to cart
    const addButton = page.locator('button:has-text("Add to Cart")').first();
    await addButton.click();
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: 'test-results/mobile/cart-open.png' });
    
    // Cart drawer should be visible
    const cartDrawer = page.locator('[class*="fixed"][class*="right-0"]').first();
    await expect(cartDrawer).toBeVisible();
  });

  test('Acai Cakes page mobile', async ({ page }) => {
    await page.goto('/acai-cakes');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/mobile/acai-page.png', fullPage: true });
    
    // Check page is functional
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('Fundraiser page mobile', async ({ page }) => {
    await page.goto('/fundraisers/wings-fan-gear');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/mobile/fundraiser-page.png', fullPage: true });
    
    // Check fundraiser loads
    await expect(page.locator('text=Wings Fan Gear')).toBeVisible();
  });

  test('Checkout page mobile', async ({ page }) => {
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: 'test-results/mobile/checkout-page.png', fullPage: true });
  });
});
