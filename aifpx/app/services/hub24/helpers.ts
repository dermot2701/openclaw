/** Shared helpers for Hub24 automation */

import type { Page } from "playwright-core";
import { existsSync, mkdirSync } from "fs";
import { createLogger } from "./logger.js";

const log = createLogger("hub24:helpers");

/** Delay execution for a given number of milliseconds */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Take a screenshot for debugging, if screenshotDir is configured */
export async function takeScreenshot(
  page: Page,
  screenshotDir: string | undefined,
  label: string,
): Promise<void> {
  if (!screenshotDir) return;

  if (!existsSync(screenshotDir)) {
    mkdirSync(screenshotDir, { recursive: true });
  }

  const filename = `${screenshotDir}/${label}-${Date.now()}.png`;
  await page.screenshot({ path: filename, fullPage: true });
  log.debug("Screenshot saved", { path: filename });
}

/** Navigate back to the model portfolio list (for processing next account) */
export async function navigateBack(page: Page): Promise<void> {
  // Use browser back or breadcrumb navigation
  const breadcrumb = await page.$(
    'a:has-text("Model Portfolio"), [class*="breadcrumb"] a, nav[aria-label="breadcrumb"] a',
  );
  if (breadcrumb) {
    await breadcrumb.click();
  } else {
    await page.goBack();
  }
  await page.waitForLoadState("networkidle");
}
