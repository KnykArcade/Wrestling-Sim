import { expect, test } from "@playwright/test";

const skills = Object.fromEntries(["Aerial", "Athleticism", "Basics", "Brawling", "Charisma", "Consistency", "Flashiness", "Hardcore", "Menace", "Power", "Psychology", "Puroresu", "Resilience", "Safety", "Selling", "Stamina", "Technical", "Toughness"].map((skill) => [skill, 70]));
const flags = { wrestler: true, occasionalWrestler: false, referee: false, announcer: false, colourCommentator: false, manager: false, onScreenPersonality: false, roadAgent: false };
const metrics = { bodyHealth: 100, popularityRating: 70, staminaRating: 70, staminaCapacity: 6, realInRingExperience: 70, matchHealth: 95, crowdWork: 70, perceptionRating: 4, gimmickStarRating: 4, overallApproachRating15: 70, overallRating: 72, fanRating: 4, botchRisk: 8, approachRatings: {} };

const record = {
  id: "e2e-starting-universe",
  name: "Pro Wrestling League Starting Universe",
  mode: "Standalone Universe",
  status: "Review Required",
  source: { format: "TEW ZIP CSV", fileName: "pwl-start.zip", fileSize: 1000, fingerprint: "e2e-pwl-source", importedAt: "2019-01-01T00:00:00.000Z", gameDate: "01/02/2019", gameStartDate: "01/01/2019", databaseTitle: "PWL", databaseVersion: "1", tableNames: [], warnings: [] },
  playableCompanyId: "pwl",
  companies: [{ id: "pwl", name: "Pro Wrestling League", initials: "PWL", profile: "", active: true, userControlled: true, basedIn: "USA", size: "Medium", prestige: 70, ranking: 1, momentum: 75, money: 1000000, ownerName: "", headBookerName: "", styleName: "", productBase: "" }],
  workers: [
    { id: "w1", name: "Roderick Strong", active: true, basedIn: "USA", status: "Active", style: "Technician", bodyType: "", nationality: "American", race: "", height: "", weight: 210, debut: "", birthday: "", picture: "", profile: "", flags, physical: { head: 100, body: 100, arms: 100, legs: 100 }, skills, looks: 70, starQuality: 70, reputation: 70, respect: 70, experience: 70, popularity: {} },
    { id: "w2", name: "Trevor Mann", active: true, basedIn: "USA", status: "Active", style: "High Flyer", bodyType: "", nationality: "American", race: "", height: "", weight: 190, debut: "", birthday: "", picture: "", profile: "", flags, physical: { head: 100, body: 100, arms: 100, legs: 100 }, skills, looks: 75, starQuality: 80, reputation: 70, respect: 70, experience: 70, popularity: {} },
  ],
  contracts: [
    { id: "pwl:w1", companyId: "pwl", companyName: "Pro Wrestling League", workerId: "w1", workerName: "Roderick Strong", ringName: "Roderick Strong", shortName: "Strong", perception: "Well Known", babyface: false, gimmick: "Technical master", gimmickRating: 80, rosterUsage: "", intendedRole: "", brand: "Power Hour", momentum: 74, exclusive: true, written: true, daysLeft: 365, datesLeft: 0, amount: 0, downside: 0, contractBegan: "2018-01-01", debuted: "", flags },
    { id: "pwl:w2", companyId: "pwl", companyName: "Pro Wrestling League", workerId: "w2", workerName: "Trevor Mann", ringName: "Ricochet", shortName: "Ricochet", perception: "Well Known", babyface: true, gimmick: "One and only", gimmickRating: 85, rosterUsage: "", intendedRole: "", brand: "Power Hour", momentum: 81, exclusive: true, written: true, daysLeft: 365, datesLeft: 0, amount: 0, downside: 0, contractBegan: "2018-01-01", debuted: "", flags },
  ],
  titles: [{ id: "world", companyId: "pwl", companyName: "Pro Wrestling League", importedName: "PWL World Championship", style: "Singles", level: "World", prestige: 80, function: "", active: true, holderIds: ["w1"], holderNames: ["Roderick Strong"], defences: 2, annualTitle: false, annualEvent: "", reignBegan: "12/01/2018", lastDefence: "12/29/2018", genderLimit: "", minimumWeight: 0, maximumWeight: 0 }],
  tvShows: [{ id: "pwl:power", companyId: "pwl", companyName: "Pro Wrestling League", importedName: "PWL Power Hour", prestige: 70, bShow: false, lengthMinutes: 60, brand: "Power Hour", showDay: "Wednesday", currentlyOnAir: true, dormant: false, announcerNames: [] }],
  tagTeamVariants: [{ id: "team", name: "Technical Flight", companyId: "pwl", companyName: "Pro Wrestling League", worker1Id: "w1", worker1Name: "Roderick Strong", worker2Id: "w2", worker2Name: "Ricochet", teamType: "Regular", experience: 70, finisher: "", active: true, formed: "" }],
  stables: [], relationships: [], attributes: [],
  review: { roster: [{ workerId: "w1", contractId: "pwl:w1", included: true, rosterClass: "Wrestler", primaryRole: "Wrestler", addedFromWorld: false, note: "", workbookMetrics: metrics }, { workerId: "w2", contractId: "pwl:w2", included: true, rosterClass: "Wrestler", primaryRole: "Wrestler", addedFromWorld: false, note: "", workbookMetrics: metrics }], titles: [{ titleId: "world", included: true, gameName: "PWL World Championship", acknowledged: true, note: "" }], tvShows: [{ tvShowId: "pwl:power", included: true, gameName: "PWL Power Hour", lengthMinutes: 60, showDay: "Wednesday", acknowledged: true }], tagTeams: [{ id: "w1:w2", workerIds: ["w1", "w2"], workerNames: ["Roderick Strong", "Ricochet"], selectedVariantId: "team", included: true, gameName: "Technical Flight", acknowledged: true, variantIds: ["team"], note: "" }], stables: [], issues: [], rosterAcknowledged: true, titlesAcknowledged: true, teamsAcknowledged: true },
  approachFormulaVersion: "test-v1", createdAt: "2019-01-01T00:00:00.000Z", updatedAt: "2019-01-01T00:00:00.000Z", confirmedAt: "",
};

