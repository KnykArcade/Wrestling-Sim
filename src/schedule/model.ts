import type { ChampionshipUniverse } from "../championships/types";
import { ideaIsScheduled } from "../control/model";
import type { BookingIdea } from "../control/types";
import type { CompetitionUniverse } from "../competitions/types";
import type { ShowOperationsUniverse } from "../operations/types";
import { createPlannedSegment, createPlannedShow, createPlannerId, touchShow } from "../planner/model";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import type { UnifiedShowSessionSummary } from "../showSession/types";
import type { TrackerStoryline } from "../storylines/types";
import type { WorkerUniverse } from "../workers/types";
import type {
  BookingObligation,
  BookingObligationDecisionStatus,
  CalendarDay,
  CalendarIntegrityIssue,
  ContinuityDecision,
  PromotionScheduleUniverse,
  PromotionShowStage,
  ScheduleException,
  ScheduleExclusion,
  ScheduleGenerationOptions,
  ScheduleGenerationSession,
  SchedulePreviewItem,
  ScheduleShowLink,
  SeriesTemplateSlot,
  ShowRecurrenceKind,
  ShowSeries,
  ShowSeriesTemplate,
} from "./types";

function fallbackId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createScheduleId(prefix = "schedule"): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : fallbackId(prefix);
}

function now(): string {
  return new Date().toISOString();
}

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth(): string {
  return todayDate().slice(0, 7);
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDateDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

export function addDateMonths(value: string, months: number): string {
  const source = parseDate(value);
  const desiredDay = source.getUTCDate();
  const next = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const finalDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(desiredDay, finalDay));
  return formatDate(next);
}

