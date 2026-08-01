import { useEffect, useMemo, useState } from "react";
import { loadPlannedShows } from "../planner/storage";
import type { PlannedShow } from "../planner/types";
import type { TewSnapshot } from "../tew/types";
import {
  HANDOFF_FIELDS,
  buildHandoffWarnings,
  buildSegmentEntryText,
  buildShowHandoffMarkdown,
  buildShowHandoffText,
  collectMappingTargets,
  createEmptyChecklist,
  createShowHandoffRecord,
  finalizeHandoffVersion,
  findMapping,
  handoffProgress,
  participantNames,
  synchronizeSegmentProgress,
  upsertMapping,
} from "./model";
import { loadHandoffUniverse, saveHandoffUniverse } from "./storage";
import type {
  HandoffChecklist,
  HandoffFieldKey,
  HandoffMappingKind,
  HandoffSegmentSnapshot,
  HandoffUniverse,
  HandoffVersion,
  ShowHandoffRecord,
} from "./types";

type HandoffView = "package" | "entry" | "mappings" | "versions";

const checklistLabels: Array<[keyof HandoffChecklist, string]> = [
  ["showCreated", "Show created in TEW"],
  ["eventSettingsEntered", "Event settings entered"],
  ["matchesEntered", "Matches entered"],
  ["anglesEntered", "Angles entered"],
  ["workersAssigned", "Workers and roles assigned"],
  ["winnersAndFinishesEntered", "Winners and finishes entered"],
  ["championshipsAssigned", "Championships assigned"],
  ["storylinesAssigned", "Storylines assigned"],
  ["durationsChecked", "Durations checked"],
  ["runningOrderConfirmed", "Running order confirmed"],
  ["finalCardReviewed", "Final card reviewed"],
];

function safeName(value: string): string {
  return value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "tew-show";
}

