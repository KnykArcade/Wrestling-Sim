import { describe, expect, test } from "vitest";
import {
  APPROACH_ALIASES,
  MATCH_AIMS,
  MATCH_APPROACHES,
  MATCH_IMPORTANCE_PROFILES,
  MENTAL_STATES,
  SOURCE_CONFLICTS,
} from "../src/matchEngine/catalog";
import {
  approachSlotsForDuration,
  calculateApproachRating,
  calculateMentalStateScore,
  calculateProfileStaminaRating,
  chooseApproachPlan,
  classifyMentalState,
  createMatchEngineProfile,
  evaluatePace,
  evaluateStamina,
  mentalSwingProbability,
  profileStaminaCapacity,
  resolveApproachId,
  scoreApproachCandidate,
  staminaCapacityFromRating,
} from "../src/matchEngine/model";
import {
  advisoryStarRating,
  formatStarRating,
  generateMatchPerformancePreview,
} from "../src/matchEngine/performance";
import { WRESTLER_STYLES } from "../src/matchEngine/profileCatalog";
import {
  MATCH_ENGINE_STORAGE_KEY,
  loadMatchEngineUniverse,
  normalizeMatchApproachSetup,
  saveMatchEngineUniverse,
} from "../src/matchEngine/storage";
import { CALCULATION_SYSTEM_VERSION, calculationQualityLabel, normalizeRating } from "../src/calculations/foundation";
import type { MatchEngineProfile, MatchWorkerApproachPlan } from "../src/matchEngine/types";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function testProfile(name = "Test Wrestler", id = "worker-1"): MatchEngineProfile {
  const profile = createMatchEngineProfile({ id, name, source: "tew" });
  return {
    ...profile,
    styleId: "show-stealer-workhorse",
    overall: 78,
    experience: 75,
    skills: {
      ...profile.skills,
      Aerial: 82,
      Athleticism: 85,
      Basics: 78,
      Charisma: 72,
      Consistency: 80,
      Flashiness: 80,
      Psychology: 79,
      Resilience: 75,
      Selling: 74,
      Stamina: 84,
      Technical: 76,
      Toughness: 70,
    },
  };
}

