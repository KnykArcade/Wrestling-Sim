import { useEffect, useMemo, useRef, useState } from "react";
import { createPlannerBackup, loadPlannedShows, parsePlannerBackupBundle, savePlannedShows } from "../planner/storage";
import type { PlannedShow } from "../planner/types";
import { loadTrackerStorylines, saveTrackerStorylines } from "../storylines/storage";
import type { TrackerStoryline } from "../storylines/types";
import type { TewSnapshot } from "../tew/types";
import {
  buildWorkerHistory,
  buildWorkerWarnings,
  calculateWorkerStatistics,
  compareWorkers,
  createWorkerArc,
  createWorkerProfile,
  createWorkerRelationship,
  discoverWorkerCandidates,
  duplicateWorkerProfile,
  normalizeWorkerName,
  touchWorkerProfile,
} from "./model";
import { emptyWorkerUniverse, loadWorkerUniverse, saveWorkerUniverse } from "./storage";
import type {
  WorkerArc,
  WorkerCandidate,
  WorkerProfile,
  WorkerRelationship,
  WorkerUniverse,
} from "./types";

function formatDate(value: string): string {
  if (!value) return "—";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(parsed);
}

function downloadBackup(shows: PlannedShow[], storylines: TrackerStoryline[], workers: WorkerUniverse): void {
  const backup = createPlannerBackup(shows, storylines, workers);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tew-story-tracker-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const relationshipTypes: WorkerRelationship["type"][] = [
  "Ally", "Rival", "Tag Partner", "Stable Member", "Manager / Client", "Mentor / Student",
  "Family", "Authority Conflict", "Former Ally", "Betrayal", "Respect", "Other",
];

const arcStatuses: WorkerArc["status"][] = ["Idea", "Planned", "Active", "Paused", "Completed", "Abandoned"];

interface DirectoryItem {
  key: string;
  name: string;
  profile: WorkerProfile | null;
  candidate: WorkerCandidate | null;
}

export default function WorkerHub({
  snapshot,
  onOpenShow,
}: {
  snapshot: TewSnapshot | null;
  onOpenShow: (showId: string, segmentId: string) => void;
}) {
  const [shows, setShows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [storylines, setStorylines] = useState<TrackerStoryline[]>(() => loadTrackerStorylines(window.localStorage));
  const [universe, setUniverse] = useState<WorkerUniverse>(() => loadWorkerUniverse(window.localStorage));
  const [selectedKey, setSelectedKey] = useState("");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [notice, setNotice] = useState("");
  const [relationshipWorkerId, setRelationshipWorkerId] = useState("");
  const [comparisonWorkerId, setComparisonWorkerId] = useState("");
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => saveWorkerUniverse(window.localStorage, universe), [universe]);

  const candidates = useMemo(
    () => discoverWorkerCandidates(shows, storylines, snapshot),
    [shows, storylines, snapshot],
  );

  const directory = useMemo<DirectoryItem[]>(() => {
    const items = new Map<string, DirectoryItem>();
    universe.profiles.forEach((profile) => {
      items.set(normalizeWorkerName(profile.displayName), {
        key: `profile:${profile.id}`,
        name: profile.displayName,
        profile,
        candidate: null,
      });
    });
    candidates.forEach((candidate) => {
      const normalized = normalizeWorkerName(candidate.name);
      const existing = items.get(normalized);
      if (existing) {
        existing.candidate = candidate;
      } else {
        items.set(normalized, { key: candidate.key, name: candidate.name, profile: null, candidate });
      }
    });
    return [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [candidates, universe.profiles]);

  useEffect(() => {
    if (!selectedKey && directory[0]) setSelectedKey(directory[0].key);
  }, [directory, selectedKey]);

  const selectedItem = directory.find((item) => item.key === selectedKey)
    ?? directory.find((item) => item.profile?.id === selectedKey.replace("profile:", ""))
    ?? directory[0]
    ?? null;
  const selected = selectedItem?.profile ?? null;
  const history = useMemo(() => selected ? buildWorkerHistory(selected, shows) : [], [selected, shows]);
  const statistics = useMemo(() => calculateWorkerStatistics(history), [history]);
  const warnings = useMemo(
    () => selected ? buildWorkerWarnings(selected, universe, shows, storylines, snapshot) : [],
    [selected, universe, shows, storylines, snapshot],
  );
  const comparisonWorker = universe.profiles.find((profile) => profile.id === comparisonWorkerId) ?? null;
  const comparison = useMemo(
    () => selected && comparisonWorker ? compareWorkers(selected, comparisonWorker, shows, universe.relationships) : null,
    [selected, comparisonWorker, shows, universe.relationships],
  );

  const filteredDirectory = directory.filter((item) => {
    const profileSource = item.profile?.source ?? item.candidate?.source ?? "discovered";
    return item.name.toLowerCase().includes(search.toLowerCase())
      && (sourceFilter === "All" || profileSource === sourceFilter);
  });

  function createManualWorker(): void {
    const profile = createWorkerProfile(universe.profiles.length + 1);
    setUniverse((current) => ({ ...current, profiles: [profile, ...current.profiles] }));
    setSelectedKey(`profile:${profile.id}`);
    setNotice("New manual worker profile created.");
  }

  function createProfileFromCandidate(candidate: WorkerCandidate): void {
    const profile = createWorkerProfile(universe.profiles.length + 1, candidate);
    setUniverse((current) => ({ ...current, profiles: [profile, ...current.profiles] }));
    setSelectedKey(`profile:${profile.id}`);
    setNotice(`Creative profile created for ${profile.displayName}.`);
  }

  function updateSelected(updater: (profile: WorkerProfile) => WorkerProfile): void {
    if (!selected) return;
    setUniverse((current) => ({
      ...current,
      profiles: current.profiles.map((profile) => profile.id === selected.id ? touchWorkerProfile(updater(profile)) : profile),
    }));
  }

  function duplicateSelected(): void {
    if (!selected) return;
    const copy = duplicateWorkerProfile(selected);
    setUniverse((current) => ({ ...current, profiles: [copy, ...current.profiles] }));
    setSelectedKey(`profile:${copy.id}`);
    setNotice("Worker profile duplicated without its TEW link.");
  }

  function deleteSelected(): void {
    if (!selected || !window.confirm(`Delete ${selected.displayName}'s tracker profile? Historical show records will remain.`)) return;
    setUniverse((current) => ({
      profiles: current.profiles.filter((profile) => profile.id !== selected.id),
      relationships: current.relationships.filter((relationship) => relationship.workerAId !== selected.id && relationship.workerBId !== selected.id),
    }));
    setSelectedKey("");
    setNotice("Worker profile deleted. Planned and reconciled shows were not changed.");
  }

  function addArc(): void {
    if (!selected) return;
    updateSelected((profile) => ({ ...profile, arcs: [...profile.arcs, createWorkerArc(profile.arcs.length + 1)] }));
  }

  function updateArc(arcId: string, updater: (arc: WorkerArc) => WorkerArc): void {
    updateSelected((profile) => ({
      ...profile,
      arcs: profile.arcs.map((arc) => arc.id === arcId ? { ...updater(arc), updatedAt: new Date().toISOString() } : arc),
    }));
  }

  function addRelationship(): void {
    if (!selected || !relationshipWorkerId || relationshipWorkerId === selected.id) return;
    const exists = universe.relationships.some((relationship) =>
      (relationship.workerAId === selected.id && relationship.workerBId === relationshipWorkerId)
      || (relationship.workerBId === selected.id && relationship.workerAId === relationshipWorkerId),
    );
    if (exists) {
      setNotice("Those workers already have a relationship record.");
      return;
    }
    const relationship = createWorkerRelationship(selected.id, relationshipWorkerId);
    setUniverse((current) => ({ ...current, relationships: [...current.relationships, relationship] }));
    setRelationshipWorkerId("");
    setNotice("Relationship created.");
  }

  function updateRelationship(relationshipId: string, updater: (relationship: WorkerRelationship) => WorkerRelationship): void {
    setUniverse((current) => ({
      ...current,
      relationships: current.relationships.map((relationship) =>
        relationship.id === relationshipId
          ? { ...updater(relationship), updatedAt: new Date().toISOString() }
          : relationship,
      ),
    }));
  }

  async function importBackup(file: File): Promise<void> {
    try {
      const bundle = parsePlannerBackupBundle(await file.text());
      if (!window.confirm("Replace the shows, storylines, and worker profiles saved in this browser?")) return;
      savePlannedShows(window.localStorage, bundle.shows);
      saveTrackerStorylines(window.localStorage, bundle.storylines);
      saveWorkerUniverse(window.localStorage, bundle.workers);
      setShows(bundle.shows);
      setStorylines(bundle.storylines);
      setUniverse(bundle.workers);
      setSelectedKey(bundle.workers.profiles[0] ? `profile:${bundle.workers.profiles[0].id}` : "");
      setNotice(`Imported ${bundle.shows.length} shows, ${bundle.storylines.length} storylines, and ${bundle.workers.profiles.length} worker profiles.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The backup could not be imported.");
    }
  }

  const selectedRelationships = selected
    ? universe.relationships.filter((relationship) => relationship.workerAId === selected.id || relationship.workerBId === selected.id)
    : [];

  return <section className="worker-hub">
    <header className="worker-hub__toolbar">
      <div><p className="eyebrow">CREATIVE ROSTER</p><h2>Worker Creative Profiles and Relationship Network</h2><p>Collect each character's booking history, direction, arcs, and relationships without changing TEW.</p></div>
      <div className="worker-hub__actions">
        <button className="primary-button" type="button" onClick={createManualWorker}>Create Manual Worker</button>
        <button className="secondary-button" type="button" onClick={() => downloadBackup(shows, storylines, universe)}>Export Full Backup</button>
        <button className="secondary-button" type="button" onClick={() => importRef.current?.click()}>Import Full Backup</button>
        <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.item(0); if (file) void importBackup(file); event.currentTarget.value = ""; }} />
      </div>
    </header>

    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <div className="worker-hub__layout">
      <aside className="worker-directory">
        <div className="worker-directory__filters">
          <input aria-label="Search workers" placeholder="Search workers" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label="Filter worker source" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option>All</option><option value="tew">TEW</option><option value="manual">Manual</option><option value="discovered">Discovered</option></select>
        </div>
        <div className="panel-heading"><span>Workers and Characters</span><strong>{filteredDirectory.length}</strong></div>
        {filteredDirectory.length === 0 ? <div className="empty-state compact">No workers match this view.</div> : filteredDirectory.map((item) => <button type="button" key={item.key} className={selectedItem?.key === item.key ? "selected" : ""} onClick={() => setSelectedKey(item.key)}>
          <strong>{item.name}</strong>
          <span>{item.profile ? `${item.profile.currentRole} · ${item.profile.alignment}` : "Profile not created"}</span>
          <small>{item.candidate?.appearanceCount ?? 0} discovered appearance{(item.candidate?.appearanceCount ?? 0) === 1 ? "" : "s"}</small>
          <em>{item.profile?.brand || item.candidate?.brands[0] || (item.candidate?.source === "tew" ? "Imported TEW worker" : "Tracker discovery")}</em>
        </button>)}
      </aside>

      {!selectedItem ? <section className="worker-empty"><h3>Create your first worker profile</h3><p>Profiles connect planned and completed appearances into a permanent creative history.</p><button className="primary-button" type="button" onClick={createManualWorker}>Create Manual Worker</button></section>
        : !selected ? <section className="worker-empty candidate-preview"><p className="eyebrow">DISCOVERED WORKER</p><h3>{selectedItem.name}</h3><p>This name was found in {selectedItem.candidate?.source === "tew" ? "the imported TEW snapshot" : "your planned shows, reconciled history, or storylines"}. Create a profile to manage creative direction, arcs, and relationships.</p><button className="primary-button" type="button" onClick={() => selectedItem.candidate && createProfileFromCandidate(selectedItem.candidate)}>Create Creative Profile</button></section>
        : <div className="worker-editor">
          <section className="worker-panel">
            <header className="worker-editor__header"><div><p className="eyebrow">CREATIVE PROFILE</p><h3>{selected.displayName}</h3></div><div><button className="secondary-button" type="button" onClick={duplicateSelected}>Duplicate</button><button className="danger-button" type="button" onClick={deleteSelected}>Delete Profile</button></div></header>
            <div className="worker-form-grid">
              <label className="field field--wide"><span>Display name</span><input value={selected.displayName} onChange={(event) => updateSelected((profile) => ({ ...profile, displayName: event.target.value }))} /></label>
              <label className="field"><span>Current role</span><input value={selected.currentRole} onChange={(event) => updateSelected((profile) => ({ ...profile, currentRole: event.target.value }))} /></label>
              <label className="field"><span>Alignment</span><select aria-label="Worker alignment" value={selected.alignment} onChange={(event) => updateSelected((profile) => ({ ...profile, alignment: event.target.value as WorkerProfile["alignment"] }))}><option>Unspecified</option><option>Face</option><option>Heel</option><option>Tweener</option></select></label>
              <label className="field"><span>Brand / company</span><input value={selected.brand} onChange={(event) => updateSelected((profile) => ({ ...profile, brand: event.target.value }))} /></label>
              <label className="field"><span>Inactivity warning days</span><input type="number" min={1} max={365} value={selected.inactivityWarningDays} onChange={(event) => updateSelected((profile) => ({ ...profile, inactivityWarningDays: Math.max(1, Number(event.target.value) || 30) }))} /></label>
              <label className="field field--wide"><span>Linked TEW worker</span><select value={selected.linkedTewWorkerId} onChange={(event) => { const worker = snapshot?.workers.find((item) => item.id === event.target.value); updateSelected((profile) => ({ ...profile, linkedTewWorkerId: worker?.id ?? "", linkedTewWorkerName: worker?.name ?? "", source: worker ? "tew" : profile.source })); }}><option value="">No TEW link</option>{snapshot?.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label>
              <label className="field field--full"><span>Gimmick / character summary</span><textarea rows={3} value={selected.gimmickSummary} onChange={(event) => updateSelected((profile) => ({ ...profile, gimmickSummary: event.target.value }))} /></label>
              <label className="field field--wide"><span>Current motivation</span><textarea rows={3} value={selected.currentMotivation} onChange={(event) => updateSelected((profile) => ({ ...profile, currentMotivation: event.target.value }))} /></label>
              <label className="field field--wide"><span>Long-term objective</span><textarea rows={3} value={selected.longTermObjective} onChange={(event) => updateSelected((profile) => ({ ...profile, longTermObjective: event.target.value }))} /></label>
              <label className="field field--full"><span>Current creative direction</span><textarea rows={4} value={selected.creativeDirection} onChange={(event) => updateSelected((profile) => ({ ...profile, creativeDirection: event.target.value }))} /></label>
              <label className="field field--full"><span>Private booking notes</span><textarea rows={3} value={selected.privateNotes} onChange={(event) => updateSelected((profile) => ({ ...profile, privateNotes: event.target.value }))} /></label>
            </div>
          </section>

          <section className="worker-panel worker-statistics"><header><div><p className="eyebrow">AUTOMATIC RECORD</p><h3>Creative History Summary</h3></div></header><div className="worker-stat-grid">
            <div><span>Planned appearances</span><strong>{statistics.plannedAppearances}</strong></div><div><span>Completed</span><strong>{statistics.completedAppearances}</strong></div><div><span>Matches / angles</span><strong>{statistics.matches} / {statistics.angles}</strong></div><div><span>Win-loss</span><strong>{statistics.wins}-{statistics.losses}</strong></div><div><span>Match rating</span><strong>{statistics.averageMatchRating ?? "—"}</strong></div><div><span>Angle rating</span><strong>{statistics.averageAngleRating ?? "—"}</strong></div><div><span>Storylines</span><strong>{statistics.storylines}</strong></div><div><span>Appearance streak</span><strong>{statistics.appearanceStreak}</strong></div><div><span>Last appearance</span><strong>{formatDate(statistics.lastAppearance)}</strong></div><div><span>Next appearance</span><strong>{formatDate(statistics.nextAppearance)}</strong></div>
          </div></section>

          {warnings.length > 0 && <section className="worker-panel worker-warnings"><header><p className="eyebrow">CREATIVE CONTINUITY</p><h3>{warnings.length} warning{warnings.length === 1 ? "" : "s"}</h3></header>{warnings.map((warning) => <div key={warning.id}><strong>{warning.category}</strong><span>{warning.message}</span></div>)}</section>}

          <section className="worker-panel"><header className="worker-section-header"><div><p className="eyebrow">CHARACTER ARCS</p><h3>{selected.arcs.length} arc{selected.arcs.length === 1 ? "" : "s"}</h3></div><button className="primary-button" type="button" onClick={addArc}>Add Character Arc</button></header>
            {selected.arcs.length === 0 ? <div className="empty-state compact">No character arcs have been planned.</div> : selected.arcs.map((arc) => <article className="worker-arc" key={arc.id}>
              <div className="worker-arc__top"><label className="field field--wide"><span>Arc name</span><input value={arc.name} onChange={(event) => updateArc(arc.id, (item) => ({ ...item, name: event.target.value }))} /></label><label className="field"><span>Arc status</span><select value={arc.status} onChange={(event) => updateArc(arc.id, (item) => ({ ...item, status: event.target.value as WorkerArc["status"] }))}>{arcStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><button className="danger-button" type="button" onClick={() => updateSelected((profile) => ({ ...profile, arcs: profile.arcs.filter((item) => item.id !== arc.id) }))}>Remove</button></div>
              <div className="worker-form-grid"><label className="field field--wide"><span>Starting situation</span><textarea rows={2} value={arc.startingSituation} onChange={(event) => updateArc(arc.id, (item) => ({ ...item, startingSituation: event.target.value }))} /></label><label className="field field--wide"><span>Motivation</span><textarea rows={2} value={arc.motivation} onChange={(event) => updateArc(arc.id, (item) => ({ ...item, motivation: event.target.value }))} /></label><label className="field field--wide"><span>Internal conflict</span><textarea rows={2} value={arc.internalConflict} onChange={(event) => updateArc(arc.id, (item) => ({ ...item, internalConflict: event.target.value }))} /></label><label className="field field--wide"><span>External conflict</span><textarea rows={2} value={arc.externalConflict} onChange={(event) => updateArc(arc.id, (item) => ({ ...item, externalConflict: event.target.value }))} /></label><label className="field field--wide"><span>Turning point</span><textarea rows={2} value={arc.turningPoint} onChange={(event) => updateArc(arc.id, (item) => ({ ...item, turningPoint: event.target.value }))} /></label><label className="field field--wide"><span>Planned resolution</span><textarea rows={2} value={arc.plannedResolution} onChange={(event) => updateArc(arc.id, (item) => ({ ...item, plannedResolution: event.target.value }))} /></label><label className="field"><span>Linked storyline</span><select value={arc.linkedStorylineId} onChange={(event) => updateArc(arc.id, (item) => ({ ...item, linkedStorylineId: event.target.value }))}><option value="">No storyline</option>{storylines.map((storyline) => <option key={storyline.id} value={storyline.id}>{storyline.name}</option>)}</select></label><label className="field"><span>Target show</span><select value={arc.targetShowId} onChange={(event) => updateArc(arc.id, (item) => ({ ...item, targetShowId: event.target.value }))}><option value="">No show</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}</select></label><label className="field"><span>Target date</span><input type="date" value={arc.targetDate} onChange={(event) => updateArc(arc.id, (item) => ({ ...item, targetDate: event.target.value }))} /></label><label className="field field--wide"><span>Aftermath</span><textarea rows={2} value={arc.aftermath} onChange={(event) => updateArc(arc.id, (item) => ({ ...item, aftermath: event.target.value }))} /></label></div>
            </article>)}
          </section>

          <section className="worker-panel"><header className="worker-section-header"><div><p className="eyebrow">RELATIONSHIP NETWORK</p><h3>{selectedRelationships.length} relationship{selectedRelationships.length === 1 ? "" : "s"}</h3></div><div className="relationship-add"><select aria-label="Relationship worker" value={relationshipWorkerId} onChange={(event) => setRelationshipWorkerId(event.target.value)}><option value="">Select another profile</option>{universe.profiles.filter((profile) => profile.id !== selected.id).map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select><button className="primary-button" type="button" disabled={!relationshipWorkerId} onClick={addRelationship}>Add Relationship</button></div></header>
            {selectedRelationships.length === 0 ? <div className="empty-state compact">Create another worker profile to start a relationship network.</div> : selectedRelationships.map((relationship) => {
              const otherId = relationship.workerAId === selected.id ? relationship.workerBId : relationship.workerAId;
              const other = universe.profiles.find((profile) => profile.id === otherId);
              return <article className="worker-relationship" key={relationship.id}><header><div><strong>{other?.displayName ?? "Missing worker"}</strong><span>{relationship.type} · {relationship.status}</span></div><button className="danger-button" type="button" onClick={() => setUniverse((current) => ({ ...current, relationships: current.relationships.filter((item) => item.id !== relationship.id) }))}>Remove</button></header><div className="worker-form-grid"><label className="field"><span>Relationship type</span><select value={relationship.type} onChange={(event) => updateRelationship(relationship.id, (item) => ({ ...item, type: event.target.value as WorkerRelationship["type"] }))}>{relationshipTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label className="field"><span>Status</span><select value={relationship.status} onChange={(event) => updateRelationship(relationship.id, (item) => ({ ...item, status: event.target.value as WorkerRelationship["status"] }))}><option>Planned</option><option>Active</option><option>Paused</option><option>Ended</option></select></label><label className="field"><span>Importance</span><input type="number" min={0} max={100} value={relationship.importance} onChange={(event) => updateRelationship(relationship.id, (item) => ({ ...item, importance: Math.min(100, Math.max(0, Number(event.target.value) || 0)) }))} /></label><label className="field"><span>Linked storyline</span><select value={relationship.linkedStorylineId} onChange={(event) => updateRelationship(relationship.id, (item) => ({ ...item, linkedStorylineId: event.target.value }))}><option value="">No storyline</option>{storylines.map((storyline) => <option key={storyline.id} value={storyline.id}>{storyline.name}</option>)}</select></label><label className="field field--full"><span>Public relationship description</span><textarea rows={2} value={relationship.publicDescription} onChange={(event) => updateRelationship(relationship.id, (item) => ({ ...item, publicDescription: event.target.value }))} /></label><label className="field field--wide"><span>Relationship history / aftermath</span><textarea rows={3} value={relationship.history} onChange={(event) => updateRelationship(relationship.id, (item) => ({ ...item, history: event.target.value }))} /></label><label className="field field--wide"><span>Private creative notes</span><textarea rows={3} value={relationship.privateNotes} onChange={(event) => updateRelationship(relationship.id, (item) => ({ ...item, privateNotes: event.target.value }))} /></label></div></article>;
            })}
          </section>

          <section className="worker-panel"><header className="worker-section-header"><div><p className="eyebrow">TWO-PERSON COMPARISON</p><h3>Shared creative history</h3></div><select aria-label="Compare with worker" value={comparisonWorkerId} onChange={(event) => setComparisonWorkerId(event.target.value)}><option value="">Select another profile</option>{universe.profiles.filter((profile) => profile.id !== selected.id).map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select></header>
            {!comparison || !comparisonWorker ? <div className="empty-state compact">Select another profile to compare interactions, storylines, and results.</div> : <><div className="worker-comparison-grid"><div><span>Shared segments</span><strong>{comparison.sharedEntries.length}</strong></div><div><span>Shared storylines</span><strong>{comparison.sharedStorylines.length}</strong></div><div><span>{selected.displayName} wins</span><strong>{comparison.workerAWins}</strong></div><div><span>{comparisonWorker.displayName} wins</span><strong>{comparison.workerBWins}</strong></div><div><span>First interaction</span><strong>{formatDate(comparison.firstInteraction)}</strong></div><div><span>Latest interaction</span><strong>{formatDate(comparison.latestInteraction)}</strong></div><div><span>Next booking</span><strong>{formatDate(comparison.nextInteraction)}</strong></div><div><span>Relationship</span><strong>{comparison.relationship?.type ?? "None"}</strong></div></div>{comparison.sharedStorylines.length > 0 && <p className="shared-storylines"><strong>Shared storylines:</strong> {comparison.sharedStorylines.join(", ")}</p>}</>}
          </section>

          <section className="worker-panel"><header className="worker-section-header"><div><p className="eyebrow">AUTOMATIC CREATIVE HISTORY</p><h3>{history.length} appearance{history.length === 1 ? "" : "s"}</h3></div></header>
            {history.length === 0 ? <div className="empty-state compact">No planned or reconciled appearances were found for this worker.</div> : <div className="worker-history">{[...history].reverse().map((entry) => <article key={entry.id}><header><div><span>{formatDate(entry.showDate)} · {entry.showName}</span><h4>{entry.segmentTitle}</h4><small>{entry.segmentType === "match" ? "Match" : "Angle"} · {entry.workflowStatus}</small></div><div><strong>{entry.rating ?? "—"}</strong><button className="secondary-button" type="button" onClick={() => onOpenShow(entry.showId, entry.segmentId)}>Open Show</button></div></header><div className="history-narratives"><div><span>Planned</span><p>{entry.plannedNarrative || "No planned narrative."}</p></div><div><span>Final / result</span><p>{entry.finalNarrative || entry.result || "No final record."}</p></div></div>{entry.storylineNames.length > 0 && <p><strong>Storylines:</strong> {entry.storylineNames.join(", ")}</p>}{(entry.consequences || entry.followUp) && <footer><span>{entry.consequences || "No consequences recorded."}</span><span>{entry.followUp || "No follow-up recorded."}</span></footer>}</article>)}</div>}
          </section>
        </div>}
    </div>
  </section>;
}
