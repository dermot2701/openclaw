/**
 * Hub24 Rebalance Automation - Main Entry Point
 *
 * Automates the rebalancing of client accounts in the
 * "NJBFS 50% Model Portfolio" on Hub24:
 *
 * For each client account:
 *   1. Select client -> Aggregated Trade
 *   2. Sell all VGS holdings (full position)
 *   3. Buy VGAD with the proceeds
 *   4. Generate ROA
 *   5. Follow ROA options to set up a pending order
 *   6. Send email to client using correct templates
 *
 * Usage:
 *   HUB24_USERNAME=xxx HUB24_PASSWORD=xxx npx ts-node aifpx/app/services/hub24/index.ts
 *
 * Environment variables:
 *   HUB24_USERNAME       - Hub24 login username (required)
 *   HUB24_PASSWORD       - Hub24 login password (required)
 *   HUB24_TOTP_SECRET    - TOTP secret for 2FA (optional)
 *   HUB24_BASE_URL       - Hub24 portal URL (default: https://portal.hub24.com.au)
 *   HUB24_HEADLESS       - Run headless (default: true, set "false" for visible browser)
 *   HUB24_TIMEOUT        - Page operation timeout in ms (default: 30000)
 *   HUB24_DELAY          - Delay between operations in ms (default: 2000)
 *   HUB24_SCREENSHOT_DIR - Directory for debug screenshots (optional)
 *   HUB24_DRY_RUN        - Log actions without executing (default: false)
 */

import { login } from "./auth.js";
import { createDefaultConfig, validateConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { PortfolioPage } from "./pages/portfolio.js";
import { rebalanceAllAccounts } from "./rebalance.js";
import type { Hub24Config, RebalanceSummary } from "./types.js";

export { login } from "./auth.js";
export { createDefaultConfig, validateConfig } from "./config.js";
export { rebalanceAccount, rebalanceAllAccounts } from "./rebalance.js";
export type {
  ClientAccount,
  Hub24Config,
  Hub24Credentials,
  RebalanceResult,
  RebalanceStep,
  RebalanceSummary,
} from "./types.js";

const log = createLogger("hub24:main");

/**
 * Run the full rebalance automation.
 * Can be called programmatically with a config override,
 * or run directly as a script using environment variables.
 */
export async function runRebalance(
  configOverrides?: Partial<Hub24Config>,
): Promise<RebalanceSummary> {
  const config = createDefaultConfig(configOverrides);
  validateConfig(config);

  const startedAt = new Date().toISOString();

  log.info("Hub24 Rebalance Automation starting", {
    portfolio: config.modelPortfolioName,
    sell: config.sellTicker,
    buy: config.buyTicker,
    dryRun: config.dryRun,
  });

  // Authenticate and get browser session
  const session = await login(config);

  try {
    const portfolio = new PortfolioPage(session.page, config);

    // Navigate to the model portfolio
    await portfolio.navigateToModelPortfolios();
    await portfolio.selectModelPortfolio(config.modelPortfolioName);

    // Discover all client accounts
    const accounts = await portfolio.discoverClientAccounts();

    if (accounts.length === 0) {
      log.warn("No client accounts found in model portfolio", {
        portfolio: config.modelPortfolioName,
      });
      return {
        modelPortfolio: config.modelPortfolioName,
        totalAccounts: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        results: [],
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }

    log.info("Found client accounts", {
      count: accounts.length,
      accounts: accounts.map((a) => a.name),
    });

    // Execute rebalance for all accounts
    const results = await rebalanceAllAccounts(session.page, accounts, config);

    const summary: RebalanceSummary = {
      modelPortfolio: config.modelPortfolioName,
      totalAccounts: accounts.length,
      successful: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "failed").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      results,
      startedAt,
      completedAt: new Date().toISOString(),
    };

    log.info("Rebalance automation complete", {
      total: summary.totalAccounts,
      successful: summary.successful,
      failed: summary.failed,
      skipped: summary.skipped,
    });

    // Log any failures for review
    for (const result of results) {
      if (result.status === "failed") {
        log.error("Failed account", {
          client: result.account.name,
          accountId: result.account.accountId,
          error: result.error,
          completedSteps: result.completedSteps,
        });
      }
    }

    return summary;
  } finally {
    await session.close();
  }
}

// Direct execution support
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/hub24/index.ts") || process.argv[1].endsWith("/hub24/index.js"));

if (isDirectRun) {
  runRebalance()
    .then((summary) => {
      console.log("\n=== REBALANCE SUMMARY ===");
      console.log(JSON.stringify(summary, null, 2));
      process.exit(summary.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      log.error("Fatal error", { error: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    });
}
