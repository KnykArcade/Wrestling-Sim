import { describe, expect, test } from "vitest";
import {
  applyTitleResult,
  buildChampionshipWarnings,
  buildCompetitiveRecord,
  buildTitleResultSuggestions,
  competitorNames,
  createChampionship,
  createChampionshipReign,
  suggestRankings,
  titleMatchesSegment,
} from "../src/championships/model";
import {
  CHAMPIONSHIP_STORAGE_KEY,
  emptyChampionshipUniverse,
  loadChampionshipUniverse,
  parseChampionshipUniverse,
  saveChampionshipUniverse,
} from "../src/championships/storage";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";
import type { WorkerUniverse } from "../src/workers/types";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function reconciledTitleShow(winner: string) {
  const show = createPlannedShow(1);
  show.id = "show-1";
  show.name = "Championship Night";
  show.date = "2026-08-01";
  show.status = "Reconciled";
  const segment = createPlannedSegment("match");
  segment.id = "segment-1";
  segment.title = "PWL Championship Match";
  segment.championship = "PWL Championship";
  segment.championEntering = "Bret Hart";
  segment.challenger = "Shawn Michaels";
  segment.workers = [
    { id: "bret", name: "Bret Hart", role: "Competitor", side: "Side 1", source: "manual" },
    { id: "shawn", name: "Shawn Michaels", role: "Competitor", side: "Side 2", source: "manual" },
  ];
  segment.workflowStatus = "Reconciled";
  segment.reconciliation.actualMatch = {
    id: "actual-1",
    description: "PWL Championship Match",
    rating: 91,
    winner,
    matchTime: "28:14",
    notes: "",
    placement: "Main Show",
    workers: ["Bret Hart", "Shawn Michaels"],
  };
  show.segments = [segment];
  return { show, segment };
}

