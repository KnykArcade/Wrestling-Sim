import { useMemo } from "react";
import { CALCULATION_SYSTEM_VERSION } from "../calculations/foundation";
import type { PlannedSegment, PlannedWorkerReference } from "../planner/types";
import { generateMatchPerformancePreview, formatStarRating, performancePreviewInputFingerprint } from "./performance";
import { workerProfileKey } from "./model";
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
  onChange,
}: {
  segment: PlannedSegment;
  universe: MatchEngineUniverse;
  onChange: (segment: PlannedSegment) => void;
}) {
  const competitors = useMemo(() => segment.workers.filter(isLikelyCompetitor), [segment.workers]);
  const readyWorkers = competitors.map((worker) => {
    const key = workerProfileKey(worker);
    const profile = universe.profiles.find((item) => item.workerKey === key) ?? null;
    const plan = segment.matchApproachSetup.workerPlans.find((item) => item.workerKey === key) ?? null;
    return { worker, profile, plan };
  });
  const incompleteWorkers = readyWorkers.filter((item) => !item.profile || !item.plan || item.plan.selectedApproachIds.length === 0);
  const canGenerate = readyWorkers.length > 0 && incompleteWorkers.length === 0;
  const settings = segment.matchApproachSetup.performanceSettings;
  const previewWorkers = readyWorkers.filter((item): item is typeof item & { profile: MatchEngineProfile; plan: MatchWorkerApproachPlan } => Boolean(item.profile && item.plan)).map((item) => ({ profile: item.profile, plan: item.plan }));
  const storedPreview = segment.matchApproachSetup.performancePreview;
  const expectedFingerprint = canGenerate ? performancePreviewInputFingerprint({
    workers: previewWorkers,
    aimId: segment.matchApproachSetup.matchAimId,
    durationMinutes: segment.durationMinutes,
    approachLimit: segment.matchApproachSetup.approachLimit,
    plannedWinner: segment.plannedWinner,
    settings,
  }) : "";
  const preview = storedPreview?.calculationVersion === CALCULATION_SYSTEM_VERSION && storedPreview.inputFingerprint === expectedFingerprint ? storedPreview : null;

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
        <h4>Performance, mental state, and match-quality result</h4>
        <p>This is a projected pre-live performance. The official rating is finalized when the match runs with its actual incoming crowd heat.</p>
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
      <div className="performance-authority-card"><span>Current mode</span><strong>{authorityLabel(settings.authority)}</strong><small>{settings.authority === "tew-authoritative" ? "The preview will not name a winner." : settings.authority === "booker-selected" ? "The planned winner stays fixed." : "A projected winner is advisory only."}</small></div>
    </div>

    {!canGenerate && <div className="match-performance-warning"><strong>Preview needs complete match strategy</strong><span>{incompleteWorkers.length > 0 ? `Create a match profile and select at least one approach for: ${incompleteWorkers.map((item) => item.worker.name).join(", ")}.` : "Add at least one competitor to the match."}</span></div>}

    {preview ? <div className="match-performance-results">
      <section className="match-performance-scorecard">
        <div><span>Projected in-ring performance</span><strong>{preview.matchScore.toFixed(1)}</strong><small>Before live crowd response</small></div>
        <div><span>Projected performance stars</span><strong>{formatStarRating(preview.starRating)}</strong><small>Official stars use the live final rating</small></div>
        <div><span>Performance leader</span><strong>{preview.performanceLeaderName}</strong><small>Best projected individual night</small></div>
        <div><span>{preview.authority === "tew-authoritative" ? "Winner" : "Projected winner"}</span><strong>{preview.authority === "tew-authoritative" ? "Determined in TEW" : preview.projectedWinnerName || "Not available"}</strong><small>{preview.authority === "competitive-preview" && preview.confidence ? `${preview.confidence.toFixed(1)}% advisory confidence` : authorityLabel(preview.authority)}</small></div>
      </section>

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
      <span>This forecast never becomes the official match rating. Live crowd response finalizes the stored result when the match runs.</span>
    </footer>
  </section>;
}
