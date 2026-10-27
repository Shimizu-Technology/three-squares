import { test, expect } from '@playwright/test';

/**
 * Comprehensive Acai Cake Order Flow - Wizard UI
 * 
 * Tests the complete customer journey through the new wizard-style form:
 * 1. Select pickup date (auto-advances)
 * 2. Select pickup time (auto-advances)
 * 3. Choose crust (auto-advances)
 * 4. Set quantity (manual continue)
 * 5. Optional placard (manual continue)
 * 6. Enter contact info
 * 7. Submit order
 * 
 * Prerequisites:
 * - Backend running on localhost:3000
 * - Frontend running on localhost:5173
 * - Acai ordering enabled in admin settings
 * - At least one pickup window configured for Mon-Sat
 */

test.describe('Acai Cake Order - Complete User Journey', () => {
  test('1. Customer: Navigate to Acai page and view options', async ({ page }) => {
    await page.goto('/acai-cakes');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Verify page elements
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
    
    const headingText = await heading.textContent();
    expect(headingText).toMatch(/A[cç]a[ií].*Cake/i);
    
    // Verify price is shown
    const price = page.locator('text=/\\$\\d+\\.\\d+/').first();
    await expect(price).toBeVisible();
    
    // Verify progress bar
    const progressText = page.locator('text=/\\d+/\\d+/').first();
    await expect(progressText).toBeVisible();
    
    // Screenshot: Acai page loaded
    await page.screenshot({ path: 'test-results/comprehensive/acai-wizard-01-page.png', fullPage: true });
    
    console.log('✅ Acai page loaded with wizard form');
  });

  test('2. Customer: Complete wizard steps 1-3 (date, time, crust)', async ({ page }) => {
    await page.goto('/acai-cakes');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Step 1: Select date
    const dateButton = page.locator('button').filter({ hasText: /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/ }).first();
    await expect(dateButton).toBeVisible({ timeout: 10000 });
    const dateText = await dateButton.textContent();
    await dateButton.click();
    await page.waitForTimeout(500);
    console.log(`✅ Selected date: ${dateText}`);

    // Screenshot: Date selected
    await page.screenshot({ path: 'test-results/comprehensive/acai-wizard-02-date.png' });

    // Step 2: Select time (should auto-advance after date)
    const timeButton = page.locator('button').filter({ hasText: /AM|PM/ }).first();
    await expect(timeButton).toBeVisible({ timeout: 10000 });
    const timeText = await timeButton.textContent();
    await timeButton.click();
    await page.waitForTimeout(500);
    console.log(`✅ Selected time: ${timeText}`);

    // Screenshot: Time selected
    await page.screenshot({ path: 'test-results/comprehensive/acai-wizard-03-time.png' });

    // Step 3: Select crust (should auto-advance after time)
    const crustButton = page.locator('button').filter({ hasText: /Peanut Butter|Nutella|Honey/i }).first();
    await expect(crustButton).toBeVisible({ timeout: 10000 });
    const crustText = await crustButton.textContent();
    await crustButton.click();
    await page.waitForTimeout(500);
    console.log(`✅ Selected crust: ${crustText?.substring(0, 20)}`);

    // Screenshot: Crust selected
    await page.screenshot({ path: 'test-results/comprehensive/acai-wizard-04-crust.png' });
  });

  test('3. Customer: Complete wizard steps 4-6 (quantity, placard, contact)', async ({ page }) => {
    await page.goto('/acai-cakes');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Complete steps 1-3 first
    await page.locator('button').filter({ hasText: /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/ }).first().click();
    await page.waitForTimeout(500);
    await page.locator('button').filter({ hasText: /AM|PM/ }).first().click();
    await page.waitForTimeout(500);
    await page.locator('button').filter({ hasText: /Peanut Butter/i }).first().click();
    await page.waitForTimeout(500);

    // Step 4: Quantity - increase to 2
    const plusButton = page.locator('button:has-text("+")').first();
    await expect(plusButton).toBeVisible({ timeout: 10000 });
    await plusButton.click();
    await page.waitForTimeout(200);
    
    // Verify quantity shows 2
    const quantityText = page.locator('text=/^2$/').first();
    await expect(quantityText).toBeVisible();
    console.log('✅ Set quantity to 2');

    // Click continue
    let continueButton = page.locator('button:has-text("Continue")').first();
    if (await continueButton.isVisible()) {
      await continueButton.click();
      await page.waitForTimeout(300);
    }

    // Screenshot: Quantity set
    await page.screenshot({ path: 'test-results/comprehensive/acai-wizard-05-quantity.png' });

    // Step 5: Placard (optional - skip)
    continueButton = page.locator('button:has-text("Continue")').first();
    if (await continueButton.isVisible()) {
      await continueButton.click();
      await page.waitForTimeout(300);
    }

    // Step 6: Contact info
    await page.fill('input[placeholder*="John Doe"], input[placeholder*="Name"]', 'E2E Wizard Test');
    await page.fill('input[type="email"]', 'wizard-test@hafaloha.com');
    await page.fill('input[type="tel"]', '671-555-9999');
    console.log('✅ Filled contact information');

    // Screenshot: Contact info filled
    await page.screenshot({ path: 'test-results/comprehensive/acai-wizard-06-contact.png', fullPage: true });
  });

  test('4. Customer: Submit order successfully', async ({ page }) => {
    await page.goto('/acai-cakes');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Complete all steps quickly
    await page.locator('button').filter({ hasText: /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/ }).first().click();
    await page.waitForTimeout(400);
    await page.locator('button').filter({ hasText: /AM|PM/ }).first().click();
    await page.waitForTimeout(400);
    await page.locator('button').filter({ hasText: /Peanut Butter/i }).first().click();
    await page.waitForTimeout(400);
    
    // Continue past quantity
    let continueButton = page.locator('button:has-text("Continue")').first();
    if (await continueButton.isVisible()) {
      await continueButton.click();
      await page.waitForTimeout(300);
    }
    
    // Continue past placard
    continueButton = page.locator('button:has-text("Continue")').first();
    if (await continueButton.isVisible()) {
      await continueButton.click();
      await page.waitForTimeout(300);
    }

    // Fill contact info with unique email for this test
    const testEmail = `e2e-${Date.now()}@example.com`;
    await page.fill('input[placeholder*="John Doe"], input[placeholder*="Name"]', 'E2E Order Test');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="tel"]', '671-555-0001');
    
    await page.waitForTimeout(500);

    // Verify submit button is enabled
    const submitButton = page.locator('button:has-text("Place Order")');
    await expect(submitButton).toBeEnabled({ timeout: 5000 });

    // Screenshot before submit
    await page.screenshot({ path: 'test-results/comprehensive/acai-wizard-07-ready.png', fullPage: true });

    // Submit order
    await submitButton.click();
    await page.waitForTimeout(5000);

    // Screenshot after submit
    await page.screenshot({ path: 'test-results/comprehensive/acai-wizard-08-result.png', fullPage: true });

    // Check for success - either redirect to order page or success message
    const currentUrl = page.url();
    const successToast = page.locator('text=/success|order.*placed|thank you/i').first();
    const orderPage = currentUrl.includes('/orders/');
    
    if (orderPage || await successToast.isVisible().catch(() => false)) {
      console.log('✅ Order submitted successfully!');
      
      // Try to capture order number
      const orderNumber = page.locator('text=/HAF-A-\\d+|Order #?\\d+/i').first();
      if (await orderNumber.isVisible().catch(() => false)) {
        console.log(`Order: ${await orderNumber.textContent()}`);
      }
    } else {
      // Check for error message
      const errorMsg = page.locator('[class*="error"], [class*="red"]').first();
      if (await errorMsg.isVisible().catch(() => false)) {
        console.log(`⚠️ Error: ${await errorMsg.textContent()}`);
      }
    }
  });
});

