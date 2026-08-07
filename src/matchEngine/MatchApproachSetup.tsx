import { Fragment, useMemo, useState } from "react";
import type { PlannedSegment, PlannedWorkerReference } from "../planner/types";
import { assignAutomaticMatchSides, isMatchCompetitor, MATCH_FORMATS, normalizeMatchFormat } from "../planner/model";
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

export function MatchSettingsEditor({ segment, universe, onChange }: { segment: PlannedSegment; universe: MatchEngineUniverse; onChange: (segment: PlannedSegment) => void }) {
  const competitors = segment.workers.filter(isMatchCompetitor);
  const recommendedSlots = approachSlotsForDuration(segment.durationMinutes);
  const slots = segment.matchApproachSetup.approachLimit ?? recommendedSlots;
  const aim = MATCH_AIMS.find((item) => item.id === segment.matchApproachSetup.matchAimId) ?? MATCH_AIMS[0];
  const results = competitors.map((worker) => {
    const profile = profileForWorker(universe, worker);
    const plan = planForWorker(segment, worker);
    return profile ? evaluateApproachPlan(profile, aim.id, segment.durationMinutes, plan.selectedApproachIds, slots) : null;
  }).filter((result) => result !== null);
  const projectedPace = results.length ? Math.round(results.reduce((sum, result) => sum + result.actualPace, 0) / results.length) : 0;
  const paceEvaluation = evaluatePace(aim.idealPace, projectedPace);
  const updateSetup = (patch: Partial<PlannedSegment["matchApproachSetup"]>) => onChange({ ...segment, matchApproachSetup: { ...segment.matchApproachSetup, ...patch, performancePreview: null, updatedAt: new Date().toISOString() } });

  return <section className="match-settings-panel" aria-label="Match Settings">
    <div className="match-settings-heading"><p className="eyebrow">MATCH SETTINGS</p><strong>Set the match before choosing the roster and individual strategies</strong></div>
    <div className="match-approach-controls">
      <label className="field"><span>Match type</span><select aria-label="Match type" value={normalizeMatchFormat(segment.matchType)} onChange={(event) => onChange(assignAutomaticMatchSides(segment, event.target.value as ReturnType<typeof normalizeMatchFormat>))}>{MATCH_FORMATS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="field"><span>Length (minutes)</span><input aria-label="Length (minutes)" type="number" min={1} max={180} value={segment.durationMinutes} onChange={(event) => onChange({ ...segment, durationMinutes: Math.max(1, Number(event.target.value) || 1), matchApproachSetup: { ...segment.matchApproachSetup, performancePreview: null } })} /></label>
      <label className="field"><span>Match aim</span><select aria-label="Match aim" value={aim.id} onChange={(event) => updateSetup({ matchAimId: event.target.value as PlannedSegment["matchApproachSetup"]["matchAimId"] })}>{MATCH_AIMS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span>Approach limit</span><input aria-label="Approach limit per wrestler" type="number" min={1} max={8} value={slots} onChange={(event) => updateSetup({ approachLimit: Math.max(1, Math.min(8, Number(event.target.value) || recommendedSlots)) })} /><small>Recommended: {recommendedSlots}</small></label>
      <div><span>Ideal pace</span><strong>{aim.idealPace === 0 ? "Open" : aim.idealPace}</strong></div>
      <div className={`match-pace-result match-pace-result--${projectedPace && paceEvaluation.modifier < 0 ? "risk" : "balanced"}`}><span>Projected pace</span><strong>{projectedPace || "—"}</strong><small>{!projectedPace ? "Choose approaches" : paceEvaluation.status}</small></div>
    </div>
  </section>;
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
  const [activeStrategyKey, setActiveStrategyKey] = useState("");
  const competitors = useMemo(() => segment.workers.filter(isMatchCompetitor), [segment.workers]);
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

  function updateProfileNumber(profile: MatchEngineProfile, field: "overall" | "health" | "popularity" | "momentum" | "experience" | "fanReaction" | "gimmick", value: number): void {
    const max = field === "fanReaction" || field === "gimmick" ? 5 : 100;
    const min = field === "momentum" ? -20 : field === "fanReaction" || field === "gimmick" ? 1 : 0;
    upsertProfile({ ...profile, [field]: Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)) });
  }

  const activeWorker = competitors.find((worker) => workerProfileKey(worker) === activeStrategyKey) ?? competitors[0] ?? null;
  const activeKey = activeWorker ? workerProfileKey(activeWorker) : "";
  const activePreviewProfile = activeWorker ? profileForWorker(universe, activeWorker) ?? createMatchEngineProfile(activeWorker) : null;
  const activePlan = activeWorker ? planForWorker(segment, activeWorker) : null;
  const activeCandidates = activePreviewProfile ? MATCH_APPROACHES.map((approach) => ({ approach, score: scoreApproachCandidate(activePreviewProfile, aim.id, approach) })).sort((left, right) => right.score.total - left.score.total || right.score.rating - left.score.rating || left.approach.name.localeCompare(right.approach.name)) : [];
  const activeRecommendedIds = new Set(activeCandidates.slice(0, Math.min(3, activeCandidates.length)).map(({ approach }) => approach.id));

  return <section className="match-approach-setup" aria-label="Match approach setup">
    <header className="match-approach-setup__header">
      <div>
        <p className="eyebrow">TEW COMPANION MATCH SETUP</p>
        <h4>Match approaches and wrestler strategy</h4>
        <p>TEW remains the game. This tracker chooses and records the approaches that feed your Match Story, road-agent notes, and TEW handoff.</p>
      </div>
      <button className="primary-button" type="button" onClick={runAll} disabled={competitors.length === 0}>Run AI for All Competitors</button>
    </header>

    {competitors.length === 0 ? <div className="match-approach-empty">
      Add the wrestlers to this match above. Managers, referees, announcers, and commentators are excluded from approach selection.
    </div> : <div className={`match-side-board match-side-board--${Math.min(competitorSides.length, 4)}`}>
      {competitorSides.map(([side, sideWorkers], sideIndex) => <Fragment key={side}>
        <section className="match-side-column">
          <header className="match-side-heading"><span>{side}</span><strong>{sideWorkers.map((worker) => worker.name).join(" & ")}</strong></header>
          {sideWorkers.map((worker) => {
        const key = workerProfileKey(worker);
        const profile = profileForWorker(universe, worker);
        const plan = planForWorker(segment, worker);
        const result = profile ? evaluateApproachPlan(profile, aim.id, segment.durationMinutes, plan.selectedApproachIds, slots) : null;
        const averageApproachRating = result?.candidateScores.length ? result.candidateScores.reduce((total, score) => total + score.rating, 0) / result.candidateScores.length : 0;
        return <article className={`match-competitor-card${key === activeKey ? " match-competitor-card--active" : ""}`} key={key} data-match-worker={key}>
          <header>
            <div><h5>{worker.name}</h5><span>{worker.source === "tew" ? "Linked to TEW worker" : "Manual tracker worker"}</span></div>
            <div className="match-profile-actions">
              <button className={key === activeKey ? "primary-button compact-button" : "secondary-button compact-button"} type="button" onClick={() => setActiveStrategyKey(key)}>{key === activeKey ? "Editing Strategy" : "Edit Strategy"}</button>
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
              <label className="field"><span>Momentum</span><input aria-label={`${worker.name} momentum rating`} type="number" min={-20} max={20} value={profile.momentum} onChange={(event) => updateProfileNumber(profile, "momentum", Number(event.target.value))} /></label>
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
              const approachRating = profile ? calculateApproachRating(approach, profileApproachRatingInputs(profile)) : null;
              return <div className={`selected-approach-row ${approachRating === null ? "" : `selected-approach-row--${resultTone(approachRating)}`}`} key={approachId}>
                <div><strong>{approach.name}</strong><span>{approach.summary}</span></div>
                <div className="selected-approach-numbers"><span>Rating <b>{approachRating?.toFixed(1) ?? "—"}</b></span><span>Cost <b>{approach.staminaCost}</b></span><span>Pace <b>{approach.pace}</b></span></div>
                <label className="approach-lock"><input type="checkbox" checked={plan.lockedApproachIds.includes(approachId)} onChange={(event) => savePlan(worker, { ...plan, lockedApproachIds: event.target.checked ? [...plan.lockedApproachIds, approachId] : plan.lockedApproachIds.filter((id) => id !== approachId) })} /><span>Lock</span></label>
                <button className="danger-button compact-button" type="button" aria-label={`Remove ${approach.name} from ${worker.name}`} onClick={() => savePlan(worker, { ...plan, selectedApproachIds: plan.selectedApproachIds.filter((id) => id !== approachId), lockedApproachIds: plan.lockedApproachIds.filter((id) => id !== approachId), mode: "Manual", generatedAt: "" })}>Remove</button>
              </div>;
            })}
          </div>}

          {result && <div className="approach-plan-explanation">{result.explanation.map((line) => <span key={line}>{line}</span>)}</div>}
          {plan.selectedApproachIds.length > slots && <div className="source-warning"><strong>Too many approaches</strong><span>This match length allows {slots}. Run the AI again or remove approaches manually.</span></div>}
        </article>;
          })}
        </section>
        {sideIndex < competitorSides.length - 1 && <div className="match-vs-divider" aria-hidden="true"><span>VS</span></div>}
      </Fragment>)}
    </div>}

    {activeWorker && activePlan && <section className="approach-selection-board approach-selection-board--shared" aria-label={`Approach Selection Board for ${activeWorker.name}`}>
      <header className="approach-selection-board__header">
        <div><strong>Approach Selection Board</strong><span>Editing {activeWorker.name} · choose another competitor above to switch</span></div>
        <b>{activePlan.selectedApproachIds.length >= slots ? "All slots filled" : `${slots - activePlan.selectedApproachIds.length} selection${slots - activePlan.selectedApproachIds.length === 1 ? "" : "s"} remaining`}</b>
      </header>
      <div className="approach-candidate-list" aria-label={`Available approaches for ${activeWorker.name}`}>
        {activeCandidates.map(({ approach, score }) => {
          const selectedIndex = activePlan.selectedApproachIds.indexOf(approach.id);
          const selected = selectedIndex >= 0;
          const slotsFilled = activePlan.selectedApproachIds.length >= slots;
          return <article className={`approach-candidate approach-candidate--${resultTone(score.rating)}${selected ? " approach-candidate--selected" : ""}`} key={approach.id} aria-label={`${approach.name}, rating ${score.rating.toFixed(1)}, ${ratingLabel(score.rating)}${selected ? `, selected in slot ${selectedIndex + 1}` : ""}`}>
            <div className="approach-rating-badge" aria-hidden="true"><span><b>{score.rating.toFixed(1)}</b><small>Rating</small></span></div>
            <div className="approach-candidate__content">
              <div className="approach-candidate__title"><strong>{approach.name}</strong><span className={`approach-quality approach-quality--${resultTone(score.rating)}`}>{ratingLabel(score.rating)}</span>{activeRecommendedIds.has(approach.id) && <span className="approach-recommended">Recommended</span>}</div>
              <p>{approach.summary}</p>
              <div className="approach-candidate__fit"><span>Style <b>{score.styleBonus > 0 ? "Strong fit" : "Neutral"}</b></span><span>Match aim <b>{score.aimCompatibility > 0 ? "Strong fit" : score.aimCompatibility < 0 ? "Clash" : "Neutral"}</b></span><span>Pace <b>{score.paceBonus >= 5 ? "Ideal" : score.paceBonus >= 0 ? "Usable" : "Risk"}</b></span><span>Stamina <b>{approach.staminaCost}</b></span></div>
            </div>
            <button className={selected ? "primary-button compact-button approach-add-button" : "secondary-button compact-button approach-add-button"} type="button" aria-label={selected ? `${approach.name} selected for ${activeWorker.name} in slot ${selectedIndex + 1}` : `Select ${approach.name} for ${activeWorker.name}`} disabled={selected || slotsFilled} onClick={() => addManualApproach(activeWorker, approach.id)}>{selected ? `Selected ${selectedIndex + 1}` : "Select"}</button>
          </article>;
        })}
      </div>
    </section>}

    <label className="field match-approach-notes"><span>Approach and road-agent notes</span><textarea rows={3} value={segment.matchApproachSetup.notes} placeholder="Explain why an approach is locked, how the styles should interact, or what should be copied into TEW road-agent notes." onChange={(event) => updateSetup({ notes: event.target.value })} /></label>

    <MatchPerformancePreviewEditor segment={segment} universe={universe} onChange={onChange} />
  </section>;
}
