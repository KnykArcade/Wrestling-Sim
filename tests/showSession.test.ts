import { describe, expect, test } from "vitest";
import { emptyShowOperationsUniverse } from "../src/operations/model";
import { saveSegmentToOutputLibrary } from "../src/outputLibrary/model";
import { emptyOutputLibraryUniverse } from "../src/outputLibrary/model";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";
import {
  buildSessionCheckpointOffer,
  buildUnifiedShowSessionSummary,
  createShowSessionRecord,
  dismissSessionCheckpoint,
  emptyShowSessionUniverse,
  markSessionAwaitingResults,
  markSessionOutputApplied,
  markSessionReadyForTew,
  recordSessionCheckpoint,
  selectShowSessionSegment,
  sessionCheckpointFingerprint,
  upsertShowSessionRecord,
  validateShowSessionIntegrity,
} from "../src/showSession/model";
import { parseShowSessionUniverse } from "../src/showSession/storage";
import { buildTransferPackage, emptyTransferUniverse, synchronizeTransferRecord } from "../src/transfer/model";

function configuredMatch() {
  const match = createPlannedSegment("match");
  match.title = "Jay White vs PAC";
  match.durationMinutes = 18;
  match.workers = [
    { id: "white", name: "Jay White", role: "Competitor", side: "Side 1", source: "tew" },
    { id: "pac", name: "PAC", role: "Competitor", side: "Side 2", source: "tew" },
  ];
  match.matchApproachSetup.workerPlans = [
    {
      workerKey: "tew:white",
      workerName: "Jay White",
      selectedApproachIds: ["psychological-manipulator", "opportunistic-schemer", "big-match-performer"],
      lockedApproachIds: [],
      mode: "AI",
      generatedAt: "2026-08-02T00:00:00.000Z",
    },
    {
      workerKey: "tew:pac",
      workerName: "PAC",
      selectedApproachIds: ["aerial-showstopper", "high-tempo-hybrid", "resilient-underdog"],
      lockedApproachIds: [],
      mode: "AI",
      generatedAt: "2026-08-02T00:00:00.000Z",
    },
  ];
  return match;
}

