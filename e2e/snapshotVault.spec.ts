import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

function parsedSnapshot(fileName: string, afterShow = false) {
  const baseShow = {
    id: "show-1",
    name: "PWL Power Hour #1",
    date: "2026-08-01",
    rating: 78,
    attendance: 1200,
    venue: "PWL Arena",
    company: "PWL",
    broadcast: "Television",
    matches: [{
      id: "match-1",
      showId: "show-1",
      description: afterShow ? "PAC defeated Jay White" : "Jay White defeated PAC",
      rating: afterShow ? 85 : 82,
      winner: afterShow ? "PAC" : "Jay White",
      matchTime: "18:05",
      notes: afterShow ? "PAC won after a counter." : "Blade Runner finish.",
      placement: "Main Show",
      workers: [
        { id: "worker-1", name: "Jay White", role: "Competitor", side: "Side 1" },
        { id: "worker-2", name: "PAC", role: "Competitor", side: "Side 2" },
      ],
    }],
  };
  return {
    fileName,
    fileSize: afterShow ? 4096 : 3072,
    databaseCreatedAt: afterShow ? "2026-08-08T22:30:00.000Z" : "2026-08-01T22:30:00.000Z",
    importedAt: afterShow ? "2026-08-08T23:00:00.000Z" : "2026-08-01T23:00:00.000Z",
    tables: [
      { name: "tblWorkers", rowCount: afterShow ? 3 : 2, columnCount: 2, columns: ["ID", "Name"], loaded: true, truncated: false },
      { name: "tblShows", rowCount: afterShow ? 2 : 1, columnCount: 3, columns: ["ID", "Name", "Date"], loaded: true, truncated: false },
      { name: "tblMatches", rowCount: afterShow ? 2 : 1, columnCount: 4, columns: ["ID", "ShowID", "Winner", "Rating"], loaded: true, truncated: false },
      { name: "tblStorylines", rowCount: 1, columnCount: 3, columns: ["ID", "Name", "Heat"], loaded: true, truncated: false },
    ],
    workers: [
      { id: "worker-1", name: "Jay White", role: "Wrestler", side: "" },
      { id: "worker-2", name: "PAC", role: "Wrestler", side: "" },
      ...(afterShow ? [{ id: "worker-3", name: "Bandido", role: "Wrestler", side: "" }] : []),
    ],
    shows: [
      baseShow,
      ...(afterShow ? [{
        id: "show-2",
        name: "PWL Power Hour #2",
        date: "2026-08-08",
        rating: 81,
        attendance: 1325,
        venue: "PWL Arena",
        company: "PWL",
        broadcast: "Television",
        matches: [{
          id: "match-2",
          showId: "show-2",
          description: "Bandido defeated PAC",
          rating: 84,
          winner: "Bandido",
          matchTime: "17:20",
          notes: "Tournament qualifier.",
          placement: "Main Show",
          workers: [
            { id: "worker-3", name: "Bandido", role: "Competitor", side: "Side 1" },
            { id: "worker-2", name: "PAC", role: "Competitor", side: "Side 2" },
          ],
        }],
      }] : []),
    ],
    storylines: [{
      id: "story-1",
      name: "World Title Rivalry",
      description: "The champion and challenger dispute control of PWL.",
      status: afterShow ? "Completed" : "Active",
      heat: afterShow ? 80 : 72,
      workers: [
        { id: "worker-1", name: "Jay White", role: "Champion", side: "" },
        { id: "worker-2", name: "PAC", role: "Challenger", side: "" },
      ],
      sourceTable: "tblStorylines",
    }],
    diagnostics: {
      matchedTables: { workers: "tblWorkers", shows: "tblShows", matches: "tblMatches", storylines: "tblStorylines" },
      warnings: afterShow ? ["A synthetic comparison warning"] : [],
      orphanMatchCount: 0,
      unresolvedWorkerCount: 0,
    },
  };
}

