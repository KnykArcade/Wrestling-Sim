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
  };
}

function normalizeCompetition(value: unknown, sequence: number): Competition | null {
  if (!isRecord(value) || typeof value.name !== "string") return null;
  const fallback = createCompetition(sequence);
  const kinds: CompetitionKind[] = ["Tournament", "Cup", "League", "Classic", "Custom"];
  const formats: CompetitionFormat[] = ["Single Elimination", "Round Robin", "Double Round Robin", "Round Robin + Final"];
  const participantTypes: CompetitionParticipantType[] = ["Singles", "Tag Team", "Trios", "Custom"];
  const statuses: CompetitionStatus[] = ["Planning", "Active", "Completed", "Archived"];
  const participantType = participantTypes.includes(value.participantType as CompetitionParticipantType) ? value.participantType as CompetitionParticipantType : fallback.participantType;
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
    format: formats.includes(value.format as CompetitionFormat) ? value.format as CompetitionFormat : fallback.format,
    participantType,
    status: statuses.includes(value.status as CompetitionStatus) ? value.status as CompetitionStatus : fallback.status,
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
    expectedParticipantCount: Math.max(0, finiteNumber(value.expectedParticipantCount, fallback.expectedParticipantCount)),
    participants,
    fixtures,
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
  return {
    competitions: competitions.filter((competition) => {
      if (seen.has(competition.id)) return false;
      seen.add(competition.id);
      return true;
    }),
  };
}

export function loadCompetitionUniverse(storage: Pick<Storage, "getItem">): CompetitionUniverse {
  const stored = storage.getItem(COMPETITION_STORAGE_KEY);
  if (!stored) return emptyCompetitionUniverse();
  try { return parseCompetitionUniverse(JSON.parse(stored) as unknown); } catch { return emptyCompetitionUniverse(); }
}

export function saveCompetitionUniverse(storage: Pick<Storage, "setItem">, universe: CompetitionUniverse): void {
  storage.setItem(COMPETITION_STORAGE_KEY, JSON.stringify(universe));
}
