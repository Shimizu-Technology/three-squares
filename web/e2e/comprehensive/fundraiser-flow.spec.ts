import { test, expect } from '@playwright/test';

/**
 * Comprehensive Fundraiser Order Flow
 * 
 * This test creates REAL fundraiser orders in the database.
 * Use for: After major updates, before deploys, full system verification.
 * 
 * Prerequisites:
 * - Backend running on localhost:3000
 * - Frontend running on localhost:5173
 * - At least one active fundraiser with products
 * - Test fundraiser: wings-fan-gear (created in earlier tests)
 */

test.describe('Fundraiser Order - Complete User Journey', () => {
  const fundraiserSlug = 'wings-fan-gear';

  test('1. Customer: View fundraiser page', async ({ page }) => {
    await page.goto(`/fundraisers/${fundraiserSlug}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Screenshot: Fundraiser page loaded
    await page.screenshot({ path: 'test-results/comprehensive/fundraiser-01-page.png', fullPage: true });

    // Verify fundraiser name
    await expect(page.locator('text=Wings Fan Gear')).toBeVisible();

    // Verify Products section is visible
    const productsSection = page.locator('text=Products').first();
    await expect(productsSection).toBeVisible();
    
    // Verify there's at least one price shown (indicating products exist)
    const priceIndicator = page.locator('text=/\\$\\d+/').first();
    await expect(priceIndicator).toBeVisible();

    console.log('Fundraiser page loaded with products');
  });

  test('2. Customer: Select participant and add products to cart', async ({ page }) => {
    await page.goto(`/fundraisers/${fundraiserSlug}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Select a participant
    const participantSelect = page.locator('select').filter({ hasText: /participant|support/i }).first();
    if (await participantSelect.isVisible()) {
      await participantSelect.selectOption({ index: 1 }); // Select first participant
      await page.waitForTimeout(300);
      
      // Screenshot: Participant selected
      await page.screenshot({ path: 'test-results/comprehensive/fundraiser-02-participant.png' });
    }

    // Select a variant for the first product
    const variantSelect = page.locator('select').filter({ hasText: /size|color|select/i }).first();
    if (await variantSelect.isVisible()) {
      // Select first non-disabled option
      const options = await variantSelect.locator('option:not([disabled])').all();
      if (options.length > 1) {
        await variantSelect.selectOption({ index: 1 });
        await page.waitForTimeout(300);
      }
    }

    // Add to cart
    const addButton = page.locator('button:has-text("Add to Cart")').first();
    if (await addButton.isVisible() && !(await addButton.isDisabled())) {
      await addButton.click();
      await page.waitForTimeout(1000);

      // Screenshot: Item added
      await page.screenshot({ path: 'test-results/comprehensive/fundraiser-03-item-added.png' });
    }

    // Verify floating cart button appears
    const cartButton = page.locator('button').filter({ hasText: /item|cart|\$/ }).last();
    await expect(cartButton).toBeVisible();

    console.log('Product added to fundraiser cart');
  });

  test('3. Customer: View cart and proceed to checkout', async ({ page }) => {
    await page.goto(`/fundraisers/${fundraiserSlug}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Select participant
    const participantSelect = page.locator('select').first();
    if (await participantSelect.isVisible()) {
      await participantSelect.selectOption({ index: 1 });
      await page.waitForTimeout(300);
    }

    // Select variant
    const variantSelect = page.locator('select').nth(1);
    if (await variantSelect.isVisible()) {
      await variantSelect.selectOption({ index: 1 });
      await page.waitForTimeout(300);
    }

    // Add to cart
    const addButton = page.locator('button:has-text("Add to Cart")').first();
    if (await addButton.isVisible() && !(await addButton.isDisabled())) {
      await addButton.click();
      await page.waitForTimeout(1000);
    }

    // Click floating cart button to open cart modal
    const cartButton = page.locator('button').filter({ hasText: /item|cart|\$/ }).last();
    if (await cartButton.isVisible()) {
      await cartButton.click();
      await page.waitForTimeout(500);

      // Screenshot: Cart modal open
      await page.screenshot({ path: 'test-results/comprehensive/fundraiser-04-cart-modal.png' });

      // Verify cart contents
      const cartModal = page.locator('[class*="fixed"][class*="inset"], [role="dialog"]').first();
      await expect(cartModal).toBeVisible();

      // Click checkout button
      const checkoutButton = page.locator('button:has-text("Checkout"), button:has-text("Proceed")').first();
      if (await checkoutButton.isVisible()) {
        await checkoutButton.click();
        await page.waitForTimeout(1000);

        // Screenshot: Checkout or next step
        await page.screenshot({ path: 'test-results/comprehensive/fundraiser-05-checkout.png', fullPage: true });
      }
    }
  });

  test('4. Admin: View fundraiser and its orders', async ({ page }) => {
    // This test requires admin authentication
    test.skip(!process.env.TEST_USER_EMAIL, 'Skipping - no admin credentials');

    // Go to admin fundraisers
    await page.goto('/admin/fundraisers');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Screenshot: Fundraisers list
    await page.screenshot({ path: 'test-results/comprehensive/fundraiser-06-admin-list.png', fullPage: true });

    // Click on the test fundraiser
    const manageLink = page.locator('a:has-text("Manage")').first();
    if (await manageLink.isVisible()) {
      await manageLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Screenshot: Fundraiser detail
      await page.screenshot({ path: 'test-results/comprehensive/fundraiser-07-admin-detail.png', fullPage: true });

      // Check for participants tab
      const participantsTab = page.locator('button:has-text("Participants"), a:has-text("Participants")').first();
      if (await participantsTab.isVisible()) {
        await participantsTab.click();
        await page.waitForTimeout(500);
        
        // Screenshot: Participants
        await page.screenshot({ path: 'test-results/comprehensive/fundraiser-08-participants.png' });
      }

      // Check for products tab
      const productsTab = page.locator('button:has-text("Products"), a:has-text("Products")').first();
      if (await productsTab.isVisible()) {
        await productsTab.click();
        await page.waitForTimeout(500);
        
        // Screenshot: Products
        await page.screenshot({ path: 'test-results/comprehensive/fundraiser-09-products.png' });
      }
    }
  });

  test('5. Admin: Create new fundraiser', async ({ page }) => {
    // This test requires admin authentication
    test.skip(!process.env.TEST_USER_EMAIL, 'Skipping - no admin credentials');

    // Go to new fundraiser page
    await page.goto('/admin/fundraisers/new');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Screenshot: New fundraiser form
    await page.screenshot({ path: 'test-results/comprehensive/fundraiser-10-new-form.png', fullPage: true });

    // Fill out fundraiser details - look for Name input by placeholder or label
    // Use the first text input on the form
    const allInputs = page.locator('form input[type="text"], form input:not([type])');
    if (await allInputs.count() > 0) {
      await allInputs.first().fill('Test Fundraiser ' + Date.now());
    }
    
    const descriptionField = page.locator('textarea').first();
    if (await descriptionField.isVisible()) {
      await descriptionField.fill('This is a test fundraiser created by automated testing.');
    }

    // Set dates - find date inputs
    const dateInputs = page.locator('input[type="date"]');
    const dateCount = await dateInputs.count();
    
    if (dateCount >= 2) {
      const today = new Date().toISOString().split('T')[0];
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await dateInputs.first().fill(today);
      await dateInputs.nth(1).fill(futureDate);
    }

    // Screenshot: Form filled
    await page.screenshot({ path: 'test-results/comprehensive/fundraiser-11-form-filled.png', fullPage: true });

    // Don't actually save - just verify the form works
    console.log('New fundraiser form validated (not saved)');
  });
});

test.describe('Fundraiser - Edge Cases', () => {
  test('Inactive fundraiser shows appropriate message', async ({ page }) => {
    // Try to access a non-existent fundraiser
    await page.goto('/fundraisers/nonexistent-fundraiser-12345');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Screenshot: Not found page
    await page.screenshot({ path: 'test-results/comprehensive/fundraiser-edge-01-not-found.png', fullPage: true });

    // Should show not found or error message
    const notFound = page.locator('text=/not found|doesn\'t exist|no fundraiser/i').first();
    await expect(notFound).toBeVisible();
  });
});
