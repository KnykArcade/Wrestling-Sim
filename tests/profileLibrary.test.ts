import { describe, expect, test } from "vitest";
import { createMatchEngineProfile } from "../src/matchEngine/model";
import { MATCH_ENGINE_SKILLS } from "../src/matchEngine/profileCatalog";
import type { TewSnapshot } from "../src/tew/types";
import {
  applyImportRows,
  autoMapHeaders,
  buildImportRows,
  createProfileLibraryRecord,
  emptyProfileLibraryUniverse,
  rollbackImportSession,
  setManualProfileField,
  synchronizeProfileLibrary,
} from "../src/profileLibrary/model";
import { parseProfileLibraryUniverse } from "../src/profileLibrary/storage";
import { parseCsvText } from "../src/profileLibrary/workbook";
import type { WorkbookData } from "../src/profileLibrary/types";

const snapshot: TewSnapshot = {
  fileName: "TEW9-copy.mdb",
  fileSize: 100,
  databaseCreatedAt: "",
  importedAt: "2026-08-01T00:00:00.000Z",
  tables: [],
  workers: [
    { id: "worker-1", name: "Jay White", role: "", side: "" },
    { id: "worker-2", name: "PAC", role: "", side: "" },
  ],
  shows: [],
  storylines: [],
  diagnostics: { matchedTables: {}, warnings: [], orphanMatchCount: 0, unresolvedWorkerCount: 0 },
};

function workbook(): WorkbookData {
  const headers = ["Wrestler Name", "TEW Worker ID", "Style", "Overall", "Health", "Popularity", "Experience", "Fan Reaction", "Gimmick", ...MATCH_ENGINE_SKILLS];
  const row = ["Jay White", "worker-1", "All-Rounder", "82", "96", "78", "80", "4", "4", ...MATCH_ENGINE_SKILLS.map((skill, index) => String(70 + (index % 15)))];
  return { fileName: "pwl-roster.csv", fileType: "csv", sheets: [{ name: "CSV", rows: [headers, row] }] };
}

describe("Phase 5E Wrestler Profile Library", () => {
  test("parses quoted CSV values and auto maps roster headers", () => {
    const rows = parseCsvText('Wrestler Name,Notes,Overall\n"White, Jay","Uses ""Blade Runner""",82\n');
    expect(rows[1]).toEqual(["White, Jay", 'Uses "Blade Runner"', "82"]);
    const mapping = autoMapHeaders(workbook().sheets[0].rows[0]);
    expect(mapping.name).toBe("Wrestler Name");
    expect(mapping.tewWorkerId).toBe("TEW Worker ID");
    expect(mapping.Psychology).toBe("Psychology");
  });

  test("labels untouched default profiles as incomplete baseline placeholders", () => {
    const profile = createMatchEngineProfile({ id: "worker-1", name: "Jay White", source: "tew" });
    const record = createProfileLibraryRecord(profile, snapshot);
    expect(record.identity.status).toBe("Confirmed");
    expect(record.provenance.overall?.source).toBe("Baseline placeholder");
    expect(record.provenance.Psychology?.source).toBe("Baseline placeholder");
    expect(record.readiness).toBe("Incomplete");
    expect(record.completenessPercent).toBe(0);
  });

  test("imports mapped workbook ratings and creates a ready reusable profile", () => {
    const source = workbook();
    const mapping = autoMapHeaders(source.sheets[0].rows[0]);
    const rows = buildImportRows({ workbook: source, sheetName: "CSV", headerRow: 1, columnMap: mapping, profiles: [], snapshot });
    expect(rows).toHaveLength(1);
    expect(rows[0].matchedTewWorkerId).toBe("worker-1");
    const result = applyImportRows({ workbook: source, sheetName: "CSV", headerRow: 1, mappingPresetId: "preset-1", rows, profiles: [], library: emptyProfileLibraryUniverse(), snapshot });
    expect(result.session.rowsAccepted).toBe(1);
    expect(result.session.profilesCreated).toBe(1);
    expect(result.profiles[0]).toMatchObject({ workerKey: "tew:worker-1", workerName: "Jay White", overall: 82, health: 96, styleId: "all-rounder" });
    expect(result.profiles[0].skills.Psychology).toBeGreaterThanOrEqual(70);
    expect(result.library.records[0].provenance.overall?.source).toBe("Imported from workbook");
    expect(result.library.records[0].readiness).toBe("Ready");
  });

  test("preserves a manual override during a later workbook update", () => {
    const source = workbook();
    const mapping = autoMapHeaders(source.sheets[0].rows[0]);
    const initialRows = buildImportRows({ workbook: source, sheetName: "CSV", headerRow: 1, columnMap: mapping, profiles: [], snapshot });
    const initial = applyImportRows({ workbook: source, sheetName: "CSV", headerRow: 1, mappingPresetId: "preset-1", rows: initialRows, profiles: [], library: emptyProfileLibraryUniverse(), snapshot });
    const originalProfile = initial.profiles[0];
    const originalRecord = initial.library.records[0];
    const manual = setManualProfileField(originalProfile, originalRecord, "Psychology", 99);
    const updatedWorkbook = workbook();
    const psychologyIndex = updatedWorkbook.sheets[0].rows[0].indexOf("Psychology");
    updatedWorkbook.sheets[0].rows[1][psychologyIndex] = "45";
    const updateRows = buildImportRows({ workbook: updatedWorkbook, sheetName: "CSV", headerRow: 1, columnMap: mapping, profiles: [manual.profile], snapshot });
    updateRows[0].decision = "Preserve manual overrides";
    const library = synchronizeProfileLibrary({ profiles: [manual.profile] }, { ...initial.library, records: [manual.record] }, snapshot);
    const result = applyImportRows({ workbook: updatedWorkbook, sheetName: "CSV", headerRow: 1, mappingPresetId: "preset-1", rows: updateRows, profiles: [manual.profile], library, snapshot });
    expect(result.profiles[0].skills.Psychology).toBe(99);
    expect(result.library.records[0].provenance.Psychology?.source).toBe("Manual override");
  });

  test("rolls back an entire import session and normalizes saved data", () => {
    const source = workbook();
    const mapping = autoMapHeaders(source.sheets[0].rows[0]);
    const rows = buildImportRows({ workbook: source, sheetName: "CSV", headerRow: 1, columnMap: mapping, profiles: [], snapshot });
    const result = applyImportRows({ workbook: source, sheetName: "CSV", headerRow: 1, mappingPresetId: "preset-1", rows, profiles: [], library: emptyProfileLibraryUniverse(), snapshot });
    const rollback = rollbackImportSession(result.library, result.profiles, result.session.id);
    expect(rollback.profiles).toEqual([]);
    expect(rollback.library.records).toEqual([]);
    expect(rollback.library.importSessions[0].rolledBackAt).not.toBe("");
    const parsed = parseProfileLibraryUniverse(result.library);
    expect(parsed.records[0].workerName).toBe("Jay White");
    expect(parsed.importSessions[0].rowsAccepted).toBe(1);
  });
});
