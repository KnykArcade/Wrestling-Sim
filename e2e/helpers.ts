import type { Page } from "@playwright/test";

export async function openAdvancedTools(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: /^(Show|Hide) Advanced Tools$/ });
  await toggle.waitFor({ state: "visible" });
  if ((await toggle.textContent())?.trim() === "Show Advanced Tools") await toggle.click();

  const details = page.locator("details.advanced-tools-menu");
  await details.waitFor({ state: "attached" });
  const isOpen = await details.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) await details.locator("summary").click();
}
