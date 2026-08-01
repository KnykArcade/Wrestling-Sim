import { useMemo, useRef, useState } from "react";
import ChampionshipHub from "./championships/ChampionshipHub";
import CreativeControlCenter from "./control/CreativeControlCenter";
import HandoffWorkspace from "./handoff/HandoffWorkspace";
import MatchEngineFoundation from "./matchEngine/MatchEngineFoundation";
import PlannedShowWorkspace from "./planner/PlannedShowWorkspace";
import StorylineHub from "./storylines/StorylineHub";
import { readTewSnapshot } from "./tew/reader";
import type { MatchRecord, ShowRecord, StorylineRecord, TewSnapshot } from "./tew/types";
import WorkerHub from "./workers/WorkerHub";

type ViewName = "control" | "planner" | "handoff" | "match-engine" | "storyline-hub" | "worker-hub" | "championship-hub" | "shows" | "tew-storylines" | "schema";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" }).format(date);
}

function formatNumber(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("en-US").format(value);
}

function Rating({ value, label = "Rating" }: { value: number | null; label?: string }) {
  return <div className="rating-box" aria-label={`${label}: ${value ?? "unavailable"}`}><span>{label}</span><strong>{value ?? "—"}</strong></div>;
}

function MatchCard({ match }: { match: MatchRecord }) {
  return <article className="match-card">
    <div className="match-card__topline"><span className="placement-badge">{match.placement}</span><span>{match.matchTime ? `Match time: ${match.matchTime}` : "Match time unavailable"}</span><Rating value={match.rating} label="Match" /></div>
    <h3>{match.description}</h3>
    {match.winner && <p className="winner-line">Recorded winner: {match.winner}</p>}
    {match.workers.length > 0 && <div className="worker-grid" aria-label="Match participants">{match.workers.map((worker, index) => <div className="worker-chip" key={`${match.id}-${worker.id}-${index}`}><strong>{worker.name}</strong><span>{[worker.side, worker.role].filter(Boolean).join(" · ") || "Participant"}</span></div>)}</div>}
    {match.notes && <div className="notes-panel"><span>Existing TEW notes</span><p>{match.notes}</p></div>}
  </article>;
}

function ShowDetails({ show }: { show: ShowRecord }) {
  return <section className="details-panel">
    <header className="details-header"><div><p className="eyebrow">SHOW HISTORY</p><h2>{show.name}</h2><p>{formatDate(show.date)}</p></div><Rating value={show.rating} label="Show" /></header>
    <div className="show-facts"><div><span>Company</span><strong>{show.company || "Unavailable"}</strong></div><div><span>Venue</span><strong>{show.venue || "Unavailable"}</strong></div><div><span>Attendance</span><strong>{formatNumber(show.attendance)}</strong></div><div><span>Broadcast</span><strong>{show.broadcast || "Unavailable"}</strong></div></div>
    <div className="section-title-row"><h3>Recorded Matches</h3><span>{show.matches.length}</span></div>
    {show.matches.length > 0 ? <div className="match-list">{show.matches.map((match) => <MatchCard key={match.id} match={match} />)}</div> : <div className="empty-state compact">No linked match-history records were found for this show.</div>}
  </section>;
}

function StorylineCard({ storyline }: { storyline: StorylineRecord }) {
  return <article className="storyline-card"><header><div><span className="source-label">{storyline.sourceTable}</span><h3>{storyline.name}</h3></div><Rating value={storyline.heat} label="Heat" /></header><p>{storyline.description || "No stored storyline description was found in this table."}</p><div className="storyline-meta"><span>Status: {storyline.status || "Unavailable"}</span><span>Participants: {storyline.workers.length}</span></div>{storyline.workers.length > 0 && <div className="worker-grid">{storyline.workers.map((worker, index) => <div className="worker-chip" key={`${storyline.id}-${worker.id}-${index}`}><strong>{worker.name}</strong><span>{worker.role || "Involved"}</span></div>)}</div>}</article>;
}

