import { expect, test } from "@playwright/test";
import { openAdvancedTools } from "./helpers";

test("generates and persists editable Match Story and Angle Segment Output drafts", async ({ page }) => {
  await page.goto("/");
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Planned Shows" }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL Generated Output Test");

  await page.getByRole("button", { name: "Add Match" }).click();
  const match = page.locator('[data-segment-type="match"]');
  await match.getByLabel("Segment name").fill("Jay White vs PAC");
  await match.getByLabel("Length (minutes)").fill("20");
  await match.getByLabel("Manual worker name").fill("Jay White");
  await match.getByRole("button", { name: "Add Manual Worker" }).click();
  await match.getByLabel("Manual worker name").fill("PAC");
  await match.getByRole("button", { name: "Add Manual Worker" }).click();
  await match.getByLabel("Planned winner").fill("Jay White");
  await match.getByLabel("Planned finish").fill("Pinfall after countering the Black Arrow");
  await match.getByRole("button", { name: "Run AI for All Competitors" }).click();

  const matchGenerator = match.getByLabel("Match Story generator");
  await matchGenerator.getByRole("button", { name: "Generate Editable Draft" }).click();
  await expect(matchGenerator.getByLabel("Generated match narrative")).toContainText("Jay White");
  await expect(matchGenerator.getByLabel("Generated match narrative")).toContainText("PAC");
  await matchGenerator.getByRole("button", { name: "Replace Current Output" }).click();
  await expect(match.getByLabel("Full match story")).toContainText("wins by pinfall after countering the Black Arrow");
  await expect(match.getByLabel("Key moments / spots")).toContainText("Opening:");

  await page.getByRole("button", { name: "Add Angle" }).click();
  const angle = page.locator('[data-segment-type="angle"]');
  await angle.getByLabel("Segment name").fill("Championship Challenge");
  await angle.getByLabel("Manual worker name").fill("PWL World Champion");
  await angle.getByRole("button", { name: "Add Manual Worker" }).click();
  await angle.getByLabel("Manual worker name").fill("Top Contender");
  await angle.getByRole("button", { name: "Add Manual Worker" }).click();
  await angle.getByLabel("Purpose").fill("The contender challenges the champion to a title match.");
  await angle.getByLabel("Storyline consequences").fill("The champion accepts and makes the match official.");
  await angle.getByLabel("Planned follow-up").fill("Book a contract signing next week.");
  await angle.getByLabel("Intended audience takeaway").fill("the championship match is now official");

  const angleGenerator = angle.getByLabel("Angle Segment Output generator");
  await angleGenerator.getByRole("button", { name: "Generate Editable Draft" }).click();
  await expect(angleGenerator.getByLabel("Generated angle narrative")).toContainText("The contender challenges the champion");
  await angleGenerator.getByRole("button", { name: "Replace Current Output" }).click();
  await expect(angle.getByLabel("Full Segment Output")).toContainText("the championship match is now official");

  await page.reload();
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Planned Shows" }).click();
  await expect(page.getByLabel("Show name")).toHaveValue("PWL Generated Output Test");
  await expect(page.locator('[data-segment-type="match"]').getByLabel("Full match story")).toContainText("Jay White");
  await expect(page.locator('[data-segment-type="angle"]').getByLabel("Full Segment Output")).toContainText("championship match is now official");
});