function download(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function dateLabel(value: string): string {
  if (!value) return "Date not set";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function fieldValue(segment: HandoffSegmentSnapshot, field: HandoffFieldKey, mappings: HandoffUniverse["mappings"]): string {
  if (field === "title") return segment.title;
  if (field === "participants") return participantNames(segment, mappings);
  if (field === "duration") return `${segment.durationMinutes}`;
  if (field === "winner") return segment.type === "match" ? segment.plannedWinner : "Not applicable";
  if (field === "finish") return segment.type === "match" ? segment.plannedFinish : "Not applicable";
  if (field === "championship") {
    if (!segment.championship) return "None";
    return findMapping(mappings, "Championship", segment.championshipId || segment.championship, segment.championship)?.tewName || segment.championship;
  }
  if (field === "narrative") return segment.type === "match" ? segment.matchStory : segment.segmentOutput;
  if (field === "storylines") return segment.storylines.map((storyline) => findMapping(mappings, "Storyline", storyline.id, storyline.name)?.tewName || storyline.name).join(", ");
  return [segment.privateNotes, segment.keyMoments, segment.interference, segment.postMatch].filter(Boolean).join("\n\n");
}

function fieldLabel(field: HandoffFieldKey): string {
  const labels: Record<HandoffFieldKey, string> = {
    title: "Title",
    participants: "Participants",
    duration: "Duration",
    winner: "Winner",
    finish: "Finish",
    championship: "Championship",
    narrative: "Narrative",
    storylines: "Storylines",
    agentNotes: "Road-agent notes",
  };
  return labels[field];
}

export default function HandoffWorkspace({ snapshot }: { snapshot: TewSnapshot | null }) {
  const [shows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [universe, setUniverse] = useState<HandoffUniverse>(() => loadHandoffUniverse(window.localStorage));
  const [selectedShowId, setSelectedShowId] = useState(shows[0]?.id ?? "");
  const [view, setView] = useState<HandoffView>("package");
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => saveHandoffUniverse(window.localStorage, universe), [universe]);

  const selectedShow = shows.find((show) => show.id === selectedShowId) ?? shows[0] ?? null;
  const record = selectedShow ? universe.records.find((item) => item.showId === selectedShow.id) ?? null : null;
  const activeVersion = record
    ? record.versions.find((version) => version.id === record.activeVersionId) ?? record.versions.at(-1) ?? null
    : null;
  const warnings = useMemo(() => buildHandoffWarnings(activeVersion, snapshot, universe.mappings), [activeVersion, snapshot, universe.mappings]);
  const targets = useMemo(() => collectMappingTargets(activeVersion), [activeVersion]);
  const progress = record ? handoffProgress(record, activeVersion) : { completed: 0, total: activeVersion?.segments.length ?? 0 };
  const currentSegment = activeVersion?.segments[segmentIndex] ?? null;
  const currentProgress = currentSegment ? record?.segmentProgress.find((item) => item.segmentId === currentSegment.id) ?? null : null;

  useEffect(() => {
    setSegmentIndex(0);
  }, [selectedShowId, activeVersion?.id]);

  function updateRecord(updater: (current: ShowHandoffRecord) => ShowHandoffRecord): void {
    if (!selectedShow) return;
    setUniverse((current) => {
      const existing = current.records.find((item) => item.showId === selectedShow.id) ?? createShowHandoffRecord(selectedShow.id);
      const updated = { ...updater(existing), updatedAt: new Date().toISOString() };
      return {
        ...current,
        records: current.records.some((item) => item.showId === selectedShow.id)
          ? current.records.map((item) => item.showId === selectedShow.id ? updated : item)
          : [...current.records, updated],
      };
    });
  }

  function finalizeCard(): void {
    if (!selectedShow) return;
    const existing = record ?? createShowHandoffRecord(selectedShow.id);
    const previous = existing.versions.at(-1) ?? null;
    const version = finalizeHandoffVersion(selectedShow, previous);
    updateRecord((current) => ({
      ...current,
      status: "Finalized for TEW",
      activeVersionId: version.id,
      versions: [...current.versions, version],
      checklist: createEmptyChecklist(),
      segmentProgress: synchronizeSegmentProgress(version, []),
      startedAt: "",
      enteredAt: "",
    }));
    setView("package");
    setNotice(`Version ${version.versionNumber} finalized. The package is frozen until you intentionally create another version.`);
  }

  function beginEntry(): void {
    if (!activeVersion) return;
    updateRecord((current) => ({ ...current, status: "Entering in TEW", startedAt: current.startedAt || new Date().toISOString() }));
    setView("entry");
    setNotice("TEW entry session started.");
  }

  function markEntered(): void {
    updateRecord((current) => ({ ...current, status: "Entered in TEW", enteredAt: new Date().toISOString() }));
    setNotice("The finalized card is marked as entered in TEW.");
  }

  function updateChecklist(key: keyof HandoffChecklist, checked: boolean): void {
    updateRecord((current) => ({ ...current, checklist: { ...current.checklist, [key]: checked } }));
  }

  function markField(segmentId: string, field: HandoffFieldKey, value = true): void {
    updateRecord((current) => ({
      ...current,
      segmentProgress: current.segmentProgress.map((item) => item.segmentId === segmentId
        ? { ...item, fields: { ...item.fields, [field]: value }, updatedAt: new Date().toISOString() }
        : item),
    }));
  }

  function markSegmentComplete(segmentId: string, completed: boolean): void {
    updateRecord((current) => ({
      ...current,
      segmentProgress: current.segmentProgress.map((item) => item.segmentId === segmentId
        ? {
            ...item,
            completed,
            fields: completed ? Object.fromEntries(HANDOFF_FIELDS.map((field) => [field, true])) as Record<HandoffFieldKey, boolean> : item.fields,
            updatedAt: new Date().toISOString(),
          }
        : item),
    }));
  }

  async function copyField(field: HandoffFieldKey): Promise<void> {
    if (!currentSegment) return;
    const value = fieldValue(currentSegment, field, universe.mappings);
    const copied = await copyText(value);
    if (copied) markField(currentSegment.id, field);
    setNotice(copied ? `${fieldLabel(field)} copied and marked entered.` : "Clipboard copy failed.");
  }

  async function copyCompleteSegment(): Promise<void> {
    if (!currentSegment) return;
    const copied = await copyText(buildSegmentEntryText(currentSegment, universe.mappings));
    if (copied) markSegmentComplete(currentSegment.id, true);
    setNotice(copied ? `${currentSegment.title} copied and marked entered.` : "Clipboard copy failed.");
  }

  function saveMapping(kind: HandoffMappingKind, trackerId: string, trackerName: string, tewId: string, tewName: string): void {
    setUniverse((current) => ({
      ...current,
      mappings: upsertMapping(current.mappings, { kind, trackerId, trackerName, tewId, tewName }),
    }));
  }

  function exportPackage(format: "json" | "text" | "markdown"): void {
    if (!activeVersion) return;
    const base = `${safeName(activeVersion.show.name)}-tew-handoff-v${activeVersion.versionNumber}`;
    if (format === "json") {
      download(`${base}.json`, JSON.stringify({ product: "TEW IX Story Tracker Handoff", exportedAt: new Date().toISOString(), version: activeVersion, mappings: universe.mappings }, null, 2), "application/json");
    } else if (format === "markdown") {
      download(`${base}.md`, buildShowHandoffMarkdown(activeVersion, universe.mappings), "text/markdown");
    } else {
      download(`${base}.txt`, buildShowHandoffText(activeVersion, universe.mappings), "text/plain");
    }
    setNotice(`${format.toUpperCase()} handoff package exported.`);
  }

  const checklistComplete = record ? checklistLabels.filter(([key]) => record.checklist[key]).length : 0;

  return <section className="handoff-workspace">
    <header className="handoff-toolbar">
      <div>
        <p className="eyebrow">TEW SHOW HANDOFF</p>
        <h2>Finalize the card here, then enter it into TEW without losing the creative plan</h2>
        <p>Create a frozen package, resolve TEW mappings, and work through every segment with a saved entry checklist.</p>
      </div>
      <div className="handoff-toolbar__actions">
        <button className="primary-button" type="button" onClick={finalizeCard} disabled={!selectedShow || selectedShow.segments.length === 0}>{activeVersion ? "Finalize New Version" : "Finalize for TEW"}</button>
        <button className="secondary-button" type="button" onClick={beginEntry} disabled={!activeVersion}>Begin TEW Entry</button>
        <button className="secondary-button" type="button" onClick={markEntered} disabled={!activeVersion}>Mark Entered</button>
      </div>
    </header>

    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <div className="handoff-layout">
      <aside className="handoff-show-list">
        <div className="panel-heading"><span>Planned Shows</span><strong>{shows.length}</strong></div>
        {shows.length === 0 ? <div className="empty-state compact">Create a planned show before building a TEW handoff package.</div> : shows.map((show) => {
          const showRecord = universe.records.find((item) => item.showId === show.id);
          return <button type="button" className={selectedShow?.id === show.id ? "selected" : ""} key={show.id} onClick={() => setSelectedShowId(show.id)}>
            <strong>{show.name}</strong>
            <span>{dateLabel(show.date)}</span>
            <small>{show.segments.length} segments · {showRecord?.status ?? "Not finalized"}</small>
            {showRecord?.versions.length ? <em>{showRecord.versions.length} handoff version{showRecord.versions.length === 1 ? "" : "s"}</em> : null}
          </button>;
        })}
      </aside>

      {!selectedShow ? <section className="handoff-empty empty-state"><h3>No planned show is available</h3></section> : <div className="handoff-main">
        <section className="handoff-summary">
          <div><span>Show</span><strong>{selectedShow.name}</strong></div>
          <div><span>Handoff status</span><strong>{record?.status ?? "Draft"}</strong></div>
          <div><span>Active version</span><strong>{activeVersion ? `Version ${activeVersion.versionNumber}` : "Not finalized"}</strong></div>
          <div><span>TEW progress</span><strong>{progress.completed}/{progress.total} segments</strong></div>
          <div><span>Checklist</span><strong>{checklistComplete}/{checklistLabels.length}</strong></div>
          <div><span>Warnings</span><strong>{warnings.length}</strong></div>
        </section>

        <nav className="handoff-tabs" aria-label="TEW handoff sections">
          <button type="button" className={view === "package" ? "active" : ""} onClick={() => setView("package")}>Finalized Package</button>
          <button type="button" className={view === "entry" ? "active" : ""} onClick={() => setView("entry")}>Entry Assistant</button>
          <button type="button" className={view === "mappings" ? "active" : ""} onClick={() => setView("mappings")}>TEW Mappings</button>
          <button type="button" className={view === "versions" ? "active" : ""} onClick={() => setView("versions")}>Versions</button>
        </nav>

        {view === "package" && <div className="handoff-package-view">
          {!activeVersion ? <section className="handoff-panel empty-state"><h3>Finalize the card to create Version 1</h3><p>The frozen package will preserve the running order and every creative field exactly as it exists now.</p><button className="primary-button" type="button" onClick={finalizeCard} disabled={selectedShow.segments.length === 0}>Finalize for TEW</button></section> : <>
            <section className="handoff-panel handoff-package-header">
              <div><p className="eyebrow">FROZEN HANDOFF PACKAGE</p><h3>{activeVersion.show.name} · Version {activeVersion.versionNumber}</h3><p>{dateLabel(activeVersion.show.date)} · {activeVersion.show.company || "Company not set"} · {activeVersion.segments.length} segments</p></div>
              <div className="handoff-export-actions">
                <button type="button" onClick={() => exportPackage("json")}>Export JSON</button>
                <button type="button" onClick={() => exportPackage("text")}>Export Text</button>
                <button type="button" onClick={() => exportPackage("markdown")}>Export Markdown</button>
                <button type="button" onClick={() => window.print()}>Print Booking Sheet</button>
                <button type="button" onClick={() => void copyText(buildShowHandoffText(activeVersion, universe.mappings)).then((copied) => setNotice(copied ? "Complete card copied." : "Clipboard copy failed."))}>Copy Complete Card</button>
              </div>
            </section>

            <section className="handoff-panel">
              <header><div><p className="eyebrow">PRE-FLIGHT VALIDATION</p><h3>Warnings before TEW entry</h3></div><strong>{warnings.length}</strong></header>
              {warnings.length === 0 ? <p className="empty-state compact">No handoff warnings were detected.</p> : <div className="handoff-warning-list">{warnings.map((warning) => <button type="button" key={warning.id} onClick={() => { if (warning.segmentId) { const index = activeVersion.segments.findIndex((segment) => segment.id === warning.segmentId); if (index >= 0) setSegmentIndex(index); setView("entry"); } else if (warning.category === "Mapping") setView("mappings"); }}><span>{warning.category}</span><strong>{warning.message}</strong></button>)}</div>}
            </section>

            <section className="handoff-panel">
              <header><div><p className="eyebrow">RUNNING ORDER</p><h3>Finalized card</h3></div><strong>{activeVersion.segments.reduce((sum, segment) => sum + segment.durationMinutes, 0)}/{activeVersion.show.expectedMinutes} minutes</strong></header>
              <div className="handoff-card-list">{activeVersion.segments.map((segment) => <article key={segment.id}><span>#{segment.order}</span><div><strong>{segment.title}</strong><small>{segment.type === "match" ? "Match" : "Angle"} · {segment.section} · {segment.durationMinutes} minutes</small><p>{segment.type === "match" ? segment.matchStory || "Match Story missing" : segment.segmentOutput || "Segment Output missing"}</p></div><button type="button" onClick={() => { setSegmentIndex(segment.order - 1); setView("entry"); }}>Enter in TEW</button></article>)}</div>
            </section>
          </>}
        </div>}

        {view === "entry" && <div className="handoff-entry-view">
          {!activeVersion || !currentSegment ? <section className="handoff-panel empty-state"><h3>Finalize a card before using the entry assistant</h3></section> : <>
            <section className="handoff-panel handoff-progress-panel">
              <div><p className="eyebrow">TEW ENTRY PROGRESS</p><h3>{progress.completed} of {progress.total} segments entered into TEW</h3></div>
              <progress max={Math.max(1, progress.total)} value={progress.completed}>{progress.completed}/{progress.total}</progress>
            </section>

            <section className="handoff-panel handoff-entry-card">
              <header>
                <div><p className="eyebrow">SEGMENT {currentSegment.order} OF {activeVersion.segments.length}</p><h3>{currentSegment.title}</h3><p>{currentSegment.type === "match" ? "Match" : "Angle"} · {currentSegment.section} · {currentSegment.durationMinutes} minutes</p></div>
                <div><button type="button" disabled={segmentIndex === 0} onClick={() => setSegmentIndex((value) => value - 1)}>Previous</button><button type="button" disabled={segmentIndex >= activeVersion.segments.length - 1} onClick={() => setSegmentIndex((value) => value + 1)}>Next</button></div>
              </header>
              <div className="handoff-segment-copy-grid">
                {HANDOFF_FIELDS.map((field) => {
                  const value = fieldValue(currentSegment, field, universe.mappings);
                  const entered = currentProgress?.fields[field] ?? false;
                  return <article className={entered ? "entered" : ""} key={field}>
                    <div><span>{fieldLabel(field)}</span><p>{value || "Not provided"}</p></div>
                    <button type="button" onClick={() => void copyField(field)} disabled={!value}>Copy</button>
                    <label><input type="checkbox" checked={entered} onChange={(event) => markField(currentSegment.id, field, event.target.checked)} /> Entered</label>
                  </article>;
                })}
              </div>
              <div className="handoff-complete-actions">
                <button className="primary-button" type="button" onClick={() => void copyCompleteSegment()}>Copy Complete TEW Entry</button>
                <label><input type="checkbox" checked={currentProgress?.completed ?? false} onChange={(event) => markSegmentComplete(currentSegment.id, event.target.checked)} /> Mark entire segment entered</label>
              </div>
              <details className="handoff-entry-preview"><summary>Complete TEW entry preview</summary><pre>{buildSegmentEntryText(currentSegment, universe.mappings)}</pre></details>
            </section>

            <section className="handoff-panel">
              <header><div><p className="eyebrow">SHOW-LEVEL CHECKLIST</p><h3>Final verification</h3></div><strong>{checklistComplete}/{checklistLabels.length}</strong></header>
              <div className="handoff-checklist">{checklistLabels.map(([key, label]) => <label key={key}><input type="checkbox" checked={record?.checklist[key] ?? false} onChange={(event) => updateChecklist(key, event.target.checked)} /><span>{label}</span></label>)}</div>
              <label className="field field--full"><span>Changes or notes made during TEW entry</span><textarea rows={5} value={record?.entryNotes ?? ""} onChange={(event) => updateRecord((current) => ({ ...current, entryNotes: event.target.value }))} /></label>
            </section>
          </>}
        </div>}

        {view === "mappings" && <section className="handoff-panel handoff-mapping-view">
          <header><div><p className="eyebrow">TEW RECORD MAPPINGS</p><h3>Connect tracker names to the current TEW database</h3><p>Mappings are reusable across future shows. Championship and company mappings remain manual because the current snapshot reader does not expose reliable title IDs.</p></div><strong>{targets.length}</strong></header>
          {!activeVersion ? <p className="empty-state compact">Finalize the show before mapping its records.</p> : <div className="handoff-mapping-list">{targets.map((target) => {
            const mapping = findMapping(universe.mappings, target.kind, target.trackerId, target.trackerName);
            const snapshotOptions = target.kind === "Worker" ? snapshot?.workers ?? [] : target.kind === "Storyline" ? snapshot?.storylines ?? [] : [];
            return <article key={`${target.kind}-${target.trackerId}`}>
              <div><span>{target.kind}</span><strong>{target.trackerName}</strong><small>{mapping?.tewName ? `Mapped to ${mapping.tewName}` : "Not mapped"}</small></div>
              {snapshotOptions.length > 0 ? <select aria-label={`${target.kind} mapping for ${target.trackerName}`} value={mapping?.tewId ?? ""} onChange={(event) => {
                const match = snapshotOptions.find((option) => option.id === event.target.value);
                saveMapping(target.kind, target.trackerId, target.trackerName, match?.id ?? "", match?.name ?? "");
              }}><option value="">Choose TEW record</option>{snapshotOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select> : <input aria-label={`${target.kind} mapping for ${target.trackerName}`} placeholder="Enter the exact TEW name" value={mapping?.tewName ?? ""} onChange={(event) => saveMapping(target.kind, target.trackerId, target.trackerName, "", event.target.value)} />}
            </article>;
          })}</div>}
        </section>}

        {view === "versions" && <section className="handoff-panel handoff-version-view">
          <header><div><p className="eyebrow">HANDOFF VERSION HISTORY</p><h3>Every finalized card remains frozen</h3></div><strong>{record?.versions.length ?? 0}</strong></header>
          {!record?.versions.length ? <p className="empty-state compact">No finalized versions exist for this show.</p> : <div className="handoff-version-list">{[...record.versions].reverse().map((version: HandoffVersion) => <article className={version.id === record.activeVersionId ? "active" : ""} key={version.id}><header><div><strong>Version {version.versionNumber}</strong><span>{new Date(version.createdAt).toLocaleString()}</span></div><button type="button" onClick={() => updateRecord((current) => ({ ...current, activeVersionId: version.id, segmentProgress: synchronizeSegmentProgress(version, current.segmentProgress) }))}>Use This Version</button></header><p>{version.segments.length} segments · source card updated {version.show.sourceUpdatedAt ? new Date(version.show.sourceUpdatedAt).toLocaleString() : "unknown"}</p><ul>{version.changesFromPrevious.map((change) => <li key={change}>{change}</li>)}</ul></article>)}</div>}
        </section>}
      </div>}
    </div>
  </section>;
}
