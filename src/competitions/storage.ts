import { createCompetition, createCompetitionParticipant, emptyCompetitionUniverse } from "./model";
import type {
  Competition,
  CompetitionFixture,
  CompetitionFormat,
  CompetitionKind,
  CompetitionParticipant,
  CompetitionParticipantType,
  CompetitionStatus,
  CompetitionUniverse,
  CompetitionSeries,
  CompetitionActionItem,
} from "./types";

export const COMPETITION_STORAGE_KEY = "tew-story-tracker:competitions:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeParticipant(value: unknown, participantType: CompetitionParticipantType): CompetitionParticipant | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) return null;
  const fallback = createCompetitionParticipant(value.name, participantType);
  const status = value.status === "Eliminated" || value.status === "Withdrawn" || value.status === "Champion" ? value.status : "Active";
  return {
    id: text(value.id, fallback.id),
    name: value.name,
    memberNames: Array.isArray(value.memberNames) ? value.memberNames.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : fallback.memberNames,
    seed: Math.max(0, finiteNumber(value.seed, 0)),
    status,
    source: value.source === "tew" ? "tew" : "manual",
    sourceWorkerIds: Array.isArray(value.sourceWorkerIds) ? value.sourceWorkerIds.filter((item): item is string => typeof item === "string") : [],
    companyId: text(value.companyId),
    companyName: text(value.companyName),
    groupId: text(value.groupId),
    notes: text(value.notes),
  };
}

function normalizeFixture(value: unknown): CompetitionFixture | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const statusValues = ["Unscheduled", "Scheduled", "Completed", "Bye", "Cancelled"];
  const resultValues = ["", "Decision", "Draw", "Bye", "No Contest", "Cancelled"];
  return {
    id: value.id,
    roundNumber: Math.max(1, finiteNumber(value.roundNumber, 1)),
    roundLabel: text(value.roundLabel, "Round 1"),
    bracketPosition: Math.max(1, finiteNumber(value.bracketPosition, 1)),
    participantAId: text(value.participantAId),
    participantBId: text(value.participantBId),
    sourceFixtureAId: text(value.sourceFixtureAId),
    sourceFixtureBId: text(value.sourceFixtureBId),
    stageId: text(value.stageId),
    stageType: value.stageType === "Group" || value.stageType === "Knockout" ? value.stageType : "League",
    groupId: text(value.groupId),
    sourceGroupAId: text(value.sourceGroupAId),
    sourceGroupARank: Math.max(0, finiteNumber(value.sourceGroupARank, 0)),
    sourceGroupBId: text(value.sourceGroupBId),
    sourceGroupBRank: Math.max(0, finiteNumber(value.sourceGroupBRank, 0)),
    status: statusValues.includes(text(value.status)) ? value.status as CompetitionFixture["status"] : "Unscheduled",
    resultType: resultValues.includes(text(value.resultType)) ? value.resultType as CompetitionFixture["resultType"] : "",
    winnerId: text(value.winnerId),
    loserId: text(value.loserId),
    scoreText: text(value.scoreText),
    scheduledShowId: text(value.scheduledShowId),
    plannedSegmentId: text(value.plannedSegmentId),
    completedAt: text(value.completedAt),
    notes: text(value.notes),
    sourceResultId: text(value.sourceResultId),
    submissionWinnerCount: Math.max(0, finiteNumber(value.submissionWinnerCount, 0)),
    submissionLoserCount: Math.max(0, finiteNumber(value.submissionLoserCount, 0)),
    matchRating: typeof value.matchRating === "number" && Number.isFinite(value.matchRating) ? value.matchRating : null,
  };
}

