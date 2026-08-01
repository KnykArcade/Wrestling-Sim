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
  classifyMentalState,
  evaluatePace,
  evaluateStamina,
  mentalSwingProbability,
  resolveApproachId,
} from "../src/matchEngine/model";

describe("native match engine data foundation", () => {
  test("loads fifteen canonical approaches with normalized one-hundred-percent formulas", () => {
    expect(MATCH_APPROACHES).toHaveLength(15);
    const ids = new Set(MATCH_APPROACHES.map((approach) => approach.id));
    expect(ids.size).toBe(15);
    MATCH_APPROACHES.forEach((approach) => {
      expect(approach.formula).toHaveLength(4);
      expect(approach.formula.reduce((sum, item) => sum + item.weight, 0)).toBeCloseTo(1, 8);
      expect(approach.staminaCost).toBeGreaterThanOrEqual(1);
      expect(approach.staminaCost).toBeLessThanOrEqual(3);
    });
  });

  test("reproduces uploaded weighted approach formulas", () => {
    const aerial = MATCH_APPROACHES.find((approach) => approach.id === "aerial-showstopper");
    const bigMatch = MATCH_APPROACHES.find((approach) => approach.id === "big-match-performer");
    const submission = MATCH_APPROACHES.find((approach) => approach.id === "submission-specialist");
    expect(aerial).toBeDefined();
    expect(bigMatch).toBeDefined();
    expect(submission).toBeDefined();
    expect(calculateApproachRating(aerial!, { Aerial: 80, Athleticism: 70, Flashiness: 60, Basics: 50 })).toBe(70);
    expect(calculateApproachRating(bigMatch!, { Psychology: 90, Consistency: 80, Charisma: 70, Stamina: 60 })).toBe(80);
    expect(calculateApproachRating(submission!, { Technical: 85, Psychology: 75, Basics: 65, Toughness: 55 })).toBe(73.5);
  });

  test("normalizes workbook aliases without inventing mappings for unresolved records", () => {
    expect(resolveApproachId("Aerial Specialist")).toBe("aerial-showstopper");
    expect(resolveApproachId("Heavy Striker/Brawler")).toBe("heavy-striker-brawler");
    expect(resolveApproachId("Heavy Striker / Brawler")).toBe("heavy-striker-brawler");
    expect(resolveApproachId("Workrate Machine")).toBe("high-tempo-hybrid");
    expect(resolveApproachId("Counter Specialist")).toBeNull();
    expect(resolveApproachId("Ring General")).toBeNull();
    expect(APPROACH_ALIASES.filter((record) => record.status === "legacy-unmapped")).toHaveLength(2);
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
    expect(mentalSwingProbability(100)).toBe(0.05);
    expect(mentalSwingProbability(50)).toBe(0.075);
  });

  test("preserves combined aim and legacy importance data with explicit conflicts", () => {
    expect(MATCH_AIMS).toHaveLength(19);
    expect(MATCH_AIMS.find((aim) => aim.name === "High Spots Spectacle")?.idealPace).toBe(6);
    expect(MATCH_AIMS.find((aim) => aim.name === "Open Match")?.idealPace).toBe(0);
    expect(MATCH_IMPORTANCE_PROFILES).toHaveLength(14);
    expect(MATCH_IMPORTANCE_PROFILES.find((profile) => profile.name === "PPV Main Event")?.sourceApproachCount).toBe(4);
    expect(SOURCE_CONFLICTS.some((record) => record.id === "pace-controller-pace")).toBe(true);
    expect(SOURCE_CONFLICTS.some((record) => record.id === "importance-approach-count")).toBe(true);
  });
});
