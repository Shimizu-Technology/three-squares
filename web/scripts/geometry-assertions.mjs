import { expect as playwrightExpect } from '@playwright/test';

// Standalone runners do not inherit Playwright Test's assertion configuration.
// Wait for observable browser/React state, within the command's overall budget.
export const expect = playwrightExpect.configure({ timeout: 5000 });
export async function expectHash(page, hash) {
  await expect(page).toHaveURL(url => url.hash === hash);
}
