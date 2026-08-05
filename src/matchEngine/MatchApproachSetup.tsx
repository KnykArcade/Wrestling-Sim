import { Fragment, useMemo, useState } from "react";
import type { PlannedSegment, PlannedWorkerReference } from "../planner/types";
import { MATCH_AIMS, MATCH_APPROACHES } from "./catalog";
import MatchPerformancePreviewEditor from "./MatchPerformancePreview";
import {
  approachSlotsForDuration,
  calculateApproachRating,
  calculateProfileStaminaRating,
  chooseApproachPlan,
  createMatchEngineProfile,
  evaluateApproachPlan,
  evaluatePace,
  getApproach,
  profileStaminaCapacity,
  profileApproachRatingInputs,
  scoreApproachCandidate,
  workerProfileKey,
} from "./model";
import { MATCH_ENGINE_SKILLS, WRESTLER_STYLES } from "./profileCatalog";
import type {
  MatchApproachId,
  MatchEngineProfile,
  MatchEngineUniverse,
  MatchWorkerApproachPlan,
  WrestlerSkill,
} from "./types";

function isLikelyCompetitor(worker: PlannedWorkerReference): boolean {
  const role = worker.role.trim().toLowerCase();
  if (!role) return true;
  return !["manager", "referee", "announcer", "commentator", "road agent", "cornerman"].some((term) => role.includes(term));
}

function planForWorker(segment: PlannedSegment, worker: PlannedWorkerReference): MatchWorkerApproachPlan {
  const workerKey = workerProfileKey(worker);
  return segment.matchApproachSetup.workerPlans.find((plan) => plan.workerKey === workerKey) ?? {
    workerKey,
    workerName: worker.name,
    selectedApproachIds: [],
    lockedApproachIds: [],
    mode: "AI",
    generatedAt: "",
  };
}

function profileForWorker(universe: MatchEngineUniverse, worker: PlannedWorkerReference): MatchEngineProfile | null {
  const key = workerProfileKey(worker);
  return universe.profiles.find((profile) => profile.workerKey === key) ?? null;
}

function ratingLabel(value: number): string {
  if (value >= 85) return "Elite";
  if (value >= 75) return "Strong";
  if (value >= 65) return "Capable";
  if (value >= 50) return "Developing";
  return "Weak";
}

function resultTone(value: number): string {
  if (value >= 75) return "strong";
  if (value >= 55) return "balanced";
  return "risk";
}

