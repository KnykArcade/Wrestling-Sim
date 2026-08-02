import { expect, test } from "@playwright/test";

const skills = [
  "Aerial",
  "Athleticism",
  "Basics",
  "Brawling",
  "Charisma",
  "Consistency",
  "Flashiness",
  "Hardcore",
  "Menace",
  "Power",
  "Psychology",
  "Puroresu",
  "Resilience",
  "Safety",
  "Selling",
  "Stamina",
  "Technical",
  "Toughness",
];

test("imports a roster profile with provenance and preserves it after reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Wrestler Profiles" }).click();
  await expect(page.getByRole("heading", { name: "Wrestler Profile Library and Bulk Ratings Import" })).toBeVisible();
  await expect(page.getByText("Read-only", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Bulk Ratings Import" }).click();
  const headers = ["Wrestler Name", "TEW Worker ID", "Style", "Overall", "Health", "Popularity", "Experience", "Fan Reaction", "Gimmick", ...skills];
  const values = ["Jay White", "worker-1", "All-Rounder", "82", "96", "78", "80", "4", "4", ...skills.map((_, index) => String(72 + (index % 12)))];
  const csv = `${headers.join(",")}\n${values.join(",")}\n`;
  await page.locator('input[accept*=".xlsx"]').setInputFiles({ name: "pwl-roster.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("pwl-roster.csv", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Map name")).toHaveValue("Wrestler Name");
  await expect(page.getByLabel("Map Psychology")).toHaveValue("Psychology");

  await page.getByRole("button", { name: "Review Import Rows" }).click();
  await expect(page.getByText("Jay White", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Ready", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Apply Reviewed Import" }).click();

  await expect(page.getByRole("heading", { name: "Audit and rollback history" })).toBeVisible();
  await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Profile Library" }).click();
  await expect(page.getByText("Jay White", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Ready · 100%", { exact: true })).toBeVisible();
  const overallField = page.locator(".profile-library-core-fields .field").filter({ has: page.getByLabel("Library overall") });
  await expect(page.getByLabel("Library overall")).toHaveValue("82");
  await expect(page.getByLabel("Library Psychology rating")).not.toHaveValue("60");
  await expect(overallField.getByText("Imported from workbook", { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Wrestler Profiles" }).click();
  await expect(page.getByText("Jay White", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Library overall")).toHaveValue("82");
  await page.getByRole("button", { name: "Import Sessions" }).click();
  await expect(page.getByText("pwl-roster.csv", { exact: true })).toBeVisible();
});

test("creates a manual profile with visible baseline placeholders", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Wrestler Profiles" }).click();
  await page.getByRole("button", { name: "Create Manual Profile" }).click();
  await page.getByLabel("Profile wrestler name").fill("Test Prospect");
  await expect(page.getByText("Incomplete", { exact: true }).first()).toBeVisible();
  const overallField = page.locator(".profile-library-core-fields .field").filter({ has: page.getByLabel("Library overall") });
  await expect(overallField.getByText("Baseline placeholder", { exact: true })).toBeVisible();
  await page.getByLabel("Library overall").fill("75");
  await expect(overallField.getByText("Manual override", { exact: true })).toBeVisible();
});
