import { describe, expect, test } from "vitest";
import { createChampionship } from "../src/championships/model";
import { emptyChampionshipUniverse } from "../src/championships/storage";
import { createCompetition, createCompetitionParticipant, generateCompetitionSchedule } from "../src/competitions/model";
import { emptyCompetitionUniverse } from "../src/competitions/model";
import {
  applyCoreResultConsequences,
  confirmChampionshipConsequence,
  confirmCompetitionConsequence,
  emptyResultConsequenceUniverse,
  resolveFutureConflict,
  rollbackCoreResultConsequences,
} from "../src/consequences/model";
import { parseResultConsequenceUniverse } from "../src/consequences/storage";
import { createMatchEngineProfile } from "../src/matchEngine/model";
import type { MatchResolutionRecord } from "../src/matchResolution/types";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";

function resolution(showId: string, segmentId: string, winnerName = "PAC", accepted = true): MatchResolutionRecord {
  const winnerKey = winnerName === "PAC" ? "tew:pac" : "tew:white";
  const loserName = winnerName === "PAC" ? "Jay White" : "PAC";
  const loserKey = winnerName === "PAC" ? "tew:white" : "tew:pac";
  return {
    id: `resolution-${segmentId}`,
    showId,
    showName: "PWL Power Hour",
    segmentId,
    segmentTitle: "Jay White vs PAC",
    setup: {
      showId,
      showName: "PWL Power Hour",
      showDate: "2019-01-08",
      segmentId,
      segmentTitle: "Jay White vs PAC",
      matchType: "1 vs. 1",
      durationMinutes: 18,
      aimId: "competitive-tv-match",
      importance: "Feature",
      championship: "",
      competitionRound: "",
      chemistry: 0,
      volatility: 8,
      workers: [],
    },
    attempts: [{
      id: `attempt-${segmentId}`,
      number: 1,
      seed: "consequence-test",
      setupFingerprint: "fingerprint",
      setupChangeReason: "",
      calculationVersion: "test",
      generatedAt: "2019-01-08T20:00:00.000Z",
      status: accepted ? "Accepted" : "Overridden",
      workerResults: [
        {
          workerKey: "tew:pac",
          workerId: "pac",
          workerName: "PAC",
          selectedApproachIds: ["counter-specialist"],
          selectedApproachNames: ["Counter Specialist"],
          approachScores: [],
          averageApproachRating: 92,
          approachExecution: 91,
          presentationScore: 82,
          performanceScore: 90,
          competitiveScore: 88,
          winProbability: winnerName === "PAC" ? 0.58 : 0.42,
          mentalStateId: "focused",
          mentalStateName: "FOCUSED",
          mentalStateScore: 75,
          mentalModifier: 2.5,
          luck: 1,
          swing: 0,
          consistencyVariance: 0,
          actualPace: 3,
          paceStatus: "IDEAL PACE",
          paceModifier: 10,
          staminaUsed: 5,
          staminaAvailable: 9,
          staminaStatus: "PASS",
          staminaModifier: 2,
          interactionModifier: 4,
          storyNeedModifier: 0,
          momentumModifier: 0,
          bookingModifier: 0,
          volatilityNoise: 0,
          botchRisk: 4,
          incident: "",
          decisiveComponents: [],
        },
        {
          workerKey: "tew:white",
          workerId: "white",
          workerName: "Jay White",
          selectedApproachIds: ["dirty-rulebreaker"],
          selectedApproachNames: ["Dirty Rulebreaker"],
          approachScores: [],
          averageApproachRating: 88,
          approachExecution: 87,
          presentationScore: 88,
          performanceScore: 89,
          competitiveScore: 86,
          winProbability: winnerName === "Jay White" ? 0.58 : 0.42,
          mentalStateId: "normal",
          mentalStateName: "NORMAL",
          mentalStateScore: 60,
          mentalModifier: 0,
          luck: 0,
          swing: 0,
          consistencyVariance: 0,
          actualPace: 2,
          paceStatus: "ACCEPTABLE PACE",
          paceModifier: 5,
          staminaUsed: 4,
          staminaAvailable: 8,
          staminaStatus: "PASS",
          staminaModifier: 2,
          interactionModifier: 1,
          storyNeedModifier: 0,
          momentumModifier: 0,
          bookingModifier: 0,
          volatilityNoise: 0,
          botchRisk: 7,
          incident: "",
          decisiveComponents: [],
        },
      ],
      engineResult: {
        winnerKey: accepted ? winnerKey : loserKey,
        winnerName: accepted ? winnerName : loserName,
        loserKey: accepted ? loserKey : winnerKey,
        loserName: accepted ? loserName : winnerName,
        finishType: "Submission",
        finishDescription: `${accepted ? winnerName : loserName} won the engine calculation.`,
        actualDurationMinutes: 18.7,
        matchScore: 86,
        starRating: 4.25,
        performanceLeaderKey: "tew:pac",
        performanceLeaderName: "PAC",
        winnerProbability: 0.58,
        resultRoll: 0.4,
        confidenceLabel: "Moderate",
        upset: false,
        decisiveFactors: [],
        matchFacts: [],
      },
      finalResult: {
        winnerKey,
        winnerName,
        loserKey,
        loserName,
        finishType: "Submission",
        finishDescription: `${winnerName} forced ${loserName} to submit.`,
        actualDurationMinutes: 18.7,
        matchScore: 86,
        starRating: 4.25,
        acceptedEngineResult: accepted,
        overrideReason: accepted ? "" : "Protect the planned program.",
        finalizedAt: "2019-01-08T20:20:00.000Z",
      },
    }],
    activeAttemptId: `attempt-${segmentId}`,
    status: accepted ? "Accepted" : "Overridden",
    createdAt: "2019-01-08T20:00:00.000Z",
    updatedAt: "2019-01-08T20:20:00.000Z",
  };
}

