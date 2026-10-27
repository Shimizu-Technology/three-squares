import { devices, expect, test } from '@playwright/test';

// Opt-in dedicated simulator fixtures, shared with simulation-review.spec.ts:
// shipping-enabled simulator-cookie ($12.50), Simulator Kitchen and simulated online profile.
const simulatorUrl = process.env.TSQ_SIMULATION_QA_URL;
test.skip(!simulatorUrl, 'Requires a dedicated local simulator fixture');

for (const [browserName, width] of [['chromium', 390], ['webkit', 375]] as const) {
  test.describe(`${browserName} payment controls`, () => {
    test.use({ ...devices['iPhone 13'], browserName, viewport: { width, height: 844 }, reducedMotion: 'reduce' });

    test('checkout, receipt and guest recovery stay usable without spatial motion', async ({ page }) => {
      const origin = new URL(simulatorUrl!);
      expect(['localhost', '127.0.0.1']).toContain(origin.hostname);
      const paymentRequests: string[] = [];
      page.on('request', request => {
        if (/(^|\.)(stripe\.com|elementexpress\.com|hostedpayments\.com)$|tripos/i.test(new URL(request.url()).hostname)) paymentRequests.push(request.url());
      });
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
      });
      await page.goto(`${origin.origin}/products/simulator-cookie`);
      await page.getByRole('button', { name: /Simulator Kitchen/ }).click();
      await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
      await page.getByRole('button', { name: 'Secure Checkout', exact: true }).click();
      await expect(page.getByText('Simulated payments — no money moves', { exact: true }).first()).toBeVisible();
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover');

      const checkControls = async () => {
        const sizes = await page.locator('input, select, textarea').evaluateAll(elements => elements
          .filter(element => element.getClientRects().length > 0)
          .map(element => parseFloat(getComputedStyle(element).fontSize)));
        expect(sizes.length).toBeGreaterThan(0);
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
      };
      const checkStill = async (name: string) => {
        const region = page.getByRole('region', { name, exact: true });
        await expect(region).toBeVisible();
        const state = await region.evaluate(element => ({
          transform: getComputedStyle(element).transform,
          duration: Math.max(...getComputedStyle(element).transitionDuration.split(',').map(value => parseFloat(value))),
          spatialAnimations: element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running')
            .flatMap(animation => (animation.effect as KeyframeEffect | null)?.getKeyframes() || [])
            .filter(frame => ['transform', 'height', 'width', 'scale', 'translate'].some(key => key in frame)).length,
        }));
        expect(state.transform).toBe('none');
        expect(state.duration).toBeLessThan(0.001);
        expect(state.spatialAnimations).toBe(0);
      };
      await checkControls();
      await checkStill('Pickup details');
      await page.getByLabel('Full Name *', { exact: true }).fill('Native Simulation Guest');
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Email *', { exact: true })).toBeFocused();
      await page.getByLabel('Email *', { exact: true }).fill('native@example.test');
      await page.getByLabel('Phone *', { exact: true }).fill('6715550100');

      const shipping = page.getByRole('button', { name: /Ship to Address/ });
      expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(false);
      const background = await shipping.evaluate(element => getComputedStyle(element).backgroundColor);
      await shipping.hover();
      expect(await shipping.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(background);
      await page.screenshot({ path: test.info().outputPath('checkout-pickup.png') });
      await shipping.click();
      await checkStill('Shipping details');
      await checkControls();
      await expect(page.getByRole('region', { name: 'Pickup details', exact: true })).toHaveCount(0);
      await page.getByLabel('Address Line 1 *', { exact: true }).fill('123 Fixture Street');
      await page.getByRole('button', { name: /Free — Pickup at store/ }).click();
      await checkStill('Pickup details');
      await expect(page.getByRole('region', { name: 'Shipping details', exact: true })).toHaveCount(0);
      await page.reload();
      await expect(page.getByLabel('Full Name *', { exact: true })).toHaveValue('Native Simulation Guest');
      const review = page.getByRole('checkbox', { name: /I have reviewed my items/ });
      await expect(review).not.toBeChecked();
      await review.check();
      await page.getByRole('button', { name: 'Pay $12.50', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Order Confirmed!', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Pickup at Simulator Kitchen', exact: true })).toBeVisible();
      const id = new URL(page.url()).pathname.split('/').pop();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath('receipt.png') });
      await page.goto(`${origin.origin}/orders`);
      const saved = page.getByRole('link', { name: `View saved order #${id}`, exact: true });
      await expect(saved).toBeVisible();
      await saved.click();
      await expect(page.getByRole('heading', { name: 'Order Confirmed!', exact: true })).toBeVisible();
      expect(paymentRequests).toEqual([]);
    });
  });
}
