import { describe, expect, test } from "vitest";
import { createMatchEngineProfile } from "../src/matchEngine/model";
import { createPlannedShow } from "../src/planner/model";
import {
  buildSnapshotSafetyWarnings,
  buildStorylineIdentityCandidates,
  buildWorkerIdentityCandidates,
  compareTewSnapshots,
  emptySnapshotVaultUniverse,
  snapshotFingerprint,
  updatePromotionIdentity,
} from "../src/snapshotVault/model";
import {
  activateStoredSnapshot,
  compareStoredSnapshots,
  createMemorySnapshotStore,
  exportSnapshotVaultPackage,
  importSnapshotVaultPackage,
  importTewSnapshotToVault,
  parseSnapshotVaultPackage,
  parseSnapshotVaultUniverse,
} from "../src/snapshotVault/storage";
import type { SnapshotVaultPackage, StoredSnapshotRecord } from "../src/snapshotVault/types";
import { createTrackerStoryline } from "../src/storylines/model";
import type { TewSnapshot } from "../src/tew/types";

function snapshot(overrides: Partial<TewSnapshot> = {}): TewSnapshot {
  return {
    fileName: "TEW-baseline.mdb",
    fileSize: 1024,
    databaseCreatedAt: "2026-08-01T10:00:00.000Z",
    importedAt: "2026-08-01T12:00:00.000Z",
    tables: [
      { name: "tblWorkers", rowCount: 2, columnCount: 2, columns: ["ID", "Name"], loaded: true, truncated: false },
      { name: "tblShows", rowCount: 1, columnCount: 3, columns: ["ID", "Name", "Date"], loaded: true, truncated: false },
      { name: "tblMatches", rowCount: 1, columnCount: 4, columns: ["ID", "ShowID", "Winner", "Rating"], loaded: true, truncated: false },
      { name: "tblStorylines", rowCount: 1, columnCount: 3, columns: ["ID", "Name", "Heat"], loaded: true, truncated: false },
    ],
    workers: [
      { id: "worker-1", name: "Jay White", role: "Wrestler", side: "" },
      { id: "worker-2", name: "PAC", role: "Wrestler", side: "" },
    ],
    shows: [{
      id: "show-1",
      name: "PWL Power Hour #1",
      date: "2026-07-31",
      rating: 78,
      attendance: 1200,
      venue: "PWL Arena",
      company: "PWL",
      broadcast: "Television",
      matches: [{
        id: "match-1",
        showId: "show-1",
        description: "Jay White defeated PAC",
        rating: 82,
        winner: "Jay White",
        matchTime: "18:05",
        notes: "Blade Runner finish",
        placement: "Main Show",
        workers: [
          { id: "worker-1", name: "Jay White", role: "Competitor", side: "Side 1" },
          { id: "worker-2", name: "PAC", role: "Competitor", side: "Side 2" },
        ],
      }],
    }],
    storylines: [{
      id: "story-1",
      name: "World Title Rivalry",
      description: "The champion and challenger dispute control of PWL.",
      status: "Active",
      heat: 72,
      workers: [{ id: "worker-1", name: "Jay White", role: "Champion", side: "" }],
      sourceTable: "tblStorylines",
    }],
    diagnostics: {
      matchedTables: { workers: "tblWorkers", shows: "tblShows", matches: "tblMatches", storylines: "tblStorylines" },
      warnings: [],
      orphanMatchCount: 0,
      unresolvedWorkerCount: 0,
    },
    ...overrides,
  };
}

function stored(id: string, value: TewSnapshot): StoredSnapshotRecord {
  return {
    id,
    manifest: {
      id,
      fingerprint: snapshotFingerprint(value),
      fileName: value.fileName,
      fileSize: value.fileSize,
      databaseCreatedAt: value.databaseCreatedAt,
      importedAt: value.importedAt,
      role: "Unclassified",
      notes: "",
      tableCount: value.tables.length,
      mappedTableCount: Object.values(value.diagnostics.matchedTables).filter(Boolean).length,
      workerCount: value.workers.length,
      showCount: value.shows.length,
      matchCount: value.shows.reduce((total, show) => total + show.matches.length, 0),
      storylineCount: value.storylines.length,
      warningCount: value.diagnostics.warnings.length,
      mappingConfidence: "Good",
      estimatedBytes: JSON.stringify(value).length * 2,
      createdAt: value.importedAt,
      updatedAt: value.importedAt,
      lastActivatedAt: value.importedAt,
    },
    snapshot: value,
  };
}

