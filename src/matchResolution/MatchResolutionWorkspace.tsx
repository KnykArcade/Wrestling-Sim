import { useEffect, useMemo, useState } from "react";
import CalculationLedgerView from "../calculations/CalculationLedgerView";
import { MATCH_AIMS } from "../matchEngine/catalog";
import { approachLimitForSetup, normalizeApproachName, workerProfileKey } from "../matchEngine/model";
import { loadMatchEngineUniverse } from "../matchEngine/storage";
import type { MatchEngineProfile } from "../matchEngine/types";
import { resolveMatchFormat, resolveMatchImportance } from "../matchEngine/performance";
import { calculateMatchAnticipation, momentumLabel } from "../crowd/model";
import { loadPlannedShows } from "../planner/storage";
import type { PlannedSegment, PlannedShow, PlannedWorkerReference } from "../planner/types";
import { loadActiveStartingUniverse, loadStartingUniverseState } from "../startingUniverse/storage";
import type { StartingUniverseRecord, StartingUniverseWorkbookMetrics } from "../startingUniverse/types";
import { importedApproachIdForMatchEngineId } from "../startingUniverse/formulas";
import { RESOLUTION_APPROACHES, resolutionApproach } from "./catalog";
import {
  acceptEngineResult,
  activeResolutionAttempt,
  appendResolutionAttempt,
  createMatchResolutionRecord,
  matchResolutionSetupFingerprint,
  overrideEngineResult,
  resolutionApproachRating,
  resolveMatch,
} from "./engine";
import {
  loadMatchResolutionUniverse,
  saveMatchResolutionUniverse,
  upsertMatchResolutionRecord,
} from "./storage";
import type {
  MatchResolutionFinalResult,
  MatchResolutionRecord,
  MatchResolutionSetup,
  MatchResolutionUniverse,
  MatchResolutionWorkerSettings,
  MatchResolutionWorkerSource,
  ResolutionApproachId,
} from "./types";

