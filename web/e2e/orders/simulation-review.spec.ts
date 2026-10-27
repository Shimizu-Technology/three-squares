import { test, expect } from '@playwright/test';

// Opt-in isolated simulator fixture: shipping-enabled simulator-cookie ($12.50),
// Simulator Kitchen, and a simulated online profile.
// Only carrier quotes are fixtures; product/cart/config use the local application.
const simulatorUrl = process.env.TSQ_SIMULATION_QA_URL;
test.skip(!simulatorUrl, 'Requires a dedicated local simulator fixture');

for (const width of [390, 1440]) {
  test(`shipping-rate changes require a new payment review at ${width}`, async ({ page }) => {
    const origin = new URL(simulatorUrl!);
    expect(['localhost', '127.0.0.1']).toContain(origin.hostname);
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/v1/shipping/rates', route => route.fulfill({ json: {
      rates: [
        { carrier: 'Simulation', service: 'Standard', rate_cents: 500 },
        { carrier: 'Simulation', service: 'Express', rate_cents: 900 },
      ], total_weight_oz: 8,
    } }));
    await page.goto(`${origin.origin}/products/simulator-cookie`);
    await page.getByRole('button', { name: /Simulator Kitchen/ }).click();
    await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
    await page.getByRole('button', { name: 'Secure Checkout', exact: true }).click();
    await page.getByLabel('Full Name *', { exact: true }).fill('Simulation Guest');
    await page.getByLabel('Email *', { exact: true }).fill('guest@example.test');
    await page.getByLabel('Phone *', { exact: true }).fill('6715550100');
    await page.getByRole('button', { name: /Ship to Address/ }).click();
    await page.getByLabel('Address Line 1 *', { exact: true }).fill('123 Fixture Street');
    await page.getByLabel('City *', { exact: true }).fill('Tamuning');
    await page.getByLabel('State *', { exact: true }).fill('GU');
    await page.getByLabel('ZIP Code *', { exact: true }).fill('96913');
    await page.getByRole('button', { name: 'Calculate Shipping Rates', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pay $17.50', exact: true })).toBeDisabled();
    const review = page.getByRole('checkbox', { name: /I have reviewed my items/ });
    await review.check();
    await expect(page.getByRole('button', { name: 'Pay $17.50', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: /Simulation - Express/ }).click();
    await expect(review).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Pay $21.50', exact: true })).toBeDisabled();
    await review.check();
    await expect(page.getByRole('button', { name: 'Pay $21.50', exact: true })).toBeEnabled();
  });
}