describe("Phase 5J persistent TEW Snapshot Vault", () => {
  test("generates a stable content fingerprint independent of ordering and file metadata", () => {
    const first = snapshot();
    const reordered = snapshot({
      fileName: "renamed-copy.mdb",
      fileSize: 9999,
      importedAt: "2026-08-02T12:00:00.000Z",
      tables: [...first.tables].reverse().map((table) => ({ ...table, columns: [...table.columns].reverse() })),
      workers: [...first.workers].reverse(),
      shows: first.shows.map((show) => ({ ...show, matches: [...show.matches].reverse() })),
      storylines: [...first.storylines].reverse(),
    });
    expect(snapshotFingerprint(reordered)).toBe(snapshotFingerprint(first));
    expect(snapshotFingerprint(snapshot({ shows: [{ ...first.shows[0], rating: 79 }] }))).not.toBe(snapshotFingerprint(first));
  });

  test("stores parsed snapshots, restores the active record, and detects duplicate content", async () => {
    const store = createMemorySnapshotStore();
    let universe = emptySnapshotVaultUniverse();
    const first = await importTewSnapshotToVault(snapshot(), universe, "Baseline", "Initial TEW reference", store);
    universe = first.universe;
    expect(first.duplicate).toBe(false);
    expect(universe.activeSnapshotId).toBe(first.record.id);
    expect(universe.baselineSnapshotId).toBe(first.record.id);

    const restored = await activateStoredSnapshot(first.record.id, universe, store);
    expect(restored.record?.snapshot.fileName).toBe("TEW-baseline.mdb");

    const duplicate = await importTewSnapshotToVault(snapshot({ fileName: "copy.mdb", importedAt: "2026-08-02T00:00:00.000Z" }), universe, "Current TEW Save", "Same supported content", store);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.universe.manifest).toHaveLength(1);
    expect(duplicate.record.id).toBe(first.record.id);
  });

  test("compares only supported TEW history and detects new and changed records", () => {
    const before = snapshot();
    const after = snapshot({
      fileName: "TEW-after-show.mdb",
      importedAt: "2026-08-08T23:00:00.000Z",
      workers: [...before.workers, { id: "worker-3", name: "Bandido", role: "Wrestler", side: "" }],
      shows: [
        {
          ...before.shows[0],
          attendance: 1300,
          matches: [{ ...before.shows[0].matches[0], winner: "PAC", rating: 85, description: "PAC defeated Jay White" }],
        },
        {
          id: "show-2",
          name: "PWL Power Hour #2",
          date: "2026-08-07",
          rating: 80,
          attendance: 1350,
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
            notes: "",
            placement: "Main Show",
            workers: [],
          }],
        },
      ],
      storylines: [{ ...before.storylines[0], status: "Completed", heat: 80 }],
      diagnostics: {
        ...before.diagnostics,
        matchedTables: { ...before.diagnostics.matchedTables, storylines: "tblStorylinesNew" },
        warnings: ["A new mapping warning"],
      },
    });
    const comparison = compareTewSnapshots(stored("before", before), stored("after", after));
    expect(comparison.newShowIds).toContain("show-2");
    expect(comparison.changedShowIds).toContain("show-1");
    expect(comparison.newMatchIds).toContain("match-2");
    expect(comparison.changedMatchIds).toContain("match-1");
    expect(comparison.newWorkerIds).toContain("worker-3");
    expect(comparison.changedStorylineIds).toContain("story-1");
    expect(comparison.mappingChangeCount).toBe(1);
    expect(comparison.warningChangeCount).toBe(1);
  });

  test("persists manual comparisons in the vault universe", async () => {
    const before = stored("before", snapshot());
    const afterSnapshot = snapshot({ fileName: "later.mdb", importedAt: "2026-08-08T00:00:00.000Z", shows: [...snapshot().shows, { ...snapshot().shows[0], id: "show-2", name: "PWL Power Hour #2", date: "2026-08-07", matches: [] }] });
    const after = stored("after", afterSnapshot);
    const store = createMemorySnapshotStore([before, after]);
    const universe = {
      ...emptySnapshotVaultUniverse(),
      manifest: [before.manifest, after.manifest],
      activeSnapshotId: after.id,
      home: { ...emptySnapshotVaultUniverse().home, compareBeforeSnapshotId: before.id, compareAfterSnapshotId: after.id },
    };
    const result = await compareStoredSnapshots(before.id, after.id, universe, store);
    expect(result.comparison.newShowIds).toContain("show-2");
    expect(result.universe.lastComparisonId).toBe(result.comparison.id);
    expect(result.universe.comparisons[0].id).toBe(result.comparison.id);
  });

  test("builds worker identity suggestions without replacing manual ratings", () => {
    const exact = createMatchEngineProfile({ id: "worker-1", name: "Jay White", source: "tew" });
    exact.overall = 92;
    const manual = createMatchEngineProfile({ id: "manual-pac", name: "PAC", source: "manual" });
    manual.overall = 89;
    const duplicateName = createMatchEngineProfile({ id: "manual-pac-2", name: "PAC", source: "manual" });
    const candidates = buildWorkerIdentityCandidates(snapshot(), [exact, manual, duplicateName]);
    expect(candidates.find((candidate) => candidate.tewWorkerId === "worker-1")).toMatchObject({ recommendedDecision: "Confirmed Existing Link", conflict: false });
    expect(candidates.find((candidate) => candidate.tewWorkerId === "worker-2")).toMatchObject({ recommendedDecision: "Ambiguous", conflict: true });
    expect(exact.overall).toBe(92);
    expect(manual.overall).toBe(89);
  });

  test("builds storyline identity suggestions from TEW references and names", () => {
    const linked = createTrackerStoryline(1);
    linked.name = "Tracker World Program";
    linked.referenceLinks = [{ id: "ref", source: "tew", referenceId: "story-1", name: "World Title Rivalry" }];
    const sameName = createTrackerStoryline(2);
    sameName.name = "World Title Rivalry";
    const candidates = buildStorylineIdentityCandidates(snapshot(), [linked, sameName]);
    expect(candidates[0].candidateStorylineIds).toEqual(expect.arrayContaining([linked.id, sameName.id]));
    expect(candidates[0].conflict).toBe(false);
    expect(candidates[0].recommendedDecision).toBe("Linked Existing Storyline");
  });

  test("surfaces stale and unsupported active-snapshot warnings without changing history", () => {
    const activeSnapshot = snapshot({ importedAt: "2026-08-01T00:00:00.000Z" });
    const record = stored("active", activeSnapshot);
    const universe = { ...emptySnapshotVaultUniverse(), manifest: [record.manifest], activeSnapshotId: record.id };
    const show = createPlannedShow(1);
    show.id = "planned-show";
    show.name = "PWL Power Hour #3";
    show.date = "2026-08-10";
    show.reconciliation = {
      linkedShowId: "show-1",
      actualShow: {
        id: "show-1",
        name: "PWL Power Hour #1",
        date: "2026-07-31",
        rating: 78,
        attendance: 1200,
        venue: "PWL Arena",
        company: "PWL",
        broadcast: "Television",
        sourceFile: "different.mdb",
      },
      linkedAt: "2026-08-10T20:00:00.000Z",
      completedAt: "",
      notes: "",
    };
    const warnings = buildSnapshotSafetyWarnings(record, universe, [show]);
    expect(warnings.map((warning) => warning.id)).toEqual(expect.arrayContaining([`snapshot-predates-show:${show.id}`, `different-reconciliation-source:${show.id}`]));
    expect(show.reconciliation.actualShow.sourceFile).toBe("different.mdb");
  });

  test("round-trips the separate Snapshot Vault package and filters missing manifest records", async () => {
    const record = stored("snapshot-1", snapshot());
    const store = createMemorySnapshotStore([record]);
    const universe = { ...emptySnapshotVaultUniverse(), manifest: [record.manifest], activeSnapshotId: record.id, baselineSnapshotId: record.id };
    const packageValue = await exportSnapshotVaultPackage(universe, store);
    const parsed = parseSnapshotVaultPackage(JSON.stringify(packageValue));
    expect(parsed.records[0].snapshot.shows[0].name).toBe("PWL Power Hour #1");

    const restoredStore = createMemorySnapshotStore();
    const restored = await importSnapshotVaultPackage(parsed, restoredStore);
    expect(restored.activeSnapshotId).toBe(record.id);
    expect((await restoredStore.get(record.id))?.snapshot.fileName).toBe("TEW-baseline.mdb");
  });

  test("normalizes older manifest settings and advances promotion onboarding deliberately", () => {
    const parsed = parseSnapshotVaultUniverse({
      manifest: [],
      promotion: { promotionName: "PWL", status: "In Progress", defaultShowLength: 60 },
      dataCenter: { retentionLimit: 0, storageWarningMegabytes: 1 },
    });
    expect(parsed.dataCenter.retentionLimit).toBe(1);
    expect(parsed.dataCenter.storageWarningMegabytes).toBe(5);
    const completed = updatePromotionIdentity(parsed, { abbreviation: "PWL", activeSnapshotId: "snapshot-1" }, true);
    expect(completed.promotion).toMatchObject({ status: "Completed", promotionName: "PWL", abbreviation: "PWL", activeSnapshotId: "snapshot-1" });
  });

  test("rejects unsupported future Snapshot Vault packages", () => {
    const unsupported: SnapshotVaultPackage & { version: number } = {
      product: "TEW IX Snapshot Vault",
      version: 2,
      exportedAt: "",
      universe: emptySnapshotVaultUniverse(),
      records: [],
    };
    expect(() => parseSnapshotVaultPackage(JSON.stringify(unsupported))).toThrow("not a supported TEW Snapshot Vault package");
  });
});