function manifest(id: string, role: string, snapshot: ReturnType<typeof parsedSnapshot>) {
  return {
    id,
    fingerprint: `${id}-fingerprint`,
    fileName: snapshot.fileName,
    fileSize: snapshot.fileSize,
    databaseCreatedAt: snapshot.databaseCreatedAt,
    importedAt: snapshot.importedAt,
    role,
    notes: role === "Baseline" ? "Initial PWL reference" : "After the second episode",
    tableCount: snapshot.tables.length,
    mappedTableCount: 4,
    workerCount: snapshot.workers.length,
    showCount: snapshot.shows.length,
    matchCount: snapshot.shows.reduce((total, show) => total + show.matches.length, 0),
    storylineCount: snapshot.storylines.length,
    warningCount: snapshot.diagnostics.warnings.length,
    mappingConfidence: "Good",
    estimatedBytes: JSON.stringify(snapshot).length * 2,
    createdAt: snapshot.importedAt,
    updatedAt: snapshot.importedAt,
    lastActivatedAt: snapshot.importedAt,
  };
}

function vaultPackage() {
  const baseline = parsedSnapshot("PWL-baseline.mdb");
  const after = parsedSnapshot("PWL-after-show.mdb", true);
  const baselineManifest = manifest("snapshot-baseline", "Baseline", baseline);
  const afterManifest = manifest("snapshot-after", "After Show", after);
  const universe = {
    manifest: [afterManifest, baselineManifest],
    activeSnapshotId: "snapshot-baseline",
    baselineSnapshotId: "snapshot-baseline",
    lastPostShowSnapshotId: "snapshot-after",
    lastReconciliationSnapshotId: "",
    lastComparisonId: "",
    comparisons: [],
    promotion: {
      status: "Not Reviewed",
      promotionName: "",
      abbreviation: "",
      defaultBrand: "",
      defaultWeeklyShow: "",
      defaultShowLength: 60,
      calendarStartDate: "",
      activeSnapshotId: "snapshot-baseline",
      createdAt: "",
      updatedAt: "",
      completedAt: "",
    },
    workerDecisions: [],
    storylineDecisions: [],
    home: {
      activeTab: "home",
      lastSelectedHistoricalShowId: "",
      lastSelectedTewStorylineId: "",
      compareBeforeSnapshotId: "snapshot-baseline",
      compareAfterSnapshotId: "snapshot-after",
      lastPrimaryAction: "",
      updatedAt: "",
    },
    dataCenter: {
      retentionLimit: 12,
      storageWarningMegabytes: 80,
      lastCompleteBackupAt: "",
      lastVaultExportAt: "",
      lastRestoreAt: "",
      lastPreRestoreSafetyAt: "",
    },
  };
  return {
    product: "TEW IX Snapshot Vault",
    version: 1,
    exportedAt: "2026-08-09T00:00:00.000Z",
    universe,
    records: [
      { id: "snapshot-baseline", manifest: baselineManifest, snapshot: baseline },
      { id: "snapshot-after", manifest: afterManifest, snapshot: after },
    ],
  };
}

