import { useMemo, useState, type CSSProperties } from "react";
import type { PlannedSegment, PlannedWorkerReference } from "../planner/types";
import { assignAutomaticMatchSides, isMatchCompetitor, MATCH_FORMATS, normalizeMatchFormat } from "../planner/model";
import { MATCH_AIMS, MATCH_APPROACHES } from "./catalog";
import MatchPerformancePreviewEditor from "./MatchPerformancePreview";
import {
  approachLimitForSetup,
  approachSlotsForDuration,
  calculateApproachRating,
  calculateProfileStaminaRating,
  chooseApproachPlan,
  createMatchEngineProfile,
  evaluateApproachPlan,
  getApproach,
  MAX_MATCH_APPROACHES,
  profileApproachRatingInputs,
  workerProfileKey,
} from "./model";
import { MATCH_ENGINE_SKILLS, WRESTLER_STYLES } from "./profileCatalog";
import { calculateMatchAnticipation, momentumLabel, projectedCrowdBeforeForSegment } from "../crowd/model";
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

function ratingTone(value: number): "strong" | "balanced" | "risk" {
  if (value >= 75) return "strong";
  if (value >= 55) return "balanced";
  return "risk";
}

export function MatchSettingsEditor({ segment, onChange }: { segment: PlannedSegment; onChange: (segment: PlannedSegment) => void }) {
  const recommendedSlots = approachSlotsForDuration(segment.durationMinutes);
  const slots = approachLimitForSetup(segment.durationMinutes, segment.matchApproachSetup.approachLimit);
  const aim = MATCH_AIMS.find((item) => item.id === segment.matchApproachSetup.matchAimId) ?? MATCH_AIMS[0];
  const updateSetup = (patch: Partial<PlannedSegment["matchApproachSetup"]>) => onChange({ ...segment, matchApproachSetup: { ...segment.matchApproachSetup, ...patch, performancePreview: null, updatedAt: new Date().toISOString() } });
  const setApproachLimit = (value: number) => {
    const limit = Math.max(1, Math.min(MAX_MATCH_APPROACHES, value || recommendedSlots));
    updateSetup({
      approachLimit: limit,
      workerPlans: segment.matchApproachSetup.workerPlans.map((plan) => {
        const selectedApproachIds = plan.selectedApproachIds.slice(0, limit);
        return { ...plan, selectedApproachIds, lockedApproachIds: plan.lockedApproachIds.filter((id) => selectedApproachIds.includes(id)) };
      }),
    });
  };

  return <section className="match-settings-panel" aria-label="Match Settings">
    <div className="match-settings-heading"><p className="eyebrow">MATCH SETTINGS</p><strong>Core match instructions</strong></div>
    <div className="match-approach-controls">
      <label className="field match-setting-type"><span>Match type</span><select aria-label="Match type" value={normalizeMatchFormat(segment.matchType)} onChange={(event) => onChange(assignAutomaticMatchSides(segment, event.target.value as ReturnType<typeof normalizeMatchFormat>))}>{MATCH_FORMATS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="field match-setting-length"><span>Length</span><input aria-label="Length (minutes)" type="number" min={1} max={180} value={segment.durationMinutes} onChange={(event) => onChange({ ...segment, durationMinutes: Math.max(1, Number(event.target.value) || 1), matchApproachSetup: { ...segment.matchApproachSetup, performancePreview: null } })} /></label>
      <label className="field match-setting-aim"><span>Match aim</span><select aria-label="Match aim" value={aim.id} onChange={(event) => updateSetup({ matchAimId: event.target.value as PlannedSegment["matchApproachSetup"]["matchAimId"] })}>{MATCH_AIMS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field match-setting-limit"><span>Approaches</span><input aria-label="Approach limit per wrestler" type="number" min={1} max={MAX_MATCH_APPROACHES} value={slots} onChange={(event) => setApproachLimit(Number(event.target.value))} /><small><span>Recommended: {recommendedSlots}</span> · Max {MAX_MATCH_APPROACHES}</small></label>
      <div className="match-setting-pace"><span>Ideal pace</span><strong>{aim.idealPace === 0 ? "Open" : aim.idealPace}</strong></div>
    </div>
  </section>;
}

function ApproachSlotDropdown({
  worker,
  profile,
  slotIndex,
  selectedId,
  selectedIds,
  locked,
  open,
  onToggle,
  onSelect,
  onLock,
}: {
  worker: PlannedWorkerReference;
  profile: MatchEngineProfile;
  slotIndex: number;
  selectedId: MatchApproachId | undefined;
  selectedIds: MatchApproachId[];
  locked: boolean;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: MatchApproachId | null) => void;
  onLock: () => void;
}) {
  const choices = useMemo(() => MATCH_APPROACHES.map((approach) => ({
    approach,
    rating: calculateApproachRating(approach, profileApproachRatingInputs(profile)),
  })).sort((left, right) => right.rating - left.rating || left.approach.name.localeCompare(right.approach.name)), [profile]);
  const selected = selectedId ? getApproach(selectedId) : null;
  const selectedRating = selected ? calculateApproachRating(selected, profileApproachRatingInputs(profile)) : 0;

  return <div className="approach-slot">
    <button
      className={`approach-slot-trigger${selected ? ` approach-slot-trigger--${ratingTone(selectedRating)}` : ""}`}
      type="button"
      aria-label={`${worker.name} approach ${slotIndex + 1}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); onToggle(); }
        if (event.key === "Escape" && open) { event.preventDefault(); onToggle(); }
      }}
    >
      <span>{selected?.name ?? `Approach ${slotIndex + 1}`}</span>
      <small>{selected ? `${selectedRating.toFixed(1)} · Cost ${selected.staminaCost} · Pace ${selected.pace}` : "Select"}</small>
    </button>
    {selected && <button className={`approach-slot-lock${locked ? " approach-slot-lock--active" : ""}`} type="button" aria-label={`${locked ? "Unlock" : "Lock"} ${selected.name} for ${worker.name}`} aria-pressed={locked} onClick={onLock}>{locked ? "LOCKED" : "LOCK"}</button>}
    {open && <div className="approach-slot-menu" role="listbox" aria-label={`Approach choices for ${worker.name}, slot ${slotIndex + 1}`}>
      <button className="approach-slot-option approach-slot-option--clear" type="button" role="option" aria-selected={!selectedId} onClick={() => onSelect(null)}>Clear selection</button>
      {choices.map(({ approach, rating }) => <button
        className={`approach-slot-option approach-slot-option--${ratingTone(rating)}`}
        type="button"
        role="option"
        aria-selected={selectedId === approach.id}
        disabled={selectedIds.includes(approach.id) && selectedId !== approach.id}
        title={approach.summary}
        key={approach.id}
        onClick={() => onSelect(approach.id)}
      ><span>{approach.name}</span><b>{rating.toFixed(1)}</b><small>Cost {approach.staminaCost} · Pace {approach.pace}</small></button>)}
    </div>}
  </div>;
}

function RatingsDialog({ profile, worker, onClose, onProfileChange }: { profile: MatchEngineProfile; worker: PlannedWorkerReference; onClose: () => void; onProfileChange: (profile: MatchEngineProfile) => void }) {
  function updateNumber(field: "overall" | "health" | "popularity" | "momentum" | "experience" | "fanReaction" | "gimmick", value: number): void {
    const max = field === "fanReaction" || field === "gimmick" ? 5 : 100;
    const min = field === "fanReaction" || field === "gimmick" ? 1 : 0;
    onProfileChange({ ...profile, [field]: Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)) });
  }

  return <div className="match-ratings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="match-ratings-dialog" role="dialog" aria-modal="true" aria-label={`Edit ratings for ${worker.name}`}>
      <header><div><p className="eyebrow">MATCH PROFILE</p><h4>{worker.name}</h4></div><button type="button" onClick={onClose}>Close</button></header>
      <div className="match-profile-core-grid">
        <label className="field"><span>Wrestler style</span><select aria-label={`${worker.name} style`} value={profile.styleId} onChange={(event) => onProfileChange({ ...profile, styleId: event.target.value as MatchEngineProfile["styleId"] })}>{WRESTLER_STYLES.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select></label>
        {(["overall", "health", "popularity", "momentum", "experience", "fanReaction", "gimmick"] as const).map((field) => <label className="field" key={field}><span>{field === "fanReaction" ? "Fan reaction" : field[0].toUpperCase() + field.slice(1)}</span><input aria-label={`${worker.name} ${field} rating`} type="number" min={field === "fanReaction" || field === "gimmick" ? 1 : 0} max={field === "fanReaction" || field === "gimmick" ? 5 : 100} value={profile[field]} onChange={(event) => updateNumber(field, Number(event.target.value))} /></label>)}
      </div>
      <div className="match-profile-preset-row"><span>Quick rating baseline</span>{[50, 60, 75].map((value) => <button key={value} type="button" onClick={() => onProfileChange({ ...profile, skills: Object.fromEntries(MATCH_ENGINE_SKILLS.map((skill) => [skill, value])) as Record<WrestlerSkill, number> })}>Set all {value}</button>)}</div>
      <div className="match-profile-skill-grid">{MATCH_ENGINE_SKILLS.map((skill) => <label className="field" key={skill}><span>{skill}</span><input aria-label={`${worker.name} ${skill} rating`} type="number" min={0} max={100} value={profile.skills[skill]} onChange={(event) => onProfileChange({ ...profile, skills: { ...profile.skills, [skill]: Math.max(0, Math.min(100, Number(event.target.value) || 0)) } })} /></label>)}</div>
      <label className="field"><span>Profile notes</span><textarea aria-label={`${worker.name} match profile notes`} rows={2} value={profile.notes} onChange={(event) => onProfileChange({ ...profile, notes: event.target.value })} /></label>
    </section>
  </div>;
}

export default function MatchApproachSetupEditor({
  segment,
  universe,
  cardSegments = [],
  crowdStart = 50,
  onUniverseChange,
  onChange,
}: {
  segment: PlannedSegment;
  universe: MatchEngineUniverse;
  cardSegments?: PlannedSegment[];
  crowdStart?: number;
  onUniverseChange: (universe: MatchEngineUniverse) => void;
  onChange: (segment: PlannedSegment) => void;
}) {
  const [editingProfileKey, setEditingProfileKey] = useState("");
  const [openSlotKey, setOpenSlotKey] = useState("");
  const competitors = useMemo(() => segment.workers.filter(isMatchCompetitor), [segment.workers]);
  const recommendedSlots = approachSlotsForDuration(segment.durationMinutes);
  const slots = approachLimitForSetup(segment.durationMinutes, segment.matchApproachSetup.approachLimit);
  const aim = MATCH_AIMS.find((item) => item.id === segment.matchApproachSetup.matchAimId) ?? MATCH_AIMS[0];

  function updateSetup(patch: Partial<PlannedSegment["matchApproachSetup"]>): void {
    onChange({ ...segment, matchApproachSetup: { ...segment.matchApproachSetup, ...patch, performancePreview: patch.performancePreview === undefined ? null : patch.performancePreview, updatedAt: new Date().toISOString() } });
  }

  function savePlan(worker: PlannedWorkerReference, plan: MatchWorkerApproachPlan): void {
    const workerKey = workerProfileKey(worker);
    const nextPlan = { ...plan, workerKey, workerName: worker.name };
    const exists = segment.matchApproachSetup.workerPlans.some((item) => item.workerKey === workerKey);
    updateSetup({ workerPlans: exists ? segment.matchApproachSetup.workerPlans.map((item) => item.workerKey === workerKey ? nextPlan : item) : [...segment.matchApproachSetup.workerPlans, nextPlan] });
  }

  function upsertProfile(profile: MatchEngineProfile): void {
    const exists = universe.profiles.some((item) => item.workerKey === profile.workerKey);
    onUniverseChange({ profiles: exists ? universe.profiles.map((item) => item.workerKey === profile.workerKey ? { ...profile, updatedAt: new Date().toISOString() } : item) : [...universe.profiles, profile] });
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
    const result = chooseApproachPlan(profile, aim.id, segment.durationMinutes, current.lockedApproachIds, slots);
    savePlan(worker, { ...current, selectedApproachIds: result.selectedApproachIds, lockedApproachIds: current.lockedApproachIds.filter((id) => result.selectedApproachIds.includes(id)), mode: "AI", generatedAt: new Date().toISOString() });
  }

  function runAll(): void {
    let nextPlans = [...segment.matchApproachSetup.workerPlans];
    let nextProfiles = [...universe.profiles];
    for (const worker of competitors) {
      const key = workerProfileKey(worker);
      let profile = nextProfiles.find((item) => item.workerKey === key);
      if (!profile) { profile = createMatchEngineProfile(worker); nextProfiles.push(profile); }
      const current = nextPlans.find((item) => item.workerKey === key) ?? planForWorker(segment, worker);
      const result = chooseApproachPlan(profile, aim.id, segment.durationMinutes, current.lockedApproachIds, slots);
      const replacement: MatchWorkerApproachPlan = { ...current, workerKey: key, workerName: worker.name, selectedApproachIds: result.selectedApproachIds, lockedApproachIds: current.lockedApproachIds.filter((id) => result.selectedApproachIds.includes(id)), mode: "AI", generatedAt: new Date().toISOString() };
      nextPlans = nextPlans.some((item) => item.workerKey === key) ? nextPlans.map((item) => item.workerKey === key ? replacement : item) : [...nextPlans, replacement];
    }
    onUniverseChange({ profiles: nextProfiles });
    updateSetup({ workerPlans: nextPlans });
  }

  function selectApproach(worker: PlannedWorkerReference, slotIndex: number, approachId: MatchApproachId | null): void {
    ensureProfile(worker);
    const current = planForWorker(segment, worker);
    const next = [...current.selectedApproachIds];
    const previous = next[slotIndex];
    if (!approachId) next.splice(slotIndex, 1);
    else if (slotIndex >= next.length) next.push(approachId);
    else {
      const duplicateIndex = next.indexOf(approachId);
      if (duplicateIndex >= 0 && duplicateIndex !== slotIndex) next[duplicateIndex] = previous;
      next[slotIndex] = approachId;
    }
    const selectedApproachIds = next.filter((id): id is MatchApproachId => Boolean(id)).slice(0, slots);
    savePlan(worker, { ...current, selectedApproachIds, lockedApproachIds: current.lockedApproachIds.filter((id) => selectedApproachIds.includes(id)), mode: "Manual", generatedAt: "" });
    setOpenSlotKey("");
  }

  function toggleLock(worker: PlannedWorkerReference, approachId: MatchApproachId): void {
    const current = planForWorker(segment, worker);
    savePlan(worker, { ...current, lockedApproachIds: current.lockedApproachIds.includes(approachId) ? current.lockedApproachIds.filter((id) => id !== approachId) : [...current.lockedApproachIds, approachId] });
  }

  const editingWorker = competitors.find((worker) => workerProfileKey(worker) === editingProfileKey) ?? null;
  const editingProfile = editingWorker ? profileForWorker(universe, editingWorker) : null;
  const tableStyle = { "--approach-slots": slots } as CSSProperties;
  const anticipation = calculateMatchAnticipation({
    profiles: competitors.map((worker) => profileForWorker(universe, worker) ?? createMatchEngineProfile(worker)),
    plans: competitors.map((worker) => planForWorker(segment, worker)),
    aimId: aim.id,
  });
  const projectedCrowdBefore = projectedCrowdBeforeForSegment({
    segments: cardSegments.length ? cardSegments : [segment],
    segmentId: segment.id,
    profiles: universe.profiles,
    crowdStart,
  });

  return <section className="match-approach-setup match-approach-setup--compact" aria-label="Match approach setup">
    <header className="match-strategy-header"><div><p className="eyebrow">MATCH APPROACHES</p><h4>Wrestler strategy</h4></div><div className="match-anticipation" aria-label={`Crowd anticipation ${anticipation.score.toFixed(1)} ${anticipation.label}`}><span>Anticipation</span><strong>{anticipation.score.toFixed(1)} · {anticipation.label}</strong><details><summary>Breakdown</summary><small>Popularity {anticipation.popularity.toFixed(1)} · Momentum {anticipation.momentum.toFixed(1)} · Skills {anticipation.skills.toFixed(1)} · Style {anticipation.styleAppeal.toFixed(1)}</small></details></div><button className="primary-button compact-button" type="button" aria-label="Run AI for All Competitors" onClick={runAll} disabled={competitors.length === 0}>AI All</button></header>

    {competitors.length === 0 ? <div className="match-approach-empty">Add wrestlers above to choose their match approaches.</div> : <div className="tew-strategy-table" style={tableStyle} aria-label="Compact wrestler approach table">
      <div className="tew-strategy-table__header"><span>Wrestler</span><span>Style</span><span>OVR</span><span>MOM</span><span>Endurance</span>{Array.from({ length: slots }, (_, index) => <span key={index}>Approach {index + 1}</span>)}<span>Individual result</span><span>Actions</span></div>
      {competitors.map((worker) => {
        const key = workerProfileKey(worker);
        const savedProfile = profileForWorker(universe, worker);
        const profile = savedProfile ?? createMatchEngineProfile(worker);
        const plan = planForWorker(segment, worker);
        const result = evaluateApproachPlan(profile, aim.id, segment.durationMinutes, plan.selectedApproachIds, slots);
        const averageRating = result.candidateScores.length ? result.candidateScores.reduce((total, score) => total + score.rating, 0) / result.candidateScores.length : 0;
        return <article className="tew-strategy-row" key={key} data-match-worker={key}>
          <div className="tew-strategy-worker"><strong>{worker.name}</strong><small>{worker.side || "Competitor"}</small></div>
          <span>{WRESTLER_STYLES.find((style) => style.id === profile.styleId)?.name ?? "All-Rounder"}</span>
          <b>{profile.overall}</b>
          <label className="tew-strategy-momentum"><input aria-label={`${worker.name} momentum`} title={`${momentumLabel(profile.momentum)} momentum`} type="number" min={0} max={100} value={profile.momentum} onChange={(event) => upsertProfile({ ...profile, momentum: Math.max(0, Math.min(100, Number(event.target.value) || 0)), momentumScale: "0-100-v1" })} /><small>{momentumLabel(profile.momentum)}</small></label>
          <span>{calculateProfileStaminaRating(profile).toFixed(1)}</span>
          {Array.from({ length: slots }, (_, slotIndex) => {
            const selectedId = plan.selectedApproachIds[slotIndex];
            const slotKey = `${key}:${slotIndex}`;
            return <ApproachSlotDropdown key={slotKey} worker={worker} profile={profile} slotIndex={slotIndex} selectedId={selectedId} selectedIds={plan.selectedApproachIds} locked={Boolean(selectedId && plan.lockedApproachIds.includes(selectedId))} open={openSlotKey === slotKey} onToggle={() => setOpenSlotKey(openSlotKey === slotKey ? "" : slotKey)} onSelect={(id) => selectApproach(worker, slotIndex, id)} onLock={() => { if (selectedId) toggleLock(worker, selectedId); }} />;
          })}
          <div className={`tew-strategy-result tew-strategy-result--${plan.selectedApproachIds.length ? ratingTone(averageRating) : "empty"}`}><strong>{plan.selectedApproachIds.length ? `Pace ${result.actualPace} · ${result.pace.status}` : "Not set"}</strong><small>{plan.selectedApproachIds.length ? `Rating ${averageRating.toFixed(1)} · Load ${result.usedStamina}/${result.availableStamina} · ${result.stamina.status}` : `${slots} approach slots`}</small></div>
          <div className="tew-strategy-actions"><button className="secondary-button compact-button" type="button" onClick={() => { const created = ensureProfile(worker); setEditingProfileKey(created.workerKey); }}>Ratings</button><button className="primary-button compact-button" type="button" aria-label={`Run Approach AI for ${worker.name}`} onClick={() => runAI(worker)}>AI</button></div>
        </article>;
      })}
    </div>}

    <label className="field match-approach-notes"><span>Approach and road-agent notes</span><textarea rows={2} value={segment.matchApproachSetup.notes} placeholder="Optional notes for the road agent or TEW handoff" onChange={(event) => updateSetup({ notes: event.target.value })} /></label>
    <MatchPerformancePreviewEditor segment={segment} universe={universe} projectedCrowdBefore={projectedCrowdBefore} cardSegments={cardSegments.length ? cardSegments : [segment]} onChange={onChange} />
    {editingWorker && editingProfile && <RatingsDialog profile={editingProfile} worker={editingWorker} onClose={() => setEditingProfileKey("")} onProfileChange={upsertProfile} />}
  </section>;
}