function testPlan(profile: MatchEngineProfile, approaches: MatchWorkerApproachPlan["selectedApproachIds"]): MatchWorkerApproachPlan {
  return {
    workerKey: profile.workerKey,
    workerName: profile.workerName,
    selectedApproachIds: approaches,
    lockedApproachIds: [],
    mode: "AI",
    generatedAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("native match engine data foundation", () => {
  test("loads sixteen canonical approaches with normalized one-hundred-percent formulas", () => {
    expect(MATCH_APPROACHES).toHaveLength(16);
    const ids = new Set(MATCH_APPROACHES.map((approach) => approach.id));
    expect(ids.size).toBe(16);
    MATCH_APPROACHES.forEach((approach) => {
      expect([4, 6]).toContain(approach.formula.length);
      expect(approach.formula.reduce((sum, item) => sum + item.weight, 0)).toBeCloseTo(1, 8);
      expect(approach.staminaCost).toBeGreaterThanOrEqual(1);
      expect(approach.staminaCost).toBeLessThanOrEqual(3);
    });
  });

  test("reproduces uploaded weighted approach formulas", () => {
    const aerial = MATCH_APPROACHES.find((approach) => approach.id === "aerial-showstopper");
    const bigMatch = MATCH_APPROACHES.find((approach) => approach.id === "big-match-performer");
    const submission = MATCH_APPROACHES.find((approach) => approach.id === "submission-specialist");
    const counter = MATCH_APPROACHES.find((approach) => approach.id === "counter-specialist");
    const ringGeneral = MATCH_APPROACHES.find((approach) => approach.id === "pace-controller");
    expect(aerial).toBeDefined();
    expect(bigMatch).toBeDefined();
    expect(submission).toBeDefined();
    expect(calculateApproachRating(aerial!, { Aerial: 80, Athleticism: 70, Flashiness: 60, Basics: 50 })).toBe(70);
    expect(calculateApproachRating(bigMatch!, { Psychology: 90, Consistency: 80, Charisma: 70, Stamina: 60 })).toBe(80);
    expect(calculateApproachRating(submission!, { Technical: 85, Psychology: 75, Basics: 65, Toughness: 55 })).toBe(74.5);
    expect(calculateApproachRating(counter!, { Basics: 80, Psychology: 70, Consistency: 60, Technical: 50 })).toBe(68);
    expect(calculateApproachRating(ringGeneral!, { Psychology: 90, Experience: 80, Technical: 70, Basics: 60, "Crowd Work": 50, Consistency: 40 })).toBe(65);
  });

  test("normalizes every workbook approach to its canonical booking ID", () => {
    expect(resolveApproachId("Aerial Specialist")).toBe("aerial-showstopper");
    expect(resolveApproachId("Heavy Striker/Brawler")).toBe("heavy-striker-brawler");
    expect(resolveApproachId("Heavy Striker / Brawler")).toBe("heavy-striker-brawler");
    expect(resolveApproachId("Workrate Machine")).toBe("high-tempo-hybrid");
    expect(resolveApproachId("Counter Specialist")).toBe("counter-specialist");
    expect(resolveApproachId("Ring General")).toBe("pace-controller");
    expect(APPROACH_ALIASES.filter((record) => record.status === "legacy-unmapped")).toHaveLength(0);
  });

  test("uses shared rating caps labels and calculation version", () => {
    expect(normalizeRating(104.126)).toBe(100);
    expect(normalizeRating(-4)).toBe(0);
    expect(calculationQualityLabel(85)).toBe("Elite");
    expect(calculationQualityLabel(49.99)).toBe("Weak");
    expect(CALCULATION_SYSTEM_VERSION).toBe("wrestling-sim-calculations-6b10c-v1");
  });

  test("migrates saved resolver IDs without losing selected or locked approaches", () => {
    const setup = normalizeMatchApproachSetup({
      matchAimId: "technical-showcase",
      workerPlans: [{ workerKey: "tew:1", workerName: "Worker", selectedApproachIds: ["aerial-specialist", "ring-general-pace-controller", "counter-specialist"], lockedApproachIds: ["ring-general-pace-controller"], mode: "Manual" }],
    });
    expect(setup.workerPlans[0].selectedApproachIds).toEqual(["aerial-showstopper", "pace-controller", "counter-specialist"]);
    expect(setup.workerPlans[0].lockedApproachIds).toEqual(["pace-controller"]);
  });

  test("uses the approved duration boundaries for approach slots", () => {
    expect(approachSlotsForDuration(0)).toBe(1);
    expect(approachSlotsForDuration(5)).toBe(1);
    expect(approachSlotsForDuration(6)).toBe(2);
    expect(approachSlotsForDuration(15)).toBe(2);
    expect(approachSlotsForDuration(16)).toBe(3);
    expect(approachSlotsForDuration(24.99)).toBe(3);
    expect(approachSlotsForDuration(25)).toBe(4);
    expect(approachSlotsForDuration(60)).toBe(4);
  });

  test("matches the workbook pace-status and penalty table", () => {
    expect(evaluatePace(0, 6)).toEqual({ difference: 0, status: "OPEN PACE", modifier: 0 });
    expect(evaluatePace(4, 4)).toEqual({ difference: 0, status: "IDEAL PACE", modifier: 2 });
    expect(evaluatePace(4, 3)).toEqual({ difference: 1, status: "OFF PACE", modifier: -5 });
    expect(evaluatePace(4, 2)).toEqual({ difference: 2, status: "NOTICEABLY OFF", modifier: -10 });
    expect(evaluatePace(4, 1)).toEqual({ difference: 3, status: "POOR PACING", modifier: -15 });
    expect(evaluatePace(5, 1)).toEqual({ difference: 4, status: "BAD PACING", modifier: -20 });
    expect(evaluatePace(6, 1)).toEqual({ difference: 5, status: "FAILED", modifier: -25 });
  });

  test("matches the workbook stamina states and penalties", () => {
    expect(evaluateStamina(6, 6)).toEqual({ overBudget: 0, status: "PASS", modifier: 2 });
    expect(evaluateStamina(5, 6)).toEqual({ overBudget: -1, status: "PASS", modifier: 2 });
    expect(evaluateStamina(7, 6)).toEqual({ overBudget: 1, status: "WINDED", modifier: -2 });
    expect(evaluateStamina(8, 6)).toEqual({ overBudget: 2, status: "GASSED", modifier: -5 });
    expect(evaluateStamina(9, 6)).toEqual({ overBudget: 3, status: "DEAD", modifier: -15 });
  });

  test("preserves the five mental states and source score thresholds", () => {
    expect(MENTAL_STATES.map((state) => state.modifier)).toEqual([5, 2.5, 0, -5, -10]);
    expect(classifyMentalState(85).name).toBe("HOT NIGHT");
    expect(classifyMentalState(70).name).toBe("FOCUSED");
    expect(classifyMentalState(55).name).toBe("NEUTRAL");
    expect(classifyMentalState(40).name).toBe("DISTRACTED");
    expect(classifyMentalState(39.99).name).toBe("OFF NIGHT");
    expect(calculateMentalStateScore({ health: 80, popularity: 70, experience: 60, fanReaction: 4, gimmick: 3, overall: 75, luck: 5, swing: -10 })).toBe(67);
    expect(mentalSwingProbability(100)).toBeCloseTo(0.05, 10);
    expect(mentalSwingProbability(50)).toBeCloseTo(0.075, 10);
  });

  test("preserves combined aim and legacy importance data with explicit conflicts", () => {
    expect(MATCH_AIMS).toHaveLength(20);
    expect(MATCH_AIMS.find((aim) => aim.name === "High Spots Spectacle")?.idealPace).toBe(6);
    expect(MATCH_AIMS.find((aim) => aim.name === "Open Match")?.idealPace).toBe(0);
    expect(MATCH_IMPORTANCE_PROFILES).toHaveLength(14);
    expect(MATCH_IMPORTANCE_PROFILES.find((profile) => profile.name === "PPV Main Event")?.sourceApproachCount).toBe(4);
    expect(SOURCE_CONFLICTS.some((record) => record.id === "pace-controller-pace")).toBe(true);
    expect(SOURCE_CONFLICTS.some((record) => record.id === "importance-approach-count")).toBe(true);
  });
});

describe("Phase 4C2 match setup and approach AI", () => {
  test("reproduces the workbook stamina rating and capacity bands", () => {
    const profile = testProfile();
    const expected = (74 + 84 + 75 + 75 + 85 + 70) / 6;
    expect(calculateProfileStaminaRating(profile)).toBeCloseTo(expected, 2);
    expect(staminaCapacityFromRating(75)).toBe(9);
    expect(staminaCapacityFromRating(70)).toBe(7);
    expect(staminaCapacityFromRating(65)).toBe(6);
    expect(staminaCapacityFromRating(60)).toBe(5);
    expect(staminaCapacityFromRating(50)).toBe(4);
    expect(staminaCapacityFromRating(30)).toBe(3);
    expect(staminaCapacityFromRating(20)).toBe(2);
    expect(staminaCapacityFromRating(19.99)).toBe(1);
    expect(profileStaminaCapacity(profile)).toBe(9);
  });

  test("selects the correct number of approaches for each duration band", () => {
    const profile = testProfile();
    expect(chooseApproachPlan(profile, "competitive-tv-match", 5).selectedApproachIds).toHaveLength(1);
    expect(chooseApproachPlan(profile, "competitive-tv-match", 12).selectedApproachIds).toHaveLength(2);
    expect(chooseApproachPlan(profile, "competitive-tv-match", 20).selectedApproachIds).toHaveLength(3);
    expect(chooseApproachPlan(profile, "competitive-tv-match", 25).selectedApproachIds).toHaveLength(4);
  });

  test("preserves manual locks while choosing the best remaining combination", () => {
    const profile = testProfile();
    const result = chooseApproachPlan(profile, "technical-showcase", 20, ["submission-specialist"]);
    expect(result.selectedApproachIds).toHaveLength(3);
    expect(result.selectedApproachIds).toContain("submission-specialist");
    expect(result.usedStamina).toBeLessThanOrEqual(result.availableStamina);
  });

  test("uses transparent wrestler style boosts in candidate scoring", () => {
    const profile = testProfile();
    const highTempo = MATCH_APPROACHES.find((approach) => approach.id === "high-tempo-hybrid")!;
    const boosted = scoreApproachCandidate(profile, "sprint", highTempo);
    const unboostedProfile = { ...profile, styleId: "all-rounder" as const };
    const unboosted = scoreApproachCandidate(unboostedProfile, "sprint", highTempo);
    expect(WRESTLER_STYLES.find((style) => style.id === profile.styleId)?.approachBoosts).toContain("high-tempo-hybrid");
    expect(boosted.styleBonus).toBe(8);
    expect(unboosted.styleBonus).toBe(0);
    expect(boosted.total).toBeGreaterThan(unboosted.total);
  });

  test("provides every value needed to preview an approach before selection", () => {
    const profile = testProfile();
    const approach = MATCH_APPROACHES.find((item) => item.id === "high-tempo-hybrid")!;
    const candidate = scoreApproachCandidate(profile, "sprint", approach);
    expect(candidate).toMatchObject({
      approachId: "high-tempo-hybrid",
      rating: expect.any(Number),
      total: expect.any(Number),
      styleBonus: expect.any(Number),
      aimCompatibility: expect.any(Number),
      paceBonus: expect.any(Number),
      staminaEfficiency: expect.any(Number),
    });
    expect(candidate.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining("weighted approach rating"),
      expect.stringContaining("stamina"),
    ]));
    expect(candidate.total).toBeGreaterThanOrEqual(0);
    expect(candidate.total).toBeLessThanOrEqual(100);
    expect(candidate.opponentCompatibility).toBe(0);
  });

  test("uses the manually configured approach limit instead of the duration recommendation", () => {
    const profile = testProfile();
    expect(chooseApproachPlan(profile, "competitive-tv-match", 25, [], 2).selectedApproachIds).toHaveLength(2);
    expect(chooseApproachPlan(profile, "competitive-tv-match", 5, [], 4).selectedApproachIds).toHaveLength(4);
  });

  test("persists tracker-side wrestler profiles without modifying TEW data", () => {
    const storage = new MemoryStorage();
    const profile = testProfile();
    saveMatchEngineUniverse(storage, { profiles: [profile] });
    expect(storage.getItem(MATCH_ENGINE_STORAGE_KEY)).toContain("Test Wrestler");
    expect(loadMatchEngineUniverse(storage)).toEqual({ profiles: [profile] });
  });
});

