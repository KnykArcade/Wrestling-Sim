import { describe, expect, test } from "vitest";
import { createMatchEngineProfile } from "../src/matchEngine/model";
import type { CalculationLedgerStage } from "../src/calculations/foundation";
import type { MatchEngineProfile } from "../src/matchEngine/types";
import {
  RESOLUTION_APPROACHES,
  RESOLUTION_CALCULATION_VERSION,
  resolutionApproach,
} from "../src/matchResolution/catalog";
import {
  acceptEngineResult,
  activeResolutionAttempt,
  appendResolutionAttempt,
  createMatchResolutionRecord,
  matchResolutionSetupFingerprint,
  overrideEngineResult,
  resolutionApproachRating,
  resolveMatch,
  resolveSinglesMatch,
} from "../src/matchResolution/engine";
import {
  emptyMatchResolutionUniverse,
  parseMatchResolutionUniverse,
  upsertMatchResolutionRecord,
} from "../src/matchResolution/storage";
import type {
  MatchResolutionSetup,
  MatchResolutionWorkerSource,
  ResolutionApproachId,
} from "../src/matchResolution/types";
import { IMPORTED_APPROACH_FORMULAS } from "../src/startingUniverse/formulas";
import type { StartingUniverseWorkbookMetrics } from "../src/startingUniverse/types";

function profile(id: string, name: string, overall: number): MatchEngineProfile {
  const value = createMatchEngineProfile({ id, name, source: "tew" });
  value.overall = overall;
  value.health = 92;
  value.popularity = overall - 5;
  value.experience = overall - 3;
  value.fanReaction = 4;
  value.gimmick = 4;
  for (const skill of Object.keys(value.skills) as Array<keyof typeof value.skills>) value.skills[skill] = overall;
  value.skills.Consistency = Math.min(100, overall + 3);
  value.skills.Psychology = Math.min(100, overall + 4);
  value.skills.Safety = Math.min(100, overall + 2);
  value.updatedAt = "2026-08-03T00:00:00.000Z";
  return value;
}

function metrics(overrides: Partial<Record<ResolutionApproachId, number>> = {}): StartingUniverseWorkbookMetrics {
  const approachRatings = Object.fromEntries(IMPORTED_APPROACH_FORMULAS.map((formula) => [formula.id, overrides[formula.id] ?? 70])) as StartingUniverseWorkbookMetrics["approachRatings"];
  return {
    bodyHealth: 90,
    popularityRating: 75,
    staminaRating: 80,
    staminaCapacity: 9,
    realInRingExperience: 82,
    matchHealth: 90,
    crowdWork: 78,
    perceptionRating: 4,
    gimmickStarRating: 4,
    overallApproachRating15: 72,
    overallRating: 80,
    fanRating: 80,
    botchRisk: 6,
    approachRatings,
  };
}

function setup(): MatchResolutionSetup {
  return {
    showId: "show-1",
    showName: "PWL Power Hour",
    showDate: "2019-01-08",
    segmentId: "match-1",
    segmentTitle: "Jay White vs PAC",
    matchType: "1 vs. 1",
    durationMinutes: 20,
    aimId: "competitive-tv-match",
    importance: "Feature",
    championship: "",
    competitionRound: "",
    chemistry: 1,
    volatility: 8,
    workers: [
      {
        workerKey: "tew:white",
        workerId: "white",
        workerName: "Jay White",
        approachMode: "AI",
        lockedApproachIds: ["dirty-rulebreaker"],
        manualApproachIds: [],
        storyNeed: 2,
        momentum: 1,
        bookingBias: 0,
      },
      {
        workerKey: "tew:pac",
        workerId: "pac",
        workerName: "PAC",
        approachMode: "AI",
        lockedApproachIds: ["counter-specialist"],
        manualApproachIds: [],
        storyNeed: 0,
        momentum: 2,
        bookingBias: 0,
      },
    ],
  };
}

function sources(): [MatchResolutionWorkerSource, MatchResolutionWorkerSource] {
  return [
    { profile: profile("white", "Jay White", 84), workbookMetrics: metrics({ "dirty-rulebreaker": 90, "big-match-performer": 87, "psychological-manipulator": 88 }) },
    { profile: profile("pac", "PAC", 88), workbookMetrics: metrics({ "counter-specialist": 94, "chain-technician": 92, "high-tempo-hybrid": 91, "aerial-specialist": 90 }) },
  ];
}

