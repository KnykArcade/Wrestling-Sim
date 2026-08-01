import { expect, test } from "@playwright/test";

test("finalizes a card and persists TEW entry progress", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Planned Shows" }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL Saturday Night");
  await page.getByLabel("Company").fill("PWL");
  await page.getByRole("button", { name: "Add Match" }).click();

  const match = page.locator('[data-segment-type="match"]');
  await match.getByLabel("Segment name").fill("PWL Championship Match");
  await match.getByLabel("Planned winner").fill("Bret Hart");
  await match.getByLabel("Planned finish").fill("Submission");
  await match.getByLabel("Full match story").fill("Bret controls the knee and wins with the Sharpshooter.");
  await match.getByLabel("Manual worker name").fill("Bret Hart");
  await match.getByRole("button", { name: "Add Manual Worker" }).click();

  await page.getByRole("button", { name: "TEW Handoff" }).click();
  await expect(page.getByRole("heading", { name: "Finalize the card here, then enter it into TEW without losing the creative plan" })).toBeVisible();
  await page.getByRole("button", { name: "Finalize for TEW" }).first().click();
  await expect(page.getByText("Version 1", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /PWL Saturday Night · Version 1/ })).toBeVisible();

  await page.getByRole("button", { name: "Begin TEW Entry" }).click();
  await expect(page.getByRole("heading", { name: "0 of 1 segments entered into TEW" })).toBeVisible();
  await page.getByText("Mark entire segment entered").click();
  await expect(page.getByRole("heading", { name: "1 of 1 segments entered into TEW" })).toBeVisible();
  await page.getByText("Show created in TEW").click();
  await page.getByText("Running order confirmed").click();

  await page.reload();
  await page.getByRole("button", { name: "TEW Handoff" }).click();
  await page.getByRole("button", { name: "Entry Assistant" }).click();
  await expect(page.getByRole("heading", { name: "1 of 1 segments entered into TEW" })).toBeVisible();
  await expect(page.getByText("Checklist").locator("..").getByText("2/11")).toBeVisible();
});
