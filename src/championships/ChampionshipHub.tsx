import { useEffect, useMemo, useState } from "react";
import { loadCreativeControlData } from "../control/storage";
import type { BookingIdea } from "../control/types";
import { loadPlannedShows, savePlannedShows } from "../planner/storage";
import type { PlannedShow } from "../planner/types";
import { loadTrackerStorylines } from "../storylines/storage";
import type { TrackerStoryline } from "../storylines/types";
import type { TewSnapshot } from "../tew/types";
import { loadWorkerUniverse } from "../workers/storage";
import type { WorkerUniverse } from "../workers/types";
import { loadResultConsequenceUniverse } from "../consequences/storage";
import {
  applyTitleResult,
  buildChampionshipTimeline,
  buildChampionshipWarnings,
  buildCompetitiveRecord,
  buildTitleResultSuggestions,
  competitorNames,
  competitorsFromNames,
  createChampionship,
  createChampionshipReign,
  createRanking,
  suggestRankings,
  touchChampionship,
} from "./model";
import { loadChampionshipUniverse, saveChampionshipUniverse } from "./storage";
import type {
  Championship,
  ChampionshipCompetitor,
  ChampionshipUniverse,
  ContenderRanking,
  TitleResultDecision,
} from "./types";

type HubView = "details" | "lineage" | "rankings" | "program" | "timeline" | "results";