function showWithMatch() {
  const show = createPlannedShow(1);
  show.id = "show-1";
  show.name = "PWL Power Hour";
  show.date = "2019-01-08";
  const segment = createPlannedSegment("match");
  segment.id = "match-1";
  segment.title = "Jay White vs PAC";
  segment.workers = [
    { id: "white", name: "Jay White", role: "Competitor", side: "Side 1", source: "tew" },
    { id: "pac", name: "PAC", role: "Competitor", side: "Side 2", source: "tew" },
  ];
  show.segments = [segment];
  return { show, segment };
}

function profiles() {
  const pac = createMatchEngineProfile({ id: "pac", name: "PAC", source: "tew" });
  pac.health = 95;
  const white = createMatchEngineProfile({ id: "white", name: "Jay White", source: "tew" });
  white.health = 94;
  return [pac, white];
}

describe("Phase 6B3 standalone result consequences", () => {
  test("applies an official result exactly once to records rankings condition and show history", () => {
    const { show, segment } = showWithMatch();
    const result = applyCoreResultConsequences({
      universe: emptyResultConsequenceUniverse(),
      resolution: resolution(show.id, segment.id),
      shows: [show],
      profiles: profiles(),
      championships: emptyChampionshipUniverse(),
      competitions: emptyCompetitionUniverse(),
    });
    expect(result.universe.applications).toHaveLength(1);
    expect(result.universe.workerRecords).toHaveLength(2);
    const pac = result.universe.workerRecords.find((record) => record.workerName === "PAC")!;
    const white = result.universe.workerRecords.find((record) => record.workerName === "Jay White")!;
    expect(pac).toMatchObject({ wins: 1, losses: 0, rankingPosition: 1, currentStreakType: "W", currentStreakCount: 1 });
    expect(white).toMatchObject({ wins: 0, losses: 1, currentStreakType: "L", currentStreakCount: 1 });
    expect(pac.fatigue).toBeGreaterThan(0);
    expect(pac.health).toBeLessThan(95);
    expect(pac.matchHistory[0].result).toBe("W");
    expect(result.shows[0].segments[0]).toMatchObject({ workflowStatus: "Reconciled", reconciliation: { actualMatch: { winner: "PAC", rating: 86 }, finalNarrative: "PAC forced Jay White to submit." } });
    expect(() => applyCoreResultConsequences({
      universe: result.universe,
      resolution: resolution(show.id, segment.id),
      shows: result.shows,
      profiles: profiles(),
      championships: emptyChampionshipUniverse(),
      competitions: emptyCompetitionUniverse(),
    })).toThrow("already been applied");
  });

  test("keeps a losing performance leader from being treated as a failed performance", () => {
    const { show, segment } = showWithMatch();
    const result = applyCoreResultConsequences({
      universe: emptyResultConsequenceUniverse(),
      resolution: resolution(show.id, segment.id, "Jay White", false),
      shows: [show],
      profiles: profiles(),
      championships: emptyChampionshipUniverse(),
      competitions: emptyCompetitionUniverse(),
    });
    const pac = result.universe.workerRecords.find((record) => record.workerName === "PAC")!;
    expect(pac.losses).toBe(1);
    expect(pac.matchHistory[0].performanceLeader).toBe(true);
    expect(pac.rankingPoints).toBeGreaterThan(-1);
    expect(result.universe.prompts.some((prompt) => prompt.kind === "Disputed Finish")).toBe(true);
  });

  test("creates and explicitly confirms a championship change", () => {
    const { show, segment } = showWithMatch();
    const championship = createChampionship(1);
    championship.id = "title-1";
    championship.name = "PWL World Championship";
    championship.status = "Active";
    championship.currentChampions = [{ id: "white", name: "Jay White", source: "manual" }];
    championship.defenses = 2;
    segment.championshipId = championship.id;
    segment.championship = championship.name;
    segment.championEntering = "Jay White";
    segment.challenger = "PAC";
    segment.championshipMatchPurpose = "Defense";
    const applied = applyCoreResultConsequences({
      universe: emptyResultConsequenceUniverse(),
      resolution: resolution(show.id, segment.id),
      shows: [show],
      profiles: profiles(),
      championships: { championships: [championship] },
      competitions: emptyCompetitionUniverse(),
    });
    const proposal = applied.universe.championshipProposals[0];
    expect(proposal).toMatchObject({ suggestedDecision: "Changed Hands", selectedDecision: "Changed Hands", status: "Pending", finalWinner: "PAC" });
    expect(championship.currentChampions[0].name).toBe("Jay White");
    const confirmed = confirmChampionshipConsequence({ universe: applied.universe, proposalId: proposal.id, shows: applied.shows, championships: { championships: [championship] }, knownWorkers: [{ id: "pac", name: "PAC" }, { id: "white", name: "Jay White" }] });
    expect(confirmed.championships.championships[0].currentChampions[0].name).toBe("PAC");
    expect(confirmed.championships.championships[0].defenses).toBe(0);
    expect(confirmed.universe.championshipProposals[0].status).toBe("Confirmed");
  });

  test("creates and explicitly confirms competition advancement", () => {
    const { show, segment } = showWithMatch();
    let competition = createCompetition("PWL Cup", "Single Elimination");
    competition.id = "cup-1";
    const white = createCompetitionParticipant("Jay White", "manual");
    white.id = "participant-white";
    const pac = createCompetitionParticipant("PAC", "manual");
    pac.id = "participant-pac";
    competition = generateCompetitionSchedule({ ...competition, participants: [white, pac] });
    const fixture = competition.fixtures[0];
    segment.competitionId = competition.id;
    segment.competitionFixtureId = fixture.id;
    segment.competitionRoundLabel = fixture.roundLabel;
    const applied = applyCoreResultConsequences({
      universe: emptyResultConsequenceUniverse(),
      resolution: resolution(show.id, segment.id),
      shows: [show],
      profiles: profiles(),
      championships: emptyChampionshipUniverse(),
      competitions: { competitions: [competition] },
    });
    const proposal = applied.universe.competitionProposals[0];
    expect(proposal).toMatchObject({ proposedWinnerParticipantId: pac.id, status: "Pending", resultType: "Decision" });
    const confirmed = confirmCompetitionConsequence({ universe: applied.universe, proposalId: proposal.id, competitions: { competitions: [competition] } });
    const updatedFixture = confirmed.competitions.competitions[0].fixtures.find((item) => item.id === fixture.id)!;
    expect(updatedFixture).toMatchObject({ winnerId: pac.id, status: "Completed" });
    expect(confirmed.universe.competitionProposals[0].status).toBe("Confirmed");
  });

  test("flags future booking that conflicts with the actual result and requires a manual resolution note", () => {
    const { show, segment } = showWithMatch();
    const future = createPlannedShow(2);
    future.id = "future-show";
    future.name = "PWL Power Hour #2";
    future.date = "2019-01-15";
    const futureMatch = createPlannedSegment("match");
    futureMatch.id = "future-match";
    futureMatch.title = "Jay White vs PAC II";
    futureMatch.plannedWinner = "Jay White";
    futureMatch.workers = segment.workers.map((worker) => ({ ...worker }));
    future.segments = [futureMatch];
    const applied = applyCoreResultConsequences({
      universe: emptyResultConsequenceUniverse(),
      resolution: resolution(show.id, segment.id),
      shows: [show, future],
      profiles: profiles(),
      championships: emptyChampionshipUniverse(),
      competitions: emptyCompetitionUniverse(),
    });
    expect(applied.universe.futureConflicts).toHaveLength(1);
    expect(applied.universe.futureConflicts[0].reason).toContain("Jay White is already planned to win");
    expect(() => resolveFutureConflict(applied.universe, applied.universe.futureConflicts[0].id, "")).toThrow("Record how");
    const resolved = resolveFutureConflict(applied.universe, applied.universe.futureConflicts[0].id, "Keep the rematch tentative and review rankings after another week.");
    expect(resolved.futureConflicts[0]).toMatchObject({ resolved: true, resolutionNote: "Keep the rematch tentative and review rankings after another week." });
    expect(futureMatch.plannedWinner).toBe("Jay White");
  });

  test("rolls back core consequences from the stored pre-application snapshot", () => {
    const { show, segment } = showWithMatch();
    const applied = applyCoreResultConsequences({
      universe: emptyResultConsequenceUniverse(),
      resolution: resolution(show.id, segment.id),
      shows: [show],
      profiles: profiles(),
      championships: emptyChampionshipUniverse(),
      competitions: emptyCompetitionUniverse(),
    });
    const rolled = rollbackCoreResultConsequences(applied.universe, applied.universe.applications[0].id, "The wrong match record was linked.");
    expect(rolled.universe.workerRecords).toEqual([]);
    expect(rolled.shows[0].segments[0].reconciliation.actualMatch).toBeNull();
    expect(rolled.universe.applications[0]).toMatchObject({ status: "Rolled Back", rollbackReason: "The wrong match record was linked." });
  });

  test("round-trips consequence history", () => {
    const { show, segment } = showWithMatch();
    const applied = applyCoreResultConsequences({
      universe: emptyResultConsequenceUniverse(),
      resolution: resolution(show.id, segment.id),
      shows: [show],
      profiles: profiles(),
      championships: emptyChampionshipUniverse(),
      competitions: emptyCompetitionUniverse(),
    });
    const parsed = parseResultConsequenceUniverse(JSON.parse(JSON.stringify(applied.universe)) as unknown);
    expect(parsed.workerRecords[0].matchHistory[0].resolutionAttemptId).toBe(`attempt-${segment.id}`);
    expect(parsed.applications[0].conditionChanges).toHaveLength(2);
    expect(parsed.prompts.length).toBeGreaterThanOrEqual(3);
  });
});