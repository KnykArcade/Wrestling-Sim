import { createPlannedSegment, createPlannerId, touchShow } from "../planner/model";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import type {
  Competition,
  CompetitionFixture,
  CompetitionFormat,
  CompetitionParticipant,
  CompetitionParticipantType,
  CompetitionResultType,
  CompetitionStanding,
  CompetitionUniverse,
  CompetitionWarning,
} from "./types";

function fallbackId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createCompetitionId(prefix = "competition"): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : fallbackId(prefix);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function emptyCompetitionUniverse(): CompetitionUniverse {
  return { competitions: [] };
}

export function createCompetition(sequence = 1): Competition {
  const timestamp = new Date().toISOString();
  return {
    id: createCompetitionId(),
    name: `Untitled Competition ${sequence}`,
    kind: "Tournament",
    format: "Single Elimination",
    participantType: "Singles",
    status: "Planning",
    company: "",
    brand: "",
    startDate: today(),
    endDate: "",
    editionLabel: "",
    prize: "",
    trophyName: "",
    traditions: "",
    championPresentation: "",
    linkedChampionshipId: "",
    linkedStorylineId: "",
    championParticipantId: "",
    runnerUpParticipantId: "",
    pointsRules: { win: 2, draw: 1, loss: 0, noContest: 0 },
    participants: [],
    fixtures: [],
    notes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createCompetitionTemplate(template: "world-classic" | "world-tag-classic" | "league", sequence = 1): Competition {
  const competition = createCompetition(sequence);
  if (template === "world-classic") {
    return {
      ...competition,
      name: "PWL World Classic",
      kind: "Classic",
      format: "Single Elimination",
      participantType: "Singles",
      prize: "World Classic winner recognition and future championship positioning",
      trophyName: "PWL World Classic Trophy",
      traditions: "The reigning winner passes the ceremonial jacket to the new winner after the final. The presentation may remain respectful or launch the next rivalry if the former winner attacks after the handoff.",
      championPresentation: "Trophy presentation followed by the ceremonial World Classic jacket handoff from the previous winner.",
    };
  }
  if (template === "world-tag-classic") {
    return {
      ...competition,
      name: "PWL World Tag Classic",
      kind: "Classic",
      format: "Single Elimination",
      participantType: "Tag Team",
      prize: "World Tag Classic winner recognition and future tag-title positioning",
      trophyName: "PWL World Tag Classic Trophy",
      traditions: "The previous winning team presents the trophy and ceremonial jackets to the new winners. The presentation can establish respect, tension, or the next tag-team program.",
      championPresentation: "Trophy presentation and ceremonial jacket handoff by the previous winning team.",
    };
  }
  return {
    ...competition,
    name: "PWL League",
    kind: "League",
    format: "Round Robin",
    participantType: "Singles",
    prize: "League championship opportunity",
    trophyName: "PWL League Trophy",
    traditions: "Standings are updated after every completed league match.",
    championPresentation: "The highest-ranked competitor receives the league trophy after the final scheduled round.",
  };
}

export function touchCompetition(competition: Competition): Competition {
  return { ...competition, updatedAt: new Date().toISOString() };
}

export function createCompetitionParticipant(
  name: string,
  participantType: CompetitionParticipantType,
  options: Partial<Pick<CompetitionParticipant, "memberNames" | "source" | "sourceWorkerIds" | "seed" | "notes">> = {},
): CompetitionParticipant {
  const cleanName = name.trim();
  const defaultMembers = participantType === "Singles" && cleanName ? [cleanName] : [];
  return {
    id: createCompetitionId("participant"),
    name: cleanName,
    memberNames: options.memberNames?.filter(Boolean) ?? defaultMembers,
    seed: Math.max(0, options.seed ?? 0),
    status: "Active",
    source: options.source ?? "manual",
    sourceWorkerIds: options.sourceWorkerIds ?? [],
    notes: options.notes ?? "",
  };
}

function nextPowerOfTwo(value: number): number {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

function eliminationRoundLabel(bracketSize: number, roundNumber: number): string {
  const remaining = bracketSize / 2 ** (roundNumber - 1);
  if (remaining === 2) return "Final";
  if (remaining === 4) return "Semifinal";
  if (remaining === 8) return "Quarterfinal";
  return `Round of ${remaining}`;
}

function emptyFixture(roundNumber: number, roundLabel: string, bracketPosition: number): CompetitionFixture {
  return {
    id: createCompetitionId("fixture"),
    roundNumber,
    roundLabel,
    bracketPosition,
    participantAId: "",
    participantBId: "",
    sourceFixtureAId: "",
    sourceFixtureBId: "",
    status: "Unscheduled",
    resultType: "",
    winnerId: "",
    loserId: "",
    scoreText: "",
    scheduledShowId: "",
    plannedSegmentId: "",
    completedAt: "",
    notes: "",
  };
}

function sortedParticipants(participants: CompetitionParticipant[]): CompetitionParticipant[] {
  return [...participants]
    .filter((participant) => participant.status !== "Withdrawn")
    .sort((left, right) => {
      const leftSeed = left.seed > 0 ? left.seed : Number.MAX_SAFE_INTEGER;
      const rightSeed = right.seed > 0 ? right.seed : Number.MAX_SAFE_INTEGER;
      return leftSeed - rightSeed || left.name.localeCompare(right.name);
    });
}

function rebuildParticipantStatuses(competition: Competition): Competition {
  const eliminated = new Set<string>();
  for (const fixture of competition.fixtures) {
    if ((fixture.status === "Completed" || fixture.status === "Bye") && fixture.loserId) eliminated.add(fixture.loserId);
  }
  const final = competition.fixtures.find((fixture) => fixture.roundLabel === "Final");
  const championId = final && (final.status === "Completed" || final.status === "Bye") ? final.winnerId : "";
  const runnerUpId = final && final.status === "Completed" ? final.loserId : "";
  return {
    ...competition,
    championParticipantId: championId,
    runnerUpParticipantId: runnerUpId,
    status: championId ? "Completed" : competition.fixtures.length > 0 ? "Active" : competition.status,
    participants: competition.participants.map((participant) => ({
      ...participant,
      status: participant.status === "Withdrawn"
        ? "Withdrawn"
        : participant.id === championId
          ? "Champion"
          : eliminated.has(participant.id)
            ? "Eliminated"
            : "Active",
    })),
  };
}

function sourceResolved(fixture: CompetitionFixture | undefined): boolean {
  return Boolean(fixture && ["Completed", "Bye", "Cancelled"].includes(fixture.status));
}

export function advanceEliminationBracket(input: Competition): Competition {
  if (input.format !== "Single Elimination") return input;
  let fixtures = input.fixtures.map((fixture) => ({ ...fixture }));
  let changed = true;
  while (changed) {
    changed = false;
    fixtures = fixtures.map((fixture) => {
      if (fixture.roundNumber === 1 || fixture.status === "Completed" || fixture.status === "Bye" || fixture.status === "Cancelled") return fixture;
      const sourceA = fixtures.find((item) => item.id === fixture.sourceFixtureAId);
      const sourceB = fixtures.find((item) => item.id === fixture.sourceFixtureBId);
      const participantAId = fixture.participantAId || (sourceResolved(sourceA) ? sourceA?.winnerId ?? "" : "");
      const participantBId = fixture.participantBId || (sourceResolved(sourceB) ? sourceB?.winnerId ?? "" : "");
      const bothSourcesResolved = sourceResolved(sourceA) && sourceResolved(sourceB);
      let next = { ...fixture, participantAId, participantBId };
      if (bothSourcesResolved && Boolean(participantAId) !== Boolean(participantBId)) {
        const winnerId = participantAId || participantBId;
        next = { ...next, status: "Bye", resultType: "Bye", winnerId, loserId: "", completedAt: new Date().toISOString() };
      }
      if (
        next.participantAId !== fixture.participantAId ||
        next.participantBId !== fixture.participantBId ||
        next.status !== fixture.status ||
        next.winnerId !== fixture.winnerId
      ) changed = true;
      return next;
    });
  }
  return rebuildParticipantStatuses({ ...input, fixtures });
}

export function generateSingleElimination(competition: Competition): Competition {
  const participants = sortedParticipants(competition.participants);
  if (participants.length < 2) return touchCompetition({ ...competition, fixtures: [], championParticipantId: "", runnerUpParticipantId: "" });
  const bracketSize = nextPowerOfTwo(participants.length);
  const seededSlots: Array<CompetitionParticipant | null> = Array.from({ length: bracketSize }, () => null);
  const ordered = [...participants];
  for (let index = 0; index < Math.ceil(bracketSize / 2); index += 1) {
    seededSlots[index * 2] = ordered[index] ?? null;
    seededSlots[index * 2 + 1] = ordered[bracketSize - 1 - index] ?? null;
  }

  const fixtures: CompetitionFixture[] = [];
  let previousRound: CompetitionFixture[] = [];
  const rounds = Math.log2(bracketSize);
  for (let roundNumber = 1; roundNumber <= rounds; roundNumber += 1) {
    const roundLabel = eliminationRoundLabel(bracketSize, roundNumber);
    const fixtureCount = bracketSize / 2 ** roundNumber;
    const currentRound: CompetitionFixture[] = [];
    for (let position = 0; position < fixtureCount; position += 1) {
      let fixture = emptyFixture(roundNumber, roundLabel, position + 1);
      if (roundNumber === 1) {
        const participantA = seededSlots[position * 2];
        const participantB = seededSlots[position * 2 + 1];
        fixture.participantAId = participantA?.id ?? "";
        fixture.participantBId = participantB?.id ?? "";
        if (Boolean(fixture.participantAId) !== Boolean(fixture.participantBId)) {
          fixture = {
            ...fixture,
            status: "Bye",
            resultType: "Bye",
            winnerId: fixture.participantAId || fixture.participantBId,
            completedAt: new Date().toISOString(),
          };
        }
      } else {
        fixture.sourceFixtureAId = previousRound[position * 2]?.id ?? "";
        fixture.sourceFixtureBId = previousRound[position * 2 + 1]?.id ?? "";
      }
      fixtures.push(fixture);
      currentRound.push(fixture);
    }
    previousRound = currentRound;
  }

  return touchCompetition(advanceEliminationBracket({
    ...competition,
    format: "Single Elimination",
    status: "Active",
    fixtures,
    championParticipantId: "",
    runnerUpParticipantId: "",
  }));
}

function roundRobinRounds(participantIds: string[]): Array<Array<[string, string]>> {
  const ids: Array<string | null> = [...participantIds];
  if (ids.length % 2 === 1) ids.push(null);
  if (ids.length < 2) return [];
  const rounds: Array<Array<[string, string]>> = [];
  const rotating = [...ids];
  for (let round = 0; round < rotating.length - 1; round += 1) {
    const pairings: Array<[string, string]> = [];
    for (let index = 0; index < rotating.length / 2; index += 1) {
      const left = rotating[index];
      const right = rotating[rotating.length - 1 - index];
      if (left && right) pairings.push(round % 2 === 0 ? [left, right] : [right, left]);
    }
    rounds.push(pairings);
    const fixed = rotating[0];
    const tail = rotating.slice(1);
    tail.unshift(tail.pop() ?? null);
    rotating.splice(0, rotating.length, fixed, ...tail);
  }
  return rounds;
}

export function generateRoundRobin(competition: Competition, doubleRound = competition.format === "Double Round Robin"): Competition {
  const participants = sortedParticipants(competition.participants);
  const baseRounds = roundRobinRounds(participants.map((participant) => participant.id));
  const allRounds = doubleRound
    ? [...baseRounds, ...baseRounds.map((round) => round.map(([left, right]) => [right, left] as [string, string]))]
    : baseRounds;
  const fixtures = allRounds.flatMap((round, roundIndex) => round.map(([participantAId, participantBId], fixtureIndex) => ({
    ...emptyFixture(roundIndex + 1, `Round ${roundIndex + 1}`, fixtureIndex + 1),
    participantAId,
    participantBId,
  })));
  return touchCompetition({
    ...competition,
    format: doubleRound ? "Double Round Robin" : "Round Robin",
    status: fixtures.length > 0 ? "Active" : competition.status,
    fixtures,
    championParticipantId: "",
    runnerUpParticipantId: "",
    participants: competition.participants.map((participant) => ({ ...participant, status: participant.status === "Withdrawn" ? "Withdrawn" : "Active" })),
  });
}

export function generateCompetitionStructure(competition: Competition): Competition {
  return competition.format === "Single Elimination"
    ? generateSingleElimination(competition)
    : generateRoundRobin(competition, competition.format === "Double Round Robin");
}

export function recordCompetitionResult(
  competition: Competition,
  fixtureId: string,
  resultType: CompetitionResultType,
  winnerId = "",
  scoreText = "",
): Competition {
  const fixture = competition.fixtures.find((item) => item.id === fixtureId);
  if (!fixture) return competition;
  const allowed = [fixture.participantAId, fixture.participantBId].filter(Boolean);
  if (resultType === "Decision" && !allowed.includes(winnerId)) return competition;
  if (competition.format === "Single Elimination" && resultType === "Draw") return competition;
  const loserId = resultType === "Decision" ? allowed.find((id) => id !== winnerId) ?? "" : "";
  const status = resultType === "Cancelled" ? "Cancelled" : resultType === "Bye" ? "Bye" : "Completed";
  const fixtures = competition.fixtures.map((item) => item.id === fixtureId ? {
    ...item,
    status,
    resultType,
    winnerId: resultType === "Decision" || resultType === "Bye" ? winnerId : "",
    loserId,
    scoreText,
    completedAt: status === "Completed" || status === "Bye" ? new Date().toISOString() : "",
  } : item);
  const next = touchCompetition({ ...competition, fixtures });
  if (competition.format === "Single Elimination") return advanceEliminationBracket(next);
  const standings = buildCompetitionStandings(next);
  const allResolved = next.fixtures.length > 0 && next.fixtures.every((item) => ["Completed", "Cancelled", "Bye"].includes(item.status));
  const championId = allResolved ? standings[0]?.participantId ?? "" : "";
  const runnerUpId = allResolved ? standings[1]?.participantId ?? "" : "";
  return {
    ...next,
    status: allResolved ? "Completed" : "Active",
    championParticipantId: championId,
    runnerUpParticipantId: runnerUpId,
    participants: next.participants.map((participant) => ({
      ...participant,
      status: participant.status === "Withdrawn" ? "Withdrawn" : participant.id === championId ? "Champion" : "Active",
    })),
  };
}

export function resetCompetitionResult(competition: Competition, fixtureId: string): Competition {
  const target = competition.fixtures.find((fixture) => fixture.id === fixtureId);
  if (!target) return competition;
  const dependentIds = new Set<string>();
  let frontier = [fixtureId];
  while (frontier.length > 0) {
    const current = frontier.shift()!;
    for (const fixture of competition.fixtures) {
      if ((fixture.sourceFixtureAId === current || fixture.sourceFixtureBId === current) && !dependentIds.has(fixture.id)) {
        dependentIds.add(fixture.id);
        frontier.push(fixture.id);
      }
    }
  }
  const fixtures = competition.fixtures.map((fixture) => {
    if (fixture.id === fixtureId) return { ...fixture, status: fixture.scheduledShowId ? "Scheduled" : "Unscheduled", resultType: "", winnerId: "", loserId: "", scoreText: "", completedAt: "" };
    if (!dependentIds.has(fixture.id)) return fixture;
    return {
      ...fixture,
      participantAId: fixture.sourceFixtureAId ? "" : fixture.participantAId,
      participantBId: fixture.sourceFixtureBId ? "" : fixture.participantBId,
      status: fixture.scheduledShowId ? "Scheduled" : "Unscheduled",
      resultType: "",
      winnerId: "",
      loserId: "",
      scoreText: "",
      completedAt: "",
    };
  });
  return competition.format === "Single Elimination"
    ? advanceEliminationBracket(touchCompetition({ ...competition, fixtures, status: "Active", championParticipantId: "", runnerUpParticipantId: "" }))
    : touchCompetition({ ...competition, fixtures, status: "Active", championParticipantId: "", runnerUpParticipantId: "" });
}

export function buildCompetitionStandings(competition: Competition): CompetitionStanding[] {
  const rows = new Map<string, CompetitionStanding>();
  for (const participant of competition.participants) {
    rows.set(participant.id, {
      participantId: participant.id,
      participantName: participant.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      noContests: 0,
      points: 0,
      rank: 0,
    });
  }
  for (const fixture of competition.fixtures) {
    if (fixture.status !== "Completed") continue;
    const left = rows.get(fixture.participantAId);
    const right = rows.get(fixture.participantBId);
    if (!left || !right) continue;
    left.played += 1;
    right.played += 1;
    if (fixture.resultType === "Decision") {
      const winner = rows.get(fixture.winnerId);
      const loser = rows.get(fixture.loserId);
      if (winner) { winner.wins += 1; winner.points += competition.pointsRules.win; }
      if (loser) { loser.losses += 1; loser.points += competition.pointsRules.loss; }
    } else if (fixture.resultType === "Draw") {
      left.draws += 1;
      right.draws += 1;
      left.points += competition.pointsRules.draw;
      right.points += competition.pointsRules.draw;
    } else if (fixture.resultType === "No Contest") {
      left.noContests += 1;
      right.noContests += 1;
      left.points += competition.pointsRules.noContest;
      right.points += competition.pointsRules.noContest;
    }
  }
  return [...rows.values()]
    .sort((left, right) => right.points - left.points || right.wins - left.wins || left.losses - right.losses || left.participantName.localeCompare(right.participantName))
    .map((standing, index) => ({ ...standing, rank: index + 1 }));
}

function participantName(competition: Competition, participantId: string): string {
  return competition.participants.find((participant) => participant.id === participantId)?.name ?? "TBD";
}

export function fixtureDisplayName(competition: Competition, fixture: CompetitionFixture): string {
  return `${participantName(competition, fixture.participantAId)} vs ${participantName(competition, fixture.participantBId)}`;
}

function membersForParticipant(participant: CompetitionParticipant | undefined): string[] {
  if (!participant) return [];
  return participant.memberNames.length > 0 ? participant.memberNames : [participant.name];
}

export function createPlannedMatchForFixture(competition: Competition, fixture: CompetitionFixture): PlannedSegment {
  const participantA = competition.participants.find((participant) => participant.id === fixture.participantAId);
  const participantB = competition.participants.find((participant) => participant.id === fixture.participantBId);
  const segment = createPlannedSegment("match");
  const typeLabel = competition.participantType === "Tag Team" ? "2 vs. 2" : competition.participantType === "Trios" ? "3 vs. 3" : "1 vs. 1";
  const workers = [
    ...membersForParticipant(participantA).map((name) => ({ id: createPlannerId(), name, role: "Competitor", side: participantA?.name || "Side 1", source: "manual" as const })),
    ...membersForParticipant(participantB).map((name) => ({ id: createPlannerId(), name, role: "Competitor", side: participantB?.name || "Side 2", source: "manual" as const })),
  ];
  return {
    ...segment,
    title: `${fixtureDisplayName(competition, fixture)} — ${fixture.roundLabel}`,
    matchType: typeLabel,
    workers,
    purpose: `${competition.name} ${fixture.roundLabel} fixture.`,
    consequences: competition.format === "Single Elimination" ? "The winner advances to the next round." : "The result updates the competition standings.",
    followUp: competition.format === "Single Elimination" ? "Advance the confirmed winner in the competition bracket after the TEW result is reconciled." : "Update the competition table after the TEW result is reconciled.",
    privateNotes: competition.championPresentation ? `Competition presentation: ${competition.championPresentation}` : "",
    competitionId: competition.id,
    competitionFixtureId: fixture.id,
    competitionRoundLabel: fixture.roundLabel,
  };
}

export function addFixtureToPlannedShow(
  competition: Competition,
  fixtureId: string,
  showId: string,
  shows: PlannedShow[],
): { competition: Competition; shows: PlannedShow[]; segmentId: string; created: boolean } {
  const fixture = competition.fixtures.find((item) => item.id === fixtureId);
  const show = shows.find((item) => item.id === showId);
  if (!fixture || !show || !fixture.participantAId || !fixture.participantBId) return { competition, shows, segmentId: "", created: false };
  if (fixture.plannedSegmentId) return { competition, shows, segmentId: fixture.plannedSegmentId, created: false };
  const segment = createPlannedMatchForFixture(competition, fixture);
  const updatedShows = shows.map((item) => item.id === showId ? touchShow({ ...item, segments: [...item.segments, segment] }) : item);
  const fixtures = competition.fixtures.map((item) => item.id === fixtureId ? {
    ...item,
    scheduledShowId: showId,
    plannedSegmentId: segment.id,
    status: item.status === "Unscheduled" ? "Scheduled" : item.status,
  } : item);
  return { competition: touchCompetition({ ...competition, fixtures }), shows: updatedShows, segmentId: segment.id, created: true };
}

function winnerParticipantFromName(competition: Competition, winnerName: string): string {
  const normalizedWinner = normalizeName(winnerName);
  if (!normalizedWinner) return "";
  const exact = competition.participants.find((participant) => normalizeName(participant.name) === normalizedWinner);
  if (exact) return exact.id;
  const member = competition.participants.find((participant) => participant.memberNames.some((name) => normalizeName(name) === normalizedWinner));
  return member?.id ?? "";
}

export function syncCompetitionFromPlannedShows(competition: Competition, shows: PlannedShow[]): { competition: Competition; synced: number } {
  let next = competition;
  let synced = 0;
  for (const fixture of competition.fixtures) {
    if (!fixture.plannedSegmentId || fixture.status === "Completed" || fixture.status === "Bye") continue;
    const segment = shows.flatMap((show) => show.segments).find((item) => item.id === fixture.plannedSegmentId);
    const winnerName = segment?.reconciliation.actualMatch?.winner ?? "";
    const winnerId = winnerParticipantFromName(next, winnerName);
    if (!winnerId) continue;
    next = recordCompetitionResult(next, fixture.id, "Decision", winnerId, segment?.reconciliation.actualMatch?.matchTime ?? "");
    synced += 1;
  }
  return { competition: next, synced };
}

export function competitionWarnings(competition: Competition, shows: PlannedShow[] = []): CompetitionWarning[] {
  const warnings: CompetitionWarning[] = [];
  const activeParticipants = competition.participants.filter((participant) => participant.status !== "Withdrawn");
  const duplicateNames = new Map<string, number>();
  for (const participant of competition.participants) {
    const key = normalizeName(participant.name);
    duplicateNames.set(key, (duplicateNames.get(key) ?? 0) + 1);
  }
  for (const [key, count] of duplicateNames) {
    if (key && count > 1) warnings.push({ id: `duplicate-${key}`, severity: "Warning", message: `Duplicate participant name: ${key}.`, fixtureId: "", participantId: "" });
  }
  if (activeParticipants.length < 2) warnings.push({ id: "not-enough-participants", severity: "Warning", message: "At least two active participants are required to generate a competition structure.", fixtureId: "", participantId: "" });
  if (competition.fixtures.length === 0 && activeParticipants.length >= 2) warnings.push({ id: "structure-not-generated", severity: "Info", message: "Participants are ready, but the bracket or league schedule has not been generated.", fixtureId: "", participantId: "" });
  for (const fixture of competition.fixtures) {
    if (fixture.status === "Scheduled" && !fixture.scheduledShowId) warnings.push({ id: `scheduled-no-show-${fixture.id}`, severity: "Warning", message: `${fixture.roundLabel} is marked scheduled without a planned show.`, fixtureId: fixture.id, participantId: "" });
    if (fixture.plannedSegmentId && !shows.some((show) => show.segments.some((segment) => segment.id === fixture.plannedSegmentId))) warnings.push({ id: `missing-segment-${fixture.id}`, severity: "Warning", message: `${fixture.roundLabel} links to a planned segment that no longer exists.`, fixtureId: fixture.id, participantId: "" });
    if (fixture.status === "Completed" && fixture.resultType === "Decision" && !fixture.winnerId) warnings.push({ id: `completed-no-winner-${fixture.id}`, severity: "Warning", message: `${fixture.roundLabel} is completed without a winner.`, fixtureId: fixture.id, participantId: "" });
  }
  if (competition.status === "Completed" && !competition.championParticipantId) warnings.push({ id: "completed-no-champion", severity: "Warning", message: "The competition is marked completed without a champion.", fixtureId: "", participantId: "" });
  return warnings;
}
