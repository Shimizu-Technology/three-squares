import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/v1/config*', (route) => route.fulfill({ json: {
    enable_storefront_three_squares: true, enable_storefront_catering: true,
  } }));
});

test('catering labels, draft recovery and success focus survive a server rejection', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/v1/catering', (route) => route.fulfill(++attempts === 1
    ? { status: 422, json: { errors: ['Review the event details.'] } }
    : { status: 201, json: { inquiry: { id: 1 } } }));
  await page.goto('/catering');
  const opener = page.getByRole('button', { name: 'Request a Quote', exact: true }).first();
  await opener.click();
  const dialog = page.locator('dialog[aria-labelledby="catering-form-title"]');
  expect(await dialog.locator('input,select,textarea').evaluateAll((fields) =>
    fields.length === 13 && fields.every((field) => (field as HTMLInputElement).labels?.length === 1))).toBe(true);
  await dialog.getByRole('button', { name: 'Submit Inquiry' }).click();
  await expect(dialog.getByLabel('Name *', { exact: true })).toBeFocused();
  await dialog.getByLabel('Name *', { exact: true }).fill('Form fixture');
  await dialog.getByLabel('Email *', { exact: true }).fill('fixture@example.invalid');
  await dialog.getByLabel('Event Type *').selectOption('corporate');
  await dialog.getByLabel('Number of Guests *').fill('10');
  const date = new Date();
  date.setDate(date.getDate() + 10);
  await dialog.getByLabel('Event Date *').fill(date.toISOString().slice(0, 10));
  await dialog.getByRole('button', { name: 'Submit Inquiry' }).click();
  await expect(dialog.getByRole('alert')).toBeFocused();
  await expect(dialog.getByLabel('Email *', { exact: true })).toHaveValue('fixture@example.invalid');
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dialog.getByLabel('Email *', { exact: true })).toHaveValue('fixture@example.invalid');
  await dialog.getByRole('button', { name: 'Submit Inquiry' }).click();
  await expect(dialog.getByRole('status')).toBeFocused();
  await expect(dialog.getByRole('heading', { name: 'Thank You!' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(opener).toBeFocused();
});

test('contact announces and focuses server outcomes without discarding the draft', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/v1/contact', (route) => route.fulfill(++attempts === 1
    ? { status: 422, json: { errors: ['Review your message.'] } }
    : { status: 201, json: { success: true } }));
  await page.goto('/contact');
  await page.getByLabel('Your Name').fill('Form fixture');
  await page.getByLabel('Email Address').fill('fixture@example.invalid');
  await page.getByLabel('Subject').selectOption('general');
  await page.getByLabel('Message', { exact: true }).fill('Fixture message');
  await page.getByRole('button', { name: 'Send Message', exact: true }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('Fixture message');
  await page.getByRole('button', { name: 'Send Message', exact: true }).click();
  await expect(page.getByRole('status')).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Mahalo for reaching out!' })).toBeVisible();
});