function dateLabel(value: string): string {
  if (!value) return "Date not set";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function knownWorkers(snapshot: TewSnapshot | null, workers: WorkerUniverse): Array<{ id: string; name: string }> {
  const map = new Map<string, { id: string; name: string }>();
  snapshot?.workers.forEach((worker) => map.set(worker.name.toLowerCase(), { id: worker.id, name: worker.name }));
  workers.profiles.forEach((worker) => map.set(worker.displayName.toLowerCase(), { id: worker.id, name: worker.displayName }));
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function RankingEditor({
  ranking,
  onChange,
  onMove,
  onDelete,
}: {
  ranking: ContenderRanking;
  onChange: (ranking: ContenderRanking) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  return <article className="ranking-row">
    <strong className="ranking-number">#{ranking.rank}</strong>
    <div className="ranking-main">
      <input aria-label={`Rank ${ranking.rank} competitors`} value={competitorNames(ranking.competitors)} placeholder="Worker or team" onChange={(event) => onChange({ ...ranking, competitors: competitorsFromNames(event.target.value), updatedAt: new Date().toISOString() })} />
      <div className="ranking-details">
        <input aria-label={`Rank ${ranking.rank} record`} value={ranking.record} placeholder="Record" onChange={(event) => onChange({ ...ranking, record: event.target.value, updatedAt: new Date().toISOString() })} />
        <input aria-label={`Rank ${ranking.rank} recent form`} value={ranking.recentForm} placeholder="Recent form" onChange={(event) => onChange({ ...ranking, recentForm: event.target.value, updatedAt: new Date().toISOString() })} />
        <select aria-label={`Rank ${ranking.rank} eligibility`} value={ranking.eligibility} onChange={(event) => onChange({ ...ranking, eligibility: event.target.value as ContenderRanking["eligibility"], updatedAt: new Date().toISOString() })}><option>Eligible</option><option>Ineligible</option><option>Unavailable</option></select>
      </div>
      <textarea aria-label={`Rank ${ranking.rank} reason`} rows={2} value={ranking.reason} placeholder="Explain why this contender is ranked here" onChange={(event) => onChange({ ...ranking, reason: event.target.value, updatedAt: new Date().toISOString() })} />
      {ranking.calculatedRank ? <small>Calculated: {ranking.tied ? "T" : ""}#{ranking.calculatedRank} · {ranking.calculatedPoints?.toFixed(2) ?? "0.00"} points</small> : null}
      {ranking.locked ? <input aria-label={`Rank ${ranking.rank} override reason`} value={ranking.overrideReason ?? ""} placeholder="Committee override reason" onChange={(event) => onChange({ ...ranking, overrideReason: event.target.value, updatedAt: new Date().toISOString() })} /> : null}
    </div>
    <div className="ranking-actions">
      <label><input type="checkbox" checked={ranking.locked} onChange={(event) => onChange({ ...ranking, locked: event.target.checked, updatedAt: new Date().toISOString() })} />Lock</label>
      <button type="button" onClick={() => onMove(-1)} aria-label={`Move rank ${ranking.rank} up`}>Up</button>
      <button type="button" onClick={() => onMove(1)} aria-label={`Move rank ${ranking.rank} down`}>Down</button>
      <button className="danger-button" type="button" onClick={onDelete}>Remove</button>
    </div>
  </article>;
}

export default function ChampionshipHub({
  snapshot,
  onOpenShow,
  onOpenStoryline,
}: {
  snapshot: TewSnapshot | null;
  onOpenShow: (showId: string, segmentId: string) => void;
  onOpenStoryline: (storylineId: string) => void;
}) {
  const [universe, setUniverse] = useState<ChampionshipUniverse>(() => loadChampionshipUniverse(window.localStorage));
  const [shows, setShows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [storylines] = useState<TrackerStoryline[]>(() => loadTrackerStorylines(window.localStorage));
  const [workers] = useState<WorkerUniverse>(() => loadWorkerUniverse(window.localStorage));
  const [ideas] = useState<BookingIdea[]>(() => loadCreativeControlData(window.localStorage).ideas);
  const [competitiveRecords] = useState(() => loadResultConsequenceUniverse(window.localStorage));
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<HubView>("details");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const allWorkers = useMemo(() => knownWorkers(snapshot, workers), [snapshot, workers]);

  useEffect(() => saveChampionshipUniverse(window.localStorage, universe), [universe]);
  useEffect(() => {
    if (!selectedId && universe.championships[0]) setSelectedId(universe.championships[0].id);
  }, [selectedId, universe.championships]);

  const selected = universe.championships.find((championship) => championship.id === selectedId) ?? universe.championships[0] ?? null;
  const filtered = universe.championships.filter((championship) => [championship.name, championship.company, championship.brand, competitorNames(championship.currentChampions)].join(" ").toLowerCase().includes(search.toLowerCase()));
  const warnings = useMemo(() => buildChampionshipWarnings(universe, shows, storylines), [universe, shows, storylines]);
  const selectedWarnings = selected ? warnings.filter((warning) => warning.championshipId === selected.id) : [];
  const suggestions = useMemo(() => selected ? buildTitleResultSuggestions(selected, shows) : [], [selected, shows]);
  const timeline = useMemo(() => selected ? buildChampionshipTimeline(selected, shows, storylines, ideas) : [], [selected, shows, storylines, ideas]);

  function updateSelected(updater: (championship: Championship) => Championship): void {
    if (!selected) return;
    setUniverse((current) => ({ championships: current.championships.map((championship) => championship.id === selected.id ? touchChampionship(updater(championship)) : championship) }));
  }

  function addChampionship(): void {
    const championship = createChampionship(universe.championships.length + 1);
    setUniverse((current) => ({ championships: [championship, ...current.championships] }));
    setSelectedId(championship.id);
    setView("details");
    setNotice("New tracker championship created.");
  }

  function deleteChampionship(): void {
    if (!selected || !window.confirm(`Delete ${selected.name}? This removes its tracker lineage and rankings.`)) return;
    const remaining = universe.championships.filter((championship) => championship.id !== selected.id);
    setUniverse({ championships: remaining });
    setSelectedId(remaining[0]?.id ?? "");
    setNotice("Championship deleted. Planned shows were not changed.");
  }

  function setCurrentChampions(names: string): void {
    if (!selected) return;
    const competitors = competitorsFromNames(names, allWorkers);
    updateSelected((championship) => ({
      ...championship,
      currentChampions: competitors,
      status: competitors.length > 0 ? "Active" : "Vacant",
      currentProgram: { ...championship.currentProgram, championNames: competitors.map((competitor) => competitor.name) },
    }));
  }

  function addCurrentReign(): void {
    if (!selected || selected.currentChampions.length === 0) {
      setNotice("Enter the current champion before creating a reign.");
      return;
    }
    if (selected.reigns.some((reign) => reign.status === "Active")) {
      setNotice("An active reign already exists. End or correct it before creating another.");
      return;
    }
    updateSelected((championship) => ({ ...championship, reigns: [...championship.reigns, createChampionshipReign(championship.currentChampions, championship.previousChampions, championship.dateWon)] }));
    setNotice("Current reign added to the lineage.");
  }

  function updateRanking(updated: ContenderRanking): void {
    updateSelected((championship) => ({ ...championship, rankings: championship.rankings.map((ranking) => ranking.id === updated.id ? updated : ranking) }));
  }

  function moveRanking(id: string, direction: -1 | 1): void {
    if (!selected) return;
    const ordered = [...selected.rankings].sort((a, b) => a.rank - b.rank);
    const index = ordered.findIndex((ranking) => ranking.id === id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= ordered.length) return;
    [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
    updateSelected((championship) => ({ ...championship, rankings: ordered.map((ranking, rankingIndex) => ({ ...ranking, rank: rankingIndex + 1, updatedAt: new Date().toISOString() })) }));
  }

  function generateRankings(): void {
    if (!selected) return;
    updateSelected((championship) => ({ ...championship, rankings: suggestRankings(championship, shows, workers, universe, competitiveRecords) }));
    setNotice("Ranking suggestions generated from the official competitive ledger. Locked Committee entries and their override reasons were preserved.");
  }

  function confirmSuggestion(showId: string, segmentId: string, decision: TitleResultDecision): void {
    if (!selected) return;
    const show = shows.find((item) => item.id === showId);
    const segment = show?.segments.find((item) => item.id === segmentId);
    if (!show || !segment) return;
    try {
      const result = applyTitleResult(selected, show, segment, decision, allWorkers);
      const nextShows = shows.map((item) => item.id === show.id ? result.show : item);
      setShows(nextShows);
      savePlannedShows(window.localStorage, nextShows);
      setUniverse((current) => ({ championships: current.championships.map((championship) => championship.id === selected.id ? result.championship : championship) }));
      setNotice(`${selected.name} result confirmed as ${decision}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The title result could not be confirmed.");
    }
  }

  function setProgramNames(field: "leadingChallengerNames" | "additionalContenderNames", value: string): void {
    updateSelected((championship) => ({ ...championship, currentProgram: { ...championship.currentProgram, [field]: competitorsFromNames(value, allWorkers).map((competitor) => competitor.name) } }));
  }

  const officialChampionRecord = selected?.currentChampions[0] ? competitiveRecords.workerRecords.find((record) => record.workerName.toLowerCase() === selected.currentChampions[0].name.toLowerCase()) : null;
  const championRecord = officialChampionRecord ? {
    workerName: officialChampionRecord.workerName,
    wins: officialChampionRecord.wins,
    losses: officialChampionRecord.losses,
    draws: officialChampionRecord.draws,
    unresolved: 0,
    championshipMatches: selected?.resultEvents.filter((event) => event.winners.some((winner) => winner.id === officialChampionRecord.workerId || winner.name.toLowerCase() === officialChampionRecord.workerName.toLowerCase())).length ?? 0,
    currentStreak: officialChampionRecord.currentStreakCount ? `${officialChampionRecord.currentStreakCount}${officialChampionRecord.currentStreakType}` : "—",
  } : selected?.currentChampions[0] ? buildCompetitiveRecord(selected.currentChampions[0].name, shows, universe) : null;

  return <section className="championship-hub">
    <header className="championship-toolbar">
      <div><p className="eyebrow">COMPETITIVE UNIVERSE</p><h2>Championship Hub, Rankings, and Competitive Records</h2><p>Track champions, confirm title outcomes, maintain transparent contender rankings, and preserve permanent lineage.</p></div>
      <button className="primary-button" type="button" onClick={addChampionship}>Create Championship</button>
    </header>

    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <section className="championship-summary" aria-label="Championship universe summary">
      <div><span>Championships</span><strong>{universe.championships.length}</strong></div>
      <div><span>Active champions</span><strong>{universe.championships.filter((championship) => championship.status === "Active").length}</strong></div>
      <div><span>Vacant</span><strong>{universe.championships.filter((championship) => championship.status === "Vacant").length}</strong></div>
      <div><span>Unconfirmed results</span><strong>{universe.championships.reduce((total, championship) => total + buildTitleResultSuggestions(championship, shows).length, 0)}</strong></div>
      <div><span>Integrity warnings</span><strong>{warnings.length}</strong></div>
    </section>

    <div className="championship-layout">
      <aside className="championship-list">
        <input aria-label="Search championships" placeholder="Search championships" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="panel-heading"><span>Tracker Championships</span><strong>{filtered.length}</strong></div>
        {filtered.length === 0 ? <div className="empty-state compact">No championships match this view.</div> : filtered.map((championship) => <button type="button" className={selected?.id === championship.id ? "selected" : ""} key={championship.id} onClick={() => setSelectedId(championship.id)}><strong>{championship.name}</strong><span>{championship.status} · {championship.classification}</span><small>{competitorNames(championship.currentChampions) || "No champion"}</small><em>{championship.rankings.length} ranked contender{championship.rankings.length === 1 ? "" : "s"}</em></button>)}
      </aside>

      {!selected ? <section className="championship-empty"><h3>Create the competitive structure</h3><p>Add the main championship, secondary title, tag titles, and any cup or tournament honors you want tracked.</p><button className="primary-button" type="button" onClick={addChampionship}>Create Championship</button></section> : <div className="championship-editor">
        <nav className="championship-tabs" aria-label="Championship sections">
          {(["details", "lineage", "rankings", "program", "timeline", "results"] as HubView[]).map((tab) => <button type="button" key={tab} className={view === tab ? "active" : ""} onClick={() => setView(tab)}>{tab === "details" ? "Details" : tab === "lineage" ? "Lineage" : tab === "rankings" ? "Rankings" : tab === "program" ? "Title Program" : tab === "timeline" ? "Timeline" : `Result Review (${suggestions.length})`}</button>)}
        </nav>

        {selectedWarnings.length > 0 && <section className="championship-warning-strip"><strong>{selectedWarnings.length} integrity warning{selectedWarnings.length === 1 ? "" : "s"}</strong>{selectedWarnings.map((warning) => <button type="button" key={warning.id} onClick={() => warning.showId ? onOpenShow(warning.showId, warning.segmentId) : undefined}><span>{warning.category}</span>{warning.message}</button>)}</section>}

        {view === "details" && <section className="championship-panel">
          <header><div><p className="eyebrow">CHAMPIONSHIP DETAILS</p><h3>{selected.name}</h3></div><button className="danger-button" type="button" onClick={deleteChampionship}>Delete Championship</button></header>
          <div className="championship-form-grid">
            <label className="field field--wide"><span>Championship name</span><input value={selected.name} onChange={(event) => updateSelected((championship) => ({ ...championship, name: event.target.value }))} /></label>
            <label className="field"><span>Status</span><select aria-label="Championship status" value={selected.status} onChange={(event) => updateSelected((championship) => ({ ...championship, status: event.target.value as Championship["status"] }))}><option>Active</option><option>Inactive</option><option>Vacant</option></select></label>
            <label className="field"><span>Classification</span><select value={selected.classification} onChange={(event) => updateSelected((championship) => ({ ...championship, classification: event.target.value as Championship["classification"] }))}><option>Primary</option><option>Secondary</option><option>Specialty</option><option>Tournament</option><option>Custom</option></select></label>
            <label className="field"><span>Company</span><input value={selected.company} onChange={(event) => updateSelected((championship) => ({ ...championship, company: event.target.value }))} /></label>
            <label className="field"><span>Brand</span><input value={selected.brand} onChange={(event) => updateSelected((championship) => ({ ...championship, brand: event.target.value }))} /></label>
            <label className="field"><span>Division</span><select value={selected.division} onChange={(event) => updateSelected((championship) => ({ ...championship, division: event.target.value as Championship["division"] }))}><option>Singles</option><option>Tag Team</option><option>Trios</option><option>Other</option></select></label>
            <label className="field"><span>Date won</span><input type="date" value={selected.dateWon} onChange={(event) => updateSelected((championship) => ({ ...championship, dateWon: event.target.value }))} /></label>
            <label className="field field--wide"><span>Current champions</span><input list={`champions-${selected.id}`} value={competitorNames(selected.currentChampions)} placeholder="Enter one name or a team separated by &" onChange={(event) => setCurrentChampions(event.target.value)} /><datalist id={`champions-${selected.id}`}>{allWorkers.map((worker) => <option key={worker.id} value={worker.name} />)}</datalist></label>
            <label className="field"><span>Recorded defenses</span><input type="number" min={0} value={selected.defenses} onChange={(event) => updateSelected((championship) => ({ ...championship, defenses: Math.max(0, Number(event.target.value) || 0) }))} /></label>
            <label className="field"><span>Last official title activity</span><input type="date" value={selected.lastTitleActivityDate} readOnly /></label>
            <label className="field"><span>Inactive warning days</span><input type="number" min={1} value={selected.inactivityWarningDays} onChange={(event) => updateSelected((championship) => ({ ...championship, inactivityWarningDays: Math.max(1, Number(event.target.value) || 1) }))} /></label>
            <label className="field field--wide"><span>Linked TEW title name</span><input value={selected.linkedTewTitleName} placeholder="Optional imported TEW reference" onChange={(event) => updateSelected((championship) => ({ ...championship, linkedTewTitleName: event.target.value }))} /></label>
            <label className="field field--wide"><span>Legacy or alternate names</span><input value={selected.legacyNames.join(", ")} placeholder="Names used on older saved cards" onChange={(event) => updateSelected((championship) => ({ ...championship, legacyNames: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) }))} /></label>
            <label className="field field--full"><span>Private booking notes</span><textarea rows={5} value={selected.privateNotes} onChange={(event) => updateSelected((championship) => ({ ...championship, privateNotes: event.target.value }))} /></label>
          </div>
          {championRecord && <div className="champion-record-card"><strong>{championRecord.workerName} — stored competitive record</strong><span>{championRecord.wins} wins · {championRecord.losses} losses · {championRecord.draws} draws · {championRecord.unresolved} unresolved</span><span>{championRecord.championshipMatches} championship matches · streak {championRecord.currentStreak}</span></div>}
        </section>}

        {view === "lineage" && <section className="championship-panel">
          <header><div><p className="eyebrow">TITLE LINEAGE</p><h3>Reigns and defenses</h3></div><button className="primary-button" type="button" onClick={addCurrentReign}>Add Current Reign</button></header>
          {selected.reigns.length === 0 ? <div className="empty-state">No reign history has been recorded.</div> : <div className="reign-list">{selected.reigns.slice().sort((a, b) => b.startDate.localeCompare(a.startDate)).map((reign) => <article key={reign.id}><header><div><strong>{competitorNames(reign.champions) || "Unknown champion"}</strong><span>{reign.status}</span></div><b>{reign.successfulDefenses} defense{reign.successfulDefenses === 1 ? "" : "s"}</b></header><p>{dateLabel(reign.startDate)}{reign.endDate ? ` – ${dateLabel(reign.endDate)}` : " – Present"}</p><textarea aria-label={`Reign notes for ${competitorNames(reign.champions)}`} rows={2} value={reign.notes} placeholder="Lineage notes or corrections" onChange={(event) => updateSelected((championship) => ({ ...championship, reigns: championship.reigns.map((item) => item.id === reign.id ? { ...item, notes: event.target.value, updatedAt: new Date().toISOString() } : item) }))} /></article>)}</div>}
          {selected.resultEvents.length > 0 && <div className="reign-list"><h4>Official title-result ledger</h4>{[...selected.resultEvents].sort((left, right) => right.showDate.localeCompare(left.showDate) || right.runningOrderPosition - left.runningOrderPosition).map((event) => <article key={event.id}><header><div><strong>{event.decision}</strong><span>{dateLabel(event.showDate)} · card position #{event.runningOrderPosition + 1}</span></div><b>{event.activityOnly ? "Activity only" : "Lineage event"}</b></header><p>{competitorNames(event.winners) || "No new champion"} · source {event.sourceResultId}</p></article>)}</div>}
        </section>}

        {view === "rankings" && <section className="championship-panel">
          <header><div><p className="eyebrow">CONTENDER RANKINGS</p><h3>Transparent and editable title picture</h3></div><div><button className="secondary-button" type="button" onClick={() => updateSelected((championship) => ({ ...championship, rankings: [...championship.rankings, createRanking(championship.rankings.length + 1)] }))}>Add Ranking</button><button className="primary-button" type="button" onClick={generateRankings}>Generate Ranking Suggestions</button></div></header>
          <p className="championship-explainer">Suggestions use the official Phase 6B20 ranking-point ledger. Title-match participation gives no separate bonus. Locked Committee entries remain visible beside their calculated position and require an override reason.</p>
          {selected.rankings.length === 0 ? <div className="empty-state">No contenders are ranked.</div> : <div className="ranking-list">{selected.rankings.slice().sort((a, b) => a.rank - b.rank).map((ranking) => <RankingEditor key={ranking.id} ranking={ranking} onChange={updateRanking} onMove={(direction) => moveRanking(ranking.id, direction)} onDelete={() => updateSelected((championship) => ({ ...championship, rankings: championship.rankings.filter((item) => item.id !== ranking.id).map((item, index) => ({ ...item, rank: index + 1 })) }))} />)}</div>}
        </section>}

        {view === "program" && <section className="championship-panel">
          <header><div><p className="eyebrow">CHAMPIONSHIP PROGRAM</p><h3>Champion, challengers, story, and payoff</h3></div></header>
          <div className="championship-form-grid">
            <label className="field field--wide"><span>Champion side</span><input value={selected.currentProgram.championNames.join(" & ")} onChange={(event) => updateSelected((championship) => ({ ...championship, currentProgram: { ...championship.currentProgram, championNames: competitorsFromNames(event.target.value, allWorkers).map((competitor) => competitor.name) } }))} /></label>
            <label className="field field--wide"><span>Leading challenger</span><input value={selected.currentProgram.leadingChallengerNames.join(" & ")} onChange={(event) => setProgramNames("leadingChallengerNames", event.target.value)} /></label>
            <label className="field field--wide"><span>Additional contenders</span><input value={selected.currentProgram.additionalContenderNames.join(", ")} onChange={(event) => setProgramNames("additionalContenderNames", event.target.value)} /></label>
            <label className="field"><span>Linked storyline</span><select value={selected.currentProgram.linkedStorylineId || selected.linkedStorylineId} onChange={(event) => updateSelected((championship) => ({ ...championship, linkedStorylineId: event.target.value, currentProgram: { ...championship.currentProgram, linkedStorylineId: event.target.value } }))}><option value="">None</option>{storylines.map((storyline) => <option key={storyline.id} value={storyline.id}>{storyline.name}</option>)}</select></label>
            <label className="field"><span>Target payoff show</span><select value={selected.currentProgram.targetPayoffShowId} onChange={(event) => updateSelected((championship) => ({ ...championship, currentProgram: { ...championship.currentProgram, targetPayoffShowId: event.target.value } }))}><option value="">Not scheduled</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name} — {show.date}</option>)}</select></label>
            <label className="field field--full"><span>Current title program</span><textarea rows={7} value={selected.currentProgram.summary} onChange={(event) => updateSelected((championship) => ({ ...championship, currentProgram: { ...championship.currentProgram, summary: event.target.value } }))} /></label>
          </div>
          {selected.currentProgram.linkedStorylineId && <button className="secondary-button" type="button" onClick={() => onOpenStoryline(selected.currentProgram.linkedStorylineId)}>Open Linked Storyline</button>}
        </section>}

        {view === "timeline" && <section className="championship-panel"><header><div><p className="eyebrow">CHAMPIONSHIP TIMELINE</p><h3>Past lineage and future title plans</h3></div></header>{timeline.length === 0 ? <div className="empty-state">No championship timeline entries are available.</div> : <div className="championship-timeline">{timeline.map((entry) => <button type="button" key={entry.id} onClick={() => entry.showId ? onOpenShow(entry.showId, entry.segmentId) : entry.storylineId ? onOpenStoryline(entry.storylineId) : undefined}><time>{dateLabel(entry.date)}</time><span>{entry.type}</span><strong>{entry.title}</strong><p>{entry.detail}</p></button>)}</div>}</section>}

        {view === "results" && <section className="championship-panel"><header><div><p className="eyebrow">RESULT CONFIRMATION</p><h3>Review reconciled title matches before changing lineage</h3></div><strong>{suggestions.length}</strong></header><p className="championship-explainer">The tracker never changes a champion automatically. Confirm retention, title change, vacancy, or No Contest only after reviewing the completed result.</p>{suggestions.length === 0 ? <div className="empty-state">No reconciled title results require confirmation.</div> : <div className="title-result-list">{suggestions.map((suggestion) => <article key={suggestion.id}><header><div><strong>{suggestion.segmentTitle}</strong><span>{suggestion.showName} · {dateLabel(suggestion.showDate)}</span></div><b>{suggestion.suggestedDecision}</b></header><dl><div><dt>Champion entering</dt><dd>{suggestion.championEntering || "Unavailable"}</dd></div><div><dt>Challenger</dt><dd>{suggestion.challenger || "Unavailable"}</dd></div><div><dt>Recorded winner</dt><dd>{suggestion.actualWinner || "Unavailable"}</dd></div></dl><p>{suggestion.reason}</p><div className="result-actions"><button type="button" onClick={() => onOpenShow(suggestion.showId, suggestion.segmentId)}>Open Match</button><button type="button" onClick={() => confirmSuggestion(suggestion.showId, suggestion.segmentId, "Retained")}>Confirm Retention</button><button className="primary-button" type="button" onClick={() => confirmSuggestion(suggestion.showId, suggestion.segmentId, "Changed Hands")}>Confirm Title Change</button><button type="button" onClick={() => confirmSuggestion(suggestion.showId, suggestion.segmentId, "Vacated")}>Confirm Vacancy</button><button type="button" onClick={() => confirmSuggestion(suggestion.showId, suggestion.segmentId, "No Contest")}>Confirm No Contest</button><button type="button" onClick={() => setNotice("The title result remains unresolved. No lineage or defense change was applied.")}>Leave Unresolved</button></div></article>)}</div>}</section>}
      </div>}
    </div>
  </section>;
}
