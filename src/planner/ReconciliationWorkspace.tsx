import { useEffect, useMemo, useState } from "react";
import type { MatchRecord, ShowRecord, TewSnapshot } from "../tew/types";
import {
  finalizeReconciliation,
  linkPlannedShow,
  rankMatchCandidates,
  rankShowCandidates,
  reconciliationProgress,
  reopenReconciliation,
  setSegmentActualMatch,
  unlinkPlannedShow,
} from "./reconciliation";
import type { PlannedSegment, PlannedShow } from "./types";

function formatDate(value: string): string {
  if (!value) {
    return "Date unavailable";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US");
}

function displayNumber(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("en-US");
}

function workerText(segment: PlannedSegment): string {
  return segment.workers.map((worker) => worker.name).filter(Boolean).join(", ") || "No participants recorded";
}

function actualWorkerText(segment: PlannedSegment): string {
  return segment.reconciliation.actualMatch?.workers.join(", ") || "No participants available";
}

function matchLabel(match: MatchRecord): string {
  const rating = match.rating === null ? "unrated" : `${match.rating}`;
  return `${match.placement} · ${match.description} · ${rating}`;
}

function ShowComparison({ show }: { show: PlannedShow }) {
  const actual = show.reconciliation?.actualShow;
  if (!actual) {
    return null;
  }
  return (
    <section className="reconciliation-show-summary">
      <div>
        <p className="eyebrow">PLANNED SHOW</p>
        <h3>{show.name}</h3>
        <dl>
          <div><dt>Date</dt><dd>{formatDate(show.date)}</dd></div>
          <div><dt>Company</dt><dd>{show.company || "—"}</dd></div>
          <div><dt>Venue</dt><dd>{show.venue || "—"}</dd></div>
          <div><dt>Planned matches</dt><dd>{show.segments.filter((segment) => segment.type === "match").length}</dd></div>
        </dl>
      </div>
      <div>
        <p className="eyebrow">ACTUAL TEW SHOW</p>
        <h3>{actual.name}</h3>
        <dl>
          <div><dt>Date</dt><dd>{formatDate(actual.date)}</dd></div>
          <div><dt>Company</dt><dd>{actual.company || "—"}</dd></div>
          <div><dt>Venue</dt><dd>{actual.venue || "—"}</dd></div>
          <div><dt>Show rating</dt><dd>{displayNumber(actual.rating)}</dd></div>
          <div><dt>Attendance</dt><dd>{displayNumber(actual.attendance)}</dd></div>
          <div><dt>Source</dt><dd>{actual.sourceFile || "Saved snapshot"}</dd></div>
        </dl>
      </div>
    </section>
  );
}

function PlannedActualColumns({ segment }: { segment: PlannedSegment }) {
  const actual = segment.reconciliation.actualMatch;
  return (
    <div className="planned-actual-grid">
      <section>
        <p className="eyebrow">PLANNED</p>
        <h4>{segment.title}</h4>
        <dl>
          <div><dt>Participants</dt><dd>{workerText(segment)}</dd></div>
          <div><dt>Winner</dt><dd>{segment.plannedWinner || "Not set"}</dd></div>
          <div><dt>Finish</dt><dd>{segment.plannedFinish || "Not set"}</dd></div>
          <div><dt>Length</dt><dd>{segment.durationMinutes} minutes</dd></div>
          <div><dt>Placement</dt><dd>{segment.section}</dd></div>
        </dl>
        <div className="reconciliation-narrative">
          <strong>Original Match Story</strong>
          <p>{segment.matchStory || "No planned Match Story was entered."}</p>
        </div>
      </section>
      <section>
        <p className="eyebrow">ACTUAL</p>
        <h4>{actual?.description || "No TEW match linked"}</h4>
        <dl>
          <div><dt>Participants</dt><dd>{actualWorkerText(segment)}</dd></div>
          <div><dt>Recorded winner</dt><dd>{actual?.winner || "—"}</dd></div>
          <div><dt>Match time</dt><dd>{actual?.matchTime || "—"}</dd></div>
          <div><dt>Rating</dt><dd>{displayNumber(actual?.rating ?? null)}</dd></div>
          <div><dt>Placement</dt><dd>{actual?.placement || "—"}</dd></div>
        </dl>
        <div className="reconciliation-narrative">
          <strong>TEW Notes</strong>
          <p>{actual?.notes || "No TEW notes were stored for this match."}</p>
        </div>
      </section>
    </div>
  );
}

function FinalFields({
  segment,
  onChange,
}: {
  segment: PlannedSegment;
  onChange: (segment: PlannedSegment) => void;
}) {
  const reconciliation = segment.reconciliation;
  const plannedNarrative = segment.type === "match" ? segment.matchStory : segment.segmentOutput;
  return (
    <div className="final-fields-grid">
      <label className="field">
        <span>Happened as planned?</span>
        <select
          value={reconciliation.happenedAsPlanned === null ? "" : reconciliation.happenedAsPlanned ? "yes" : "no"}
          onChange={(event) =>
            onChange({
              ...segment,
              reconciliation: {
                ...reconciliation,
                happenedAsPlanned: event.target.value === "" ? null : event.target.value === "yes",
              },
            })
          }
        >
          <option value="">Not recorded</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      {segment.type === "angle" && (
        <label className="field">
          <span>Actual angle rating</span>
          <input
            type="number"
            min={0}
            max={100}
            value={reconciliation.actualRating ?? ""}
            onChange={(event) =>
              onChange({
                ...segment,
                reconciliation: {
                  ...reconciliation,
                  actualRating: event.target.value === "" ? null : Number(event.target.value),
                },
              })
            }
          />
        </label>
      )}
      <label className="field field--full">
        <span>Final {segment.type === "match" ? "Match Story" : "Segment Output"}</span>
        <textarea
          rows={6}
          placeholder={plannedNarrative || "Record the final narrative that became part of show history."}
          value={reconciliation.finalNarrative}
          onChange={(event) =>
            onChange({
              ...segment,
              reconciliation: { ...reconciliation, finalNarrative: event.target.value },
            })
          }
        />
      </label>
      <label className="field field--full">
        <span>Changes from the plan</span>
        <textarea
          rows={3}
          value={reconciliation.changes}
          onChange={(event) =>
            onChange({
              ...segment,
              reconciliation: { ...reconciliation, changes: event.target.value },
            })
          }
        />
      </label>
      <label className="field field--full">
        <span>Actual storyline consequences</span>
        <textarea
          rows={3}
          value={reconciliation.actualConsequences}
          onChange={(event) =>
            onChange({
              ...segment,
              reconciliation: { ...reconciliation, actualConsequences: event.target.value },
            })
          }
        />
      </label>
      <label className="field field--full">
        <span>Final follow-up</span>
        <textarea
          rows={3}
          value={reconciliation.finalFollowUp}
          onChange={(event) =>
            onChange({
              ...segment,
              reconciliation: { ...reconciliation, finalFollowUp: event.target.value },
            })
          }
        />
      </label>
    </div>
  );
}

function SegmentReconciliationCard({
  segment,
  index,
  actualMatches,
  onChange,
}: {
  segment: PlannedSegment;
  index: number;
  actualMatches: MatchRecord[];
  onChange: (segment: PlannedSegment) => void;
}) {
  const ranked = useMemo(
    () => (segment.type === "match" ? rankMatchCandidates(segment, actualMatches, index) : []),
    [actualMatches, index, segment],
  );
  const score = ranked.find((candidate) => candidate.item.id === segment.reconciliation.linkedMatchId)?.score;

  return (
    <article className={`reconciliation-segment reconciliation-segment--${segment.type}`}>
      <header>
        <div>
          <span className="segment-order">#{index + 1}</span>
          <span className="segment-kind">{segment.type.toUpperCase()}</span>
          <span className={`workflow-status workflow-status--${segment.workflowStatus.toLowerCase().replaceAll(" ", "-")}`}>
            {segment.workflowStatus}
          </span>
        </div>
        <label className="compact-field">
          <span>Workflow status</span>
          <select
            value={segment.workflowStatus}
            onChange={(event) => onChange({ ...segment, workflowStatus: event.target.value as PlannedSegment["workflowStatus"] })}
          >
            <option>Planned</option>
            <option>Entered in TEW</option>
            <option>Completed</option>
            <option>Reconciled</option>
          </select>
        </label>
      </header>

      {segment.type === "match" ? (
        <>
          <div className="match-link-row">
            <label className="field">
              <span>Linked TEW match</span>
              <select
                value={segment.reconciliation.linkedMatchId}
                onChange={(event) => {
                  const match = actualMatches.find((item) => item.id === event.target.value) ?? null;
                  onChange(setSegmentActualMatch(segment, match));
                }}
              >
                <option value="">Leave unmatched</option>
                {actualMatches.map((match) => (
                  <option key={match.id} value={match.id}>{matchLabel(match)}</option>
                ))}
              </select>
            </label>
            <div className="match-confidence">
              <span>Automatic confidence</span>
              <strong>{score === undefined ? "—" : `${score}%`}</strong>
            </div>
          </div>
          <PlannedActualColumns segment={segment} />
        </>
      ) : (
        <div className="angle-comparison">
          <section>
            <p className="eyebrow">PLANNED ANGLE</p>
            <h4>{segment.title}</h4>
            <p>{segment.segmentOutput || "No planned Segment Output was entered."}</p>
          </section>
          <section>
            <p className="eyebrow">ACTUAL ANGLE</p>
            <p>
              TEW does not reliably retain the complete angle output in historical MDB records. Record the final
              version below so it remains part of the permanent enhanced history.
            </p>
          </section>
        </div>
      )}

      <FinalFields segment={segment} onChange={onChange} />
    </article>
  );
}

export default function ReconciliationWorkspace({
  show,
  allShows,
  snapshot,
  onChange,
}: {
  show: PlannedShow;
  allShows: PlannedShow[];
  snapshot: TewSnapshot | null;
  onChange: (show: PlannedShow) => void;
}) {
  const usedShowIds = useMemo(
    () => new Set(allShows.filter((item) => item.id !== show.id).map((item) => item.reconciliation?.linkedShowId).filter(Boolean)),
    [allShows, show.id],
  );
  const candidates = useMemo(
    () => rankShowCandidates(show, (snapshot?.shows ?? []).filter((actual) => !usedShowIds.has(actual.id))),
    [show, snapshot, usedShowIds],
  );
  const [selectedActualId, setSelectedActualId] = useState(show.reconciliation?.linkedShowId ?? candidates[0]?.item.id ?? "");

  useEffect(() => {
    setSelectedActualId(show.reconciliation?.linkedShowId ?? candidates[0]?.item.id ?? "");
  }, [candidates, show.id, show.reconciliation?.linkedShowId]);

  const liveActualShow: ShowRecord | null =
    snapshot?.shows.find((actual) => actual.id === show.reconciliation?.linkedShowId) ?? null;
  const availableMatches = liveActualShow?.matches ?? [];
  const selectedCandidate = candidates.find((candidate) => candidate.item.id === selectedActualId) ?? null;
  const progress = reconciliationProgress(show);

  function updateSegment(segment: PlannedSegment): void {
    onChange({
      ...show,
      segments: show.segments.map((item) => (item.id === segment.id ? segment : item)),
    });
  }

  if (!show.reconciliation) {
    return (
      <section className="reconciliation-workspace">
        <header className="reconciliation-header">
          <div>
            <p className="eyebrow">POST-SHOW RECONCILIATION</p>
            <h3>Connect the plan to the completed TEW show</h3>
            <p>The tracker will preserve the original card and add the actual result beside it.</p>
          </div>
        </header>

        {!snapshot ? (
          <div className="reconciliation-empty">
            <h4>Import the post-show TEW snapshot</h4>
            <p>Use the TEW snapshot control above after the show has been run and an updated MDB has been created.</p>
          </div>
        ) : snapshot.shows.length === 0 ? (
          <div className="reconciliation-empty">No completed TEW shows were mapped from this snapshot.</div>
        ) : (
          <section className="show-link-panel">
            <label className="field">
              <span>Completed TEW show</span>
              <select value={selectedActualId} onChange={(event) => setSelectedActualId(event.target.value)}>
                {candidates.map((candidate) => (
                  <option key={candidate.item.id} value={candidate.item.id}>
                    {candidate.score}% · {candidate.item.name} · {formatDate(candidate.item.date)}
                  </option>
                ))}
              </select>
            </label>
            {selectedCandidate && (
              <div className="candidate-preview">
                <strong>{selectedCandidate.score}% confidence</strong>
                <span>{selectedCandidate.reasons.join(" · ") || "Manual selection"}</span>
                <small>{selectedCandidate.item.matches.length} recorded matches</small>
              </div>
            )}
            <button
              className="primary-button"
              type="button"
              disabled={!selectedCandidate}
              onClick={() => {
                if (selectedCandidate && snapshot) {
                  onChange(linkPlannedShow(show, selectedCandidate.item, snapshot.fileName));
                }
              }}
            >
              Link Show and Suggest Matches
            </button>
          </section>
        )}
      </section>
    );
  }

  return (
    <section className="reconciliation-workspace">
      <header className="reconciliation-header">
        <div>
          <p className="eyebrow">{show.status === "Reconciled" ? "ENHANCED SHOW HISTORY" : "POST-SHOW RECONCILIATION"}</p>
          <h3>{show.status === "Reconciled" ? "Permanent planned-versus-actual record" : "Review the final show segment by segment"}</h3>
          <p>{progress.completed} of {progress.total} segments reconciled · {progress.percent}% complete</p>
        </div>
        <div className="reconciliation-actions">
          {show.status === "Reconciled" ? (
            <button className="secondary-button" type="button" onClick={() => onChange(reopenReconciliation(show))}>
              Reopen and Correct
            </button>
          ) : (
            <button className="primary-button" type="button" onClick={() => onChange(finalizeReconciliation(show))}>
              Finalize Enhanced History
            </button>
          )}
          {liveActualShow && snapshot && show.status !== "Reconciled" && (
            <button className="secondary-button" type="button" onClick={() => onChange(linkPlannedShow(show, liveActualShow, snapshot.fileName))}>
              Reapply Best Match Suggestions
            </button>
          )}
          <button
            className="danger-button"
            type="button"
            onClick={() => {
              if (window.confirm("Unlink this TEW show? The original plan remains, but saved actual results will be cleared.")) {
                onChange(unlinkPlannedShow(show));
              }
            }}
          >
            Unlink TEW Show
          </button>
        </div>
      </header>

      <ShowComparison show={show} />

      <label className="field reconciliation-notes">
        <span>Show reconciliation notes</span>
        <textarea
          rows={3}
          value={show.reconciliation.notes}
          onChange={(event) => onChange({
            ...show,
            reconciliation: show.reconciliation ? { ...show.reconciliation, notes: event.target.value } : null,
          })}
        />
      </label>

      {!snapshot && (
        <div className="status-banner">
          The linked result is preserved in browser storage. Import the same or a newer TEW snapshot to change match links.
        </div>
      )}

      <div className="reconciliation-segment-list">
        {show.segments.map((segment, index) => (
          <SegmentReconciliationCard
            key={segment.id}
            segment={segment}
            index={index}
            actualMatches={availableMatches}
            onChange={updateSegment}
          />
        ))}
      </div>
    </section>
  );
}
