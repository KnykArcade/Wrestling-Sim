import { applyTitleResult, titleMatchesSegment } from "../championships/model";
import type { Championship, ChampionshipUniverse, TitleResultDecision } from "../championships/types";
import { buildCompetitionStandings, recordCompetitionResult } from "../competitions/model";
import type { Competition, CompetitionParticipant, CompetitionUniverse } from "../competitions/types";
import { activeResolutionAttempt } from "../matchResolution/engine";
import type { MatchResolutionRecord } from "../matchResolution/types";
import { createPlannerId, touchShow } from "../planner/model";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import type { MatchEngineProfile } from "../matchEngine/types";
import type {
  ChampionshipConsequenceProposal,
  CompetitionConsequenceProposal,
  ConditionChange,
  ConsequenceAuditEntry,
  ConsequenceSnapshot,
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
    settings: { activeTab: "overview", selectedApplicationId: "", selectedWorkerKey: "" },
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
    momentum: 0,
    health: profile?.health ?? 100,
    fatigue: 0,
    injuryStatus: "Healthy",
    injuryNote: "",
    matchHistory: [],
    updatedAt: now(),
  };
}

function updateStreak(record: StandaloneWorkerRecord, result: "W" | "L" | "D" | "NC") {
  return record.currentStreakType === result
    ? { type: result, count: record.currentStreakCount + 1 }
    : { type: result, count: 1 };
}

function injuryFromIncident(incident: string): { status: StandaloneWorkerRecord["injuryStatus"]; note: string; healthPenalty: number } {
  const normalized = normalize(incident);
  if (normalized.includes("major execution mistake")) return { status: "Injured", note: incident, healthPenalty: 8 };
  if (normalized.includes("visible botch")) return { status: "Minor Concern", note: incident, healthPenalty: 3 };
  return { status: "Healthy", note: "", healthPenalty: 0 };
}

function rankingDelta(result: "W" | "L" | "D" | "NC", matchScore: number, winProbability: number, performanceLeader: boolean): number {
  const quality = Math.max(0, matchScore - 60) / 20;
  if (result === "W") return round(3 + quality + (winProbability < 0.5 ? 2 : 0) + (performanceLeader ? 0.5 : 0));
  if (result === "L") return round(-1 + quality * 0.4 + (performanceLeader ? 1.25 : 0));
  if (result === "D") return round(1 + quality * 0.5);
  return 0;
}

function momentumDelta(result: "W" | "L" | "D" | "NC", matchScore: number, performanceLeader: boolean, upset: boolean): number {
  const quality = matchScore >= 85 ? 2 : matchScore >= 75 ? 1 : 0;
  if (result === "W") return 4 + quality + (upset ? 3 : 0) + (performanceLeader ? 1 : 0);
  if (result === "L") return -2 + quality + (performanceLeader ? 2 : 0);
  if (result === "D") return 1 + quality;
  return 0;
}

function conditionForWorker(input: {
  existing: StandaloneWorkerRecord;
  workerResult: ReturnType<typeof activeResolutionAttempt> extends infer _ ? any : never;
  resultCode: "W" | "L" | "D" | "NC";
  finalResult: NonNullable<ReturnType<typeof activeResolutionAttempt>>["finalResult"];
  performanceLeader: boolean;
  upset: boolean;
}): { record: StandaloneWorkerRecord; change: ConditionChange } {
  const { existing, workerResult, resultCode, finalResult, performanceLeader, upset } = input;
  if (!finalResult) throw new Error("A finalized result is required.");
  const fatigueGain = round(finalResult.actualDurationMinutes * 0.7 + workerResult.staminaUsed * 1.8 + Math.max(0, workerResult.actualPace - 3) * 0.8);
  const baseHealthLoss = finalResult.matchScore >= 90 ? 2.5 : finalResult.matchScore >= 80 ? 1.7 : finalResult.matchScore >= 70 ? 1 : 0.5;
  const staminaPenalty = workerResult.staminaStatus === "FAIL" ? 2.5 : workerResult.staminaStatus === "WARNING" ? 1 : 0;
  const incident = injuryFromIncident(workerResult.incident);
  const healthAfter = round(clamp(existing.health - baseHealthLoss - staminaPenalty - incident.healthPenalty, 0, 100));
  const fatigueAfter = round(clamp(existing.fatigue + fatigueGain, 0, 100));
  const momentumChange = momentumDelta(resultCode, finalResult.matchScore, performanceLeader, upset);
  const rankingChange = rankingDelta(resultCode, finalResult.matchScore, workerResult.winProbability, performanceLeader);
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
    momentum: round(clamp(existing.momentum + momentumChange, -100, 100)),
    health: healthAfter,
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
    fatigueBefore: existing.fatigue,
    fatigueAfter,
    momentumBefore: existing.momentum,
    momentumAfter: next.momentum,
    rankingPointsBefore: existing.rankingPoints,
    rankingPointsAfter: next.rankingPoints,
    injuryStatus: next.injuryStatus,
    explanation: [
      `${resultCode === "W" ? "Win" : resultCode === "L" ? "Loss" : resultCode === "D" ? "Draw" : "No contest"} changed momentum by ${momentumChange >= 0 ? "+" : ""}${momentumChange}.`,
      `Match quality changed ranking points by ${rankingChange >= 0 ? "+" : ""}${rankingChange}.`,
      `${finalResult.actualDurationMinutes.toFixed(2)} minutes and ${workerResult.staminaUsed} stamina cost added ${fatigueGain.toFixed(1)} fatigue.`,
      `Health changed by ${(healthAfter - existing.health).toFixed(1)}.`,
      incident.note || "No match incident produced an injury flag.",
    ],
  };
  return { record: next, change };
}

