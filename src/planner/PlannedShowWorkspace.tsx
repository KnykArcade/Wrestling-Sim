import { useEffect, useMemo, useRef, useState } from "react";
import MatchApproachSetupEditor, { MatchSettingsEditor } from "../matchEngine/MatchApproachSetup";
import { loadMatchEngineUniverse, saveMatchEngineUniverse } from "../matchEngine/storage";
import type { MatchEngineUniverse } from "../matchEngine/types";
import NarrativeGenerator from "../narratives/NarrativeGenerator";
import { loadStartingUniverseActivationState } from "../startingUniverse/activation";
import { loadActiveStartingUniverse, loadStartingUniverseState } from "../startingUniverse/storage";
import type { StartingUniverseRecord } from "../startingUniverse/types";
import type { TewSnapshot } from "../tew/types";
import { loadWorkerUniverse } from "../workers/storage";
import type { WorkerProfile } from "../workers/types";
import {
  autoNameMatch,
  automaticMatchSide,
  createPlannerId,
  createPlannedSegment,
  createPlannedShow,
  duplicatePlannedShow,
  matchBookingValidation,
  movePlannedSegment,
  normalizeMatchFormat,
  totalPlannedMinutes,
  touchShow,
} from "./model";
import NarrativeEditor from "./NarrativeEditor";
import ReconciliationWorkspace from "./ReconciliationWorkspace";
import {
  createPlannerBackup,
  loadPlannedShows,
  parsePlannerBackup,
  savePlannedShows,
} from "./storage";
import type { PlannedSegment, PlannedShow } from "./types";

type SaveState = "Saved" | "Saving" | "Save failed";
type EditorMode = "plan" | "reconcile";

