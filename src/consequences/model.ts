import { applyTitleResult, rebuildChampionshipFromEvents, titleMatchesSegment } from "../championships/model";
import type { Championship, ChampionshipUniverse, TitleResultDecision } from "../championships/types";
import { buildCompetitionStandings, recordCompetitionResult, resetCompetitionResult } from "../competitions/model";
import type { Competition, CompetitionParticipant, CompetitionUniverse } from "../competitions/types";
import { activeResolutionAttempt } from "../matchResolution/engine";
import type { MatchResolutionRecord } from "../matchResolution/types";
import { createPlannerId, touchShow } from "../planner/model";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import type { MatchEngineProfile } from "../matchEngine/types";
import {
  CALCULATION_FORMULAS,
  CONSEQUENCE_CALCULATION_SYSTEM_VERSION,
  COMPETITIVE_CALCULATION_SYSTEM_VERSION,
  createCalculationStage,
  createCalculationTerm,
} from "../calculations/foundation";
import type { CalculationLedgerStage } from "../calculations/foundation";
import type { MatchResolutionWorkerResult } from "../matchResolution/types";
import type {
  ChampionshipConsequenceProposal,
  CompetitionConsequenceProposal,
  ConditionChange,
  ConsequenceAuditEntry,
  ConsequenceSnapshot,
  CompetitiveProfileAdjustmentEvent,
  FutureBookingConflict,
  GroundedBookingPrompt,
  ResultConsequenceApplication,
  ResultConsequenceUniverse,
  StandaloneMatchHistoryEntry,
  StandaloneWorkerRecord,
  StandaloneTeamRecord,
} from "./types";