test("quick load activates the complete universe and shows a repeat-safe report", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async (universe) => {
    localStorage.clear();
    const manifest = { id: universe.id, name: universe.name, status: universe.status, mode: universe.mode, playableCompanyId: universe.playableCompanyId, playableCompanyName: "Pro Wrestling League", sourceFormat: universe.source.format, sourceFileName: universe.source.fileName, sourceFingerprint: universe.source.fingerprint, gameDate: universe.source.gameDate, companyCount: 1, workerCount: 2, contractCount: 2, rosterCount: 2, titleCount: 1, tagTeamCount: 1, approachFormulaVersion: universe.approachFormulaVersion, estimatedBytes: 1000, createdAt: universe.createdAt, updatedAt: universe.updatedAt, confirmedAt: "" };
    localStorage.setItem("wrestling-sim:starting-universe-state:v1", JSON.stringify({ manifest: [manifest], activeUniverseId: universe.id, selectedTab: "source", lastExportedAt: "", lastImportedAt: "" }));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("wrestling-sim-starting-universe", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("universes", { keyPath: "id" });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction("universes", "readwrite");
        transaction.objectStore("universes").put(universe);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, record);

  await page.getByRole("button", { name: "Starting Universe" }).click();
  await expect(page.getByRole("heading", { name: "Pro Wrestling League Starting Universe" })).toBeVisible();
  await page.getByRole("button", { name: "Load Universe and Start" }).click();
  await expect(page.getByRole("heading", { name: "Pro Wrestling League", exact: true })).toBeVisible();
  await expect(page.getByLabel("Starting Universe activation report")).toContainText("Worker Hub");
  await expect(page.getByLabel("Starting Universe activation report")).toContainText("Championships");
  await expect(page.getByLabel("Starting Universe activation report")).toContainText("Television");
  await expect(page.getByRole("button", { name: "Activate Universe Again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to Main Game" })).toBeVisible();

  const activated = await page.evaluate(() => ({
    workers: JSON.parse(localStorage.getItem("tew-story-tracker:workers:v1") || "{}"),
    titles: JSON.parse(localStorage.getItem("tew-story-tracker:championships:v1") || "{}"),
    schedule: JSON.parse(localStorage.getItem("tew-story-tracker:promotion-schedule:v1") || "{}"),
    active: JSON.parse(localStorage.getItem("wrestling-sim:starting-universe-activation:v1") || "{}"),
  }));
  expect(activated.workers.profiles).toHaveLength(2);
  expect(activated.workers.relationships).toHaveLength(1);
  expect(activated.titles.championships).toHaveLength(1);
  expect(activated.schedule.series).toHaveLength(1);
  expect(activated.active).toMatchObject({ activeCompanyName: "Pro Wrestling League", gameDate: "2019-01-02" });

  await page.getByRole("button", { name: "Activate Universe Again" }).click();
  const afterRepeat = await page.evaluate(() => ({ workers: JSON.parse(localStorage.getItem("tew-story-tracker:workers:v1") || "{}"), titles: JSON.parse(localStorage.getItem("tew-story-tracker:championships:v1") || "{}"), schedule: JSON.parse(localStorage.getItem("tew-story-tracker:promotion-schedule:v1") || "{}") }));
  expect(afterRepeat.workers.profiles).toHaveLength(2);
  expect(afterRepeat.workers.relationships).toHaveLength(1);
  expect(afterRepeat.titles.championships).toHaveLength(1);
  expect(afterRepeat.schedule.series).toHaveLength(1);

  await page.getByRole("button", { name: "Continue to Main Game" }).click();
  await expect(page.getByRole("heading", { name: /Your current TEW snapshot/ })).toBeVisible();
});