export default function MatchApproachSetupEditor({
  segment,
  universe,
  onUniverseChange,
  onChange,
}: {
  segment: PlannedSegment;
  universe: MatchEngineUniverse;
  onUniverseChange: (universe: MatchEngineUniverse) => void;
  onChange: (segment: PlannedSegment) => void;
}) {
  const [editingProfileKey, setEditingProfileKey] = useState("");
  const competitors = useMemo(() => segment.workers.filter(isLikelyCompetitor), [segment.workers]);
  const competitorSides = useMemo(() => {
    const groups = new Map<string, PlannedWorkerReference[]>();
    competitors.forEach((worker, index) => {
      const side = worker.side.trim() || `Side ${index + 1}`;
      groups.set(side, [...(groups.get(side) ?? []), worker]);
    });
    return [...groups.entries()];
  }, [competitors]);
  const recommendedSlots = approachSlotsForDuration(segment.durationMinutes);
  const slots = segment.matchApproachSetup.approachLimit ?? recommendedSlots;
  const aim = MATCH_AIMS.find((item) => item.id === segment.matchApproachSetup.matchAimId) ?? MATCH_AIMS[0];

  function updateSetup(patch: Partial<PlannedSegment["matchApproachSetup"]>): void {
    onChange({
      ...segment,
      matchApproachSetup: {
        ...segment.matchApproachSetup,
        ...patch,
        performancePreview: patch.performancePreview === undefined ? null : patch.performancePreview,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  function savePlan(worker: PlannedWorkerReference, plan: MatchWorkerApproachPlan): void {
    const workerKey = workerProfileKey(worker);
    const nextPlan = { ...plan, workerKey, workerName: worker.name };
    const exists = segment.matchApproachSetup.workerPlans.some((item) => item.workerKey === workerKey);
    updateSetup({
      workerPlans: exists
        ? segment.matchApproachSetup.workerPlans.map((item) => item.workerKey === workerKey ? nextPlan : item)
        : [...segment.matchApproachSetup.workerPlans, nextPlan],
    });
  }

  function upsertProfile(profile: MatchEngineProfile): void {
    const exists = universe.profiles.some((item) => item.workerKey === profile.workerKey);
    onUniverseChange({
      profiles: exists
        ? universe.profiles.map((item) => item.workerKey === profile.workerKey ? { ...profile, updatedAt: new Date().toISOString() } : item)
        : [...universe.profiles, profile],
    });
    if (segment.matchApproachSetup.performancePreview) updateSetup({ performancePreview: null });
  }

  function ensureProfile(worker: PlannedWorkerReference): MatchEngineProfile {
    const existing = profileForWorker(universe, worker);
    if (existing) return existing;
    const profile = createMatchEngineProfile(worker);
    upsertProfile(profile);
    return profile;
  }

  function runAI(worker: PlannedWorkerReference): void {
    const profile = ensureProfile(worker);
    const current = planForWorker(segment, worker);
    const result = chooseApproachPlan(
      profile,
      segment.matchApproachSetup.matchAimId,
      segment.durationMinutes,
      current.lockedApproachIds,
      slots,
    );
    savePlan(worker, {
      ...current,
      selectedApproachIds: result.selectedApproachIds,
      lockedApproachIds: current.lockedApproachIds.filter((id) => result.selectedApproachIds.includes(id)),
      mode: "AI",
      generatedAt: new Date().toISOString(),
    });
  }

  function runAll(): void {
    let nextPlans = [...segment.matchApproachSetup.workerPlans];
    let nextProfiles = [...universe.profiles];
    for (const worker of competitors) {
      const workerKey = workerProfileKey(worker);
      let profile = nextProfiles.find((item) => item.workerKey === workerKey);
      if (!profile) {
        profile = createMatchEngineProfile(worker);
        nextProfiles.push(profile);
      }
      const current = nextPlans.find((item) => item.workerKey === workerKey) ?? planForWorker(segment, worker);
      const result = chooseApproachPlan(profile, segment.matchApproachSetup.matchAimId, segment.durationMinutes, current.lockedApproachIds, slots);
      const replacement: MatchWorkerApproachPlan = {
        ...current,
        workerKey,
        workerName: worker.name,
        selectedApproachIds: result.selectedApproachIds,
        lockedApproachIds: current.lockedApproachIds.filter((id) => result.selectedApproachIds.includes(id)),
        mode: "AI",
        generatedAt: new Date().toISOString(),
      };
      nextPlans = nextPlans.some((item) => item.workerKey === workerKey)
        ? nextPlans.map((item) => item.workerKey === workerKey ? replacement : item)
        : [...nextPlans, replacement];
    }
    onUniverseChange({ profiles: nextProfiles });
    updateSetup({ workerPlans: nextPlans });
  }

  function addManualApproach(worker: PlannedWorkerReference, approachId: MatchApproachId): void {
    ensureProfile(worker);
    const current = planForWorker(segment, worker);
    if (current.selectedApproachIds.includes(approachId) || current.selectedApproachIds.length >= slots) return;
    savePlan(worker, {
      ...current,
      selectedApproachIds: [...current.selectedApproachIds, approachId],
      mode: "Manual",
      generatedAt: "",
    });
  }

  function updateProfileNumber(profile: MatchEngineProfile, field: "overall" | "health" | "popularity" | "experience" | "fanReaction" | "gimmick", value: number): void {
    const max = field === "fanReaction" || field === "gimmick" ? 5 : 100;
    const min = field === "fanReaction" || field === "gimmick" ? 1 : 0;
    upsertProfile({ ...profile, [field]: Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)) });
  }

  const planResults = competitors.map((worker) => {
    const profile = profileForWorker(universe, worker);
    const plan = planForWorker(segment, worker);
    return profile ? evaluateApproachPlan(profile, aim.id, segment.durationMinutes, plan.selectedApproachIds, slots) : null;
  }).filter((result) => result !== null);
  const combinedPace = planResults.length > 0
    ? Math.round(planResults.reduce((sum, result) => sum + result.actualPace, 0) / planResults.length)
    : 0;
  const combinedPaceEvaluation = evaluatePace(aim.idealPace, combinedPace);

  return <section className="match-approach-setup" aria-label="Match approach setup">
    <header className="match-approach-setup__header">
      <div>
        <p className="eyebrow">TEW COMPANION MATCH SETUP</p>
        <h4>Match approaches and wrestler strategy</h4>
        <p>TEW remains the game. This tracker chooses and records the approaches that feed your Match Story, road-agent notes, and TEW handoff.</p>
      </div>
      <button className="primary-button" type="button" onClick={runAll} disabled={competitors.length === 0}>Run AI for All Competitors</button>
    </header>

    <div className="match-settings-heading"><p className="eyebrow">MATCH SETTINGS</p><strong>Set time, approach limits, aim, and pace before choosing strategies</strong></div>
    <div className="match-approach-controls">
      <label className="field"><span>Match aim</span><select aria-label="Match aim" value={aim.id} onChange={(event) => updateSetup({ matchAimId: event.target.value as PlannedSegment["matchApproachSetup"]["matchAimId"] })}>{MATCH_AIMS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div><span>Match time</span><strong>{segment.durationMinutes} minutes</strong></div>
      <label className="field"><span>Approach limit per wrestler</span><input aria-label="Approach limit per wrestler" type="number" min={1} max={8} value={slots} onChange={(event) => updateSetup({ approachLimit: Math.max(1, Math.min(8, Number(event.target.value) || recommendedSlots)) })} /><small>Recommended: {recommendedSlots}</small></label>
      <div><span>Ideal pace</span><strong>{aim.idealPace === 0 ? "Open" : aim.idealPace}</strong></div>
      <div className={`match-pace-result match-pace-result--${combinedPace && combinedPaceEvaluation.modifier < 0 ? "risk" : "balanced"}`}><span>Projected pace</span><strong>{combinedPace || "—"}</strong><small>{!combinedPace ? "Choose approaches" : combinedPaceEvaluation.status}</small></div>
    </div>

    {competitors.length === 0 ? <div className="match-approach-empty">
      Add the wrestlers to this match above. Managers, referees, announcers, and commentators are excluded from approach selection.
    </div> : <div className={`match-side-board match-side-board--${Math.min(competitorSides.length, 4)}`}>
      {competitorSides.map(([side, sideWorkers], sideIndex) => <Fragment key={side}>
        <section className="match-side-column">
          <header className="match-side-heading"><span>{side}</span><strong>{sideWorkers.map((worker) => worker.name).join(" & ")}</strong></header>
          {sideWorkers.map((worker) => {
        const key = workerProfileKey(worker);
        const profile = profileForWorker(universe, worker);
        const previewProfile = profile ?? createMatchEngineProfile(worker);
        const plan = planForWorker(segment, worker);
        const result = profile ? evaluateApproachPlan(profile, aim.id, segment.durationMinutes, plan.selectedApproachIds, slots) : null;
        const averageApproachRating = result?.candidateScores.length ? result.candidateScores.reduce((total, score) => total + score.rating, 0) / result.candidateScores.length : 0;
        const remainingApproaches = MATCH_APPROACHES.filter((approach) => !plan.selectedApproachIds.includes(approach.id));
        return <article className="match-competitor-card" key={key} data-match-worker={key}>
          <header>
            <div><h5>{worker.name}</h5><span>{worker.source === "tew" ? "Linked to TEW worker" : "Manual tracker worker"}</span></div>
            <div className="match-profile-actions">
              {!profile ? <button className="secondary-button compact-button" type="button" onClick={() => { const created = ensureProfile(worker); setEditingProfileKey(created.workerKey); }}>Create Match Profile</button> : <button className="secondary-button compact-button" type="button" onClick={() => setEditingProfileKey(editingProfileKey === key ? "" : key)}>{editingProfileKey === key ? "Close Ratings" : "Edit Ratings"}</button>}
              <button className="primary-button compact-button" type="button" onClick={() => runAI(worker)}>Run Approach AI</button>
            </div>
          </header>

          {profile ? <div className="match-profile-summary">
            <div><span>Style</span><strong>{WRESTLER_STYLES.find((style) => style.id === profile.styleId)?.name ?? "All-Rounder"}</strong></div>
            <div><span>Overall</span><strong>{profile.overall}</strong></div>
            <div><span>Stamina rating</span><strong>{calculateProfileStaminaRating(profile).toFixed(1)}</strong></div>
            <div><span>Available stamina</span><strong>{profileStaminaCapacity(profile)}</strong></div>
          </div> : <p className="match-profile-placeholder">Create the tracker-side match profile once, using ratings copied from TEW or your workbook. No TEW data is changed.</p>}

          {profile && editingProfileKey === key && <div className="match-profile-editor">
            <div className="match-profile-core-grid">
              <label className="field"><span>Wrestler style</span><select aria-label={`${worker.name} style`} value={profile.styleId} onChange={(event) => upsertProfile({ ...profile, styleId: event.target.value as MatchEngineProfile["styleId"] })}>{WRESTLER_STYLES.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select></label>
              <label className="field"><span>Overall</span><input aria-label={`${worker.name} overall rating`} type="number" min={0} max={100} value={profile.overall} onChange={(event) => updateProfileNumber(profile, "overall", Number(event.target.value))} /></label>
              <label className="field"><span>Health</span><input aria-label={`${worker.name} health rating`} type="number" min={0} max={100} value={profile.health} onChange={(event) => updateProfileNumber(profile, "health", Number(event.target.value))} /></label>
              <label className="field"><span>Popularity</span><input aria-label={`${worker.name} popularity rating`} type="number" min={0} max={100} value={profile.popularity} onChange={(event) => updateProfileNumber(profile, "popularity", Number(event.target.value))} /></label>
              <label className="field"><span>Experience</span><input aria-label={`${worker.name} experience rating`} type="number" min={0} max={100} value={profile.experience} onChange={(event) => updateProfileNumber(profile, "experience", Number(event.target.value))} /></label>
              <label className="field"><span>Fan reaction (1–5)</span><input aria-label={`${worker.name} fan reaction`} type="number" min={1} max={5} value={profile.fanReaction} onChange={(event) => updateProfileNumber(profile, "fanReaction", Number(event.target.value))} /></label>
              <label className="field"><span>Gimmick (1–5)</span><input aria-label={`${worker.name} gimmick rating`} type="number" min={1} max={5} value={profile.gimmick} onChange={(event) => updateProfileNumber(profile, "gimmick", Number(event.target.value))} /></label>
            </div>
            <div className="match-profile-preset-row">
              <span>Quick rating baseline</span>
              {[50, 60, 75].map((value) => <button key={value} type="button" onClick={() => upsertProfile({ ...profile, skills: Object.fromEntries(MATCH_ENGINE_SKILLS.map((skill) => [skill, value])) as Record<WrestlerSkill, number> })}>Set all {value}</button>)}
            </div>
            <div className="match-profile-skill-grid">
              {MATCH_ENGINE_SKILLS.map((skill) => <label className="field" key={skill}><span>{skill}</span><input aria-label={`${worker.name} ${skill} rating`} type="number" min={0} max={100} value={profile.skills[skill]} onChange={(event) => upsertProfile({ ...profile, skills: { ...profile.skills, [skill]: Math.max(0, Math.min(100, Number(event.target.value) || 0)) } })} /></label>)}
            </div>
            <label className="field"><span>Profile notes</span><textarea aria-label={`${worker.name} match profile notes`} rows={2} value={profile.notes} onChange={(event) => upsertProfile({ ...profile, notes: event.target.value })} /></label>
          </div>}

          <div className="selected-approach-heading">
            <div><strong>Selected approaches</strong><span>{plan.selectedApproachIds.length}/{slots} · {plan.mode}</span></div>
            {result && <div className={`strategy-status strategy-status--${result.stamina.status.toLowerCase()} strategy-status--tone-${resultTone(averageApproachRating)}`}><b>{Math.max(0, result.availableStamina - result.usedStamina)} stamina remaining</b><span>{result.usedStamina}/{result.availableStamina} used · {result.stamina.status} · Pace {result.actualPace} · Rating {averageApproachRating.toFixed(1)}</span></div>}
          </div>

          {plan.selectedApproachIds.length === 0 ? <p className="match-profile-placeholder">No approaches selected. Run the AI or add an approach manually.</p> : <div className="selected-approach-list">
            {plan.selectedApproachIds.map((approachId) => {
              const approach = getApproach(approachId)!;
              const score = profile ? scoreApproachCandidate(profile, aim.id, approach) : null;
              const approachRating = profile ? calculateApproachRating(approach, profileApproachRatingInputs(profile)) : null;
              return <div className={`selected-approach-row ${approachRating === null ? "" : `selected-approach-row--${resultTone(approachRating)}`}`} key={approachId}>
                <div><strong>{approach.name}</strong><span>{approach.summary}</span></div>
                <div className="selected-approach-numbers"><span>Rating <b>{approachRating?.toFixed(1) ?? "—"}</b></span><span>Cost <b>{approach.staminaCost}</b></span><span>Pace <b>{approach.pace}</b></span></div>
                <label className="approach-lock"><input type="checkbox" checked={plan.lockedApproachIds.includes(approachId)} onChange={(event) => savePlan(worker, { ...plan, lockedApproachIds: event.target.checked ? [...plan.lockedApproachIds, approachId] : plan.lockedApproachIds.filter((id) => id !== approachId) })} /><span>Lock</span></label>
                <button className="danger-button compact-button" type="button" aria-label={`Remove ${approach.name} from ${worker.name}`} onClick={() => savePlan(worker, { ...plan, selectedApproachIds: plan.selectedApproachIds.filter((id) => id !== approachId), lockedApproachIds: plan.lockedApproachIds.filter((id) => id !== approachId), mode: "Manual", generatedAt: "" })}>Remove</button>
                {score && <small title={score.reasons.join(" · ")}>{ratingLabel(score.rating)} · AI value {score.total.toFixed(1)}</small>}
              </div>;
            })}
          </div>}

          <details className="approach-selection-panel">
            <summary>{plan.selectedApproachIds.length >= slots ? "All approach slots filled" : `Choose an approach for ${worker.name}`}</summary>
            <div className="approach-candidate-list" aria-label={`Available approaches for ${worker.name}`}>
              {remainingApproaches.map((approach) => {
                const score = scoreApproachCandidate(previewProfile, aim.id, approach);
                return <article className={`approach-candidate approach-candidate--${resultTone(score.rating)}`} key={approach.id}>
                  <div className="approach-candidate__title"><strong>{approach.name}</strong><span className={`approach-quality approach-quality--${resultTone(score.rating)}`}>{ratingLabel(score.rating)}</span></div>
                  <details className="approach-candidate__details"><summary>More details</summary><p>{approach.summary}</p><p><b>Rating source:</b> {profile ? (profile.workerSource === "tew" ? "Imported or saved wrestler profile" : "Manually entered wrestler profile") : "Estimated baseline until a wrestler profile is saved"}.</p><p><b>Rating formula:</b> {approach.formula.map((item) => `${item.skill} ${Math.round(item.weight * 100)}%`).join(" + ")}.</p><div className="approach-candidate__fit"><span>Style: <b>{score.styleBonus > 0 ? "Strong fit" : "Neutral"}</b></span><span>Match aim: <b>{score.aimCompatibility > 0 ? "Strong fit" : score.aimCompatibility < 0 ? "Clash" : "Neutral"}</b></span><span>Pacing: <b>{score.paceBonus >= 5 ? "Ideal" : score.paceBonus >= 0 ? "Usable" : "Risk"}</b></span></div></details>
                  <div className="approach-candidate__metrics">
                    <span>Rating <b>{score.rating.toFixed(1)}</b></span>
                    <span>Suitability <b>{ratingLabel(score.total)} · {score.total.toFixed(1)}</b></span>
                    <span>Stamina <b>{approach.staminaCost}</b></span>
                    <span>Pace <b>{approach.pace}</b></span>
                  </div>
                  <button className="secondary-button compact-button approach-add-button" type="button" aria-label={`Add ${approach.name} for ${worker.name}`} disabled={plan.selectedApproachIds.length >= slots} onClick={() => addManualApproach(worker, approach.id)}>Add</button>
                </article>;
              })}
            </div>
          </details>

          {result && <div className="approach-plan-explanation">{result.explanation.map((line) => <span key={line}>{line}</span>)}</div>}
          {plan.selectedApproachIds.length > slots && <div className="source-warning"><strong>Too many approaches</strong><span>This match length allows {slots}. Run the AI again or remove approaches manually.</span></div>}
        </article>;
          })}
        </section>
        {sideIndex < competitorSides.length - 1 && <div className="match-vs-divider" aria-hidden="true"><span>VS</span></div>}
      </Fragment>)}
    </div>}

    <label className="field match-approach-notes"><span>Approach and road-agent notes</span><textarea rows={3} value={segment.matchApproachSetup.notes} placeholder="Explain why an approach is locked, how the styles should interact, or what should be copied into TEW road-agent notes." onChange={(event) => updateSetup({ notes: event.target.value })} /></label>

    <MatchPerformancePreviewEditor segment={segment} universe={universe} onChange={onChange} />
  </section>;
}