function downloadBackup(shows: PlannedShow[], matchEngine: MatchEngineUniverse): void {
  const backup = createPlannerBackup(shows, undefined, undefined, undefined, undefined, undefined, matchEngine);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tew-story-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function narrativeIsComplete(segment: PlannedSegment): boolean {
  return segment.type === "match" ? Boolean(segment.matchStory.trim()) : Boolean(segment.segmentOutput.trim());
}

interface BookingRosterWorker {
  id: string;
  name: string;
  companyName: string;
  source: "world" | "hub" | "snapshot";
}

const ALL_WORKERS_FILTER = "__all_workers__";
const FREE_AGENTS_FILTER = "__free_agents__";

function BasicMatchBooking({ segment, snapshot, company, startingUniverse, onChange }: { segment: PlannedSegment; snapshot: TewSnapshot | null; company: string; startingUniverse: StartingUniverseRecord | null; onChange: (segment: PlannedSegment) => void }) {
  const [importedWorkerId, setImportedWorkerId] = useState("");
  const [manualWorkerName, setManualWorkerName] = useState("");
  const activeCompany = useMemo(() => loadStartingUniverseActivationState(window.localStorage).activeCompanyName, []);
  const activeCompanyId = useMemo(() => loadStartingUniverseActivationState(window.localStorage).activeCompanyId, []);
  const workerUniverse = useMemo(() => loadWorkerUniverse(window.localStorage), []);
  const defaultCompany = company.trim() || activeCompany || "Unassigned Company";
  const defaultCompanyId = startingUniverse?.companies.find((item) => item.name === defaultCompany)?.id
    || startingUniverse?.companies.find((item) => item.id === activeCompanyId)?.id
    || startingUniverse?.playableCompanyId
    || activeCompanyId
    || defaultCompany;
  const [rosterCompany, setRosterCompany] = useState(defaultCompanyId);
  const [workerSearch, setWorkerSearch] = useState("");
  const format = normalizeMatchFormat(segment.matchType);
  const validation = matchBookingValidation(segment);
  const isWrestler = (profile: WorkerProfile) => profile.currentRole === "Wrestler" || profile.currentRole === "Occasional Wrestler";
  const worldCompanies = useMemo(() => startingUniverse?.companies.slice().sort((left, right) => left.name.localeCompare(right.name)) ?? [], [startingUniverse]);
  const worldWorkers = useMemo<BookingRosterWorker[]>(() => {
    if (!startingUniverse) return [];
    const contractsByWorker = new Map<string, typeof startingUniverse.contracts>();
    for (const contract of startingUniverse.contracts) contractsByWorker.set(contract.workerId, [...(contractsByWorker.get(contract.workerId) ?? []), contract]);
    return startingUniverse.workers
      .filter((worker) => worker.active && (worker.flags.wrestler || worker.flags.occasionalWrestler))
      .flatMap((worker) => {
        const contracts = contractsByWorker.get(worker.id) ?? [];
        if (rosterCompany === FREE_AGENTS_FILTER) {
          return contracts.length === 0 ? [{ id: worker.id, name: worker.name, companyName: "Free Agent", source: "world" as const }] : [];
        }
        if (rosterCompany === ALL_WORKERS_FILTER) {
          const preferred = contracts[0];
          return [{ id: worker.id, name: preferred?.ringName || worker.name, companyName: preferred?.companyName || "Free Agent", source: "world" as const }];
        }
        const contract = contracts.find((item) => item.companyId === rosterCompany);
        return contract ? [{ id: worker.id, name: contract.ringName || worker.name, companyName: contract.companyName, source: "world" as const }] : [];
      });
  }, [rosterCompany, startingUniverse]);
  const fallbackWorkers = useMemo<BookingRosterWorker[]>(() => {
    if (startingUniverse) return [];
    const hub = workerUniverse.profiles
      .filter((profile) => isWrestler(profile) && (rosterCompany === ALL_WORKERS_FILTER || rosterCompany === profile.companyName || (!profile.companyName && rosterCompany === activeCompany)))
      .map((profile) => ({ id: profile.linkedTewWorkerId || profile.id, name: profile.displayName, companyName: profile.companyName || activeCompany || "Unassigned", source: "hub" as const }));
    const imported = rosterCompany === ALL_WORKERS_FILTER ? (snapshot?.workers ?? []).filter((worker) => !hub.some((profile) => profile.id === worker.id || profile.name.toLowerCase() === worker.name.toLowerCase())).map((worker) => ({ id: worker.id, name: worker.name, companyName: "Imported", source: "snapshot" as const })) : [];
    return [...hub, ...imported];
  }, [activeCompany, rosterCompany, snapshot, startingUniverse, workerUniverse.profiles]);
  const rosterWorkers = useMemo(() => [...worldWorkers, ...fallbackWorkers]
    .filter((worker, index, list) => list.findIndex((item) => item.id === worker.id) === index)
    .filter((worker) => worker.name.toLowerCase().includes(workerSearch.trim().toLowerCase()))
    .sort((left, right) => left.name.localeCompare(right.name)), [fallbackWorkers, workerSearch, worldWorkers]);
  const selectedCompanyName = rosterCompany === ALL_WORKERS_FILTER ? "All Workers" : rosterCompany === FREE_AGENTS_FILTER ? "Free Agents" : worldCompanies.find((item) => item.id === rosterCompany)?.name || rosterCompany;

  useEffect(() => {
    if (!startingUniverse || rosterCompany === ALL_WORKERS_FILTER || rosterCompany === FREE_AGENTS_FILTER || startingUniverse.companies.some((item) => item.id === rosterCompany)) return;
    setRosterCompany(defaultCompanyId);
  }, [defaultCompanyId, rosterCompany, startingUniverse]);

  function appendWorker(id: string, name: string, source: "tew" | "manual"): void {
    if (segment.workers.some((worker) => worker.source === source && (worker.id === id || worker.name.toLowerCase() === name.toLowerCase()))) return;
    const index = segment.workers.length;
    onChange({ ...segment, workers: [...segment.workers, { id, name, source, role: "Competitor", side: automaticMatchSide(format, index) }] });
  }

  function addImportedWorker(): void {
    const worker = rosterWorkers.find((item) => item.id === importedWorkerId);
    if (!worker) return;
    appendWorker(worker.id, worker.name, "tew");
    setImportedWorkerId("");
  }

  function addManualWorker(): void {
    const name = manualWorkerName.trim();
    if (!name) return;
    appendWorker(createPlannerId(), name, "manual");
    setManualWorkerName("");
  }

  return <section className="basic-match-booking" aria-label="Basic match booking">
    <header><div><p className="eyebrow">COMPANY / ROSTER</p><h4>Choose wrestlers from any company in the game</h4></div><span className={validation === "Match setup is ready." ? "booking-ready" : "booking-needed"}>{validation}</span></header>
    <div className="booking-roster-controls">
      <label className="field"><span>Company / roster</span><select aria-label="Booking Company" value={rosterCompany} onChange={(event) => { setRosterCompany(event.target.value); setImportedWorkerId(""); }}><option value={ALL_WORKERS_FILTER}>All Workers</option><option value={FREE_AGENTS_FILTER}>Free Agents</option>{worldCompanies.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " (Inactive)"}</option>)}{!startingUniverse && Array.from(new Set([defaultCompany, activeCompany, ...workerUniverse.profiles.map((profile) => profile.companyName)].filter((name): name is string => Boolean(name)))).sort().map((name) => <option key={name} value={name}>{name}</option>)}</select><small>{rosterWorkers.length} wrestler{rosterWorkers.length === 1 ? "" : "s"} in {selectedCompanyName}.</small></label>
      <label className="field"><span>Search roster</span><input aria-label="Search company roster" value={workerSearch} placeholder="Search by wrestler name" onChange={(event) => { setWorkerSearch(event.target.value); setImportedWorkerId(""); }} /></label>
      <label className="field"><span>Wrestler</span><select aria-label="Company wrestler" value={importedWorkerId} disabled={!rosterWorkers.length} onChange={(event) => setImportedWorkerId(event.target.value)}><option value="">{rosterWorkers.length ? "Select a wrestler" : "No wrestlers match this filter"}</option>{rosterWorkers.map((worker) => <option key={`${worker.id}-${worker.name}`} value={worker.id}>{worker.name}{rosterCompany === ALL_WORKERS_FILTER ? ` · ${worker.companyName}` : ""}</option>)}</select></label>
      <button className="secondary-button compact-button booking-add-worker" type="button" disabled={!importedWorkerId} onClick={addImportedWorker}>Add Wrestler</button>
      <div className="manual-worker-inline"><input aria-label="Manual worker name" value={manualWorkerName} placeholder="Manual wrestler" onChange={(event) => setManualWorkerName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addManualWorker(); } }} /><button className="secondary-button compact-button" type="button" aria-label="Add Manual Worker" disabled={!manualWorkerName.trim()} onClick={addManualWorker}>Add</button></div>
    </div>
    {segment.workers.length ? <div className="basic-participant-list">{segment.workers.map((worker, index) => <article key={worker.id}><b>{index + 1}</b><div><strong>{worker.name}</strong><small>{worker.source === "tew" ? "TEW roster" : "Manual entry"}</small></div><label className="field"><span>Side / team</span><input value={worker.side} onChange={(event) => onChange({ ...segment, workers: segment.workers.map((item) => item.id === worker.id ? { ...item, side: event.target.value } : item) })} /></label><button className="danger-button compact-button" type="button" aria-label={`Remove ${worker.name}`} onClick={() => onChange({ ...segment, workers: segment.workers.filter((item) => item.id !== worker.id) })}>Remove</button></article>)}</div> : <p className="narrative-empty-line">No wrestlers selected. Add wrestlers above; a TEW snapshot is optional.</p>}
  </section>;
}