function ImportPanel({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  return <section className={`import-panel ${dragActive ? "is-dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragActive(false); }} onDrop={(event) => { event.preventDefault(); setDragActive(false); const file = event.dataTransfer.files.item(0); if (file) onFile(file); }}>
    <div><p className="eyebrow">READ-ONLY IMPORT</p><h2>Open a TEW IX MDB snapshot</h2><p>The file is parsed inside this browser session. The tracker does not upload, change, or write back to the TEW database.</p></div>
    <input ref={inputRef} className="visually-hidden" type="file" accept=".mdb,.accdb,application/x-msaccess" onChange={(event) => { const file = event.target.files?.item(0); if (file) onFile(file); event.currentTarget.value = ""; }} />
    <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}>Select MDB File</button><span className="drop-hint">or drop the file anywhere in this panel</span>
  </section>;
}

function SnapshotHeader({ snapshot, onClose }: { snapshot: TewSnapshot; onClose: () => void }) {
  return <><section className="database-header"><div><p className="eyebrow">CURRENT TEW SNAPSHOT</p><h2>{snapshot.fileName}</h2><p>{formatBytes(snapshot.fileSize)} · Imported {formatDate(snapshot.importedAt)}</p></div><button className="secondary-button" type="button" onClick={onClose}>Close Snapshot</button></section><section className="summary-grid" aria-label="Import summary"><div><span>Tables</span><strong>{snapshot.tables.length}</strong></div><div><span>Workers</span><strong>{snapshot.workers.length}</strong></div><div><span>Shows</span><strong>{snapshot.shows.length}</strong></div><div><span>Matches</span><strong>{snapshot.shows.reduce((sum, show) => sum + show.matches.length, 0)}</strong></div><div><span>Storylines</span><strong>{snapshot.storylines.length}</strong></div></section></>;
}

export default function App() {
  const [snapshot, setSnapshot] = useState<TewSnapshot | null>(null);
  const [selectedShowId, setSelectedShowId] = useState("");
  const [view, setView] = useState<ViewName>("control");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plannerTarget, setPlannerTarget] = useState<{ showId: string; segmentId: string; key: number } | null>(null);

  const selectedShow = useMemo(() => snapshot ? snapshot.shows.find((show) => show.id === selectedShowId) ?? snapshot.shows[0] ?? null : null, [selectedShowId, snapshot]);

  function closeSnapshot(): void {
    setSnapshot(null);
    setSelectedShowId("");
    setError("");
  }

  async function handleFile(file: File, destination: ViewName = "shows") {
    setLoading(true);
    setError("");
    try {
      const imported = await readTewSnapshot(file);
      setSnapshot(imported);
      setSelectedShowId(imported.shows[0]?.id ?? "");
      setView(destination);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The database could not be imported.");
    } finally {
      setLoading(false);
    }
  }

  function openPlannedSegment(showId: string, segmentId: string): void {
    setPlannerTarget({ showId, segmentId, key: Date.now() });
    setView("planner");
  }

  const needsSnapshot = (view === "shows" || view === "tew-storylines" || view === "schema") && snapshot === null;
  const standaloneViews: ViewName[] = ["control", "planner", "handoff", "match-engine", "storyline-hub", "worker-hub", "championship-hub"];

  return <div className="app-shell">
    <header className="topbar"><div><span className="brand-kicker">WRESTLING SIM</span><h1>TEW IX Story Tracker</h1></div><div className="phase-badge">PHASE 4C2 · MATCH SETUP</div></header>
    <nav className="global-tabbar" aria-label="Story Tracker sections">
      <button className={view === "control" ? "active" : ""} onClick={() => setView("control")} type="button">Control Center</button>
      <button className={view === "planner" ? "active" : ""} onClick={() => setView("planner")} type="button">Planned Shows</button>
      <button className={view === "handoff" ? "active" : ""} onClick={() => setView("handoff")} type="button">TEW Handoff</button>
      <button className={view === "match-engine" ? "active" : ""} onClick={() => setView("match-engine")} type="button">Match Engine</button>
      <button className={view === "storyline-hub" ? "active" : ""} onClick={() => setView("storyline-hub")} type="button">Storyline Hub</button>
      <button className={view === "worker-hub" ? "active" : ""} onClick={() => setView("worker-hub")} type="button">Worker Hub</button>
      <button className={view === "championship-hub" ? "active" : ""} onClick={() => setView("championship-hub")} type="button">Championships</button>
      <button className={view === "shows" ? "active" : ""} onClick={() => setView("shows")} type="button">TEW Show History</button>
      <button className={view === "tew-storylines" ? "active" : ""} onClick={() => setView("tew-storylines")} type="button">TEW Storylines</button>
      <button className={view === "schema" ? "active" : ""} onClick={() => setView("schema")} type="button">Import Diagnostics</button>
    </nav>
    <main>
      {view === "control" && <CreativeControlCenter snapshot={snapshot} onOpenShow={openPlannedSegment} onOpenStoryline={() => setView("storyline-hub")} onOpenWorker={() => setView("worker-hub")} />}
      {view === "planner" && <PlannedShowWorkspace key={plannerTarget?.key ?? 0} snapshot={snapshot} snapshotLoading={loading} snapshotError={error} onSnapshotFile={(file) => void handleFile(file, "planner")} onCloseSnapshot={closeSnapshot} initialShowId={plannerTarget?.showId ?? ""} initialSegmentId={plannerTarget?.segmentId ?? ""} />}
      {view === "handoff" && <HandoffWorkspace snapshot={snapshot} />}
      {view === "match-engine" && <MatchEngineFoundation />}
      {view === "storyline-hub" && <StorylineHub snapshot={snapshot} onOpenShow={openPlannedSegment} />}
      {view === "worker-hub" && <WorkerHub snapshot={snapshot} onOpenShow={openPlannedSegment} />}
      {view === "championship-hub" && <ChampionshipHub snapshot={snapshot} onOpenShow={openPlannedSegment} onOpenStoryline={() => setView("storyline-hub")} />}
      {needsSnapshot && <ImportPanel onFile={(file) => void handleFile(file, view)} />}
      {loading && !standaloneViews.includes(view) && <div className="status-banner" role="status">Reading the database and matching TEW history tables…</div>}
      {error && !standaloneViews.includes(view) && <div className="status-banner error" role="alert"><strong>Import failed</strong><span>{error}</span></div>}
      {snapshot && (view === "shows" || view === "tew-storylines" || view === "schema") && <><SnapshotHeader snapshot={snapshot} onClose={closeSnapshot} />
        {view === "shows" && <div className="history-layout"><aside className="show-list" aria-label="Previous shows"><div className="panel-heading"><span>Previous Shows</span><strong>{snapshot.shows.length}</strong></div>{snapshot.shows.length > 0 ? snapshot.shows.map((show) => <button type="button" className={selectedShow?.id === show.id ? "selected" : ""} key={show.id} onClick={() => setSelectedShowId(show.id)}><strong>{show.name}</strong><span>{formatDate(show.date)}</span><small>{show.matches.length} match{show.matches.length === 1 ? "" : "es"}</small></button>) : <div className="empty-state compact">No previous shows were mapped.</div>}</aside>{selectedShow ? <ShowDetails show={selectedShow} /> : <section className="details-panel empty-state">No show record is available to display. Open Import Diagnostics to review the detected tables.</section>}</div>}
        {view === "tew-storylines" && <section className="content-panel"><div className="panel-heading large"><div><span>Stored TEW Storylines</span><p>These imported records remain read-only. Link them to tracker storylines inside the Storyline Hub.</p></div><strong>{snapshot.storylines.length}</strong></div>{snapshot.storylines.length > 0 ? <div className="storyline-grid">{snapshot.storylines.map((storyline) => <StorylineCard key={`${storyline.sourceTable}-${storyline.id}`} storyline={storyline} />)}</div> : <div className="empty-state">No supported storyline records were mapped from this snapshot.</div>}</section>}
        {view === "schema" && <section className="diagnostics-layout"><div className="content-panel"><div className="panel-heading large"><div><span>Matched TEW Tables</span><p>These mappings drive the read-only show, match, worker, and storyline views.</p></div></div><dl className="mapping-list">{Object.entries(snapshot.diagnostics.matchedTables).map(([purpose, table]) => <div key={purpose}><dt>{purpose}</dt><dd className={table ? "matched" : "missing"}>{table ?? "Not found"}</dd></div>)}</dl><div className="warning-list"><h3>Warnings</h3>{snapshot.diagnostics.warnings.length > 0 ? snapshot.diagnostics.warnings.map((warning, index) => <p key={`${warning}-${index}`}>{warning}</p>) : <p>No mapping warnings were generated.</p>}</div></div><div className="content-panel table-inventory"><div className="panel-heading large"><div><span>Database Table Inventory</span><p>Only recognized history tables are loaded into memory.</p></div><strong>{snapshot.tables.length}</strong></div><div className="inventory-list">{snapshot.tables.map((table) => <details key={table.name}><summary><span>{table.name}</span><small>{table.rowCount.toLocaleString()} rows · {table.columnCount} columns</small><b>{table.loaded ? "Mapped" : "Metadata only"}</b></summary><p>{table.columns.join(", ") || "No column names were returned."}</p>{table.truncated && <p className="truncate-warning">This table exceeded the Phase 1 row limit.</p>}</details>)}</div></div></section>}
      </>}
    </main>
    <footer>TEW remains the game. This companion stores creative plans, Match Stories, Segment Outputs, match approaches, handoff versions, histories, storylines, workers, championships, and rankings. TEW snapshot access remains read-only.</footer>
  </div>;
}
