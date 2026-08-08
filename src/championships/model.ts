import type { BookingIdea } from "../control/types";
import { createPlannerId } from "../planner/model";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import type { TrackerStoryline } from "../storylines/types";
import type { WorkerUniverse } from "../workers/types";
import type { StandaloneTeamRecord, StandaloneWorkerRecord } from "../consequences/types";
import type {
  Championship,
  ChampionshipActivityBaseline,
  ChampionshipCompetitor,
  ChampionshipResultEvent,
  ChampionshipReign,
  ChampionshipTimelineEntry,
  ChampionshipUniverse,
  ChampionshipWarning,
  CompetitiveRecord,
  ContenderRanking,
  TitleResultDecision,
  TitleResultSuggestion,
} from "./types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function now(): string {
  return new Date().toISOString();
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseDate(value: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(`${value}T12:00:00`);
  return Number.isNaN(parsed) ? null : parsed;
}

function daysBetween(from: string, to: string): number | null {
  const start = parseDate(from);
  const end = parseDate(to);
  if (start === null || end === null) return null;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

export function competitorNames(competitors: ChampionshipCompetitor[]): string {
  return competitors.map((competitor) => competitor.name).filter(Boolean).join(" & ");
}

export function competitorsFromNames(names: string, known: Array<{ id: string; name: string }> = []): ChampionshipCompetitor[] {
  return names
    .split(/\s*(?:&|,|\/| and )\s*/i)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      const match = known.find((worker) => normalize(worker.name) === normalize(name));
      return { id: match?.id ?? createPlannerId(), name: match?.name ?? name };
    });
}

export function emptyChampionshipProgram(): Championship["currentProgram"] {
  return {
    championNames: [],
    leadingChallengerNames: [],
    additionalContenderNames: [],
    linkedStorylineId: "",
    linkedRelationshipIds: [],
    linkedBookingIdeaIds: [],
    targetPayoffShowId: "",
    summary: "",
  };
}