function SegmentEditor({
  segment,
  index,
  count,
  snapshot,
  company = "",
  startingUniverse,
  matchEngine,
  onMatchEngineChange,
  onChange,
  onMove,
  onDelete,
  onClose,
}: {
  segment: PlannedSegment;
  index: number;
  count: number;
  snapshot: TewSnapshot | null;
  company?: string;
  startingUniverse: StartingUniverseRecord | null;
  matchEngine: MatchEngineUniverse;
  onMatchEngineChange: (universe: MatchEngineUniverse) => void;
  onChange: (segment: PlannedSegment) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onClose: (saved: boolean) => void;
}) {
  return (
    <article
      id={`planned-segment-${segment.id}`}
      className={`planned-segment planned-segment--${segment.type}`}
      data-segment-type={segment.type}
      data-segment-id={segment.id}
    >
      <header className="planned-segment__header">
        <div>
          <span className="segment-order">#{index + 1}</span>
          <span className="segment-kind">{segment.type === "match" ? "MATCH" : "ANGLE"}</span>
          <span className={`narrative-status ${narrativeIsComplete(segment) ? "complete" : "incomplete"}`}>
            {narrativeIsComplete(segment) ? "Narrative added" : "Narrative needed"}
          </span>
          <span className="workflow-status">{segment.workflowStatus}</span>
        </div>
        <div className="segment-actions">
          <button type="button" onClick={() => onClose(false)}>Back to Card</button>
          <button className="primary-button" type="button" onClick={() => onClose(true)}>Save and Close</button>
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move segment up">Move Up</button>
          <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move segment down">Move Down</button>
          <button className="danger-button" type="button" onClick={onDelete}>Remove</button>
        </div>
      </header>

      <div className="segment-form-grid">
        <div className="field field--wide auto-match-name"><span>Segment name</span><div><input aria-label="Segment name" value={segment.title} onChange={(event) => onChange({ ...segment, title: event.target.value })} />{segment.type === "match" && <button className="secondary-button" type="button" disabled={!autoNameMatch(segment)} onClick={() => { const title = autoNameMatch(segment); if (title) onChange({ ...segment, title }); }}>Auto-Name Match</button>}</div></div>
        <label className="field"><span>Placement</span><select value={segment.section} onChange={(event) => onChange({ ...segment, section: event.target.value as PlannedSegment["section"] })}><option>Pre-Show</option><option>Main Show</option><option>Post-Show</option></select></label>
        {segment.type === "angle" && <label className="field"><span>Length (minutes)</span><input type="number" min={1} max={180} value={segment.durationMinutes} onChange={(event) => onChange({ ...segment, durationMinutes: Math.max(1, Number(event.target.value) || 1) })} /></label>}
        {segment.type === "angle" && <label className="field field--full"><span>Quick planning outline</span><textarea rows={3} placeholder="A short overview for the running order. Use Narrative Details below for the complete story." value={segment.notes} onChange={(event) => onChange({ ...segment, notes: event.target.value })} /></label>}
      </div>

      {segment.type === "match" && <MatchSettingsEditor segment={segment} onChange={onChange} />}
      {segment.type === "match" && <BasicMatchBooking segment={segment} snapshot={snapshot} company={company} startingUniverse={startingUniverse} onChange={onChange} />}
      {segment.type === "match" && <MatchApproachSetupEditor segment={segment} universe={matchEngine} onUniverseChange={onMatchEngineChange} onChange={onChange} />}
      <NarrativeEditor segment={segment} availableWorkers={snapshot?.workers ?? []} availableStorylines={snapshot?.storylines ?? []} onChange={onChange} />
      {segment.type === "angle" && <NarrativeGenerator segment={segment} universe={matchEngine} onChange={onChange} />}
    </article>
  );
}

