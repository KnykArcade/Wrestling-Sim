import { expect, test } from "@playwright/test";
import { openAdvancedTools } from "./helpers";

test("runs one angle from creative output through permanent lineage and inline TEW entry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Open one show, finish every segment, enter it in TEW, and reconcile the actual result" })).toBeVisible();

  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Planned Shows", exact: true }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL Session Test");
  await page.getByLabel("Company").fill("PWL");
  await page.getByLabel("Venue / location").fill("PWL Arena");
  await page.getByRole("button", { name: "Add Angle" }).click();
  const angle = page.locator('[data-segment-type="angle"]').first();
  await angle.getByLabel("Segment name").fill("Opening Confrontation");
  await angle.getByLabel("Manual worker name").fill("Jay White");
  await angle.getByRole("button", { name: "Add Manual Worker" }).click();
  await angle.getByLabel("Full Segment Output").fill("Jay White claims the league belongs to him and PAC interrupts to reject that claim.");
  await expect(page.locator(".save-state")).toHaveText("Saved");

  await page.getByRole("button", { name: "Show Session" }).click();
  await expect(page.getByLabel("Show session planned show").locator("option:checked")).toContainText("PWL Session Test");
  await page.getByRole("button", { name: /Opening Confrontation/ }).click();
  await expect(page.getByRole("heading", { name: "Opening Confrontation" }).first()).toBeVisible();
  await expect(page.getByText("Creative In Progress", { exact: true }).first()).toBeVisible();

  await expect(page.getByRole("heading", { name: "Create Generated Draft checkpoint" })).toBeVisible();
  await page.getByRole("button", { name: "Create Checkpoint" }).click();
  await expect(page.getByText("checkpoint created", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "2. Approaches & Output" }).click();
  await page.getByRole("button", { name: "Mark Current Output Applied" }).click();
  await expect(page.getByRole("heading", { name: "Create Applied Output checkpoint" })).toBeVisible();
  await page.getByRole("button", { name: "Create Checkpoint" }).click();

  await page.getByRole("button", { name: "3. Production Package" }).click();
  await expect(page.getByRole("heading", { name: "Angle Production Package" })).toBeVisible();
  await page.getByRole("button", { name: "Mark Ready for TEW" }).click();
  await expect(page.getByRole("heading", { name: "Create Ready for TEW checkpoint" })).toBeVisible();
  await page.getByRole("button", { name: "Create Checkpoint" }).click();

  await page.getByRole("button", { name: "Generate Inline TEW Entry" }).click();
  await expect(page.getByRole("heading", { name: "Opening Confrontation" }).first()).toBeVisible();
  await expect(page.getByText("Direct TEW Field", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Mark Segment Entered in TEW" }).click();
  await expect(page.getByText("Entered", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create Entered in TEW Version checkpoint" })).toBeVisible();
  await page.getByRole("button", { name: "Create Checkpoint" }).click();

  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem("tew-story-tracker:output-library:v1");
    const data = raw ? JSON.parse(raw) as { items?: Array<{ versions?: Array<{ stage?: string }> }> } : {};
    return data.items?.[0]?.versions?.map((version) => version.stage).join("|") ?? "";
  })).toContain("Generated Draft|Applied Output|Ready for TEW|Entered in TEW Version");

  await page.reload();
  await expect(page.getByRole("button", { name: "4. TEW Entry" })).toHaveClass(/active/);
  await expect(page.getByRole("heading", { name: "Opening Confrontation" }).first()).toBeVisible();
  await expect(page.getByText("Entered", { exact: true }).first()).toBeVisible();
});