function applyRankingPositions(records: StandaloneWorkerRecord[]): StandaloneWorkerRecord[] {
  const ordered = [...records].sort((left, right) => right.rankingPoints - left.rankingPoints || right.wins - left.wins || left.losses - right.losses || left.workerName.localeCompare(right.workerName));
  const positions = new Map(ordered.map((record, index) => [record.workerKey, index + 1]));
  return records.map((record) => ({
    ...record,
    previousRankingPosition: record.rankingPosition,
    rankingPosition: positions.get(record.workerKey) ?? 0,
  }));
}

function applyTeamRankingPositions(records: StandaloneTeamRecord[]): StandaloneTeamRecord[] {
  const ordered = [...records].sort((left, right) => right.rankingPoints - left.rankingPoints || right.wins - left.wins || left.losses - right.losses || left.teamName.localeCompare(right.teamName));
  const positions = new Map(ordered.map((record, index) => [record.teamKey, index + 1]));
  return records.map((record) => ({ ...record, previousRankingPosition: record.rankingPosition, rankingPosition: positions.get(record.teamKey) ?? 0 }));
}

function updateTeamRecords(
  existingRecords: StandaloneTeamRecord[],
  resolution: MatchResolutionRecord,
  show: PlannedShow,
  segment: PlannedSegment,
): StandaloneTeamRecord[] {
  const attempt = activeResolutionAttempt(resolution);
  if (!attempt?.finalResult || !attempt.engineResult.teamResults?.length) return existingRecords;
  const winnerTeamId = attempt.finalResult.winnerTeamId || attempt.engineResult.winnerTeamId;
  let records = [...existingRecords];
  for (const team of attempt.engineResult.teamResults) {
    const result: "W" | "L" = team.id === winnerTeamId ? "W" : "L";
    const existing = records.find((record) => record.teamKey === team.id) ?? {
      teamKey: team.id, teamName: team.name, memberKeys: team.memberKeys, memberNames: team.memberNames,
      wins: 0, losses: 0, draws: 0, noContests: 0, rankingPoints: 0, rankingPosition: 0,
      previousRankingPosition: 0, momentum: 0, matchHistory: [], updatedAt: now(),
    };
    const quality = Math.max(0, attempt.finalResult.matchScore - 60) / 20;
    const rankingDelta = result === "W" ? 3 + quality + (team.winProbability < 0.5 ? 2 : 0) : -1 + quality * 0.4;
    const history = {
      id: createPlannerId(), resolutionRecordId: resolution.id, resolutionAttemptId: attempt.id,
      showId: show.id, showName: show.name, showDate: show.date, segmentId: segment.id, segmentTitle: segment.title,
      opponentTeamNames: attempt.engineResult.teamResults.filter((candidate) => candidate.id !== team.id).map((candidate) => candidate.name),
      result, finishDescription: attempt.finalResult.finishDescription, matchScore: attempt.finalResult.matchScore,
      occurredAt: attempt.finalResult.finalizedAt,
    } as const;
    const next: StandaloneTeamRecord = {
      ...existing, teamName: team.name, memberKeys: team.memberKeys, memberNames: team.memberNames,
      wins: existing.wins + (result === "W" ? 1 : 0), losses: existing.losses + (result === "L" ? 1 : 0),
      rankingPoints: round(existing.rankingPoints + rankingDelta),
      momentum: round(clamp(existing.momentum + (result === "W" ? 5 : -2), -100, 100)),
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
    description: `${final.winnerName} defeated ${final.loserName}`,
    rating: final.matchScore,
    winner: final.winnerName,
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
        happenedAsPlanned: segment.plannedWinner ? matchNames(segment.plannedWinner, final.winnerName) : null,
        happenedAsPlannedDetail: segment.plannedWinner ? matchNames(segment.plannedWinner, final.winnerName) ? "Yes" : "No" : "Unresolved",
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

function championshipProposal(applicationId: string, show: PlannedShow, segment: PlannedSegment, finalWinner: string, winnerMemberNames: string[], universe: ChampionshipUniverse): ChampionshipConsequenceProposal | null {
  const championship = findChampionship(segment, universe);
  if (!championship) return null;
  const championEntering = segment.championEntering || championship.currentChampions.map((champion) => champion.name).join(" & ");
  const challenger = segment.challenger || segment.workers.map((worker) => worker.name).find((name) => !matchNames(championEntering, name)) || "";
  let suggestedDecision: TitleResultDecision = "Unresolved";
  let reason = "The winner could not be mapped clearly to the champion or challenger.";
  if (championship.status === "Vacant" || championship.currentChampions.length === 0) {
    suggestedDecision = "Changed Hands";
    reason = `${championship.name} is vacant, so the final winner can begin a new reign.`;
  } else if (championEntering && (matchNames(finalWinner, championEntering) || winnerMemberNames.every((name) => matchNames(championEntering, name)))) {
    suggestedDecision = "Retained";
    reason = `${finalWinner} matches the champion entering the match.`;
  } else if ((challenger && matchNames(finalWinner, challenger)) || winnerMemberNames.some((name) => matchNames(challenger, name))) {
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
    suggestedDecision,
    selectedDecision: suggestedDecision,
    status: suggestedDecision === "Unresolved" ? "Blocked" : "Pending",
    reason,
    preview: suggestedDecision === "Retained"
      ? [`${championEntering} remains champion.`, `Defense count increases from ${championship.defenses} to ${championship.defenses + 1}.`]
      : suggestedDecision === "Changed Hands"
        ? [`Current reign for ${championEntering || "the vacant title"} ends or remains vacant.`, `${finalWinner} begins a new reign dated ${show.date}.`, "Defense count resets to 0."]
        : ["No title history will change until the ambiguity is resolved."],
    confirmedAt: "",
  };
}

function participantForWinner(competition: Competition, winnerNames: string[]): CompetitionParticipant[] {
  return competition.participants.filter((participant) => winnerNames.some((winnerName) => [participant.name, ...participant.memberNames].some((name) => matchNames(name, winnerName))));
}

function competitionProposal(applicationId: string, show: PlannedShow, segment: PlannedSegment, finalWinner: string, winnerMemberNames: string[], universe: CompetitionUniverse): CompetitionConsequenceProposal | null {
  if (!segment.competitionId || !segment.competitionFixtureId) return null;
  const competition = universe.competitions.find((item) => item.id === segment.competitionId);
  const fixture = competition?.fixtures.find((item) => item.id === segment.competitionFixtureId);
  if (!competition || !fixture) return null;
  const candidates = participantForWinner(competition, [finalWinner, ...winnerMemberNames]).filter((participant) => [fixture.participantAId, fixture.participantBId].includes(participant.id));
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
  const facts = [
    `${final.winnerName} defeated ${final.loserName}.`,
    final.finishDescription,
    `Match score: ${final.matchScore.toFixed(1)} (${final.starRating} stars).`,
    attempt.engineResult.performanceLeaderName === final.loserName ? `${final.loserName} was the performance leader despite losing.` : `${attempt.engineResult.performanceLeaderName} was the performance leader.`,
  ];
  const base = (kind: GroundedBookingPrompt["kind"], title: string, suggestedPurpose: string): GroundedBookingPrompt => ({
    id: createPlannerId(), kind, title, factualBasis: facts, suggestedPurpose, sourceShowId: show.id, sourceSegmentId: segment.id, dismissed: false, usedShowId: "", usedSegmentId: "",
  });
  const prompts = [
    base("Winner Celebration", `${final.winnerName} result reaction`, `Present ${final.winnerName}'s response to the official victory.`),
    base("Loser Reaction", `${final.loserName} responds to the loss`, `Record how ${final.loserName} reacts to the official defeat.`),
    base("Rematch Review", `Review whether ${final.winnerName} vs ${final.loserName} should continue`, "Evaluate a rematch only after considering rankings, finish, match quality, and future results."),
  ];
  if (!final.acceptedEngineResult) prompts.push(base("Disputed Finish", "Booker override consequence review", `Decide whether the explicit override should be acknowledged creatively. The engine originally selected ${attempt.engineResult.winnerName}.`));
  if (segment.championship) prompts.push(base("Championship Reaction", `${segment.championship} result reaction`, "Create a response to the confirmed championship consequence after the title decision is applied."));
  if (segment.competitionId) prompts.push(base("Competition Advancement", `${segment.competitionRoundLabel || "Competition"} result reaction`, "Create a response after the competition result is explicitly confirmed."));
  if (attempt.workerResults.some((worker) => worker.incident)) prompts.push(base("Incident Follow-Up", "Review the recorded match incident", "Decide whether the recorded incident requires a grounded medical or storyline follow-up."));
  return prompts;
}

export function applyCoreResultConsequences(input: {
  universe: ResultConsequenceUniverse;
  resolution: MatchResolutionRecord;
  shows: PlannedShow[];
  profiles: MatchEngineProfile[];
  championships: ChampionshipUniverse;
  competitions: CompetitionUniverse;
}): { universe: ResultConsequenceUniverse; shows: PlannedShow[] } {
  const attempt = activeResolutionAttempt(input.resolution);
  if (!attempt?.finalResult || (attempt.status !== "Accepted" && attempt.status !== "Overridden")) throw new Error("Accept or override the official match result before applying consequences.");
  if (input.universe.applications.some((application) => application.resolutionAttemptId === attempt.id && application.status === "Applied")) throw new Error("This official result has already been applied. Consequence application is idempotent.");
  const show = input.shows.find((item) => item.id === input.resolution.showId);
  const segment = show?.segments.find((item) => item.id === input.resolution.segmentId);
  if (!show || !segment) throw new Error("The planned show or segment linked to this result could not be found.");
  const applicationId = createPlannerId();
  const before: ConsequenceSnapshot = {
    workerRecords: structuredClone(input.universe.workerRecords),
    teamRecords: structuredClone(input.universe.teamRecords),
    shows: structuredClone(input.shows),
    championships: structuredClone(input.championships),
    competitions: structuredClone(input.competitions),
  };

  let records = [...input.universe.workerRecords];
  const changes: ConditionChange[] = [];
  const historyEntries: StandaloneMatchHistoryEntry[] = [];
  for (const workerResult of attempt.workerResults) {
    const profile = input.profiles.find((item) => item.workerKey === workerResult.workerKey) ?? null;
    const existing = records.find((item) => item.workerKey === workerResult.workerKey) ?? defaultWorkerRecord(workerResult.workerKey, workerResult.workerId, workerResult.workerName, profile);
    const winningKeys = attempt.finalResult.winnerMemberKeys?.length ? attempt.finalResult.winnerMemberKeys : [attempt.finalResult.winnerKey];
    const resultCode: "W" | "L" = winningKeys.includes(workerResult.workerKey) ? "W" : "L";
    const isLeader = workerResult.workerKey === attempt.engineResult.performanceLeaderKey;
    const condition = conditionForWorker({ existing, workerResult, resultCode, finalResult: attempt.finalResult, performanceLeader: isLeader, upset: attempt.engineResult.upset && resultCode === "W" });
    const opponents = attempt.workerResults.filter((item) => winningKeys.includes(item.workerKey) !== winningKeys.includes(workerResult.workerKey));
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
      winnerName: attempt.finalResult.winnerName,
      finishDescription: attempt.finalResult.finishDescription,
      durationMinutes: attempt.finalResult.actualDurationMinutes,
      matchScore: attempt.finalResult.matchScore,
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
    changes.push(condition.change);
    historyEntries.push(history);
  }
  records = applyRankingPositions(records);
  const teamRecords = updateTeamRecords(input.universe.teamRecords, input.resolution, show, segment);
  const updatedShow = applyResultToShow(show, segment.id, input.resolution);
  const shows = input.shows.map((item) => item.id === show.id ? updatedShow : item);
  const refreshedSegment = updatedShow.segments.find((item) => item.id === segment.id)!;
  const winningNames = attempt.finalResult.winnerMemberNames?.length ? attempt.finalResult.winnerMemberNames : [attempt.finalResult.winnerName];
  const losingNames = attempt.finalResult.loserNames?.length ? attempt.finalResult.loserNames : [attempt.finalResult.loserName];
  const conflicts = futureConflicts(updatedShow, refreshedSegment, attempt.finalResult.winnerName, attempt.finalResult.loserName, winningNames, losingNames, shows);
  const prompts = groundedPrompts(updatedShow, refreshedSegment, input.resolution);
  const winnerMemberNames = attempt.finalResult.winnerMemberNames?.length ? attempt.finalResult.winnerMemberNames : [attempt.finalResult.winnerName];
  const titleProposal = championshipProposal(applicationId, updatedShow, refreshedSegment, attempt.finalResult.winnerName, winnerMemberNames, input.championships);
  const competition = competitionProposal(applicationId, updatedShow, refreshedSegment, attempt.finalResult.winnerName, winnerMemberNames, input.competitions);
  const application: ResultConsequenceApplication = {
    id: applicationId,
    resolutionRecordId: input.resolution.id,
    resolutionAttemptId: attempt.id,
    showId: show.id,
    showName: show.name,
    segmentId: segment.id,
    segmentTitle: segment.title,
    finalResult: attempt.finalResult,
    engineAttempt: attempt,
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
  return {
    shows,
    universe: {
      ...input.universe,
      workerRecords: records,
      teamRecords,
      applications: [application, ...input.universe.applications],
      championshipProposals: titleProposal ? [titleProposal, ...input.universe.championshipProposals] : input.universe.championshipProposals,
      competitionProposals: competition ? [competition, ...input.universe.competitionProposals] : input.universe.competitionProposals,
      futureConflicts: [...conflicts, ...input.universe.futureConflicts],
      prompts: [...prompts, ...input.universe.prompts],
      audit: [audit(application.id, "Core Consequences Applied", `${attempt.finalResult.winnerName} defeated ${attempt.finalResult.loserName}; individual and team records, rankings, momentum, condition, history, and future-plan review were updated.`), ...input.universe.audit],
      settings: { ...input.universe.settings, selectedApplicationId: application.id },
    },
  };
}

export function rollbackCoreResultConsequences(universe: ResultConsequenceUniverse, applicationId: string, reason: string): { universe: ResultConsequenceUniverse; shows: PlannedShow[]; championships: ChampionshipUniverse; competitions: CompetitionUniverse } {
  const application = universe.applications.find((item) => item.id === applicationId);
  if (!application || application.status !== "Applied") throw new Error("Choose an applied consequence record to roll back.");
  if (!reason.trim()) throw new Error("Record why the applied result consequences are being rolled back.");
  const title = universe.championshipProposals.find((proposal) => proposal.applicationId === applicationId);
  const competition = universe.competitionProposals.find((proposal) => proposal.applicationId === applicationId);
  if (title?.status === "Confirmed" || competition?.status === "Confirmed") throw new Error("Roll back confirmed championship or competition decisions through an explicit correction before restoring the core result snapshot.");
  const timestamp = now();
  return {
    shows: structuredClone(application.before.shows),
    championships: structuredClone(application.before.championships),
    competitions: structuredClone(application.before.competitions),
    universe: {
      ...universe,
      workerRecords: structuredClone(application.before.workerRecords),
      teamRecords: structuredClone(application.before.teamRecords ?? []),
      applications: universe.applications.map((item) => item.id === applicationId ? { ...item, status: "Rolled Back", rolledBackAt: timestamp, rollbackReason: reason.trim() } : item),
      championshipProposals: universe.championshipProposals.filter((proposal) => proposal.applicationId !== applicationId),
      competitionProposals: universe.competitionProposals.filter((proposal) => proposal.applicationId !== applicationId),
      futureConflicts: universe.futureConflicts.filter((conflict) => !application.futureConflictIds.includes(conflict.id)),
      prompts: universe.prompts.filter((prompt) => !application.promptIds.includes(prompt.id)),
      audit: [audit(applicationId, "Core Consequences Rolled Back", reason.trim()), ...universe.audit],
    },
  };
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
  const applied = applyTitleResult(championship, titleShow, titleSegment, proposal.selectedDecision, input.knownWorkers ?? []);
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
  const next = recordCompetitionResult(competition, proposal.fixtureId, proposal.resultType, proposal.proposedWinnerParticipantId, `${proposal.finalWinner} result confirmed from Wrestling Sim.`);
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