describe("Phase 4C3 advisory match performance preview", () => {
  const first = testProfile("Jay White", "jay");
  const second = { ...testProfile("PAC", "pac"), overall: 82, popularity: 76, styleId: "high-flyer" as const };
  const workers = [
    { profile: first, plan: testPlan(first, ["psychological-manipulator", "opportunistic-schemer", "big-match-performer"]) },
    { profile: second, plan: testPlan(second, ["aerial-showstopper", "high-tempo-hybrid", "resilient-underdog"]) },
  ];

  test("replays the same night deterministically from a saved seed", () => {
    const input = {
      workers,
      aimId: "competitive-tv-match" as const,
      durationMinutes: 20,
      plannedWinner: "Jay White",
      settings: { authority: "tew-authoritative" as const, volatility: 5, bookingInfluence: 0 },
      seed: "phase-4c3-test-night",
    };
    const firstRun = generateMatchPerformancePreview(input)!;
    const secondRun = generateMatchPerformancePreview(input)!;
    expect(secondRun.workerResults).toEqual(firstRun.workerResults);
    expect(secondRun.matchScore).toBe(firstRun.matchScore);
    expect(firstRun.projectedWinnerName).toBe("");
    expect(firstRun.summary).toContain("TEW remains authoritative");
  });

  test("keeps the booker-selected winner fixed while rating execution", () => {
    const preview = generateMatchPerformancePreview({
      workers,
      aimId: "competitive-tv-match",
      durationMinutes: 20,
      plannedWinner: "PAC",
      settings: { authority: "booker-selected", volatility: 5, bookingInfluence: 0 },
      seed: "booker-fixed",
    })!;
    expect(preview.projectedWinnerName).toBe("PAC");
    expect(preview.confidence).toBe(100);
    expect(preview.summary).toContain("remains fixed by the booking");
  });

  test("can show an optional competitive projection without changing the booking", () => {
    const preview = generateMatchPerformancePreview({
      workers,
      aimId: "competitive-tv-match",
      durationMinutes: 20,
      plannedWinner: "Jay White",
      settings: { authority: "competitive-preview", volatility: 6, bookingInfluence: 0 },
      seed: "competitive-night",
    })!;
    expect(["Jay White", "PAC"]).toContain(preview.projectedWinnerName);
    expect(preview.confidence).toBeGreaterThan(50);
    expect(preview.workerResults.reduce((sum, result) => sum + result.winProbability, 0)).toBeCloseTo(1, 3);
    expect(preview.summary).toContain("does not change the planned winner or TEW result");
  });

  test("converts advisory match scores to quarter-star ratings", () => {
    expect(advisoryStarRating(20)).toBe(0);
    expect(advisoryStarRating(50)).toBe(2);
    expect(advisoryStarRating(80)).toBe(4);
    expect(advisoryStarRating(95)).toBe(5);
    expect(formatStarRating(4)).toBe("4★");
  });
});