describe("Phase 6B1 official singles match resolution", () => {
  test("retains all sixteen workbook-derived approaches with Counter Specialist separate from Pace Controller", () => {
    expect(RESOLUTION_APPROACHES).toHaveLength(16);
    expect(new Set(RESOLUTION_APPROACHES.map((approach) => approach.id)).size).toBe(16);
    expect(resolutionApproach("counter-specialist")).toMatchObject({ name: "Counter Specialist", pace: 1, staminaCost: 1, paceSource: "Wrestling Sim Extension" });
    expect(resolutionApproach("ring-general-pace-controller")).toMatchObject({ name: "Pace Controller", workbookName: "Ring General", paceSource: "Workbook" });
    expect(resolutionApproach("counter-specialist").id).not.toBe(resolutionApproach("ring-general-pace-controller").id);
  });

  test("uses exact Starting Universe workbook approach ratings when available", () => {
    const wrestler = profile("worker", "Worker", 60);
    const workbook = metrics({ "counter-specialist": 97.25, "ring-general-pace-controller": 83.5 });
    expect(resolutionApproachRating(wrestler, workbook, "counter-specialist")).toBe(97.25);
    expect(resolutionApproachRating(wrestler, workbook, "ring-general-pace-controller")).toBe(83.5);
    expect(resolutionApproachRating(wrestler, null, "counter-specialist")).toBeGreaterThan(0);
  });

  test("produces one deterministic official result with separate performance and competitive scores", () => {
    const input = { setup: setup(), workers: sources(), seed: "pwl-official-result" } as const;
    const first = resolveSinglesMatch(input);
    const second = resolveSinglesMatch(input);
    expect(first.calculationVersion).toBe(RESOLUTION_CALCULATION_VERSION);
    expect(first.engineResult).toEqual(second.engineResult);
    expect(first.workerResults).toEqual(second.workerResults);
    expect(first.workerResults).toHaveLength(2);
    expect(first.workerResults.reduce((total, worker) => total + worker.winProbability, 0)).toBeCloseTo(1, 4);
    expect(first.workerResults.every((worker) => worker.selectedApproachIds.length === 3)).toBe(true);
    expect(first.workerResults.every((worker) => worker.performanceScore !== worker.competitiveScore)).toBe(true);
    expect(first.engineResult.winnerName).toBeTruthy();
    expect(first.engineResult.finishDescription).toContain(first.engineResult.winnerName);
    expect(first.engineResult.matchScore).toBeGreaterThan(0);
    expect(first.engineResult.starRating).toBeGreaterThanOrEqual(0);
  });

  test("preserves a complete Phase 6B20A ledger without combining score lanes", () => {
    const attempt = resolveSinglesMatch({ setup: setup(), workers: sources(), seed: "phase-6b20a-ledger" });
    expect(attempt.calculationLedger).toMatchObject({
      version: RESOLUTION_CALCULATION_VERSION,
      matchQuality: { formulaId: "match.raw-quality", result: attempt.engineResult.matchScore },
      outcome: { formulaId: "competitive.probability", resultRoll: attempt.engineResult.resultRoll },
    });
    expect(attempt.calculationLedger?.outcome.entries.reduce((total, entry) => total + entry.probability, 0)).toBeCloseTo(1, 6);

    attempt.workerResults.forEach((worker) => {
      expect(worker.calculationLedger).toMatchObject({
        approachPlan: { formulaId: "approach.resolution-plan" },
        mentalBase: { formulaId: "performance.mental-base" },
        mentalState: { formulaId: "performance.mental-score" },
        approachExecution: { formulaId: "performance.approach-execution", result: worker.approachExecution },
        presentation: { formulaId: "performance.presentation", result: worker.presentationScore },
        performance: { formulaId: "performance.individual", result: worker.performanceScore },
        competitive: { formulaId: "competitive.individual", result: worker.competitiveScore },
      });
      expect(worker.approachScores.every((approach) => approach.calculation?.formulaId === "approach.suitability")).toBe(true);
      expect(worker.approachScores.every((approach) => approach.calculation?.notes.some((note) => note.includes("select")))).toBe(true);
    });
  });

  test("records exact terms, caps, and rounding metadata for every additive stage", () => {
    const attempt = resolveSinglesMatch({ setup: setup(), workers: sources(), seed: "phase-6b20a-arithmetic" });
    const stages: CalculationLedgerStage[] = [
      attempt.calculationLedger!.matchQuality,
      ...attempt.workerResults.flatMap((worker) => Object.values(worker.calculationLedger!)),
      ...attempt.workerResults.flatMap((worker) => worker.approachScores.map((approach) => approach.calculation!)),
    ];
    stages.forEach((stage) => {
      const reconstructed = stage.terms.reduce((total, term) => total + term.contribution, 0);
      expect(reconstructed).toBeCloseTo(stage.rawSubtotal, 4);
      expect(stage.roundingRule).toBe("Nearest");
      expect(stage.roundingPlaces).toBeGreaterThanOrEqual(1);
      if (stage.capMinimum !== null) expect(stage.cappedSubtotal).toBeGreaterThanOrEqual(stage.capMinimum);
      if (stage.capMaximum !== null) expect(stage.cappedSubtotal).toBeLessThanOrEqual(stage.capMaximum);
    });
  });

  test("preserves booked manual approaches and makes the custom limit authoritative", () => {
    const custom = setup();
    custom.approachLimit = 2;
    custom.workers[0].approachMode = "Manual";
    custom.workers[0].manualApproachIds = ["dirty-rulebreaker", "counter-specialist"];
    custom.workers[1].approachMode = "Manual";
    custom.workers[1].manualApproachIds = ["aerial-specialist", "high-tempo-hybrid"];
    const attempt = resolveSinglesMatch({ setup: custom, workers: sources(), seed: "booked-approaches" });
    expect(attempt.workerResults[0].selectedApproachIds).toEqual(custom.workers[0].manualApproachIds);
    expect(attempt.workerResults[1].selectedApproachIds).toEqual(custom.workers[1].manualApproachIds);
    expect(attempt.workerResults[0].actualPace).toBe(2);
    expect(attempt.workerResults[1].actualPace).toBe(6);
  });

  test("normalizes finishing ability and exposes components that reconstruct the competitive score", () => {
    const custom = setup();
    custom.approachLimit = 1;
    custom.workers.forEach((worker) => {
      worker.approachMode = "Manual";
      worker.manualApproachIds = ["counter-specialist"];
    });
    const attempt = resolveSinglesMatch({ setup: custom, workers: sources(), seed: "finishing-normalization" });
    attempt.workerResults.forEach((worker) => {
      const finishing = worker.decisiveComponents.find((component) => component.label === "Finishing ability");
      expect(finishing?.value).toBe(7);
      const reconstructed = worker.decisiveComponents.reduce((total, component) => total + component.value, 0);
      expect(reconstructed).toBeCloseTo(worker.competitiveScore, 1);
    });
  });

  test("can award the competitive result to a wrestler other than the performance leader", () => {
    let found = false;
    for (let index = 0; index < 500; index += 1) {
      const attempt = resolveSinglesMatch({ setup: setup(), workers: sources(), seed: `performance-split-${index}` });
      if (attempt.engineResult.winnerKey !== attempt.engineResult.performanceLeaderKey) {
        found = true;
        expect(attempt.engineResult.matchFacts.some((fact) => fact.includes("despite losing"))).toBe(true);
        break;
      }
    }
    expect(found).toBe(true);
  });

  test("keeps probabilities normalized and all outputs in range across two thousand seeded matches", () => {
    let pacWins = 0;
    for (let index = 0; index < 2000; index += 1) {
      const attempt = resolveSinglesMatch({ setup: setup(), workers: sources(), seed: `integrity-simulation-${index}` });
      const probabilityTotal = attempt.workerResults.reduce((total, worker) => total + worker.winProbability, 0);
      expect(probabilityTotal).toBeCloseTo(1, 12);
      expect(attempt.engineResult.matchScore).toBeGreaterThanOrEqual(0);
      expect(attempt.engineResult.matchScore).toBeLessThanOrEqual(100);
      expect(attempt.engineResult.actualDurationMinutes).toBeGreaterThan(0);
      attempt.workerResults.forEach((worker) => {
        expect(worker.performanceScore).toBeGreaterThanOrEqual(0);
        expect(worker.performanceScore).toBeLessThanOrEqual(100);
        expect(worker.competitiveScore).toBeGreaterThanOrEqual(0);
        expect(worker.competitiveScore).toBeLessThanOrEqual(120);
        expect(worker.approachScores.every((approach) => approach.total >= 0 && approach.total <= 100)).toBe(true);
      });
      if (attempt.engineResult.winnerName === "PAC") pacWins += 1;
    }
    expect(pacWins).toBeGreaterThan(1000);
    expect(pacWins).toBeLessThan(1800);
  }, 15_000);

  test("accepts the official result without altering the engine calculation", () => {
    const attempt = resolveSinglesMatch({ setup: setup(), workers: sources(), seed: "accept-result" });
    const record = createMatchResolutionRecord(setup(), attempt);
    const accepted = acceptEngineResult(record);
    const active = activeResolutionAttempt(accepted)!;
    expect(accepted.status).toBe("Accepted");
    expect(active.status).toBe("Accepted");
    expect(active.finalResult).toMatchObject({
      winnerKey: attempt.engineResult.winnerKey,
      acceptedEngineResult: true,
      overrideReason: "",
    });
    expect(active.engineResult).toEqual(attempt.engineResult);
    expect(() => acceptEngineResult(accepted)).toThrow("already been finalized");
  });

  test("requires an explicit reason for a booker override and preserves the engine winner", () => {
    const attempt = resolveSinglesMatch({ setup: setup(), workers: sources(), seed: "override-result" });
    const record = createMatchResolutionRecord(setup(), attempt);
    const alternate = attempt.workerResults.find((worker) => worker.workerKey !== attempt.engineResult.winnerKey)!;
    expect(() => overrideEngineResult(record, alternate.workerKey, "Pinfall", "", "")).toThrow("Record why");
    const overridden = overrideEngineResult(record, alternate.workerKey, "Pinfall", `${alternate.workerName} won after a booker-directed finish.`, "Protect the planned championship program.");
    const active = activeResolutionAttempt(overridden)!;
    expect(overridden.status).toBe("Overridden");
    expect(active.engineResult.winnerKey).toBe(attempt.engineResult.winnerKey);
    expect(active.finalResult).toMatchObject({
      winnerKey: alternate.workerKey,
      acceptedEngineResult: false,
      overrideReason: "Protect the planned championship program.",
    });
  });

  test("requires a material setup change before adding another official calculation", () => {
    const originalSetup = setup();
    const originalSources = sources();
    const first = resolveSinglesMatch({ setup: originalSetup, workers: originalSources, seed: "first" });
    const record = createMatchResolutionRecord(originalSetup, first);
    expect(first.setupFingerprint).toBe(matchResolutionSetupFingerprint(originalSetup, originalSources));

    const changedSetup = { ...originalSetup, durationMinutes: 25 };
    expect(matchResolutionSetupFingerprint(changedSetup, originalSources)).not.toBe(first.setupFingerprint);
    const second = resolveSinglesMatch({ setup: changedSetup, workers: originalSources, seed: "second", setupChangeReason: "Match length increased to 25 minutes." });
    const appended = appendResolutionAttempt({ ...record, setup: changedSetup }, second);
    expect(appended.attempts).toHaveLength(2);
    expect(appended.attempts[0].status).toBe("Superseded");
    expect(appended.attempts[1]).toMatchObject({ number: 2, status: "Calculated", setupChangeReason: "Match length increased to 25 minutes." });
  });

  test("round-trips official calculations and upserts one record per show segment", () => {
    const attempt = resolveSinglesMatch({ setup: setup(), workers: sources(), seed: "storage" });
    const record = createMatchResolutionRecord(setup(), attempt);
    const universe = upsertMatchResolutionRecord(emptyMatchResolutionUniverse(), record);
    const parsed = parseMatchResolutionUniverse(JSON.parse(JSON.stringify(universe)) as unknown);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].attempts[0].engineResult).toEqual(attempt.engineResult);
    const accepted = acceptEngineResult(record);
    const replaced = upsertMatchResolutionRecord(parsed, accepted);
    expect(replaced.records).toHaveLength(1);
    expect(replaced.records[0].status).toBe("Accepted");
  });
});