function normalizeCompetition(value: unknown, sequence: number): Competition | null {
  if (!isRecord(value) || typeof value.name !== "string") return null;
  const fallback = createCompetition(sequence);
  const kinds: CompetitionKind[] = ["Tournament", "Cup", "League", "Classic", "Custom"];
  const formats: CompetitionFormat[] = ["Single Elimination", "Round Robin", "Double Round Robin", "Round Robin + Final", "Group Stage + Knockout"];
  const participantTypes: CompetitionParticipantType[] = ["Singles", "Tag Team", "Trios", "Custom"];
  const statuses: CompetitionStatus[] = ["Planning", "Active", "Completed", "Archived"];
  const participantType = participantTypes.includes(value.participantType as CompetitionParticipantType) ? value.participantType as CompetitionParticipantType : fallback.participantType;
  const format = formats.includes(value.format as CompetitionFormat) ? value.format as CompetitionFormat : fallback.format;
  const participants = Array.isArray(value.participants)
    ? value.participants.map((item) => normalizeParticipant(item, participantType)).filter((item): item is CompetitionParticipant => item !== null)
    : [];
  const fixtures = Array.isArray(value.fixtures)
    ? value.fixtures.map(normalizeFixture).filter((item): item is CompetitionFixture => item !== null)
    : [];
  const pointsRules = isRecord(value.pointsRules) ? value.pointsRules : {};
  return {
    ...fallback,
    id: text(value.id, fallback.id),
    name: value.name,
    kind: kinds.includes(value.kind as CompetitionKind) ? value.kind as CompetitionKind : fallback.kind,
    format,
    participantType,
    status: statuses.includes(value.status as CompetitionStatus) ? value.status as CompetitionStatus : fallback.status,
    seriesId: text(value.seriesId),
    companyId: text(value.companyId),
    companyName: text(value.companyName, text(value.company)),
    company: text(value.company),
    brand: text(value.brand),
    startDate: text(value.startDate, fallback.startDate),
    endDate: text(value.endDate),
    editionLabel: text(value.editionLabel),
    prize: text(value.prize),
    trophyName: text(value.trophyName),
    traditions: text(value.traditions),
    championPresentation: text(value.championPresentation),
    linkedChampionshipId: text(value.linkedChampionshipId),
    linkedStorylineId: text(value.linkedStorylineId),
    championParticipantId: text(value.championParticipantId),
    runnerUpParticipantId: text(value.runnerUpParticipantId),
    pointsRules: {
      win: finiteNumber(pointsRules.win, fallback.pointsRules.win),
      draw: finiteNumber(pointsRules.draw, fallback.pointsRules.draw),
      loss: finiteNumber(pointsRules.loss, fallback.pointsRules.loss),
      noContest: finiteNumber(pointsRules.noContest, fallback.pointsRules.noContest),
    },
    submissionTiebreak: value.submissionTiebreak === "Submission Differential" || value.submissionTiebreak === "Disabled" ? value.submissionTiebreak : "Unresolved",
    committeeDecisionParticipantId: text(value.committeeDecisionParticipantId),
    unresolvedTieParticipantIds: Array.isArray(value.unresolvedTieParticipantIds) ? value.unresolvedTieParticipantIds.filter((item): item is string => typeof item === "string") : [],
    topAdvanceCount: Math.max(1, finiteNumber(value.topAdvanceCount, fallback.topAdvanceCount)),
    groupCount: Math.max(2, finiteNumber(value.groupCount, fallback.groupCount)),
    qualifiersPerGroup: Math.max(1, finiteNumber(value.qualifiersPerGroup, fallback.qualifiersPerGroup)),
    groupAssignmentMode: value.groupAssignmentMode === "Manual" ? "Manual" : "Seeded",
    tiebreakOrder: Array.isArray(value.tiebreakOrder) ? value.tiebreakOrder.filter((item): item is Competition["tiebreakOrder"][number] => item === "Head to Head" || item === "Submission Differential" || item === "Committee Decision" || item === "Playoff") : fallback.tiebreakOrder,
    expectedParticipantCount: Math.max(0, finiteNumber(value.expectedParticipantCount, fallback.expectedParticipantCount)),
    participants,
    groups: Array.isArray(value.groups) ? value.groups.filter(isRecord).map((group, index) => ({ id: text(group.id, `group-${index + 1}`), name: text(group.name, `Group ${index + 1}`), order: Math.max(1, finiteNumber(group.order, index + 1)), participantIds: Array.isArray(group.participantIds) ? group.participantIds.filter((item): item is string => typeof item === "string") : [], qualifierCount: Math.max(1, finiteNumber(group.qualifierCount, fallback.qualifiersPerGroup)) })) : [],
    stages: Array.isArray(value.stages) ? value.stages.filter(isRecord).map((stage, index) => ({ id: text(stage.id, `stage-${index + 1}`), name: text(stage.name, `Stage ${index + 1}`), order: Math.max(1, finiteNumber(stage.order, index + 1)), type: stage.type === "Group" || stage.type === "Knockout" ? stage.type : "League", groupIds: Array.isArray(stage.groupIds) ? stage.groupIds.filter((item): item is string => typeof item === "string") : [] })) : [],
    fixtures: fixtures.map((fixture) => ({ ...fixture, stageType: format === "Single Elimination" || format === "Round Robin + Final" && fixture.roundLabel === "Final" ? "Knockout" : fixture.stageType, stageId: fixture.stageId || (format === "Single Elimination" ? "knockout" : format === "Round Robin + Final" && fixture.roundLabel === "Final" ? "final" : "league") })),
    audit: Array.isArray(value.audit) ? value.audit.filter(isRecord).map((entry, index) => ({ id: text(entry.id, `audit-${index + 1}`), action: text(entry.action), detail: text(entry.detail), fixtureId: text(entry.fixtureId), sourceResultId: text(entry.sourceResultId), createdAt: text(entry.createdAt, fallback.createdAt) })) : [],
    notes: text(value.notes),
    createdAt: text(value.createdAt, fallback.createdAt),
    updatedAt: text(value.updatedAt, fallback.updatedAt),
  };
}