function now(): string {
  return new Date().toISOString();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, places = 2): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchNames(value: string, candidate: string): boolean {
  const left = normalize(value);
  const right = normalize(candidate);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function audit(applicationId: string, action: ConsequenceAuditEntry["action"], detail: string): ConsequenceAuditEntry {
  return { id: createPlannerId(), applicationId, action, detail, createdAt: now() };
}

export function emptyResultConsequenceUniverse(): ResultConsequenceUniverse {
  return {
    workerRecords: [],
    teamRecords: [],
    applications: [],
    championshipProposals: [],
    competitionProposals: [],
    futureConflicts: [],
    prompts: [],
    audit: [],
    competitiveProfileAdjustments: [],
    competitiveCalculationVersion: COMPETITIVE_CALCULATION_SYSTEM_VERSION,
    settings: { activeTab: "overview", selectedApplicationId: "", selectedWorkerKey: "" },
  };
}

export function synchronizeWorkerRecordsFromProfiles(universe: ResultConsequenceUniverse, profiles: MatchEngineProfile[]): ResultConsequenceUniverse {
  const byKey = new Map(profiles.map((profile) => [profile.workerKey, profile]));
  return {
    ...universe,
    workerRecords: universe.workerRecords.map((record) => {
      const profile = byKey.get(record.workerKey);
      return profile ? { ...record, momentum: profile.momentum, momentumScale: "0-100-v1", popularity: profile.popularity, health: profile.health, updatedAt: profile.updatedAt } : record;
    }),
  };
}

function defaultWorkerRecord(workerKey: string, workerId: string, workerName: string, profile: MatchEngineProfile | null): StandaloneWorkerRecord {
  return {
    workerKey,
    workerId,
    workerName,
    wins: 0,
    losses: 0,
    draws: 0,
    noContests: 0,
    currentStreakType: "",
    currentStreakCount: 0,
    lastFive: [],
    rankingPoints: 0,
    rankingPosition: 0,
    previousRankingPosition: 0,
    momentum: profile?.momentum ?? 50,
    momentumScale: "0-100-v1",
    popularity: profile?.popularity ?? 50,
    health: profile?.health ?? 100,
    lastMatchHealth: profile?.health ?? 100,
    fatigue: 0,
    injuryStatus: "Healthy",
    injuryNote: "",
    matchHistory: [],
    updatedAt: now(),
  };
}

function updateStreak(record: StandaloneWorkerRecord, result: "W" | "L" | "D" | "NC") {
  if (result === "NC") return { type: record.currentStreakType, count: record.currentStreakCount };
  return record.currentStreakType === result
    ? { type: result, count: record.currentStreakCount + 1 }
    : { type: result, count: 1 };
}

function injuryFromIncident(incident: string): { status: StandaloneWorkerRecord["injuryStatus"]; note: string; healthPenalty: number } {
  const normalized = normalize(incident);
  if (normalized.includes("major execution mistake")) return { status: "Injured", note: incident, healthPenalty: CALCULATION_FORMULAS.incidentDamage.majorIncidentPenalty };
  if (normalized.includes("visible botch")) return { status: "Minor Concern", note: incident, healthPenalty: CALCULATION_FORMULAS.incidentDamage.visibleBotchPenalty };
  return { status: "Healthy", note: "", healthPenalty: 0 };
}

type ResultCode = "W" | "L" | "D" | "NC";

function rankingCalculation(result: ResultCode, rawMatchScore: number, performanceLeader: boolean, upset: boolean): CalculationLedgerStage {
  const formula = CALCULATION_FORMULAS.rankingConsequence;
  const quality = Math.max(0, rawMatchScore - formula.qualityThreshold) / formula.qualityDivisor;
  const base = result === "W" ? formula.winBase : result === "L" ? formula.lossBase : result === "D" ? formula.drawBase : 0;
  const qualityWeight = result === "W" ? formula.winnerQualityWeight : result === "L" ? formula.loserQualityWeight : result === "D" ? formula.drawQualityWeight : 0;
  const upsetChange = result === "W" && upset ? formula.upsetWinChange : 0;
  const leaderChange = performanceLeader ? result === "W" ? formula.winnerLeaderChange : result === "L" ? formula.loserLeaderChange : 0 : 0;
  return createCalculationStage(formula, [
    createCalculationTerm("result", `${result === "W" ? "Win" : result === "L" ? "Loss" : result === "D" ? "Draw" : "No Contest"} base`, base),
    createCalculationTerm("raw-quality", "Raw in-ring quality above 60", quality, qualityWeight, `Raw in-ring score ${rawMatchScore.toFixed(2)}; live crowd and final rating are excluded.`),
    createCalculationTerm("upset", "Official upset bonus", upsetChange),
    createCalculationTerm("performance-leader", "Performance-leader bonus", leaderChange),
  ], { notes: ["The official final-result upset flag is authoritative for singles, teams, multi-person matches, and overrides."] });
}

function momentumCalculation(result: ResultCode, performanceScore: number, expectedPerformance: number, performanceLeader: boolean, upset: boolean): CalculationLedgerStage {
  const formula = CALCULATION_FORMULAS.momentumConsequence;
  const resultChange = result === "W" ? formula.winChange : result === "L" ? formula.lossChange : 0;
  const upsetChange = result === "W" && upset ? formula.upsetWinChange : 0;
  const leaderChange = performanceLeader ? formula.performanceLeaderChange : 0;
  const expectationChange = clamp(Math.round((performanceScore - expectedPerformance) / formula.expectationDivisor), formula.expectationMinimum, formula.expectationMaximum);
  return createCalculationStage(formula, [
    createCalculationTerm("result", "Official result", resultChange),
    createCalculationTerm("upset", "Official upset", upsetChange),
    createCalculationTerm("performance-leader", "Performance leadership", leaderChange),
    createCalculationTerm("expectation", "Performance versus expectation", expectationChange, 1, `${performanceScore.toFixed(2)} performance versus ${expectedPerformance.toFixed(2)} expectation, divided by ${formula.expectationDivisor}, rounded, then capped from ${formula.expectationMinimum} to +${formula.expectationMaximum}.`),
  ], { notes: [result === "NC" ? "No Contest contributes no result or upset component; actual performance can still change momentum." : "Momentum change is capped between -6 and +6."] });
}

function popularityCalculation(result: ResultCode, performanceScore: number, popularity: number): CalculationLedgerStage {
  const formula = CALCULATION_FORMULAS.popularityConsequence;
  const resultChange = result === "W" ? formula.winChange : result === "L" ? formula.lossChange : 0;
  return createCalculationStage(formula, [
    createCalculationTerm("performance-gap", "Performance above/below current popularity", performanceScore - popularity, formula.performanceGapWeight),
    createCalculationTerm("result", "Official result adjustment", resultChange),
  ], { notes: [result === "NC" ? "No Contest contributes no win or loss adjustment; actual performance can still change popularity." : "Popularity change is capped between -2 and +2."] });
}

function officialDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function restBeforeMatch(history: StandaloneMatchHistoryEntry[], showDate: string): { previousMatchDate: string; fullRestDays: number } {
  const current = officialDate(showDate);
  if (current === null) return { previousMatchDate: "", fullRestDays: 0 };
  const previous = history
    .map((entry) => ({ date: entry.showDate, timestamp: officialDate(entry.showDate) }))
    .filter((entry): entry is { date: string; timestamp: number } => entry.timestamp !== null && entry.timestamp <= current)
    .sort((left, right) => right.timestamp - left.timestamp)[0];
  if (!previous) return { previousMatchDate: "", fullRestDays: 0 };
  const calendarDays = Math.floor((current - previous.timestamp) / 86_400_000);
  return { previousMatchDate: previous.date, fullRestDays: Math.max(0, calendarDays - 1) };
}

function conditionForWorker(input: {
  existing: StandaloneWorkerRecord;
  storedHealthBefore: number;
  workerResult: MatchResolutionWorkerResult;
  resultCode: ResultCode;
  finalResult: NonNullable<ReturnType<typeof activeResolutionAttempt>>["finalResult"];
  rawMatchScore: number;
  showDate: string;
  performanceLeader: boolean;
  upset: boolean;
  expectedPerformance: number;
}): { record: StandaloneWorkerRecord; change: ConditionChange } {
  const { existing, storedHealthBefore, workerResult, resultCode, finalResult, rawMatchScore, showDate, performanceLeader, upset, expectedPerformance } = input;
  if (!finalResult) throw new Error("A finalized result is required.");
  const excessPace = Math.max(0, workerResult.actualPace - 3);
  const wearFormula = CALCULATION_FORMULAS.ordinaryWear;
  const wearCalculation = createCalculationStage(wearFormula, [
    createCalculationTerm("duration", "Actual duration (minutes)", finalResult.actualDurationMinutes, wearFormula.durationWeight),
    createCalculationTerm("stamina-cost", "Stamina cost", workerResult.staminaUsed, wearFormula.staminaCostWeight),
    createCalculationTerm("excess-pace", "Pace above 3", excessPace, wearFormula.excessPaceWeight),
    createCalculationTerm("stamina-state", `${workerResult.staminaStatus} stamina-state penalty`, wearFormula.staminaPenalties[workerResult.staminaStatus]),
  ], { notes: ["Crowd response, popularity, star rating, and final rating have no physical effect."] });
  const incident = injuryFromIncident(workerResult.incident);
  const incidentCalculation = createCalculationStage(CALCULATION_FORMULAS.incidentDamage, [
    createCalculationTerm("incident", incident.note ? incident.status === "Injured" ? "Major execution incident" : "Visible botch" : "No physical incident", incident.healthPenalty),
  ]);
  const healthRecoveryCalculation = createCalculationStage(CALCULATION_FORMULAS.healthRecovery, [
    createCalculationTerm("current-profile", "Current pre-match profile health", existing.health),
    createCalculationTerm("stored-health", "Stored health after previous match", storedHealthBefore, -1),
  ], { notes: ["Health recovery is synchronized from the current wrestler profile; Phase 6B20D does not invent an automatic health-regeneration rate."] });
  const healthRecovery = healthRecoveryCalculation.result;
  const ordinaryWear = wearCalculation.result;
  const incidentDamage = incidentCalculation.result;
  const healthAfter = round(clamp(existing.health - ordinaryWear - incidentDamage, 0, 100));

  const rest = restBeforeMatch(existing.matchHistory, showDate);
  const fatigueRecoveryFormula = CALCULATION_FORMULAS.fatigueRecovery;
  const fatigueRecoveryCalculation = createCalculationStage(
    { ...fatigueRecoveryFormula, capMaximum: existing.fatigue },
    [createCalculationTerm("full-rest-days", "Full rest days", rest.fullRestDays, fatigueRecoveryFormula.recoveryPerFullRestDay)],
    { notes: [rest.previousMatchDate ? `Previous official match date: ${rest.previousMatchDate}. Same-night matches receive no recovery.` : "No prior official match date was available, so no stored fatigue recovery was needed."] },
  );
  const fatigueRecovery = fatigueRecoveryCalculation.result;
  const fatigueBefore = round(clamp(existing.fatigue - fatigueRecovery, 0, 100));
  const fatigueFormula = CALCULATION_FORMULAS.fatigueGain;
  const fatigueCalculation = createCalculationStage(fatigueFormula, [
    createCalculationTerm("duration", "Actual duration (minutes)", finalResult.actualDurationMinutes, fatigueFormula.durationWeight),
    createCalculationTerm("stamina-cost", "Stamina cost", workerResult.staminaUsed, fatigueFormula.staminaCostWeight),
    createCalculationTerm("excess-pace", "Pace above 3", excessPace, fatigueFormula.excessPaceWeight),
    createCalculationTerm("stamina-state", `${workerResult.staminaStatus} stamina-state penalty`, fatigueFormula.staminaPenalties[workerResult.staminaStatus]),
  ]);
  const fatigueGain = fatigueCalculation.result;
  const fatigueAfter = round(clamp(fatigueBefore + fatigueGain, 0, 100));
  const momentumCalculationLedger = momentumCalculation(resultCode, workerResult.performanceScore, expectedPerformance, performanceLeader, upset);
  const momentumChange = momentumCalculationLedger.result;
  const popularityCalculationLedger = popularityCalculation(resultCode, workerResult.performanceScore, existing.popularity);
  const popularityChange = popularityCalculationLedger.result;
  const rankingCalculationLedger = rankingCalculation(resultCode, rawMatchScore, performanceLeader, upset);
  const rankingChange = rankingCalculationLedger.result;
  const streak = updateStreak(existing, resultCode);
  const next: StandaloneWorkerRecord = {
    ...existing,
    wins: existing.wins + (resultCode === "W" ? 1 : 0),
    losses: existing.losses + (resultCode === "L" ? 1 : 0),
    draws: existing.draws + (resultCode === "D" ? 1 : 0),
    noContests: existing.noContests + (resultCode === "NC" ? 1 : 0),
    currentStreakType: streak.type,
    currentStreakCount: streak.count,
    lastFive: [resultCode, ...existing.lastFive].slice(0, 5),
    rankingPoints: round(existing.rankingPoints + rankingChange),
    momentum: round(clamp(existing.momentum + momentumChange, 0, 100)),
    momentumScale: "0-100-v1",
    popularity: round(clamp(existing.popularity + popularityChange, 0, 100)),
    health: healthAfter,
    lastMatchHealth: healthAfter,
    fatigue: fatigueAfter,
    injuryStatus: incident.status === "Healthy" ? existing.injuryStatus === "Injured" ? "Injured" : healthAfter < 65 ? "Minor Concern" : "Healthy" : incident.status,
    injuryNote: incident.note || existing.injuryNote,
    updatedAt: now(),
  };
  const change: ConditionChange = {
    workerKey: existing.workerKey,
    workerName: existing.workerName,
    healthBefore: existing.health,
    healthAfter,
    healthStoredBefore: storedHealthBefore,
    healthRecovery,
    ordinaryWear,
    incidentDamage,
    fatigueBefore,
    fatigueAfter,
    fatigueStoredBefore: existing.fatigue,
    fatigueRecovery,
    fatigueGain,
    fullRestDays: rest.fullRestDays,
    momentumBefore: existing.momentum,
    momentumAfter: next.momentum,
    popularityBefore: existing.popularity,
    popularityAfter: next.popularity,
    rankingPointsBefore: existing.rankingPoints,
    rankingPointsAfter: next.rankingPoints,
    rankingPositionBefore: existing.rankingPosition,
    rankingPositionAfter: existing.rankingPosition,
    injuryStatus: next.injuryStatus,
    calculationLedger: {
      version: CONSEQUENCE_CALCULATION_SYSTEM_VERSION,
      healthRecovery: healthRecoveryCalculation,
      ordinaryWear: wearCalculation,
      incidentDamage: incidentCalculation,
      fatigueRecovery: fatigueRecoveryCalculation,
      fatigueGain: fatigueCalculation,
      momentum: momentumCalculationLedger,
      popularity: popularityCalculationLedger,
      ranking: rankingCalculationLedger,
    },
    explanation: [
      `${resultCode === "W" ? "Win" : resultCode === "L" ? "Loss" : resultCode === "D" ? "Draw" : "No Contest"}, official upset status, performance leadership, and performance versus the ${expectedPerformance.toFixed(1)} expectation changed momentum by ${momentumChange >= 0 ? "+" : ""}${momentumChange}.`,
      `Individual performance against ${existing.popularity.toFixed(1)} current popularity changed popularity by ${popularityChange >= 0 ? "+" : ""}${popularityChange}.`,
      `Raw in-ring score ${rawMatchScore.toFixed(1)} changed ranking points by ${rankingChange >= 0 ? "+" : ""}${rankingChange}; the crowd-adjusted ${finalResult.matchScore.toFixed(1)} final rating was excluded.`,
      `${rest.fullRestDays} full rest day${rest.fullRestDays === 1 ? "" : "s"} recovered ${fatigueRecovery.toFixed(1)} fatigue before this match; the match then added ${fatigueGain.toFixed(1)}.`,
      `Current profile health included ${healthRecovery.toFixed(1)} recovery since the stored result; ordinary match wear removed ${ordinaryWear.toFixed(1)} and incident damage removed ${incidentDamage.toFixed(1)}.`,
      incident.note || "No match incident produced an injury flag.",
    ],
  };
  return { record: next, change };
}

function applyRankingPositions(records: StandaloneWorkerRecord[]): StandaloneWorkerRecord[] {
  const ordered = [...records].sort((left, right) => right.rankingPoints - left.rankingPoints || left.workerKey.localeCompare(right.workerKey));
  const positions = new Map<string, number>();
  const ties = new Set<string>();
  ordered.forEach((record, index) => {
    const previous = ordered[index - 1];
    const position = previous && previous.rankingPoints === record.rankingPoints ? positions.get(previous.workerKey)! : index + 1;
    positions.set(record.workerKey, position);
    if (ordered.some((candidate) => candidate.workerKey !== record.workerKey && candidate.rankingPoints === record.rankingPoints)) ties.add(record.workerKey);
  });
  return records.map((record) => ({
    ...record,
    previousRankingPosition: record.rankingPosition,
    rankingPosition: positions.get(record.workerKey) ?? 0,
    rankingTied: ties.has(record.workerKey),
  }));
}

function applyTeamRankingPositions(records: StandaloneTeamRecord[]): StandaloneTeamRecord[] {
  const ordered = [...records].sort((left, right) => right.rankingPoints - left.rankingPoints || left.teamKey.localeCompare(right.teamKey));
  const positions = new Map<string, number>();
  ordered.forEach((record, index) => positions.set(record.teamKey, index > 0 && ordered[index - 1].rankingPoints === record.rankingPoints ? positions.get(ordered[index - 1].teamKey)! : index + 1));
  return records.map((record) => ({ ...record, previousRankingPosition: record.rankingPosition, rankingPosition: positions.get(record.teamKey) ?? 0, rankingTied: ordered.some((candidate) => candidate.teamKey !== record.teamKey && candidate.rankingPoints === record.rankingPoints) }));
}

function updateTeamRecords(
  existingRecords: StandaloneTeamRecord[],
  resolution: MatchResolutionRecord,
  show: PlannedShow,
  segment: PlannedSegment,
): StandaloneTeamRecord[] {
  const attempt = activeResolutionAttempt(resolution);
  if (!attempt?.finalResult || !attempt.engineResult.teamResults?.length) return existingRecords;
  const noContest = attempt.finalResult.finishType === "No Contest";
  const winnerTeamId = attempt.finalResult.winnerTeamId || attempt.engineResult.winnerTeamId;
  let records = [...existingRecords];
  for (const team of attempt.engineResult.teamResults) {
    const result: "W" | "L" | "NC" = noContest ? "NC" : team.id === winnerTeamId ? "W" : "L";
    const existing = records.find((record) => record.teamKey === team.id) ?? {
      teamKey: team.id, teamName: team.name, memberKeys: team.memberKeys, memberNames: team.memberNames,
      wins: 0, losses: 0, draws: 0, noContests: 0, rankingPoints: 0, rankingPosition: 0,
      previousRankingPosition: 0, momentum: 50, momentumScale: "0-100-v1" as const, matchHistory: [], updatedAt: now(),
    };
    const performanceLeader = team.memberKeys.includes(attempt.engineResult.performanceLeaderKey);
    const officialUpset = result === "W" && Boolean(attempt.finalResult.upset);
    const rankingLedger = rankingCalculation(result, attempt.engineResult.matchScore, performanceLeader, officialUpset);
    const rankingDelta = rankingLedger.result;
    const memberResults = attempt.workerResults.filter((worker) => team.memberKeys.includes(worker.workerKey));
    const performanceScore = memberResults.reduce((sum, worker) => sum + worker.performanceScore, 0) / Math.max(1, memberResults.length);
    const expectedPerformance = memberResults.reduce((sum, worker) => sum + worker.competitiveScore, 0) / Math.max(1, memberResults.length);
    const momentumLedger = momentumCalculation(result, performanceScore, expectedPerformance, performanceLeader, officialUpset);
    const momentumDelta = momentumLedger.result;
    const history = {
      id: createPlannerId(), resolutionRecordId: resolution.id, resolutionAttemptId: attempt.id,
      showId: show.id, showName: show.name, showDate: show.date, segmentId: segment.id, segmentTitle: segment.title,
      opponentTeamNames: attempt.engineResult.teamResults.filter((candidate) => candidate.id !== team.id).map((candidate) => candidate.name),
      result, finishDescription: attempt.finalResult.finishDescription, matchScore: attempt.finalResult.matchScore,
      rawMatchScore: attempt.engineResult.matchScore, rankingChange: rankingDelta, rankingCalculation: rankingLedger, momentumChange: momentumDelta, momentumCalculation: momentumLedger,
      occurredAt: attempt.finalResult.finalizedAt,
    } as const;
    const next: StandaloneTeamRecord = {
      ...existing, teamName: team.name, memberKeys: team.memberKeys, memberNames: team.memberNames,
      wins: existing.wins + (result === "W" ? 1 : 0), losses: existing.losses + (result === "L" ? 1 : 0), noContests: existing.noContests + (result === "NC" ? 1 : 0),
      rankingPoints: round(existing.rankingPoints + rankingDelta),
      momentum: round(clamp(existing.momentum + momentumDelta, 0, 100)), momentumScale: "0-100-v1",
      matchHistory: [history, ...existing.matchHistory], updatedAt: now(),
    };
    records = records.some((record) => record.teamKey === team.id)
      ? records.map((record) => record.teamKey === team.id ? next : record)
      : [...records, next];
  }
  return applyTeamRankingPositions(records);
}

function standaloneActualMatch(record: MatchResolutionRecord) {
  const attempt = activeResolutionAttempt(record);
  if (!attempt?.finalResult) throw new Error("The match resolution does not have a final result.");
  const final = attempt.finalResult;
  const minutes = Math.floor(final.actualDurationMinutes);
  const seconds = Math.round((final.actualDurationMinutes - minutes) * 60).toString().padStart(2, "0");
  return {
    id: `wrestling-sim:${record.id}:${attempt.id}`,
    description: final.finishType === "No Contest" ? "Match ended in a No Contest" : `${final.winnerName} defeated ${final.loserName}`,
    rating: final.matchScore,
    winner: final.finishType === "No Contest" ? "No Contest" : final.winnerName,
    matchTime: `${minutes}:${seconds}`,
    notes: final.finishDescription,
    placement: "Main Show" as const,
    workers: attempt.workerResults.map((worker) => worker.workerName),
  };
}

function applyResultToShow(show: PlannedShow, segmentId: string, record: MatchResolutionRecord): PlannedShow {
  const attempt = activeResolutionAttempt(record);
  if (!attempt?.finalResult) throw new Error("A finalized match result is required.");
  const final = attempt.finalResult;
  return touchShow({
    ...show,
    segments: show.segments.map((segment) => segment.id === segmentId ? {
      ...segment,
      workflowStatus: "Reconciled",
      reconciliation: {
        linkedMatchId: `wrestling-sim:${record.id}:${attempt.id}`,
        actualMatch: standaloneActualMatch(record),
        happenedAsPlanned: final.finishType === "No Contest" ? null : segment.plannedWinner ? normalize(segment.plannedWinner) === normalize(final.winnerName) : null,
        happenedAsPlannedDetail: final.finishType === "No Contest" ? "No Contest" : segment.plannedWinner ? normalize(segment.plannedWinner) === normalize(final.winnerName) ? "Yes" : "No" : "Unresolved",
        actualRating: final.matchScore,
        finalNarrative: final.finishDescription,
        changes: final.acceptedEngineResult ? "" : `Booker override: ${final.overrideReason}`,
        actualConsequences: "",
        finalFollowUp: segment.followUp,
        reconciledAt: final.finalizedAt,
      },
    } : segment),
  });
}

function findChampionship(segment: PlannedSegment, universe: ChampionshipUniverse): Championship | null {
  return universe.championships.find((championship) => segment.championshipId === championship.id || titleMatchesSegment(championship, segment)) ?? null;
}

function championshipProposal(applicationId: string, show: PlannedShow, segment: PlannedSegment, finalWinner: string, winnerMemberNames: string[], universe: ChampionshipUniverse, noContest = false, winnerMemberKeys: string[] = []): ChampionshipConsequenceProposal | null {
  const championship = findChampionship(segment, universe);
  if (!championship) return null;
  const championEntering = segment.championEntering || championship.currentChampions.map((champion) => champion.name).join(" & ");
  const challenger = segment.challenger || segment.workers.map((worker) => worker.name).find((name) => !matchNames(championEntering, name)) || "";
  const winnerIds = new Set(winnerMemberKeys.map(canonicalIdentity));
  const championIds = championship.currentChampions.map((champion) => canonicalIdentity(champion.id));
  const challengerNames = new Set(challenger.split(/\s*(?:&|,|\/| and )\s*/i).map(normalize).filter(Boolean));
  const challengerIds = segment.workers.filter((worker) => challengerNames.has(normalize(worker.name))).map((worker) => canonicalIdentity(worker.id));
  let suggestedDecision: TitleResultDecision = "Unresolved";
  let reason = "The winner could not be mapped clearly to the champion or challenger.";
  if (noContest) {
    suggestedDecision = "No Contest";
    reason = "The official result was a No Contest, so title activity is recorded without a defense or title change.";
  } else if (championship.status === "Vacant" || championship.currentChampions.length === 0) {
    suggestedDecision = "Changed Hands";
    reason = `${championship.name} is vacant, so the final winner can begin a new reign.`;
  } else if ((championIds.length > 0 && championIds.every((id) => winnerIds.has(id))) || (championEntering && normalize(finalWinner) === normalize(championEntering))) {
    suggestedDecision = "Retained";
    reason = `${finalWinner} matches the champion entering the match.`;
  } else if ((challengerIds.length > 0 && challengerIds.some((id) => winnerIds.has(id))) || (challenger && normalize(finalWinner) === normalize(challenger))) {
    suggestedDecision = "Changed Hands";
    reason = `${finalWinner} matches the challenger.`;
  }
  return {
    id: createPlannerId(),
    applicationId,
    championshipId: championship.id,
    championshipName: championship.name,
    showId: show.id,
    segmentId: segment.id,
    championEntering,
    challenger,
    finalWinner,
    finalWinnerMemberNames: winnerMemberNames,
    finalWinnerMemberKeys: winnerMemberKeys,
    suggestedDecision,
    selectedDecision: suggestedDecision,
    status: suggestedDecision === "Unresolved" ? "Blocked" : "Pending",
    reason,
    preview: suggestedDecision === "No Contest"
      ? ["Title activity is recorded.", "No defense is credited and no title change occurs."]
      : suggestedDecision === "Retained"
      ? [`${championEntering} remains champion.`, `Defense count increases from ${championship.defenses} to ${championship.defenses + 1}.`]
      : suggestedDecision === "Changed Hands"
        ? [`Current reign for ${championEntering || "the vacant title"} ends or remains vacant.`, `${finalWinner} begins a new reign dated ${show.date}.`, "Defense count resets to 0."]
        : ["No title history will change until the ambiguity is resolved."],
    confirmedAt: "",
  };
}

function canonicalIdentity(value: string): string {
  return normalize(value.replace(/^(?:tew|manual):/i, ""));
}

function participantForWinner(competition: Competition, winnerNames: string[], winnerKeys: string[]): CompetitionParticipant[] {
  const keySet = new Set(winnerKeys.map(canonicalIdentity).filter(Boolean));
  const nameSet = new Set(winnerNames.map(normalize).filter(Boolean));
  return competition.participants.filter((participant) => {
    const participantKeys = participant.sourceWorkerIds.map(canonicalIdentity).filter(Boolean);
    if (keySet.size > 0 && participantKeys.some((key) => keySet.has(key))) return true;
    return [participant.name, ...participant.memberNames].some((name) => nameSet.has(normalize(name)));
  });
}

function competitionProposal(applicationId: string, show: PlannedShow, segment: PlannedSegment, finalWinner: string, winnerMemberNames: string[], universe: CompetitionUniverse, noContest = false, winnerMemberKeys: string[] = [], finishType = ""): CompetitionConsequenceProposal | null {
  if (!segment.competitionId || !segment.competitionFixtureId) return null;
  const competition = universe.competitions.find((item) => item.id === segment.competitionId);
  const fixture = competition?.fixtures.find((item) => item.id === segment.competitionFixtureId);
  if (!competition || !fixture) return null;
  if (noContest) {
    return {
      id: createPlannerId(),
      applicationId,
      competitionId: competition.id,
      competitionName: competition.name,
      fixtureId: fixture.id,
      roundLabel: fixture.roundLabel,
      showId: show.id,
      segmentId: segment.id,
      finalWinner: "",
      proposedWinnerParticipantId: "",
      proposedWinnerParticipantName: "",
      resultType: "No Contest",
      finishType: "No Contest",
      winnerSubmissions: 0,
      loserSubmissions: 0,
      status: "Pending",
      reason: "The official Wrestling Sim result was a No Contest.",
      preview: [`${fixture.roundLabel} is recorded as a No Contest.`, "No participant advances and no win or loss is awarded."],
      confirmedAt: "",
    };
  }
  const candidates = participantForWinner(competition, [finalWinner, ...winnerMemberNames], winnerMemberKeys).filter((participant) => [fixture.participantAId, fixture.participantBId].includes(participant.id));
  const winner = candidates.length === 1 ? candidates[0] : null;
  const beforeStandings = buildCompetitionStandings(competition);
  const proposedCompetition = winner ? recordCompetitionResult(competition, fixture.id, "Decision", winner.id, `${finalWinner} won in Wrestling Sim.`) : competition;
  const afterStandings = buildCompetitionStandings(proposedCompetition);
  const preview = competition.format === "Single Elimination"
    ? winner ? [`${winner.name} completes ${fixture.roundLabel}.`, "The winner advances into the next available bracket position."] : ["Advancement is blocked until the final winner maps to exactly one fixture participant."]
    : winner ? afterStandings.filter((standing) => standing.participantId === winner.id).map((standing) => `${standing.participantName}: ${standing.wins} wins, ${standing.losses} losses, ${standing.draws} draws, ${standing.points} points, rank ${standing.rank}.`) : ["Standings are blocked until the winner identity is resolved."];
  return {
    id: createPlannerId(),
    applicationId,
    competitionId: competition.id,
    competitionName: competition.name,
    fixtureId: fixture.id,
    roundLabel: fixture.roundLabel,
    showId: show.id,
    segmentId: segment.id,
    finalWinner,
    proposedWinnerParticipantId: winner?.id ?? "",
    proposedWinnerParticipantName: winner?.name ?? "",
    resultType: "Decision",
    finishType,
    winnerSubmissions: finishType === "Submission" ? 1 : 0,
    loserSubmissions: 0,
    status: winner ? "Pending" : "Blocked",
    reason: winner ? `${finalWinner} maps to ${winner.name}.` : candidates.length > 1 ? "Multiple competition participants match the final winner." : "No fixture participant matches the final winner.",
    preview: [...preview, ...(beforeStandings.length && afterStandings.length ? [] : [])],
    confirmedAt: "",
  };
}

function futureConflicts(show: PlannedShow, segment: PlannedSegment, winnerName: string, loserName: string, winnerNames: string[], loserNames: string[], allShows: PlannedShow[]): FutureBookingConflict[] {
  const matchesAny = (value: string, names: string[]) => names.some((name) => matchNames(value, name));
  return allShows
    .filter((future) => future.id !== show.id && future.date && show.date && future.date > show.date)
    .flatMap((future) => future.segments.map((futureSegment) => ({ future, futureSegment })))
    .filter(({ futureSegment }) => futureSegment.workers.some((worker) => matchesAny(worker.name, winnerNames) || matchesAny(worker.name, loserNames)))
    .filter(({ futureSegment }) => {
      if (futureSegment.plannedWinner && matchesAny(futureSegment.plannedWinner, loserNames)) return true;
      if (futureSegment.championship && futureSegment.workers.some((worker) => matchesAny(worker.name, loserNames))) return true;
      if (futureSegment.notes.toLowerCase().includes("must") || futureSegment.purpose.toLowerCase().includes("must")) return true;
      return futureSegment.workers.some((worker) => matchesAny(worker.name, winnerNames)) && futureSegment.workers.some((worker) => matchesAny(worker.name, loserNames));
    })
    .map(({ future, futureSegment }) => ({
      id: createPlannerId(),
      sourceShowId: show.id,
      sourceSegmentId: segment.id,
      futureShowId: future.id,
      futureShowName: future.name,
      futureShowDate: future.date,
      futureSegmentId: futureSegment.id,
      futureSegmentTitle: futureSegment.title,
      severity: futureSegment.championship || futureSegment.plannedWinner ? "Important" : "Review",
      reason: futureSegment.plannedWinner && matchesAny(futureSegment.plannedWinner, loserNames)
        ? `${loserName} is already planned to win this future match despite the new result and current rankings.`
        : futureSegment.championship
          ? `The new result may affect the championship logic for ${futureSegment.title}.`
          : `Both ${winnerName} and ${loserName} appear in this future plan, so the actual result should be reviewed before the plan is treated as fixed.`,
      winnerName,
      loserName,
      resolved: false,
      resolutionNote: "",
    }));
}

function groundedPrompts(show: PlannedShow, segment: PlannedSegment, record: MatchResolutionRecord): GroundedBookingPrompt[] {
  const attempt = activeResolutionAttempt(record)!;
  const final = attempt.finalResult!;
  const noContest = final.finishType === "No Contest";
  const facts = [
    noContest ? "The match ended in a No Contest with no winner or loser." : `${final.winnerName} defeated ${final.loserName}.`,
    final.finishDescription,
    `Match score: ${final.matchScore.toFixed(1)} (${final.starRating} stars).`,
    noContest ? `${attempt.engineResult.performanceLeaderName} delivered the strongest individual performance.` : attempt.engineResult.performanceLeaderName === final.loserName ? `${final.loserName} was the performance leader despite losing.` : `${attempt.engineResult.performanceLeaderName} was the performance leader.`,
  ];
  const base = (kind: GroundedBookingPrompt["kind"], title: string, suggestedPurpose: string): GroundedBookingPrompt => ({
    id: createPlannerId(), kind, title, factualBasis: facts, suggestedPurpose, sourceShowId: show.id, sourceSegmentId: segment.id, dismissed: false, usedShowId: "", usedSegmentId: "",
  });
  const prompts = noContest ? [
    base("Rematch Review", "Review the unresolved No Contest", "Decide whether the neutral result warrants a rematch without treating any participant as the winner or loser."),
  ] : [
    base("Winner Celebration", `${final.winnerName} result reaction`, `Present ${final.winnerName}'s response to the official victory.`),
    base("Loser Reaction", `${final.loserName} responds to the loss`, `Record how ${final.loserName} reacts to the official defeat.`),
    base("Rematch Review", `Review whether ${final.winnerName} vs ${final.loserName} should continue`, "Evaluate a rematch only after considering rankings, finish, match quality, and future results."),
  ];
  if (!final.acceptedEngineResult) prompts.push(base("Disputed Finish", "Booker override consequence review", `Decide whether the explicit override should be acknowledged creatively. The engine originally selected ${attempt.engineResult.winnerName}.`));
  if (segment.championship) prompts.push(base("Championship Reaction", `${segment.championship} result reaction`, noContest ? "Acknowledge that the championship did not change hands and no defense was credited." : "Create a response to the confirmed championship consequence after the title decision is applied."));
  if (segment.competitionId) prompts.push(base("Competition Advancement", `${segment.competitionRoundLabel || "Competition"} result reaction`, noContest ? "Acknowledge that the fixture recorded a No Contest and nobody advanced." : "Create a response after the competition result is explicitly confirmed."));
  if (attempt.workerResults.some((worker) => worker.incident)) prompts.push(base("Incident Follow-Up", "Review the recorded match incident", "Decide whether the recorded incident requires a grounded medical or storyline follow-up."));
  return prompts;
}

function recordFromApplication(application: ResultConsequenceApplication): MatchResolutionRecord {
  const setup = application.sourceSetup ?? {
    showId: application.showId,
    showName: application.showName,
    showDate: application.officialShowDate,
    segmentId: application.segmentId,
    segmentTitle: application.segmentTitle,
    matchType: "",
    durationMinutes: application.finalResult.actualDurationMinutes,
    aimId: "competitive-tv-match",
    importance: "Television",
    championship: "",
    competitionRound: "",
    chemistry: 0,
    volatility: 0,
    workers: [],
  } as MatchResolutionRecord["setup"];
  return {
    id: application.resolutionRecordId,
    showId: application.showId,
    showName: application.showName,
    segmentId: application.segmentId,
    segmentTitle: application.segmentTitle,
    setup,
    attempts: [application.engineAttempt],
    activeAttemptId: application.engineAttempt.id,
    status: application.engineAttempt.status === "Overridden" ? "Overridden" : "Accepted",
    createdAt: application.appliedAt,
    updatedAt: application.appliedAt,
  };
}

function replayCompetitiveLedger(input: {
  universe: ResultConsequenceUniverse;
  shows: PlannedShow[];
  profiles: MatchEngineProfile[];
  championships: ChampionshipUniverse;
  competitions: CompetitionUniverse;
  forceReplay: boolean;
}): { universe: ResultConsequenceUniverse; profiles: MatchEngineProfile[] } {
  const baseline = input.universe.competitiveBaseline;
  if (!baseline) return { universe: input.universe, profiles: input.profiles };
  const active = input.universe.applications
    .filter((application) => application.status === "Applied" && application.replayStatus !== "Superseded" && application.competitiveCalculationVersion === COMPETITIVE_CALCULATION_SYSTEM_VERSION)
    .sort((left, right) => left.officialOrderKey.localeCompare(right.officialOrderKey));
  let records = structuredClone(baseline.workerRecords);
  let teamRecords = structuredClone(baseline.teamRecords ?? []);
  const baselineProfileKeys = new Set(baseline.profiles.map((profile) => profile.workerKey));
  let profiles = [...structuredClone(baseline.profiles), ...structuredClone(input.profiles.filter((profile) => !baselineProfileKeys.has(profile.workerKey)))];
  const replayedAt = now();
  const updatedApplications = new Map<string, ResultConsequenceApplication>();
  const adjustments = [...input.universe.competitiveProfileAdjustments].sort((left, right) => left.officialOrderKey.localeCompare(right.officialOrderKey));
  let adjustmentIndex = 0;
  const applyAdjustmentsThrough = (orderKey: string) => {
    while (adjustmentIndex < adjustments.length && adjustments[adjustmentIndex].officialOrderKey < orderKey) {
      const adjustment = adjustments[adjustmentIndex];
      for (const change of adjustment.participantChanges) {
        profiles = profiles.map((profile) => profile.workerKey === change.workerKey ? { ...profile, momentum: round(clamp(profile.momentum + change.momentumDelta, 0, 100)), popularity: round(clamp(profile.popularity + change.popularityDelta, 0, 100)), updatedAt: replayedAt } : profile);
        records = records.map((record) => record.workerKey === change.workerKey ? { ...record, momentum: round(clamp(record.momentum + change.momentumDelta, 0, 100)), popularity: round(clamp(record.popularity + change.popularityDelta, 0, 100)), updatedAt: replayedAt } : record);
      }
      adjustmentIndex += 1;
    }
  };

  for (const application of active) {
    applyAdjustmentsThrough(application.officialOrderKey);
    const resolution = recordFromApplication(application);
    const attempt = activeResolutionAttempt(resolution);
    const show = input.shows.find((item) => item.id === application.showId);
    const segment = show?.segments.find((item) => item.id === application.segmentId);
    if (!attempt?.finalResult || !show || !segment) {
      updatedApplications.set(application.id, application);
      continue;
    }
    profiles = profiles.map((profile) => {
      const capturedProfile = application.before.profiles.find((item) => item.workerKey === profile.workerKey);
      const capturedRecord = application.before.workerRecords.find((item) => item.workerKey === profile.workerKey);
      if (!capturedProfile || !capturedRecord) return profile;
      return {
        ...profile,
        health: clamp(profile.health + (capturedProfile.health - (capturedRecord.lastMatchHealth ?? capturedRecord.health)), 0, 100),
        momentum: clamp(profile.momentum + (capturedProfile.momentum - capturedRecord.momentum), 0, 100),
        popularity: clamp(profile.popularity + (capturedProfile.popularity - capturedRecord.popularity), 0, 100),
      };
    });
    const beforeRecords = structuredClone(records);
    const beforeTeams = structuredClone(teamRecords);
    const beforeProfiles = structuredClone(profiles);
    const changes: ConditionChange[] = [];
    const noContest = attempt.finalResult.finishType === "No Contest";
    const winningKeys = noContest ? [] : attempt.finalResult.winnerMemberKeys?.length ? attempt.finalResult.winnerMemberKeys : [attempt.finalResult.winnerKey];
    for (const workerResult of attempt.workerResults) {
      const profile = profiles.find((item) => item.workerKey === workerResult.workerKey) ?? null;
      const savedRecord = records.find((item) => item.workerKey === workerResult.workerKey);
      const storedHealthBefore = savedRecord?.lastMatchHealth ?? savedRecord?.health ?? profile?.health ?? 100;
      const existing = savedRecord
        ? { ...savedRecord, momentum: profile?.momentum ?? savedRecord.momentum, popularity: profile?.popularity ?? savedRecord.popularity ?? 50, health: profile?.health ?? savedRecord.health }
        : defaultWorkerRecord(workerResult.workerKey, workerResult.workerId, workerResult.workerName, profile);
      const resultCode: "W" | "L" | "NC" = noContest ? "NC" : winningKeys.includes(workerResult.workerKey) ? "W" : "L";
      const isLeader = workerResult.workerKey === attempt.engineResult.performanceLeaderKey;
      const condition = conditionForWorker({
        existing,
        storedHealthBefore,
        workerResult,
        resultCode,
        finalResult: attempt.finalResult,
        rawMatchScore: attempt.engineResult.matchScore,
        showDate: application.officialShowDate || show.date,
        performanceLeader: isLeader,
        upset: Boolean(attempt.finalResult.upset) && resultCode === "W",
        expectedPerformance: profile?.overall ?? existing.popularity,
      });
      const opponents = noContest
        ? attempt.workerResults.filter((item) => item.workerKey !== workerResult.workerKey)
        : attempt.workerResults.filter((item) => winningKeys.includes(item.workerKey) !== winningKeys.includes(workerResult.workerKey));
      const history: StandaloneMatchHistoryEntry = {
        id: `competitive-history:${application.id}:${workerResult.workerKey}`,
        resolutionRecordId: application.resolutionRecordId,
        resolutionAttemptId: application.resolutionAttemptId,
        showId: show.id,
        showName: show.name,
        showDate: application.officialShowDate || show.date,
        segmentId: segment.id,
        segmentTitle: segment.title,
        opponentKeys: opponents.map((item) => item.workerKey),
        opponentNames: opponents.map((item) => item.workerName),
        result: resultCode,
        winnerName: noContest ? "No Contest" : attempt.finalResult.winnerName,
        finishDescription: attempt.finalResult.finishDescription,
        durationMinutes: attempt.finalResult.actualDurationMinutes,
        matchScore: attempt.finalResult.matchScore,
        rawMatchScore: attempt.engineResult.matchScore,
        starRating: attempt.finalResult.starRating,
        performanceScore: workerResult.performanceScore,
        competitiveScore: workerResult.competitiveScore,
        performanceLeader: isLeader,
        engineResultAccepted: attempt.finalResult.acceptedEngineResult,
        overrideReason: attempt.finalResult.overrideReason,
        incident: workerResult.incident,
        occurredAt: attempt.finalResult.finalizedAt,
      };
      const nextRecord = { ...condition.record, matchHistory: [history, ...condition.record.matchHistory] };
      records = records.some((item) => item.workerKey === nextRecord.workerKey) ? records.map((item) => item.workerKey === nextRecord.workerKey ? nextRecord : item) : [...records, nextRecord];
      profiles = profiles.some((item) => item.workerKey === nextRecord.workerKey)
        ? profiles.map((item) => item.workerKey === nextRecord.workerKey ? { ...item, momentum: nextRecord.momentum, popularity: nextRecord.popularity, health: nextRecord.health, updatedAt: replayedAt } : item)
        : profiles;
      changes.push(condition.change);
    }
    records = applyRankingPositions(records);
    for (const change of changes) change.rankingPositionAfter = records.find((record) => record.workerKey === change.workerKey)?.rankingPosition ?? change.rankingPositionBefore ?? 0;
    teamRecords = updateTeamRecords(teamRecords, resolution, show, segment);
    updatedApplications.set(application.id, {
      ...application,
      conditionChanges: changes,
      before: { workerRecords: beforeRecords, teamRecords: beforeTeams, profiles: beforeProfiles, shows: application.before.shows, championships: application.before.championships, competitions: application.before.competitions },
      replayStatus: input.forceReplay ? "Replayed" : application.replayStatus,
      replayedAt: input.forceReplay ? replayedAt : application.replayedAt,
    });
  }
  applyAdjustmentsThrough("\uffff");

  const applications = input.universe.applications.map((application) => updatedApplications.get(application.id) ?? application);
  const auditEntries = input.forceReplay
    ? [audit(active.at(-1)?.id ?? "", "Competitive Ledger Replayed", `${active.length} active result${active.length === 1 ? "" : "s"} replayed in official show-date and running-order sequence.`), ...input.universe.audit]
    : input.universe.audit;
  return {
    profiles,
    universe: { ...input.universe, workerRecords: records, teamRecords, applications, audit: auditEntries, competitiveCalculationVersion: COMPETITIVE_CALCULATION_SYSTEM_VERSION },
  };
}

export function recordAngleCompetitiveAdjustment(input: {
  universe: ResultConsequenceUniverse;
  evaluation: { id: string; showId: string; segmentId: string; participants: Array<{ workerKey: string; workerName: string; momentumDelta: number; popularityDelta: number }>; appliedAt: string };
  show: PlannedShow;
  profilesBefore: MatchEngineProfile[];
  profilesAfter: MatchEngineProfile[];
  shows: PlannedShow[];
  championships: ChampionshipUniverse;
  competitions: CompetitionUniverse;
}): { universe: ResultConsequenceUniverse; profiles: MatchEngineProfile[] } {
  if (input.universe.competitiveProfileAdjustments.some((event) => event.sourceEvaluationId === input.evaluation.id)) return { universe: input.universe, profiles: input.profilesAfter };
  const runningOrderPosition = Math.max(0, input.show.segments.findIndex((segment) => segment.id === input.evaluation.segmentId));
  const officialShowDate = input.show.reconciliation?.actualShow.date || input.show.date;
  const event: CompetitiveProfileAdjustmentEvent = {
    id: `competitive-angle:${input.evaluation.id}`,
    source: "Angle",
    sourceEvaluationId: input.evaluation.id,
    showId: input.evaluation.showId,
    segmentId: input.evaluation.segmentId,
    officialShowDate,
    runningOrderPosition,
    officialOrderKey: `${officialShowDate || "9999-12-31"}:${runningOrderPosition.toString().padStart(5, "0")}:${input.evaluation.appliedAt}:${input.evaluation.id}`,
    participantChanges: input.evaluation.participants.map((participant) => ({ workerKey: participant.workerKey, workerName: participant.workerName, momentumDelta: participant.momentumDelta, popularityDelta: participant.popularityDelta })),
    appliedAt: input.evaluation.appliedAt,
  };
  const before: ConsequenceSnapshot = { workerRecords: structuredClone(input.universe.workerRecords), teamRecords: structuredClone(input.universe.teamRecords), shows: structuredClone(input.shows), championships: structuredClone(input.championships), competitions: structuredClone(input.competitions), profiles: structuredClone(input.profilesBefore) };
  const nextUniverse: ResultConsequenceUniverse = { ...input.universe, competitiveProfileAdjustments: [...input.universe.competitiveProfileAdjustments, event], competitiveBaseline: input.universe.competitiveBaseline ?? before, competitiveCalculationVersion: COMPETITIVE_CALCULATION_SYSTEM_VERSION, audit: [audit(event.id, "Angle Consequence Recorded", `${input.show.name} · card position #${runningOrderPosition + 1}: angle momentum and popularity changes entered the official competitive chronology.`), ...input.universe.audit] };
  const laterExists = input.universe.applications.some((application) => application.status === "Applied" && application.replayStatus !== "Superseded" && application.officialOrderKey > event.officialOrderKey)
    || input.universe.competitiveProfileAdjustments.some((adjustment) => adjustment.officialOrderKey > event.officialOrderKey);
  return replayCompetitiveLedger({ universe: nextUniverse, shows: input.shows, profiles: input.profilesAfter, championships: input.championships, competitions: input.competitions, forceReplay: laterExists });
}

export function applyCoreResultConsequences(input: {
  universe: ResultConsequenceUniverse;
  resolution: MatchResolutionRecord;
  shows: PlannedShow[];
  profiles: MatchEngineProfile[];
  championships: ChampionshipUniverse;
  competitions: CompetitionUniverse;
}): { universe: ResultConsequenceUniverse; shows: PlannedShow[]; profiles: MatchEngineProfile[]; championships: ChampionshipUniverse; competitions: CompetitionUniverse } {
  const attempt = activeResolutionAttempt(input.resolution);
  if (!attempt?.finalResult || (attempt.status !== "Accepted" && attempt.status !== "Overridden")) throw new Error("Accept or override the official match result before applying consequences.");
  const idempotencyKey = `${input.resolution.id}:${attempt.id}:match-consequences`;
  if (input.universe.applications.some((application) => (application.idempotencyKey === idempotencyKey || application.resolutionAttemptId === attempt.id) && application.status === "Applied")) throw new Error("This official result has already been applied. Consequence application is idempotent.");
  const show = input.shows.find((item) => item.id === input.resolution.showId);
  const segment = show?.segments.find((item) => item.id === input.resolution.segmentId);
  if (!show || !segment) throw new Error("The planned show or segment linked to this result could not be found.");
  const applicationId = createPlannerId();
  const supersededApplicationIds = input.universe.applications.filter((item) => item.resolutionRecordId === input.resolution.id && item.status === "Applied").map((item) => item.id);
  const correctedChampionships: ChampionshipUniverse = supersededApplicationIds.length ? {
    championships: input.championships.championships.map((championship) => championship.resultEvents.some((event) => supersededApplicationIds.includes(event.sourceResultId))
      ? rebuildChampionshipFromEvents({ ...championship, resultEvents: championship.resultEvents.filter((event) => !supersededApplicationIds.includes(event.sourceResultId)) })
      : championship),
  } : input.championships;
  const correctedCompetitions: CompetitionUniverse = supersededApplicationIds.length ? {
    competitions: input.competitions.competitions.map((competition) => {
      const fixture = competition.fixtures.find((item) => supersededApplicationIds.includes(item.sourceResultId));
      return fixture ? resetCompetitionResult(competition, fixture.id) : competition;
    }),
  } : input.competitions;
  const runningOrderPosition = Math.max(0, show.segments.findIndex((item) => item.id === segment.id));
  const officialShowDate = show.reconciliation?.actualShow.date || show.date;
  const officialOrderKey = `${officialShowDate || "9999-12-31"}:${runningOrderPosition.toString().padStart(5, "0")}:${attempt.finalResult.finalizedAt}:${input.universe.applications.length.toString().padStart(8, "0")}:${applicationId}`;
  const before: ConsequenceSnapshot = {
    workerRecords: structuredClone(input.universe.workerRecords),
    teamRecords: structuredClone(input.universe.teamRecords),
    shows: structuredClone(input.shows),
    championships: structuredClone(input.championships),
    competitions: structuredClone(input.competitions),
    profiles: structuredClone(input.profiles),
  };

  let records = [...input.universe.workerRecords];
  let profiles = [...input.profiles];
  const changes: ConditionChange[] = [];
  const historyEntries: StandaloneMatchHistoryEntry[] = [];
  for (const workerResult of attempt.workerResults) {
    const profile = input.profiles.find((item) => item.workerKey === workerResult.workerKey) ?? null;
    const savedRecord = records.find((item) => item.workerKey === workerResult.workerKey);
    const storedHealthBefore = savedRecord?.lastMatchHealth ?? savedRecord?.health ?? profile?.health ?? 100;
    const existing = savedRecord
      ? { ...savedRecord, momentum: profile?.momentum ?? savedRecord.momentum, popularity: profile?.popularity ?? savedRecord.popularity ?? 50, health: profile?.health ?? savedRecord.health }
      : defaultWorkerRecord(workerResult.workerKey, workerResult.workerId, workerResult.workerName, profile);
    const noContest = attempt.finalResult.finishType === "No Contest";
    const winningKeys = noContest ? [] : attempt.finalResult.winnerMemberKeys?.length ? attempt.finalResult.winnerMemberKeys : [attempt.finalResult.winnerKey];
    const resultCode: "W" | "L" | "NC" = noContest ? "NC" : winningKeys.includes(workerResult.workerKey) ? "W" : "L";
    const isLeader = workerResult.workerKey === attempt.engineResult.performanceLeaderKey;
    const condition = conditionForWorker({
      existing,
      storedHealthBefore,
      workerResult,
      resultCode,
      finalResult: attempt.finalResult,
      rawMatchScore: attempt.engineResult.matchScore,
      showDate: show.date,
      performanceLeader: isLeader,
      upset: Boolean(attempt.finalResult.upset) && resultCode === "W",
      expectedPerformance: profile?.overall ?? existing.popularity,
    });
    const opponents = noContest ? attempt.workerResults.filter((item) => item.workerKey !== workerResult.workerKey) : attempt.workerResults.filter((item) => winningKeys.includes(item.workerKey) !== winningKeys.includes(workerResult.workerKey));
    const history: StandaloneMatchHistoryEntry = {
      id: createPlannerId(),
      resolutionRecordId: input.resolution.id,
      resolutionAttemptId: attempt.id,
      showId: show.id,
      showName: show.name,
      showDate: show.date,
      segmentId: segment.id,
      segmentTitle: segment.title,
      opponentKeys: opponents.map((item) => item.workerKey),
      opponentNames: opponents.map((item) => item.workerName),
      result: resultCode,
      winnerName: noContest ? "No Contest" : attempt.finalResult.winnerName,
      finishDescription: attempt.finalResult.finishDescription,
      durationMinutes: attempt.finalResult.actualDurationMinutes,
      matchScore: attempt.finalResult.matchScore,
      rawMatchScore: attempt.engineResult.matchScore,
      starRating: attempt.finalResult.starRating,
      performanceScore: workerResult.performanceScore,
      competitiveScore: workerResult.competitiveScore,
      performanceLeader: isLeader,
      engineResultAccepted: attempt.finalResult.acceptedEngineResult,
      overrideReason: attempt.finalResult.overrideReason,
      incident: workerResult.incident,
      occurredAt: attempt.finalResult.finalizedAt,
    };
    const nextRecord = { ...condition.record, matchHistory: [history, ...condition.record.matchHistory] };
    records = records.some((item) => item.workerKey === nextRecord.workerKey) ? records.map((item) => item.workerKey === nextRecord.workerKey ? nextRecord : item) : [...records, nextRecord];
    profiles = profiles.map((item) => item.workerKey === nextRecord.workerKey ? { ...item, momentum: nextRecord.momentum, popularity: nextRecord.popularity, health: nextRecord.health, updatedAt: now() } : item);
    changes.push(condition.change);
    historyEntries.push(history);
  }
  records = applyRankingPositions(records);
  for (const change of changes) {
    change.rankingPositionAfter = records.find((record) => record.workerKey === change.workerKey)?.rankingPosition ?? change.rankingPositionBefore ?? 0;
  }
  const teamRecords = updateTeamRecords(input.universe.teamRecords, input.resolution, show, segment);
  const updatedShow = applyResultToShow(show, segment.id, input.resolution);
  const shows = input.shows.map((item) => item.id === show.id ? updatedShow : item);
  const refreshedSegment = updatedShow.segments.find((item) => item.id === segment.id)!;
  const noContest = attempt.finalResult.finishType === "No Contest";
  const winningNames = attempt.finalResult.winnerMemberNames?.length ? attempt.finalResult.winnerMemberNames : [attempt.finalResult.winnerName];
  const losingNames = attempt.finalResult.loserNames?.length ? attempt.finalResult.loserNames : [attempt.finalResult.loserName];
  const conflicts = noContest ? [] : futureConflicts(updatedShow, refreshedSegment, attempt.finalResult.winnerName, attempt.finalResult.loserName, winningNames, losingNames, shows);
  const prompts = groundedPrompts(updatedShow, refreshedSegment, input.resolution);
  const winnerMemberNames = attempt.finalResult.winnerMemberNames?.length ? attempt.finalResult.winnerMemberNames : [attempt.finalResult.winnerName];
  const winnerMemberKeys = attempt.finalResult.winnerMemberKeys?.length ? attempt.finalResult.winnerMemberKeys : noContest ? [] : [attempt.finalResult.winnerKey];
  const titleProposal = championshipProposal(applicationId, updatedShow, refreshedSegment, attempt.finalResult.winnerName, winnerMemberNames, correctedChampionships, noContest, winnerMemberKeys);
  const competition = competitionProposal(applicationId, updatedShow, refreshedSegment, attempt.finalResult.winnerName, winnerMemberNames, correctedCompetitions, noContest, winnerMemberKeys, attempt.finalResult.finishType);
  const application: ResultConsequenceApplication = {
    id: applicationId,
    resolutionRecordId: input.resolution.id,
    resolutionAttemptId: attempt.id,
    calculationVersion: CONSEQUENCE_CALCULATION_SYSTEM_VERSION,
    competitiveCalculationVersion: COMPETITIVE_CALCULATION_SYSTEM_VERSION,
    idempotencyKey,
    showId: show.id,
    showName: show.name,
    segmentId: segment.id,
    segmentTitle: segment.title,
    finalResult: attempt.finalResult,
    engineAttempt: attempt,
    sourceSetup: structuredClone(input.resolution.setup),
    officialShowDate,
    runningOrderPosition,
    officialOrderKey,
    replayStatus: "Original",
    replayedAt: "",
    supersededByApplicationId: "",
    status: "Applied",
    conditionChanges: changes,
    futureConflictIds: conflicts.map((item) => item.id),
    promptIds: prompts.map((item) => item.id),
    championshipProposalId: titleProposal?.id ?? "",
    competitionProposalId: competition?.id ?? "",
    before,
    appliedAt: now(),
    rolledBackAt: "",
    rollbackReason: "",
  };
  const result = {
    shows,
    profiles,
    universe: {
      ...input.universe,
      workerRecords: records,
      teamRecords,
      applications: [application, ...input.universe.applications.map((item) => item.resolutionRecordId === application.resolutionRecordId && item.status === "Applied" ? { ...item, replayStatus: "Superseded" as const, supersededByApplicationId: application.id } : item)],
      championshipProposals: titleProposal ? [titleProposal, ...input.universe.championshipProposals] : input.universe.championshipProposals,
      competitionProposals: competition ? [competition, ...input.universe.competitionProposals] : input.universe.competitionProposals,
      futureConflicts: [...conflicts, ...input.universe.futureConflicts],
      prompts: [...prompts, ...input.universe.prompts],
      audit: [audit(application.id, "Core Consequences Applied", noContest ? "No Contest applied; all participants and teams received NC records, no rankings or titles changed, and physical wear remained recorded." : `${attempt.finalResult.winnerName} defeated ${attempt.finalResult.loserName}; individual and team records, rankings, momentum, condition, history, and future-plan review were updated.`), ...input.universe.audit],
      competitiveCalculationVersion: COMPETITIVE_CALCULATION_SYSTEM_VERSION,
      competitiveBaseline: input.universe.competitiveBaseline ?? before,
      settings: { ...input.universe.settings, selectedApplicationId: application.id },
    },
  };
  const previousActive = input.universe.applications.filter((item) => item.status === "Applied" && item.replayStatus !== "Superseded");
  const forceReplay = previousActive.some((item) => item.officialOrderKey > application.officialOrderKey) || previousActive.some((item) => item.resolutionRecordId === application.resolutionRecordId);
  const replayed = replayCompetitiveLedger({ ...result, championships: correctedChampionships, competitions: correctedCompetitions, forceReplay });
  return { shows: result.shows, profiles: replayed.profiles, universe: replayed.universe, championships: correctedChampionships, competitions: correctedCompetitions };
}

export function rollbackCoreResultConsequences(
  universe: ResultConsequenceUniverse,
  applicationId: string,
  reason: string,
  currentProfiles: MatchEngineProfile[] = [],
  currentState?: { shows: PlannedShow[]; championships: ChampionshipUniverse; competitions: CompetitionUniverse },
): { universe: ResultConsequenceUniverse; shows: PlannedShow[]; championships: ChampionshipUniverse; competitions: CompetitionUniverse; profiles: MatchEngineProfile[] } {
  const application = universe.applications.find((item) => item.id === applicationId);
  if (!application || application.status !== "Applied") throw new Error("Choose an applied consequence record to roll back.");
  if (!reason.trim()) throw new Error("Record why the applied result consequences are being rolled back.");
  const timestamp = now();
  if (application.competitiveCalculationVersion !== COMPETITIVE_CALCULATION_SYSTEM_VERSION || !universe.competitiveBaseline) {
    return {
      shows: structuredClone(application.before.shows),
      championships: structuredClone(application.before.championships),
      competitions: structuredClone(application.before.competitions),
      profiles: structuredClone(application.before.profiles ?? currentProfiles),
      universe: {
        ...universe,
        workerRecords: structuredClone(application.before.workerRecords),
        teamRecords: structuredClone(application.before.teamRecords ?? []),
        applications: universe.applications.map((item) => item.id === applicationId ? { ...item, status: "Rolled Back", rolledBackAt: timestamp, rollbackReason: reason.trim() } : item),
        championshipProposals: universe.championshipProposals.filter((proposal) => proposal.applicationId !== applicationId),
        competitionProposals: universe.competitionProposals.filter((proposal) => proposal.applicationId !== applicationId),
        futureConflicts: universe.futureConflicts.filter((conflict) => !application.futureConflictIds.includes(conflict.id)),
        prompts: universe.prompts.filter((prompt) => !application.promptIds.includes(prompt.id)),
        audit: [audit(applicationId, "Core Consequences Rolled Back", `${reason.trim()} Legacy snapshot restored without recalculating its locked historical result.`), ...universe.audit],
      },
    };
  }
  const sourceShows = structuredClone(currentState?.shows ?? application.before.shows);
  const originalShow = application.before.shows.find((show) => show.id === application.showId);
  const originalSegment = originalShow?.segments.find((segment) => segment.id === application.segmentId);
  const shows = originalSegment ? sourceShows.map((show) => show.id === application.showId ? { ...show, segments: show.segments.map((segment) => segment.id === application.segmentId ? structuredClone(originalSegment) : segment) } : show) : sourceShows;
  const sourceChampionships = structuredClone(currentState?.championships ?? application.before.championships);
  const championships = {
    championships: sourceChampionships.championships.map((championship) => championship.resultEvents.some((event) => event.sourceResultId === applicationId)
      ? rebuildChampionshipFromEvents({ ...championship, resultEvents: championship.resultEvents.filter((event) => event.sourceResultId !== applicationId) })
      : championship),
  };
  const sourceCompetitions = structuredClone(currentState?.competitions ?? application.before.competitions);
  const competitions = {
    competitions: sourceCompetitions.competitions.map((competition) => {
      const fixture = competition.fixtures.find((item) => item.sourceResultId === applicationId);
      return fixture ? resetCompetitionResult(competition, fixture.id) : competition;
    }),
  };
  const nextUniverse: ResultConsequenceUniverse = {
    ...universe,
    applications: universe.applications.map((item) => item.id === applicationId ? { ...item, status: "Rolled Back", rolledBackAt: timestamp, rollbackReason: reason.trim() } : item),
    championshipProposals: universe.championshipProposals.filter((proposal) => proposal.applicationId !== applicationId),
    competitionProposals: universe.competitionProposals.filter((proposal) => proposal.applicationId !== applicationId),
    futureConflicts: universe.futureConflicts.filter((conflict) => !application.futureConflictIds.includes(conflict.id)),
    prompts: universe.prompts.filter((prompt) => !application.promptIds.includes(prompt.id)),
    audit: [audit(applicationId, "Core Consequences Rolled Back", `${reason.trim()} Later official results were replayed in chronology.`), ...universe.audit],
  };
  const replayed = replayCompetitiveLedger({ universe: nextUniverse, shows, profiles: currentProfiles.length ? currentProfiles : application.before.profiles, championships, competitions, forceReplay: true });
  return { shows, championships, competitions, profiles: replayed.profiles, universe: replayed.universe };
}

export function updateChampionshipProposal(universe: ResultConsequenceUniverse, proposalId: string, decision: TitleResultDecision | "Deferred"): ResultConsequenceUniverse {
  return {
    ...universe,
    championshipProposals: universe.championshipProposals.map((proposal) => proposal.id === proposalId ? {
      ...proposal,
      selectedDecision: decision === "Deferred" ? proposal.selectedDecision : decision,
      status: decision === "Deferred" ? "Deferred" : decision === "Unresolved" ? "Blocked" : "Pending",
    } : proposal),
    audit: decision === "Deferred" ? [audit(universe.championshipProposals.find((proposal) => proposal.id === proposalId)?.applicationId ?? "", "Championship Deferred", "Championship consequence deferred for explicit later review."), ...universe.audit] : universe.audit,
  };
}

export function confirmChampionshipConsequence(input: {
  universe: ResultConsequenceUniverse;
  proposalId: string;
  shows: PlannedShow[];
  championships: ChampionshipUniverse;
  knownWorkers?: Array<{ id: string; name: string }>;
}): { universe: ResultConsequenceUniverse; shows: PlannedShow[]; championships: ChampionshipUniverse } {
  const proposal = input.universe.championshipProposals.find((item) => item.id === input.proposalId);
  if (!proposal || proposal.status === "Confirmed") throw new Error("Choose a pending championship proposal.");
  if (!proposal.selectedDecision || proposal.selectedDecision === "Unresolved") throw new Error("Resolve the championship decision before confirmation.");
  const championship = input.championships.championships.find((item) => item.id === proposal.championshipId);
  const show = input.shows.find((item) => item.id === proposal.showId);
  const segment = show?.segments.find((item) => item.id === proposal.segmentId);
  if (!championship || !show || !segment) throw new Error("The linked championship, show, or segment could not be found.");
  const titleSegment = proposal.selectedDecision === "Changed Hands" && proposal.finalWinnerMemberNames?.length > 1 && segment.reconciliation.actualMatch
    ? { ...segment, reconciliation: { ...segment.reconciliation, actualMatch: { ...segment.reconciliation.actualMatch, winner: proposal.finalWinnerMemberNames.join(" & ") } } }
    : segment;
  const titleShow = titleSegment === segment ? show : { ...show, segments: show.segments.map((item) => item.id === segment.id ? titleSegment : item) };
  const application = input.universe.applications.find((item) => item.id === proposal.applicationId);
  const applied = applyTitleResult(championship, titleShow, titleSegment, proposal.selectedDecision, input.knownWorkers ?? [], {
    sourceResultId: proposal.applicationId,
    runningOrderPosition: application?.runningOrderPosition,
  });
  const timestamp = now();
  return {
    shows: input.shows.map((item) => item.id === show.id ? applied.show : item),
    championships: { championships: input.championships.championships.map((item) => item.id === championship.id ? applied.championship : item) },
    universe: {
      ...input.universe,
      championshipProposals: input.universe.championshipProposals.map((item) => item.id === proposal.id ? { ...item, status: "Confirmed", confirmedAt: timestamp } : item),
      audit: [audit(proposal.applicationId, "Championship Confirmed", `${proposal.championshipName}: ${proposal.selectedDecision} confirmed from the Wrestling Sim result.`), ...input.universe.audit],
    },
  };
}

export function updateCompetitionProposal(universe: ResultConsequenceUniverse, proposalId: string, decision: "Decision" | "Draw" | "No Contest" | "Cancelled" | "Deferred"): ResultConsequenceUniverse {
  return {
    ...universe,
    competitionProposals: universe.competitionProposals.map((proposal) => proposal.id === proposalId ? {
      ...proposal,
      resultType: decision === "Deferred" ? proposal.resultType : decision,
      status: decision === "Deferred" ? "Deferred" : decision === "Decision" && !proposal.proposedWinnerParticipantId ? "Blocked" : "Pending",
    } : proposal),
    audit: decision === "Deferred" ? [audit(universe.competitionProposals.find((proposal) => proposal.id === proposalId)?.applicationId ?? "", "Competition Deferred", "Competition consequence deferred for explicit later review."), ...universe.audit] : universe.audit,
  };
}

export function confirmCompetitionConsequence(input: {
  universe: ResultConsequenceUniverse;
  proposalId: string;
  competitions: CompetitionUniverse;
}): { universe: ResultConsequenceUniverse; competitions: CompetitionUniverse } {
  const proposal = input.universe.competitionProposals.find((item) => item.id === input.proposalId);
  if (!proposal || proposal.status === "Confirmed") throw new Error("Choose a pending competition proposal.");
  if (proposal.resultType === "Decision" && !proposal.proposedWinnerParticipantId) throw new Error("Resolve the competition winner identity before confirmation.");
  const competition = input.competitions.competitions.find((item) => item.id === proposal.competitionId);
  if (!competition) throw new Error("The linked competition could not be found.");
  const scoreText = proposal.resultType === "No Contest" ? "No Contest confirmed from Wrestling Sim." : `${proposal.finalWinner} result confirmed from Wrestling Sim.`;
  const next = recordCompetitionResult(competition, proposal.fixtureId, proposal.resultType, proposal.proposedWinnerParticipantId, scoreText, { sourceResultId: proposal.applicationId, winnerSubmissions: proposal.winnerSubmissions, loserSubmissions: proposal.loserSubmissions });
  if (next === competition || JSON.stringify(next.fixtures) === JSON.stringify(competition.fixtures)) throw new Error("The competition result could not be applied. Review the fixture, winner identity, and format rules.");
  const timestamp = now();
  return {
    competitions: { competitions: input.competitions.competitions.map((item) => item.id === competition.id ? next : item) },
    universe: {
      ...input.universe,
      competitionProposals: input.universe.competitionProposals.map((item) => item.id === proposal.id ? { ...item, status: "Confirmed", confirmedAt: timestamp } : item),
      audit: [audit(proposal.applicationId, "Competition Confirmed", `${proposal.competitionName} ${proposal.roundLabel}: ${proposal.resultType} confirmed.`), ...input.universe.audit],
    },
  };
}

export function resolveFutureConflict(universe: ResultConsequenceUniverse, conflictId: string, note: string): ResultConsequenceUniverse {
  if (!note.trim()) throw new Error("Record how the future booking conflict was handled.");
  const conflict = universe.futureConflicts.find((item) => item.id === conflictId);
  if (!conflict) return universe;
  return {
    ...universe,
    futureConflicts: universe.futureConflicts.map((item) => item.id === conflictId ? { ...item, resolved: true, resolutionNote: note.trim() } : item),
    audit: [audit("", "Conflict Resolved", `${conflict.futureShowName} · ${conflict.futureSegmentTitle}: ${note.trim()}`), ...universe.audit],
  };
}

export function useGroundedPrompt(universe: ResultConsequenceUniverse, promptId: string, showId: string, segmentId: string): ResultConsequenceUniverse {
  const prompt = universe.prompts.find((item) => item.id === promptId);
  if (!prompt) return universe;
  return {
    ...universe,
    prompts: universe.prompts.map((item) => item.id === promptId ? { ...item, usedShowId: showId, usedSegmentId: segmentId } : item),
    audit: [audit("", "Prompt Used", `${prompt.title} linked to ${showId}:${segmentId}.`), ...universe.audit],
  };
}

export function dismissGroundedPrompt(universe: ResultConsequenceUniverse, promptId: string): ResultConsequenceUniverse {
  const prompt = universe.prompts.find((item) => item.id === promptId);
  if (!prompt) return universe;
  return {
    ...universe,
    prompts: universe.prompts.map((item) => item.id === promptId ? { ...item, dismissed: true } : item),
    audit: [audit("", "Prompt Dismissed", prompt.title), ...universe.audit],
  };
}
