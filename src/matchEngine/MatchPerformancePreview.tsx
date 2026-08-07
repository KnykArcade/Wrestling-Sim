import { useEffect, useMemo, useState } from "react";
import { CALCULATION_SYSTEM_VERSION } from "../calculations/foundation";
import { calculateLiveMatchAudience, calculateMatchAnticipation } from "../crowd/model";
import type { PlannedSegment, PlannedWorkerReference } from "../planner/types";
import { advisoryStarRating, generateMatchPerformancePreview, formatStarRating, performancePreviewInputFingerprint, resolveMatchFormat, resolveMatchImportance } from "./performance";
import { loadActiveStartingUniverse, loadStartingUniverseState } from "../startingUniverse/storage";
import type { StartingUniverseRecord } from "../startingUniverse/types";
import { normalizeApproachName, workerProfileKey } from "./model";
import type {
  MatchEngineProfile,
  MatchEngineUniverse,
  MatchOutcomeAuthority,
  MatchPerformanceSettings,
  MatchWorkerApproachPlan,
} from "./types";

function isLikelyCompetitor(worker: PlannedWorkerReference): boolean {
  const role = worker.role.trim().toLowerCase();
  if (!role) return true;
  return !["manager", "referee", "announcer", "commentator", "road agent", "cornerman"].some((term) => role.includes(term));
}

function authorityLabel(authority: MatchOutcomeAuthority): string {
  if (authority === "booker-selected") return "Booker-selected winner";
  if (authority === "competitive-preview") return "Optional competitive preview";
  return "TEW authoritative";
}

function mentalClass(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "-");
}

