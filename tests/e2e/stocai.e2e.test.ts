import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
} from './helpers/test-setup';

describe('STOCAI Service - E2E Tests', () => {
  let browser: Browser;
  let page: Page;
  const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000';

  beforeAll(async () => {
    await setupTestEnvironment();
    browser = await chromium.launch({
      headless: process.env.CI === 'true',
      slowMo: process.env.CI === 'true' ? 0 : 100,
    });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser?.close();
    await teardownTestEnvironment();
  });

  describe('Application Loading', () => {
    it('should load the main page successfully', async () => {
      await page.goto(baseUrl);
      await expect(page).toHaveTitle(/${serviceName}/i);

      // Check for essential elements
      await expect(page.locator('header')).toBeVisible();
      await expect(page.locator('main')).toBeVisible();
    });

    it('should load without JavaScript errors', async () => {
      const errors: string[] = [];
      page.on('pageerror', error => {
        errors.push(error.message);
      });

      await page.goto(baseUrl);
      await page.waitForLoadState('networkidle');

      expect(errors).toHaveLength(0);
    });

    it('should be responsive on mobile devices', async () => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
      await page.goto(baseUrl);

      // Check mobile navigation
      const mobileMenu = page.locator('[data-testid="mobile-menu"]');
      if (await mobileMenu.isVisible()) {
        await mobileMenu.click();
        await expect(page.locator('[data-testid="navigation"]')).toBeVisible();
      }
    });
  });

  describe('User Authentication Flow', () => {
    it('should handle user login flow', async () => {
      await page.goto(`${baseUrl}/login`);

      // Fill login form
      await page.fill('[data-testid="email-input"]', 'test@example.com');
      await page.fill('[data-testid="password-input"]', 'testpassword');
      await page.click('[data-testid="login-button"]');

      // Wait for redirect to dashboard
      await page.waitForURL(/dashboard/);
      await expect(page.locator('[data-testid="user-profile"]')).toBeVisible();
    });

    it('should handle logout flow', async () => {
      // Assume user is logged in
      await page.goto(`${baseUrl}/dashboard`);

      // Click logout
      await page.click('[data-testid="logout-button"]');

      // Should redirect to login page
      await page.waitForURL(/login/);
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    });

    it('should validate form inputs', async () => {
      await page.goto(`${baseUrl}/login`);

      // Try to submit empty form
      await page.click('[data-testid="login-button"]');

      // Should show validation errors
      await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
      await expect(
        page.locator('[data-testid="password-error"]')
      ).toBeVisible();
    });
  });

  describe('Core Functionality', () => {
    it('should perform main business operations', async () => {
      await page.goto(`${baseUrl}/dashboard`);

      // Perform main operation specific to this service
      await page.click('[data-testid="new-operation-button"]');
      await page.fill('[data-testid="operation-input"]', 'Test Operation');
      await page.click('[data-testid="submit-operation"]');

      // Verify operation was created
      await expect(
        page.locator('[data-testid="operation-success"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="operations-list"]')
      ).toContainText('Test Operation');
    });

    it('should handle data persistence', async () => {
      await page.goto(`${baseUrl}/dashboard`);

      // Create some data
      await page.click('[data-testid="create-data-button"]');
      await page.fill('[data-testid="data-name"]', 'Test Data');
      await page.click('[data-testid="save-data"]');

      // Refresh page and verify data persists
      await page.reload();
      await expect(page.locator('[data-testid="data-list"]')).toContainText(
        'Test Data'
      );
    });

    it('should handle real-time updates', async () => {
      // Open two pages to test real-time functionality
      const page2 = await browser.newPage();

      await page.goto(`${baseUrl}/dashboard`);
      await page2.goto(`${baseUrl}/dashboard`);

      // Make change on first page
      await page.click('[data-testid="send-update-button"]');
      await page.fill('[data-testid="update-message"]', 'Real-time test');
      await page.click('[data-testid="send-button"]');

      // Verify update appears on second page
      await expect(page2.locator('[data-testid="updates-list"]')).toContainText(
        'Real-time test'
      );

      await page2.close();
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Simulate network failure
      await page.route('**/api/**', route => route.abort());

      await page.goto(`${baseUrl}/dashboard`);
      await page.click('[data-testid="network-dependent-action"]');

      // Should show error message
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
    });

    it('should handle 404 errors', async () => {
      await page.goto(`${baseUrl}/non-existent-page`);

      // Should show 404 page
      await expect(page.locator('[data-testid="404-page"]')).toBeVisible();
      await expect(page.locator('[data-testid="home-link"]')).toBeVisible();
    });
  });

  describe('Performance', () => {
    it('should load within acceptable time limits', async () => {
      const startTime = Date.now();

      await page.goto(baseUrl);
      await page.waitForLoadState('networkidle');

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(5000); // Should load in less than 5 seconds
    });

    it('should have good Core Web Vitals', async () => {
      await page.goto(baseUrl);

      // Measure Largest Contentful Paint (LCP)
      const lcp = await page.evaluate(() => {
        return new Promise(resolve => {
          new PerformanceObserver(list => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1];
            resolve(lastEntry.startTime);
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        });
      });

      expect(lcp).toBeLessThan(2500); // Good LCP is under 2.5 seconds
    });
  });

  describe('Accessibility', () => {
    it('should be keyboard navigable', async () => {
      await page.goto(baseUrl);

      // Test tab navigation
      await page.keyboard.press('Tab');
      const firstFocusable = await page.locator(':focus');
      expect(await firstFocusable.isVisible()).toBe(true);

      // Test that we can navigate through all interactive elements
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab');
        const focused = await page.locator(':focus');
        expect(await focused.isVisible()).toBe(true);
      }
    });

    it('should have proper ARIA labels', async () => {
      await page.goto(baseUrl);

      // Check for essential ARIA attributes
      const buttons = page.locator('button');
      const buttonCount = await buttons.count();

      for (let i = 0; i < buttonCount; i++) {
        const button = buttons.nth(i);
        const ariaLabel = await button.getAttribute('aria-label');
        const innerText = await button.innerText();

        // Button should have either aria-label or visible text
        expect(ariaLabel || innerText).toBeTruthy();
      }
    });

    it('should have proper color contrast', async () => {
      await page.goto(baseUrl);

      // Check that text has sufficient contrast
      const textElements = page.locator('p, h1, h2, h3, h4, h5, h6, span');
      const count = await textElements.count();

      for (let i = 0; i < Math.min(count, 10); i++) {
        const element = textElements.nth(i);
        const styles = await element.evaluate(el => {
          const computed = window.getComputedStyle(el);
          return {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
          };
        });

        // Basic check that text is not invisible (same color as background)
        expect(styles.color).not.toBe(styles.backgroundColor);
      }
    });
  });
});