const finishTypes: MatchResolutionFinalResult["finishType"][] = ["Pinfall", "Submission", "Knockout", "Referee Stoppage", "Count Out", "Disqualification", "No Contest"];
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatDate(value: string): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function starLabel(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}★`;
}

function finalResultHeadline(result: MatchResolutionFinalResult): string {
  return result.finishType === "No Contest" ? "Match ended in a No Contest" : `${result.winnerName} defeated ${result.loserName}`;
}

function profileForWorker(worker: PlannedWorkerReference, profiles: MatchEngineProfile[]): MatchEngineProfile | null {
  const exactKey = workerProfileKey({ id: worker.id, name: worker.name, source: worker.source });
  return profiles.find((profile) => profile.workerKey === exactKey)
    ?? profiles.find((profile) => profile.workerSource === "tew" && profile.workerId === worker.id)
    ?? profiles.find((profile) => normalizeApproachName(profile.workerName) === normalizeApproachName(worker.name))
    ?? null;
}

function workbookMetricsForWorker(worker: PlannedWorkerReference, universe: StartingUniverseRecord | null): StartingUniverseWorkbookMetrics | null {
  return universe?.review.roster.find((decision) => decision.workerId === worker.id)?.workbookMetrics ?? null;
}

function eligibleMatchSegments(show: PlannedShow | null): PlannedSegment[] {
  return show?.segments.filter((segment) => segment.type === "match" && segment.workers.length >= 2) ?? [];
}

function createWorkerSettings(worker: PlannedWorkerReference, segment: PlannedSegment, profile: MatchEngineProfile | null): MatchResolutionWorkerSettings {
  const side = normalizeApproachName(worker.side);
  const teammates = side ? segment.workers.filter((candidate) => normalizeApproachName(candidate.side) === side) : [worker];
  const bookedPlan = segment.matchApproachSetup.workerPlans.find((plan) => plan.workerKey === workerProfileKey(worker) || normalizeApproachName(plan.workerName) === normalizeApproachName(worker.name));
  const bookedApproaches = bookedPlan?.selectedApproachIds
    .map((id) => importedApproachIdForMatchEngineId(id))
    .filter((id): id is ResolutionApproachId => id !== null) ?? [];
  return {
    workerKey: workerProfileKey({ id: worker.id, name: worker.name, source: worker.source }),
    workerId: worker.id,
    workerName: worker.name,
    approachMode: bookedApproaches.length ? "Manual" : "AI",
    lockedApproachIds: [],
    manualApproachIds: bookedApproaches,
    storyNeed: 0,
    momentum: profile?.momentum ?? 50,
    bookingBias: 0,
    teamId: side || workerProfileKey({ id: worker.id, name: worker.name, source: worker.source }),
    teamName: teammates.map((candidate) => candidate.name).join(" & ") || worker.name,
  };
}

function buildSetup(show: PlannedShow, segment: PlannedSegment, profiles: MatchEngineProfile[], existing?: MatchResolutionRecord | null): MatchResolutionSetup {
  const participantProfiles = segment.workers.flatMap((worker) => {
    const profile = profileForWorker(worker, profiles);
    return profile ? [profile] : [];
  });
  const anticipation = calculateMatchAnticipation({ profiles: participantProfiles, plans: segment.matchApproachSetup.workerPlans, aimId: segment.matchApproachSetup.matchAimId });
  const bookedSettings = segment.matchApproachSetup.performanceSettings;
  const bookedImportance = resolveMatchImportance(bookedSettings.importance, segment, show.segments);
  const matchFormat = resolveMatchFormat(segment);
  if (existing) {
    return {
      ...existing.setup,
      showName: show.name,
      showDate: show.date,
      segmentTitle: segment.title,
      matchType: segment.matchType,
      durationMinutes: segment.durationMinutes,
      approachLimit: segment.matchApproachSetup.approachLimit,
      aimId: segment.matchApproachSetup.matchAimId,
      importance: bookedImportance,
      chemistry: bookedSettings.chemistry ?? 0,
      volatility: bookedSettings.volatility,
      anticipation,
      championship: segment.championship,
      competitionRound: segment.competitionRoundLabel,
      format: matchFormat,
      eliminationRules: matchFormat === "Elimination" || matchFormat === "Battle Royal",
      workers: segment.workers.map((worker) => {
        const derived = createWorkerSettings(worker, segment, profileForWorker(worker, profiles));
        const saved = existing.setup.workers.find((item) => item.workerId === worker.id || normalizeApproachName(item.workerName) === normalizeApproachName(worker.name));
        return saved ? {
          ...derived,
          ...saved,
          approachMode: derived.manualApproachIds.length ? "Manual" : saved.approachMode,
          manualApproachIds: derived.manualApproachIds.length ? derived.manualApproachIds : saved.manualApproachIds,
          momentum: derived.momentum,
          teamId: saved.teamId || derived.teamId,
          teamName: saved.teamName || derived.teamName,
        } : derived;
      }),
    };
  }
  return {
    showId: show.id,
    showName: show.name,
    showDate: show.date,
    segmentId: segment.id,
    segmentTitle: segment.title,
    matchType: segment.matchType,
    durationMinutes: segment.durationMinutes,
    approachLimit: segment.matchApproachSetup.approachLimit,
    aimId: segment.matchApproachSetup.matchAimId,
    importance: bookedImportance,
    championship: segment.championship,
    competitionRound: segment.competitionRoundLabel,
    chemistry: bookedSettings.chemistry ?? 0,
    volatility: bookedSettings.volatility,
    anticipation,
    format: matchFormat,
    eliminationRules: matchFormat === "Elimination" || matchFormat === "Battle Royal",
    workers: segment.workers.map((worker) => createWorkerSettings(worker, segment, profileForWorker(worker, profiles))),
  };
}

function statusClass(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export default function MatchResolutionWorkspace({ onReturnToShow }: { onReturnToShow?: () => void }) {
  const [universe, setUniverse] = useState<MatchResolutionUniverse>(() => loadMatchResolutionUniverse(window.localStorage));
  const [shows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [startingUniverse, setStartingUniverse] = useState<StartingUniverseRecord | null>(null);
  const matchEngine = useMemo(() => loadMatchEngineUniverse(window.localStorage), [universe.records.length]);
  const initialShowId = universe.settings.selectedShowId && shows.some((show) => show.id === universe.settings.selectedShowId) ? universe.settings.selectedShowId : shows[0]?.id ?? "";
  const [selectedShowId, setSelectedShowId] = useState(initialShowId);
  const selectedShow = shows.find((show) => show.id === selectedShowId) ?? shows[0] ?? null;
  const eligibleSegments = eligibleMatchSegments(selectedShow);
  const initialSegmentId = universe.settings.selectedSegmentId && eligibleSegments.some((segment) => segment.id === universe.settings.selectedSegmentId) ? universe.settings.selectedSegmentId : eligibleSegments[0]?.id ?? "";
  const [selectedSegmentId, setSelectedSegmentId] = useState(initialSegmentId);
  const selectedSegment = eligibleSegments.find((segment) => segment.id === selectedSegmentId) ?? eligibleSegments[0] ?? null;
  const existingRecord = selectedShow && selectedSegment ? universe.records.find((record) => record.showId === selectedShow.id && record.segmentId === selectedSegment.id) ?? null : null;
  const [setup, setSetup] = useState<MatchResolutionSetup | null>(() => selectedShow && selectedSegment ? buildSetup(selectedShow, selectedSegment, matchEngine.profiles, existingRecord) : null);
  const [notice, setNotice] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [overrideWinnerKey, setOverrideWinnerKey] = useState("");
  const [overrideFinishType, setOverrideFinishType] = useState<MatchResolutionFinalResult["finishType"]>("Pinfall");
  const [overrideDescription, setOverrideDescription] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => saveMatchResolutionUniverse(window.localStorage, universe), [universe]);

  useEffect(() => {
    let alive = true;
    const state = loadStartingUniverseState(window.localStorage);
    void loadActiveStartingUniverse(state).then((record) => { if (alive) setStartingUniverse(record); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!selectedShow) return;
    const segments = eligibleMatchSegments(selectedShow);
    const nextSegmentId = segments.some((segment) => segment.id === selectedSegmentId) ? selectedSegmentId : segments[0]?.id ?? "";
    if (nextSegmentId !== selectedSegmentId) setSelectedSegmentId(nextSegmentId);
  }, [selectedShowId]);

  useEffect(() => {
    if (!selectedShow || !selectedSegment) {
      setSetup(null);
      return;
    }
    const record = universe.records.find((item) => item.showId === selectedShow.id && item.segmentId === selectedSegment.id) ?? null;
    setSetup(buildSetup(selectedShow, selectedSegment, matchEngine.profiles, record));
    const attempt = activeResolutionAttempt(record);
    setOverrideWinnerKey(attempt?.engineResult.loserKey ?? attempt?.engineResult.winnerKey ?? "");
    setOverrideFinishType(attempt?.engineResult.finishType ?? "Pinfall");
    setOverrideDescription("");
    setOverrideReason("");
    setChangeReason("");
  }, [selectedShowId, selectedSegmentId]);

  const sources = useMemo((): MatchResolutionWorkerSource[] => {
    if (!selectedSegment) return [];
    return selectedSegment.workers.flatMap((worker) => {
      const profile = profileForWorker(worker, matchEngine.profiles);
      return profile ? [{ profile, workbookMetrics: workbookMetricsForWorker(worker, startingUniverse) }] : [];
    });
  }, [selectedSegment, matchEngine.profiles, startingUniverse]);

  const missingProfiles = selectedSegment?.workers.filter((worker) => !profileForWorker(worker, matchEngine.profiles)) ?? [];
  const activeAttempt = activeResolutionAttempt(existingRecord);
  const currentFingerprint = setup && sources.length >= 2 ? matchResolutionSetupFingerprint(setup, sources) : "";
  const setupChanged = Boolean(activeAttempt && currentFingerprint && activeAttempt.setupFingerprint !== currentFingerprint);
  const slots = setup ? approachLimitForSetup(setup.durationMinutes, setup.approachLimit) : 0;

  function selectShow(showId: string): void {
    setSelectedShowId(showId);
    const show = shows.find((item) => item.id === showId);
    const segmentId = eligibleMatchSegments(show ?? null)[0]?.id ?? "";
    setSelectedSegmentId(segmentId);
    setUniverse((current) => ({ ...current, settings: { ...current.settings, selectedShowId: showId, selectedSegmentId: segmentId } }));
  }

  function selectSegment(segmentId: string): void {
    setSelectedSegmentId(segmentId);
    setUniverse((current) => ({ ...current, settings: { ...current.settings, selectedShowId, selectedSegmentId: segmentId } }));
  }

  function updateWorker(index: number, patch: Partial<MatchResolutionWorkerSettings>): void {
    setSetup((current) => {
      if (!current) return current;
      const workers = current.workers.map((worker, workerIndex) => workerIndex === index ? { ...worker, ...patch } : worker);
      const profiles = sources.map((source) => {
        const settings = workers.find((worker) => worker.workerKey === source.profile.workerKey);
        return settings ? { ...source.profile, momentum: settings.momentum } : source.profile;
      });
      return { ...current, workers, anticipation: calculateMatchAnticipation({ profiles, plans: selectedSegment?.matchApproachSetup.workerPlans ?? [], aimId: current.aimId }) };
    });
  }

  function toggleApproach(index: number, approachId: ResolutionApproachId, mode: "locked" | "manual"): void {
    if (!setup) return;
    const worker = setup.workers[index];
    const source = mode === "locked" ? worker.lockedApproachIds : worker.manualApproachIds;
    const next = source.includes(approachId) ? source.filter((id) => id !== approachId) : [...source, approachId].slice(0, slots);
    updateWorker(index, mode === "locked" ? { lockedApproachIds: next } : { manualApproachIds: next });
  }

  function runOfficialCalculation(): void {
    if (!setup || !selectedShow || !selectedSegment) return;
    if (sources.length !== selectedSegment.workers.length || missingProfiles.length) {
      setNotice("Every booked participant needs a Match Engine profile before the official result can be calculated.");
      return;
    }
    if (existingRecord && !setupChanged) {
      setNotice("This exact setup already has one official calculation. Accept it, override it, or materially change the setup before calculating again.");
      return;
    }
    if (existingRecord && setupChanged && !changeReason.trim()) {
      setNotice("Record the material setup change before creating another official calculation.");
      return;
    }
    try {
      const attempt = resolveMatch({ setup, workers: sources, setupChangeReason: existingRecord ? changeReason : "" });
      const record = existingRecord
        ? { ...appendResolutionAttempt({ ...existingRecord, setup }, attempt), setup }
        : createMatchResolutionRecord(setup, attempt);
      setUniverse((current) => upsertMatchResolutionRecord(current, record));
      setOverrideWinnerKey(attempt.engineResult.loserKey);
      setOverrideFinishType(attempt.engineResult.finishType);
      setNotice(existingRecord ? "A new official calculation was created after the recorded material change. Earlier calculations remain in the audit history." : "The engine produced one official result for this match setup. There is no hidden reroll.");
      setChangeReason("");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The match calculation failed.");
    }
  }

  function acceptResult(): void {
    if (!existingRecord) return;
    try {
      const record = acceptEngineResult(existingRecord);
      const next = upsertMatchResolutionRecord(universe, record);
      setUniverse(next);
      saveMatchResolutionUniverse(window.localStorage, next);
      setNotice("The engine result is now official.");
      onReturnToShow?.();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The result could not be accepted.");
    }
  }

  function overrideResult(): void {
    if (!existingRecord) return;
    try {
      const record = overrideEngineResult(existingRecord, overrideWinnerKey, overrideFinishType, overrideDescription, overrideReason);
      const next = upsertMatchResolutionRecord(universe, record);
      setUniverse(next);
      saveMatchResolutionUniverse(window.localStorage, next);
      setNotice("The booker override is official. The original engine winner, probabilities, performance scores, and roll remain permanently recorded.");
      setOverrideReason("");
      onReturnToShow?.();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The result could not be overridden.");
    }
  }

  const displayedRecord = selectedShow && selectedSegment ? universe.records.find((record) => record.showId === selectedShow.id && record.segmentId === selectedSegment.id) ?? null : null;
  const displayedAttempt = activeResolutionAttempt(displayedRecord);
  const finalResult = displayedAttempt?.finalResult ?? null;

  return <section className="match-resolution-workspace">
    <header className="match-resolution-hero">
      <div><p className="eyebrow">OFFICIAL MATCH</p><h2>You book the opportunity. The wrestlers create the outcome. You book the consequences.</h2><p>Resolve singles, tag, trios, multi-person, elimination, and battle-royal matches through the same permanent calculation and explicit override process.</p></div>
      <div className="match-resolution-principle"><span>Outcome authority</span><strong>Wrestling Sim</strong><small>One official calculation per material setup. Accept or explicitly override.</small></div>
    </header>

    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <section className="match-resolution-selector">
      <label className="field"><span>Planned show</span><select aria-label="Resolution planned show" value={selectedShow?.id ?? ""} onChange={(event) => selectShow(event.target.value)}><option value="">No planned show</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name} · {show.date || "Unscheduled"}</option>)}</select></label>
      <label className="field"><span>Unresolved match</span><select aria-label="Resolution planned match" value={selectedSegment?.id ?? ""} onChange={(event) => selectSegment(event.target.value)}><option value="">No eligible match</option>{eligibleSegments.map((segment) => { const record = universe.records.find((item) => item.showId === selectedShow?.id && item.segmentId === segment.id); return <option key={segment.id} value={segment.id}>{segment.title} · {record?.status ?? "Unresolved"}</option>; })}</select></label>
      <div className="match-resolution-selector-summary"><span>Eligible matches</span><strong>{eligibleSegments.length}</strong><small>Two or more booked wrestlers; teams follow the booked side assignments.</small></div>
    </section>

    {!selectedShow || !selectedSegment || !setup ? <div className="empty-state match-resolution-empty"><h3>No planned match is ready</h3><p>Create a planned match with at least two wrestlers. Assign matching sides to teammates in tag and trios matches.</p></div> : <>
      <section className="match-resolution-context">
        <header><div><p className="eyebrow">MATCH CONTEXT</p><h3>{selectedSegment.title}</h3><p>{selectedShow.name} · {selectedSegment.matchType} · {selectedSegment.durationMinutes} minutes</p></div><span className={`resolution-status resolution-status--${statusClass(displayedRecord?.status ?? "Unresolved")}`}>{displayedRecord?.status ?? "Unresolved"}</span></header>
          <div className="match-resolution-context-grid">
          <label className="field"><span>Match aim</span><select aria-label="Resolution match aim" value={setup.aimId} onChange={(event) => { const aimId = event.target.value as MatchResolutionSetup["aimId"]; setSetup({ ...setup, aimId, anticipation: calculateMatchAnticipation({ profiles: sources.map((source) => source.profile), plans: selectedSegment.matchApproachSetup.workerPlans, aimId }) }); }}>{MATCH_AIMS.map((aim) => <option key={aim.id} value={aim.id}>{aim.name}</option>)}</select></label>
          <div><span>Importance</span><strong>{setup.importance}</strong><small>Set once in the booking preview</small></div>
          <div><span>Chemistry</span><strong>{setup.chemistry >= 0 ? "+" : ""}{setup.chemistry}</strong><small>Set once in the booking preview</small></div>
          <div><span>Volatility</span><strong>{setup.volatility}</strong><small>Shared with the booking preview</small></div>
          <div><span>Anticipation</span><strong>{setup.anticipation ? `${setup.anticipation.score.toFixed(1)} · ${setup.anticipation.label}` : "Not calculated"}</strong></div><div><span>Format</span><strong>{setup.format || "Singles"}</strong></div><div><span>Championship</span><strong>{setup.championship || "None"}</strong></div><div><span>Competition</span><strong>{setup.competitionRound || "None"}</strong></div>
        </div>
      </section>

      {missingProfiles.length > 0 && <section className="match-resolution-blocker"><strong>Missing wrestler profiles</strong><p>{missingProfiles.map((worker) => worker.name).join(", ")} must be linked to Match Engine profiles before calculation. Starting Universe confirmation can create these profiles without inventing ratings.</p></section>}

      <section className="match-resolution-workers">{setup.workers.map((workerSettings, index) => {
        const plannedWorker = selectedSegment.workers[index];
        const source = sources.find((item) => item.profile.workerId === plannedWorker?.id || normalizeApproachName(item.profile.workerName) === normalizeApproachName(plannedWorker?.name ?? ""));
        const profile = source?.profile ?? null;
        return <article key={`${workerSettings.workerKey}:${index}`} className="match-resolution-worker-card">
          <header><div><p className="eyebrow">WRESTLER {index + 1}</p><h3>{plannedWorker?.name ?? workerSettings.workerName}</h3><span>{profile ? `${profile.styleId} · ${source?.workbookMetrics ? "Exact Starting Universe workbook metrics" : "Match Engine profile formulas"}` : "Profile missing"}</span></div><strong>{slots} approach slot{slots === 1 ? "" : "s"}</strong></header>
          <div className="match-resolution-worker-factors"><label className="field"><span>Approach control</span><select aria-label={`${workerSettings.workerName} approach mode`} value={workerSettings.approachMode} onChange={(event) => updateWorker(index, { approachMode: event.target.value as MatchResolutionWorkerSettings["approachMode"] })}><option>AI</option><option>Manual</option></select></label><label className="field"><span>Story need</span><input aria-label={`${workerSettings.workerName} story need`} type="number" min={-20} max={20} value={workerSettings.storyNeed} onChange={(event) => updateWorker(index, { storyNeed: clamp(Number(event.target.value) || 0, -20, 20) })} /></label><label className="field"><span>Momentum</span><input aria-label={`${workerSettings.workerName} momentum`} title={momentumLabel(workerSettings.momentum)} type="number" min={0} max={100} value={workerSettings.momentum} onChange={(event) => updateWorker(index, { momentum: clamp(Number(event.target.value) || 0, 0, 100) })} /></label><label className="field"><span>Booker influence</span><input aria-label={`${workerSettings.workerName} booking influence`} type="number" min={-20} max={20} value={workerSettings.bookingBias} onChange={(event) => updateWorker(index, { bookingBias: clamp(Number(event.target.value) || 0, -20, 20) })} /></label></div>
          <div className="match-resolution-approach-grid">{RESOLUTION_APPROACHES.map((approach) => {
            const checked = workerSettings.approachMode === "Manual" ? workerSettings.manualApproachIds.includes(approach.id) : workerSettings.lockedApproachIds.includes(approach.id);
            const rating = profile ? resolutionApproachRating(profile, source?.workbookMetrics ?? null, approach.id) : 0;
            return <label key={approach.id} className={checked ? "selected" : ""}><input type="checkbox" checked={checked} disabled={!profile} onChange={() => toggleApproach(index, approach.id, workerSettings.approachMode === "Manual" ? "manual" : "locked")} /><span><strong>{approach.name}</strong><small>{rating.toFixed(1)} rating · Pace {approach.pace} · Cost {approach.staminaCost}</small></span><b>{approach.paceSource === "Workbook" ? "Workbook" : "Extension"}</b></label>;
          })}</div>
          <p className="match-resolution-worker-note">{workerSettings.approachMode === "AI" ? `Lock up to ${slots} approaches. The wrestler AI chooses every remaining slot.` : `Select up to ${slots} approaches. Any unfilled slots are completed by the wrestler AI.`}</p>
        </article>;
      })}</section>

      <section className="match-resolution-run-panel">
        <div><h3>Official calculation</h3><p>{displayedAttempt ? setupChanged ? "The material setup differs from the saved calculation. Record why before producing another official result." : "This exact setup already has its one official result. No reroll is available." : "The first calculation creates the permanent engine result and visible result roll."}</p></div>
        {displayedAttempt && setupChanged && <label className="field"><span>Material setup change</span><textarea aria-label="Resolution setup change reason" rows={3} value={changeReason} onChange={(event) => setChangeReason(event.target.value)} placeholder="Explain what materially changed: participants, length, aim, approaches, condition, or booking context." /></label>}
        <button className="primary-button" type="button" disabled={missingProfiles.length > 0 || Boolean(displayedAttempt && !setupChanged)} onClick={runOfficialCalculation}>{displayedAttempt ? "Create New Calculation After Material Change" : "Run Official Match Calculation"}</button>
      </section>

      {displayedAttempt && <section className="match-resolution-result">
        <header><div><p className="eyebrow">OFFICIAL ENGINE RESULT</p><h2>{displayedAttempt.engineResult.winnerName} defeated {displayedAttempt.engineResult.loserName}</h2><p>{displayedAttempt.engineResult.finishDescription}</p></div><div className="match-resolution-rating"><strong>{displayedAttempt.engineResult.matchScore.toFixed(1)}</strong><span>{starLabel(displayedAttempt.engineResult.starRating)}</span></div></header>
        <section className="match-resolution-result-grid"><article><span>Winner probability</span><strong>{(displayedAttempt.engineResult.winnerProbability * 100).toFixed(1)}%</strong><small>{displayedAttempt.engineResult.confidenceLabel} confidence</small></article><article><span>Actual duration</span><strong>{displayedAttempt.engineResult.actualDurationMinutes.toFixed(2)}</strong><small>minutes</small></article><article><span>Performance MVP</span><strong>{displayedAttempt.engineResult.performanceLeaderName}</strong><small>{displayedAttempt.engineResult.performanceLeaderKey === displayedAttempt.engineResult.winnerKey ? "Winner also led performance" : "Best performance came from the loser"}</small></article><article><span>Result roll</span><strong>{displayedAttempt.engineResult.resultRoll.toFixed(4)}</strong><small>{displayedAttempt.engineResult.upset ? "Upset result" : "Probability-favored result"}</small></article></section>
        <div className="match-resolution-factors"><h3>Why the result happened</h3>{displayedAttempt.engineResult.decisiveFactors.map((factor) => <p key={factor}>{factor}</p>)}</div>
        <div className="match-resolution-worker-results">{displayedAttempt.workerResults.map((result) => <article key={result.workerKey} className={result.workerKey === displayedAttempt.engineResult.winnerKey ? "winner" : ""}><header><div><strong>{result.workerName}</strong><span>{result.selectedApproachNames.join(" · ")}</span></div><b>{(result.winProbability * 100).toFixed(1)}%</b></header><dl><div><dt>Performance</dt><dd>{result.performanceScore.toFixed(1)}</dd></div><div><dt>Competitive</dt><dd>{result.competitiveScore.toFixed(1)}</dd></div><div><dt>Mental state</dt><dd>{result.mentalStateName}</dd></div><div><dt>Stamina</dt><dd>{result.staminaUsed}/{result.staminaAvailable} · {result.staminaStatus}</dd></div><div><dt>Pace</dt><dd>{result.actualPace} · {result.paceStatus}</dd></div><div><dt>Interaction</dt><dd>{result.interactionModifier >= 0 ? "+" : ""}{result.interactionModifier.toFixed(1)}</dd></div></dl>{result.incident && <p>{result.incident}</p>}</article>)}</div>
        <CalculationLedgerView attempt={displayedAttempt} anticipation={displayedRecord?.setup.anticipation} />

        {!finalResult ? <div className="match-resolution-decision"><section><h3>Accept the result</h3><p>The engine result becomes official and applies records, rankings, guarded titles, tournaments, and condition changes.</p><button className="primary-button" type="button" onClick={acceptResult}>Accept Engine Result</button></section><section><h3>Override as booker</h3><p>The original engine winner and every calculation remain visible. An override is never disguised as an engine result.</p><label className="field"><span>Final winner</span><select aria-label="Resolution override winner" disabled={overrideFinishType === "No Contest"} value={overrideWinnerKey} onChange={(event) => setOverrideWinnerKey(event.target.value)}>{displayedAttempt.workerResults.map((result) => <option key={result.workerKey} value={result.workerKey}>{result.workerName}</option>)}</select><small>{overrideFinishType === "No Contest" ? "No winner or loser will be recorded." : "Choose the official winner."}</small></label><label className="field"><span>Finish type</span><select aria-label="Resolution override finish type" value={overrideFinishType} onChange={(event) => setOverrideFinishType(event.target.value as MatchResolutionFinalResult["finishType"])}>{finishTypes.map((finish) => <option key={finish}>{finish}</option>)}</select></label><label className="field"><span>Final finish description</span><textarea aria-label="Resolution override description" rows={3} value={overrideDescription} onChange={(event) => setOverrideDescription(event.target.value)} /></label><label className="field"><span>Override reason</span><textarea aria-label="Resolution override reason" rows={3} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} /></label><button className="secondary-button" type="button" onClick={overrideResult}>Confirm Booker Override</button></section></div> : <section className={`match-resolution-final match-resolution-final--${displayedAttempt.status.toLowerCase()}`}><header><div><p className="eyebrow">OFFICIAL WRESTLING SIM RESULT</p><h3>{finalResultHeadline(finalResult)}</h3></div><span>{displayedAttempt.status}</span></header><p>{finalResult.finishDescription}</p>{!finalResult.acceptedEngineResult && <p><strong>Override reason:</strong> {finalResult.overrideReason}</p>}<small>Finalized {formatDate(finalResult.finalizedAt)}. The original engine result remains preserved above.</small></section>}

        <details className="match-resolution-audit"><summary>Calculation audit history · {displayedRecord?.attempts.length ?? 0} attempt{displayedRecord?.attempts.length === 1 ? "" : "s"}</summary>{displayedRecord?.attempts.map((attempt) => <article key={attempt.id}><strong>Attempt {attempt.number} · {attempt.status}</strong><span>{attempt.engineResult.winnerName} · {(attempt.engineResult.winnerProbability * 100).toFixed(1)}% · roll {attempt.engineResult.resultRoll.toFixed(4)}</span><small>{formatDate(attempt.generatedAt)} · fingerprint {attempt.setupFingerprint}{attempt.setupChangeReason ? ` · ${attempt.setupChangeReason}` : ""}</small></article>)}</details>
      </section>}
    </>}
  </section>;
}