export default function MatchPerformancePreviewEditor({
  segment,
  universe,
  projectedCrowdBefore,
  cardSegments,
  onChange,
}: {
  segment: PlannedSegment;
  universe: MatchEngineUniverse;
  projectedCrowdBefore: number;
  cardSegments: PlannedSegment[];
  onChange: (segment: PlannedSegment) => void;
}) {
  const [startingUniverse, setStartingUniverse] = useState<StartingUniverseRecord | null>(null);
  const [sourceReady, setSourceReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadActiveStartingUniverse(loadStartingUniverseState(window.localStorage)).then((record) => {
      if (alive) { setStartingUniverse(record); setSourceReady(true); }
    }).catch(() => {
      if (alive) setSourceReady(true);
    });
    return () => { alive = false; };
  }, []);
  const competitors = useMemo(() => segment.workers.filter(isLikelyCompetitor), [segment.workers]);
  const readyWorkers = competitors.map((worker) => {
    const key = workerProfileKey(worker);
    const profile = universe.profiles.find((item) => item.workerKey === key) ?? null;
    const plan = segment.matchApproachSetup.workerPlans.find((item) => item.workerKey === key) ?? null;
    return { worker, profile, plan };
  });
  const incompleteWorkers = readyWorkers.filter((item) => !item.profile || !item.plan || item.plan.selectedApproachIds.length === 0);
  const canGenerate = sourceReady && readyWorkers.length > 0 && incompleteWorkers.length === 0;
  const settings = segment.matchApproachSetup.performanceSettings;
  const previewWorkers = readyWorkers.filter((item): item is typeof item & { profile: MatchEngineProfile; plan: MatchWorkerApproachPlan } => Boolean(item.profile && item.plan)).map((item) => ({
    profile: item.profile,
    plan: item.plan,
    workbookMetrics: startingUniverse?.review.roster.find((decision) => decision.workerId === item.worker.id)?.workbookMetrics ?? null,
    teamId: normalizeApproachName(item.worker.side) || item.profile.workerKey,
    teamName: (normalizeApproachName(item.worker.side)
      ? competitors.filter((candidate) => normalizeApproachName(candidate.side) === normalizeApproachName(item.worker.side))
      : [item.worker]).map((candidate) => candidate.name).join(" & ") || item.profile.workerName,
  }));
  const importance = resolveMatchImportance(segment.matchApproachSetup.performanceSettings.importance, segment, cardSegments.length ? cardSegments : [segment]);
  const format = resolveMatchFormat(segment);
  const storedPreview = segment.matchApproachSetup.performancePreview;
  const expectedFingerprint = canGenerate ? performancePreviewInputFingerprint({
    workers: previewWorkers,
    aimId: segment.matchApproachSetup.matchAimId,
    durationMinutes: segment.durationMinutes,
    approachLimit: segment.matchApproachSetup.approachLimit,
    plannedWinner: segment.plannedWinner,
    settings,
    importance,
    matchType: segment.matchType,
    format,
    eliminationRules: format === "Elimination" || format === "Battle Royal",
  }) : "";
  const preview = storedPreview?.calculationVersion === CALCULATION_SYSTEM_VERSION && storedPreview.inputFingerprint === expectedFingerprint ? storedPreview : null;
  useEffect(() => {
    if (!sourceReady || !storedPreview || preview) return;
    onChange({ ...segment, matchApproachSetup: { ...segment.matchApproachSetup, performancePreview: null, updatedAt: new Date().toISOString() } });
  }, [sourceReady, storedPreview?.id, expectedFingerprint]);
  const anticipation = calculateMatchAnticipation({
    profiles: previewWorkers.map((worker) => worker.profile),
    plans: previewWorkers.map((worker) => worker.plan),
    aimId: segment.matchApproachSetup.matchAimId,
  });
  const projectedAudience = preview ? calculateLiveMatchAudience(preview.matchScore, anticipation.score, projectedCrowdBefore) : null;

  function updateSettings(patch: Partial<MatchPerformanceSettings>): void {
    onChange({
      ...segment,
      matchApproachSetup: {
        ...segment.matchApproachSetup,
        performanceSettings: { ...settings, ...patch },
        performancePreview: null,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  function generate(reuseSeed: boolean): void {
    if (!canGenerate) return;
    const result = generateMatchPerformancePreview({
      workers: previewWorkers,
      aimId: segment.matchApproachSetup.matchAimId,
      durationMinutes: segment.durationMinutes,
      approachLimit: segment.matchApproachSetup.approachLimit,
      plannedWinner: segment.plannedWinner,
      settings,
      importance,
      matchType: segment.matchType,
      format,
      eliminationRules: format === "Elimination" || format === "Battle Royal",
      seed: reuseSeed ? preview?.seed : undefined,
    });
    onChange({
      ...segment,
      matchApproachSetup: {
        ...segment.matchApproachSetup,
        performancePreview: result,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  return <section className="match-performance-preview" aria-label="Advisory match performance preview">
    <header className="match-performance-preview__header">
      <div>
        <p className="eyebrow">MATCH RESULT / RECAP</p>
        <h4>Performance, crowd reaction, and final match result</h4>
        <p>This is a projected pre-live result using the expected crowd at this point on the card. The official rating is finalized with actual incoming crowd heat.</p>
      </div>
      <div className="match-performance-actions">
        <button className="primary-button" type="button" disabled={!canGenerate} onClick={() => generate(false)}>Roll New Night</button>
        <button className="secondary-button" type="button" disabled={!canGenerate || !preview} onClick={() => generate(true)}>Recalculate Same Night</button>
      </div>
    </header>

    <div className="match-performance-settings">
      <label className="field"><span>Result authority</span><select aria-label="Performance preview authority" value={settings.authority} onChange={(event) => updateSettings({ authority: event.target.value as MatchOutcomeAuthority })}><option value="tew-authoritative">TEW authoritative — no winner selected here</option><option value="booker-selected">Booker-selected winner remains fixed</option><option value="competitive-preview">Optional competitive winner preview</option></select></label>
      <label className="field"><span>Night volatility (1–10)</span><input aria-label="Performance preview volatility" type="number" min={1} max={10} value={settings.volatility} onChange={(event) => updateSettings({ volatility: Math.max(1, Math.min(10, Number(event.target.value) || 1)) })} /></label>
      <label className="field"><span>Booking influence (0–10)</span><input aria-label="Performance preview booking influence" type="number" min={0} max={10} disabled={settings.authority !== "competitive-preview"} value={settings.bookingInfluence} onChange={(event) => updateSettings({ bookingInfluence: Math.max(0, Math.min(10, Number(event.target.value) || 0)) })} /></label>
      <label className="field"><span>Importance</span><select aria-label="Performance preview importance" value={settings.importance} onChange={(event) => updateSettings({ importance: event.target.value as MatchPerformanceSettings["importance"] })}><option>Auto</option><option>Television</option><option>Feature</option><option>Main Event</option><option>Championship</option><option>Tournament</option></select><small>Applied as {importance}</small></label>
      <label className="field"><span>Chemistry (-10 to +10)</span><input aria-label="Performance preview chemistry" type="number" min={-10} max={10} value={settings.chemistry} onChange={(event) => updateSettings({ chemistry: Math.max(-10, Math.min(10, Number(event.target.value) || 0)) })} /></label>
      <div className="performance-authority-card"><span>Current mode</span><strong>{authorityLabel(settings.authority)}</strong><small>{settings.authority === "tew-authoritative" ? "The preview will not name a winner." : settings.authority === "booker-selected" ? "The planned winner stays fixed." : "A projected winner is advisory only."}</small></div>
    </div>

    {!canGenerate && <div className="match-performance-warning"><strong>Preview needs complete match strategy</strong><span>{incompleteWorkers.length > 0 ? `Create a match profile and select at least one approach for: ${incompleteWorkers.map((item) => item.worker.name).join(", ")}.` : "Add at least one competitor to the match."}</span></div>}

    {preview && projectedAudience ? <div className="match-performance-results">
      <section className="match-performance-scorecard">
        <div><span>Projected in-ring performance</span><strong>{preview.matchScore.toFixed(1)}</strong><small>Wrestler execution before the crowd</small></div>
        <div><span>Crowd anticipation</span><strong>{anticipation.score.toFixed(1)}</strong><small>{anticipation.label} before the bell</small></div>
        <div><span>Projected crowd reaction</span><strong>{projectedAudience.crowdResponse.toFixed(1)}</strong><small>Expectation adjustment {projectedAudience.expectationAdjustment >= 0 ? "+" : ""}{projectedAudience.expectationAdjustment.toFixed(1)}</small></div>
        <div><span>Projected final rating</span><strong>{projectedAudience.finalRating.toFixed(1)} · {formatStarRating(advisoryStarRating(projectedAudience.finalRating))}</strong><small>60% performance · 40% crowd reaction</small></div>
        <div><span>Performance leader</span><strong>{preview.performanceLeaderName}</strong><small>Best projected individual night</small></div>
        <div><span>{preview.authority === "tew-authoritative" ? "Winner" : "Projected winner"}</span><strong>{preview.authority === "tew-authoritative" ? "Determined in TEW" : preview.projectedWinnerName || "Not available"}</strong><small>{preview.authority === "competitive-preview" && preview.confidence ? `${preview.confidence.toFixed(1)}% advisory confidence` : authorityLabel(preview.authority)}</small></div>
      </section>

      <div className="match-performance-crowd-path" aria-label="Projected crowd result"><strong>Projected Crowd Heat {projectedAudience.crowdBefore.toFixed(1)} {projectedAudience.crowdBeforeLabel} → {projectedAudience.crowdAfter.toFixed(1)} {projectedAudience.crowdAfterLabel}</strong><span>Performance {preview.matchScore.toFixed(1)} · Crowd Reaction {projectedAudience.crowdResponse.toFixed(1)} · Final Rating {projectedAudience.finalRating.toFixed(1)}</span></div>

      <p className="match-performance-summary">{preview.summary}</p>

      <div className="match-performance-worker-grid">
        {preview.workerResults.map((result) => <article className="match-performance-worker" key={result.workerKey} data-performance-worker={result.workerKey}>
          <header><div><h5>{result.workerName}</h5><span className={`mental-state mental-state--${mentalClass(result.mentalStateName)}`}>{result.mentalStateName}</span></div><strong>{result.performanceScore.toFixed(1)}</strong></header>
          <div className="match-performance-worker-metrics">
            <div><span>Approach rating</span><b>{result.averageApproachRating.toFixed(1)}</b></div>
            <div><span>Execution</span><b>{result.approachExecution.toFixed(1)}</b></div>
            <div><span>Presentation</span><b>{result.presentationScore.toFixed(1)}</b></div>
            <div><span>Mental score</span><b>{result.mentalStateScore.toFixed(1)}</b></div>
            <div><span>Pace</span><b>{result.actualPace === undefined ? result.paceStatus : `Pace ${result.actualPace} · ${result.paceStatus}`}</b></div>
            <div><span>Stamina</span><b>{result.staminaStatus}</b></div>
          </div>
          <div className="match-performance-variance"><span>Mental base {result.mentalBase.toFixed(1)}</span><span>Luck {result.luck >= 0 ? "+" : ""}{result.luck.toFixed(1)}</span><span>Rare swing {result.swing >= 0 ? "+" : ""}{result.swing}</span><span>Consistency variance {result.consistencyVariance >= 0 ? "+" : ""}{result.consistencyVariance.toFixed(1)}</span>{preview.authority === "competitive-preview" && <span>Win chance {(result.winProbability * 100).toFixed(1)}%</span>}</div>
        </article>)}
      </div>

      <footer className="match-performance-seed"><span>Night seed: {preview.seed}</span><span>Generated {preview.generatedAt ? new Date(preview.generatedAt).toLocaleString() : "now"}</span></footer>
    </div> : <div className="match-performance-empty">No advisory preview has been generated for this match. The selected approaches remain available for TEW handoff without generating one.</div>}

    <footer className="match-approach-boundary">
      <strong>Phase 4C3 boundary</strong>
      <span>This projection uses the same crowd formula as the Live Card. Actual incoming crowd heat finalizes the official stored result when the match runs.</span>
    </footer>
  </section>;
}
