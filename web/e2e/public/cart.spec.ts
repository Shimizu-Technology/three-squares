import { test, expect } from '@playwright/test';

test.describe('Shopping Cart', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing cart state
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('three-squares-cart');
      localStorage.removeItem('cart_session_id');
    });
    await page.reload();
  });

  test('cart icon is visible', async ({ page }) => {
    // Cart icon should be visible in the nav
    // CartIcon component renders a button with svg
    const cartButton = page.locator('nav button:has(svg)').first();
    await expect(cartButton).toBeVisible();
  });

  test('can navigate to products and view product detail', async ({ page }) => {
    // Navigate to products
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    
    // Wait for products to load
    await page.waitForTimeout(2000);
    
    // Click on a product (Link elements with href starting with /products/)
    const productLink = page.locator('a[href^="/products/"]').filter({ has: page.locator('img') }).first();
    
    // Check if any products exist
    const count = await productLink.count();
    if (count === 0) {
      // No products in database - skip this test
      test.skip();
      return;
    }
    
    await productLink.click();
    await page.waitForLoadState('networkidle');
    
    // Should be on a product detail page
    await expect(page).toHaveURL(/\/products\/.+/);
    
    // Product title should be visible
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('product detail page has add to cart button', async ({ page }) => {
    // Navigate to products
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Click on a product
    const productLink = page.locator('a[href^="/products/"]').filter({ has: page.locator('img') }).first();
    const count = await productLink.count();
    if (count === 0) {
      test.skip();
      return;
    }
    
    await productLink.click();
    await page.waitForLoadState('networkidle');
    
    // Should have an Add to Cart button
    const addToCartButton = page.locator('button:has-text("Add to Cart"), button:has-text("Add to Bag")').first();
    await expect(addToCartButton).toBeVisible({ timeout: 10000 });
  });

  test('can add product to cart', async ({ page }) => {
    // Navigate to products
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Click on a product
    const productLink = page.locator('a[href^="/products/"]').filter({ has: page.locator('img') }).first();
    const count = await productLink.count();
    if (count === 0) {
      test.skip();
      return;
    }
    
    await productLink.click();
    await page.waitForLoadState('networkidle');
    
    // Wait for variant buttons to load if any
    await page.waitForTimeout(1000);
    
    // Select a variant if needed (look for size/color buttons)
    const variantButtons = page.locator('button').filter({ hasText: /^(S|M|L|XL|XXL|One Size|Black|White|Red|Blue|Green|Navy)$/ });
    if (await variantButtons.first().isVisible()) {
      await variantButtons.first().click();
      await page.waitForTimeout(300);
    }
    
    // Add to cart
    const addToCartButton = page.locator('button:has-text("Add to Cart")').first();
    await expect(addToCartButton).toBeVisible({ timeout: 10000 });
    await addToCartButton.click();
    
    // Wait for cart update - cart drawer should open or toast should appear
    await page.waitForTimeout(1000);
    
    // Cart drawer should be visible (look for fixed/overlay element with cart items)
    const cartDrawer = page.locator('[class*="fixed"][class*="right-0"], [class*="drawer"]');
    await expect(cartDrawer.first()).toBeVisible({ timeout: 5000 });
  });

  test('cart drawer shows checkout button', async ({ page }) => {
    // Add an item to cart first
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const productLink = page.locator('a[href^="/products/"]').filter({ has: page.locator('img') }).first();
    const count = await productLink.count();
    if (count === 0) {
      test.skip();
      return;
    }
    
    await productLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Select variant if needed
    const variantButtons = page.locator('button').filter({ hasText: /^(S|M|L|XL|XXL|One Size)$/ });
    if (await variantButtons.first().isVisible()) {
      await variantButtons.first().click();
      await page.waitForTimeout(300);
    }
    
    // Add to cart
    const addToCartButton = page.locator('button:has-text("Add to Cart")').first();
    if (await addToCartButton.isVisible()) {
      await addToCartButton.click();
      await page.waitForTimeout(1000);
    } else {
      test.skip();
      return;
    }
    
    // Checkout button should be visible in cart drawer
    const checkoutButton = page.locator('button:has-text("Checkout"), a:has-text("Checkout")').first();
    await expect(checkoutButton).toBeVisible({ timeout: 5000 });
  });
});
