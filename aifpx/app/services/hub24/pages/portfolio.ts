/**
 * Page object for Hub24 Model Portfolio navigation.
 *
 * Handles navigating to the model portfolio, discovering client accounts,
 * and selecting individual accounts for trading.
 */

import type { Page } from "playwright-core";
import { createLogger } from "../logger.js";
import type { ClientAccount, Hub24Config } from "../types.js";

const log = createLogger("hub24:portfolio");

export class PortfolioPage {
  constructor(
    private page: Page,
    private config: Hub24Config,
  ) {}

  /** Navigate to the model portfolios section */
  async navigateToModelPortfolios(): Promise<void> {
    log.info("Navigating to Model Portfolios");
    // Navigate via the main menu
    await this.page.click('a:has-text("Portfolios"), nav >> text=Portfolios');
    await this.page.waitForLoadState("networkidle");

    // Click into Model Portfolios sub-section
    await this.page.click('a:has-text("Model Portfolios"), [data-testid="model-portfolios"]');
    await this.page.waitForLoadState("networkidle");

    log.info("Model Portfolios page loaded");
  }

  /** Select a specific model portfolio by name */
  async selectModelPortfolio(name: string): Promise<void> {
    log.info("Selecting model portfolio", { name });

    // Search or scroll to find the portfolio
    const searchInput = await this.page.$('input[placeholder*="Search"], input[type="search"]');
    if (searchInput) {
      await searchInput.fill(name);
      await this.page.waitForTimeout(1_000);
    }

    // Click the portfolio row/link
    await this.page.click(`text="${name}"`);
    await this.page.waitForLoadState("networkidle");

    log.info("Model portfolio selected", { name });
  }

  /** Discover all client accounts within the current model portfolio */
  async discoverClientAccounts(): Promise<ClientAccount[]> {
    log.info("Discovering client accounts in model portfolio");

    // Wait for the account list to load
    await this.page.waitForSelector(
      'table tbody tr, [class*="account-list"] [class*="row"], [data-testid*="account"]',
      { timeout: this.config.timeout },
    );

    // Extract account data from the table rows
    const accounts = await this.page.evaluate(() => {
      const rows = document.querySelectorAll(
        'table tbody tr, [class*="account-list"] [class*="row"], [data-testid*="account"]',
      );
      const results: Array<{ name: string; accountId: string }> = [];
      for (const row of rows) {
        const nameEl = row.querySelector(
          'td:first-child, [class*="name"], [data-testid*="client-name"]',
        );
        const idEl = row.querySelector(
          'td:nth-child(2), [class*="account-id"], [data-testid*="account-id"]',
        );
        if (nameEl?.textContent && idEl?.textContent) {
          results.push({
            name: nameEl.textContent.trim(),
            accountId: idEl.textContent.trim(),
          });
        }
      }
      return results;
    });

    log.info("Discovered client accounts", { count: accounts.length });
    return accounts;
  }

  /** Select a specific client account from the portfolio view */
  async selectClientAccount(account: ClientAccount): Promise<void> {
    log.info("Selecting client account", { name: account.name, accountId: account.accountId });

    // Click the account row - try account ID first (more unique), then name
    const accountSelector = `text="${account.accountId}"`;
    const nameSelector = `text="${account.name}"`;

    const target = (await this.page.$(accountSelector)) ?? (await this.page.$(nameSelector));
    if (!target) {
      throw new Error(`Could not find client account: ${account.name} (${account.accountId})`);
    }

    await target.click();
    await this.page.waitForLoadState("networkidle");

    log.info("Client account selected", { name: account.name });
  }
}
