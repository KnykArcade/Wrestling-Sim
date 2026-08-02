import { useEffect, useMemo, useState } from "react";
import { loadOutputLibraryUniverse, saveOutputLibraryUniverse } from "../outputLibrary/storage";
import type { OutputLibraryUniverse } from "../outputLibrary/types";
import { loadPlannedShows, savePlannedShows } from "../planner/storage";
import type { PlannedShow } from "../planner/types";
import { showSessionRecord, upsertShowSessionRecord } from "../showSession/model";
import { loadShowSessionUniverse, saveShowSessionUniverse } from "../showSession/storage";
import { loadWrapUpUniverse } from "./storage";
import PostShowWrapUpPanel from "./PostShowWrapUpPanel";

interface ShowSessionWrapUpBridgeProps {
  onOpenCalendar: () => void;
  onRefreshShowSession: (showId: string) => void;
}

interface BridgeState {
  shows: PlannedShow[];
  outputLibrary: OutputLibraryUniverse;
  showId: string;
  fingerprint: string;
}

function readBridgeState(): BridgeState {
  const shows = loadPlannedShows(window.localStorage);
  const sessions = loadShowSessionUniverse(window.localStorage);
  const outputLibrary = loadOutputLibraryUniverse(window.localStorage);
  const showId = sessions.lastShowId || shows[0]?.id || "";
  const show = shows.find((item) => item.id === showId) ?? shows[0] ?? null;
  return {
    shows,
    outputLibrary,
    showId,
    fingerprint: JSON.stringify({
      showId,
      showUpdatedAt: show?.updatedAt ?? "",
      showStatus: show?.status ?? "",
      reconciliation: show?.reconciliation?.completedAt ?? "",
      segments: show?.segments.map((segment) => [segment.id, segment.workflowStatus, segment.reconciliation.reconciledAt, segment.reconciliation.finalNarrative]) ?? [],
      outputCount: outputLibrary.items.length,
      outputVersions: outputLibrary.items.reduce((total, item) => total + item.versions.length, 0),
    }),
  };
}

export default function ShowSessionWrapUpBridge({ onOpenCalendar, onRefreshShowSession }: ShowSessionWrapUpBridgeProps) {
  const [state, setState] = useState<BridgeState>(readBridgeState);
  const sessions = useMemo(() => loadShowSessionUniverse(window.localStorage), [state.fingerprint]);
  const record = state.showId ? showSessionRecord(state.showId, sessions) : null;
  const [open, setOpen] = useState(() => record?.activeStep === "wrap-up");

  useEffect(() => {
    const badge = document.querySelector<HTMLElement>(".phase-badge");
    if (badge) badge.textContent = "PHASE 5I · POST-SHOW WRAP-UP";
    const timer = window.setInterval(() => {
      const next = readBridgeState();
      setState((current) => current.fingerprint === next.fingerprint ? current : next);
    }, 700);
    return () => window.clearInterval(timer);
  }, []);

  const show = state.shows.find((item) => item.id === state.showId) ?? state.shows[0] ?? null;
  const wrapUp = useMemo(() => loadWrapUpUniverse(window.localStorage), [state.fingerprint, open]);
  const wrapSession = show ? wrapUp.sessions.find((session) => session.showId === show.id) : null;
  const eligible = Boolean(show && (show.status === "Reconciled" || show.reconciliation));

  function setBridgeOpen(nextOpen: boolean): void {
    setOpen(nextOpen);
    if (!show) return;
    const currentSessions = loadShowSessionUniverse(window.localStorage);
    const currentRecord = showSessionRecord(show.id, currentSessions, show.segments[0]?.id ?? "");
    saveShowSessionUniverse(window.localStorage, upsertShowSessionRecord(currentSessions, {
      ...currentRecord,
      activeStep: nextOpen ? "wrap-up" : "overview",
      lastOpenedAt: new Date().toISOString(),
    }));
  }

  function updateShows(shows: PlannedShow[]): void {
    savePlannedShows(window.localStorage, shows);
    setState((current) => ({ ...current, shows, fingerprint: `${current.fingerprint}:${Date.now()}` }));
  }

  function updateOutputLibrary(outputLibrary: OutputLibraryUniverse): void {
    saveOutputLibraryUniverse(window.localStorage, outputLibrary);
    setState((current) => ({ ...current, outputLibrary, fingerprint: `${current.fingerprint}:${Date.now()}` }));
  }

  function openNextShow(showId: string): void {
    const target = state.shows.find((item) => item.id === showId);
    if (!target) return;
    const currentSessions = loadShowSessionUniverse(window.localStorage);
    const targetRecord = showSessionRecord(target.id, currentSessions, target.segments[0]?.id ?? "");
    saveShowSessionUniverse(window.localStorage, upsertShowSessionRecord(currentSessions, {
      ...targetRecord,
      selectedSegmentId: target.segments[0]?.id ?? "",
      activeStep: "overview",
      lastOpenedAt: new Date().toISOString(),
    }));
    setOpen(false);
    onRefreshShowSession(target.id);
  }

  if (!show) return null;

  return <section className={`show-session-wrap-up-bridge ${open ? "is-open" : ""}`} aria-label="Show Session post-show Wrap-Up">
    <header>
      <div><p className="eyebrow">SHOW SESSION STEP 6</p><h2>Post-Show Wrap-Up</h2><p>{eligible ? "Confirm final creative history and explicitly approve every downstream consequence after TEW reconciliation." : "This step unlocks after the completed TEW show has been linked and reconciled."}</p><small>Current complete backup format: version 20.</small></div>
      <div className="wrap-up-bridge-state"><span>{show.name}</span><strong>{wrapSession?.status ?? (eligible ? "Wrap-Up Not Reviewed" : "Awaiting Reconciliation")}</strong><small>{wrapSession?.closureReports[0] ? `Closed ${wrapSession.closureReports[0].generatedAt}` : "No consequence is applied automatically."}</small></div>
      <button className={open ? "secondary-button" : "primary-button"} type="button" disabled={!eligible} onClick={() => setBridgeOpen(!open)}>{open ? "Return to Main Show Session" : wrapSession?.status === "Closed" ? "Open Closed Wrap-Up" : "Open Step 6: Wrap-Up"}</button>
    </header>
    {open && eligible && <PostShowWrapUpPanel
      show={show}
      shows={state.shows}
      onShowsChange={updateShows}
      outputLibrary={state.outputLibrary}
      onOutputLibraryChange={updateOutputLibrary}
      onOpenCalendar={onOpenCalendar}
      onOpenNextShow={openNextShow}
    />}
  </section>;
}