export function parseCompetitionUniverse(value: unknown): CompetitionUniverse {
  if (!isRecord(value)) return emptyCompetitionUniverse();
  const competitions = Array.isArray(value.competitions)
    ? value.competitions.map((item, index) => normalizeCompetition(item, index + 1)).filter((item): item is Competition => item !== null)
    : [];
  const seen = new Set<string>();
  const deduplicated = competitions.filter((competition) => {
      if (seen.has(competition.id)) return false;
      seen.add(competition.id);
      return true;
    });
  const series = Array.isArray(value.series) ? value.series.filter(isRecord).map((item, index): CompetitionSeries => ({
    id: text(item.id, `competition-series-${index + 1}`), name: text(item.name, `Competition Series ${index + 1}`), kind: ["Tournament", "Cup", "League", "Classic", "Custom"].includes(text(item.kind)) ? item.kind as CompetitionSeries["kind"] : "Tournament", companyId: text(item.companyId), companyName: text(item.companyName), editionIds: Array.isArray(item.editionIds) ? item.editionIds.filter((entry): entry is string => typeof entry === "string") : [], createdAt: text(item.createdAt), updatedAt: text(item.updatedAt),
  })) : [];
  const migratedSeries = [...series];
  const migratedCompetitions = deduplicated.map((competition) => {
    if (competition.seriesId && migratedSeries.some((item) => item.id === competition.seriesId)) return competition;
    const seriesId = competition.seriesId || `migrated-series:${competition.id}`;
    migratedSeries.push({ id: seriesId, name: competition.name, kind: competition.kind, companyId: competition.companyId, companyName: competition.companyName || competition.company, editionIds: [competition.id], createdAt: competition.createdAt, updatedAt: competition.updatedAt });
    return { ...competition, seriesId };
  });
  const actionQueue = Array.isArray(value.actionQueue) ? value.actionQueue.filter(isRecord).map((item, index): CompetitionActionItem => ({ id: text(item.id, `competition-action-${index + 1}`), competitionId: text(item.competitionId), fixtureId: text(item.fixtureId), type: item.type === "Ambiguous Winner" || item.type === "Participant Mismatch" || item.type === "Invalid Draw" || item.type === "Unresolved Tie" || item.type === "Missing Planned Match" ? item.type : "Participant Mismatch", message: text(item.message), status: item.status === "Resolved" ? "Resolved" : "Open", createdAt: text(item.createdAt), resolvedAt: text(item.resolvedAt) })) : [];
  return { competitions: migratedCompetitions, series: migratedSeries, actionQueue };
}

export function loadCompetitionUniverse(storage: Pick<Storage, "getItem">): CompetitionUniverse {
  const stored = storage.getItem(COMPETITION_STORAGE_KEY);
  if (!stored) return emptyCompetitionUniverse();
  try { return parseCompetitionUniverse(JSON.parse(stored) as unknown); } catch { return emptyCompetitionUniverse(); }
}

export function saveCompetitionUniverse(storage: Pick<Storage, "setItem">, universe: CompetitionUniverse): void {
  storage.setItem(COMPETITION_STORAGE_KEY, JSON.stringify(universe));
}