describe("Phase 6B4 team and multi-person match resolution", () => {
  function multiSources(names: string[]): MatchResolutionWorkerSource[] {
    return names.map((name, index) => ({ profile: profile(`worker-${index + 1}`, name, 78 + index * 3), workbookMetrics: metrics() }));
  }

  function multiSetup(format: NonNullable<MatchResolutionSetup["format"]>, names: string[], teams: string[] = names): MatchResolutionSetup {
    return {
      ...setup(),
      segmentTitle: names.join(" vs "),
      matchType: format,
      format,
      eliminationRules: format === "Elimination" || format === "Battle Royal",
      workers: names.map((name, index) => ({
        workerKey: `tew:worker-${index + 1}`,
        workerId: `worker-${index + 1}`,
        workerName: name,
        approachMode: "AI",
        lockedApproachIds: [],
        manualApproachIds: [],
        storyNeed: 0,
        momentum: 0,
        bookingBias: 0,
        teamId: teams[index],
        teamName: teams[index] === "side-a" ? "Motor City Machine Guns" : teams[index] === "side-b" ? "Aussie Open" : name,
      })),
    };
  }

  test("resolves tag teams as units while preserving the deciding fall", () => {
    const names = ["Alex Shelley", "Chris Sabin", "Mark Davis", "Kyle Fletcher"];
    const attempt = resolveMatch({
      setup: multiSetup("Team", names, ["side-a", "side-a", "side-b", "side-b"]),
      workers: multiSources(names),
      seed: "phase-6b4-tag",
    });
    expect(attempt.engineResult.teamResults).toHaveLength(2);
    expect(attempt.engineResult.teamResults!.reduce((total, team) => total + team.winProbability, 0)).toBeCloseTo(1, 4);
    expect(attempt.engineResult.winnerMemberKeys).toHaveLength(2);
    expect(attempt.engineResult.loserKeys).toHaveLength(2);
    expect(attempt.engineResult.fallWinnerName).toBeTruthy();
    expect(attempt.engineResult.fallLoserName).toBeTruthy();
    const accepted = activeResolutionAttempt(acceptEngineResult(createMatchResolutionRecord(multiSetup("Team", names, ["side-a", "side-a", "side-b", "side-b"]), attempt)))!;
    expect(accepted.finalResult?.winnerMemberKeys).toEqual(attempt.engineResult.winnerMemberKeys);
  });

  test("supports triple threats without treating non-winning participants as a team", () => {
    const names = ["PAC", "Jay White", "Brian Cage"];
    const attempt = resolveMatch({ setup: multiSetup("Multi Person", names), workers: multiSources(names), seed: "phase-6b4-triple-threat" });
    expect(attempt.workerResults).toHaveLength(3);
    expect(attempt.workerResults.reduce((total, worker) => total + worker.winProbability, 0)).toBeCloseTo(1, 4);
    expect(attempt.engineResult.winnerMemberKeys).toHaveLength(1);
    expect(attempt.engineResult.loserKeys).toHaveLength(2);
  });

  test("averages approach interactions across every opponent in a multi-person match", () => {
    const names = ["PAC", "Jay White", "Brian Cage"];
    const matchSetup = multiSetup("Multi Person", names);
    matchSetup.approachLimit = 1;
    matchSetup.workers.forEach((worker, index) => {
      worker.approachMode = "Manual";
      worker.manualApproachIds = [["counter-specialist"], ["aerial-specialist"], ["ring-general-pace-controller"]][index] as ResolutionApproachId[];
    });
    const attempt = resolveMatch({ setup: matchSetup, workers: multiSources(names), seed: "all-opponent-interactions" });
    expect(attempt.workerResults[0].interactionModifier).toBe(2);
  });

  test("records a complete elimination order for elimination matches and battle royals", () => {
    const names = ["PAC", "Jay White", "Brian Cage", "Bobby Lashley", "Bandido"];
    for (const format of ["Elimination", "Battle Royal"] as const) {
      const attempt = resolveMatch({ setup: multiSetup(format, names), workers: multiSources(names), seed: `phase-6b4-${format}` });
      expect(attempt.engineResult.eliminationOrder).toHaveLength(names.length - 1);
      expect(attempt.engineResult.eliminationOrder!.map((item) => item.order)).toEqual([1, 2, 3, 4]);
      expect(new Set(attempt.engineResult.eliminationOrder!.map((item) => item.eliminatedWorkerKey)).size).toBe(4);
      expect(attempt.engineResult.eliminationOrder!.some((item) => item.eliminatedWorkerKey === attempt.engineResult.winnerKey)).toBe(false);
      expect(attempt.engineResult.eliminationOrder!.at(-1)?.eliminatedWorkerKey).toBe(attempt.engineResult.fallLoserKey);
    }
  });

  test("a team override changes the whole winning side and preserves the engine result", () => {
    const names = ["Alex Shelley", "Chris Sabin", "Mark Davis", "Kyle Fletcher"];
    const matchSetup = multiSetup("Team", names, ["side-a", "side-a", "side-b", "side-b"]);
    const attempt = resolveMatch({ setup: matchSetup, workers: multiSources(names), seed: "phase-6b4-team-override" });
    const alternate = attempt.workerResults.find((worker) => !attempt.engineResult.winnerMemberKeys!.includes(worker.workerKey))!;
    const overridden = activeResolutionAttempt(overrideEngineResult(createMatchResolutionRecord(matchSetup, attempt), alternate.workerKey, "Pinfall", "", "Approved team booking change."))!;
    expect(overridden.engineResult.winnerTeamId).toBe(attempt.engineResult.winnerTeamId);
    expect(overridden.finalResult?.winnerTeamId).not.toBe(attempt.engineResult.winnerTeamId);
    expect(overridden.finalResult?.winnerMemberKeys).toHaveLength(2);
  });
});
