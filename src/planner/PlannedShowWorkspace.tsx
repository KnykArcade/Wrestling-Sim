import { useEffect, useMemo, useRef, useState } from "react";
import type { TewSnapshot } from "../tew/types";
import {
  createPlannedSegment,
  createPlannedShow,
  duplicatePlannedShow,
  movePlannedSegment,
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

function downloadBackup(shows: PlannedShow[]): void {
  const backup = createPlannerBackup(shows);
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

function SegmentEditor({
  segment,
  index,
  count,
  snapshot,
  onChange,
  onMove,
  onDelete,
}: {
  segment: PlannedSegment;
  index: number;
  count: number;
  snapshot: TewSnapshot | null;
  onChange: (segment: PlannedSegment) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <article className={`planned-segment planned-segment--${segment.type}`} data-segment-type={segment.type}>
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
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move segment up">
            Move Up
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move segment down">
            Move Down
          </button>
          <button className="danger-button" type="button" onClick={onDelete}>
            Remove
          </button>
        </div>
      </header>

      <div className="segment-form-grid">
        <label className="field field--wide">
          <span>Segment name</span>
          <input
            value={segment.title}
            onChange={(event) => onChange({ ...segment, title: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Placement</span>
          <select
            value={segment.section}
            onChange={(event) =>
              onChange({
                ...segment,
                section: event.target.value as PlannedSegment["section"],
              })
            }
          >
            <option>Pre-Show</option>
            <option>Main Show</option>
            <option>Post-Show</option>
          </select>
        </label>
        <label className="field">
          <span>Length (minutes)</span>
          <input
            type="number"
            min={1}
            max={180}
            value={segment.durationMinutes}
            onChange={(event) =>
              onChange({
                ...segment,
                durationMinutes: Math.max(1, Number(event.target.value) || 1),
              })
            }
          />
        </label>
        <label className="field field--full">
          <span>Quick planning outline</span>
          <textarea
            rows={3}
            placeholder="A short overview for the running order. Use Narrative Details below for the complete story."
            value={segment.notes}
            onChange={(event) => onChange({ ...segment, notes: event.target.value })}
          />
        </label>
      </div>

      <NarrativeEditor
        segment={segment}
        availableWorkers={snapshot?.workers ?? []}
        availableStorylines={snapshot?.storylines ?? []}
        onChange={onChange}
      />
    </article>
  );
}

export default function PlannedShowWorkspace({
  snapshot,
  snapshotLoading = false,
  snapshotError = "",
  onSnapshotFile,
  onCloseSnapshot,
}: {
  snapshot: TewSnapshot | null;
  snapshotLoading?: boolean;
  snapshotError?: string;
  onSnapshotFile: (file: File) => void;
  onCloseSnapshot: () => void;
}) {
  const [shows, setShows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [selectedId, setSelectedId] = useState<string>("");
  const [saveState, setSaveState] = useState<SaveState>("Saved");
  const [notice, setNotice] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("plan");
  const importRef = useRef<HTMLInputElement | null>(null);
  const snapshotRef = useRef<HTMLInputElement | null>(null);

  const selectedShow = useMemo(
    () => shows.find((show) => show.id === selectedId) ?? shows[0] ?? null,
    [selectedId, shows],
  );

  useEffect(() => {
    if (!selectedId && shows[0]) {
      setSelectedId(shows[0].id);
    }
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
    if (selectedShow?.status === "Reconciled") {
      setEditorMode("reconcile");
    }
  }, [selectedShow?.id, selectedShow?.status]);

  function updateShow(showId: string, updater: (show: PlannedShow) => PlannedShow): void {
    setShows((current) =>
      current.map((show) => (show.id === showId ? touchShow(updater(show)) : show)),
    );
  }

  function addShow(): void {
    const show = createPlannedShow(shows.length + 1);
    setShows((current) => [show, ...current]);
    setSelectedId(show.id);
    setEditorMode("plan");
    setNotice("New planned show created.");
  }

  function duplicateShow(): void {
    if (!selectedShow) {
      return;
    }
    const duplicate = duplicatePlannedShow(selectedShow);
    setShows((current) => [duplicate, ...current]);
    setSelectedId(duplicate.id);
    setEditorMode("plan");
    setNotice("Show duplicated with a clean reconciliation record.");
  }

  function deleteShow(): void {
    if (!selectedShow || !window.confirm(`Delete ${selectedShow.name}? This cannot be undone.`)) {
      return;
    }
    const remaining = shows.filter((show) => show.id !== selectedShow.id);
    setShows(remaining);
    setSelectedId(remaining[0]?.id ?? "");
    setNotice("Planned show deleted.");
  }

  function addSegment(type: PlannedSegment["type"]): void {
    if (!selectedShow) {
      return;
    }
    updateShow(selectedShow.id, (show) => ({
      ...show,
      segments: [...show.segments, createPlannedSegment(type)],
    }));
  }

  async function importBackup(file: File): Promise<void> {
    try {
      const imported = parsePlannerBackup(await file.text());
      if (shows.length > 0 && !window.confirm("Replace the planned shows saved in this browser?")) {
        return;
      }
      setShows(imported);
      setSelectedId(imported[0]?.id ?? "");
      setEditorMode(imported[0]?.status === "Reconciled" ? "reconcile" : "plan");
      setNotice(`Imported ${imported.length} planned show${imported.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The backup could not be imported.");
    }
  }

  const completeNarratives = selectedShow?.segments.filter(narrativeIsComplete).length ?? 0;

  return (
    <section className="planner-workspace">
      <header className="planner-toolbar">
        <div>
          <p className="eyebrow">PLANNED SHOW WORKSPACE</p>
          <h2>Plan the show, run it in TEW, then preserve what actually happened</h2>
          <p>Every card now supports full narrative writing and post-show planned-versus-actual reconciliation.</p>
        </div>
        <div className="planner-toolbar__actions">
          <span className={`save-state save-state--${saveState.toLowerCase().replace(" ", "-")}`}>
            {saveState}
          </span>
          <button className="primary-button" type="button" onClick={addShow}>
            Create Show
          </button>
          <button className="secondary-button" type="button" onClick={() => downloadBackup(shows)} disabled={shows.length === 0}>
            Export Backup
          </button>
          <button className="secondary-button" type="button" onClick={() => importRef.current?.click()}>
            Import Backup
          </button>
          <input
            ref={importRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.item(0);
              if (file) {
                void importBackup(file);
              }
              event.currentTarget.value = "";
            }}
          />
        </div>
      </header>

      <section className={`planner-snapshot-bar ${snapshot ? "is-loaded" : ""}`}>
        <div>
          <strong>{snapshot ? `TEW reference loaded: ${snapshot.fileName}` : "TEW reference and results snapshot"}</strong>
          <span>
            {snapshot
              ? `${snapshot.workers.length} workers, ${snapshot.storylines.length} storylines, and ${snapshot.shows.length} completed shows are available.`
              : "Import a current MDB while planning, then replace it with the post-show MDB when the show is complete."}
          </span>
          {snapshotLoading && <small>Reading TEW snapshot…</small>}
          {snapshotError && <small className="snapshot-error">{snapshotError}</small>}
        </div>
        <div>
          <button className="secondary-button" type="button" onClick={() => snapshotRef.current?.click()} disabled={snapshotLoading}>
            {snapshot ? "Replace TEW Snapshot" : "Import TEW Snapshot"}
          </button>
          {snapshot && (
            <button className="secondary-button" type="button" onClick={onCloseSnapshot}>
              Close Snapshot
            </button>
          )}
          <input
            ref={snapshotRef}
            className="visually-hidden"
            type="file"
            accept=".mdb,.accdb,application/x-msaccess"
            onChange={(event) => {
              const file = event.target.files?.item(0);
              if (file) {
                onSnapshotFile(file);
              }
              event.currentTarget.value = "";
            }}
          />
        </div>
      </section>

      {notice && (
        <div className="status-banner planner-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")}>Dismiss</button>
        </div>
      )}

      <div className="planner-layout">
        <aside className="planned-show-list">
          <div className="panel-heading">
            <span>Planned Shows</span>
            <strong>{shows.length}</strong>
          </div>
          {shows.length === 0 ? (
            <div className="empty-state compact">No shows have been planned yet.</div>
          ) : (
            shows.map((show) => (
              <button
                type="button"
                className={selectedShow?.id === show.id ? "selected" : ""}
                key={show.id}
                onClick={() => {
                  setSelectedId(show.id);
                  setEditorMode(show.status === "Reconciled" ? "reconcile" : "plan");
                }}
              >
                <strong>{show.name || "Untitled Show"}</strong>
                <span>{show.date || "Date not set"}</span>
                <small>{show.segments.length} segment{show.segments.length === 1 ? "" : "s"} · {show.status}</small>
                {show.reconciliation && <em>Linked: {show.reconciliation.actualShow.name}</em>}
              </button>
            ))
          )}
        </aside>

        {!selectedShow ? (
          <section className="planner-empty-card">
            <h3>Create your first show</h3>
            <p>The card and its complete narrative can be written here before you create anything inside TEW.</p>
            <button className="primary-button" type="button" onClick={addShow}>Create Show</button>
          </section>
        ) : (
          <div className="planner-editor">
            <nav className="show-workflow-tabs" aria-label="Selected show workflow">
              <button type="button" className={editorMode === "plan" ? "active" : ""} onClick={() => setEditorMode("plan")}>
                Plan Card
              </button>
              <button type="button" className={editorMode === "reconcile" ? "active" : ""} onClick={() => setEditorMode("reconcile")}>
                {selectedShow.status === "Reconciled" ? "Enhanced History" : "Reconcile Results"}
              </button>
            </nav>

            {editorMode === "reconcile" ? (
              <ReconciliationWorkspace
                show={selectedShow}
                allShows={shows}
                snapshot={snapshot}
                onChange={(updated) => updateShow(selectedShow.id, () => updated)}
              />
            ) : (
              <>
                <section className="planned-show-details">
                  <header className="planned-show-details__header">
                    <div>
                      <p className="eyebrow">SHOW DETAILS</p>
                      <h3>{selectedShow.name || "Untitled Show"}</h3>
                    </div>
                    <div className="show-record-actions">
                      <button className="secondary-button" type="button" onClick={duplicateShow}>Duplicate</button>
                      <button className="danger-button" type="button" onClick={deleteShow}>Delete Show</button>
                    </div>
                  </header>

                  <div className="show-form-grid">
                    <label className="field field--wide">
                      <span>Show name</span>
                      <input
                        value={selectedShow.name}
                        onChange={(event) => updateShow(selectedShow.id, (show) => ({ ...show, name: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Date</span>
                      <input
                        type="date"
                        value={selectedShow.date}
                        onChange={(event) => updateShow(selectedShow.id, (show) => ({ ...show, date: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Status</span>
                      <select
                        value={selectedShow.status}
                        onChange={(event) => updateShow(selectedShow.id, (show) => ({
                          ...show,
                          status: event.target.value as PlannedShow["status"],
                        }))}
                      >
                        <option>Draft</option>
                        <option>Ready</option>
                        <option>Completed</option>
                        <option>Reconciled</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Company</span>
                      <input
                        value={selectedShow.company}
                        onChange={(event) => updateShow(selectedShow.id, (show) => ({ ...show, company: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Show type</span>
                      <select
                        value={selectedShow.showType}
                        onChange={(event) => updateShow(selectedShow.id, (show) => ({ ...show, showType: event.target.value }))}
                      >
                        <option>Television</option>
                        <option>Event</option>
                        <option>Tour Show</option>
                        <option>House Show</option>
                        <option>Other</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Expected length</span>
                      <input
                        type="number"
                        min={15}
                        max={600}
                        value={selectedShow.expectedMinutes}
                        onChange={(event) => updateShow(selectedShow.id, (show) => ({
                          ...show,
                          expectedMinutes: Math.max(15, Number(event.target.value) || 15),
                        }))}
                      />
                    </label>
                    <label className="field field--wide">
                      <span>Venue / location</span>
                      <input
                        value={selectedShow.venue}
                        onChange={(event) => updateShow(selectedShow.id, (show) => ({ ...show, venue: event.target.value }))}
                      />
                    </label>
                    <label className="field field--full">
                      <span>Show notes</span>
                      <textarea
                        rows={3}
                        value={selectedShow.notes}
                        onChange={(event) => updateShow(selectedShow.id, (show) => ({ ...show, notes: event.target.value }))}
                      />
                    </label>
                  </div>
                </section>

                <section className="planned-card-editor">
                  <header className="card-editor-header">
                    <div>
                      <p className="eyebrow">CARD ORDER</p>
                      <h3>{selectedShow.segments.length} planned segment{selectedShow.segments.length === 1 ? "" : "s"}</h3>
                      <p>
                        {totalPlannedMinutes(selectedShow)} of {selectedShow.expectedMinutes} expected minutes planned · {completeNarratives} narratives complete
                      </p>
                    </div>
                    <div className="card-editor-actions">
                      <button className="primary-button" type="button" onClick={() => addSegment("match")}>Add Match</button>
                      <button className="secondary-button" type="button" onClick={() => addSegment("angle")}>Add Angle</button>
                    </div>
                  </header>

                  {selectedShow.segments.length === 0 ? (
                    <div className="empty-state card-empty">
                      Add a match or angle to begin building the show in running order.
                    </div>
                  ) : (
                    <div className="planned-segment-list">
                      {selectedShow.segments.map((segment, index) => (
                        <SegmentEditor
                          key={segment.id}
                          segment={segment}
                          index={index}
                          count={selectedShow.segments.length}
                          snapshot={snapshot}
                          onChange={(updated) => updateShow(selectedShow.id, (show) => ({
                            ...show,
                            segments: show.segments.map((item) => item.id === updated.id ? updated : item),
                          }))}
                          onMove={(direction) => updateShow(selectedShow.id, (show) => ({
                            ...show,
                            segments: movePlannedSegment(show.segments, segment.id, direction),
                          }))}
                          onDelete={() => updateShow(selectedShow.id, (show) => ({
                            ...show,
                            segments: show.segments.filter((item) => item.id !== segment.id),
                          }))}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
