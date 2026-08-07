import { expect, test } from "@playwright/test";

async function seedImportedWorld(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem("wrestling-sim:starting-universe-activation:v1", JSON.stringify({ activeUniverseId: "world", activeCompanyId: "pwl", activeCompanyName: "Pro Wrestling League", gameDate: "2019-01-02", activatedAt: "2019-01-02T00:00:00.000Z", nextShowId: "", ledger: {}, lastReport: null }));
    localStorage.setItem("wrestling-sim:starting-universe-state:v1", JSON.stringify({ manifest: [], activeUniverseId: "world", selectedTab: "source", lastExportedAt: "", lastImportedAt: "" }));
    const wrestlerFlags = { wrestler: true, occasionalWrestler: false, referee: false, announcer: false, colourCommentator: false, manager: false, onScreenPersonality: false, roadAgent: false };
    const staffFlags = { ...wrestlerFlags, wrestler: false, announcer: true };
    const worker = (id: string, name: string, flags = wrestlerFlags) => ({ id, name, active: true, basedIn: "USA", status: "Active", style: "", bodyType: "", nationality: "", race: "", height: "", weight: 0, debut: "", birthday: "", picture: "", profile: "", flags, physical: { head: 100, body: 100, arms: 100, legs: 100 }, skills: {}, looks: 0, starQuality: 0, reputation: 0, respect: 0, experience: 0, popularity: {} });
    const company = (id: string, name: string, active = true) => ({ id, name, initials: id.toUpperCase(), profile: "", active, userControlled: id === "pwl", basedIn: "USA", size: "Medium", prestige: 0, ranking: 0, momentum: 0, money: 0, ownerName: "", headBookerName: "", styleName: "", productBase: "" });
    const contract = (id: string, companyId: string, companyName: string, workerId: string, workerName: string, ringName = workerName) => ({ id, companyId, companyName, workerId, workerName, ringName, shortName: ringName, perception: "", babyface: true, gimmick: "", gimmickRating: null, rosterUsage: "", intendedRole: "Wrestler", brand: "", momentum: 0, exclusive: false, written: true, daysLeft: 0, datesLeft: 0, amount: 0, downside: 0, contractBegan: "", debuted: "", flags: wrestlerFlags });
    const record = {
      id: "world", name: "Imported World", mode: "Standalone Universe", status: "Confirmed", source: { format: "TEW SQLite", sourceFileName: "world.mdb", sourceFingerprint: "test", gameDate: "2019-01-02" }, playableCompanyId: "pwl",
      companies: [company("pwl", "Pro Wrestling League"), company("impact", "Impact Wrestling"), company("njpw", "New Japan Pro-Wrestling"), company("inactive", "Inactive Wrestling", false), { ...company("legacy", "This promotion biography is intentionally long and should never fill the entire company selection menu because it is not a company name."), initials: "LEG", profile: "This promotion biography is intentionally long and should never fill the entire company selection menu because it is not a company name." }],
      workers: [worker("w1", "Roderick Strong"), worker("w2", "Trevor Mann"), worker("w3", "Brian Cage"), worker("w4", "Nigel McGuinness", staffFlags), worker("w5", "PAC")],
      contracts: [contract("c1", "pwl", "Pro Wrestling League", "w1", "Roderick Strong"), contract("c2", "pwl", "Pro Wrestling League", "w2", "Trevor Mann", "Ricochet"), contract("c3", "impact", "Impact Wrestling", "w3", "Brian Cage"), contract("c4", "pwl", "Pro Wrestling League", "w4", "Nigel McGuinness")],
      titles: [], tvShows: [], tagTeamVariants: [], stables: [], relationships: [], attributes: [], review: { roster: [], titles: [], tvShows: [], tagTeams: [], stables: [], issues: [] }, approachFormulaVersion: "test", createdAt: "", updatedAt: "", confirmedAt: ""
    };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("wrestling-sim-starting-universe", 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("universes")) request.result.createObjectStore("universes", { keyPath: "id" }); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction("universes", "readwrite");
        transaction.objectStore("universes").put(record);
        transaction.oncomplete = () => { request.result.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
}

test("uses the full imported world for unrestricted company roster booking", async ({ page }) => {
  await page.goto("/");
  await seedImportedWorld(page);
  await page.reload();
  await page.getByRole("button", { name: "Create First Show" }).first().click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByRole("button", { name: "Add Match" }).click();
  const match = page.locator('[data-segment-type="match"]');
  const companies = match.getByLabel("Booking Company");
  const chooseCompany = async (name: string) => {
    await companies.click();
    await match.getByRole("option", { name, exact: true }).click();
  };

  await expect(companies).toContainText("Pro Wrestling League");
  await companies.click();
  await expect(match.getByRole("listbox", { name: "Booking company choices" }).getByRole("option")).toHaveText(["All Workers", "Free Agents", "Impact Wrestling", "Inactive Wrestling (Inactive)", "LEG", "New Japan Pro-Wrestling", "Pro Wrestling League"]);
  await expect(match.getByRole("listbox", { name: "Booking company choices" })).not.toContainText("promotion biography");
  await companies.click();
  await expect(match.getByLabel("Company wrestler").locator("option")).toHaveText(["Select a wrestler", "Ricochet", "Roderick Strong"]);
  await expect(match.getByText("Nigel McGuinness")).toHaveCount(0);

  await chooseCompany("Impact Wrestling");
  await expect(match.getByLabel("Company wrestler").locator("option")).toHaveText(["Select a wrestler", "Brian Cage"]);
  await match.getByLabel("Company wrestler").selectOption("w3");
  await match.getByRole("button", { name: "Add Wrestler" }).click();
  await chooseCompany("Pro Wrestling League");
  await match.getByLabel("Company wrestler").selectOption("w2");
  await match.getByRole("button", { name: "Add Wrestler" }).click();
  await expect(match.locator(".basic-participant-list")).toContainText("Brian Cage");
  await expect(match.locator(".basic-participant-list")).toContainText("Ricochet");

  await chooseCompany("Free Agents");
  await expect(match.getByLabel("Company wrestler").locator("option")).toHaveText(["Select a wrestler", "PAC"]);
  await chooseCompany("All Workers");
  await expect(match.getByLabel("Company wrestler").locator("option")).toContainText(["Select a wrestler", "Brian Cage · Impact Wrestling", "PAC · Free Agent", "Ricochet · Pro Wrestling League", "Roderick Strong · Pro Wrestling League"]);
});

test("uses compact TEW-style wrestler rows with rated approach dropdowns", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create First Show" }).first().click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByRole("button", { name: "Add Match" }).click();
  const match = page.locator('[data-segment-type="match"]');
  for (const name of ["Jay White", "PAC"]) {
    await match.getByLabel("Manual worker name").fill(name);
    await match.getByRole("button", { name: "Add Manual Worker" }).click();
  }

  await expect(match.getByText("Projected pace", { exact: true })).toHaveCount(0);
  await expect(match.getByText("Approach Selection Board", { exact: true })).toHaveCount(0);
  await expect(match.locator(".approach-candidate, .match-competitor-card, .selected-approach-row")).toHaveCount(0);
  await expect(match.locator(".tew-strategy-row")).toHaveCount(2);
  expect(await match.getByLabel("Length (minutes)").evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(90);
  expect(await match.getByLabel("Match aim").evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(300);
  expect(await match.getByLabel("Approach limit per wrestler").evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(100);
  expect(await match.locator(".tew-strategy-row").first().evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(70);

  const jay = match.locator('[data-match-worker="manual:jay white"]');
  await jay.getByRole("button", { name: "Jay White approach 1" }).click();
  const menu = jay.getByRole("listbox", { name: "Approach choices for Jay White, slot 1" });
  await expect(menu.locator('[role="option"]')).toHaveCount(17);
  await expect(menu.locator(".approach-slot-option--strong, .approach-slot-option--balanced, .approach-slot-option--risk")).toHaveCount(16);
  await expect(menu.locator(".approach-slot-option").nth(1)).toContainText(/\d+\.\d+Cost \d+ · Pace \d+/);
  await menu.locator(".approach-slot-option").nth(1).click();
  await expect(jay.getByRole("button", { name: "Jay White approach 1" })).toContainText(/\d+\.\d+ · Cost \d+ · Pace \d+/);
  await expect(jay.locator(".tew-strategy-result")).toContainText(/Pace \d+ ·/);
});
