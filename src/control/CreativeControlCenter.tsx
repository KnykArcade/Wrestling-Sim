import { useEffect, useMemo, useState } from "react";
import { loadPlannedShows, savePlannedShows } from "../planner/storage";
import type { PlannedShow } from "../planner/types";
import { loadTrackerStorylines } from "../storylines/storage";
import type { TrackerStoryline } from "../storylines/types";
import type { TewSnapshot } from "../tew/types";
import { loadWorkerUniverse } from "../workers/storage";
import type { WorkerUniverse } from "../workers/types";
import {
  buildControlWarnings,
  buildCreativeCalendar,
  buildShowReadiness,
  createBookingIdea,
  globalSearch,
  ideaIsScheduled,
  nextIdeaStatus,
  scheduleIdea,
  touchBookingIdea,
} from "./model";
import { loadCreativeControlData, saveCreativeControlData } from "./storage";
import type { BookingIdea, BookingIdeaStatus, CreativeControlData } from "./types";

type ControlView = "dashboard" | "board" | "calendar" | "search";

const ideaTypes: BookingIdea["type"][] = [
  "Match", "Angle", "Promo", "Debut", "Return", "Turn", "Betrayal", "Title Change",
  "Challenge", "Reveal", "Mystery", "Interference", "Injury Story", "Custom",
];
const ideaStatuses: BookingIdea["status"][] = [
  "Inbox", "Developing", "Ready", "Scheduled", "Completed", "Delayed", "Cancelled", "Archived",
];
const priorities: BookingIdea["priority"][] = ["Low", "Normal", "High", "Critical"];

