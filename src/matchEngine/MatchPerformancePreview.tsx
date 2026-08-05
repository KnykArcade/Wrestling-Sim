import { useMemo } from "react";
import type { PlannedSegment, PlannedWorkerReference } from "../planner/types";
import { generateMatchPerformancePreview, formatStarRating } from "./performance";
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
  const preview = segment.matchApproachSetup.performancePreview;
  const settings = segment.matchApproachSetup.performanceSettings;

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
    const workers = readyWorkers.map((item) => ({
      profile: item.profile as MatchEngineProfile,
      plan: item.plan as MatchWorkerApproachPlan,
    }));
    const result = generateMatchPerformancePreview({
      workers,
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
        <p>The preview uses your selected approaches and tracker ratings. TEW remains the final authority for the actual match result and rating.</p>
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
        <div><span>Advisory match score</span><strong>{preview.matchScore.toFixed(1)}</strong><small>Tracker preview only</small></div>
        <div><span>Advisory star rating</span><strong>{formatStarRating(preview.starRating)}</strong><small>Does not replace TEW</small></div>
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
            <div><span>Pace</span><b>{result.paceStatus}</b></div>
            <div><span>Stamina</span><b>{result.staminaStatus}</b></div>
          </div>
          <div className="match-performance-variance"><span>Luck {result.luck >= 0 ? "+" : ""}{result.luck.toFixed(1)}</span><span>Rare swing {result.swing >= 0 ? "+" : ""}{result.swing}</span><span>Consistency variance {result.consistencyVariance >= 0 ? "+" : ""}{result.consistencyVariance.toFixed(1)}</span>{preview.authority === "competitive-preview" && <span>Win chance {(result.winProbability * 100).toFixed(1)}%</span>}</div>
        </article>)}
      </div>

      <footer className="match-performance-seed"><span>Night seed: {preview.seed}</span><span>Generated {preview.generatedAt ? new Date(preview.generatedAt).toLocaleString() : "now"}</span></footer>
    </div> : <div className="match-performance-empty">No advisory preview has been generated for this match. The selected approaches remain available for TEW handoff without generating one.</div>}

    <footer className="match-approach-boundary">
      <strong>Phase 4C3 boundary</strong>
      <span>This is an optional companion forecast. It never writes a winner or rating into TEW and never replaces TEW’s match engine.</span>
    </footer>
  </section>;
}