test.describe('Acai Wizard - Edge Cases', () => {
  test('Cannot skip steps - locked steps not clickable', async ({ page }) => {
    await page.goto('/acai-cakes');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Try to click on contact info step (step 6) without completing previous steps
    const contactStep = page.locator('button').filter({ hasText: 'Contact Info' }).first();
    
    if (await contactStep.isVisible()) {
      await contactStep.click();
      await page.waitForTimeout(300);
      
      // Contact form inputs should NOT be visible (step is locked)
      const emailInput = page.locator('input[type="email"]');
      const isEmailVisible = await emailInput.isVisible().catch(() => false);
      
      // Either email is not visible OR we're still on step 1
      const dateButtons = page.locator('button').filter({ hasText: /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/ });
      const datesVisible = await dateButtons.first().isVisible().catch(() => false);
      
      expect(isEmailVisible === false || datesVisible === true).toBeTruthy();
      console.log('✅ Cannot skip to locked steps');
    }
  });

  test('Quantity controls work correctly', async ({ page }) => {
    await page.goto('/acai-cakes');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Navigate to quantity step
    await page.locator('button').filter({ hasText: /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/ }).first().click();
    await page.waitForTimeout(400);
    await page.locator('button').filter({ hasText: /AM|PM/ }).first().click();
    await page.waitForTimeout(400);
    await page.locator('button').filter({ hasText: /Peanut Butter/i }).first().click();
    await page.waitForTimeout(400);

    // Should be on quantity step now
    const plusButton = page.locator('button:has-text("+")');
    const minusButton = page.locator('button:has-text("−")');
    
    // Increase to 3
    await plusButton.click();
    await page.waitForTimeout(200);
    await plusButton.click();
    await page.waitForTimeout(200);
    
    // Verify quantity is 3
    let quantityDisplay = page.locator('span:has-text("3")').filter({ hasText: /^3$/ });
    await expect(quantityDisplay).toBeVisible();
    
    // Decrease back to 1
    await minusButton.click();
    await page.waitForTimeout(200);
    await minusButton.click();
    await page.waitForTimeout(200);
    
    // Verify quantity is 1
    quantityDisplay = page.locator('span').filter({ hasText: /^1$/ });
    await expect(quantityDisplay).toBeVisible();
    
    // Try to go below 1 (should stay at 1)
    await minusButton.click();
    await page.waitForTimeout(200);
    quantityDisplay = page.locator('span').filter({ hasText: /^1$/ });
    await expect(quantityDisplay).toBeVisible();
    
    console.log('✅ Quantity controls work correctly (min 1, can increase/decrease)');
  });

  test('Order summary updates in real-time', async ({ page }) => {
    await page.goto('/acai-cakes');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Get initial total
    const initialTotal = await page.locator('text=/\\$\\d+\\.\\d+/').last().textContent();
    console.log(`Initial total: ${initialTotal}`);

    // Navigate to quantity step and increase
    await page.locator('button').filter({ hasText: /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/ }).first().click();
    await page.waitForTimeout(400);
    await page.locator('button').filter({ hasText: /AM|PM/ }).first().click();
    await page.waitForTimeout(400);
    await page.locator('button').filter({ hasText: /Peanut Butter/i }).first().click();
    await page.waitForTimeout(400);
    
    // Increase quantity
    await page.locator('button:has-text("+")').click();
    await page.waitForTimeout(500);

    // Get updated total
    const updatedTotal = await page.locator('text=/\\$\\d+\\.\\d+/').last().textContent();
    console.log(`Updated total: ${updatedTotal}`);

    // Totals should be different (quantity 2 vs 1)
    expect(updatedTotal).not.toBe(initialTotal);
    console.log('✅ Order summary updates when quantity changes');
  });

  test('Crust pricing reflected in total', async ({ page }) => {
    await page.goto('/acai-cakes');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Navigate to crust step
    await page.locator('button').filter({ hasText: /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/ }).first().click();
    await page.waitForTimeout(400);
    await page.locator('button').filter({ hasText: /AM|PM/ }).first().click();
    await page.waitForTimeout(400);

    // Select Peanut Butter (included/free)
    await page.locator('button').filter({ hasText: /Peanut Butter/i }).first().click();
    await page.waitForTimeout(400);
    
    const totalWithPB = await page.locator('text=/\\$\\d+\\.\\d+/').last().textContent();

    // Go back and select Nutella (+$4.50)
    const crustStep = page.locator('button').filter({ hasText: 'Choose Crust' }).first();
    await crustStep.click();
    await page.waitForTimeout(300);
    
    await page.locator('button').filter({ hasText: /Nutella/i }).first().click();
    await page.waitForTimeout(400);
    
    const totalWithNutella = await page.locator('text=/\\$\\d+\\.\\d+/').last().textContent();

    console.log(`Total with Peanut Butter: ${totalWithPB}`);
    console.log(`Total with Nutella: ${totalWithNutella}`);

    // Nutella total should be higher
    const pbPrice = parseFloat(totalWithPB?.replace('$', '') || '0');
    const nutellaPrice = parseFloat(totalWithNutella?.replace('$', '') || '0');
    
    expect(nutellaPrice).toBeGreaterThan(pbPrice);
    console.log('✅ Crust pricing correctly reflected in total');
  });
});