function dateLabel(value: string): string {
  if (!value) return "No date";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function daysFromToday(value: string): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const target = Date.parse(`${value}T12:00:00`);
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T12:00:00`);
  return Number.isNaN(target) ? Number.MAX_SAFE_INTEGER : Math.ceil((target - today) / 86400000);
}

export default function CreativeControlCenter({
  snapshot,
  onOpenShow,
  onOpenStoryline,
  onOpenWorker,
}: {
  snapshot: TewSnapshot | null;
  onOpenShow: (showId: string, segmentId: string) => void;
  onOpenStoryline: (storylineId: string) => void;
  onOpenWorker: (workerId: string) => void;
}) {
  const [view, setView] = useState<ControlView>("dashboard");
  const [shows, setShows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [storylines] = useState<TrackerStoryline[]>(() => loadTrackerStorylines(window.localStorage));
  const [workers] = useState<WorkerUniverse>(() => loadWorkerUniverse(window.localStorage));
  const [control, setControl] = useState<CreativeControlData>(() => loadCreativeControlData(window.localStorage));
  const [selectedId, setSelectedId] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [notice, setNotice] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [storylineId, setStorylineId] = useState("");

  useEffect(() => saveCreativeControlData(window.localStorage, control), [control]);
  useEffect(() => {
    if (!selectedId && control.ideas[0]) setSelectedId(control.ideas[0].id);
  }, [control.ideas, selectedId]);

  const selected = control.ideas.find((idea) => idea.id === selectedId) ?? control.ideas[0] ?? null;
  const calendar = useMemo(() => buildCreativeCalendar(shows, storylines, workers, control.ideas), [shows, storylines, workers, control.ideas]);
  const warnings = useMemo(() => buildControlWarnings(shows, storylines, workers, control.ideas), [shows, storylines, workers, control.ideas]);
  const searchResults = useMemo(() => globalSearch(control.settings.searchQuery, shows, storylines, workers, control.ideas), [control.settings.searchQuery, shows, storylines, workers, control.ideas]);
  const upcomingShows = shows.filter((show) => daysFromToday(show.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const recentShows = shows.filter((show) => show.status === "Completed" || show.status === "Reconciled").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const awaitingReconciliation = shows.filter((show) => show.status === "Completed" && !show.reconciliation);
  const dueMilestones = storylines.flatMap((storyline) => storyline.milestones.filter((milestone) => milestone.status !== "Completed" && milestone.status !== "Cancelled" && daysFromToday(milestone.targetDate) <= control.settings.dashboardWindowDays).map((milestone) => ({ storyline, milestone }))).sort((a, b) => a.milestone.targetDate.localeCompare(b.milestone.targetDate));
  const filteredIdeas = control.ideas.filter((idea) => statusFilter === "All" || idea.status === statusFilter);

  function updateSelected(updater: (idea: BookingIdea) => BookingIdea): void {
    if (!selected) return;
    setControl((current) => ({ ...current, ideas: current.ideas.map((idea) => idea.id === selected.id ? touchBookingIdea(updater(idea)) : idea) }));
  }

  function addIdea(): void {
    const idea = createBookingIdea(control.ideas.length + 1);
    setControl((current) => ({ ...current, ideas: [idea, ...current.ideas] }));
    setSelectedId(idea.id);
    setView("board");
    setNotice("New booking idea added to the Inbox.");
  }

  function deleteIdea(): void {
    if (!selected || !window.confirm(`Delete ${selected.title}?`)) return;
    const remaining = control.ideas.filter((idea) => idea.id !== selected.id);
    setControl((current) => ({ ...current, ideas: remaining }));
    setSelectedId(remaining[0]?.id ?? "");
    setNotice("Booking idea deleted.");
  }

  function advanceIdea(): void {
    if (!selected) return;
    const status = nextIdeaStatus(selected.status);
    updateSelected((idea) => ({ ...idea, status, completedAt: status === "Completed" ? new Date().toISOString() : idea.completedAt }));
    setNotice(`${selected.title} moved to ${status}.`);
  }

  function convertSelected(): void {
    if (!selected) return;
    try {
      const result = scheduleIdea(selected, shows);
      setShows(result.shows);
      savePlannedShows(window.localStorage, result.shows);
      setControl((current) => ({ ...current, ideas: current.ideas.map((idea) => idea.id === selected.id ? result.idea : idea) }));
      setNotice(`${selected.title} was added to ${shows.find((show) => show.id === selected.targetShowId)?.name ?? "the target show"}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The idea could not be scheduled.");
    }
  }

  function addWorker(): void {
    if (!selected || !workerId) return;
    const profile = workers.profiles.find((item) => item.id === workerId);
    const tewWorker = snapshot?.workers.find((item) => item.id === workerId);
    const name = profile?.displayName ?? tewWorker?.name ?? "";
    if (!name || selected.workers.some((worker) => worker.name.toLowerCase() === name.toLowerCase())) return;
    updateSelected((idea) => ({ ...idea, workers: [...idea.workers, { id: workerId, name, role: "Participant" }] }));
    setWorkerId("");
  }

  function addStoryline(): void {
    if (!selected || !storylineId) return;
    const storyline = storylines.find((item) => item.id === storylineId);
    if (!storyline || selected.storylines.some((item) => item.id === storyline.id)) return;
    updateSelected((idea) => ({ ...idea, storylines: [...idea.storylines, { id: storyline.id, name: storyline.name }] }));
    setStorylineId("");
  }

  function openResult(result: ReturnType<typeof globalSearch>[number]): void {
    if (result.showId) {
      onOpenShow(result.showId, result.segmentId);
      return;
    }
    if (result.storylineId) {
      onOpenStoryline(result.storylineId);
      return;
    }
    if (result.workerId) {
      onOpenWorker(result.workerId);
      return;
    }
    if (result.ideaId) {
      setSelectedId(result.ideaId);
      setView("board");
    }
  }

  return <section className="control-center">
    <header className="control-toolbar">
      <div><p className="eyebrow">CREATIVE CONTROL CENTER</p><h2>Run the whole booking universe from one workspace</h2><p>Capture ideas, schedule future developments, check show readiness, and resolve continuity gaps.</p></div>
      <button className="primary-button" type="button" onClick={addIdea}>Create Booking Idea</button>
    </header>

    <nav className="control-tabs" aria-label="Creative Control Center sections">
      <button type="button" className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>Dashboard</button>
      <button type="button" className={view === "board" ? "active" : ""} onClick={() => setView("board")}>Future Booking Board</button>
      <button type="button" className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}>Creative Calendar</button>
      <button type="button" className={view === "search" ? "active" : ""} onClick={() => setView("search")}>Global Search</button>
    </nav>

    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    {view === "dashboard" && <div className="control-dashboard">
      <section className="control-metrics">
        <div><span>Upcoming shows</span><strong>{upcomingShows.length}</strong></div>
        <div><span>Awaiting reconciliation</span><strong>{awaitingReconciliation.length}</strong></div>
        <div><span>Active storylines</span><strong>{storylines.filter((storyline) => storyline.status === "Active").length}</strong></div>
        <div><span>Open booking ideas</span><strong>{control.ideas.filter((idea) => !["Completed", "Cancelled", "Archived"].includes(idea.status)).length}</strong></div>
        <div><span>Continuity warnings</span><strong>{warnings.length}</strong></div>
      </section>

      <div className="dashboard-grid">
        <section className="control-panel"><header><div><p className="eyebrow">UPCOMING SHOWS</p><h3>Readiness and next actions</h3></div></header>
          {upcomingShows.length === 0 ? <p className="empty-state compact">No upcoming planned shows.</p> : upcomingShows.slice(0, 8).map((show) => {
            const readiness = buildShowReadiness(show, control.ideas, storylines);
            return <article className="readiness-card" key={show.id}>
              <div><strong>{show.name}</strong><span>{dateLabel(show.date)} · {readiness.bookedMinutes}/{readiness.expectedMinutes} minutes</span></div>
              <b>{readiness.score}% ready</b>
              <p>{readiness.issues[0]?.message ?? "No readiness issues detected."}</p>
              <button type="button" onClick={() => onOpenShow(show.id, "")}>Open Show</button>
            </article>;
          })}
        </section>

        <section className="control-panel"><header><div><p className="eyebrow">CONTINUITY CENTER</p><h3>Needs attention</h3></div><strong>{warnings.length}</strong></header>
          {warnings.length === 0 ? <p className="empty-state compact">No cross-system warnings.</p> : warnings.slice(0, 12).map((warning) => <button className="warning-row" type="button" key={warning.id} onClick={() => warning.showId ? onOpenShow(warning.showId, "") : warning.storylineId ? onOpenStoryline(warning.storylineId) : warning.workerId ? onOpenWorker(warning.workerId) : warning.ideaId ? (setSelectedId(warning.ideaId), setView("board")) : undefined}><span>{warning.category}</span><strong>{warning.message}</strong></button>)}
        </section>

        <section className="control-panel"><header><div><p className="eyebrow">DUE SOON</p><h3>Storyline milestones</h3></div><strong>{dueMilestones.length}</strong></header>
          {dueMilestones.length === 0 ? <p className="empty-state compact">No milestones due in the dashboard window.</p> : dueMilestones.slice(0, 10).map(({ storyline, milestone }) => <button className="dashboard-list-row" type="button" key={milestone.id} onClick={() => onOpenStoryline(storyline.id)}><strong>{milestone.title}</strong><span>{storyline.name} · {dateLabel(milestone.targetDate)} · {milestone.status}</span></button>)}
        </section>

        <section className="control-panel"><header><div><p className="eyebrow">RECENT HISTORY</p><h3>Completed shows</h3></div></header>
          {recentShows.length === 0 ? <p className="empty-state compact">No completed shows yet.</p> : recentShows.map((show) => <button className="dashboard-list-row" type="button" key={show.id} onClick={() => onOpenShow(show.id, "")}><strong>{show.name}</strong><span>{dateLabel(show.date)} · {show.status}</span></button>)}
        </section>
      </div>
    </div>}

    {view === "board" && <div className="booking-board-layout">
      <aside className="idea-list">
        <div className="idea-list-filters"><select aria-label="Filter booking idea status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All</option>{ideaStatuses.map((status) => <option key={status}>{status}</option>)}</select></div>
        <div className="panel-heading"><span>Booking Ideas</span><strong>{filteredIdeas.length}</strong></div>
        {filteredIdeas.length === 0 ? <div className="empty-state compact">No booking ideas in this view.</div> : filteredIdeas.map((idea) => <button type="button" className={selected?.id === idea.id ? "selected" : ""} key={idea.id} onClick={() => setSelectedId(idea.id)}><strong>{idea.title}</strong><span>{idea.status} · {idea.type}</span><small>{idea.targetDate ? dateLabel(idea.targetDate) : "No target date"} · {idea.priority}</small>{idea.scheduledSegmentId && <em>Scheduled</em>}</button>)}
      </aside>

      {!selected ? <section className="control-panel empty-state"><h3>Create your first booking idea</h3><button className="primary-button" type="button" onClick={addIdea}>Create Booking Idea</button></section> : <div className="idea-editor">
        <section className="control-panel">
          <header className="idea-editor-header"><div><p className="eyebrow">BOOKING IDEA</p><h3>{selected.title}</h3></div><div><button className="secondary-button" type="button" onClick={advanceIdea} disabled={["Completed", "Cancelled", "Archived"].includes(selected.status)}>Advance Workflow</button><button className="danger-button" type="button" onClick={deleteIdea}>Delete</button></div></header>
          <div className="idea-form-grid">
            <label className="field field--wide"><span>Idea title</span><input value={selected.title} onChange={(event) => updateSelected((idea) => ({ ...idea, title: event.target.value }))} /></label>
            <label className="field"><span>Type</span><select aria-label="Booking idea type" value={selected.type} onChange={(event) => updateSelected((idea) => ({ ...idea, type: event.target.value as BookingIdea["type"] }))}>{ideaTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label className="field"><span>Status</span><select aria-label="Booking idea status" value={selected.status} onChange={(event) => updateSelected((idea) => ({ ...idea, status: event.target.value as BookingIdeaStatus }))}>{ideaStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label className="field"><span>Priority</span><select value={selected.priority} onChange={(event) => updateSelected((idea) => ({ ...idea, priority: event.target.value as BookingIdea["priority"] }))}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
            <label className="field"><span>Target date</span><input type="date" value={selected.targetDate} onChange={(event) => updateSelected((idea) => ({ ...idea, targetDate: event.target.value }))} /></label>
            <label className="field field--wide"><span>Target show</span><select aria-label="Target show" value={selected.targetShowId} onChange={(event) => updateSelected((idea) => ({ ...idea, targetShowId: event.target.value }))}><option value="">Unassigned</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name} — {show.date}</option>)}</select></label>
            <label className="field field--wide"><span>Championship</span><input value={selected.championship} onChange={(event) => updateSelected((idea) => ({ ...idea, championship: event.target.value }))} /></label>
            <label className="field field--full"><span>Full concept</span><textarea rows={7} value={selected.concept} onChange={(event) => updateSelected((idea) => ({ ...idea, concept: event.target.value }))} /></label>
            <label className="field field--wide"><span>Creative purpose</span><textarea rows={4} value={selected.creativePurpose} onChange={(event) => updateSelected((idea) => ({ ...idea, creativePurpose: event.target.value }))} /></label>
            <label className="field field--wide"><span>Planned consequences</span><textarea rows={4} value={selected.plannedConsequences} onChange={(event) => updateSelected((idea) => ({ ...idea, plannedConsequences: event.target.value }))} /></label>
            <label className="field field--wide"><span>Follow-up</span><textarea rows={4} value={selected.followUp} onChange={(event) => updateSelected((idea) => ({ ...idea, followUp: event.target.value }))} /></label>
            <label className="field field--wide"><span>Private notes</span><textarea rows={4} value={selected.privateNotes} onChange={(event) => updateSelected((idea) => ({ ...idea, privateNotes: event.target.value }))} /></label>
          </div>
        </section>

        <section className="control-panel"><header><div><p className="eyebrow">CONNECTIONS</p><h3>Workers and storylines</h3></div></header>
          <div className="connection-add-grid">
            <div><select aria-label="Booking idea worker" value={workerId} onChange={(event) => setWorkerId(event.target.value)}><option value="">Select worker</option>{workers.profiles.map((worker) => <option key={worker.id} value={worker.id}>{worker.displayName}</option>)}{snapshot?.workers.filter((worker) => !workers.profiles.some((profile) => profile.linkedTewWorkerId === worker.id)).map((worker) => <option key={`tew-${worker.id}`} value={worker.id}>{worker.name} (TEW)</option>)}</select><button type="button" onClick={addWorker} disabled={!workerId}>Add Worker</button></div>
            <div><select aria-label="Booking idea storyline" value={storylineId} onChange={(event) => setStorylineId(event.target.value)}><option value="">Select storyline</option>{storylines.map((storyline) => <option key={storyline.id} value={storyline.id}>{storyline.name}</option>)}</select><button type="button" onClick={addStoryline} disabled={!storylineId}>Add Storyline</button></div>
          </div>
          <div className="idea-chip-list">{selected.workers.map((worker) => <span key={`${worker.id}-${worker.name}`}><b>{worker.name}</b><input aria-label={`Role for ${worker.name}`} value={worker.role} onChange={(event) => updateSelected((idea) => ({ ...idea, workers: idea.workers.map((item) => item.id === worker.id ? { ...item, role: event.target.value } : item) }))} /><button type="button" aria-label={`Remove ${worker.name}`} onClick={() => updateSelected((idea) => ({ ...idea, workers: idea.workers.filter((item) => item.id !== worker.id) }))}>×</button></span>)}{selected.storylines.map((storyline) => <span key={storyline.id}><b>{storyline.name}</b><button type="button" aria-label={`Remove ${storyline.name}`} onClick={() => updateSelected((idea) => ({ ...idea, storylines: idea.storylines.filter((item) => item.id !== storyline.id) }))}>×</button></span>)}</div>
        </section>

        <section className="control-panel schedule-panel"><div><p className="eyebrow">SCHEDULE TO CARD</p><h3>{selected.scheduledSegmentId ? "Idea is already on a card" : "Convert this idea into a show segment"}</h3><p>Workers, storylines, concept, purpose, consequences, follow-up, championship, and the booking-idea reference will carry into the new segment.</p></div><button className="primary-button" type="button" onClick={convertSelected} disabled={!selected.targetShowId || ideaIsScheduled(selected, shows)}>{selected.scheduledSegmentId ? "Already Scheduled" : "Add to Target Show"}</button>{selected.scheduledSegmentId && selected.targetShowId && <button className="secondary-button" type="button" onClick={() => onOpenShow(selected.targetShowId, selected.scheduledSegmentId)}>Open Scheduled Segment</button>}</section>
      </div>}
    </div>}

    {view === "calendar" && <section className="control-panel calendar-panel">
      <header><div><p className="eyebrow">CREATIVE CALENDAR</p><h3>Shows, milestones, arcs, and booking ideas</h3></div><select aria-label="Calendar filter" value={control.settings.calendarFilter} onChange={(event) => setControl((current) => ({ ...current, settings: { ...current.settings, calendarFilter: event.target.value as CreativeControlData["settings"]["calendarFilter"] } }))}><option>All</option><option>Shows</option><option>Milestones</option><option>Arcs</option><option>Ideas</option></select></header>
      <div className="calendar-list">{calendar.filter((entry) => control.settings.calendarFilter === "All" || `${entry.type}s` === control.settings.calendarFilter).map((entry) => <button type="button" key={entry.id} onClick={() => entry.showId ? onOpenShow(entry.showId, "") : entry.storylineId ? onOpenStoryline(entry.storylineId) : entry.workerId ? onOpenWorker(entry.workerId) : entry.ideaId ? (setSelectedId(entry.ideaId), setView("board")) : undefined}><time>{dateLabel(entry.date)}</time><span className={`calendar-kind calendar-kind--${entry.type.toLowerCase()}`}>{entry.type}</span><div><strong>{entry.title}</strong><small>{entry.subtitle} · {entry.status}</small></div></button>)}</div>
    </section>}

    {view === "search" && <section className="control-panel search-panel">
      <header><div><p className="eyebrow">GLOBAL SEARCH</p><h3>Find anything in the creative universe</h3></div></header>
      <input className="global-search-input" aria-label="Global creative search" placeholder="Search shows, narratives, workers, storylines, arcs, relationships, milestones, and ideas" value={control.settings.searchQuery} onChange={(event) => setControl((current) => ({ ...current, settings: { ...current.settings, searchQuery: event.target.value } }))} />
      {!control.settings.searchQuery.trim() ? <div className="empty-state">Enter a search term.</div> : searchResults.length === 0 ? <div className="empty-state">No matching records.</div> : <div className="search-result-list">{searchResults.map((result) => <button type="button" key={result.id} onClick={() => openResult(result)}><span>{result.kind}</span><div><strong>{result.title}</strong><small>{result.detail}</small></div></button>)}</div>}
    </section>}
  </section>;
}
