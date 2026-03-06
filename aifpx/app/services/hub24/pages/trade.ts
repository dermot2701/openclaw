/**
 * Page object for Hub24 Aggregated Trade operations.
 *
 * Handles the sell/buy workflow within a client's aggregated trade view.
 */

import type { Page } from "playwright-core";
import { createLogger } from "../logger.js";
import type { Hub24Config } from "../types.js";

const log = createLogger("hub24:trade");

export class TradePage {
  constructor(
    private page: Page,
    private config: Hub24Config,
  ) {}

  /** Open the Aggregated Trade view for the currently selected account */
  async openAggregatedTrade(): Promise<void> {
    log.info("Opening Aggregated Trade");

    // Look for the Aggregated Trade button/link
    await this.page.click(
      'button:has-text("Aggregated Trade"), a:has-text("Aggregated Trade"), [data-testid="aggregated-trade"]',
    );
    await this.page.waitForLoadState("networkidle");

    // Wait for the trade panel to load
    await this.page.waitForSelector(
      '[class*="trade"], [class*="holdings"], [data-testid="trade-panel"]',
      { timeout: this.config.timeout },
    );

    log.info("Aggregated Trade view opened");
  }

  /**
   * Sell the full position of a given ticker.
   * Finds the holding row, clicks sell, and confirms full quantity.
   */
  async sellFullPosition(ticker: string): Promise<{ quantity: number; value: number }> {
    log.info("Selling full position", { ticker });

    if (this.config.dryRun) {
      log.info("[DRY RUN] Would sell full position", { ticker });
      return { quantity: 0, value: 0 };
    }

    // Find the holding row for the ticker
    const holdingRow = await this.findHoldingRow(ticker);
    if (!holdingRow) {
      throw new Error(`Holding not found for ticker: ${ticker}`);
    }

    // Extract current quantity and value before selling
    const holdingData = await holdingRow.evaluate((row) => {
      const cells = row.querySelectorAll("td");
      // Typical layout: ticker, quantity, price, value
      const qty = cells[1]?.textContent?.replace(/[^0-9.]/g, "") ?? "0";
      const val = cells[3]?.textContent?.replace(/[^0-9.]/g, "") ?? "0";
      return { quantity: parseFloat(qty), value: parseFloat(val) };
    });

    log.info("Current holding", { ticker, ...holdingData });

    // Click the sell button on the holding row
    const sellButton = await holdingRow.$(
      'button:has-text("Sell"), [data-testid="sell-btn"], a:has-text("Sell")',
    );
    if (sellButton) {
      await sellButton.click();
    } else {
      // Some layouts require clicking the row first, then choosing sell
      await holdingRow.click();
      await this.page.waitForTimeout(500);
      await this.page.click('button:has-text("Sell"), [data-action="sell"]');
    }

    await this.page.waitForLoadState("networkidle");

    // Select "Sell All" / full quantity
    await this.selectFullQuantity(ticker);

    // Confirm the sell order
    await this.confirmOrder("Sell");

    log.info("Sell order placed", { ticker, ...holdingData });
    return holdingData;
  }

  /**
   * Buy a ticker with specified proceeds amount.
   * Opens the buy dialog, enters the ticker and dollar amount.
   */
  async buyWithProceeds(ticker: string, amount: number): Promise<void> {
    log.info("Buying with proceeds", { ticker, amount });

    if (this.config.dryRun) {
      log.info("[DRY RUN] Would buy", { ticker, amount });
      return;
    }

    // Click the Buy/Add button
    await this.page.click(
      'button:has-text("Buy"), button:has-text("Add"), [data-testid="buy-btn"]',
    );
    await this.page.waitForLoadState("networkidle");

    // Search for the ticker
    const tickerInput = await this.page.waitForSelector(
      'input[placeholder*="ticker"], input[placeholder*="search"], input[placeholder*="Security"], input[name="ticker"]',
      { timeout: this.config.timeout },
    );
    await tickerInput.fill(ticker);
    await this.page.waitForTimeout(1_000);

    // Select the ticker from search results
    await this.page.click(`[class*="result"] >> text="${ticker}", li:has-text("${ticker}")`);
    await this.page.waitForTimeout(500);

    // Enter the dollar amount (use proceeds from sale)
    const amountInput = await this.page.waitForSelector(
      'input[name="amount"], input[name="value"], input[placeholder*="amount"], input[placeholder*="$"]',
    );
    await amountInput.fill(amount.toFixed(2));

    // Confirm the buy order
    await this.confirmOrder("Buy");

    log.info("Buy order placed", { ticker, amount });
  }

  /** Find a holding row by ticker symbol */
  private async findHoldingRow(ticker: string) {
    // Wait for holdings table
    await this.page.waitForSelector("table tbody tr, [class*='holding']", {
      timeout: this.config.timeout,
    });

    // Find the row containing the ticker
    const rows = await this.page.$$("table tbody tr, [class*='holding']");
    for (const row of rows) {
      const text = await row.textContent();
      if (text && text.includes(ticker)) {
        return row;
      }
    }
    return null;
  }

  /** Select full quantity for a sell order */
  private async selectFullQuantity(ticker: string): Promise<void> {
    // Try "Sell All" button first
    const sellAllBtn = await this.page.$(
      'button:has-text("Sell All"), button:has-text("Full"), [data-testid="sell-all"]',
    );
    if (sellAllBtn) {
      await sellAllBtn.click();
      return;
    }

    // Try percentage selector (100%)
    const fullPctBtn = await this.page.$(
      'button:has-text("100%"), [data-value="100"], input[value="100"]',
    );
    if (fullPctBtn) {
      await fullPctBtn.click();
      return;
    }

    // Fall back to checking "all units" checkbox
    const allUnitsCheckbox = await this.page.$(
      'input[type="checkbox"][name*="all"], label:has-text("All units") input',
    );
    if (allUnitsCheckbox) {
      await allUnitsCheckbox.check();
      return;
    }

    log.warn("Could not find 'Sell All' control, proceeding with default quantity", { ticker });
  }

  /** Confirm a trade order (common for both buy and sell) */
  private async confirmOrder(action: string): Promise<void> {
    log.info("Confirming order", { action });

    // Click confirm/submit
    await this.page.click(
      `button:has-text("Confirm"), button:has-text("Submit"), button:has-text("Place Order"), [data-testid="confirm-order"]`,
    );
    await this.page.waitForLoadState("networkidle");

    // Wait for confirmation message
    await this.page.waitForSelector(
      '[class*="success"], [class*="confirmation"], [data-testid="order-confirmed"]',
      { timeout: this.config.timeout },
    );

    log.info("Order confirmed", { action });
  }
}