export function createChampionship(sequence: number): Championship {
  const timestamp = now();
  return {
    id: createPlannerId(),
    name: `Untitled Championship ${sequence}`,
    company: "",
    brand: "",
    division: "Singles",
    classification: "Primary",
    status: "Vacant",
    linkedTewTitleId: "",
    linkedTewTitleName: "",
    currentChampions: [],
    previousChampions: [],
    dateWon: "",
    defenses: 0,
    linkedStorylineId: "",
    currentProgram: emptyChampionshipProgram(),
    privateNotes: "",
    inactivityWarningDays: 60,
    reigns: [],
    rankings: [],
    legacyNames: [],
    resultEvents: [],
    lastTitleActivityDate: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function touchChampionship(championship: Championship): Championship {
  return { ...championship, updatedAt: now() };
}

export function createChampionshipReign(
  champions: ChampionshipCompetitor[],
  previousChampions: ChampionshipCompetitor[],
  startDate = today(),
  startShowId = "",
  startSegmentId = "",
): ChampionshipReign {
  const timestamp = now();
  return {
    id: createPlannerId(),
    champions,
    previousChampions,
    startDate,
    endDate: "",
    startShowId,
    startSegmentId,
    endShowId: "",
    endSegmentId: "",
    successfulDefenses: 0,
    status: "Active",
    vacancyReason: "",
    notes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createRanking(rank: number, competitors: ChampionshipCompetitor[] = []): ContenderRanking {
  return {
    id: createPlannerId(),
    rank,
    competitors,
    eligibility: "Eligible",
    record: "",
    recentForm: "",
    lastChampionshipOpportunity: "",
    reason: "",
    movement: 0,
    locked: false,
    updatedAt: now(),
  };
}

export function titleMatchesSegment(championship: Championship, segment: PlannedSegment): boolean {
  if (segment.championshipId === championship.id) return true;
  const references = [...championship.legacyNames, championship.name, championship.linkedTewTitleName]
    .map(normalize)
    .filter(Boolean);
  return Boolean(normalize(segment.championship) && references.includes(normalize(segment.championship)));
}

function actualWinner(segment: PlannedSegment): string {
  return segment.reconciliation.actualMatch?.winner?.trim() ?? "";
}

function actualParticipants(segment: PlannedSegment): string[] {
  const actual = segment.reconciliation.actualMatch?.workers ?? [];
  return actual.length > 0 ? actual : segment.workers.map((worker) => worker.name);
}

function resultCodeForWorker(workerName: string, segment: PlannedSegment): "W" | "L" | "D" | "NC" | "?" {
  const winner = actualWinner(segment);
  const normalizedWinner = normalize(winner);
  if (!winner) return "?";
  if (normalizedWinner.includes("draw")) return "D";
  if (normalizedWinner.includes("no contest") || normalizedWinner === "nc") return "NC";
  const winnerNames = winner.split(/\s*(?:&|,|\/| and )\s*/i).map(normalize).filter(Boolean);
  return winnerNames.includes(normalize(workerName)) ? "W" : "L";
}

export function buildCompetitiveRecord(workerName: string, shows: PlannedShow[], championships: ChampionshipUniverse): CompetitiveRecord {
  const entries = shows
    .flatMap((show) => show.segments.map((segment) => ({ show, segment })))
    .filter(({ segment }) => segment.type === "match" && Boolean(segment.reconciliation.actualMatch))
    .filter(({ segment }) => actualParticipants(segment).some((name) => normalize(name) === normalize(workerName)))
    .sort((a, b) => a.show.date.localeCompare(b.show.date));

  const record: CompetitiveRecord = {
    workerName,
    wins: 0,
    losses: 0,
    draws: 0,
    noContests: 0,
    unresolved: 0,
    matchCount: entries.length,
    singlesMatches: 0,
    teamMatches: 0,
    championshipMatches: 0,
    titleDefenses: 0,
    currentStreak: "—",
    lastFive: [],
    opponents: {},
  };

  const codes: string[] = [];
  for (const { segment } of entries) {
    const participants = actualParticipants(segment);
    if (participants.length <= 2) record.singlesMatches += 1;
    else record.teamMatches += 1;
    if (championships.championships.some((championship) => titleMatchesSegment(championship, segment))) {
      record.championshipMatches += 1;
      if (segment.titleResultDecision === "Retained" && normalize(segment.championEntering) === normalize(workerName)) record.titleDefenses += 1;
    }
    const code = resultCodeForWorker(workerName, segment);
    codes.push(code);
    if (code === "W") record.wins += 1;
    else if (code === "L") record.losses += 1;
    else if (code === "D") record.draws += 1;
    else if (code === "NC") record.noContests += 1;
    else record.unresolved += 1;

    participants
      .filter((name) => normalize(name) !== normalize(workerName))
      .forEach((opponent) => {
        const current = record.opponents[opponent] ?? { wins: 0, losses: 0 };
        if (code === "W") current.wins += 1;
        if (code === "L") current.losses += 1;
        record.opponents[opponent] = current;
      });
  }

  record.lastFive = codes.slice(-5).reverse();
  const last = codes.at(-1);
  if (last === "W" || last === "L") {
    let count = 0;
    for (let index = codes.length - 1; index >= 0 && codes[index] === last; index -= 1) count += 1;
    record.currentStreak = `${count}${last === "W" ? "W" : "L"}`;
  }
  return record;
}

export function suggestRankings(
  championship: Championship,
  shows: PlannedShow[],
  workers: WorkerUniverse,
  universe: ChampionshipUniverse,
  competitiveRecords?: { workerRecords: StandaloneWorkerRecord[]; teamRecords: StandaloneTeamRecord[] },
): ContenderRanking[] {
  const championKeys = new Set(championship.currentChampions.map((champion) => normalize(champion.name)));
  if (competitiveRecords) {
    const source = championship.division === "Tag Team" || championship.division === "Trios"
      ? competitiveRecords.teamRecords.map((record) => ({ id: record.teamKey, name: record.teamName, members: record.memberNames, wins: record.wins, losses: record.losses, draws: record.draws, noContests: record.noContests, points: record.rankingPoints, position: record.rankingPosition, tied: Boolean(record.rankingTied), form: record.matchHistory.slice(0, 5).map((entry) => entry.result) }))
      : competitiveRecords.workerRecords.map((record) => ({ id: record.workerId || record.workerKey, name: record.workerName, members: [record.workerName], wins: record.wins, losses: record.losses, draws: record.draws, noContests: record.noContests, points: record.rankingPoints, position: record.rankingPosition, tied: Boolean(record.rankingTied), form: record.lastFive }));
    const limit = championship.division === "Singles" ? 8 : 6;
    const calculated = source.filter((record) => !championKeys.has(normalize(record.name))).sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
    const calculatedByName = new Map(calculated.map((record) => [normalize(record.name), record]));
    const locked = championship.rankings.filter((ranking) => ranking.locked).map((ranking) => {
      const record = calculatedByName.get(normalize(ranking.competitors[0]?.name ?? ""));
      return {
        ...ranking,
        calculatedRank: record?.position,
        calculatedPoints: record?.points,
        tied: record?.tied,
        overrideReason: ranking.overrideReason || ranking.reason,
        updatedAt: now(),
      };
    });
    const lockedNames = new Set(locked.flatMap((ranking) => ranking.competitors.map((competitor) => normalize(competitor.name))));
    const usedPublishedRanks = new Set(locked.map((ranking) => ranking.rank));
    let nextPublishedRank = 1;
    const generated = calculated.filter((record) => !lockedNames.has(normalize(record.name))).slice(0, limit).map((record) => {
      while (usedPublishedRanks.has(nextPublishedRank)) nextPublishedRank += 1;
      const publishedRank = nextPublishedRank;
      nextPublishedRank += 1;
      return {
        ...createRanking(publishedRank),
        competitors: [{ id: record.id, name: record.name }],
        record: `${record.wins}-${record.losses}-${record.draws}${record.noContests ? ` (${record.noContests} NC)` : ""}`,
        recentForm: record.form.join(" ") || "No recorded form",
        reason: `Official Phase 6B20 ranking ledger: ${record.points.toFixed(2)} points from raw in-ring performance and official results.`,
        calculatedRank: record.position,
        calculatedPoints: record.points,
        tied: record.tied,
      };
    });
    return [...locked, ...generated].sort((left, right) => left.rank - right.rank || (left.calculatedRank ?? 999) - (right.calculatedRank ?? 999)).slice(0, limit).map((ranking, index) => ({ ...ranking, rank: index + 1 }));
  }
  return championship.rankings.filter((ranking) => ranking.locked).sort((left, right) => left.rank - right.rank).map((ranking, index) => ({ ...ranking, rank: index + 1, updatedAt: now() }));
}

export function buildTitleResultSuggestions(championship: Championship, shows: PlannedShow[]): TitleResultSuggestion[] {
  return shows
    .flatMap((show) => show.segments.map((segment) => ({ show, segment })))
    .filter(({ segment }) => segment.type === "match" && titleMatchesSegment(championship, segment))
    .filter(({ segment }) => segment.workflowStatus === "Reconciled" && !segment.titleResultConfirmedAt)
    .map(({ show, segment }) => {
      const winner = actualWinner(segment);
      const champion = segment.championEntering || competitorNames(championship.currentChampions);
      const challenger = segment.challenger || segment.workers.map((worker) => worker.name).find((name) => !normalize(champion).includes(normalize(name))) || "";
      let suggestedDecision: TitleResultDecision = "Unresolved";
      let reason = "The stored result does not identify a clear title outcome.";
      if (normalize(winner) === "no contest" || normalize(winner) === "nc") {
        suggestedDecision = "No Contest";
        reason = "The official result records title activity without a defense or title change.";
      } else if (winner && champion && normalize(winner) === normalize(champion)) {
        suggestedDecision = "Retained";
        reason = `${winner} matches the champion entering the match.`;
      } else if (winner && challenger && normalize(winner) === normalize(challenger)) {
        suggestedDecision = "Changed Hands";
        reason = `${winner} matches the recorded challenger.`;
      }
      return {
        id: `suggestion-${show.id}-${segment.id}`,
        championshipId: championship.id,
        showId: show.id,
        segmentId: segment.id,
        showName: show.name,
        showDate: show.date,
        segmentTitle: segment.title,
        segmentType: segment.type,
        championEntering: champion,
        challenger,
        actualWinner: winner,
        suggestedDecision,
        reason,
      };
    });
}

export function applyTitleResult(
  championship: Championship,
  show: PlannedShow,
  segment: PlannedSegment,
  decision: TitleResultDecision,
  knownWorkers: Array<{ id: string; name: string }> = [],
  eventDetails: { sourceResultId?: string; runningOrderPosition?: number; confirmedAt?: string } = {},
): { championship: Championship; show: PlannedShow } {
  if (!decision || decision === "Unresolved") throw new Error("Choose a resolved title-result decision.");
  const resultDate = show.reconciliation?.actualShow.date || show.date || today();
  const winner = actualWinner(segment);
  if (decision === "Changed Hands" && !winner) throw new Error("The reconciled match does not contain a winner to begin the new reign.");
  const sourceResultId = eventDetails.sourceResultId || `${show.id}:${segment.id}`;
  if (championship.resultEvents.some((event) => event.sourceResultId === sourceResultId)) throw new Error("This official result has already updated the championship.");
  const baseline: ChampionshipActivityBaseline = championship.activityBaseline ?? {
    status: championship.status,
    currentChampions: structuredClone(championship.currentChampions),
    previousChampions: structuredClone(championship.previousChampions),
    dateWon: championship.dateWon,
    defenses: championship.defenses,
    reigns: structuredClone(championship.reigns),
  };
  const winners = decision === "Changed Hands"
    ? competitorsFromNames(winner, knownWorkers)
    : decision === "Retained" || decision === "No Contest"
      ? structuredClone(championship.currentChampions)
      : [];
  const event: ChampionshipResultEvent = {
    id: `title-event:${championship.id}:${sourceResultId}`,
    sourceResultId,
    showId: show.id,
    segmentId: segment.id,
    showDate: resultDate,
    runningOrderPosition: Math.max(0, eventDetails.runningOrderPosition ?? show.segments.findIndex((item) => item.id === segment.id)),
    decision: decision as Exclude<TitleResultDecision, "" | "Unresolved">,
    winners,
    previousChampions: structuredClone(championship.currentChampions),
    activityOnly: decision === "No Contest",
    confirmedAt: eventDetails.confirmedAt ?? now(),
  };
  const nextChampionship = rebuildChampionshipFromEvents({ ...championship, activityBaseline: baseline, resultEvents: [...championship.resultEvents, event] });

  const nextShow = {
    ...show,
    updatedAt: now(),
    segments: show.segments.map((item) => item.id === segment.id ? {
      ...item,
      titleResultDecision: decision,
      titleResultConfirmedAt: event.confirmedAt,
    } : item),
  };
  return { championship: nextChampionship, show: nextShow };
}

export function rebuildChampionshipFromEvents(championship: Championship): Championship {
  const baseline = championship.activityBaseline ?? {
    status: championship.status,
    currentChampions: championship.currentChampions,
    previousChampions: championship.previousChampions,
    dateWon: championship.dateWon,
    defenses: championship.defenses,
    reigns: championship.reigns,
  };
  let nextChampionship: Championship = {
    ...championship,
    status: baseline.status,
    currentChampions: structuredClone(baseline.currentChampions),
    previousChampions: structuredClone(baseline.previousChampions),
    dateWon: baseline.dateWon,
    defenses: baseline.defenses,
    reigns: structuredClone(baseline.reigns),
    lastTitleActivityDate: "",
  };
  const events = [...championship.resultEvents].sort((left, right) => left.showDate.localeCompare(right.showDate) || left.runningOrderPosition - right.runningOrderPosition || left.confirmedAt.localeCompare(right.confirmedAt) || left.id.localeCompare(right.id));
  for (const event of events) {
    nextChampionship.lastTitleActivityDate = event.showDate;
    if (event.decision === "No Contest") continue;
    if (event.decision === "Retained") {
      nextChampionship.defenses += 1;
      const active = nextChampionship.reigns.find((reign) => reign.status === "Active");
      if (active) {
        active.successfulDefenses += 1;
        active.updatedAt = event.confirmedAt;
      }
    } else if (event.decision === "Changed Hands") {
    const prior = nextChampionship.currentChampions;
    nextChampionship.reigns = nextChampionship.reigns.map((reign) => reign.status === "Active" ? {
      ...reign,
      status: "Ended",
      endDate: event.showDate,
      endShowId: event.showId,
      endSegmentId: event.segmentId,
      updatedAt: event.confirmedAt,
    } : reign);
    nextChampionship.previousChampions = structuredClone(prior);
    nextChampionship.currentChampions = structuredClone(event.winners);
    nextChampionship.dateWon = event.showDate;
    nextChampionship.defenses = 0;
    nextChampionship.status = "Active";
    nextChampionship.reigns = [
      ...nextChampionship.reigns,
      {
        ...createChampionshipReign(event.winners, prior, event.showDate, event.showId, event.segmentId),
        id: `reign:${championship.id}:${event.id}`,
        createdAt: event.confirmedAt,
        updatedAt: event.confirmedAt,
      },
    ];
    } else if (event.decision === "Vacated") {
    nextChampionship.reigns = nextChampionship.reigns.map((reign) => reign.status === "Active" ? {
      ...reign,
      status: "Vacated",
      endDate: event.showDate,
      endShowId: event.showId,
      endSegmentId: event.segmentId,
      vacancyReason: "Vacated after the recorded title result.",
      updatedAt: event.confirmedAt,
    } : reign);
    nextChampionship.previousChampions = nextChampionship.currentChampions;
    nextChampionship.currentChampions = [];
    nextChampionship.dateWon = "";
    nextChampionship.defenses = 0;
    nextChampionship.status = "Vacant";
    }
  }
  return touchChampionship({ ...nextChampionship, resultEvents: events });
}

export function buildChampionshipWarnings(
  universe: ChampionshipUniverse,
  shows: PlannedShow[],
  storylines: TrackerStoryline[] = [],
): ChampionshipWarning[] {
  const warnings: ChampionshipWarning[] = [];
  universe.championships.forEach((championship) => {
    const activeReigns = championship.reigns.filter((reign) => reign.status === "Active");
    if (activeReigns.length > 1) warnings.push({ id: `multi-reign-${championship.id}`, category: "Lineage", message: `${championship.name} has ${activeReigns.length} active reigns.`, championshipId: championship.id, showId: "", segmentId: "" });
    if (championship.status === "Active" && championship.currentChampions.length === 0) warnings.push({ id: `missing-champion-${championship.id}`, category: "Champion", message: `${championship.name} is active but has no current champion.`, championshipId: championship.id, showId: "", segmentId: "" });
    if (championship.status === "Vacant" && !shows.some((show) => show.segments.some((segment) => titleMatchesSegment(championship, segment) && ["Vacant Title", "Tournament Final"].includes(segment.championshipMatchPurpose)))) warnings.push({ id: `vacancy-${championship.id}`, category: "Vacancy", message: `${championship.name} is vacant with no resolution planned.`, championshipId: championship.id, showId: "", segmentId: "" });
    const lastReign = championship.reigns.slice().sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    const lastActivityDate = championship.lastTitleActivityDate || lastReign?.startDate || championship.dateWon;
    const inactiveDays = lastActivityDate ? daysBetween(lastActivityDate, today()) : null;
    if (championship.status === "Active" && inactiveDays !== null && inactiveDays > championship.inactivityWarningDays) warnings.push({ id: `inactive-${championship.id}`, category: "Activity", message: `${championship.name} has no official title activity for ${inactiveDays} days.`, championshipId: championship.id, showId: "", segmentId: "" });
    const leading = championship.rankings.find((ranking) => ranking.rank === 1);
    if (leading && !shows.some((show) => show.segments.some((segment) => segment.workers.some((worker) => leading.competitors.some((competitor) => normalize(competitor.name) === normalize(worker.name)))))) warnings.push({ id: `contender-${championship.id}`, category: "Contender", message: `${competitorNames(leading.competitors)} is ranked #1 for ${championship.name} but has no planned booking.`, championshipId: championship.id, showId: "", segmentId: "" });
    buildTitleResultSuggestions(championship, shows).forEach((suggestion) => warnings.push({ id: suggestion.id, category: "Match", message: `${suggestion.showName}: ${suggestion.segmentTitle} has an unconfirmed championship result.`, championshipId: championship.id, showId: suggestion.showId, segmentId: suggestion.segmentId }));
    if (championship.linkedStorylineId) {
      const storyline = storylines.find((item) => item.id === championship.linkedStorylineId);
      if (storyline?.status === "Completed" && !championship.reigns.some((reign) => reign.startShowId)) warnings.push({ id: `payoff-${championship.id}`, category: "Storyline", message: `${storyline.name} is completed but ${championship.name} has no recorded payoff title change.`, championshipId: championship.id, showId: "", segmentId: "" });
    }
  });
  return warnings;
}

export function buildChampionshipTimeline(
  championship: Championship,
  shows: PlannedShow[],
  storylines: TrackerStoryline[],
  ideas: BookingIdea[],
): ChampionshipTimelineEntry[] {
  const entries: ChampionshipTimelineEntry[] = [];
  championship.reigns.forEach((reign) => {
    entries.push({ id: `reign-${reign.id}`, date: reign.startDate, type: "Title Win", title: `${competitorNames(reign.champions)} began a reign`, detail: `${reign.successfulDefenses} recorded defense${reign.successfulDefenses === 1 ? "" : "s"}`, showId: reign.startShowId, segmentId: reign.startSegmentId, storylineId: "", bookingIdeaId: "" });
    if (reign.status === "Vacated") entries.push({ id: `vacancy-${reign.id}`, date: reign.endDate, type: "Vacancy", title: `${championship.name} became vacant`, detail: reign.vacancyReason || "Vacancy recorded", showId: reign.endShowId, segmentId: reign.endSegmentId, storylineId: "", bookingIdeaId: "" });
  });
  shows.forEach((show) => show.segments.filter((segment) => titleMatchesSegment(championship, segment)).forEach((segment) => entries.push({ id: `match-${segment.id}`, date: show.date, type: segment.titleResultDecision === "Retained" ? "Defense" : "Planned Match", title: segment.title, detail: `${show.name} · ${segment.workflowStatus}${segment.titleResultDecision ? ` · ${segment.titleResultDecision}` : ""}`, showId: show.id, segmentId: segment.id, storylineId: segment.storylines[0]?.id ?? "", bookingIdeaId: segment.bookingIdeaId })));
  const storyline = storylines.find((item) => item.id === championship.linkedStorylineId);
  if (storyline) entries.push({ id: `storyline-${storyline.id}`, date: storyline.startDate, type: "Storyline", title: storyline.name, detail: `${storyline.status} · ${storyline.currentPhase}`, showId: "", segmentId: "", storylineId: storyline.id, bookingIdeaId: "" });
  ideas.filter((idea) => normalize(idea.championship) === normalize(championship.name)).forEach((idea) => entries.push({ id: `idea-${idea.id}`, date: idea.targetDate, type: "Booking Idea", title: idea.title, detail: `${idea.type} · ${idea.status}`, showId: idea.targetShowId, segmentId: idea.scheduledSegmentId, storylineId: idea.storylines[0]?.id ?? "", bookingIdeaId: idea.id }));
  championship.rankings.forEach((ranking) => entries.push({ id: `ranking-${ranking.id}`, date: ranking.updatedAt.slice(0, 10), type: "Ranking", title: `#${ranking.rank} ${competitorNames(ranking.competitors)}`, detail: `${ranking.record || "Record unavailable"} · ${ranking.reason || "Manual ranking"}`, showId: "", segmentId: "", storylineId: "", bookingIdeaId: "" }));
  return entries.filter((entry) => entry.date).sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
}
