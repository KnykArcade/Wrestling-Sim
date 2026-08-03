import { describe, expect, test } from "vitest";
import { createMatchEngineProfile } from "../src/matchEngine/model";
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