describe("Phase 5G unified show session", () => {
  test("derives segment progress from setup through TEW entry and reconciliation", () => {
    const show = createPlannedShow(1);
    show.name = "PWL Power Hour";
    const match = configuredMatch();
    show.segments = [match];
    let session = createShowSessionRecord(show.id, match.id);
    let outputLibrary = emptyOutputLibraryUniverse();
    let transfer = emptyTransferUniverse();
    const operationsRecord = emptyShowOperationsUniverse().records[0] ?? null;

    let summary = buildUnifiedShowSessionSummary({ show, session, outputLibrary, transfer, operationsRecord });
    expect(summary.segments[0].status).toBe("Creative In Progress");

    match.matchStory = "PAC pushes the pace before White exploits one mistake and wins.";
    summary = buildUnifiedShowSessionSummary({ show, session, outputLibrary, transfer, operationsRecord });
    expect(summary.segments[0].status).toBe("Creative In Progress");

    session = markSessionOutputApplied(session, match.id);
    const saved = saveSegmentToOutputLibrary(outputLibrary, { segment: match, show, sourceKind: "Planned Show", stage: "Applied Output" });
    outputLibrary = saved.universe;
    summary = buildUnifiedShowSessionSummary({ show, session, outputLibrary, transfer, operationsRecord });
    expect(summary.segments[0]).toMatchObject({ status: "Ready for TEW", setupComplete: true, approachesComplete: true, outputComplete: true, packageCurrent: true });

    const pkg = buildTransferPackage(show, []);
    const record = synchronizeTransferRecord(undefined, pkg);
    record.segmentProgress[0].fields[0].status = "Copied";
    transfer = { records: [record], auditLogs: [] };
    summary = buildUnifiedShowSessionSummary({ show, session, outputLibrary, transfer, operationsRecord });
    expect(summary.segments[0].status).toBe("Entering in TEW");

    record.segmentProgress[0].completed = true;
    summary = buildUnifiedShowSessionSummary({ show, session, outputLibrary, transfer, operationsRecord });
    expect(summary.segments[0].status).toBe("Entered");

    session = markSessionAwaitingResults(session);
    summary = buildUnifiedShowSessionSummary({ show, session, outputLibrary, transfer, operationsRecord });
    expect(summary.segments[0].status).toBe("Awaiting Result");

    match.workflowStatus = "Reconciled";
    match.reconciliation.actualMatch = {
      id: "actual-1",
      description: "Jay White defeated PAC",
      rating: 84,
      winner: "Jay White",
      matchTime: "18:03",
      notes: "Blade Runner",
      placement: "Main Show",
      workers: ["Jay White", "PAC"],
    };
    summary = buildUnifiedShowSessionSummary({ show, session, outputLibrary, transfer, operationsRecord });
    expect(summary.segments[0].status).toBe("Reconciled");
    expect(summary.reconciled).toBe(1);
  });

  test("offers formal checkpoints without duplicating identical versions", () => {
    const show = createPlannedShow(1);
    show.name = "PWL Power Hour";
    const match = configuredMatch();
    match.matchStory = "A complete generated draft.";
    show.segments = [match];
    let session = createShowSessionRecord(show.id, match.id);
    let library = emptyOutputLibraryUniverse();
    const transfer = emptyTransferUniverse();

    const generated = buildSessionCheckpointOffer({ segment: match, show, session, outputLibrary: library, transfer });
    expect(generated?.stage).toBe("Generated Draft");
    expect(generated?.duplicate).toBe(false);

    const saved = saveSegmentToOutputLibrary(library, { segment: match, show, sourceKind: "Planned Show", stage: generated!.stage });
    library = saved.universe;
    session = recordSessionCheckpoint({ record: session, segmentId: match.id, stage: generated!.stage, outputItemId: saved.item.id, outputVersionId: saved.item.currentVersionId, fingerprint: generated!.fingerprint });
    expect(buildSessionCheckpointOffer({ segment: match, show, session, outputLibrary: library, transfer })?.duplicate).toBe(true);

    session = markSessionOutputApplied(session, match.id);
    expect(buildSessionCheckpointOffer({ segment: match, show, session, outputLibrary: library, transfer })?.stage).toBe("Applied Output");
    session = markSessionReadyForTew(session, match.id);
    expect(buildSessionCheckpointOffer({ segment: match, show, session, outputLibrary: library, transfer })?.stage).toBe("Ready for TEW");

    const fingerprint = sessionCheckpointFingerprint(match, "Ready for TEW");
    session = dismissSessionCheckpoint(session, fingerprint);
    expect(buildSessionCheckpointOffer({ segment: match, show, session, outputLibrary: library, transfer })?.dismissed).toBe(true);
  });

  test("preserves exact resume position and validates stale or orphaned session references", () => {
    const show = createPlannedShow(1);
    const match = configuredMatch();
    match.matchStory = "Current match output.";
    show.segments = [match];
    let session = createShowSessionRecord(show.id, match.id);
    session = selectShowSessionSegment(session, match.id, "creative");
    let universe = upsertShowSessionRecord(emptyShowSessionUniverse(), session);
    const parsed = parseShowSessionUniverse(JSON.parse(JSON.stringify(universe)) as unknown);
    expect(parsed.lastShowId).toBe(show.id);
    expect(parsed.records[0]).toMatchObject({ selectedSegmentId: match.id, activeStep: "creative" });

    const saved = saveSegmentToOutputLibrary(emptyOutputLibraryUniverse(), { segment: match, show, sourceKind: "Planned Show", stage: "Applied Output" });
    match.matchStory = "Changed after the saved production package.";
    const issues = validateShowSessionIntegrity({ show, session, outputLibrary: saved.universe, transfer: emptyTransferUniverse() });
    expect(issues.some((issue) => issue.id === `stale-package:${match.id}`)).toBe(true);

    universe = upsertShowSessionRecord(universe, { ...session, selectedSegmentId: "removed-segment" });
    const missing = validateShowSessionIntegrity({ show, session: universe.records[0], outputLibrary: saved.universe, transfer: emptyTransferUniverse() });
    expect(missing.some((issue) => issue.id === "missing-selected-segment")).toBe(true);
  });
});
