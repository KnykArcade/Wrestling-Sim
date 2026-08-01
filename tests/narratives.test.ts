import { describe, expect, test } from "vitest";
import { createMatchEngineProfile, workerProfileKey } from "../src/matchEngine/model";
import type { MatchEngineUniverse } from "../src/matchEngine/types";
import { generateAngleNarrative, generateMatchNarrative } from "../src/narratives/generator";
import { createPlannedSegment } from "../src/planner/model";

function configuredMatch() {
  const segment = createPlannedSegment("match");
  const first = { id: "jay", name: "Jay White", role: "Competitor", side: "Side 1", source: "manual" as const };
  const second = { id: "pac", name: "PAC", role: "Competitor", side: "Side 2", source: "manual" as const };
  segment.workers = [first, second];
  segment.durationMinutes = 20;
  segment.plannedWinner = "Jay White";
  segment.plannedFinish = "pinfall after countering the Black Arrow";
  segment.matchApproachSetup.matchAimId = "competitive-tv-match";
  segment.matchApproachSetup.workerPlans = [
    {
      workerKey: workerProfileKey(first),
      workerName: first.name,
      selectedApproachIds: ["psychological-manipulator", "opportunistic-schemer", "big-match-performer"],
      lockedApproachIds: [],
      mode: "AI",
      generatedAt: "",
    },
    {
      workerKey: workerProfileKey(second),
      workerName: second.name,
      selectedApproachIds: ["aerial-showstopper", "high-tempo-hybrid", "resilient-underdog"],
      lockedApproachIds: [],
      mode: "AI",
      generatedAt: "",
    },
  ];
  const jayProfile = createMatchEngineProfile(first);
  const pacProfile = createMatchEngineProfile(second);
  const universe: MatchEngineUniverse = { profiles: [jayProfile, pacProfile] };
  return { segment, universe };
}

describe("Phase 4C4 generated narrative outputs", () => {
  test("builds a source-grounded match story from selected approaches and the booked finish", () => {
    const { segment, universe } = configuredMatch();
    const draft = generateMatchNarrative(segment, universe, { tone: "sports", detail: "standard", usePerformancePreview: false });
    expect(draft.kind).toBe("match");
    expect(draft.opening).toContain("Jay White got in their opponent’s head");
    expect(draft.opening).toContain("PAC relied on high-flying offense");
    expect(draft.finish).toContain("Jay White");
    expect(draft.finish).toContain("wins by pinfall after countering the Black Arrow");
    expect(draft.fullOutput).toContain("competitive sporting contest");
    expect(draft.keyMoments).toContain("Turning point:");
    expect(draft.provenance.some((line) => line.includes("uploaded phrase library"))).toBe(true);
  });

  test("does not select a winner when the booker has not entered one", () => {
    const { segment, universe } = configuredMatch();
    segment.plannedWinner = "";
    segment.matchApproachSetup.performancePreview = {
      id: "preview",
      generatedAt: "2026-08-01T00:00:00.000Z",
      seed: "seed",
      authority: "competitive-preview",
      matchScore: 80,
      starRating: 4,
      performanceLeaderKey: "manual:pac",
      performanceLeaderName: "PAC",
      projectedWinnerKey: "manual:pac",
      projectedWinnerName: "PAC",
      confidence: 60,
      summary: "Advisory only",
      workerResults: [],
    };
    const draft = generateMatchNarrative(segment, universe, { tone: "sports", detail: "standard", usePerformancePreview: true });
    expect(draft.finish).toContain("winner remains unresolved");
    expect(draft.finish).not.toContain("PAC wins");
    expect(draft.warnings.some((warning) => warning.includes("No planned winner"))).toBe(true);
  });

  test("uses source summaries and warns when a selected approach has no phrase row", () => {
    const { segment, universe } = configuredMatch();
    segment.matchApproachSetup.workerPlans[1].selectedApproachIds = ["resilient-underdog", "strong-style-specialist", "dirty-rulebreaker"];
    const draft = generateMatchNarrative(segment, universe, { tone: "road-agent", detail: "detailed", usePerformancePreview: false });
    expect(draft.fullOutput).toContain("Approach map:");
    expect(draft.warnings.some((warning) => warning.includes("Resilient Underdog has no dedicated phrase-library row"))).toBe(true);
  });

  test("builds an angle output only from entered tracker facts", () => {
    const segment = createPlannedSegment("angle");
    segment.angleLocation = "In The Ring";
    segment.angleContentType = "Storyline Advancement";
    segment.workers = [
      { id: "champ", name: "World Champion", role: "Champion", side: "", source: "manual" },
      { id: "challenger", name: "Top Contender", role: "Challenger", side: "", source: "manual" },
    ];
    segment.purpose = "The contender challenges the champion to a title match.";
    segment.consequences = "The champion accepts, making the match official.";
    segment.followUp = "Place the contract signing on next week's television show.";
    segment.audienceTakeaway = "the championship match is now official";
    const draft = generateAngleNarrative(segment, { tone: "sports", detail: "standard", usePerformancePreview: false });
    expect(draft.kind).toBe("angle");
    expect(draft.fullOutput).toContain("In The Ring");
    expect(draft.fullOutput).toContain("The contender challenges the champion");
    expect(draft.fullOutput).toContain("the championship match is now official");
    expect(draft.provenance[0]).toContain("only workers, roles, location");
  });
});
