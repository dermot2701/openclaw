/**
 * Hub24 Rebalance Workflow
 *
 * Orchestrates the full rebalance process for a single client account:
 * 1. Select client -> Aggregated Trade
 * 2. Sell all VGS holdings (full position)
 * 3. Buy VGAD with the proceeds
 * 4. Generate ROA
 * 5. Follow ROA options to set up a pending order
 * 6. Send email to client using correct templates
 */

import type { Page } from "playwright-core";
import { createLogger } from "./logger.js";
import { delay, navigateBack, takeScreenshot } from "./helpers.js";
import { PortfolioPage } from "./pages/portfolio.js";
import { TradePage } from "./pages/trade.js";
import { ROAPage } from "./pages/roa.js";
import { EmailPage } from "./pages/email.js";
import type {
  ClientAccount,
  Hub24Config,
  RebalanceResult,
  RebalanceStep,
} from "./types.js";

const log = createLogger("hub24:rebalance");

/**
 * Execute the full rebalance workflow for a single client account.
 * Returns a result object with status and completed steps.
 */
export async function rebalanceAccount(
  page: Page,
  account: ClientAccount,
  config: Hub24Config,
): Promise<RebalanceResult> {
  const completedSteps: RebalanceStep[] = [];
  const portfolio = new PortfolioPage(page, config);
  const trade = new TradePage(page, config);
  const roa = new ROAPage(page, config);
  const email = new EmailPage(page, config);

  log.info("Starting rebalance for account", {
    client: account.name,
    accountId: account.accountId,
  });

  try {
    // Step 1: Select client account
    await portfolio.selectClientAccount(account);
    completedSteps.push("selected_account");
    await takeScreenshot(page, config.screenshotDir, `${account.accountId}-1-selected`);
    await delay(config.operationDelay);

    // Step 2: Open Aggregated Trade
    await trade.openAggregatedTrade();
    completedSteps.push("opened_aggregated_trade");
    await takeScreenshot(page, config.screenshotDir, `${account.accountId}-2-agg-trade`);
    await delay(config.operationDelay);

    // Step 3: Sell all VGS holdings
    const sellResult = await trade.sellFullPosition(config.sellTicker);
    completedSteps.push("sold_holdings");
    account.holdingQuantity = sellResult.quantity;
    account.holdingValue = sellResult.value;
    await takeScreenshot(page, config.screenshotDir, `${account.accountId}-3-sold-${config.sellTicker}`);
    await delay(config.operationDelay);

    // Step 4: Buy VGAD with the proceeds
    const buyAmount = sellResult.value;
    if (buyAmount <= 0 && !config.dryRun) {
      log.warn("No proceeds from sale, skipping buy", {
        client: account.name,
        sellTicker: config.sellTicker,
      });
      return {
        account,
        status: "skipped",
        completedSteps,
        error: `No ${config.sellTicker} holdings to sell`,
        completedAt: new Date().toISOString(),
      };
    }
    await trade.buyWithProceeds(config.buyTicker, buyAmount);
    completedSteps.push("bought_replacement");
    await takeScreenshot(page, config.screenshotDir, `${account.accountId}-4-bought-${config.buyTicker}`);
    await delay(config.operationDelay);

    // Step 5: Generate ROA
    await roa.generateROA();
    completedSteps.push("generated_roa");
    await takeScreenshot(page, config.screenshotDir, `${account.accountId}-5-roa`);
    await delay(config.operationDelay);

    // Step 6: Follow ROA options to set up pending order
    await roa.setupPendingOrder();
    completedSteps.push("setup_pending_order");
    await takeScreenshot(page, config.screenshotDir, `${account.accountId}-6-pending-order`);
    await delay(config.operationDelay);

    // Step 7: Send email to client
    await email.sendClientEmail(account);
    completedSteps.push("sent_email");
    await takeScreenshot(page, config.screenshotDir, `${account.accountId}-7-email-sent`);

    log.info("Rebalance completed successfully", {
      client: account.name,
      accountId: account.accountId,
      steps: completedSteps.length,
    });

    return {
      account,
      status: "success",
      completedSteps,
      completedAt: new Date().toISOString(),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error("Rebalance failed", {
      client: account.name,
      accountId: account.accountId,
      step: completedSteps.length,
      error: errorMessage,
    });

    await takeScreenshot(
      page,
      config.screenshotDir,
      `${account.accountId}-error-step${completedSteps.length}`,
    );

    return {
      account,
      status: "failed",
      completedSteps,
      error: errorMessage,
      completedAt: new Date().toISOString(),
    };
  }
}

/**
 * Rebalance all client accounts in a model portfolio.
 * Iterates through each account, executes the workflow, and navigates back.
 */
export async function rebalanceAllAccounts(
  page: Page,
  accounts: ClientAccount[],
  config: Hub24Config,
): Promise<RebalanceResult[]> {
  const results: RebalanceResult[] = [];

  log.info("Starting batch rebalance", {
    portfolio: config.modelPortfolioName,
    totalAccounts: accounts.length,
    dryRun: config.dryRun,
  });

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i]!;

    log.info(`Processing account ${i + 1}/${accounts.length}`, {
      client: account.name,
      accountId: account.accountId,
    });

    const result = await rebalanceAccount(page, account, config);
    results.push(result);

    // Navigate back to portfolio list for the next account (unless last)
    if (i < accounts.length - 1) {
      await navigateBack(page);
      await delay(config.operationDelay);
    }
  }

  // Log summary
  const successful = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  log.info("Batch rebalance complete", {
    total: accounts.length,
    successful,
    failed,
    skipped,
  });

  return results;
}
