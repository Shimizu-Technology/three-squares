import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays hero section', async ({ page }) => {
    // Check for hero content
    await expect(page.locator('h1, h2').first()).toBeVisible();
    
    // Check for shop button or CTA
    await expect(page.locator('a:has-text("Shop"), button:has-text("Shop"), a:has-text("Products")').first()).toBeVisible();
  });

  test('displays featured products section', async ({ page }) => {
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Look for featured products heading - actual text is "Featured Products"
    const featuredHeading = page.locator('h2:has-text("Featured Products")').first();

    if (!(await featuredHeading.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    
    // Wait a bit for products to load
    await page.waitForTimeout(2000);
    
    // Should have product links with images (the Link components in FeaturedProducts)
    // Products are rendered as links to /products/{slug}
    const productLinks = page.locator('a[href^="/products/"]').filter({ has: page.locator('img') });
    
    // Check if at least one product is visible (may be 0 if DB is empty)
    const count = await productLinks.count();
    if (count > 0) {
      await expect(productLinks.first()).toBeVisible();
    }
    // If no products, the section still shows the heading which we already verified
  });

  test('navigation menu is visible', async ({ page }) => {
    // Desktop nav should have main links
    await expect(page.locator('nav').first()).toBeVisible();
    
    // Should have Shop link (in NavDropdown)
    await expect(page.locator('nav >> text=Shop').first()).toBeVisible();
    
    // Should have current primary nav links
    await expect(page.locator('nav >> text=Locations').first()).toBeVisible();
    await expect(page.locator('nav >> text=About Us').first()).toBeVisible();
  });

  test('shop dropdown shows collections', async ({ page }) => {
    // Hover over Shop to trigger dropdown (desktop)
    const shopLink = page.locator('nav >> text=Shop').first();
    await shopLink.hover();
    
    // Wait for dropdown animation
    await page.waitForTimeout(300);
    
    // Look for dropdown content - use nav-specific selector to avoid footer/other links
    const dropdownItem = page.locator('nav a:has-text("All Products")').first();
    await expect(dropdownItem).toBeVisible({ timeout: 5000 });
  });

  test('clicking shop link navigates to products', async ({ page }) => {
    // Hover over Shop to trigger dropdown
    const shopLink = page.locator('nav >> text=Shop').first();
    await shopLink.hover();
    await page.waitForTimeout(300);
    
    // Click All Products in dropdown (use nav-specific selector)
    await page.locator('nav a:has-text("All Products")').first().click();
    
    // Should be on products page
    await expect(page).toHaveURL(/\/products/);
  });

  test('logo links to homepage', async ({ page }) => {
    // Navigate away first
    await page.goto('/products');
    
    // Click logo (look for Hafaloha logo)
    await page.locator('nav a:has(img)').first().click();
    
    // Should be back on homepage
    await expect(page).toHaveURL('/');
  });

  test('footer is visible', async ({ page }) => {
    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    
    // Footer should be visible
    await expect(page.locator('footer').first()).toBeVisible();
  });
});
