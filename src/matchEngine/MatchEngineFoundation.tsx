import { useEffect, useMemo, useState } from "react";
import {
  APPROACH_ALIASES,
  MATCH_AIMS,
  MATCH_APPROACHES,
  MATCH_IMPORTANCE_PROFILES,
  MENTAL_STATES,
  SOURCE_CONFLICTS,
} from "./catalog";
import {
  approachFormulaLabel,
  approachSlotsForDuration,
  calculateApproachRating,
  evaluatePace,
  evaluateStamina,
} from "./model";
import type { ApproachFormulaSource, MatchApproachId } from "./types";

type FoundationView = "approaches" | "aims" | "states" | "sources";

const durationExamples = [5, 6, 15, 16, 24, 25, 35];
const paceExamples = [0, 1, 2, 3, 4, 5, 6];
const staminaExamples = [0, 1, 2, 3];

export default function MatchEngineFoundation() {
  const [view, setView] = useState<FoundationView>("approaches");
  const [selectedId, setSelectedId] = useState<MatchApproachId>(MATCH_APPROACHES[0].id);
  const selected = MATCH_APPROACHES.find((approach) => approach.id === selectedId) ?? MATCH_APPROACHES[0];
  const [ratings, setRatings] = useState<Partial<Record<ApproachFormulaSource, number>>>(() =>
    Object.fromEntries(MATCH_APPROACHES[0].formula.map((item) => [item.skill, 75])) as Partial<Record<ApproachFormulaSource, number>>,
  );

  useEffect(() => {
    setRatings(Object.fromEntries(selected.formula.map((item) => [item.skill, 75])) as Partial<Record<ApproachFormulaSource, number>>);
  }, [selected.id]);

  const score = useMemo(() => calculateApproachRating(selected, ratings), [ratings, selected]);

  return <section className="match-engine-foundation">
    <header className="match-engine-toolbar">
      <div>
        <p className="eyebrow">NATIVE MATCH ENGINE · PHASE 4C1</p>
        <h2>Match Data Foundation</h2>
        <p>Canonical approaches, weighted skill formulas, match aims, pace, stamina, mental states, duration slots, and explicit source reconciliation.</p>
      </div>
      <div className="match-engine-metrics" aria-label="Match engine catalog summary">
        <div><span>Canonical approaches</span><strong>{MATCH_APPROACHES.length}</strong></div>
        <div><span>Match aims</span><strong>{MATCH_AIMS.length}</strong></div>
        <div><span>Mental states</span><strong>{MENTAL_STATES.length}</strong></div>
        <div><span>Unmapped legacy names</span><strong>{APPROACH_ALIASES.filter((item) => item.status === "legacy-unmapped").length}</strong></div>
      </div>
    </header>

    <nav className="match-engine-tabs" aria-label="Match engine foundation sections">
      <button type="button" className={view === "approaches" ? "active" : ""} onClick={() => setView("approaches")}>Approaches</button>
      <button type="button" className={view === "aims" ? "active" : ""} onClick={() => setView("aims")}>Match Aims</button>
      <button type="button" className={view === "states" ? "active" : ""} onClick={() => setView("states")}>Pace, Stamina & Mental State</button>
      <button type="button" className={view === "sources" ? "active" : ""} onClick={() => setView("sources")}>Source Reconciliation</button>
    </nav>

    {view === "approaches" && <div className="match-engine-approach-layout">
      <aside className="match-engine-approach-list" aria-label="Canonical match approaches">
        {MATCH_APPROACHES.map((approach) => <button key={approach.id} type="button" className={approach.id === selected.id ? "selected" : ""} onClick={() => setSelectedId(approach.id)}>
          <strong>{approach.name}</strong>
          <span>Pace {approach.pace} · Stamina {approach.staminaCost}</span>
        </button>)}
      </aside>

      <div className="match-engine-detail-stack">
        <section className="match-engine-panel approach-inspector">
          <header>
            <div><p className="eyebrow">APPROACH FORMULA INSPECTOR</p><h3>{selected.name}</h3><p>{selected.summary}</p></div>
            <div className="approach-score"><span>Calculated rating</span><strong>{score.toFixed(2)}</strong></div>
          </header>
          <div className="approach-facts">
            <div><span>Approach pace</span><strong>{selected.pace}</strong></div>
            <div><span>Stamina cost</span><strong>{selected.staminaCost}</strong></div>
            <div><span>Source names</span><strong>{selected.sourceNames.join(" / ")}</strong></div>
          </div>
          <p className="formula-line">{approachFormulaLabel(selected)}</p>
          <div className="approach-formula-grid">
            {selected.formula.map((item) => <label className="field" key={item.skill}>
              <span>{item.skill} rating · {(item.weight * 100).toFixed(0)}%</span>
              <input
                aria-label={`${item.skill} rating`}
                type="number"
                min={0}
                max={100}
                value={ratings[item.skill] ?? 0}
                onChange={(event) => setRatings((current) => ({ ...current, [item.skill]: Math.max(0, Math.min(100, Number(event.target.value) || 0)) }))}
              />
            </label>)}
          </div>
          {selected.narrative ? <div className="approach-narrative-preview">
            <h4>Existing narrative phrase library</h4>
            <p><strong>Style:</strong> {selected.narrative.styleSummary}</p>
            <p><strong>Offense:</strong> {selected.narrative.offensePhrase}</p>
            <p><strong>Selling:</strong> {selected.narrative.sellingPhrase}</p>
            <p><strong>Finish:</strong> {selected.narrative.finishPhrase}</p>
          </div> : <div className="source-warning"><strong>Narrative phrases not supplied</strong><span>The uploaded phrase workbook does not contain a matching row for this approach. Nothing has been invented.</span></div>}
          {selected.sourceNotes.map((note) => <p className="source-note" key={note}>{note}</p>)}
        </section>

        <section className="match-engine-panel">
          <header><div><p className="eyebrow">APPROACH SLOTS</p><h3>Approved duration boundaries</h3></div></header>
          <div className="duration-rule-grid">
            <div><strong>5 minutes or less</strong><span>1 approach per wrestler</span></div>
            <div><strong>6–15 minutes</strong><span>2 approaches per wrestler</span></div>
            <div><strong>16–24 minutes</strong><span>3 approaches per wrestler</span></div>
            <div><strong>25 minutes or longer</strong><span>4 approaches per wrestler</span></div>
          </div>
          <div className="boundary-checks" aria-label="Duration boundary examples">
            {durationExamples.map((duration) => <span key={duration}>{duration} min → <b>{approachSlotsForDuration(duration)}</b></span>)}
          </div>
        </section>
      </div>
    </div>}

    {view === "aims" && <section className="match-engine-panel">
      <header><div><p className="eyebrow">MATCH AIM CATALOG</p><h3>Ideal pace and wrestler-style compatibility</h3><p>Open-pace aims use pace 0 and do not impose a pacing penalty.</p></div></header>
      <div className="match-aim-table" role="table" aria-label="Match aim catalog">
        <div className="match-aim-row match-aim-row--header" role="row"><span>Aim</span><span>Style</span><span>Ideal pace</span><span>Best fit</span><span>Clashes</span></div>
        {MATCH_AIMS.map((aim) => <div className="match-aim-row" role="row" key={aim.id}>
          <strong>{aim.name}</strong><span>{aim.style}</span><b>{aim.idealPace}</b><span>{aim.bestFitStyles.join(", ") || "Not supplied"}</span><span>{aim.clashStyles.join(", ") || "Not supplied"}</span>
        </div>)}
      </div>
    </section>}

    {view === "states" && <div className="match-engine-state-grid">
      <section className="match-engine-panel">
        <header><div><p className="eyebrow">MENTAL STATE</p><h3>Performance modifier and score bands</h3></div></header>
        <div className="state-list">
          {MENTAL_STATES.map((state) => <div key={state.id}><strong>{state.name}</strong><span>{state.minimumScore === null ? "Below 40" : `${state.minimumScore}+ score`}</span><b>{state.modifier > 0 ? "+" : ""}{state.modifier}</b></div>)}
        </div>
        <p className="source-note">Ordinary form centers on Neutral. Health, consistency, experience, and overall make modest baseline adjustments; nightly luck creates normal variation, while Hot Night and Off Night require a rare swing.</p>
      </section>
      <section className="match-engine-panel">
        <header><div><p className="eyebrow">PACE RESULT</p><h3>Distance from the match aim</h3></div></header>
        <div className="state-list">
          {paceExamples.map((difference) => {
            const result = evaluatePace(6, 6 - difference);
            return <div key={difference}><strong>{result.status}</strong><span>{difference === 0 ? "Exact ideal pace" : `${difference} pace point${difference === 1 ? "" : "s"} away`}</span><b>{result.modifier > 0 ? "+" : ""}{result.modifier}</b></div>;
          })}
          <div><strong>OPEN PACE</strong><span>Match aim pace is 0</span><b>0</b></div>
        </div>
      </section>
      <section className="match-engine-panel">
        <header><div><p className="eyebrow">STAMINA RESULT</p><h3>Cost beyond available stamina</h3></div></header>
        <div className="state-list">
          {staminaExamples.map((over) => {
            const result = evaluateStamina(6 + over, 6);
            return <div key={over}><strong>{result.status}</strong><span>{over === 0 ? "At or under budget" : `${over} stamina over budget`}</span><b>{result.modifier > 0 ? "+" : ""}{result.modifier}</b></div>;
          })}
        </div>
      </section>
    </div>}

    {view === "sources" && <div className="match-engine-source-grid">
      <section className="match-engine-panel">
        <header><div><p className="eyebrow">APPROACH NAME MIGRATION</p><h3>Aliases and unresolved legacy records</h3></div></header>
        <div className="source-record-list">
          {APPROACH_ALIASES.map((record) => <article key={record.sourceName} className={`source-record source-record--${record.status}`}>
            <div><strong>{record.sourceName}</strong><span>{record.status}</span></div>
            <p>{record.canonicalId ? `Canonical ID: ${record.canonicalId}` : "No canonical approach assigned"}</p>
            <small>{record.note}</small>
          </article>)}
        </div>
      </section>
      <section className="match-engine-panel">
        <header><div><p className="eyebrow">SOURCE CONFLICTS</p><h3>Explicit decisions instead of silent cleanup</h3></div></header>
        <div className="source-record-list">
          {SOURCE_CONFLICTS.map((record) => <article className="source-record source-record--conflict" key={record.id}>
            <div><strong>{record.area}</strong><span>Canonical: {record.canonicalValue}</span></div>
            <p>{record.sourceValues.join(" · ")}</p>
            <small>{record.resolution}</small>
          </article>)}
        </div>
      </section>
      <section className="match-engine-panel match-engine-panel--wide">
        <header><div><p className="eyebrow">LEGACY MATCH IMPORTANCE PROFILES</p><h3>Preserved for workbook parity</h3><p>The source approach count remains visible, while the new engine uses duration-based slots.</p></div></header>
        <div className="importance-grid">
          {MATCH_IMPORTANCE_PROFILES.map((profile) => <article key={profile.name}>
            <strong>{profile.name}</strong>
            <span>{profile.sourceDurationBand}</span>
            <small>Source approaches: {profile.sourceApproachCount} · In-ring {(profile.inRingWeight * 100).toFixed(0)}% · Booking {(profile.bookingWeight * 100).toFixed(0)}%</small>
          </article>)}
        </div>
      </section>
    </div>}
  </section>;
}
