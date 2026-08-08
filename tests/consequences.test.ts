import { describe, expect, test } from "vitest";
import { createChampionship } from "../src/championships/model";
import { emptyChampionshipUniverse } from "../src/championships/storage";
import { createCompetition, createCompetitionParticipant, generateCompetitionStructure } from "../src/competitions/model";
import { emptyCompetitionUniverse } from "../src/competitions/model";
import {
  applyCoreResultConsequences,
  confirmChampionshipConsequence,
  confirmCompetitionConsequence,
  emptyResultConsequenceUniverse,
  resolveFutureConflict,
  rollbackCoreResultConsequences,
  synchronizeWorkerRecordsFromProfiles,
} from "../src/consequences/model";
import { parseResultConsequenceUniverse } from "../src/consequences/storage";
import { createMatchEngineProfile } from "../src/matchEngine/model";
import { acceptEngineResult, createMatchResolutionRecord, overrideEngineResult, resolveMatch } from "../src/matchResolution/engine";
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
          mentalBase: 61,
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
          mentalStateId: "neutral",
          mentalStateName: "NEUTRAL",
          mentalBase: 60,
          mentalStateScore: 60,
          mentalModifier: 0,
          luck: 0,
          swing: 0,
          consistencyVariance: 0,
          actualPace: 2,
          paceStatus: "OPEN PACE",
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
    expect(pac).toMatchObject({ wins: 1, losses: 0, rankingPosition: 1, currentStreakType: "W", currentStreakCount: 1, momentum: 56, momentumScale: "0-100-v1" });
    expect(white).toMatchObject({ wins: 0, losses: 1, currentStreakType: "L", currentStreakCount: 1, momentum: 49, momentumScale: "0-100-v1" });
    expect(pac).toMatchObject({ fatigue: 7.68, health: 93.75, popularity: 51.9, rankingPoints: 4.8 });
    expect(white).toMatchObject({ fatigue: 7.07, health: 92.87, popularity: 51.46, rankingPoints: -0.48 });
    expect(result.profiles.find((profile) => profile.workerName === "PAC")?.momentum).toBe(pac.momentum);
    expect(result.profiles.find((profile) => profile.workerName === "PAC")?.popularity).toBe(pac.popularity);
    expect(result.universe.applications[0]).toMatchObject({ calculationVersion: "wrestling-sim-consequences-6b20d-v1", idempotencyKey: expect.stringContaining("match-consequences") });
    const pacChange = result.universe.applications[0].conditionChanges.find((change) => change.workerName === "PAC")!;
    expect(pacChange).toMatchObject({ healthRecovery: 0, ordinaryWear: 1.25, incidentDamage: 0, fatigueRecovery: 0, fatigueGain: 7.68, fullRestDays: 0, rankingPositionBefore: 0, rankingPositionAfter: 1 });
    expect(pacChange.calculationLedger?.ordinaryWear.terms.map((term) => term.contribution)).toEqual([0.6545, 0.6, 0, 0]);
    expect(pacChange.calculationLedger?.fatigueGain.terms.map((term) => term.contribution)).toEqual([4.675, 3, 0, 0]);
    expect(pacChange.calculationLedger?.ranking.terms.map((term) => term.contribution)).toEqual([3, 1.3, 0, 0.5]);
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

  test("keeps physical wear, fatigue, and rankings identical when only the live crowd changes", () => {
    const { show, segment } = showWithMatch();
    const lowCrowd = resolution(show.id, segment.id);
    const highCrowd = structuredClone(lowCrowd);
    lowCrowd.attempts[0].finalResult!.matchScore = 50;
    lowCrowd.attempts[0].finalResult!.starRating = 2;
    highCrowd.attempts[0].finalResult!.matchScore = 90;
    highCrowd.attempts[0].finalResult!.starRating = 5;
    const low = applyCoreResultConsequences({ universe: emptyResultConsequenceUniverse(), resolution: lowCrowd, shows: [structuredClone(show)], profiles: profiles(), championships: emptyChampionshipUniverse(), competitions: emptyCompetitionUniverse() });
    const high = applyCoreResultConsequences({ universe: emptyResultConsequenceUniverse(), resolution: highCrowd, shows: [structuredClone(show)], profiles: profiles(), championships: emptyChampionshipUniverse(), competitions: emptyCompetitionUniverse() });
    const relevant = (value: typeof low) => value.universe.applications[0].conditionChanges.map((change) => ({
      worker: change.workerName,
      healthAfter: change.healthAfter,
      fatigueAfter: change.fatigueAfter,
      rankingPointsAfter: change.rankingPointsAfter,
      wear: change.ordinaryWear,
      fatigueGain: change.fatigueGain,
      rankingDelta: change.calculationLedger?.ranking.result,
    }));
    expect(relevant(low)).toEqual(relevant(high));
    expect(low.universe.workerRecords[0].matchHistory[0].matchScore).toBe(50);
    expect(high.universe.workerRecords[0].matchHistory[0].matchScore).toBe(90);
    expect(low.universe.workerRecords[0].matchHistory[0].rawMatchScore).toBe(86);
    expect(high.universe.workerRecords[0].matchHistory[0].rawMatchScore).toBe(86);
  });

  test("caps long exhausting matches and applies botch or major-incident damage afterward", () => {
    const { show, segment } = showWithMatch();
    const exhausting = resolution(show.id, segment.id);
    exhausting.attempts[0].finalResult!.actualDurationMinutes = 60;
    const [pacResult, whiteResult] = exhausting.attempts[0].workerResults;
    Object.assign(pacResult, { staminaStatus: "DEAD", staminaUsed: 10, actualPace: 5, incident: "Visible botch on the landing." });
    Object.assign(whiteResult, { staminaStatus: "DEAD", staminaUsed: 10, actualPace: 5, incident: "Major execution mistake caused a hard landing." });
    const applied = applyCoreResultConsequences({ universe: emptyResultConsequenceUniverse(), resolution: exhausting, shows: [show], profiles: profiles(), championships: emptyChampionshipUniverse(), competitions: emptyCompetitionUniverse() });
    const pac = applied.universe.applications[0].conditionChanges.find((change) => change.workerName === "PAC")!;
    const white = applied.universe.applications[0].conditionChanges.find((change) => change.workerName === "Jay White")!;
    expect(pac).toMatchObject({ ordinaryWear: 5.5, incidentDamage: 3, fatigueGain: 25, healthAfter: 86.5, fatigueAfter: 25, injuryStatus: "Minor Concern" });
    expect(white).toMatchObject({ ordinaryWear: 5.5, incidentDamage: 8, fatigueGain: 25, healthAfter: 80.5, fatigueAfter: 25, injuryStatus: "Injured" });
    expect(pac.calculationLedger?.ordinaryWear.capApplied).toBe(true);
    expect(pac.calculationLedger?.fatigueGain.capApplied).toBe(true);
  });

  test("recovers two fatigue points per full rest day and none between same-night matches", () => {
    const firstShow = showWithMatch();
    const first = applyCoreResultConsequences({ universe: emptyResultConsequenceUniverse(), resolution: resolution(firstShow.show.id, firstShow.segment.id), shows: [firstShow.show], profiles: profiles(), championships: emptyChampionshipUniverse(), competitions: emptyCompetitionUniverse() });

    const sameNight = showWithMatch();
    sameNight.show.id = "show-same-night";
    sameNight.segment.id = "match-same-night";
    sameNight.show.segments = [sameNight.segment];
    const sameNightApplied = applyCoreResultConsequences({ universe: first.universe, resolution: resolution(sameNight.show.id, sameNight.segment.id), shows: [...first.shows, sameNight.show], profiles: first.profiles, championships: emptyChampionshipUniverse(), competitions: emptyCompetitionUniverse() });
    const sameNightPac = sameNightApplied.universe.applications[0].conditionChanges.find((change) => change.workerName === "PAC")!;
    expect(sameNightPac).toMatchObject({ fullRestDays: 0, fatigueStoredBefore: 7.68, fatigueRecovery: 0, fatigueBefore: 7.68, fatigueAfter: 15.36 });

    const weekly = showWithMatch();
    weekly.show.id = "show-weekly";
    weekly.show.date = "2019-01-15";
    weekly.segment.id = "match-weekly";
    weekly.show.segments = [weekly.segment];
    const recoveredProfiles = first.profiles.map((profile) => profile.workerName === "PAC" ? { ...profile, health: 95 } : profile);
    const synchronizedUniverse = synchronizeWorkerRecordsFromProfiles(first.universe, recoveredProfiles);
    expect(synchronizedUniverse.workerRecords.find((record) => record.workerName === "PAC")).toMatchObject({ health: 95, lastMatchHealth: 93.75 });
    const weeklyApplied = applyCoreResultConsequences({ universe: synchronizedUniverse, resolution: resolution(weekly.show.id, weekly.segment.id), shows: [...first.shows, weekly.show], profiles: recoveredProfiles, championships: emptyChampionshipUniverse(), competitions: emptyCompetitionUniverse() });
    const weeklyPac = weeklyApplied.universe.applications[0].conditionChanges.find((change) => change.workerName === "PAC")!;
    expect(weeklyPac).toMatchObject({ fullRestDays: 6, fatigueStoredBefore: 7.68, fatigueRecovery: 7.68, fatigueBefore: 0, fatigueAfter: 7.68, healthStoredBefore: 93.75, healthRecovery: 1.25, healthBefore: 95, healthAfter: 93.75 });
    expect(weeklyPac.calculationLedger?.fatigueRecovery.capApplied).toBe(true);

    const longRest = showWithMatch();
    longRest.show.id = "show-long-rest";
    longRest.show.date = "2019-01-30";
    longRest.segment.id = "match-long-rest";
    longRest.show.segments = [longRest.segment];
    const longRestApplied = applyCoreResultConsequences({ universe: first.universe, resolution: resolution(longRest.show.id, longRest.segment.id), shows: [...first.shows, longRest.show], profiles: first.profiles, championships: emptyChampionshipUniverse(), competitions: emptyCompetitionUniverse() });
    const longRestPac = longRestApplied.universe.applications[0].conditionChanges.find((change) => change.workerName === "PAC")!;
    expect(longRestPac).toMatchObject({ fullRestDays: 21, fatigueRecovery: 7.68, fatigueBefore: 0, fatigueAfter: 7.68 });
  });

  test("uses the official multi-person upset flag instead of treating every sub-50% winner as an upset", () => {
    const { show, segment } = showWithMatch();
    const expectedWinner = resolution(show.id, segment.id);
    const thirdResult = { ...expectedWinner.attempts[0].workerResults[1], workerKey: "tew:third", workerId: "third", workerName: "Third Wrestler", winProbability: 0.3 };
    expectedWinner.attempts[0].workerResults[0].winProbability = 0.4;
    expectedWinner.attempts[0].workerResults.push(thirdResult);
    expectedWinner.attempts[0].finalResult!.upset = false;
    segment.workers.push({ id: "third", name: "Third Wrestler", role: "Competitor", side: "Side 3", source: "tew" });
    const thirdProfile = createMatchEngineProfile({ id: "third", name: "Third Wrestler", source: "tew" });
    const expected = applyCoreResultConsequences({ universe: emptyResultConsequenceUniverse(), resolution: expectedWinner, shows: [show], profiles: [...profiles(), thirdProfile], championships: emptyChampionshipUniverse(), competitions: emptyCompetitionUniverse() });
    const expectedPac = expected.universe.applications[0].conditionChanges.find((change) => change.workerName === "PAC")!;
    expect(expectedPac.calculationLedger?.ranking.terms.find((term) => term.id === "upset")?.contribution).toBe(0);
    expect(expectedPac.rankingPointsAfter).toBe(4.8);

    const officialUpset = structuredClone(expectedWinner);
    officialUpset.id = "resolution-official-upset";
    officialUpset.attempts[0].id = "attempt-official-upset";
    officialUpset.activeAttemptId = "attempt-official-upset";
    officialUpset.status = "Overridden";
    officialUpset.attempts[0].status = "Overridden";
    officialUpset.attempts[0].finalResult!.upset = true;
    officialUpset.attempts[0].finalResult!.acceptedEngineResult = false;
    officialUpset.attempts[0].finalResult!.overrideReason = "The final overridden winner is an official upset.";
    const upset = applyCoreResultConsequences({ universe: emptyResultConsequenceUniverse(), resolution: officialUpset, shows: [structuredClone(show)], profiles: [...profiles(), thirdProfile], championships: emptyChampionshipUniverse(), competitions: emptyCompetitionUniverse() });
    const upsetPac = upset.universe.applications[0].conditionChanges.find((change) => change.workerName === "PAC")!;
    expect(upsetPac.calculationLedger?.ranking.terms.find((term) => term.id === "upset")?.contribution).toBe(2);
    expect(upsetPac.rankingPointsAfter).toBe(6.8);
  });

  test("applies the real stamina statuses and individual popularity performance", () => {
    const { show, segment } = showWithMatch();
    const exhausted = resolution(show.id, segment.id);
    exhausted.attempts[0].workerResults[0].staminaStatus = "DEAD";
    exhausted.attempts[0].workerResults[1].staminaStatus = "WINDED";
    const sourceProfiles = profiles();
    sourceProfiles[0].popularity = 40;
    sourceProfiles[1].popularity = 90;
    const result = applyCoreResultConsequences({ universe: emptyResultConsequenceUniverse(), resolution: exhausted, shows: [show], profiles: sourceProfiles, championships: emptyChampionshipUniverse(), competitions: emptyCompetitionUniverse() });
    const pac = result.universe.workerRecords.find((record) => record.workerName === "PAC")!;
    const white = result.universe.workerRecords.find((record) => record.workerName === "Jay White")!;
    expect(95 - pac.health).toBeGreaterThan(94 - white.health);
    expect(pac.popularity).toBeGreaterThan(40);
    expect(white.popularity).toBeLessThan(90);
    expect(result.universe.applications[0].conditionChanges.find((change) => change.workerName === "PAC")?.explanation.join(" ")).toContain("popularity");
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
    championship.currentChampions = [{ id: "white", name: "Jay White" }];
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
    let competition = createCompetition(1);
    competition.id = "cup-1";
    competition.name = "PWL Cup";
    competition.format = "Single Elimination";
    const white = createCompetitionParticipant("Jay White", "Singles", { source: "manual" });
    white.id = "participant-white";
    const pac = createCompetitionParticipant("PAC", "Singles", { source: "manual" });
    pac.id = "participant-pac";
    competition = generateCompetitionStructure({ ...competition, participants: [white, pac] });
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

  test("applies a No Contest as neutral records while preserving wear and blocking title or tournament advancement", () => {
    const { show, segment } = showWithMatch();
    const championship = createChampionship(1);
    championship.id = "title-nc";
    championship.name = "PWL World Championship";
    championship.status = "Active";
    championship.currentChampions = [{ id: "white", name: "Jay White" }];
    championship.defenses = 2;
    segment.championshipId = championship.id;
    segment.championship = championship.name;
    segment.championEntering = "Jay White";
    segment.challenger = "PAC";

    let competition = createCompetition(1);
    competition.id = "cup-nc";
    competition.name = "PWL Cup";
    competition.format = "Single Elimination";
    const white = createCompetitionParticipant("Jay White", "Singles", { source: "manual" });
    const pac = createCompetitionParticipant("PAC", "Singles", { source: "manual" });
    competition = generateCompetitionStructure({ ...competition, participants: [white, pac] });
    segment.competitionId = competition.id;
    segment.competitionFixtureId = competition.fixtures[0].id;
    segment.competitionRoundLabel = competition.fixtures[0].roundLabel;

    const noContest = resolution(show.id, segment.id, "PAC", false);
    const final = noContest.attempts[0].finalResult!;
    Object.assign(final, {
      winnerKey: "", winnerName: "", loserKey: "", loserName: "", winnerMemberKeys: [], winnerMemberNames: [], loserKeys: [], loserNames: [],
      finishType: "No Contest", finishDescription: "The referee threw the match out.", upset: false,
    });
    const sourceProfiles = profiles();
    const applied = applyCoreResultConsequences({
      universe: emptyResultConsequenceUniverse(), resolution: noContest, shows: [show], profiles: sourceProfiles,
      championships: { championships: [championship] }, competitions: { competitions: [competition] },
    });
    expect(applied.universe.workerRecords.every((record) => record.noContests === 1 && record.wins === 0 && record.losses === 0 && record.rankingPoints === 0)).toBe(true);
    expect(applied.universe.workerRecords.every((record) => record.fatigue > 0 && record.health < sourceProfiles.find((profile) => profile.workerKey === record.workerKey)!.health)).toBe(true);
    const noContestPac = applied.universe.applications[0].conditionChanges.find((change) => change.workerName === "PAC")!;
    expect(noContestPac.calculationLedger?.ranking.result).toBe(0);
    expect(noContestPac.calculationLedger?.momentum.terms.filter((term) => term.id === "result" || term.id === "upset").every((term) => term.contribution === 0)).toBe(true);
    expect(noContestPac.calculationLedger?.popularity.terms.find((term) => term.id === "result")?.contribution).toBe(0);
    expect(applied.universe.teamRecords).toEqual([]);
    expect(applied.universe.championshipProposals).toEqual([]);
    expect(applied.universe.competitionProposals[0]).toMatchObject({ resultType: "No Contest", status: "Pending", proposedWinnerParticipantId: "" });
    expect(applied.shows[0].segments[0].reconciliation).toMatchObject({ happenedAsPlannedDetail: "No Contest", actualMatch: { winner: "No Contest" } });
    expect(applied.universe.prompts.some((prompt) => prompt.kind === "Winner Celebration" || prompt.kind === "Loser Reaction")).toBe(false);
    const confirmed = confirmCompetitionConsequence({ universe: applied.universe, proposalId: applied.universe.competitionProposals[0].id, competitions: { competitions: [competition] } });
    expect(confirmed.competitions.competitions[0].fixtures[0]).toMatchObject({ resultType: "No Contest", winnerId: "", loserId: "", status: "Completed" });
    expect(confirmed.competitions.competitions[0].fixtures.some((fixture) => Boolean(fixture.winnerId))).toBe(false);
    expect(championship.currentChampions[0].name).toBe("Jay White");
    expect(championship.defenses).toBe(2);
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
    const sourceProfiles = profiles();
    const applied = applyCoreResultConsequences({
      universe: emptyResultConsequenceUniverse(),
      resolution: resolution(show.id, segment.id),
      shows: [show],
      profiles: sourceProfiles,
      championships: emptyChampionshipUniverse(),
      competitions: emptyCompetitionUniverse(),
    });
    const rolled = rollbackCoreResultConsequences(applied.universe, applied.universe.applications[0].id, "The wrong match record was linked.", applied.profiles);
    expect(rolled.universe.workerRecords).toEqual([]);
    expect(rolled.shows[0].segments[0].reconciliation.actualMatch).toBeNull();
    expect(rolled.universe.applications[0]).toMatchObject({ status: "Rolled Back", rollbackReason: "The wrong match record was linked." });
    expect(rolled.profiles).toEqual(sourceProfiles);
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
    expect(parsed.applications[0].conditionChanges[0].calculationLedger?.version).toBe("wrestling-sim-consequences-6b20d-v1");
    expect(parsed.prompts.length).toBeGreaterThanOrEqual(3);

    const legacy = JSON.parse(JSON.stringify(applied.universe)) as any;
    legacy.applications[0].calculationVersion = "legacy-consequences-v0";
    delete legacy.applications[0].conditionChanges[0].calculationLedger;
    const migratedLegacy = parseResultConsequenceUniverse(legacy);
    expect(migratedLegacy.applications[0].calculationVersion).toBe("legacy-consequences-v0");
    expect(migratedLegacy.applications[0].conditionChanges[0].calculationLedger).toBeUndefined();
    expect(migratedLegacy.applications[0].conditionChanges[0].healthAfter).toBe(applied.universe.applications[0].conditionChanges[0].healthAfter);
  });

  test("applies team wins to every teammate and maintains separate team records", () => {
    const show = createPlannedShow(1);
    show.id = "show-team";
    show.name = "PWL Power Hour";
    show.date = "2019-02-05";
    const segment = createPlannedSegment("match");
    segment.id = "tag-match";
    segment.title = "MCMG vs Aussie Open";
    segment.matchType = "Tag Team";
    const names = ["Alex Shelley", "Chris Sabin", "Mark Davis", "Kyle Fletcher"];
    const ids = ["shelley", "sabin", "davis", "fletcher"];
    segment.workers = names.map((name, index) => ({ id: ids[index], name, role: "Competitor", side: index < 2 ? "Side 1" : "Side 2", source: "tew" as const }));
    show.segments = [segment];
    const workerProfiles = names.map((name, index) => {
      const value = createMatchEngineProfile({ id: ids[index], name, source: "tew" });
      value.overall = 80 + index;
      value.health = 95;
      return value;
    });
    const setup = {
      showId: show.id, showName: show.name, showDate: show.date, segmentId: segment.id, segmentTitle: segment.title,
      matchType: segment.matchType, durationMinutes: 18, aimId: "competitive-tv-match" as const, importance: "Feature" as const,
      championship: "", competitionRound: "", chemistry: 0, volatility: 8, format: "Team" as const,
      workers: workerProfiles.map((profile, index) => ({
        workerKey: profile.workerKey, workerId: profile.workerId, workerName: profile.workerName,
        approachMode: "AI" as const, lockedApproachIds: [], manualApproachIds: [], storyNeed: 0, momentum: 0, bookingBias: 0,
        teamId: index < 2 ? "mcmg" : "aussie-open", teamName: index < 2 ? "Motor City Machine Guns" : "Aussie Open",
      })),
    };
    const attempt = resolveMatch({ setup, workers: workerProfiles.map((profile) => ({ profile, workbookMetrics: null })), seed: "team-consequences" });
    const winningTeam = attempt.engineResult.teamResults!.find((team) => team.id === attempt.engineResult.winnerTeamId)!;
    const losingTeam = attempt.engineResult.teamResults!.find((team) => team.id !== attempt.engineResult.winnerTeamId)!;
    const championship = createChampionship(1);
    championship.id = "tag-title";
    championship.name = "PWL Tag Team Championship";
    championship.status = "Active";
    championship.currentChampions = losingTeam.memberNames.map((name) => ({ id: ids[names.indexOf(name)], name }));
    segment.championshipId = championship.id;
    segment.championship = championship.name;
    segment.championEntering = losingTeam.memberNames.join(" & ");
    segment.challenger = winningTeam.memberNames.join(" & ");
    segment.championshipMatchPurpose = "Defense";
    let competition = createCompetition(1);
    competition.id = "tag-cup";
    competition.name = "PWL Tag Cup";
    competition.participantType = "Tag Team";
    const firstTeam = createCompetitionParticipant(winningTeam.name, "Tag Team", { memberNames: winningTeam.memberNames });
    const secondTeam = createCompetitionParticipant(losingTeam.name, "Tag Team", { memberNames: losingTeam.memberNames });
    competition = generateCompetitionStructure({ ...competition, participants: [firstTeam, secondTeam] });
    segment.competitionId = competition.id;
    segment.competitionFixtureId = competition.fixtures[0].id;
    segment.competitionRoundLabel = competition.fixtures[0].roundLabel;
    const accepted = acceptEngineResult(createMatchResolutionRecord(setup, attempt));
    accepted.attempts[0].finalResult!.upset = false;
    accepted.attempts[0].engineResult.teamResults!.find((team) => team.id === attempt.engineResult.winnerTeamId)!.winProbability = 0.2;
    const applied = applyCoreResultConsequences({
      universe: emptyResultConsequenceUniverse(), resolution: accepted, shows: [show], profiles: workerProfiles,
      championships: { championships: [championship] }, competitions: { competitions: [competition] },
    });
    const winningKeys = attempt.engineResult.winnerMemberKeys!;
    expect(applied.universe.workerRecords.filter((record) => winningKeys.includes(record.workerKey)).every((record) => record.wins === 1)).toBe(true);
    expect(applied.universe.workerRecords.filter((record) => !winningKeys.includes(record.workerKey)).every((record) => record.losses === 1)).toBe(true);
    expect(applied.universe.teamRecords).toHaveLength(2);
    const winningRecord = applied.universe.teamRecords.find((record) => record.teamKey === attempt.engineResult.winnerTeamId)!;
    expect(winningRecord).toMatchObject({ wins: 1, losses: 0, rankingPosition: 1 });
    expect(winningRecord.matchHistory[0].rankingCalculation?.terms.find((term) => term.id === "upset")?.contribution).toBe(0);
    expect(winningRecord.matchHistory[0].rawMatchScore).toBe(attempt.engineResult.matchScore);
    expect(applied.universe.applications[0].conditionChanges).toHaveLength(4);
    expect(applied.universe.championshipProposals[0]).toMatchObject({ suggestedDecision: "Changed Hands", status: "Pending" });
    expect(applied.universe.competitionProposals[0]).toMatchObject({ proposedWinnerParticipantId: firstTeam.id, status: "Pending" });
    const confirmedTitle = confirmChampionshipConsequence({
      universe: applied.universe, proposalId: applied.universe.championshipProposals[0].id, shows: applied.shows,
      championships: { championships: [championship] }, knownWorkers: workerProfiles.map((profile) => ({ id: profile.workerId, name: profile.workerName })),
    });
    expect(confirmedTitle.championships.championships[0].currentChampions.map((champion) => champion.name)).toEqual(winningTeam.memberNames);
    const confirmedCompetition = confirmCompetitionConsequence({ universe: applied.universe, proposalId: applied.universe.competitionProposals[0].id, competitions: { competitions: [competition] } });
    expect(confirmedCompetition.competitions.competitions[0].fixtures[0].winnerId).toBe(firstTeam.id);
  });

  test("applies a tag-team No Contest to every wrestler and both team records", () => {
    const show = createPlannedShow(1);
    show.id = "show-tag-nc";
    show.date = "2019-02-12";
    const segment = createPlannedSegment("match");
    segment.id = "tag-nc";
    segment.matchType = "Tag Team";
    const names = ["Alex Shelley", "Chris Sabin", "Mark Davis", "Kyle Fletcher"];
    segment.workers = names.map((name, index) => ({ id: `tag-${index}`, name, role: "Competitor", side: index < 2 ? "Side 1" : "Side 2", source: "tew" as const }));
    show.segments = [segment];
    const workerProfiles = segment.workers.map((worker) => createMatchEngineProfile(worker));
    const setup = {
      showId: show.id, showName: show.name, showDate: show.date, segmentId: segment.id, segmentTitle: "MCMG vs Aussie Open",
      matchType: "Tag Team", durationMinutes: 15, aimId: "competitive-tv-match" as const, importance: "Feature" as const,
      championship: "", competitionRound: "", chemistry: 0, volatility: 5, format: "Team" as const,
      workers: workerProfiles.map((profile, index) => ({
        workerKey: profile.workerKey, workerId: profile.workerId, workerName: profile.workerName, approachMode: "AI" as const,
        lockedApproachIds: [], manualApproachIds: [], storyNeed: 0, momentum: 50, bookingBias: 0,
        teamId: index < 2 ? "mcmg" : "aussie-open", teamName: index < 2 ? "Motor City Machine Guns" : "Aussie Open",
      })),
    };
    const attempt = resolveMatch({ setup, workers: workerProfiles.map((profile) => ({ profile, workbookMetrics: null })), seed: "tag-no-contest-consequences" });
    const calculated = createMatchResolutionRecord(setup, attempt);
    const noContest = overrideEngineResult(calculated, "", "No Contest", "", "The referee threw the match out.");
    const applied = applyCoreResultConsequences({ universe: emptyResultConsequenceUniverse(), resolution: noContest, shows: [show], profiles: workerProfiles, championships: emptyChampionshipUniverse(), competitions: emptyCompetitionUniverse() });
    expect(applied.universe.workerRecords.every((record) => record.noContests === 1 && record.wins === 0 && record.losses === 0 && record.rankingPoints === 0)).toBe(true);
    expect(applied.universe.teamRecords).toHaveLength(2);
    expect(applied.universe.teamRecords.every((record) => record.noContests === 1 && record.wins === 0 && record.losses === 0 && record.rankingPoints === 0)).toBe(true);
  });
});
