/**
 * Hub24 authentication module.
 *
 * Handles login to the Hub24 portal including optional TOTP 2FA.
 * Assumes the existing hub24 codebase already handles the core auth flow;
 * this module wraps it with Playwright browser session management.
 */

import type { Browser, BrowserContext, Page } from "playwright-core";
import { chromium } from "playwright-core";
import type { Hub24Config } from "./types.js";
import { createLogger } from "./logger.js";

const log = createLogger("hub24:auth");

export type Hub24Session = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
};

/** Launch browser and authenticate to Hub24 */
export async function login(config: Hub24Config): Promise<Hub24Session> {
  log.info("Launching browser", { headless: config.headless });

  const browser = await chromium.launch({
    headless: config.headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  page.setDefaultTimeout(config.timeout);

  try {
    await performLogin(page, config);
  } catch (err) {
    await browser.close();
    throw err;
  }

  const session: Hub24Session = {
    browser,
    context,
    page,
    close: async () => {
      await browser.close();
      log.info("Browser session closed");
    },
  };

  return session;
}

async function performLogin(page: Page, config: Hub24Config): Promise<void> {
  const { credentials, baseUrl } = config;

  log.info("Navigating to Hub24 login", { baseUrl });
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });

  // Enter username
  log.info("Entering credentials");
  await page.fill('input[name="username"], input[id="username"], input[type="email"]', credentials.username);
  await page.fill('input[name="password"], input[id="password"], input[type="password"]', credentials.password);

  // Click login button
  await page.click('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")');

  // Wait for either 2FA prompt or successful login
  await page.waitForLoadState("networkidle");

  // Handle TOTP 2FA if present
  const totpInput = await page.$('input[name="totp"], input[name="code"], input[id="mfa-code"]');
  if (totpInput && credentials.totpSecret) {
    log.info("2FA detected, entering TOTP code");
    const totp = generateTOTP(credentials.totpSecret);
    await totpInput.fill(totp);
    await page.click('button[type="submit"], button:has-text("Verify"), button:has-text("Submit")');
    await page.waitForLoadState("networkidle");
  } else if (totpInput && !credentials.totpSecret) {
    throw new Error("2FA required but no TOTP secret configured. Set HUB24_TOTP_SECRET.");
  }

  // Verify login succeeded by waiting for dashboard
  await page.waitForSelector('[class*="dashboard"], [class*="home"], nav[class*="main"]', {
    timeout: config.timeout,
  });

  log.info("Login successful");
}

/**
 * Generate a TOTP code from a secret.
 * Simple HMAC-based implementation for 6-digit codes with 30s window.
 */
function generateTOTP(secret: string): string {
  // Use Node crypto for HMAC-SHA1 TOTP generation
  const crypto = require("crypto") as typeof import("crypto");

  // Decode base32 secret
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    const val = base32Chars.indexOf(c);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const keyBytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < keyBytes.length; i++) {
    keyBytes[i] = parseInt(bits.slice(i * 8, (i + 1) * 8), 2);
  }

  // Time-based counter (30-second window)
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter & 0xffffffff, 4);

  // HMAC-SHA1
  const hmac = crypto.createHmac("sha1", keyBytes);
  hmac.update(counterBuf);
  const hash = hmac.digest();

  // Dynamic truncation
  const offset = hash[hash.length - 1]! & 0xf;
  const binary =
    ((hash[offset]! & 0x7f) << 24) |
    ((hash[offset + 1]! & 0xff) << 16) |
    ((hash[offset + 2]! & 0xff) << 8) |
    (hash[offset + 3]! & 0xff);

  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, "0");
}
