import { liveCardReadiness } from "../liveCard/model";
import { loadPlannedShows, savePlannedShows } from "../planner/storage";
import type { PlannedShow } from "../planner/types";
import { alignDateToDay, applySeriesGeneration, createScheduleId, formatSeriesShowName, showFingerprint } from "../schedule/model";
import { loadPromotionScheduleUniverse, savePromotionScheduleUniverse } from "../schedule/storage";
import type { PromotionScheduleUniverse, ScheduleShowLink, ShowSeries } from "../schedule/types";
import type { StartingUniverseActivationState } from "./activation";

export interface PlayableFirstDayResult {
  schedule: PromotionScheduleUniverse;
  shows: PlannedShow[];
  nextShow: PlannedShow | null;
  created: boolean;
}

function activeWeeklySeries(activation: StartingUniverseActivationState, schedule: PromotionScheduleUniverse): ShowSeries | null {
  const selected = schedule.series.find((series) => series.id === schedule.settings.selectedSeriesId);
  if (selected?.status === "Active" && selected.category === "Weekly Television") return selected;
  return schedule.series.find((series) => series.status === "Active" && series.category === "Weekly Television" && (!activation.activeCompanyName || series.company === activation.activeCompanyName)) ?? null;
}

function connectExistingShow(schedule: PromotionScheduleUniverse, series: ShowSeries, show: PlannedShow, date: string): PromotionScheduleUniverse {
  const timestamp = new Date().toISOString();
  const link: ScheduleShowLink = {
    id: createScheduleId("quick-start-link"), showId: show.id, seriesId: series.id,
    episodeNumber: Math.max(1, series.startingEpisodeNumber), generatedSessionId: "starting-universe-quick-start",
    originalDate: date, generatedFingerprint: showFingerprint(show), createdAt: timestamp, updatedAt: timestamp,
  };
  return { ...schedule, links: [...schedule.links, link], settings: { ...schedule.settings, selectedSeriesId: series.id, selectedShowId: show.id, month: date.slice(0, 7) } };
}

export function ensurePlayableFirstDay(activation: StartingUniverseActivationState, schedule: PromotionScheduleUniverse, shows: PlannedShow[]): PlayableFirstDayResult {
  const series = activeWeeklySeries(activation, schedule);
  if (!series || !activation.gameDate) return { schedule, shows, nextShow: null, created: false };
  const linked = schedule.links.filter((link) => link.seriesId === series.id)
    .sort((left, right) => left.originalDate.localeCompare(right.originalDate) || left.episodeNumber - right.episodeNumber)
    .map((link) => shows.find((show) => show.id === link.showId)).find((show): show is PlannedShow => Boolean(show));
  if (linked) return { schedule: { ...schedule, settings: { ...schedule.settings, selectedSeriesId: series.id, selectedShowId: linked.id, month: linked.date.slice(0, 7) } }, shows, nextShow: linked, created: false };

  const date = alignDateToDay(activation.gameDate, series.defaultDayOfWeek);
  const name = formatSeriesShowName(series, Math.max(1, series.startingEpisodeNumber), date);
  const existing = shows.find((show) => show.date === date && show.company === series.company && show.name === name);
  if (existing) return { schedule: connectExistingShow(schedule, series, existing, date), shows, nextShow: existing, created: false };

  const generated = applySeriesGeneration(series, schedule, shows, [{
    id: `quick-start:${series.id}:${date}`, seriesId: series.id, date, showName: name,
    episodeNumber: Math.max(1, series.startingEpisodeNumber), status: "New", existingShowId: "", conflictShowIds: [],
    reason: "Created automatically from the activated Starting Universe.",
  }], { mode: "count", count: 1, throughDate: "" });
  const nextShow = generated.shows.find((show) => generated.session.generatedShowIds.includes(show.id)) ?? null;
  return { schedule: generated.universe, shows: generated.shows, nextShow, created: Boolean(nextShow) };
}

export function ensurePlayableFirstDayInStorage(storage: Storage, activation: StartingUniverseActivationState): PlayableFirstDayResult {
  const result = ensurePlayableFirstDay(activation, loadPromotionScheduleUniverse(storage), loadPlannedShows(storage));
  savePromotionScheduleUniverse(storage, result.schedule);
  savePlannedShows(storage, result.shows);
  return result;
}

export function firstDayReadiness(show: PlannedShow | null): { ready: boolean; blockers: string[] } {
  return show ? liveCardReadiness(show) : { ready: false, blockers: ["Activate an on-air weekly television series to create the next show."] };
}
