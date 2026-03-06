/** Hub24 rebalance automation types */

export type Hub24Credentials = {
  username: string;
  password: string;
  /** TOTP secret for 2FA if enabled */
  totpSecret?: string;
};

export type Hub24Config = {
  credentials: Hub24Credentials;
  /** Base URL for Hub24 platform */
  baseUrl: string;
  /** Model portfolio name to rebalance */
  modelPortfolioName: string;
  /** Ticker to sell (full position) */
  sellTicker: string;
  /** Ticker to buy with proceeds */
  buyTicker: string;
  /** Email template name for client notification */
  emailTemplateName?: string;
  /** Headless browser mode */
  headless: boolean;
  /** Timeout for page operations in ms */
  timeout: number;
  /** Delay between operations in ms (rate limiting) */
  operationDelay: number;
  /** Screenshot directory for debugging */
  screenshotDir?: string;
  /** Dry run - log actions without executing trades */
  dryRun: boolean;
};

export type ClientAccount = {
  /** Client name as displayed in Hub24 */
  name: string;
  /** Account number / identifier */
  accountId: string;
  /** Current VGS holding quantity (populated during discovery) */
  holdingQuantity?: number;
  /** Current VGS holding value (populated during discovery) */
  holdingValue?: number;
};

export type RebalanceResult = {
  account: ClientAccount;
  status: "success" | "failed" | "skipped";
  /** Steps completed before failure (if any) */
  completedSteps: RebalanceStep[];
  /** Error message if failed */
  error?: string;
  /** Timestamp of completion */
  completedAt: string;
};

export type RebalanceStep =
  | "selected_account"
  | "opened_aggregated_trade"
  | "sold_holdings"
  | "bought_replacement"
  | "generated_roa"
  | "setup_pending_order"
  | "sent_email";

export const REBALANCE_STEPS: RebalanceStep[] = [
  "selected_account",
  "opened_aggregated_trade",
  "sold_holdings",
  "bought_replacement",
  "generated_roa",
  "setup_pending_order",
  "sent_email",
];

export type RebalanceSummary = {
  modelPortfolio: string;
  totalAccounts: number;
  successful: number;
  failed: number;
  skipped: number;
  results: RebalanceResult[];
  startedAt: string;
  completedAt: string;
};