export default function PlannedShowWorkspace({
  snapshot,
  snapshotLoading = false,
  snapshotError = "",
  onSnapshotFile,
  onCloseSnapshot,
  initialShowId = "",
  initialSegmentId = "",
  onRunShow,
}: {
  snapshot: TewSnapshot | null;
  snapshotLoading?: boolean;
  snapshotError?: string;
  onSnapshotFile: (file: File) => void;
  onCloseSnapshot: () => void;
  initialShowId?: string;
  initialSegmentId?: string;
  onRunShow?: (showId: string) => void;
}) {
  const [shows, setShows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [matchEngine, setMatchEngine] = useState<MatchEngineUniverse>(() => loadMatchEngineUniverse(window.localStorage));
  const [startingUniverse, setStartingUniverse] = useState<StartingUniverseRecord | null>(null);
  const [selectedId, setSelectedId] = useState<string>(initialShowId);
  const [saveState, setSaveState] = useState<SaveState>("Saved");
  const [notice, setNotice] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("plan");
  const [activeSegmentId, setActiveSegmentId] = useState(initialSegmentId);
  const importRef = useRef<HTMLInputElement | null>(null);
  const snapshotRef = useRef<HTMLInputElement | null>(null);

  const selectedShow = useMemo(
    () => shows.find((show) => show.id === selectedId) ?? shows[0] ?? null,
    [selectedId, shows],
  );

  useEffect(() => {
    let cancelled = false;
    void loadActiveStartingUniverse(loadStartingUniverseState(window.localStorage)).then((record) => {
      if (!cancelled) setStartingUniverse(record);
    }).catch(() => {
      if (!cancelled) setStartingUniverse(null);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedId && shows[0]) setSelectedId(shows[0].id);
  }, [selectedId, shows]);

  useEffect(() => {
    setSaveState("Saving");
    try {
      savePlannedShows(window.localStorage, shows);
      setSaveState("Saved");
    } catch {
      setSaveState("Save failed");
    }
  }, [shows]);

  useEffect(() => {
    try {
      saveMatchEngineUniverse(window.localStorage, matchEngine);
    } catch {
      setSaveState("Save failed");
    }
  }, [matchEngine]);

  useEffect(() => {
    if (selectedShow?.status === "Reconciled") setEditorMode("reconcile");
  }, [selectedShow?.id, selectedShow?.status]);

  useEffect(() => {
    if (!activeSegmentId) return;
    if (!selectedShow?.segments.some((segment) => segment.id === activeSegmentId)) setActiveSegmentId("");
  }, [activeSegmentId, selectedShow]);

  useEffect(() => {
    if (!initialShowId || selectedShow?.id !== initialShowId) return;
    setEditorMode("plan");
    if (!initialSegmentId) return;
    setActiveSegmentId(initialSegmentId);
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`planned-segment-${initialSegmentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialShowId, initialSegmentId, selectedShow?.id]);

  function updateShow(showId: string, updater: (show: PlannedShow) => PlannedShow): void {
    setShows((current) => current.map((show) => (show.id === showId ? touchShow(updater(show)) : show)));
  }

  function addShow(): void {
    const show = createPlannedShow(shows.length + 1);
    setShows((current) => [show, ...current]);
    setSelectedId(show.id);
    setEditorMode("plan");
    setActiveSegmentId("");
    setNotice("New planned show created.");
  }

  function duplicateShow(): void {
    if (!selectedShow) return;
    const duplicate = duplicatePlannedShow(selectedShow);
    setShows((current) => [duplicate, ...current]);
    setSelectedId(duplicate.id);
    setEditorMode("plan");
    setActiveSegmentId("");
    setNotice("Show duplicated with a clean reconciliation record.");
  }

  function deleteShow(): void {
    if (!selectedShow || !window.confirm(`Delete ${selectedShow.name}? This cannot be undone.`)) return;
    const remaining = shows.filter((show) => show.id !== selectedShow.id);
    setShows(remaining);
    setSelectedId(remaining[0]?.id ?? "");
    setActiveSegmentId("");
    setNotice("Planned show deleted.");
  }

  function addSegment(type: PlannedSegment["type"]): void {
    if (!selectedShow) return;
    const segment = createPlannedSegment(type);
    updateShow(selectedShow.id, (show) => ({ ...show, segments: [...show.segments, segment] }));
    setActiveSegmentId(segment.id);
    setNotice(type === "match" ? "Match added. Choose the format and wrestlers below." : "Angle added to the card.");
    window.requestAnimationFrame(() => document.getElementById(`planned-segment-${segment.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function runShow(): void {
    if (!selectedShow || !onRunShow) return;
    savePlannedShows(window.localStorage, shows);
    onRunShow(selectedShow.id);
  }

  async function importBackup(file: File): Promise<void> {
    try {
      const imported = parsePlannerBackup(await file.text());
      if (shows.length > 0 && !window.confirm("Replace the planned shows saved in this browser?")) return;
      setShows(imported);
      setMatchEngine(loadMatchEngineUniverse(window.localStorage));
      setSelectedId(imported[0]?.id ?? "");
      setEditorMode(imported[0]?.status === "Reconciled" ? "reconcile" : "plan");
      setNotice(`Imported ${imported.length} planned show${imported.length === 1 ? "" : "s"}. Storyline, handoff, and match-profile data were restored when present.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The backup could not be imported.");
    }
  }

  const completeNarratives = selectedShow?.segments.filter(narrativeIsComplete).length ?? 0;
  const activeSegment = selectedShow?.segments.find((segment) => segment.id === activeSegmentId) ?? null;

  return (
    <section className="planner-workspace">
      <header className="planner-toolbar">
        <div><p className="eyebrow">PLANNED SHOW WORKSPACE</p><h2>Plan the show for TEW, add match approaches, then preserve what actually happened</h2><p>TEW remains the simulation game. The tracker adds Match Stories, Segment Outputs, approach strategy, handoff support, and permanent history.</p></div>
        <div className="planner-toolbar__actions">
          <span className={`save-state save-state--${saveState.toLowerCase().replace(" ", "-")}`}>{saveState}</span>
          <button className="primary-button" type="button" onClick={addShow}>Create Show</button>
          <button className="secondary-button" type="button" onClick={() => downloadBackup(shows, matchEngine)} disabled={shows.length === 0}>Export Backup</button>
          <button className="secondary-button" type="button" onClick={() => importRef.current?.click()}>Import Backup</button>
          <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.item(0); if (file) void importBackup(file); event.currentTarget.value = ""; }} />
        </div>
      </header>

      <section className={`planner-snapshot-bar ${snapshot ? "is-loaded" : ""}`}>
        <div><strong>{snapshot ? `TEW reference loaded: ${snapshot.fileName}` : "TEW reference and results snapshot"}</strong><span>{snapshot ? `${snapshot.workers.length} workers, ${snapshot.storylines.length} storylines, and ${snapshot.shows.length} completed shows are available.` : "Import a current MDB while planning, then replace it with the post-show MDB when the show is complete."}</span>{snapshotLoading && <small>Reading TEW snapshot…</small>}{snapshotError && <small className="snapshot-error">{snapshotError}</small>}</div>
        <div><button className="secondary-button" type="button" onClick={() => snapshotRef.current?.click()} disabled={snapshotLoading}>{snapshot ? "Replace TEW Snapshot" : "Import TEW Snapshot"}</button>{snapshot && <button className="secondary-button" type="button" onClick={onCloseSnapshot}>Close Snapshot</button>}<input ref={snapshotRef} className="visually-hidden" type="file" accept=".mdb,.accdb,application/x-msaccess" onChange={(event) => { const file = event.target.files?.item(0); if (file) onSnapshotFile(file); event.currentTarget.value = ""; }} /></div>
      </section>

      {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

      <div className="planner-layout">
        <aside className="planned-show-list"><div className="panel-heading"><span>Planned Shows</span><strong>{shows.length}</strong></div>{shows.length === 0 ? <div className="empty-state compact">No shows have been planned yet.</div> : shows.map((show) => <button type="button" className={selectedShow?.id === show.id ? "selected" : ""} key={show.id} onClick={() => { setSelectedId(show.id); setEditorMode(show.status === "Reconciled" ? "reconcile" : "plan"); setActiveSegmentId(""); }}><strong>{show.name || "Untitled Show"}</strong><span>{show.date || "Date not set"}</span><small>{show.segments.length} segment{show.segments.length === 1 ? "" : "s"} · {show.status}</small>{show.reconciliation && <em>Linked: {show.reconciliation.actualShow.name}</em>}</button>)}</aside>

        {!selectedShow ? <section className="planner-empty-card"><h3>Create your first show</h3><p>The card and its complete narrative can be written here before you create anything inside TEW.</p><button className="primary-button" type="button" onClick={addShow}>Create Show</button></section> : <div className="planner-editor">
          <nav className="show-workflow-tabs" aria-label="Selected show workflow"><button type="button" className={editorMode === "plan" ? "active" : ""} onClick={() => setEditorMode("plan")}>Plan Card</button><button type="button" className={editorMode === "reconcile" ? "active" : ""} onClick={() => setEditorMode("reconcile")}>{selectedShow.status === "Reconciled" ? "Enhanced History" : "Reconcile Results"}</button></nav>
          {editorMode === "reconcile" ? <ReconciliationWorkspace show={selectedShow} allShows={shows} snapshot={snapshot} onChange={(updated) => updateShow(selectedShow.id, () => updated)} /> : <>
            <section className="planned-show-details"><header className="planned-show-details__header"><div><p className="eyebrow">SHOW DETAILS</p><h3>{selectedShow.name || "Untitled Show"}</h3></div><div className="show-record-actions"><button className="primary-button" type="button" onClick={runShow}>Run This Show</button><button className="secondary-button" type="button" onClick={duplicateShow}>Duplicate</button><button className="danger-button" type="button" onClick={deleteShow}>Delete Show</button></div></header>
              <div className="show-form-grid">
                <label className="field field--wide"><span>Show name</span><input value={selectedShow.name} onChange={(event) => updateShow(selectedShow.id, (show) => ({ ...show, name: event.target.value }))} /></label>
                <label className="field"><span>Date</span><input type="date" value={selectedShow.date} onChange={(event) => updateShow(selectedShow.id, (show) => ({ ...show, date: event.target.value }))} /></label>
                <label className="field"><span>Status</span><select value={selectedShow.status} onChange={(event) => updateShow(selectedShow.id, (show) => ({ ...show, status: event.target.value as PlannedShow["status"] }))}><option>Draft</option><option>Ready</option><option>Completed</option><option>Reconciled</option></select></label>
                <label className="field"><span>Company</span><input value={selectedShow.company} onChange={(event) => updateShow(selectedShow.id, (show) => ({ ...show, company: event.target.value }))} /></label>
                <label className="field"><span>Show type</span><select value={selectedShow.showType} onChange={(event) => updateShow(selectedShow.id, (show) => ({ ...show, showType: event.target.value }))}><option>Television</option><option>Event</option><option>Tour Show</option><option>House Show</option><option>Other</option></select></label>
                <label className="field"><span>Expected length</span><input type="number" min={15} max={600} value={selectedShow.expectedMinutes} onChange={(event) => updateShow(selectedShow.id, (show) => ({ ...show, expectedMinutes: Math.max(15, Number(event.target.value) || 15) }))} /></label>
                <label className="field field--wide"><span>Venue / location</span><input value={selectedShow.venue} onChange={(event) => updateShow(selectedShow.id, (show) => ({ ...show, venue: event.target.value }))} /></label>
                <label className="field"><span>Venue capacity</span><input aria-label="Show venue capacity" type="number" min={0} value={selectedShow.venueCapacity} onChange={(event) => updateShow(selectedShow.id, (show) => ({ ...show, venueCapacity: Math.max(0, Math.round(Number(event.target.value) || 0)) }))} /><small>Use 0 when no capacity is known.</small></label>
                <label className="field"><span>Local market demand</span><input aria-label="Show market demand" type="number" min={0} max={100} value={selectedShow.marketDemand} onChange={(event) => updateShow(selectedShow.id, (show) => ({ ...show, marketDemand: Math.max(0, Math.min(100, Number(event.target.value) || 0)) }))} /><small>50 is neutral; local history can raise or lower it.</small></label>
                <label className="field field--full"><span>Show notes</span><textarea rows={3} value={selectedShow.notes} onChange={(event) => updateShow(selectedShow.id, (show) => ({ ...show, notes: event.target.value }))} /></label>
              </div>
            </section>
            <section className="planned-card-editor"><header className="card-editor-header"><div><p className="eyebrow">{activeSegment ? "SEGMENT BOOKING" : "CARD / BOOKING"}</p><h3>{activeSegment ? activeSegment.title : `${selectedShow.segments.length} planned segment${selectedShow.segments.length === 1 ? "" : "s"}`}</h3><p>{activeSegment ? "Complete this segment, save it, then return to the running order." : `${totalPlannedMinutes(selectedShow)} of ${selectedShow.expectedMinutes} expected minutes planned · ${completeNarratives} narratives complete`}</p></div>{!activeSegment && <div className="card-editor-actions"><button className="primary-button" type="button" onClick={() => addSegment("match")}>Add Match</button><button className="secondary-button" type="button" onClick={() => addSegment("angle")}>Add Angle</button></div>}</header>
              {!activeSegment && selectedShow.segments.length > 0 && <div className="tew-card-list" aria-label="Current card summary">{selectedShow.segments.map((segment, index) => <button type="button" key={segment.id} className={`tew-card-row tew-card-row--${segment.type}`} onClick={() => setActiveSegmentId(segment.id)}><b>{index + 1}</b><span>{segment.title || (segment.type === "match" ? "Untitled Match" : "Untitled Angle")}</span><small>{segment.type === "match" ? "MATCH" : "ANGLE"}</small></button>)}</div>}
              {!activeSegment && selectedShow.segments.length === 0 && <div className="empty-state card-empty">Add a match or angle to begin building the show in running order.</div>}
              {activeSegment && <div className="planned-segment-list"><SegmentEditor key={activeSegment.id} segment={activeSegment} index={selectedShow.segments.findIndex((segment) => segment.id === activeSegment.id)} count={selectedShow.segments.length} snapshot={snapshot} company={selectedShow.company} startingUniverse={startingUniverse} matchEngine={matchEngine} onMatchEngineChange={setMatchEngine} onChange={(updated) => updateShow(selectedShow.id, (show) => ({ ...show, segments: show.segments.map((item) => item.id === updated.id ? updated : item) }))} onMove={(direction) => updateShow(selectedShow.id, (show) => ({ ...show, segments: movePlannedSegment(show.segments, activeSegment.id, direction) }))} onDelete={() => { updateShow(selectedShow.id, (show) => ({ ...show, segments: show.segments.filter((item) => item.id !== activeSegment.id) })); setActiveSegmentId(""); setNotice("Segment removed from the card."); }} onClose={(saved) => { setActiveSegmentId(""); if (saved) setNotice("Segment saved. Returned to the card."); }} /></div>}
            </section>
          </>}
        </div>}
      </div>
    </section>
  );
}
