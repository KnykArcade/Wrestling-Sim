import { useEffect, useMemo, useRef, useState } from "react";
import type { TewSnapshot } from "../tew/types";
import { createPlannerBackup, loadPlannedShows, parsePlannerBackupBundle, savePlannedShows } from "../planner/storage";
import { createPlannerId } from "../planner/model";
import type { PlannedShow } from "../planner/types";
import {
  buildContinuityWarnings,
  buildStorylineTimeline,
  collectStorylineReferences,
  createStorylineMilestone,
  createTrackerStoryline,
  duplicateTrackerStoryline,
  syncKnownSegmentIds,
  touchStoryline,
} from "./model";
import { loadTrackerStorylines, saveTrackerStorylines } from "./storage";
import type {
  StorylineMilestone,
  StorylineParticipant,
  StorylineReferenceLink,
  TrackerStoryline,
} from "./types";

function downloadBackup(shows: PlannedShow[], storylines: TrackerStoryline[]): void {
  const backup = createPlannerBackup(shows, storylines);
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

function formatDate(value: string): string {
  if (!value) return "Date not set";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(parsed);
}

const participantRoles = [
  "Protagonist",
  "Antagonist",
  "Ally",
  "Manager",
  "Authority figure",
  "Supporting participant",
  "Former participant",
];

const milestoneTypes: StorylineMilestone["type"][] = [
  "Inciting Incident",
  "Escalation",
  "Betrayal",
  "Reveal",
  "Match",
  "Title Change",
  "Turn",
  "Climax",
  "Aftermath",
  "Other",
];

export default function StorylineHub({
  snapshot,
  onOpenShow,
}: {
  snapshot: TewSnapshot | null;
  onOpenShow: (showId: string, segmentId: string) => void;
}) {
  const [shows, setShows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [storylines, setStorylines] = useState<TrackerStoryline[]>(() => {
    const saved = loadTrackerStorylines(window.localStorage);
    const currentShows = loadPlannedShows(window.localStorage);
    return saved.map((storyline) =>
      syncKnownSegmentIds(storyline, buildStorylineTimeline(storyline, currentShows)),
    );
  });
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [notice, setNotice] = useState("");
  const [manualParticipant, setManualParticipant] = useState("");
  const [importedParticipantId, setImportedParticipantId] = useState("");
  const [referenceKey, setReferenceKey] = useState("");
  const [tewReferenceId, setTewReferenceId] = useState("");
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    saveTrackerStorylines(window.localStorage, storylines);
  }, [storylines]);

  useEffect(() => {
    if (!selectedId && storylines[0]) setSelectedId(storylines[0].id);
  }, [selectedId, storylines]);

  const selected = storylines.find((item) => item.id === selectedId) ?? storylines[0] ?? null;
  const timeline = useMemo(
    () => (selected ? buildStorylineTimeline(selected, shows) : []),
    [selected, shows],
  );
  const warnings = useMemo(
    () => (selected ? buildContinuityWarnings(selected, shows, timeline) : []),
    [selected, shows, timeline],
  );
  const references = useMemo(() => collectStorylineReferences(shows), [shows]);
  const filtered = storylines.filter((storyline) => {
    const matchesSearch = storyline.name.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (statusFilter === "All" || storyline.status === statusFilter);
  });

  function updateSelected(updater: (storyline: TrackerStoryline) => TrackerStoryline): void {
    if (!selected) return;
    setStorylines((current) =>
      current.map((item) => (item.id === selected.id ? touchStoryline(updater(item)) : item)),
    );
  }

  function addStoryline(): void {
    const storyline = createTrackerStoryline(storylines.length + 1);
    setStorylines((current) => [storyline, ...current]);
    setSelectedId(storyline.id);
    setNotice("New storyline created.");
  }

  function duplicateStoryline(): void {
    if (!selected) return;
    const copy = duplicateTrackerStoryline(selected);
    setStorylines((current) => [copy, ...current]);
    setSelectedId(copy.id);
    setNotice("Storyline duplicated as a new idea.");
  }

  function deleteStoryline(): void {
    if (!selected || !window.confirm(`Delete ${selected.name}? This cannot be undone.`)) return;
    const remaining = storylines.filter((item) => item.id !== selected.id);
    setStorylines(remaining);
    setSelectedId(remaining[0]?.id ?? "");
    setNotice("Storyline deleted. Planned show segments were not changed.");
  }

  function addParticipant(participant: StorylineParticipant): void {
    if (!selected || selected.participants.some((item) => item.name.toLowerCase() === participant.name.toLowerCase())) return;
    updateSelected((storyline) => ({ ...storyline, participants: [...storyline.participants, participant] }));
  }

  function addReference(reference: StorylineReferenceLink): void {
    if (!selected || selected.referenceLinks.some((item) => item.source === reference.source && item.referenceId === reference.referenceId)) return;
    updateSelected((storyline) => ({ ...storyline, referenceLinks: [...storyline.referenceLinks, reference] }));
  }

  async function importBackup(file: File): Promise<void> {
    try {
      const bundle = parsePlannerBackupBundle(await file.text());
      if (!window.confirm("Replace the planned shows and storylines saved in this browser?")) return;
      savePlannedShows(window.localStorage, bundle.shows);
      saveTrackerStorylines(window.localStorage, bundle.storylines);
      setShows(bundle.shows);
      setStorylines(bundle.storylines);
      setSelectedId(bundle.storylines[0]?.id ?? "");
      setNotice(`Imported ${bundle.shows.length} shows and ${bundle.storylines.length} storylines.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The backup could not be imported.");
    }
  }

  return (
    <section className="storyline-hub">
      <header className="storyline-hub__toolbar">
        <div>
          <p className="eyebrow">STORYLINE UNIVERSE</p>
          <h2>Storyline Hub and Timeline</h2>
          <p>Connect every planned and reconciled segment into a permanent long-term creative record.</p>
        </div>
        <div className="storyline-hub__actions">
          <button className="primary-button" type="button" onClick={addStoryline}>Create Storyline</button>
          <button className="secondary-button" type="button" onClick={() => downloadBackup(shows, storylines)}>Export Full Backup</button>
          <button className="secondary-button" type="button" onClick={() => importRef.current?.click()}>Import Full Backup</button>
          <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.target.files?.item(0);
            if (file) void importBackup(file);
            event.currentTarget.value = "";
          }} />
        </div>
      </header>

      {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

      <div className="storyline-hub__layout">
        <aside className="storyline-list">
          <div className="storyline-list__filters">
            <input aria-label="Search storylines" placeholder="Search storylines" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select aria-label="Filter storyline status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option>All</option><option>Idea</option><option>Planned</option><option>Active</option><option>Paused</option><option>Completed</option><option>Abandoned</option>
            </select>
          </div>
          <div className="panel-heading"><span>Tracker Storylines</span><strong>{filtered.length}</strong></div>
          {filtered.length === 0 ? <div className="empty-state compact">No storylines match this view.</div> : filtered.map((storyline) => {
            const entries = buildStorylineTimeline(storyline, shows);
            const latest = entries.at(-1);
            return <button type="button" key={storyline.id} className={selected?.id === storyline.id ? "selected" : ""} onClick={() => setSelectedId(storyline.id)}>
              <strong>{storyline.name || "Untitled Storyline"}</strong>
              <span>{storyline.status} · {storyline.currentPhase || "Phase not set"}</span>
              <small>{entries.length} linked segment{entries.length === 1 ? "" : "s"}</small>
              <em>{latest ? `Latest: ${latest.segmentTitle}` : "No developments yet"}</em>
            </button>;
          })}
        </aside>

        {!selected ? <section className="storyline-empty"><h3>Create your first storyline</h3><p>Build a story bible, assign participants and milestones, and let the timeline collect connected show segments.</p><button className="primary-button" type="button" onClick={addStoryline}>Create Storyline</button></section> : (
          <div className="storyline-editor">
            <section className="storyline-card-panel">
              <header className="storyline-editor__header"><div><p className="eyebrow">STORYLINE DETAILS</p><h3>{selected.name || "Untitled Storyline"}</h3></div><div><button className="secondary-button" type="button" onClick={duplicateStoryline}>Duplicate</button><button className="danger-button" type="button" onClick={deleteStoryline}>Delete</button></div></header>
              <div className="storyline-form-grid">
                <label className="field field--wide"><span>Storyline name</span><input value={selected.name} onChange={(event) => updateSelected((item) => ({ ...item, name: event.target.value }))} /></label>
                <label className="field"><span>Status</span><select aria-label="Storyline status" value={selected.status} onChange={(event) => updateSelected((item) => ({ ...item, status: event.target.value as TrackerStoryline["status"] }))}><option>Idea</option><option>Planned</option><option>Active</option><option>Paused</option><option>Completed</option><option>Abandoned</option></select></label>
                <label className="field"><span>Current phase</span><input value={selected.currentPhase} onChange={(event) => updateSelected((item) => ({ ...item, currentPhase: event.target.value }))} /></label>
                <label className="field"><span>Start date</span><input type="date" value={selected.startDate} onChange={(event) => updateSelected((item) => ({ ...item, startDate: event.target.value }))} /></label>
                <label className="field"><span>Planned ending</span><input type="date" value={selected.plannedEndDate} onChange={(event) => updateSelected((item) => ({ ...item, plannedEndDate: event.target.value }))} /></label>
                <label className="field field--wide"><span>Linked championship</span><input value={selected.linkedChampionship} onChange={(event) => updateSelected((item) => ({ ...item, linkedChampionship: event.target.value }))} /></label>
              </div>
            </section>

            <section className="storyline-card-panel"><div className="section-title-row"><h3>Story Bible</h3><span>Permanent creative plan</span></div><div className="storyline-form-grid">
              <label className="field field--full"><span>Premise</span><textarea rows={4} value={selected.premise} onChange={(event) => updateSelected((item) => ({ ...item, premise: event.target.value }))} /></label>
              <label className="field field--wide"><span>Central conflict</span><textarea rows={4} value={selected.centralConflict} onChange={(event) => updateSelected((item) => ({ ...item, centralConflict: event.target.value }))} /></label>
              <label className="field field--wide"><span>Character motivations</span><textarea rows={4} value={selected.motivations} onChange={(event) => updateSelected((item) => ({ ...item, motivations: event.target.value }))} /></label>
              <label className="field field--wide"><span>Planned beginning</span><textarea rows={4} value={selected.plannedBeginning} onChange={(event) => updateSelected((item) => ({ ...item, plannedBeginning: event.target.value }))} /></label>
              <label className="field field--wide"><span>Planned climax</span><textarea rows={4} value={selected.plannedClimax} onChange={(event) => updateSelected((item) => ({ ...item, plannedClimax: event.target.value }))} /></label>
              <label className="field field--wide"><span>Planned ending</span><textarea rows={4} value={selected.plannedEnding} onChange={(event) => updateSelected((item) => ({ ...item, plannedEnding: event.target.value }))} /></label>
              <label className="field field--wide"><span>Aftermath</span><textarea rows={4} value={selected.aftermath} onChange={(event) => updateSelected((item) => ({ ...item, aftermath: event.target.value }))} /></label>
              <label className="field field--full"><span>Private booking notes</span><textarea rows={4} value={selected.privateNotes} onChange={(event) => updateSelected((item) => ({ ...item, privateNotes: event.target.value }))} /></label>
            </div></section>

            <section className="storyline-card-panel"><div className="section-title-row"><h3>Participants</h3><span>{selected.participants.length}</span></div><div className="reference-add-grid">
              <div className="reference-add-card"><label className="field"><span>Imported TEW worker</span><select value={importedParticipantId} disabled={!snapshot?.workers.length} onChange={(event) => setImportedParticipantId(event.target.value)}><option value="">{snapshot?.workers.length ? "Select a worker" : "No TEW workers loaded"}</option>{snapshot?.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label><button className="secondary-button compact-button" type="button" disabled={!importedParticipantId} onClick={() => { const worker = snapshot?.workers.find((item) => item.id === importedParticipantId); if (worker) addParticipant({ id: worker.id, name: worker.name, role: "Supporting participant", source: "tew" }); setImportedParticipantId(""); }}>Add Imported Worker</button></div>
              <div className="reference-add-card"><label className="field"><span>Manual participant name</span><input value={manualParticipant} onChange={(event) => setManualParticipant(event.target.value)} /></label><button className="secondary-button compact-button" type="button" disabled={!manualParticipant.trim()} onClick={() => { addParticipant({ id: createPlannerId(), name: manualParticipant.trim(), role: "Supporting participant", source: "manual" }); setManualParticipant(""); }}>Add Manual Participant</button></div>
            </div>{selected.participants.length ? <div className="storyline-participant-list">{selected.participants.map((participant) => <div className="storyline-participant-row" key={participant.id}><strong>{participant.name}</strong><small>{participant.source === "tew" ? "TEW" : "Manual"}</small><select aria-label={`Role for ${participant.name}`} value={participant.role} onChange={(event) => updateSelected((item) => ({ ...item, participants: item.participants.map((person) => person.id === participant.id ? { ...person, role: event.target.value } : person) }))}>{participantRoles.map((role) => <option key={role}>{role}</option>)}</select><button className="danger-button compact-button" type="button" onClick={() => updateSelected((item) => ({ ...item, participants: item.participants.filter((person) => person.id !== participant.id) }))}>Remove</button></div>)}</div> : <p className="narrative-empty-line">No participants assigned.</p>}</section>

            <section className="storyline-card-panel"><div className="section-title-row"><h3>Linked storyline references</h3><span>{selected.referenceLinks.length}</span></div><p className="storyline-help">Attach TEW or manual storyline references already used on planned segments. Matching segments enter the timeline automatically.</p><div className="reference-add-grid">
              <div className="reference-add-card"><label className="field"><span>Reference used on planned shows</span><select value={referenceKey} onChange={(event) => setReferenceKey(event.target.value)}><option value="">Select a reference</option>{references.map((reference) => <option key={reference.key} value={reference.key}>{reference.name} ({reference.source}, {reference.usageCount})</option>)}</select></label><button className="secondary-button compact-button" type="button" disabled={!referenceKey} onClick={() => { const reference = references.find((item) => item.key === referenceKey); if (reference) addReference({ id: createPlannerId(), source: reference.source, referenceId: reference.referenceId, name: reference.name }); setReferenceKey(""); }}>Attach Reference</button></div>
              <div className="reference-add-card"><label className="field"><span>Imported TEW storyline</span><select value={tewReferenceId} disabled={!snapshot?.storylines.length} onChange={(event) => setTewReferenceId(event.target.value)}><option value="">{snapshot?.storylines.length ? "Select a TEW storyline" : "No TEW storylines loaded"}</option>{snapshot?.storylines.map((storyline) => <option key={`${storyline.sourceTable}-${storyline.id}`} value={storyline.id}>{storyline.name}</option>)}</select></label><button className="secondary-button compact-button" type="button" disabled={!tewReferenceId} onClick={() => { const reference = snapshot?.storylines.find((item) => item.id === tewReferenceId); if (reference) addReference({ id: createPlannerId(), source: "tew", referenceId: reference.id, name: reference.name }); setTewReferenceId(""); }}>Link TEW Storyline</button></div>
            </div>{selected.referenceLinks.length ? <div className="storyline-reference-list">{selected.referenceLinks.map((reference) => <span className="storyline-reference-chip" key={reference.id}><b>{reference.name}</b><small>{reference.source.toUpperCase()}</small><button type="button" aria-label={`Remove reference ${reference.name}`} onClick={() => updateSelected((item) => ({ ...item, referenceLinks: item.referenceLinks.filter((link) => link.id !== reference.id) }))}>×</button></span>)}</div> : <p className="narrative-empty-line">The tracker also matches segment references that use this storyline's exact name.</p>}</section>

            <section className="storyline-card-panel"><div className="section-title-row"><h3>Milestones and Payoff Plan</h3><button className="secondary-button compact-button" type="button" onClick={() => updateSelected((item) => ({ ...item, milestones: [...item.milestones, createStorylineMilestone(item.milestones.length + 1)] }))}>Add Milestone</button></div>{selected.milestones.length ? <div className="milestone-list">{selected.milestones.map((milestone) => <div className="milestone-row" key={milestone.id}><select aria-label={`Type for ${milestone.title}`} value={milestone.type} onChange={(event) => updateSelected((item) => ({ ...item, milestones: item.milestones.map((value) => value.id === milestone.id ? { ...value, type: event.target.value as StorylineMilestone["type"] } : value) }))}>{milestoneTypes.map((type) => <option key={type}>{type}</option>)}</select><input aria-label={`Milestone title ${milestone.id}`} value={milestone.title} onChange={(event) => updateSelected((item) => ({ ...item, milestones: item.milestones.map((value) => value.id === milestone.id ? { ...value, title: event.target.value } : value) }))} /><input aria-label={`Target date for ${milestone.title}`} type="date" value={milestone.targetDate} onChange={(event) => updateSelected((item) => ({ ...item, milestones: item.milestones.map((value) => value.id === milestone.id ? { ...value, targetDate: event.target.value } : value) }))} /><select aria-label={`Status for ${milestone.title}`} value={milestone.status} onChange={(event) => updateSelected((item) => ({ ...item, milestones: item.milestones.map((value) => value.id === milestone.id ? { ...value, status: event.target.value as StorylineMilestone["status"] } : value) }))}><option>Unassigned</option><option>Assigned</option><option>Completed</option><option>Delayed</option><option>Cancelled</option></select><select aria-label={`Assigned show for ${milestone.title}`} value={milestone.assignedShowId} onChange={(event) => updateSelected((item) => ({ ...item, milestones: item.milestones.map((value) => value.id === milestone.id ? { ...value, assignedShowId: event.target.value, status: event.target.value && value.status === "Unassigned" ? "Assigned" : value.status } : value) }))}><option value="">No show assigned</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.date} · {show.name}</option>)}</select><textarea aria-label={`Notes for ${milestone.title}`} rows={2} value={milestone.notes} onChange={(event) => updateSelected((item) => ({ ...item, milestones: item.milestones.map((value) => value.id === milestone.id ? { ...value, notes: event.target.value } : value) }))} /><button className="danger-button compact-button" type="button" onClick={() => updateSelected((item) => ({ ...item, milestones: item.milestones.filter((value) => value.id !== milestone.id) }))}>Remove</button></div>)}</div> : <p className="narrative-empty-line">No milestones planned yet.</p>}</section>

            <section className="storyline-card-panel"><div className="section-title-row"><h3>Continuity Health</h3><span>{warnings.length} warning{warnings.length === 1 ? "" : "s"}</span></div>{warnings.length ? <div className="continuity-warning-list">{warnings.map((warning) => <div key={warning.id}><b>{warning.category}</b><span>{warning.message}</span></div>)}</div> : <div className="continuity-clear">No continuity warnings were found.</div>}</section>

            <section className="storyline-card-panel"><div className="section-title-row"><h3>Chronological Story Timeline</h3><span>{timeline.length} chapter{timeline.length === 1 ? "" : "s"}</span></div>{timeline.length ? <div className="storyline-timeline">{timeline.map((entry, index) => <article className="timeline-entry" key={entry.id}><div className="timeline-marker">{index + 1}</div><div className="timeline-entry__content"><header><div><span>{formatDate(entry.showDate)} · {entry.showName}</span><h4>{entry.segmentTitle}</h4><small>{entry.segmentType === "match" ? "Match" : "Angle"} · {entry.section} · {entry.workflowStatus}</small></div>{entry.rating !== null && <strong className="timeline-rating">{entry.rating}</strong>}</header>{entry.plannedNarrative && <div><b>Planned</b><p>{entry.plannedNarrative}</p></div>}{entry.finalNarrative && entry.finalNarrative !== entry.plannedNarrative && <div><b>Final</b><p>{entry.finalNarrative}</p></div>}{entry.actualSummary && <div><b>TEW result</b><p>{entry.actualSummary}</p></div>}{entry.consequences && <div><b>Consequences</b><p>{entry.consequences}</p></div>}{entry.followUp && <div><b>Follow-up</b><p>{entry.followUp}</p></div>}<button className="secondary-button compact-button" type="button" onClick={() => onOpenShow(entry.showId, entry.segmentId)}>Open Related Show and Segment</button></div></article>)}</div> : <div className="empty-state">No planned or reconciled segments are linked yet. Use the storyline's exact name on a segment or attach an existing reference above.</div>}</section>
          </div>
        )}
      </div>
    </section>
  );
}
