import { test, expect } from '@playwright/test';

for (const [width, height] of [[768, 1024], [1024, 768], [390, 844], [1440, 900]]) {
  test(`manual quote recording preserves drafts and recovers a concurrent update at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    let inquiry = { id: 92001, contact_name: 'Christopher Alexander Montgomery III — office lunch coordinator', contact_email: 'office-team@example.test', contact_phone: '6715550100', company_name: 'Office group with long dietary and kitchen notes', event_type: 'corporate', event_date: '2027-12-01', guest_count: 45, status: 'pending', days_until_event: 5, urgent: true, created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00.000123Z', admin_notes: 'Original saved follow-up', quoted_amount: null as number | null, quoted_at: undefined as string | undefined };
    const writes: { path: string; body: Record<string, unknown> }[] = []; let reject = true;
    await page.route('**/api/v1/admin/catering**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() !== 'GET') {
        const body = request.postDataJSON(); writes.push({ path, body });
        if (body.expected_updated_at !== inquiry.updated_at) return route.fulfill({ status: 409, json: { error: 'This inquiry has changed. Reload it before saving again.' } });
        if (reject) return route.fulfill({ status: 422, json: { errors: ['QA quote validation failed'] } });
        if (path.endsWith('/quote')) inquiry = { ...inquiry, status: 'quoted', quoted_amount: Number(body.quoted_amount), quoted_at: '2026-10-27T00:01:00Z', admin_notes: body.admin_notes, updated_at: '2026-10-27T00:01:00.000125Z' };
        else if (path.endsWith('/status')) inquiry = { ...inquiry, status: body.status, updated_at: '2026-10-27T00:02:00.000126Z' };
        else inquiry = { ...inquiry, admin_notes: body.inquiry.admin_notes, updated_at: '2026-10-27T00:03:00.000127Z' };
        return route.fulfill({ json: { inquiry, message: 'Quote recorded. No email was sent by this app.' } });
      }
      if (path.endsWith('/stats')) return route.fulfill({ json: { total: 1, pending: inquiry.status === 'pending' ? 1 : 0, quoted: inquiry.status === 'quoted' ? 1 : 0, active: 1, upcoming_this_week: 1, urgent: 1 } });
      if (path.endsWith('/92001')) return route.fulfill({ json: { inquiry } });
      return route.fulfill({ json: { inquiries: [inquiry], meta: { page: 1, total: 1, total_pages: 1 } } });
    });
    await page.goto('/admin/catering');
    await expect(page.getByRole('combobox', { name: 'Inquiry status', exact: true })).toHaveValue('active');
    await page.getByRole('button', { name: 'View', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const amount = dialog.getByLabel('Quote amount ($)', { exact: true });
    const notes = dialog.getByRole('textbox', { name: 'Follow-up notes (staff recorded)', exact: true });
    await amount.fill('12.345');
    await dialog.getByRole('button', { name: 'Record quote', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('at most two decimal places');
    expect(writes).toHaveLength(0);
    await amount.fill('1200.25'); await notes.fill('Phone follow-up, Oct 27 Guam: awaiting office approval.');
    await dialog.getByRole('button', { name: 'Record quote', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('QA quote validation failed');
    await expect(amount).toHaveValue('1200.25');
    await expect(notes).toHaveValue('Phone follow-up, Oct 27 Guam: awaiting office approval.');
    inquiry = { ...inquiry, admin_notes: 'Another manager saved a newer note', updated_at: '2026-10-27T00:00:00.000124Z' }; reject = false;
    await dialog.getByRole('button', { name: 'Record quote', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Reload it before saving');
    await expect(dialog.getByRole('button', { name: 'Record quote', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Refresh details', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Record quote', exact: true })).toBeEnabled();
    await expect(notes).toHaveValue('Phone follow-up, Oct 27 Guam: awaiting office approval.');
    await dialog.locator('summary', { hasText: 'Latest saved notes' }).click();
    await expect(dialog.getByText('Another manager saved a newer note', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Record quote', exact: true }).click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Quote recorded. No email was sent by this app.' })).toBeVisible();
    expect(writes.at(-1)?.body.expected_updated_at).toBe('2026-10-27T00:00:00.000124Z');
    await expect(dialog.getByRole('heading', { name: 'Recorded quote: $1200.25', exact: true })).toBeVisible();
    await expect(dialog.getByText(/^Sent /)).toHaveCount(0);
    const email = dialog.getByRole('link', { name: inquiry.contact_email, exact: true });
    await expect(email).toHaveAttribute('href', `mailto:${inquiry.contact_email}`);
    const count = writes.length;
    await email.evaluate(link => link.addEventListener('click', event => event.preventDefault(), { once: true }));
    await email.click(); expect(writes).toHaveLength(count);
    await dialog.getByRole('button', { name: 'Record acceptance', exact: true }).click();
    await expect(dialog.getByText('Accepted', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Record quote', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  });
}
