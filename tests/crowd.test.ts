import { describe, expect, test } from "vitest";
import { calculateLiveMatchAudience, calculateMatchAnticipation, crowdHeatLabel, momentumLabel } from "../src/crowd/model";
import { createMatchEngineProfile } from "../src/matchEngine/model";

describe("Phase 6B18 momentum, anticipation, and live crowd dynamics", () => {
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
  });

  test("turns performance, anticipation, and incoming heat into one official live rating", () => {
    expect(calculateLiveMatchAudience(78, 70, 60)).toEqual({
      performanceRating: 78,
      anticipation: 70,
      anticipationLabel: "Hot",
      crowdBefore: 60,
      crowdBeforeLabel: "Hot",
      crowdResponse: 73.6,
      expectationAdjustment: 1.6,
      finalRating: 76.7,
      crowdAfter: 64.5,
      crowdAfterLabel: "Hot",
    });
  });

  test("caps crowd movement and exposes the approved momentum and heat labels", () => {
    expect(calculateLiveMatchAudience(100, 100, 0).crowdAfter).toBe(12);
    expect(momentumLabel(50)).toBe("Even");
    expect(momentumLabel(82)).toBe("White Hot");
    expect(crowdHeatLabel(19)).toBe("Dead");
    expect(crowdHeatLabel(65)).toBe("Hot");
  });
});
