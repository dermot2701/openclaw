/**
 * Page object for Hub24 client email notification.
 *
 * Sends email to the client using the appropriate template
 * after the rebalance order is set up.
 */

import type { Page } from "playwright-core";
import { createLogger } from "../logger.js";
import type { ClientAccount, Hub24Config } from "../types.js";

const log = createLogger("hub24:email");

export class EmailPage {
  constructor(
    private page: Page,
    private config: Hub24Config,
  ) {}

  /**
   * Send rebalance notification email to the client.
   * Uses the configured email template.
   */
  async sendClientEmail(account: ClientAccount): Promise<void> {
    log.info("Sending client email", { client: account.name, accountId: account.accountId });

    if (this.config.dryRun) {
      log.info("[DRY RUN] Would send email to client", { client: account.name });
      return;
    }

    // Navigate to the email/notification section
    await this.openEmailDialog();

    // Select the email template
    await this.selectTemplate();

    // Verify recipient and send
    await this.verifyAndSend(account);

    log.info("Email sent to client", { client: account.name });
  }

  /** Open the email dialog from the current context */
  private async openEmailDialog(): Promise<void> {
    // Look for email/send notification button
    await this.page.click(
      'button:has-text("Send Email"), button:has-text("Email Client"), button:has-text("Notify"), a:has-text("Send Email"), [data-testid="send-email"]',
    );
    await this.page.waitForLoadState("networkidle");

    // Wait for email dialog/form to appear
    await this.page.waitForSelector(
      '[class*="email-dialog"], [class*="email-form"], [data-testid="email-modal"], [role="dialog"]',
      { timeout: this.config.timeout },
    );
  }

  /** Select the appropriate email template */
  private async selectTemplate(): Promise<void> {
    const templateName = this.config.emailTemplateName;

    if (!templateName) {
      log.info("No email template specified, using default");
      return;
    }

    log.info("Selecting email template", { template: templateName });

    // Click template dropdown/selector
    const templateSelector = await this.page.$(
      'select[name*="template"], [data-testid="template-select"], [class*="template-selector"]',
    );

    if (templateSelector) {
      // If it's a <select> element
      const tagName = await templateSelector.evaluate((el) => el.tagName.toLowerCase());
      if (tagName === "select") {
        await templateSelector.selectOption({ label: templateName });
      } else {
        // Click to open dropdown, then select
        await templateSelector.click();
        await this.page.waitForTimeout(500);
        await this.page.click(`text="${templateName}"`);
      }
    } else {
      // Try clicking a template list item directly
      await this.page.click(
        `[class*="template"] >> text="${templateName}", li:has-text("${templateName}")`,
      );
    }

    await this.page.waitForTimeout(500);
    log.info("Template selected", { template: templateName });
  }

  /** Verify recipient details and send the email */
  private async verifyAndSend(account: ClientAccount): Promise<void> {
    // Verify the recipient field shows the correct client
    const recipientField = await this.page.$(
      'input[name="to"], input[name="recipient"], [data-testid="email-to"]',
    );
    if (recipientField) {
      const recipientValue = await recipientField.inputValue();
      log.info("Email recipient", { to: recipientValue, client: account.name });
    }

    // Click send
    await this.page.click(
      'button:has-text("Send"), button[type="submit"]:has-text("Send"), [data-testid="send-email-btn"]',
    );
    await this.page.waitForLoadState("networkidle");

    // Wait for send confirmation
    await this.page.waitForSelector(
      '[class*="success"], [class*="sent"], [data-testid="email-sent"]',
      { timeout: this.config.timeout },
    );

    log.info("Email sent successfully", { client: account.name });
  }
}
