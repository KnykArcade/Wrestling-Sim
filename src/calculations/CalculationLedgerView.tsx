import type { MatchAnticipation } from "../crowd/types";
import type { MatchResolutionAttempt } from "../matchResolution/types";
import { CALCULATION_FORMULAS } from "./foundation";
import type { CalculationLedgerStage } from "./foundation";

function formatNumber(value: number, places = 3): string {
  const fixed = value.toFixed(places);
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

function signed(value: number, places = 3): string {
  return `${value > 0 ? "+" : ""}${formatNumber(value, places)}`;
}

function capLabel(stage: CalculationLedgerStage): string {
  if (stage.capMinimum === null && stage.capMaximum === null) return "No cap";
  if (stage.capMinimum === null) return `Maximum ${stage.capMaximum}`;
  if (stage.capMaximum === null) return `Minimum ${stage.capMinimum}`;
  return `${stage.capMinimum}–${stage.capMaximum}`;
}

function CalculationStage({ stage }: { stage: CalculationLedgerStage }) {
  return <article className="calculation-stage" data-formula-id={stage.formulaId}>
    <header><div><strong>{stage.label}</strong><span>{stage.formulaId}</span></div><b>{formatNumber(stage.result, stage.roundingPlaces)}</b></header>
    <p>{stage.formula}</p>
    <div className="calculation-stage-table" role="table" aria-label={`${stage.label} exact inputs`}>
      <div className="calculation-stage-row calculation-stage-row--header" role="row"><span>Input or modifier</span><span>Value</span><span>Weight</span><span>Contribution</span></div>
      {stage.terms.map((term) => <div className="calculation-stage-row" role="row" key={term.id} title={term.detail || undefined}><span><b>{term.label}</b>{term.detail && <small>{term.detail}</small>}</span><span>{formatNumber(term.input)}</span><span>× {formatNumber(term.weight)}</span><span>{signed(term.contribution)}</span></div>)}
    </div>
    <footer><span>Raw subtotal <b>{formatNumber(stage.rawSubtotal, 4)}</b></span><span>Cap <b>{capLabel(stage)}{stage.capApplied ? " applied" : ""}</b></span><span>Round <b>nearest {stage.roundingPlaces} decimal{stage.roundingPlaces === 1 ? "" : "s"}</b></span><span>Result <b>{formatNumber(stage.result, stage.roundingPlaces)}</b></span></footer>
    {stage.notes.map((note) => <small className="calculation-stage-note" key={note}>{note}</small>)}
  </article>;
}

function AnticipationLedger({ anticipation }: { anticipation: MatchAnticipation }) {
  const ledger = anticipation.calculationLedger;
  if (!ledger) return null;
  return <details className="calculation-ledger-group"><summary>Anticipation · {formatNumber(anticipation.score, 1)}</summary><div className="calculation-stage-stack"><CalculationStage stage={ledger.popularity} /><CalculationStage stage={ledger.momentum} /><CalculationStage stage={ledger.skills} /><CalculationStage stage={ledger.styleAppeal} /><CalculationStage stage={ledger.total} /></div></details>;
}

export default function CalculationLedgerView({ attempt, anticipation }: { attempt: MatchResolutionAttempt; anticipation?: MatchAnticipation }) {
  const ledger = attempt.calculationLedger;
  const audience = attempt.finalResult?.audience;
  const averageRecommendation = attempt.workerResults.length
    ? attempt.workerResults.reduce((total, worker) => total + (worker.approachScores.length ? worker.approachScores.reduce((sum, approach) => sum + approach.total, 0) / worker.approachScores.length : 0), 0) / attempt.workerResults.length
    : 0;
  const averagePerformance = attempt.workerResults.length ? attempt.workerResults.reduce((total, worker) => total + worker.performanceScore, 0) / attempt.workerResults.length : 0;
  const winner = attempt.workerResults.find((worker) => worker.workerKey === attempt.engineResult.winnerKey) ?? attempt.workerResults[0];

  return <section className="calculation-ledger" aria-label="Complete match calculation ledger">
    <header><div><p className="eyebrow">CALCULATION LEDGER</p><h3>Every score stays in its own lane</h3><p>Recommendation selects approaches. Performance rates execution. Competitive chooses the result. Crowd response is applied later to the raw match score.</p></div><span>{attempt.calculationVersion}</span></header>
    <div className="calculation-lanes">
      <article><span>Recommendation</span><strong>{formatNumber(averageRecommendation, 1)}</strong><small>Average selected-approach fit; selection only</small></article>
      <article><span>Performance</span><strong>{formatNumber(averagePerformance, 1)}</strong><small>Average individual in-ring performance</small></article>
      <article><span>Competitive</span><strong>{winner ? formatNumber(winner.competitiveScore, 1) : "—"}</strong><small>{winner?.workerName ?? "Winner not available"}</small></article>
      <article><span>Raw match</span><strong>{formatNumber(attempt.engineResult.matchScore, 1)}</strong><small>In-ring quality before live crowd · {attempt.engineResult.starRating}★</small></article>
      <article><span>Crowd response</span><strong>{audience ? formatNumber(audience.crowdResponse, 1) : "Pending"}</strong><small>{audience ? `Incoming heat ${formatNumber(audience.crowdBefore, 1)}` : "Calculated when locked live"}</small></article>
      <article><span>Final rating</span><strong>{audience ? formatNumber(audience.finalRating, 1) : "Pending"}</strong><small>{audience ? `Official crowd-adjusted score · ${attempt.finalResult?.starRating ?? 0}★` : "Raw match score is not the final rating"}</small></article>
    </div>

    {!ledger ? <p className="calculation-ledger-legacy">This saved attempt predates Phase 6B20A. Its original result remains valid, but an exact term-by-term ledger is unavailable.</p> : <details className="calculation-ledger-details"><summary>Open full input, weight, bonus, penalty, cap, and rounding breakdown</summary>
      <div className="calculation-ledger-body">
        {attempt.workerResults.map((worker) => <details className="calculation-ledger-group" key={worker.workerKey}><summary>{worker.workerName} · recommendation, performance, and competitive scores</summary><div className="calculation-stage-stack">
          {worker.approachScores.map((approach) => approach.calculation && <CalculationStage key={approach.approachId} stage={approach.calculation} />)}
          {worker.calculationLedger && <><CalculationStage stage={worker.calculationLedger.approachPlan} /><CalculationStage stage={worker.calculationLedger.mentalBase} /><CalculationStage stage={worker.calculationLedger.mentalState} /><CalculationStage stage={worker.calculationLedger.approachExecution} /><CalculationStage stage={worker.calculationLedger.presentation} /><CalculationStage stage={worker.calculationLedger.performance} /><CalculationStage stage={worker.calculationLedger.competitive} /></>}
        </div></details>)}

        <details className="calculation-ledger-group" open><summary>Raw in-ring match score · {formatNumber(ledger.matchQuality.result, 1)}</summary><div className="calculation-stage-stack"><CalculationStage stage={ledger.matchQuality} /><p className="calculation-star-formula"><strong>{CALCULATION_FORMULAS.starRating.label}:</strong> {CALCULATION_FORMULAS.starRating.formula}. Raw display: {attempt.engineResult.starRating}★{audience ? `; official crowd-adjusted display: ${attempt.finalResult?.starRating ?? 0}★.` : "."}</p></div></details>
        <details className="calculation-ledger-group"><summary>Win probability and result roll</summary><div className="calculation-outcome"><p>{ledger.outcome.formula}</p><div className="calculation-outcome-meta"><span>Volatility <b>{formatNumber(ledger.outcome.volatility)}</b></span><span>Temperature <b>{formatNumber(ledger.outcome.temperature)}</b></span><span>Field minimum <b>{formatNumber(ledger.outcome.fieldMinimum)}</b></span><span>Weight total <b>{formatNumber(ledger.outcome.totalExponentialWeight)}</b></span></div>{ledger.outcome.entries.map((entry) => <article key={entry.key}><div><strong>{entry.label}</strong><small>{entry.memberScores.length > 1 ? `Member competitive scores ${entry.memberScores.map((score) => formatNumber(score, 1)).join(", ")} + team-size bonus ${entry.teamSizeBonus}` : `Competitive score ${formatNumber(entry.competitiveScore, 2)}`}</small></div><span>Above min <b>{formatNumber(entry.scoreAboveMinimum)}</b></span><span>Exp weight <b>{formatNumber(entry.exponentialWeight)}</b></span><em>{formatNumber(entry.probability * 100, 2)}%</em></article>)}<footer><span>Result roll <b>{formatNumber(ledger.outcome.resultRoll, 6)}</b></span><span>Selected <b>{ledger.outcome.selectedLabel}</b></span></footer>{ledger.outcome.notes.map((note) => <small key={note}>{note}</small>)}</div></details>

        {anticipation && <AnticipationLedger anticipation={anticipation} />}
        {audience?.calculationLedger && <details className="calculation-ledger-group" open><summary>Live crowd response and official final rating · {formatNumber(audience.finalRating, 1)}</summary><div className="calculation-stage-stack"><CalculationStage stage={audience.calculationLedger.expectationAdjustment} /><CalculationStage stage={audience.calculationLedger.crowdResponse} /><CalculationStage stage={audience.calculationLedger.finalRating} /><CalculationStage stage={audience.calculationLedger.crowdAfter} /></div></details>}
      </div>
    </details>}
  </section>;
}
