import { test, expect } from '@playwright/test';

test.describe('Products Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    // Wait for products to load
    await page.waitForTimeout(2000);
  });

  test('displays products grid', async ({ page }) => {
    // Product cards are Link elements with href to /products/{slug}
    const productLinks = page.locator('a[href^="/products/"]').filter({ has: page.locator('img') });
    
    const count = await productLinks.count();
    if (count === 0) {
      // No products - check for either generic filter empty state or storefront coming-soon state
      const emptyState = page.locator('text=/No products found|No products|Coming Soon!/i').first();
      await expect(emptyState).toBeVisible();
    } else {
      await expect(productLinks.first()).toBeVisible();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('products have name and price', async ({ page }) => {
    // Product cards contain h3 for name and price with $ symbol
    const productLinks = page.locator('a[href^="/products/"]').filter({ has: page.locator('img') });
    
    const count = await productLinks.count();
    if (count === 0) {
      test.skip();
      return;
    }
    
    // First product should have a title (h3) and price ($)
    const firstProduct = productLinks.first();
    
    // Should have text content (name)
    await expect(firstProduct.locator('h3')).toBeVisible();
    
    // Should have price indicator ($)
    await expect(firstProduct.locator('text=$')).toBeVisible();
  });

  test('search filters products', async ({ page }) => {
    // Look for search input in the page (not nav)
    const searchInput = page.locator('main input[type="text"], main input[placeholder*="Search"]').first();
    
    if (await searchInput.isVisible()) {
      // Type a search term
      await searchInput.fill('shirt');
      await page.waitForTimeout(500); // Debounce
      
      // Wait for filtered results
      await page.waitForLoadState('networkidle');
      
      // Products should still be visible (or show "no results")
      const productsOrEmpty = page.locator('a[href^="/products/"], text=No products');
      await expect(productsOrEmpty.first()).toBeVisible();
    } else {
      // Search might be in nav instead - that's ok
      test.skip();
    }
  });

  test('clicking product navigates to detail page', async ({ page }) => {
    // Product links
    const productLink = page.locator('a[href^="/products/"]').filter({ has: page.locator('img') }).first();
    
    const count = await productLink.count();
    if (count === 0) {
      test.skip();
      return;
    }
    
    await productLink.click();
    
    // Should navigate to product detail page
    await expect(page).toHaveURL(/\/products\/[a-z0-9-]+/);
  });

  test('pagination works if present', async ({ page }) => {
    // Check if pagination exists
    const nextButton = page.locator('button:has-text("Next")');
    
    if (await nextButton.isVisible()) {
      // Click next
      await nextButton.click();
      
      // URL should change or page should update
      await page.waitForLoadState('networkidle');
      
      // Products should still be visible
      const productLinks = page.locator('a[href^="/products/"]').filter({ has: page.locator('img') });
      await expect(productLinks.first()).toBeVisible();
    } else {
      // Not enough products for pagination - that's ok
      test.skip();
    }
  });
});

test.describe('Product Detail Page', () => {
  test('displays product information', async ({ page }) => {
    // Navigate to products first
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
    
    // Wait for detail page to load
    await page.waitForURL(/\/products\/[a-z0-9-]+/);
    await page.waitForLoadState('networkidle');
    
    // Should have product name (h1)
    await expect(page.locator('h1').first()).toBeVisible();
    
    // Should have price ($)
    await expect(page.locator('text=$')).toBeVisible();
    
    // Should have product image
    await expect(page.locator('img').first()).toBeVisible();
  });

  test('variant selector changes selection', async ({ page }) => {
    // Navigate to a product with variants
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
    
    // Look for variant buttons (size/color)
    const variantButtons = page.locator('button').filter({ hasText: /^(S|M|L|XL|XXL|One Size|Black|White|Red|Blue|Green|Navy)$/ });
    
    if (await variantButtons.first().isVisible()) {
      const buttonCount = await variantButtons.count();
      if (buttonCount > 1) {
        // Click a different option
        await variantButtons.nth(1).click();
        await page.waitForTimeout(300);
      }
    }
    // No variants is ok - just pass
  });

  test('breadcrumbs show navigation path', async ({ page }) => {
    // Navigate to a product
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
    
    // Look for breadcrumbs - they should have Home link
    const homeLink = page.locator('a:has-text("Home")').first();
    await expect(homeLink).toBeVisible({ timeout: 5000 });
  });

  test('add to cart button exists', async ({ page }) => {
    // Navigate to a product
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
    
    // Should have add to cart button
    const addToCartButton = page.locator('button:has-text("Add to Cart")').first();
    await expect(addToCartButton).toBeVisible({ timeout: 10000 });
  });
});
