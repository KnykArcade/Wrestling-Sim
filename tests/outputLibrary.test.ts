import { describe, expect, test } from "vitest";
import {
  buildShowProductionPacket,
  compareOutputVersions,
  createReusableOutputStructure,
  emptyOutputLibraryUniverse,
  restoreOutputVersion,
  saveSegmentToOutputLibrary,
} from "../src/outputLibrary/model";
import { parseOutputLibraryUniverse } from "../src/outputLibrary/storage";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";

function configuredMatch() {
  const match = createPlannedSegment("match");
  match.title = "Jay White vs PAC";
  match.durationMinutes = 18;
  match.matchType = "1 vs. 1";
  match.championship = "PWL World Championship";
  match.championshipStakes = "White defends against PAC.";
  match.plannedWinner = "Jay White";
  match.plannedFinish = "Blade Runner after exploiting a referee distraction.";
  match.purpose = "Jay White tries to frustrate PAC and retain the PWL World Championship.";
  match.notes = "Keep PAC explosive while Jay White controls the emotional tempo.";
  match.matchStory = "PAC controls the opening before White creates the decisive mistake and steals the finish.";
  match.keyMoments = "Opening: PAC pushes the pace.\nTurning point: White creates a referee distraction.\nFinish: Blade Runner.";
  match.consequences = "PAC can argue that White escaped rather than proved superiority.";
  match.followUp = "PAC demands another path to the championship.";
  match.workers = [
    { id: "white", name: "Jay White", role: "Competitor", side: "Side 1", source: "tew" },
    { id: "pac", name: "PAC", role: "Competitor", side: "Side 2", source: "tew" },
  ];
  match.matchApproachSetup.matchAimId = "feud-grudge-match";
  match.matchApproachSetup.workerPlans = [
    {
      workerKey: "tew:white",
      workerName: "Jay White",
      selectedApproachIds: ["dirty-rulebreaker", "psychological-manipulator", "opportunistic-schemer"],
      lockedApproachIds: ["dirty-rulebreaker"],
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

describe("Phase 5F Output Library and Road-Agent Workflow", () => {
  test("preserves plan and applied output lineage with a TEW-oriented match package", () => {
    const show = createPlannedShow(1);
    show.name = "PWL Power Hour";
    const match = configuredMatch();
    show.segments = [match];

    const result = saveSegmentToOutputLibrary(emptyOutputLibraryUniverse(), {
      segment: match,
      show,
      sourceKind: "Planned Show",
    });

    expect(result.item.versions.map((version) => version.stage)).toEqual(["Plan", "Applied Output"]);
    expect(result.item.productionPackage.kind).toBe("Road-Agent Match Package");
    expect(result.item.productionPackage.fullText).toContain("Jay White vs PAC");
    expect(result.item.productionPackage.fullText).toContain("Dirty Rulebreaker");
    expect(result.item.productionPackage.companionOnly.find((field) => field.label === "Selected approaches")?.value).toContain("stamina 1");
    expect(result.item.versions.at(-1)?.sourceAttribution).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Dirty Rulebreaker", source: "Generic structural fallback" }),
      expect.objectContaining({ label: "Aerial Showstopper", source: "Canonical approach phrase library" }),
      expect.objectContaining({ source: "Entered creative plan" }),
    ]));
  });

  test("imports standalone draft history as generated lineage versions", () => {
    const match = configuredMatch();
    const result = saveSegmentToOutputLibrary(emptyOutputLibraryUniverse(), {
      segment: match,
      sourceKind: "Quick Segment",
      quickSegmentId: "quick-1",
      draftHistory: [{
        id: "draft-1",
        createdAt: "2026-08-01T00:00:00.000Z",
        label: "Sports first pass",
        tone: "sports",
        detail: "standard",
        fullOutput: "PAC controls the pace, but White steals the result.",
        keyMoments: "Finish: stolen result.",
        tewNotes: "Saved TEW notes.",
      }],
    });

    expect(result.item.versions.map((version) => version.stage)).toEqual(["Plan", "Generated Draft", "Applied Output"]);
    expect(result.item.versions[1].label).toBe("Sports first pass");
    expect(result.item.sourceQuickSegmentId).toBe("quick-1");
  });

  test("compares and restores an earlier creative version without overwriting reconciliation", () => {
    const match = configuredMatch();
    const saved = saveSegmentToOutputLibrary(emptyOutputLibraryUniverse(), {
      segment: match,
      sourceKind: "Quick Segment",
      quickSegmentId: "quick-1",
    });
    const plan = saved.item.versions[0];
    const applied = saved.item.versions[1];
    const changes = compareOutputVersions(plan, applied);
    expect(changes.find((row) => row.field === "Match Story")?.status).toBe("Added");

    match.reconciliation.linkedMatchId = "actual-1";
    match.reconciliation.actualMatch = {
      id: "actual-1",
      description: "White defeated PAC",
      rating: 82,
      winner: "Jay White",
      matchTime: "17:42",
      notes: "Blade Runner",
      placement: "Main Show",
      workers: ["Jay White", "PAC"],
    };
    const restored = restoreOutputVersion(match, plan);
    expect(restored.matchStory).toBe("");
    expect(restored.reconciliation.actualMatch?.id).toBe("actual-1");
    expect(restored.matchApproachSetup.performancePreview).toBeNull();
  });

  test("builds an ordered show packet and reports missing outputs", () => {
    const show = createPlannedShow(1);
    show.name = "PWL Power Hour";
    show.company = "PWL";
    const match = configuredMatch();
    const angle = createPlannedSegment("angle");
    angle.title = "Post-Match Confrontation";
    angle.workers = [{ id: "pac", name: "PAC", role: "Speaker", side: "", source: "tew" }];
    angle.purpose = "PAC rejects White's claim of superiority.";
    show.segments = [match, angle];

    const saved = saveSegmentToOutputLibrary(emptyOutputLibraryUniverse(), { segment: match, show, sourceKind: "Planned Show" });
    const packet = buildShowProductionPacket(show, saved.universe.items);

    expect(packet.text.indexOf("#1 · Main Show · Jay White vs PAC")).toBeLessThan(packet.text.indexOf("#2 · Main Show · Post-Match Confrontation"));
    expect(packet.text).toContain("ROAD-AGENT MATCH PACKAGE");
    expect(packet.text).toContain("ANGLE PRODUCTION PACKAGE");
    expect(packet.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("Post-Match Confrontation) has not been saved"),
      expect.stringContaining("has no Angle Segment Output"),
    ]));
    expect(JSON.parse(packet.json).segments).toHaveLength(2);
  });

  test("creates a reusable structure without specific booking identities", () => {
    const match = configuredMatch();
    const saved = saveSegmentToOutputLibrary(emptyOutputLibraryUniverse(), { segment: match, sourceKind: "Quick Segment", quickSegmentId: "quick-1" });
    const structure = createReusableOutputStructure(saved.item, "Championship Escape Structure");

    expect(structure.name).toBe("Championship Escape Structure");
    expect(structure.purpose).not.toContain("Jay White");
    expect(structure.purpose).not.toContain("PAC");
    expect(structure.purpose).not.toContain("PWL World Championship");
    expect(structure.requiredSections).toContain("Turning point");
  });

  test("stores reconciled planned-versus-actual reporting and round-trips through persistence", () => {
    const show = createPlannedShow(1);
    const match = configuredMatch();
    match.workflowStatus = "Reconciled";
    match.reconciliation.linkedMatchId = "actual-1";
    match.reconciliation.actualMatch = {
      id: "actual-1",
      description: "PAC defeated Jay White",
      rating: 88,
      winner: "PAC",
      matchTime: "18:11",
      notes: "Black Arrow",
      placement: "Main Show",
      workers: ["Jay White", "PAC"],
    };
    match.reconciliation.actualRating = 88;
    match.reconciliation.happenedAsPlanned = false;
    match.reconciliation.finalNarrative = "PAC overcame White and won cleanly.";
    match.reconciliation.actualConsequences = "PAC becomes champion.";
    match.reconciliation.finalFollowUp = "White disputes the result.";
    match.reconciliation.reconciledAt = "2026-08-02T00:00:00.000Z";
    show.segments = [match];

    const saved = saveSegmentToOutputLibrary(emptyOutputLibraryUniverse(), { segment: match, show, sourceKind: "Planned Show" });
    expect(saved.item.versions.at(-1)?.stage).toBe("Reconciled Actual Version");
    expect(saved.item.plannedVsActual.ready).toBe(true);
    expect(saved.item.plannedVsActual.rows.find((row) => row.field === "Winner")?.status).toBe("Changed");

    const parsed = parseOutputLibraryUniverse(JSON.parse(JSON.stringify(saved.universe)) as unknown);
    expect(parsed.items[0].plannedVsActual.ready).toBe(true);
    expect(parsed.items[0].productionPackage.kind).toBe("Road-Agent Match Package");
  });
});
