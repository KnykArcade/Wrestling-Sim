import { describe, expect, test } from "vitest";
import { calculateLiveMatchAudience, calculateMatchAnticipation, calculateMentalNightAdjustment, crowdHeatLabel, momentumLabel, projectedCrowdBeforeForSegment } from "../src/crowd/model";
import { createMatchEngineProfile } from "../src/matchEngine/model";
import { generateMatchPerformancePreview } from "../src/matchEngine/performance";
import { createPlannedSegment } from "../src/planner/model";

describe("Phase 6B20C momentum, anticipation, and live crowd dynamics", () => {
  test("builds anticipation from popularity, momentum, skills, and style appeal", () => {
    const star = createMatchEngineProfile({ id: "star", name: "Star", source: "manual" });
    const opponent = createMatchEngineProfile({ id: "opponent", name: "Opponent", source: "manual" });
    star.popularity = 90;
    star.momentum = 80;
    star.overall = 85;
    star.skills.Psychology = 90;
    star.skills.Charisma = 88;
    star.styleId = "show-stealer-workhorse";
    opponent.popularity = 60;
    opponent.momentum = 50;
    const result = calculateMatchAnticipation({ profiles: [star, opponent], plans: [], aimId: "feature-match" });
    expect(result.score).toBeGreaterThan(60);
    expect(result).toMatchObject({ label: "Hot" });
    expect(result.popularity).toBeGreaterThan(result.momentum);
    expect(result.skills).toBeGreaterThan(60);
    expect(result.styleAppeal).toBeGreaterThan(50);
    expect(result.calculationLedger?.total.terms.map((term) => term.weight)).toEqual([0.35, 0.3, 0.2, 0.15]);
  });

  test("moves anticipation fifteen points from neutral to either momentum extreme", () => {
    const profiles = [
      createMatchEngineProfile({ id: "one", name: "One", source: "manual" }),
      createMatchEngineProfile({ id: "two", name: "Two", source: "manual" }),
    ];
    profiles.forEach((profile) => { profile.momentum = 50; });
    const neutral = calculateMatchAnticipation({ profiles, plans: [], aimId: "feature-match" });
    profiles.forEach((profile) => { profile.momentum = 0; });
    const cold = calculateMatchAnticipation({ profiles, plans: [], aimId: "feature-match" });
    profiles.forEach((profile) => { profile.momentum = 100; });
    const hot = calculateMatchAnticipation({ profiles, plans: [], aimId: "feature-match" });
    expect(cold.score).toBe(neutral.score - 15);
    expect(hot.score).toBe(neutral.score + 15);
  });

  test("turns performance, anticipation, and incoming heat into one official live rating", () => {
    const result = calculateLiveMatchAudience(78, 70, 60);
    expect(result).toMatchObject({
      performanceRating: 78,
      anticipation: 70,
      anticipationLabel: "Hot",
      crowdBefore: 60,
      crowdBeforeLabel: "Hot",
      crowdResponse: 68.3,
      expectationAdjustment: 2.8,
      mentalNightAdjustment: 0,
      finalRating: 74.1,
      crowdAfter: 62.8,
      crowdAfterLabel: "Hot",
    });
    expect(result.calculationLedger?.crowdResponse).toMatchObject({
      formulaId: "crowd.match-response",
      rawSubtotal: 68.3,
      result: 68.3,
      capApplied: false,
      roundingPlaces: 1,
    });
    expect(result.calculationLedger?.crowdResponse.terms.map((term) => term.id)).toEqual(["anticipation", "incoming", "expectation", "mental-night"]);
    expect(result.calculationLedger?.finalRating.terms.map((term) => term.contribution)).toEqual([46.8, 27.32]);
  });

  test.each([
    ["average match", 65, 55, 50, 61.5],
    ["strong match with a warm crowd", 78, 70, 60, 74.1],
    ["elite match with a hot crowd", 90, 85, 80, 87.8],
    ["excellent match with a cold crowd", 90, 40, 35, 75.1],
    ["hyped match that disappoints", 55, 85, 80, 59.5],
    ["weak match with a dead crowd", 45, 30, 25, 40.2],
  ])("calibrates the %s scenario", (_label, performance, anticipation, crowdBefore, expectedFinal) => {
    expect(calculateLiveMatchAudience(performance, anticipation, crowdBefore).finalRating).toBe(expectedFinal);
  });

  test("rewards overdelivery less aggressively than it penalizes disappointment and caps both", () => {
    const overdelivery = calculateLiveMatchAudience(90, 70, 50);
    const disappointment = calculateLiveMatchAudience(50, 70, 50);
    const cappedOverdelivery = calculateLiveMatchAudience(100, 0, 50);
    const cappedDisappointment = calculateLiveMatchAudience(0, 100, 50);
    expect(overdelivery.expectationAdjustment).toBe(7);
    expect(disappointment.expectationAdjustment).toBe(-11);
    expect(cappedOverdelivery.expectationAdjustment).toBe(15);
    expect(cappedDisappointment.expectationAdjustment).toBe(-20);
    expect(cappedOverdelivery.calculationLedger?.expectationAdjustment.capApplied).toBe(true);
    expect(cappedDisappointment.calculationLedger?.expectationAdjustment.capApplied).toBe(true);
  });

  test("caps crowd movement and exposes the approved momentum and heat labels", () => {
    expect(calculateLiveMatchAudience(100, 100, 0).crowdAfter).toBe(15);
    expect(momentumLabel(50)).toBe("Even");
    expect(momentumLabel(82)).toBe("White Hot");
    expect(crowdHeatLabel(19)).toBe("Dead");
    expect(crowdHeatLabel(65)).toBe("Hot");
  });

  test("makes two strong mental nights surge and multiple poor nights compound", () => {
    expect(calculateMentalNightAdjustment(["HOT NIGHT", "HOT NIGHT"]).result).toBe(12);
    expect(calculateMentalNightAdjustment(["FOCUSED", "FOCUSED"]).result).toBe(6);
    expect(calculateMentalNightAdjustment(["OFF NIGHT", "NEUTRAL"]).result).toBe(-5);
    expect(calculateMentalNightAdjustment(["OFF NIGHT", "OFF NIGHT"]).result).toBe(-14);
    expect(calculateLiveMatchAudience(80, 70, 50, ["HOT NIGHT", "HOT NIGHT"]).crowdAfter).toBe(58.8);
    expect(calculateLiveMatchAudience(80, 70, 50, ["FOCUSED", "FOCUSED"]).crowdAfter).toBe(56.8);
    expect(calculateLiveMatchAudience(40, 70, 50, ["OFF NIGHT", "NEUTRAL"]).crowdAfter).toBe(43);
    expect(calculateLiveMatchAudience(40, 70, 50, ["OFF NIGHT", "OFF NIGHT"]).crowdAfter).toBe(37);
  });

  test("projects incoming heat from earlier rolled matches and responds to card order", () => {
    const opener = createPlannedSegment("match");
    opener.id = "opener";
    opener.workers = [
      { id: "star", name: "Star", source: "manual", role: "Wrestler", side: "Side 1" },
      { id: "opponent", name: "Opponent", source: "manual", role: "Wrestler", side: "Side 2" },
    ];
    const second = createPlannedSegment("match");
    second.id = "second";
    const star = createMatchEngineProfile(opener.workers[0]);
    const opponent = createMatchEngineProfile(opener.workers[1]);
    star.popularity = 85;
    opponent.popularity = 70;
    opener.matchApproachSetup.workerPlans = [star, opponent].map((profile) => ({
      workerKey: profile.workerKey,
      workerName: profile.workerName,
      selectedApproachIds: ["chain-technician"],
      lockedApproachIds: [],
      mode: "Manual" as const,
      generatedAt: "",
    }));
    opener.matchApproachSetup.performancePreview = generateMatchPerformancePreview({
      workers: [star, opponent].map((profile, index) => ({
        profile,
        plan: opener.matchApproachSetup.workerPlans[index],
        teamId: `side ${index + 1}`,
        teamName: profile.workerName,
      })),
      aimId: opener.matchApproachSetup.matchAimId,
      durationMinutes: opener.durationMinutes,
      plannedWinner: "",
      settings: opener.matchApproachSetup.performanceSettings,
      importance: "Television",
      matchType: opener.matchType,
      format: "Singles",
      eliminationRules: false,
      seed: "crowd-projection",
    });

    const afterOpener = projectedCrowdBeforeForSegment({ segments: [opener, second], segmentId: second.id, profiles: [star, opponent], crowdStart: 50 });
    const whenOpening = projectedCrowdBeforeForSegment({ segments: [second, opener], segmentId: second.id, profiles: [star, opponent], crowdStart: 50 });

    expect(afterOpener).toBeGreaterThan(50);
    expect(whenOpening).toBe(50);
  });
});