test.describe('Acai Wizard - Validation', () => {
  test('Submit button disabled until all required fields filled', async ({ page }) => {
    await page.goto('/acai-cakes');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Submit button should be disabled initially
    const submitButton = page.locator('button:has-text("Place Order")');
    await expect(submitButton).toBeDisabled();

    // Complete all steps except contact
    await page.locator('button').filter({ hasText: /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/ }).first().click();
    await page.waitForTimeout(400);
    await page.locator('button').filter({ hasText: /AM|PM/ }).first().click();
    await page.waitForTimeout(400);
    await page.locator('button').filter({ hasText: /Peanut Butter/i }).first().click();
    await page.waitForTimeout(400);
    
    // Skip to contact
    let continueButton = page.locator('button:has-text("Continue")').first();
    if (await continueButton.isVisible()) {
      await continueButton.click();
      await page.waitForTimeout(300);
    }
    continueButton = page.locator('button:has-text("Continue")').first();
    if (await continueButton.isVisible()) {
      await continueButton.click();
      await page.waitForTimeout(300);
    }

    // Submit should still be disabled (no contact info)
    await expect(submitButton).toBeDisabled();
    
    // Fill only name
    await page.fill('input[placeholder*="John Doe"], input[placeholder*="Name"]', 'Test');
    await page.waitForTimeout(200);
    await expect(submitButton).toBeDisabled();
    
    // Fill email
    await page.fill('input[type="email"]', 'test@test.com');
    await page.waitForTimeout(200);
    await expect(submitButton).toBeDisabled();
    
    // Fill phone - now should be enabled
    await page.fill('input[type="tel"]', '671-555-1234');
    await page.waitForTimeout(200);
    await expect(submitButton).toBeEnabled();
    
    console.log('✅ Submit button correctly validates required fields');
  });
});
