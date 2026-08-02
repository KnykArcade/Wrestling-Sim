import type { Page } from "@playwright/test";

export async function openAdvancedTools(page: Page): Promise<void> {
  const showButton = page.getByRole("button", { name: "Show Advanced Tools", exact: true });
  if (await showButton.isVisible().catch(() => false)) await showButton.click();
  const details = page.locator("details.advanced-tools-menu");
  if (await details.count()) {
    const isOpen = await details.evaluate((element) => (element as HTMLDetailsElement).open);
    if (!isOpen) await details.locator("summary").click();
  }
}
