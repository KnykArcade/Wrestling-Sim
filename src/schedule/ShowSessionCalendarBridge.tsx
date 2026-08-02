import { useEffect, useMemo, useState } from "react";
import { loadPlannedShows } from "../planner/storage";
import type { PlannedShow } from "../planner/types";
import { showSessionRecord, upsertShowSessionRecord } from "../showSession/model";
import { loadShowSessionUniverse, saveShowSessionUniverse } from "../showSession/storage";
import { ensureScheduleLinks, linkForShow, nextScheduledShow, seriesForShow } from "./model";
import { loadPromotionScheduleUniverse, savePromotionScheduleUniverse } from "./storage";

interface ShowSessionCalendarBridgeProps {
  onOpenCalendar: () => void;
  onOpenShow: (showId: string) => void;
}

function readCurrent(): { shows: PlannedShow[]; showId: string } {
  const shows = loadPlannedShows(window.localStorage);
  const sessions = loadShowSessionUniverse(window.localStorage);
  return { shows, showId: sessions.lastShowId || shows[0]?.id || "" };
}

export default function ShowSessionCalendarBridge({ onOpenCalendar, onOpenShow }: ShowSessionCalendarBridgeProps) {
  const [current, setCurrent] = useState(readCurrent);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = readCurrent();
      setCurrent((existing) => existing.showId === next.showId && existing.shows.length === next.shows.length
        ? existing
        : next);
    }, 800);
    return () => window.clearInterval(timer);
  }, []);

  const schedule = useMemo(() => {
    const ensured = ensureScheduleLinks(current.shows, loadPromotionScheduleUniverse(window.localStorage));
    savePromotionScheduleUniverse(window.localStorage, ensured);
    return ensured;
  }, [current.shows]);
  const show = current.shows.find((item) => item.id === current.showId) ?? current.shows[0] ?? null;
  const series = show ? seriesForShow(show.id, schedule) : null;
  const link = show ? linkForShow(show.id, schedule) : null;
  const previous = show ? nextScheduledShow(show.id, current.shows, -1) : null;
  const next = show ? nextScheduledShow(show.id, current.shows, 1) : null;
  const nextUnfinished = show ? nextScheduledShow(show.id, current.shows, 1, true) : null;

  function selectShow(target: PlannedShow | null): void {
    if (!target) return;
    const sessions = loadShowSessionUniverse(window.localStorage);
    const record = showSessionRecord(target.id, sessions, target.segments[0]?.id ?? "");
    saveShowSessionUniverse(window.localStorage, upsertShowSessionRecord(sessions, {
      ...record,
      selectedSegmentId: target.segments.some((segment) => segment.id === record.selectedSegmentId)
        ? record.selectedSegmentId
        : target.segments[0]?.id ?? "",
      activeStep: "overview",
      lastOpenedAt: new Date().toISOString(),
    }));
    savePromotionScheduleUniverse(window.localStorage, {
      ...schedule,
      settings: { ...schedule.settings, selectedShowId: target.id },
    });
    onOpenShow(target.id);
  }

  if (!show) return null;

  return <section className="session-calendar-bridge" aria-label="Promotion calendar navigation">
    <div>
      <span>Promotion schedule</span>
      <strong>{series ? `${series.name}${link?.episodeNumber ? ` · Episode ${link.episodeNumber}` : ""}` : "One-Off / Unassigned Series"}</strong>
      <small>{show.date || "Unscheduled"} · {show.status}</small>
    </div>
    <nav>
      <button className="secondary-button" type="button" onClick={onOpenCalendar}>Return to Promotion Calendar</button>
      <button className="secondary-button" type="button" disabled={!previous} onClick={() => selectShow(previous)}>Previous Scheduled Show</button>
      <button className="secondary-button" type="button" disabled={!next} onClick={() => selectShow(next)}>Next Scheduled Show</button>
      <button className="primary-button" type="button" disabled={!nextUnfinished} onClick={() => selectShow(nextUnfinished)}>{show.status === "Reconciled" ? "Complete This Show and Continue" : "Next Unfinished Show"}</button>
    </nav>
  </section>;
}
