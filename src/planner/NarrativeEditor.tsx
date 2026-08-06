import { useMemo, useState } from "react";
import { loadChampionshipUniverse } from "../championships/storage";
import type { StorylineRecord, WorkerReference } from "../tew/types";
import { buildTewEntrySummary, createPlannerId } from "./model";
import type {
  AnglePerformanceRole,
  PlannedSegment,
  PlannedStorylineReference,
  PlannedWorkerReference,
} from "./types";

type CopyState = "" | "Copied" | "Copy failed";

async function copyText(text: string): Promise<boolean> {
  if (!text.trim()) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function dedupeWorkers(workers: WorkerReference[]): WorkerReference[] {
  const seen = new Set<string>();
  return workers.filter((worker) => {
    const key = `${worker.id}:${worker.name.toLowerCase()}`;
    if (!worker.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function WorkerEditor({ worker, isMatch, onChange, onDelete }: {
  worker: PlannedWorkerReference;
  isMatch: boolean;
  onChange: (worker: PlannedWorkerReference) => void;
  onDelete: () => void;
}) {
  const angleRoles: AnglePerformanceRole[] = ["Speaking", "Physical", "Reaction", "Presence"];
  return <div className="narrative-person-row">
    <div className="narrative-person-name"><strong>{worker.name}</strong><small>{worker.source === "tew" ? "Imported from TEW" : "Manual entry"}</small></div>
    <label className="field"><span>Role</span>{isMatch ? <input value={worker.role} placeholder="Competitor, manager…" onChange={(event) => onChange({ ...worker, role: event.target.value })} /> : <select aria-label={`${worker.name} angle performance role`} value={angleRoles.includes(worker.role as AnglePerformanceRole) ? worker.role : "Presence"} onChange={(event) => onChange({ ...worker, role: event.target.value })}>{angleRoles.map((role) => <option key={role}>{role}</option>)}</select>}</label>
    {isMatch && <label className="field"><span>Side / team</span><input value={worker.side} placeholder="Side 1, Team A…" onChange={(event) => onChange({ ...worker, side: event.target.value })} /></label>}
    <button className="danger-button compact-button" type="button" onClick={onDelete}>Remove</button>
  </div>;
}

export default function NarrativeEditor({ segment, availableWorkers, availableStorylines, onChange }: {
  segment: PlannedSegment;
  availableWorkers: WorkerReference[];
  availableStorylines: StorylineRecord[];
  onChange: (segment: PlannedSegment) => void;
}) {
  const [importedWorkerId, setImportedWorkerId] = useState("");
  const [manualWorkerName, setManualWorkerName] = useState("");
  const [importedStorylineId, setImportedStorylineId] = useState("");
  const [manualStorylineName, setManualStorylineName] = useState("");
  const [copyState, setCopyState] = useState<CopyState>("");
  const workers = useMemo(() => dedupeWorkers(availableWorkers), [availableWorkers]);
  const championships = useMemo(() => loadChampionshipUniverse(window.localStorage).championships, []);
  const winnerSuggestions = segment.workers.map((worker) => worker.name);

  function addImportedWorker(): void {
    const selected = workers.find((worker) => worker.id === importedWorkerId);
    if (!selected) return;
    if (segment.workers.some((worker) => worker.source === "tew" && worker.id === selected.id)) { setImportedWorkerId(""); return; }
    onChange({ ...segment, workers: [...segment.workers, { id: selected.id, name: selected.name, role: segment.type === "angle" ? "Presence" : "", side: "", source: "tew" }] });
    setImportedWorkerId("");
  }

  function addManualWorker(): void {
    const name = manualWorkerName.trim();
    if (!name) return;
    onChange({ ...segment, workers: [...segment.workers, { id: createPlannerId(), name, role: segment.type === "angle" ? "Presence" : "", side: "", source: "manual" }] });
    setManualWorkerName("");
  }

  function addImportedStoryline(): void {
    const selected = availableStorylines.find((storyline) => storyline.id === importedStorylineId);
    if (!selected) return;
    if (segment.storylines.some((storyline) => storyline.source === "tew" && storyline.id === selected.id)) { setImportedStorylineId(""); return; }
    onChange({ ...segment, storylines: [...segment.storylines, { id: selected.id, name: selected.name, source: "tew" }] });
    setImportedStorylineId("");
  }

  function addManualStoryline(): void {
    const name = manualStorylineName.trim();
    if (!name) return;
    onChange({ ...segment, storylines: [...segment.storylines, { id: createPlannerId(), name, source: "manual" }] });
    setManualStorylineName("");
  }

  async function handleCopy(value: string): Promise<void> {
    const copied = await copyText(value);
    setCopyState(copied ? "Copied" : "Copy failed");
    window.setTimeout(() => setCopyState(""), 1800);
  }

  function selectChampionship(championshipId: string): void {
    const championship = championships.find((item) => item.id === championshipId);
    if (!championship) { onChange({ ...segment, championshipId: "" }); return; }
    const champions = championship.currentChampions.map((competitor) => competitor.name).join(" & ");
    onChange({
      ...segment,
      championshipId: championship.id,
      championship: championship.name,
      championEntering: segment.championEntering || champions,
      championshipMatchPurpose: segment.championshipMatchPurpose || (championship.status === "Vacant" ? "Vacant Title" : "Defense"),
    });
  }

  const primaryNarrative = segment.type === "match" ? segment.matchStory : segment.segmentOutput;

  return <details className="narrative-editor" open>
    <summary><span>{segment.type === "match" ? "Match Story" : "Narrative Details"}</span><small>{segment.type === "match" ? "One complete saved story" : `${segment.workers.length} worker${segment.workers.length === 1 ? "" : "s"} · ${segment.storylines.length} storyline${segment.storylines.length === 1 ? "" : "s"}`}</small></summary>
    <div className="narrative-editor__body">
      {segment.type === "angle" && <section className="narrative-section">
        <header><div><h4>Workers and roles</h4><p>Use names from the imported TEW snapshot or enter a name manually.</p></div></header>
        <div className="reference-add-grid">
          <div className="reference-add-card">
            <label className="field"><span>Imported TEW worker</span><select value={importedWorkerId} disabled={workers.length === 0} onChange={(event) => setImportedWorkerId(event.target.value)}><option value="">{workers.length === 0 ? "No TEW workers loaded" : "Select a worker"}</option>{workers.map((worker) => <option key={`${worker.id}-${worker.name}`} value={worker.id}>{worker.name}</option>)}</select></label>
            <button className="secondary-button compact-button" type="button" disabled={!importedWorkerId} onClick={addImportedWorker}>Add Imported Worker</button>
          </div>
          <div className="reference-add-card">
            <label className="field"><span>Manual worker name</span><input value={manualWorkerName} placeholder="Enter any worker or non-worker" onChange={(event) => setManualWorkerName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addManualWorker(); } }} /></label>
            <button className="secondary-button compact-button" type="button" disabled={!manualWorkerName.trim()} onClick={addManualWorker}>Add Manual Worker</button>
          </div>
        </div>
        {segment.workers.length > 0 ? <div className="narrative-person-list">{segment.workers.map((worker) => <WorkerEditor key={worker.id} worker={worker} isMatch={segment.type === "match"} onChange={(updated) => onChange({ ...segment, workers: segment.workers.map((item) => item.id === updated.id ? updated : item) })} onDelete={() => onChange({ ...segment, workers: segment.workers.filter((item) => item.id !== worker.id) })} />)}</div> : <p className="narrative-empty-line">No workers have been assigned to this segment.</p>}
      </section>}

      {segment.type === "angle" && <section className="narrative-section">
        <header><div><h4>Related storylines</h4><p>Link one or more TEW storylines, or create a manual reference for planning.</p></div></header>
        <div className="reference-add-grid">
          <div className="reference-add-card">
            <label className="field"><span>Imported TEW storyline</span><select value={importedStorylineId} disabled={availableStorylines.length === 0} onChange={(event) => setImportedStorylineId(event.target.value)}><option value="">{availableStorylines.length === 0 ? "No TEW storylines loaded" : "Select a storyline"}</option>{availableStorylines.map((storyline) => <option key={`${storyline.sourceTable}-${storyline.id}`} value={storyline.id}>{storyline.name}</option>)}</select></label>
            <button className="secondary-button compact-button" type="button" disabled={!importedStorylineId} onClick={addImportedStoryline}>Link Storyline</button>
          </div>
          <div className="reference-add-card">
            <label className="field"><span>Manual storyline name</span><input value={manualStorylineName} placeholder="Enter a working storyline name" onChange={(event) => setManualStorylineName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addManualStoryline(); } }} /></label>
            <button className="secondary-button compact-button" type="button" disabled={!manualStorylineName.trim()} onClick={addManualStoryline}>Add Manual Storyline</button>
          </div>
        </div>
        {segment.storylines.length > 0 ? <div className="storyline-reference-list">{segment.storylines.map((storyline: PlannedStorylineReference) => <span className="storyline-reference-chip" key={`${storyline.source}-${storyline.id}`}><b>{storyline.name}</b><small>{storyline.source === "tew" ? "TEW" : "Manual"}</small><button type="button" aria-label={`Remove storyline ${storyline.name}`} onClick={() => onChange({ ...segment, storylines: segment.storylines.filter((item) => item.id !== storyline.id) })}>×</button></span>)}</div> : <p className="narrative-empty-line">No storyline is linked to this segment.</p>}
      </section>}

      {segment.type === "match" ? <section className="narrative-section narrative-section--primary match-story-only">
        <header><div><h4>Match Story</h4><p>Write everything you want saved for this match in this one box.</p></div><div className="copy-actions"><button className="secondary-button compact-button" type="button" disabled={!segment.matchStory.trim()} onClick={() => void handleCopy(segment.matchStory)}>Copy Match Story</button><button className="secondary-button compact-button" type="button" onClick={() => void handleCopy(buildTewEntrySummary(segment))}>Copy TEW Entry Summary</button>{copyState && <span className={`copy-state copy-state--${copyState === "Copied" ? "ok" : "error"}`}>{copyState}</span>}</div></header>
        <label className="field narrative-main-text"><span>Match Story</span><textarea aria-label="Match Story" rows={14} placeholder="Write the complete match story exactly as you want it saved." value={segment.matchStory} onChange={(event) => onChange({ ...segment, matchStory: event.target.value })} /></label>
        <details className="match-administration">
          <summary>Optional match result and championship settings</summary>
          <div className="narrative-form-grid">
          <label className="field"><span>Tracker championship</span><select aria-label="Tracker championship" value={segment.championshipId} onChange={(event) => selectChampionship(event.target.value)}><option value="">Manual / non-title match</option>{championships.map((championship) => <option key={championship.id} value={championship.id}>{championship.name}</option>)}</select></label>
          <label className="field"><span>Championship / legacy title name</span><input aria-label="Championship or legacy title name" placeholder="None or title name" value={segment.championship} onChange={(event) => onChange({ ...segment, championship: event.target.value })} /></label>
          <label className="field"><span>Title-match purpose</span><select aria-label="Title match purpose" value={segment.championshipMatchPurpose} onChange={(event) => onChange({ ...segment, championshipMatchPurpose: event.target.value as PlannedSegment["championshipMatchPurpose"] })}><option value="">Not specified</option><option>Defense</option><option>Vacant Title</option><option>Tournament Final</option><option>Unification</option><option>Other</option></select></label>
          <label className="field"><span>Champion entering</span><input aria-label="Champion entering" list={`winners-${segment.id}`} value={segment.championEntering} onChange={(event) => onChange({ ...segment, championEntering: event.target.value })} /></label>
          <label className="field"><span>Challenger</span><input aria-label="Championship challenger" list={`winners-${segment.id}`} value={segment.challenger} onChange={(event) => onChange({ ...segment, challenger: event.target.value })} /></label>
          <label className="field"><span>Expected title change</span><select aria-label="Expected title change" value={segment.expectedTitleChange === null ? "" : segment.expectedTitleChange ? "yes" : "no"} onChange={(event) => onChange({ ...segment, expectedTitleChange: event.target.value === "" ? null : event.target.value === "yes" })}><option value="">Undecided</option><option value="no">No — champion retains</option><option value="yes">Yes — new champion planned</option></select></label>
          <label className="field"><span>Planned winner</span><input list={`winners-${segment.id}`} value={segment.plannedWinner} onChange={(event) => onChange({ ...segment, plannedWinner: event.target.value })} /><datalist id={`winners-${segment.id}`}>{winnerSuggestions.map((name) => <option key={name} value={name} />)}</datalist></label>
          <label className="field"><span>Planned finish</span><input placeholder="Pinfall, submission, DQ…" value={segment.plannedFinish} onChange={(event) => onChange({ ...segment, plannedFinish: event.target.value })} /></label>
          </div>
        </details>
      </section> : <section className="narrative-section narrative-section--primary">
        <header><div><h4>Angle Segment Output</h4><p>Write the complete on-screen story that should remain in the permanent show record.</p></div><div className="copy-actions"><button className="secondary-button compact-button" type="button" disabled={!segment.segmentOutput.trim()} onClick={() => void handleCopy(segment.segmentOutput)}>Copy Segment Output</button><button className="secondary-button compact-button" type="button" onClick={() => void handleCopy(buildTewEntrySummary(segment))}>Copy TEW Entry Summary</button>{copyState && <span className={`copy-state copy-state--${copyState === "Copied" ? "ok" : "error"}`}>{copyState}</span>}</div></header>
        <div className="narrative-form-grid">
          <label className="field"><span>Location</span><select value={segment.angleLocation} onChange={(event) => onChange({ ...segment, angleLocation: event.target.value })}><option>In The Ring</option><option>Backstage</option><option>Entrance Area</option><option>Announce Desk</option><option>Office</option><option>Parking Area</option><option>On Location</option><option>Other</option></select></label>
          <label className="field"><span>Content type</span><select value={segment.angleContentType} onChange={(event) => onChange({ ...segment, angleContentType: event.target.value })}><option>Serious</option><option>Comedy</option><option>Entertainment</option><option>Character Development</option><option>Hype</option><option>Storyline Advancement</option><option>Other</option></select></label>
          <label className="field field--full narrative-main-text"><span>Full Segment Output</span><textarea rows={10} placeholder="Write exactly what happens in the segment, including dialogue, actions, interruptions, and the closing image." value={segment.segmentOutput} onChange={(event) => onChange({ ...segment, segmentOutput: event.target.value })} /></label>
          <label className="field field--full"><span>Intended audience takeaway</span><textarea rows={3} value={segment.audienceTakeaway} onChange={(event) => onChange({ ...segment, audienceTakeaway: event.target.value })} /></label>
        </div>
      </section>}

      {segment.type === "angle" && <section className="narrative-section">
        <header><div><h4>Story purpose and consequences</h4><p>Track why the segment exists and what must happen next.</p></div></header>
        <div className="narrative-form-grid">
          <label className="field field--wide"><span>Purpose</span><textarea rows={3} value={segment.purpose} onChange={(event) => onChange({ ...segment, purpose: event.target.value })} /></label>
          <label className="field field--wide"><span>Storyline consequences</span><textarea rows={3} value={segment.consequences} onChange={(event) => onChange({ ...segment, consequences: event.target.value })} /></label>
          <label className="field field--wide"><span>Planned follow-up</span><textarea rows={3} value={segment.followUp} onChange={(event) => onChange({ ...segment, followUp: event.target.value })} /></label>
          <label className="field field--wide"><span>Private booking notes</span><textarea rows={3} value={segment.privateNotes} onChange={(event) => onChange({ ...segment, privateNotes: event.target.value })} /></label>
        </div>
      </section>}

      {!primaryNarrative.trim() && <p className="narrative-reminder">{segment.type === "match" ? "Add the full match story before marking this show Ready." : "Add the Segment Output before marking this show Ready."}</p>}
    </div>
  </details>;
}
