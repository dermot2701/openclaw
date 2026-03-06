import type { Hub24Config } from "./types.js";

/** Default configuration - override via environment variables or direct config */
export function createDefaultConfig(overrides?: Partial<Hub24Config>): Hub24Config {
  return {
    credentials: {
      username: process.env.HUB24_USERNAME ?? "",
      password: process.env.HUB24_PASSWORD ?? "",
      totpSecret: process.env.HUB24_TOTP_SECRET,
    },
    baseUrl: process.env.HUB24_BASE_URL ?? "https://portal.hub24.com.au",
    modelPortfolioName: "NJBFS 50% Model Portfolio",
    sellTicker: "VGS",
    buyTicker: "VGAD",
    headless: process.env.HUB24_HEADLESS !== "false",
    timeout: Number(process.env.HUB24_TIMEOUT) || 30_000,
    operationDelay: Number(process.env.HUB24_DELAY) || 2_000,
    screenshotDir: process.env.HUB24_SCREENSHOT_DIR,
    dryRun: process.env.HUB24_DRY_RUN === "true",
    ...overrides,
  };
}

export function validateConfig(config: Hub24Config): void {
  if (!config.credentials.username || !config.credentials.password) {
    throw new Error(
      "Hub24 credentials required. Set HUB24_USERNAME and HUB24_PASSWORD environment variables.",
    );
  }
  if (!config.modelPortfolioName) {
    throw new Error("Model portfolio name is required.");
  }
  if (!config.sellTicker || !config.buyTicker) {
    throw new Error("Both sellTicker and buyTicker must be specified.");
  }
}
