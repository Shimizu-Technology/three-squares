import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env
dotenv.config({ path: path.resolve(__dirname, '.env') });

const devPort = process.env.PLAYWRIGHT_DEV_PORT || '5173';
const baseURL = process.env.TEST_BASE_URL || `http://localhost:${devPort}`;

/**
 * Hafaloha E2E Test Configuration
 * 
 * Test accounts are stored in .env (gitignored):
 * - TEST_USER_EMAIL: Admin test account email
 * - TEST_USER_PASSWORD: Admin test account password
 * 
 * See e2e/auth.setup.ts for Clerk authentication handling.
 */
export default defineConfig({
  testDir: './e2e',
  
  /* Run tests in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'] // Console output
  ],
  
  /* Shared settings for all projects */
  use: {
    /* Base URL for navigation */
    baseURL,
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Video on failure */
    video: 'on-first-retry',
  },

  /* Configure projects for different scenarios */
  projects: [
    // Setup project - authenticates and saves session
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    
    // Public tests - no authentication needed
    {
      name: 'public',
      testMatch: /public\/.*\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'],
      },
    },
    
    // Auth tests - mixed (some need auth, some don't)
    {
      name: 'auth',
      testMatch: /auth\/.*\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'],
      },
    },
    
    // Admin tests - require authentication
    {
      name: 'admin',
      testMatch: /admin\/.*\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
    
    // Checkout/Order tests - may need auth for some scenarios
    {
      name: 'orders',
      testMatch: /orders\/.*\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'],
      },
    },
    
    // Guest flow tests - start without auth, may sign in during test
    // NO dependencies on setup, NO stored auth state
    {
      name: 'guest-flow',
      testMatch: /comprehensive\/guest-.*\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'],
        // NO storageState - starts as guest
        actionTimeout: 15000,
        navigationTimeout: 30000,
      },
      // NO dependencies - don't run setup first
      fullyParallel: false,
    },
    
    // Mobile tests
    {
      name: 'mobile',
      testMatch: /mobile\/.*\.spec\.ts/,
      use: { 
        ...devices['iPhone 13'],
      },
    },
    
    // Mobile admin tests (authenticated)
    {
      name: 'mobile-admin',
      testMatch: /mobile-admin\/.*\.spec\.ts/,
      use: { 
        ...devices['iPhone 13'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
    
    // Visual tests with screenshots
    {
      name: 'visual',
      testMatch: /visual\/.*\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
    
    // Comprehensive tests - full user journey testing (desktop)
    // Run manually with: npm run test:comprehensive
    // Creates real data, exercises full workflows
    // Excludes guest-* tests (those run with guest-flow project)
    {
      name: 'comprehensive',
      testMatch: /comprehensive\/(?!mobile-)(?!guest-).*\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
        // Longer timeouts for full workflows
        actionTimeout: 15000,
        navigationTimeout: 30000,
      },
      dependencies: ['setup'],
      // Don't run in parallel - tests may depend on order
      fullyParallel: false,
    },
    
    // Comprehensive tests - mobile admin flows
    {
      name: 'comprehensive-mobile',
      testMatch: /comprehensive\/mobile-.*\.spec\.ts/,
      use: { 
        ...devices['iPhone 13'],
        storageState: 'playwright/.auth/admin.json',
        actionTimeout: 15000,
        navigationTimeout: 30000,
      },
      dependencies: ['setup'],
      fullyParallel: false,
    },
  ],

  /* Run local dev server before starting tests */
  webServer: {
    command: `npm run dev -- --port ${devPort}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
