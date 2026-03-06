/**
 * Page object for Hub24 Record of Advice (ROA) generation.
 *
 * Handles generating the ROA document and navigating ROA options
 * to set up a pending order.
 */

import type { Page } from "playwright-core";
import { createLogger } from "../logger.js";
import type { Hub24Config } from "../types.js";

const log = createLogger("hub24:roa");

export class ROAPage {
  constructor(
    private page: Page,
    private config: Hub24Config,
  ) {}

  /** Generate the ROA for the current trade setup */
  async generateROA(): Promise<void> {
    log.info("Generating ROA");

    if (this.config.dryRun) {
      log.info("[DRY RUN] Would generate ROA");
      return;
    }

    // Click Generate ROA button
    await this.page.click(
      'button:has-text("Generate ROA"), button:has-text("Create ROA"), a:has-text("Generate ROA"), [data-testid="generate-roa"]',
    );
    await this.page.waitForLoadState("networkidle");

    // Wait for ROA generation to complete (may take a few seconds)
    await this.page.waitForSelector(
      '[class*="roa-complete"], [class*="roa-generated"], [data-testid="roa-ready"]',
      { timeout: this.config.timeout * 2 },
    );

    log.info("ROA generated successfully");
  }

  /**
   * Follow ROA options to set up a pending order.
   * After ROA generation, navigate through the options flow.
   */
  async setupPendingOrder(): Promise<void> {
    log.info("Setting up pending order from ROA");

    if (this.config.dryRun) {
      log.info("[DRY RUN] Would set up pending order");
      return;
    }

    // Click through the ROA options - typically "Proceed" or "Set up order"
    const proceedBtn = await this.page.waitForSelector(
      'button:has-text("Proceed"), button:has-text("Continue"), button:has-text("Set up order"), button:has-text("Next"), [data-testid="roa-proceed"]',
      { timeout: this.config.timeout },
    );
    await proceedBtn.click();
    await this.page.waitForLoadState("networkidle");

    // Select "Pending Order" option if a choice is presented
    const pendingOrderOption = await this.page.$(
      'label:has-text("Pending"), input[value="pending"], [data-testid="pending-order"], button:has-text("Pending Order")',
    );
    if (pendingOrderOption) {
      await pendingOrderOption.click();
      await this.page.waitForTimeout(500);
    }

    // Confirm the pending order setup
    await this.page.click(
      'button:has-text("Confirm"), button:has-text("Submit"), button:has-text("Save"), [data-testid="confirm-pending"]',
    );
    await this.page.waitForLoadState("networkidle");

    // Verify the pending order was created
    await this.page.waitForSelector(
      '[class*="pending"], [class*="order-created"], [data-testid="pending-order-confirmed"]',
      { timeout: this.config.timeout },
    );

    log.info("Pending order set up successfully");
  }
}