describe("championship universe", () => {
  test("creates and persists a tracker championship", () => {
    const storage = new MemoryStorage();
    const championship = createChampionship(1);
    championship.name = "PWL Championship";
    championship.currentChampions = [{ id: "bret", name: "Bret Hart" }];
    championship.status = "Active";
    const universe = { championships: [championship] };
    saveChampionshipUniverse(storage, universe);
    expect(storage.getItem(CHAMPIONSHIP_STORAGE_KEY)).toContain("PWL Championship");
    expect(loadChampionshipUniverse(storage)).toEqual(universe);
    expect(competitorNames(championship.currentChampions)).toBe("Bret Hart");
  });

  test("links legacy free-text title matches to the tracker championship", () => {
    const championship = createChampionship(1);
    championship.name = "PWL World Championship";
    championship.legacyNames = ["PWL Championship"];
    const segment = createPlannedSegment("match");
    segment.championship = "PWL Championship";
    expect(titleMatchesSegment(championship, segment)).toBe(true);
    segment.championshipId = championship.id;
    segment.championship = "Different text";
    expect(titleMatchesSegment(championship, segment)).toBe(true);
  });

  test("suggests a retention and requires confirmation before changing lineage", () => {
    const championship = createChampionship(1);
    championship.name = "PWL Championship";
    championship.status = "Active";
    championship.currentChampions = [{ id: "bret", name: "Bret Hart" }];
    championship.dateWon = "2026-07-01";
    championship.reigns = [createChampionshipReign(championship.currentChampions, [], championship.dateWon)];
    const { show, segment } = reconciledTitleShow("Bret Hart");
    const [suggestion] = buildTitleResultSuggestions(championship, [show]);
    expect(suggestion.suggestedDecision).toBe("Retained");
    expect(championship.defenses).toBe(0);
    const result = applyTitleResult(championship, show, segment, "Retained");
    expect(result.championship.defenses).toBe(1);
    expect(result.championship.reigns[0].successfulDefenses).toBe(1);
    expect(result.show.segments[0].titleResultDecision).toBe("Retained");
    expect(result.show.segments[0].titleResultConfirmedAt).not.toBe("");
  });

  test("ends the old reign and begins a new reign after a confirmed title change", () => {
    const championship = createChampionship(1);
    championship.name = "PWL Championship";
    championship.status = "Active";
    championship.currentChampions = [{ id: "bret", name: "Bret Hart" }];
    championship.dateWon = "2026-07-01";
    championship.reigns = [createChampionshipReign(championship.currentChampions, [], championship.dateWon)];
    const { show, segment } = reconciledTitleShow("Shawn Michaels");
    const [suggestion] = buildTitleResultSuggestions(championship, [show]);
    expect(suggestion.suggestedDecision).toBe("Changed Hands");
    const result = applyTitleResult(championship, show, segment, "Changed Hands", [{ id: "shawn", name: "Shawn Michaels" }]);
    expect(competitorNames(result.championship.currentChampions)).toBe("Shawn Michaels");
    expect(result.championship.previousChampions[0].name).toBe("Bret Hart");
    expect(result.championship.reigns).toHaveLength(2);
    expect(result.championship.reigns[0].status).toBe("Ended");
    expect(result.championship.reigns[1].status).toBe("Active");
  });

  test("reconstructs title activity chronologically and prevents duplicate source results", () => {
    const championship = createChampionship(1);
    championship.id = "world-title";
    championship.name = "PWL Championship";
    championship.status = "Active";
    championship.currentChampions = [{ id: "bret", name: "Bret Hart" }];
    championship.dateWon = "2026-07-01";
    championship.reigns = [createChampionshipReign(championship.currentChampions, [], championship.dateWon)];
    const later = reconciledTitleShow("Shawn Michaels");
    later.show.date = "2026-08-15";
    const changed = applyTitleResult(championship, later.show, later.segment, "Changed Hands", [{ id: "shawn", name: "Shawn Michaels" }], { sourceResultId: "later" });
    const earlier = reconciledTitleShow("Bret Hart");
    earlier.show.id = "show-earlier-title";
    earlier.show.date = "2026-08-01";
    earlier.segment.id = "segment-earlier-title";
    earlier.show.segments = [earlier.segment];
    const replayed = applyTitleResult(changed.championship, earlier.show, earlier.segment, "Retained", [], { sourceResultId: "earlier" });
    expect(competitorNames(replayed.championship.currentChampions)).toBe("Shawn Michaels");
    expect(replayed.championship.reigns.find((reign) => reign.champions[0]?.name === "Bret Hart")?.successfulDefenses).toBe(1);
    expect(replayed.championship.lastTitleActivityDate).toBe("2026-08-15");
    expect(() => applyTitleResult(replayed.championship, earlier.show, earlier.segment, "Retained", [], { sourceResultId: "earlier" })).toThrow("already updated");
  });

  test("calculates grounded worker records from reconciled results", () => {
    const first = reconciledTitleShow("Bret Hart").show;
    const second = reconciledTitleShow("Shawn Michaels").show;
    second.id = "show-2";
    second.date = "2026-08-08";
    second.segments[0].id = "segment-2";
    const championship = createChampionship(1);
    championship.name = "PWL Championship";
    const record = buildCompetitiveRecord("Bret Hart", [first, second], { championships: [championship] });
    expect(record).toMatchObject({ wins: 1, losses: 1, matchCount: 2, championshipMatches: 2 });
    expect(record.lastFive).toEqual(["L", "W"]);
    expect(record.opponents["Shawn Michaels"]).toEqual({ wins: 1, losses: 1 });
  });

  test("generates transparent rankings and preserves locked entries", () => {
    const championship = createChampionship(1);
    championship.name = "PWL Championship";
    championship.currentChampions = [{ id: "bret", name: "Bret Hart" }];
    championship.rankings = [{
      id: "locked",
      rank: 1,
      competitors: [{ id: "owen", name: "Owen Hart" }],
      eligibility: "Eligible",
      record: "3-0-0",
      recentForm: "W W W",
      lastChampionshipOpportunity: "",
      reason: "Commissioner selection",
      movement: 0,
      locked: true,
      updatedAt: "2026-08-01T00:00:00.000Z",
    }];
    const workers: WorkerUniverse = {
      profiles: [
        { id: "bret", displayName: "Bret Hart", source: "manual", linkedTewWorkerId: "", linkedTewWorkerName: "", currentRole: "Wrestler", alignment: "Face", brand: "", gimmickSummary: "", currentMotivation: "", longTermObjective: "", creativeDirection: "", privateNotes: "", inactivityWarningDays: 45, arcs: [], createdAt: "", updatedAt: "" },
        { id: "owen", displayName: "Owen Hart", source: "manual", linkedTewWorkerId: "", linkedTewWorkerName: "", currentRole: "Wrestler", alignment: "Heel", brand: "", gimmickSummary: "", currentMotivation: "", longTermObjective: "", creativeDirection: "", privateNotes: "", inactivityWarningDays: 45, arcs: [], createdAt: "", updatedAt: "" },
        { id: "shawn", displayName: "Shawn Michaels", source: "manual", linkedTewWorkerId: "", linkedTewWorkerName: "", currentRole: "Wrestler", alignment: "Heel", brand: "", gimmickSummary: "", currentMotivation: "", longTermObjective: "", creativeDirection: "", privateNotes: "", inactivityWarningDays: 45, arcs: [], createdAt: "", updatedAt: "" },
      ],
      relationships: [],
    };
    const { show } = reconciledTitleShow("Shawn Michaels");
    const rankings = suggestRankings(championship, [show], workers, { championships: [championship] }, { workerRecords: [{ workerKey: "manual:shawn-michaels", workerId: "shawn", workerName: "Shawn Michaels", wins: 1, losses: 0, draws: 0, noContests: 0, currentStreakType: "W", currentStreakCount: 1, lastFive: ["W"], rankingPoints: 4.5, rankingPosition: 1, previousRankingPosition: 0, momentum: 55, momentumScale: "0-100-v1", popularity: 50, health: 100, fatigue: 0, injuryStatus: "Healthy", injuryNote: "", matchHistory: [], updatedAt: "" } as any], teamRecords: [] });
    expect(rankings[0].id).toBe("locked");
    expect(rankings.some((ranking) => ranking.competitors[0]?.name === "Shawn Michaels")).toBe(true);
    expect(rankings.find((ranking) => ranking.competitors[0]?.name === "Shawn Michaels")?.reason).toContain("Official Phase 6B20 ranking ledger");
  });

  test("uses the official consequence ranking points for Championship Hub suggestions", () => {
    const championship = createChampionship(1);
    const workers: WorkerUniverse = { profiles: [], relationships: [] };
    const records = {
      workerRecords: [
        { workerKey: "tew:a", workerId: "a", workerName: "Alpha", wins: 1, losses: 0, draws: 0, noContests: 0, currentStreakType: "W", currentStreakCount: 1, lastFive: ["W"], rankingPoints: 9, rankingPosition: 1, previousRankingPosition: 0, momentum: 50, momentumScale: "0-100-v1", popularity: 50, health: 100, fatigue: 0, injuryStatus: "Healthy", injuryNote: "", matchHistory: [], updatedAt: "" },
        { workerKey: "tew:b", workerId: "b", workerName: "Beta", wins: 4, losses: 0, draws: 0, noContests: 0, currentStreakType: "W", currentStreakCount: 4, lastFive: ["W"], rankingPoints: 7, rankingPosition: 2, previousRankingPosition: 0, momentum: 50, momentumScale: "0-100-v1", popularity: 50, health: 100, fatigue: 0, injuryStatus: "Healthy", injuryNote: "", matchHistory: [], updatedAt: "" },
      ],
      teamRecords: [],
    } as any;
    const rankings = suggestRankings(championship, [], workers, { championships: [championship] }, records);
    expect(rankings.map((ranking) => ranking.competitors[0].name)).toEqual(["Alpha", "Beta"]);
    expect(rankings[0]).toMatchObject({ calculatedPoints: 9, calculatedRank: 1 });
    expect(rankings[0].reason).toContain("official results");
  });

  test("surfaces lineage vacancy and unconfirmed-result warnings", () => {
    const championship = createChampionship(1);
    championship.name = "PWL Championship";
    championship.status = "Active";
    championship.currentChampions = [];
    championship.reigns = [
      createChampionshipReign([{ id: "a", name: "A" }], []),
      createChampionshipReign([{ id: "b", name: "B" }], []),
    ];
    const { show } = reconciledTitleShow("Shawn Michaels");
    const warnings = buildChampionshipWarnings({ championships: [championship] }, [show], []);
    expect(warnings.some((warning) => warning.category === "Lineage")).toBe(true);
    expect(warnings.some((warning) => warning.category === "Champion")).toBe(true);
    expect(warnings.some((warning) => warning.category === "Match")).toBe(true);
  });

  test("migrates incomplete championship data and rejects non-objects", () => {
    expect(parseChampionshipUniverse({ championships: [{ id: "title-1", name: "Legacy Title" }] }).championships[0]).toMatchObject({ name: "Legacy Title", division: "Singles", status: "Vacant", rankings: [], reigns: [] });
    expect(emptyChampionshipUniverse()).toEqual({ championships: [] });
    expect(() => parseChampionshipUniverse([])).toThrow("not in a supported format");
  });
});