test("restores parsed TEW history, compares snapshots, onboards PWL, and round-trips version 21 data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Your current TEW snapshot, current show, next action/ })).toBeVisible();
  await page.getByRole("button", { name: "TEW Snapshot Vault" }).click();

  const packageValue = vaultPackage();
  await page.locator('input[accept="application/json,.json"]').first().setInputFiles({
    name: "pwl-snapshot-vault.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(packageValue)),
  });
  await expect(page.getByRole("status")).toContainText("Restored 2 parsed snapshots");
  await expect(page.getByText("PWL-baseline.mdb", { exact: true }).first()).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem("tew-story-tracker:snapshot-vault-manifest:v1");
    const data = raw ? JSON.parse(raw) as { activeSnapshotId?: string } : {};
    return data.activeSnapshotId ?? "";
  })).toBe("snapshot-baseline");
  await page.getByRole("button", { name: "TEW Snapshot Vault" }).click();

  await page.getByRole("button", { name: "Compare Supported TEW History" }).click();
  await expect(page.getByText("New Show: PWL Power Hour #2", { exact: false })).toBeVisible();
  await expect(page.getByText("Changed Match: PAC defeated Jay White", { exact: false })).toBeVisible();

  const afterCard = page.locator(".snapshot-vault-list > article").filter({ hasText: "PWL-after-show.mdb" });
  await afterCard.getByRole("button", { name: "Activate Snapshot" }).click();
  await expect(page.locator(".companion-home-active")).toContainText("PWL-after-show.mdb");

  await page.reload();
  await expect(page.locator(".companion-home-active")).toContainText("PWL-after-show.mdb");
  await page.getByRole("button", { name: "Promotion Onboarding" }).click();
  await page.getByRole("button", { name: /PWL · 2 historical shows/ }).click();
  await page.getByLabel("Onboarding promotion abbreviation").fill("PWL");
  await page.getByLabel("Onboarding default weekly show").fill("PWL Power Hour");
  await page.getByLabel("Onboarding calendar start date").fill("2026-08-01");
  await page.getByRole("button", { name: "Confirm Promotion Identity" }).click();
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();

  const bandido = page.locator(".onboarding-workers .onboarding-identity-list > article").filter({ hasText: "Bandido" });
  await bandido.getByRole("button", { name: "Create Identity-Only Profile" }).click();
  await expect(page.getByRole("status")).toContainText("Ratings Incomplete");

  const storyline = page.locator(".onboarding-storylines .onboarding-identity-list > article").filter({ hasText: "World Title Rivalry" });
  await storyline.getByRole("button", { name: "Create Tracker Storyline" }).click();
  await expect(page.getByRole("status")).toContainText("without invented future creative details");

  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem("tew-story-tracker:match-engine:v1");
    const data = raw ? JSON.parse(raw) as { profiles?: Array<{ workerId?: string; notes?: string }> } : {};
    const profile = data.profiles?.find((item) => item.workerId === "worker-3");
    return profile?.notes ?? "";
  })).toContain("Ratings remain visible baseline placeholders");
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem("tew-story-tracker:storylines:v1");
    const data = raw ? JSON.parse(raw) as Array<{ name?: string; plannedClimax?: string; milestones?: unknown[] }> : [];
    const story = data.find((item) => item.name === "World Title Rivalry");
    return `${story?.plannedClimax ?? "missing"}:${story?.milestones?.length ?? -1}`;
  })).toBe(":0");

  await page.reload();
  await page.getByRole("button", { name: "Promotion Onboarding" }).click();
  await expect(page.getByText("Created Identity-Only Profile", { exact: true })).toBeVisible();
  await expect(page.getByText("Created Tracker Storyline", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Data & Backup Center" }).click();
  const backupDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Complete Companion Backup" }).click();
  const backupDownload = await backupDownloadPromise;
  expect(backupDownload.suggestedFilename()).toContain("backup-v21");
  const backupPath = await backupDownload.path();
  expect(backupPath).not.toBeNull();
  const backup = JSON.parse(await readFile(backupPath!, "utf8")) as { version?: number; snapshotVault?: { promotion?: { promotionName?: string } } };
  expect(backup.version).toBe(21);
  expect(backup.snapshotVault?.promotion?.promotionName).toBe("PWL");

  const vaultDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Snapshot Vault Package" }).click();
  const vaultDownload = await vaultDownloadPromise;
  const vaultPath = await vaultDownload.path();
  expect(vaultPath).not.toBeNull();
  const exportedVault = JSON.parse(await readFile(vaultPath!, "utf8")) as { product?: string; records?: unknown[] };
  expect(exportedVault.product).toBe("TEW IX Snapshot Vault");
  expect(exportedVault.records).toHaveLength(2);

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Clear Snapshot Vault Only" }).click();
  await expect(page.locator(".companion-home-active")).toContainText("No stored snapshot");

  await page.locator('input[accept="application/json,.json"]').first().setInputFiles(vaultPath!);
  await expect(page.getByRole("status")).toContainText("Restored 2 parsed snapshots");
  await expect(page.locator(".companion-home-active")).toContainText("PWL-after-show.mdb");

  await page.locator('input[accept="application/json,.json"]').nth(1).setInputFiles(backupPath!);
  await expect(page.getByText("Version 21", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Confirm Restore" }).click();
  await expect(page.getByRole("heading", { name: /Your current TEW snapshot, current show, next action/ })).toBeVisible();
  await expect(page.locator(".companion-home-active")).toContainText("PWL-after-show.mdb");
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem("tew-story-tracker:snapshot-vault-manifest:v1");
    const data = raw ? JSON.parse(raw) as { promotion?: { promotionName?: string }; workerDecisions?: unknown[]; storylineDecisions?: unknown[] } : {};
    return `${data.promotion?.promotionName ?? ""}:${data.workerDecisions?.length ?? 0}:${data.storylineDecisions?.length ?? 0}`;
  })).toBe("PWL:1:1");
});