function dateValue(value: string): number {
  return isDate(value) ? parseDate(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function appendText(existing: string, addition: string): string {
  if (!addition.trim()) return existing;
  if (!existing.trim()) return addition.trim();
  if (existing.includes(addition.trim())) return existing;
  return `${existing.trim()}\n\n${addition.trim()}`;
}

export function defaultPromotionCalendarSettings(): PromotionScheduleUniverse["settings"] {
  return {
    activeView: "month",
    selectedShowId: "",
    selectedSeriesId: "",
    selectedTemplateId: "",
    month: currentMonth(),
    listFilter: "All",
  };
}

export function emptyPromotionScheduleUniverse(): PromotionScheduleUniverse {
  return {
    series: [],
    templates: [],
    links: [],
    exclusions: [],
    exceptions: [],
    generationSessions: [],
    continuityDecisions: [],
    settings: defaultPromotionCalendarSettings(),
  };
}

export function createTemplateSlot(type: "match" | "angle", sequence = 1): SeriesTemplateSlot {
  return {
    id: createScheduleId("template-slot"),
    type,
    section: "Main Show",
    title: type === "match" ? `Match Slot ${sequence}` : `Angle Slot ${sequence}`,
    durationMinutes: type === "match" ? 12 : 5,
    notes: "Structural placeholder only. Wrestlers, winners, finishes, dialogue, and storyline outcomes remain unset.",
  };
}

export function createShowSeriesTemplate(sequence = 1, televisionPreset = false): ShowSeriesTemplate {
  const timestamp = now();
  const slots = televisionPreset
    ? [
        { ...createTemplateSlot("angle", 1), title: "Opening Segment", durationMinutes: 8 },
        { ...createTemplateSlot("match", 1), title: "Television Match", durationMinutes: 12 },
        { ...createTemplateSlot("angle", 2), title: "Story Development Segment", durationMinutes: 5 },
        { ...createTemplateSlot("match", 2), title: "Featured Match", durationMinutes: 15 },
        { ...createTemplateSlot("match", 3), title: "Main Event", durationMinutes: 20 },
      ]
    : [];
  return {
    id: createScheduleId("series-template"),
    name: televisionPreset ? "Weekly Television — 60 Minutes" : `Untitled Show Template ${sequence}`,
    expectedMinutes: televisionPreset ? 60 : 120,
    preShowMinutes: 0,
    mainShowMinutes: televisionPreset ? 60 : 120,
    postShowMinutes: 0,
    productionNotes: televisionPreset
      ? "Reusable one-hour television structure. Every segment remains a blank booking placeholder."
      : "",
    slots,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createShowSeries(sequence = 1): ShowSeries {
  const timestamp = now();
  const start = todayDate();
  return {
    id: createScheduleId("show-series"),
    name: `Untitled Show Series ${sequence}`,
    company: "",
    brand: "",
    category: "Weekly Television",
    status: "Active",
    defaultMinutes: 60,
    recurrence: "Weekly",
    intervalDays: 7,
    defaultDayOfWeek: parseDate(start).getUTCDay(),
    startDate: start,
    endDate: "",
    startingEpisodeNumber: 1,
    namingPattern: "{series} #{episode}",
    defaultVenue: "",
    venueMode: "Manual Per Show",
    productionNotes: "",
    templateId: "",
    competitionId: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function touchShowSeries(series: ShowSeries): ShowSeries {
  return { ...series, updatedAt: now() };
}

export function touchShowSeriesTemplate(template: ShowSeriesTemplate): ShowSeriesTemplate {
  return { ...template, updatedAt: now() };
}

export function showFingerprint(show: PlannedShow): string {
  return JSON.stringify({
    name: show.name,
    date: show.date,
    company: show.company,
    showType: show.showType,
    venue: show.venue,
    venueCapacity: show.venueCapacity,
    marketDemand: show.marketDemand,
    expectedMinutes: show.expectedMinutes,
    notes: show.notes,
    segments: show.segments.map((segment) => ({
      type: segment.type,
      section: segment.section,
      title: segment.title,
      durationMinutes: segment.durationMinutes,
      notes: segment.notes,
    })),
  });
}

export function ensureScheduleLinks(shows: PlannedShow[], universe: PromotionScheduleUniverse): PromotionScheduleUniverse {
  const linked = new Set(universe.links.map((link) => link.showId));
  const timestamp = now();
  const additions = shows
    .filter((show) => !linked.has(show.id))
    .map<ScheduleShowLink>((show) => ({
      id: `one-off:${show.id}`,
      showId: show.id,
      seriesId: "",
      episodeNumber: 0,
      generatedSessionId: "",
      originalDate: show.date,
      generatedFingerprint: showFingerprint(show),
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
  if (additions.length === 0) return universe;
  return {
    ...universe,
    links: [...universe.links, ...additions],
    settings: {
      ...universe.settings,
      selectedShowId: universe.settings.selectedShowId || shows[0]?.id || "",
    },
  };
}

export function migrateShowsToPromotionSchedule(shows: PlannedShow[]): PromotionScheduleUniverse {
  return ensureScheduleLinks(shows, emptyPromotionScheduleUniverse());
}

export function seriesForShow(showId: string, universe: PromotionScheduleUniverse): ShowSeries | null {
  const link = universe.links.find((item) => item.showId === showId);
  return universe.series.find((series) => series.id === link?.seriesId) ?? null;
}

export function linkForShow(showId: string, universe: PromotionScheduleUniverse): ScheduleShowLink | null {
  return universe.links.find((link) => link.showId === showId) ?? null;
}

export function formatSeriesShowName(series: ShowSeries, episodeNumber: number, date: string): string {
  const pattern = series.namingPattern.trim() || "{series} #{episode}";
  return pattern
    .replaceAll("{series}", series.name)
    .replaceAll("{episode}", String(episodeNumber))
    .replaceAll("{date}", date);
}

function recurrenceDays(recurrence: ShowRecurrenceKind, intervalDays: number): number {
  if (recurrence === "Weekly") return 7;
  if (recurrence === "Biweekly") return 14;
  if (recurrence === "Interval Days") return Math.max(1, intervalDays);
  return 0;
}

export function alignDateToDay(value: string, dayOfWeek: number): string {
  if (!isDate(value)) return value;
  const current = parseDate(value).getUTCDay();
  const delta = (Math.max(0, Math.min(6, dayOfWeek)) - current + 7) % 7;
  return addDateDays(value, delta);
}

export function nextSeriesDate(series: ShowSeries, value: string): string {
  if (series.recurrence === "Monthly") return addDateMonths(value, 1);
  if (series.recurrence === "One-Off") return "";
  return addDateDays(value, recurrenceDays(series.recurrence, series.intervalDays));
}

function firstSeriesDate(series: ShowSeries): string {
  if (!isDate(series.startDate)) return todayDate();
  if (series.recurrence === "Weekly" || series.recurrence === "Biweekly") {
    return alignDateToDay(series.startDate, series.defaultDayOfWeek);
  }
  return series.startDate;
}

function existingSeriesLinks(seriesId: string, universe: PromotionScheduleUniverse): ScheduleShowLink[] {
  return universe.links
    .filter((link) => link.seriesId === seriesId)
    .sort((left, right) => left.episodeNumber - right.episodeNumber || left.originalDate.localeCompare(right.originalDate));
}

function startGeneration(series: ShowSeries, universe: PromotionScheduleUniverse): { date: string; episode: number } {
  const links = existingSeriesLinks(series.id, universe);
  if (links.length === 0) return { date: firstSeriesDate(series), episode: Math.max(1, series.startingEpisodeNumber) };
  const last = links.at(-1)!;
  return {
    date: nextSeriesDate(series, last.originalDate),
    episode: Math.max(last.episodeNumber + 1, series.startingEpisodeNumber),
  };
}

function exclusionFor(seriesId: string, date: string, universe: PromotionScheduleUniverse): ScheduleExclusion | null {
  return universe.exclusions.find((item) => item.seriesId === seriesId && item.date === date) ?? null;
}

export function previewSeriesGeneration(
  series: ShowSeries,
  universe: PromotionScheduleUniverse,
  shows: PlannedShow[],
  options: ScheduleGenerationOptions,
): SchedulePreviewItem[] {
  if (series.status !== "Active" || !isDate(series.startDate)) return [];
  const preview: SchedulePreviewItem[] = [];
  let { date, episode } = startGeneration(series, universe);
  let generated = 0;
  let safety = 0;
  const maxCount = Math.max(1, Math.min(260, options.count || 1));
  const through = isDate(options.throughDate) ? options.throughDate : "";

  while (date && safety < 520) {
    safety += 1;
    if (series.endDate && date > series.endDate) break;
    if (options.mode === "through-date" && through && date > through) break;
    if (options.mode === "count" && generated >= maxCount) break;

    const excluded = exclusionFor(series.id, date, universe);
    if (excluded) {
      preview.push({
        id: `excluded:${series.id}:${date}`,
        seriesId: series.id,
        date,
        showName: formatSeriesShowName(series, episode, date),
        episodeNumber: episode,
        status: "Excluded",
        existingShowId: "",
        conflictShowIds: [],
        reason: excluded.reason || "This date is excluded from the recurring series.",
      });
      date = nextSeriesDate(series, date);
      if (series.recurrence === "One-Off") break;
      continue;
    }

    const conflicts = shows.filter((show) => show.date === date).map((show) => show.id);
    preview.push({
      id: `new:${series.id}:${episode}:${date}`,
      seriesId: series.id,
      date,
      showName: formatSeriesShowName(series, episode, date),
      episodeNumber: episode,
      status: conflicts.length > 0 ? "Conflict" : "New",
      existingShowId: "",
      conflictShowIds: conflicts,
      reason: conflicts.length > 0
        ? `${conflicts.length} existing show${conflicts.length === 1 ? " is" : "s are"} already scheduled on this date.`
        : "Ready to create as a new planned show.",
    });
    generated += 1;
    episode += 1;
    date = nextSeriesDate(series, date);
    if (series.recurrence === "One-Off") break;
  }
  return preview;
}

export function previewSeriesRegeneration(
  series: ShowSeries,
  universe: PromotionScheduleUniverse,
  shows: PlannedShow[],
): SchedulePreviewItem[] {
  return existingSeriesLinks(series.id, universe).map((link) => {
    const show = shows.find((item) => item.id === link.showId);
    if (!show) {
      return {
        id: `missing:${link.id}`,
        seriesId: series.id,
        date: link.originalDate,
        showName: formatSeriesShowName(series, link.episodeNumber, link.originalDate),
        episodeNumber: link.episodeNumber,
        status: "Conflict" as const,
        existingShowId: link.showId,
        conflictShowIds: [],
        reason: "The generated schedule link points to a show that no longer exists.",
      };
    }
    const changed = link.generatedFingerprint !== showFingerprint(show);
    return {
      id: `regenerate:${link.id}`,
      seriesId: series.id,
      date: show.date,
      showName: show.name,
      episodeNumber: link.episodeNumber,
      status: changed ? "Manually Edited" as const : "Unchanged" as const,
      existingShowId: show.id,
      conflictShowIds: [],
      reason: changed
        ? "This show differs from the version originally generated. It will not be overwritten."
        : "This generated show still matches its recorded schedule version.",
    };
  });
}

function templateSegments(template: ShowSeriesTemplate | null): PlannedSegment[] {
  if (!template) return [];
  return template.slots.map((slot) => {
    const segment = createPlannedSegment(slot.type);
    return {
      ...segment,
      section: slot.section,
      title: slot.title,
      durationMinutes: Math.max(1, slot.durationMinutes),
      notes: slot.notes,
    };
  });
}

function showTypeForSeries(series: ShowSeries): string {
  if (series.category === "Weekly Television" || series.category === "Biweekly Television") return "Television";
  if (series.category === "Premium Event") return "Premium Event";
  if (series.category === "Competition Event") return "Competition";
  if (series.category === "Special") return "Special";
  return series.category;
}

export function createShowFromScheduleItem(
  series: ShowSeries,
  item: SchedulePreviewItem,
  template: ShowSeriesTemplate | null,
  sequence: number,
): PlannedShow {
  const base = createPlannedShow(sequence);
  return {
    ...base,
    name: item.showName,
    date: item.date,
    company: series.company,
    showType: showTypeForSeries(series),
    venue: series.venueMode === "Fixed" ? series.defaultVenue : "",
    expectedMinutes: Math.max(15, template?.expectedMinutes || series.defaultMinutes),
    notes: [series.brand ? `Brand: ${series.brand}` : "", series.productionNotes, template?.productionNotes ?? ""].filter(Boolean).join("\n\n"),
    segments: templateSegments(template),
  };
}

export function applySeriesGeneration(
  series: ShowSeries,
  universe: PromotionScheduleUniverse,
  shows: PlannedShow[],
  preview: SchedulePreviewItem[],
  options: ScheduleGenerationOptions,
): { universe: PromotionScheduleUniverse; shows: PlannedShow[]; session: ScheduleGenerationSession } {
  const sessionId = createScheduleId("generation-session");
  const timestamp = now();
  const template = universe.templates.find((item) => item.id === series.templateId) ?? null;
  const creatable = preview.filter((item) => item.status === "New");
  const generatedShows = creatable.map((item, index) => createShowFromScheduleItem(series, item, template, shows.length + index + 1));
  const generatedLinks = generatedShows.map<ScheduleShowLink>((show, index) => ({
    id: createScheduleId("schedule-link"),
    showId: show.id,
    seriesId: series.id,
    episodeNumber: creatable[index].episodeNumber,
    generatedSessionId: sessionId,
    originalDate: creatable[index].date,
    generatedFingerprint: showFingerprint(show),
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const session: ScheduleGenerationSession = {
    id: sessionId,
    seriesId: series.id,
    mode: options.mode,
    requestedCount: options.mode === "count" ? Math.max(1, options.count) : 0,
    throughDate: options.mode === "through-date" ? options.throughDate : "",
    createdAt: timestamp,
    appliedAt: timestamp,
    generatedShowIds: generatedShows.map((show) => show.id),
    skippedDates: preview.filter((item) => item.status === "Excluded").map((item) => item.date),
    conflicts: preview.filter((item) => item.status === "Conflict").map((item) => `${item.date}: ${item.reason}`),
  };
  return {
    shows: [...shows, ...generatedShows].sort((left, right) => left.date.localeCompare(right.date) || left.name.localeCompare(right.name)),
    universe: {
      ...universe,
      links: [...universe.links, ...generatedLinks],
      generationSessions: [session, ...universe.generationSessions].slice(0, 100),
      settings: {
        ...universe.settings,
        selectedShowId: generatedShows[0]?.id || universe.settings.selectedShowId,
        selectedSeriesId: series.id,
      },
    },
    session,
  };
}

export function addSeriesExclusion(
  universe: PromotionScheduleUniverse,
  seriesId: string,
  date: string,
  reason: string,
): PromotionScheduleUniverse {
  if (!seriesId || !isDate(date)) return universe;
  const existing = universe.exclusions.find((item) => item.seriesId === seriesId && item.date === date);
  if (existing) {
    return {
      ...universe,
      exclusions: universe.exclusions.map((item) => item.id === existing.id ? { ...item, reason } : item),
    };
  }
  return {
    ...universe,
    exclusions: [...universe.exclusions, { id: createScheduleId("exclusion"), seriesId, date, reason, createdAt: now() }],
  };
}

export function removeSeriesExclusion(universe: PromotionScheduleUniverse, exclusionId: string): PromotionScheduleUniverse {
  return { ...universe, exclusions: universe.exclusions.filter((item) => item.id !== exclusionId) };
}

export function rescheduleShow(
  universe: PromotionScheduleUniverse,
  shows: PlannedShow[],
  showId: string,
  newDate: string,
  note: string,
): { universe: PromotionScheduleUniverse; shows: PlannedShow[] } {
  const show = shows.find((item) => item.id === showId);
  const link = universe.links.find((item) => item.showId === showId);
  if (!show || !link || !isDate(newDate) || show.status === "Reconciled") return { universe, shows };
  const updatedShow = touchShow({ ...show, date: newDate });
  const exception: ScheduleException = {
    id: createScheduleId("schedule-exception"),
    seriesId: link.seriesId,
    showId,
    type: "Rescheduled",
    originalDate: show.date,
    newDate,
    note,
    createdAt: now(),
  };
  return {
    shows: shows.map((item) => item.id === showId ? updatedShow : item).sort((left, right) => left.date.localeCompare(right.date) || left.name.localeCompare(right.name)),
    universe: {
      ...universe,
      links: universe.links.map((item) => item.showId === showId ? { ...item, generatedFingerprint: showFingerprint(updatedShow), updatedAt: now() } : item),
      exceptions: [exception, ...universe.exceptions].slice(0, 250),
    },
  };
}

export function insertOneOffShow(
  universe: PromotionScheduleUniverse,
  shows: PlannedShow[],
  input: { name: string; date: string; company: string; showType: string; venue: string; expectedMinutes: number; note: string },
): { universe: PromotionScheduleUniverse; shows: PlannedShow[]; show: PlannedShow } {
  const base = createPlannedShow(shows.length + 1);
  const show = {
    ...base,
    name: input.name.trim() || `Special Event ${shows.length + 1}`,
    date: isDate(input.date) ? input.date : todayDate(),
    company: input.company,
    showType: input.showType || "Special",
    venue: input.venue,
    expectedMinutes: Math.max(15, input.expectedMinutes || 120),
    notes: input.note,
  };
  const timestamp = now();
  const link: ScheduleShowLink = {
    id: `one-off:${show.id}`,
    showId: show.id,
    seriesId: "",
    episodeNumber: 0,
    generatedSessionId: "",
    originalDate: show.date,
    generatedFingerprint: showFingerprint(show),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const exception: ScheduleException = {
    id: createScheduleId("schedule-exception"),
    seriesId: "",
    showId: show.id,
    type: "Inserted Special",
    originalDate: "",
    newDate: show.date,
    note: input.note,
    createdAt: timestamp,
  };
  return {
    show,
    shows: [...shows, show].sort((left, right) => left.date.localeCompare(right.date) || left.name.localeCompare(right.name)),
    universe: {
      ...universe,
      links: [...universe.links, link],
      exceptions: [exception, ...universe.exceptions].slice(0, 250),
      settings: { ...universe.settings, selectedShowId: show.id },
    },
  };
}

export function deleteSeriesKeepShows(universe: PromotionScheduleUniverse, seriesId: string): PromotionScheduleUniverse {
  return {
    ...universe,
    series: universe.series.filter((item) => item.id !== seriesId),
    links: universe.links.map((link) => link.seriesId === seriesId ? { ...link, seriesId: "", episodeNumber: 0, updatedAt: now() } : link),
    exclusions: universe.exclusions.filter((item) => item.seriesId !== seriesId),
    settings: {
      ...universe.settings,
      selectedSeriesId: universe.settings.selectedSeriesId === seriesId ? "" : universe.settings.selectedSeriesId,
    },
  };
}

export function monthCalendarDays(month: string): CalendarDay[] {
  const safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : currentMonth();
  const [year, monthNumber] = safeMonth.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return { date: formatDate(date), inMonth: date.getUTCMonth() === monthNumber - 1 };
  });
}

export function derivePromotionShowStage(show: PlannedShow, summary: UnifiedShowSessionSummary | null): PromotionShowStage {
  if (show.status === "Reconciled" || summary?.segments.every((segment) => segment.status === "Reconciled")) return "Reconciled";
  if (summary?.segments.some((segment) => segment.status === "Reconciliation Needed")) return "Reconciliation Needed";
  if (show.status === "Completed" || summary?.segments.some((segment) => segment.status === "Awaiting Result")) return "Awaiting Results";
  if (summary?.segments.some((segment) => segment.status === "Entering in TEW" || segment.status === "Entered")) return "Entering in TEW";
  if (summary && summary.segmentCount > 0 && summary.segments.every((segment) => segment.status === "Ready for TEW")) return "Ready for TEW";
  if (summary?.segments.some((segment) => segment.status === "Creative In Progress") || summary?.outputsComplete) return "Creative In Progress";
  if (show.segments.length > 0) return "Card Started";
  return "Scheduled";
}

export function nextScheduledShow(
  currentShowId: string,
  shows: PlannedShow[],
  direction: -1 | 1,
  unfinishedOnly = false,
): PlannedShow | null {
  const ordered = [...shows].sort((left, right) => left.date.localeCompare(right.date) || left.name.localeCompare(right.name));
  const currentIndex = ordered.findIndex((show) => show.id === currentShowId);
  if (currentIndex < 0) return ordered[0] ?? null;
  for (let index = currentIndex + direction; index >= 0 && index < ordered.length; index += direction) {
    if (!unfinishedOnly || ordered[index].status !== "Reconciled") return ordered[index];
  }
  return null;
}

function decisionForObligation(key: string, targetShowId: string, decisions: ContinuityDecision[]): ContinuityDecision | null {
  const decision = decisions.find((item) => item.obligationKey === key);
  if (!decision) return null;
  if (decision.status === "Deferred" && decision.targetShowId === targetShowId) return null;
  return decision;
}

function dueOnOrBefore(value: string, showDate: string): boolean {
  return !value || !showDate || dateValue(value) <= dateValue(showDate);
}

export function buildBookingObligations(input: {
  targetShow: PlannedShow;
  shows: PlannedShow[];
  storylines: TrackerStoryline[];
  workers: WorkerUniverse;
  ideas: BookingIdea[];
  championships: ChampionshipUniverse;
  competitions: CompetitionUniverse;
  operations: ShowOperationsUniverse;
  decisions: ContinuityDecision[];
}): BookingObligation[] {
  const { targetShow, shows, storylines, workers, ideas, championships, competitions, operations, decisions } = input;
  const obligations: BookingObligation[] = [];
  const priorShows = shows
    .filter((show) => show.id !== targetShow.id && show.date <= targetShow.date && (show.status === "Reconciled" || Boolean(show.reconciliation?.completedAt)))
    .sort((left, right) => right.date.localeCompare(left.date));
  const previous = priorShows[0];
  previous?.segments.forEach((segment) => {
    const followUp = segment.reconciliation.finalFollowUp || segment.followUp;
    if (!followUp.trim()) return;
    obligations.push({
      key: `follow-up:${segment.id}:${normalize(followUp)}`,
      kind: "Follow-up",
      title: `Follow up: ${segment.title}`,
      detail: followUp,
      sourceShowId: previous.id,
      sourceSegmentId: segment.id,
      sourceStorylineId: segment.storylines[0]?.id ?? "",
      sourceWorkerId: "",
      sourceIdeaId: "",
      sourceChampionshipId: segment.championshipId,
      sourceCompetitionId: segment.competitionId,
      sourceFixtureId: segment.competitionFixtureId,
      dueDate: targetShow.date,
      priority: "Important",
    });
  });

  storylines.forEach((storyline) => storyline.milestones.forEach((milestone) => {
    if (["Completed", "Cancelled"].includes(milestone.status)) return;
    const assignedHere = milestone.assignedShowId === targetShow.id;
    if (!assignedHere && milestone.assignedShowId) return;
    if (!assignedHere && !dueOnOrBefore(milestone.targetDate, targetShow.date)) return;
    obligations.push({
      key: `milestone:${storyline.id}:${milestone.id}`,
      kind: "Storyline Milestone",
      title: `${storyline.name}: ${milestone.title || milestone.type}`,
      detail: milestone.notes || `${milestone.type} milestone is due for booking.`,
      sourceShowId: milestone.assignedShowId,
      sourceSegmentId: "",
      sourceStorylineId: storyline.id,
      sourceWorkerId: "",
      sourceIdeaId: "",
      sourceChampionshipId: "",
      sourceCompetitionId: "",
      sourceFixtureId: "",
      dueDate: milestone.targetDate || targetShow.date,
      priority: assignedHere ? "Blocking" : "Important",
    });
  }));

  ideas.forEach((idea) => {
    if (["Cancelled", "Archived", "Completed"].includes(idea.status) || ideaIsScheduled(idea, shows)) return;
    const assignedHere = idea.targetShowId === targetShow.id;
    const ready = idea.status === "Ready" && (!idea.targetShowId || assignedHere) && dueOnOrBefore(idea.targetDate, targetShow.date);
    if (!assignedHere && !ready) return;
    obligations.push({
      key: `idea:${idea.id}`,
      kind: "Booking Idea",
      title: idea.title,
      detail: idea.concept || idea.creativePurpose || `${idea.type} idea is ready to schedule.`,
      sourceShowId: idea.targetShowId,
      sourceSegmentId: idea.scheduledSegmentId,
      sourceStorylineId: idea.storylines[0]?.id ?? "",
      sourceWorkerId: idea.workers[0]?.id ?? "",
      sourceIdeaId: idea.id,
      sourceChampionshipId: "",
      sourceCompetitionId: "",
      sourceFixtureId: "",
      dueDate: idea.targetDate || targetShow.date,
      priority: assignedHere ? "Important" : "Informational",
    });
  });

  workers.profiles.forEach((worker) => worker.arcs.forEach((arc) => {
    if (!["Planned", "Active"].includes(arc.status)) return;
    const assignedHere = arc.targetShowId === targetShow.id;
    if (!assignedHere && arc.targetShowId) return;
    if (!assignedHere && !arc.targetDate) return;
    if (!assignedHere && !dueOnOrBefore(arc.targetDate, targetShow.date)) return;
    obligations.push({
      key: `arc:${worker.id}:${arc.id}`,
      kind: "Character Arc",
      title: `${worker.displayName}: ${arc.name}`,
      detail: arc.turningPoint || arc.externalConflict || arc.plannedResolution || arc.startingSituation,
      sourceShowId: arc.targetShowId,
      sourceSegmentId: "",
      sourceStorylineId: arc.linkedStorylineId,
      sourceWorkerId: worker.id,
      sourceIdeaId: "",
      sourceChampionshipId: "",
      sourceCompetitionId: "",
      sourceFixtureId: "",
      dueDate: arc.targetDate || targetShow.date,
      priority: assignedHere ? "Important" : "Informational",
    });
  }));

  championships.championships.forEach((championship) => {
    if (championship.currentProgram.targetPayoffShowId === targetShow.id) {
      obligations.push({
        key: `championship-program:${championship.id}:${targetShow.id}`,
        kind: "Championship Program",
        title: `${championship.name} program payoff`,
        detail: championship.currentProgram.summary || "The championship program is targeted for this show.",
        sourceShowId: targetShow.id,
        sourceSegmentId: "",
        sourceStorylineId: championship.currentProgram.linkedStorylineId,
        sourceWorkerId: "",
        sourceIdeaId: championship.currentProgram.linkedBookingIdeaIds[0] ?? "",
        sourceChampionshipId: championship.id,
        sourceCompetitionId: "",
        sourceFixtureId: "",
        dueDate: targetShow.date,
        priority: "Blocking",
      });
    }
    if (championship.status === "Vacant") {
      const hasPlan = shows.some((show) => show.date >= targetShow.date && show.segments.some((segment) => segment.type === "match" && (segment.championshipId === championship.id || normalize(segment.championship) === normalize(championship.name))));
      if (!hasPlan) obligations.push({
        key: `vacant-title:${championship.id}`,
        kind: "Vacant Championship",
        title: `${championship.name} is vacant`,
        detail: "No future match currently resolves this vacant championship.",
        sourceShowId: "",
        sourceSegmentId: "",
        sourceStorylineId: championship.linkedStorylineId,
        sourceWorkerId: "",
        sourceIdeaId: "",
        sourceChampionshipId: championship.id,
        sourceCompetitionId: "",
        sourceFixtureId: "",
        dueDate: targetShow.date,
        priority: "Important",
      });
    }
  });

  competitions.competitions.forEach((competition) => competition.fixtures.forEach((fixture) => {
    if (fixture.plannedSegmentId || !fixture.participantAId || !fixture.participantBId || !["Unscheduled", "Scheduled"].includes(fixture.status)) return;
    const participantA = competition.participants.find((participant) => participant.id === fixture.participantAId)?.name ?? "TBD";
    const participantB = competition.participants.find((participant) => participant.id === fixture.participantBId)?.name ?? "TBD";
    obligations.push({
      key: `competition:${competition.id}:${fixture.id}`,
      kind: "Competition Fixture",
      title: `${competition.name}: ${fixture.roundLabel}`,
      detail: `${participantA} vs ${participantB} is ready to place on a show.`,
      sourceShowId: fixture.scheduledShowId,
      sourceSegmentId: fixture.plannedSegmentId,
      sourceStorylineId: competition.linkedStorylineId,
      sourceWorkerId: "",
      sourceIdeaId: "",
      sourceChampionshipId: competition.linkedChampionshipId,
      sourceCompetitionId: competition.id,
      sourceFixtureId: fixture.id,
      dueDate: targetShow.date,
      priority: fixture.scheduledShowId === targetShow.id ? "Blocking" : "Informational",
    });
  }));

  operations.records.find((record) => record.showId === targetShow.id)?.changeNotes
    .filter((note) => note.requiresNewVersion)
    .forEach((note) => obligations.push({
      key: `revision:${note.id}`,
      kind: "TEW Entry Revision",
      title: `TEW entry change requires a new version: ${note.field}`,
      detail: `${note.originalValue} → ${note.enteredValue}. ${note.reason}`,
      sourceShowId: note.showId,
      sourceSegmentId: note.segmentId,
      sourceStorylineId: "",
      sourceWorkerId: "",
      sourceIdeaId: "",
      sourceChampionshipId: "",
      sourceCompetitionId: "",
      sourceFixtureId: "",
      dueDate: targetShow.date,
      priority: "Blocking",
    }));

  const unique = new Map<string, BookingObligation>();
  obligations.forEach((obligation) => {
    const decision = decisionForObligation(obligation.key, targetShow.id, decisions);
    if (!decision) unique.set(obligation.key, obligation);
  });
  decisions.filter((decision) => decision.status === "Deferred" && decision.targetShowId === targetShow.id).forEach((decision) => {
    if (unique.has(decision.obligationKey)) return;
    const source = obligations.find((obligation) => obligation.key === decision.obligationKey);
    if (source) unique.set(source.key, source);
  });
  return [...unique.values()].sort((left, right) => {
    const priority = { Blocking: 0, Important: 1, Informational: 2 };
    return priority[left.priority] - priority[right.priority] || left.dueDate.localeCompare(right.dueDate) || left.title.localeCompare(right.title);
  });
}

export function createContinuityDecision(
  obligationKey: string,
  showId: string,
  status: BookingObligationDecisionStatus,
  targetShowId = "",
  targetSegmentId = "",
  reason = "",
): ContinuityDecision {
  const timestamp = now();
  return {
    id: createScheduleId("continuity-decision"),
    obligationKey,
    showId,
    status,
    targetShowId,
    targetSegmentId,
    reason,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function upsertContinuityDecision(universe: PromotionScheduleUniverse, decision: ContinuityDecision): PromotionScheduleUniverse {
  const existing = universe.continuityDecisions.find((item) => item.obligationKey === decision.obligationKey);
  return {
    ...universe,
    continuityDecisions: existing
      ? universe.continuityDecisions.map((item) => item.id === existing.id ? { ...decision, id: existing.id, createdAt: existing.createdAt, updatedAt: now() } : item)
      : [decision, ...universe.continuityDecisions].slice(0, 500),
  };
}

export function obligationToSegment(obligation: BookingObligation, type: "match" | "angle"): PlannedSegment {
  const segment = createPlannedSegment(type);
  return {
    ...segment,
    title: obligation.title,
    notes: obligation.detail,
    purpose: obligation.detail,
    privateNotes: `Promotion Calendar obligation: ${obligation.kind}\nSource key: ${obligation.key}`,
    storylines: obligation.sourceStorylineId ? [{ id: obligation.sourceStorylineId, name: obligation.title.split(":")[0], source: "manual" }] : [],
    championshipId: type === "match" ? obligation.sourceChampionshipId : "",
    competitionId: type === "match" ? obligation.sourceCompetitionId : "",
    competitionFixtureId: type === "match" ? obligation.sourceFixtureId : "",
  };
}

export function attachObligationToSegment(segment: PlannedSegment, obligation: BookingObligation): PlannedSegment {
  return {
    ...segment,
    notes: appendText(segment.notes, obligation.detail),
    privateNotes: appendText(segment.privateNotes, `Promotion Calendar obligation: ${obligation.title}\nSource key: ${obligation.key}`),
    storylines: obligation.sourceStorylineId && !segment.storylines.some((storyline) => storyline.id === obligation.sourceStorylineId)
      ? [...segment.storylines, { id: obligation.sourceStorylineId, name: obligation.title.split(":")[0], source: "manual" }]
      : segment.storylines,
  };
}

export function buildCalendarIntegrityIssues(
  universe: PromotionScheduleUniverse,
  shows: PlannedShow[],
  competitions: CompetitionUniverse,
  storylines: TrackerStoryline[],
  ideas: BookingIdea[],
): CalendarIntegrityIssue[] {
  const issues: CalendarIntegrityIssue[] = [];
  const showIds = new Set(shows.map((show) => show.id));
  const seriesIds = new Set(universe.series.map((series) => series.id));
  const linkedEpisodes = new Map<string, ScheduleShowLink[]>();

  universe.links.forEach((link) => {
    if (!showIds.has(link.showId)) issues.push({ id: `orphan-link:${link.id}`, severity: "Important", message: "A schedule link points to a deleted show.", detail: link.showId, showId: link.showId, seriesId: link.seriesId });
    if (link.seriesId && !seriesIds.has(link.seriesId)) issues.push({ id: `orphan-series:${link.id}`, severity: "Important", message: "A show points to a deleted series.", detail: "Reassign it as a one-off or to another series.", showId: link.showId, seriesId: link.seriesId });
    if (link.seriesId && link.episodeNumber > 0) {
      const key = `${link.seriesId}:${link.episodeNumber}`;
      linkedEpisodes.set(key, [...(linkedEpisodes.get(key) ?? []), link]);
    }
  });
  linkedEpisodes.forEach((links, key) => {
    if (links.length > 1) issues.push({ id: `duplicate-episode:${key}`, severity: "Blocking", message: "Two shows use the same series episode number.", detail: links.map((link) => link.showId).join(", "), showId: links[0].showId, seriesId: links[0].seriesId });
  });

  const showsByDate = new Map<string, PlannedShow[]>();
  shows.forEach((show) => showsByDate.set(show.date, [...(showsByDate.get(show.date) ?? []), show]));
  showsByDate.forEach((items, date) => {
    if (date && items.length > 1) issues.push({ id: `same-date:${date}`, severity: "Informational", message: `${items.length} shows are scheduled on ${date}.`, detail: "Confirm that the overlap is intentional.", showId: items[0].id, seriesId: "" });
  });

  universe.links.forEach((link) => {
    const show = shows.find((item) => item.id === link.showId);
    const series = universe.series.find((item) => item.id === link.seriesId);
    if (!show || !series) return;
    if (series.startDate && show.date < series.startDate) issues.push({ id: `before-range:${link.id}`, severity: "Important", message: `${show.name} falls before ${series.name} begins.`, detail: `${show.date} < ${series.startDate}`, showId: show.id, seriesId: series.id });
    if (series.endDate && show.date > series.endDate) issues.push({ id: `after-range:${link.id}`, severity: "Important", message: `${show.name} falls after ${series.name} ends.`, detail: `${show.date} > ${series.endDate}`, showId: show.id, seriesId: series.id });
    if (show.status === "Reconciled" && link.generatedFingerprint !== showFingerprint(show)) issues.push({ id: `reconciled-edited:${link.id}`, severity: "Blocking", message: "A reconciled generated show differs from its recorded schedule version.", detail: "Do not regenerate or overwrite completed history.", showId: show.id, seriesId: series.id });
  });

  competitions.competitions.forEach((competition) => competition.fixtures.forEach((fixture) => {
    if (fixture.scheduledShowId && !showIds.has(fixture.scheduledShowId)) issues.push({ id: `fixture-show:${fixture.id}`, severity: "Important", message: `${competition.name} ${fixture.roundLabel} points to a deleted show.`, detail: fixture.scheduledShowId, showId: fixture.scheduledShowId, seriesId: "" });
  }));
  storylines.forEach((storyline) => storyline.milestones.forEach((milestone) => {
    if (milestone.assignedShowId && !showIds.has(milestone.assignedShowId)) issues.push({ id: `milestone-show:${milestone.id}`, severity: "Important", message: `${storyline.name}: ${milestone.title} points to a deleted or skipped show.`, detail: milestone.assignedShowId, showId: milestone.assignedShowId, seriesId: "" });
  }));
  ideas.forEach((idea) => {
    if (idea.targetShowId && !showIds.has(idea.targetShowId)) issues.push({ id: `idea-show:${idea.id}`, severity: "Important", message: `${idea.title} points to a deleted or skipped show.`, detail: idea.targetShowId, showId: idea.targetShowId, seriesId: "" });
  });
  return issues;
}
