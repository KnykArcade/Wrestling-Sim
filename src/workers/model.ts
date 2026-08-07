import { createPlannerId } from "../planner/model";
import type { PlannedShow } from "../planner/types";
import type { TrackerStoryline } from "../storylines/types";
import type { TewSnapshot } from "../tew/types";
import type {
  WorkerArc,
  WorkerCandidate,
  WorkerComparison,
  WorkerHistoryEntry,
  WorkerProfile,
  WorkerRelationship,
  WorkerStatistics,
  WorkerUniverse,
  WorkerWarning,
} from "./types";

export function normalizeWorkerName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoNow(): string {
  return new Date().toISOString();
}

function parseDate(value: string): number | null {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00`).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function daysBetween(from: string, to: string): number | null {
  const start = parseDate(from);
  const end = parseDate(to);
  if (start === null || end === null) return null;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function addCandidate(
  map: Map<string, WorkerCandidate>,
  name: string,
  source: WorkerCandidate["source"],
  tewWorkerId = "",
  role = "",
  brand = "",
  appearance = false,
): void {
  const normalized = normalizeWorkerName(name);
  if (!normalized) return;
  const existing = map.get(normalized);
  if (existing) {
    if (existing.source !== "tew" && source === "tew") existing.source = "tew";
    if (!existing.tewWorkerId && tewWorkerId) existing.tewWorkerId = tewWorkerId;
    if (role && !existing.roles.includes(role)) existing.roles.push(role);
    if (brand && !existing.brands.includes(brand)) existing.brands.push(brand);
    if (appearance) existing.appearanceCount += 1;
    return;
  }
  map.set(normalized, {
    key: tewWorkerId ? `tew:${tewWorkerId}` : `name:${normalized}`,
    name: name.trim(),
    source,
    tewWorkerId,
    roles: role ? [role] : [],
    brands: brand ? [brand] : [],
    appearanceCount: appearance ? 1 : 0,
  });
}

export function discoverWorkerCandidates(
  shows: PlannedShow[],
  storylines: TrackerStoryline[],
  snapshot: TewSnapshot | null,
): WorkerCandidate[] {
  const candidates = new Map<string, WorkerCandidate>();

  snapshot?.workers.forEach((worker) =>
    addCandidate(candidates, worker.name, "tew", worker.id, worker.role),
  );

  shows.forEach((show) => {
    show.segments.forEach((segment) => {
      segment.workers.forEach((worker) =>
        addCandidate(
          candidates,
          worker.name,
          worker.source === "tew" ? "tew" : "discovered",
          worker.source === "tew" ? worker.id : "",
          worker.role,
          show.company,
          true,
        ),
      );
      segment.reconciliation.actualMatch?.workers.forEach((name) =>
        addCandidate(candidates, name, "discovered", "", "Competitor", show.company, true),
      );
    });
  });

  storylines.forEach((storyline) => {
    storyline.participants.forEach((participant) =>
      addCandidate(
        candidates,
        participant.name,
        participant.source === "tew" ? "tew" : "discovered",
        participant.source === "tew" ? participant.id : "",
        participant.role,
      ),
    );
  });

  return [...candidates.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function createWorkerProfile(
  sequence: number,
  candidate?: WorkerCandidate,
): WorkerProfile {
  const timestamp = isoNow();
  return {
    id: createPlannerId(),
    displayName: candidate?.name ?? `Untitled Worker ${sequence}`,
    source: candidate?.source ?? "manual",
    linkedTewWorkerId: candidate?.tewWorkerId ?? "",
    linkedTewWorkerName: candidate?.source === "tew" ? candidate.name : "",
    companyId: "",
    companyName: "",
    currentRole: candidate?.roles[0] ?? "Wrestler",
    alignment: "Unspecified",
    brand: candidate?.brands[0] ?? "",
    gimmickSummary: "",
    currentMotivation: "",
    longTermObjective: "",
    creativeDirection: "",
    privateNotes: "",
    inactivityWarningDays: 30,
    arcs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function touchWorkerProfile(profile: WorkerProfile): WorkerProfile {
  return { ...profile, updatedAt: isoNow() };
}

export function duplicateWorkerProfile(profile: WorkerProfile): WorkerProfile {
  const timestamp = isoNow();
  return {
    ...profile,
    id: createPlannerId(),
    displayName: `${profile.displayName} Copy`,
    source: "manual",
    linkedTewWorkerId: "",
    linkedTewWorkerName: "",
    companyId: "",
    companyName: "",
    arcs: profile.arcs.map((arc) => ({ ...arc, id: createPlannerId(), status: "Idea", createdAt: timestamp, updatedAt: timestamp })),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createWorkerArc(sequence: number): WorkerArc {
  const timestamp = isoNow();
  return {
    id: createPlannerId(),
    name: `Untitled Arc ${sequence}`,
    status: "Idea",
    startingSituation: "",
    motivation: "",
    internalConflict: "",
    externalConflict: "",
    turningPoint: "",
    plannedResolution: "",
    aftermath: "",
    linkedStorylineId: "",
    targetShowId: "",
    targetDate: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createWorkerRelationship(workerAId: string, workerBId: string): WorkerRelationship {
  const timestamp = isoNow();
  return {
    id: createPlannerId(),
    workerAId,
    workerBId,
    type: "Rival",
    status: "Planned",
    startDate: today(),
    endDate: "",
    importance: 50,
    publicDescription: "",
    privateNotes: "",
    linkedStorylineId: "",
    history: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function workerNames(profile: WorkerProfile): Set<string> {
  return new Set(
    [profile.displayName, profile.linkedTewWorkerName]
      .map(normalizeWorkerName)
      .filter(Boolean),
  );
}

function segmentIncludesWorker(profile: WorkerProfile, segment: PlannedShow["segments"][number]): boolean {
  const names = workerNames(profile);
  if (segment.workers.some((worker) => {
    if (profile.linkedTewWorkerId && worker.source === "tew" && worker.id === profile.linkedTewWorkerId) return true;
    return names.has(normalizeWorkerName(worker.name));
  })) return true;
  return Boolean(segment.reconciliation.actualMatch?.workers.some((name) => names.has(normalizeWorkerName(name))));
}

function plannedNarrative(segment: PlannedShow["segments"][number]): string {
  return segment.type === "match" ? segment.matchStory : segment.segmentOutput;
}

function winState(profile: WorkerProfile, segment: PlannedShow["segments"][number]): WorkerHistoryEntry["winState"] {
  if (segment.type !== "match") return "Not applicable";
  const actual = segment.reconciliation.actualMatch;
  if (!actual?.winner) return "Unresolved";
  const names = workerNames(profile);
  return names.has(normalizeWorkerName(actual.winner)) ? "Win" : "Loss";
}

export function buildWorkerHistory(profile: WorkerProfile, shows: PlannedShow[]): WorkerHistoryEntry[] {
  const entries: WorkerHistoryEntry[] = [];
  shows.forEach((show) => {
    show.segments.forEach((segment) => {
      if (!segmentIncludesWorker(profile, segment)) return;
      const actual = segment.reconciliation.actualMatch;
      const completed = segment.workflowStatus === "Completed" || segment.workflowStatus === "Reconciled" || show.status === "Reconciled";
      entries.push({
        id: `${show.id}:${segment.id}`,
        showId: show.id,
        segmentId: segment.id,
        showName: show.name,
        showDate: show.date,
        showStatus: show.status,
        segmentTitle: segment.title,
        segmentType: segment.type,
        workflowStatus: segment.workflowStatus,
        plannedNarrative: plannedNarrative(segment),
        finalNarrative: segment.reconciliation.finalNarrative,
        result: actual?.description || (actual?.winner ? `Winner: ${actual.winner}` : ""),
        rating: segment.type === "match" ? actual?.rating ?? segment.reconciliation.actualRating : segment.reconciliation.actualRating,
        consequences: segment.reconciliation.actualConsequences || segment.consequences,
        followUp: segment.reconciliation.finalFollowUp || segment.followUp,
        storylineNames: segment.storylines.map((storyline) => storyline.name),
        completed,
        winState: winState(profile, segment),
      });
    });
  });
  return entries.sort((a, b) => {
    const aDate = parseDate(a.showDate) ?? 0;
    const bDate = parseDate(b.showDate) ?? 0;
    return aDate - bDate || a.showName.localeCompare(b.showName) || a.segmentTitle.localeCompare(b.segmentTitle);
  });
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function calculateWorkerStatistics(history: WorkerHistoryEntry[], referenceDate = today()): WorkerStatistics {
  const matches = history.filter((entry) => entry.segmentType === "match");
  const angles = history.filter((entry) => entry.segmentType === "angle");
  const completed = history.filter((entry) => entry.completed);
  const completedPast = completed.filter((entry) => {
    const date = parseDate(entry.showDate);
    const reference = parseDate(referenceDate);
    return date !== null && reference !== null && date <= reference;
  });
  const future = history.filter((entry) => {
    const date = parseDate(entry.showDate);
    const reference = parseDate(referenceDate);
    return !entry.completed && date !== null && reference !== null && date >= reference;
  });
  const storylines = new Set(history.flatMap((entry) => entry.storylineNames.map((name) => normalizeWorkerName(name))));
  const last = completedPast.at(-1)?.showDate ?? "";
  const next = future[0]?.showDate ?? "";
  let streak = 0;
  let previous = "";
  for (const entry of [...completedPast].reverse()) {
    if (!previous) {
      streak = 1;
      previous = entry.showDate;
      continue;
    }
    const gap = daysBetween(entry.showDate, previous);
    if (gap !== null && gap <= 14) {
      streak += 1;
      previous = entry.showDate;
    } else {
      break;
    }
  }
  return {
    plannedAppearances: history.length,
    completedAppearances: completed.length,
    matches: matches.length,
    angles: angles.length,
    wins: matches.filter((entry) => entry.winState === "Win").length,
    losses: matches.filter((entry) => entry.winState === "Loss").length,
    unresolvedMatches: matches.filter((entry) => entry.winState === "Unresolved").length,
    averageMatchRating: average(matches.map((entry) => entry.rating).filter((value): value is number => value !== null)),
    averageAngleRating: average(angles.map((entry) => entry.rating).filter((value): value is number => value !== null)),
    storylines: storylines.size,
    lastAppearance: last,
    nextAppearance: next,
    appearanceStreak: completedPast.length === 0 ? 0 : streak,
    daysSinceLastAppearance: last ? daysBetween(last, referenceDate) : null,
  };
}

export function relationshipForWorkers(
  relationships: WorkerRelationship[],
  workerAId: string,
  workerBId: string,
): WorkerRelationship | null {
  return relationships.find((relationship) =>
    (relationship.workerAId === workerAId && relationship.workerBId === workerBId) ||
    (relationship.workerAId === workerBId && relationship.workerBId === workerAId),
  ) ?? null;
}

export function compareWorkers(
  workerA: WorkerProfile,
  workerB: WorkerProfile,
  shows: PlannedShow[],
  relationships: WorkerRelationship[],
): WorkerComparison {
  const historyA = buildWorkerHistory(workerA, shows);
  const historyB = buildWorkerHistory(workerB, shows);
  const bIds = new Set(historyB.map((entry) => entry.id));
  const sharedEntries = historyA.filter((entry) => bIds.has(entry.id));
  const sharedStorylines = [...new Set(sharedEntries.flatMap((entry) => entry.storylineNames))].sort();
  const matches = sharedEntries.filter((entry) => entry.segmentType === "match");
  const workerAWins = matches.filter((entry) => entry.winState === "Win").length;
  const workerBHistory = new Map(historyB.map((entry) => [entry.id, entry]));
  const workerBWins = matches.filter((entry) => workerBHistory.get(entry.id)?.winState === "Win").length;
  const completed = sharedEntries.filter((entry) => entry.completed);
  const upcoming = sharedEntries.find((entry) => !entry.completed && (parseDate(entry.showDate) ?? 0) >= (parseDate(today()) ?? 0));
  return {
    sharedEntries,
    sharedStorylines,
    workerAWins,
    workerBWins,
    firstInteraction: completed[0]?.showDate ?? sharedEntries[0]?.showDate ?? "",
    latestInteraction: completed.at(-1)?.showDate ?? "",
    nextInteraction: upcoming?.showDate ?? "",
    relationship: relationshipForWorkers(relationships, workerA.id, workerB.id),
  };
}

export function buildWorkerWarnings(
  profile: WorkerProfile,
  universe: WorkerUniverse,
  shows: PlannedShow[],
  storylines: TrackerStoryline[],
  snapshot: TewSnapshot | null,
  referenceDate = today(),
): WorkerWarning[] {
  const warnings: WorkerWarning[] = [];
  const history = buildWorkerHistory(profile, shows);
  const stats = calculateWorkerStatistics(history, referenceDate);
  const profileName = normalizeWorkerName(profile.displayName);
  const activeStorylines = storylines.filter((storyline) =>
    storyline.status === "Active" && storyline.participants.some((participant) => normalizeWorkerName(participant.name) === profileName),
  );

  if (activeStorylines.length > 0 && !stats.nextAppearance) {
    warnings.push({ id: "active-no-upcoming", category: "Booking", message: `Active in ${activeStorylines.length} storyline${activeStorylines.length === 1 ? "" : "s"} but has no upcoming appearance.` });
  }
  if (stats.daysSinceLastAppearance !== null && stats.daysSinceLastAppearance > profile.inactivityWarningDays) {
    warnings.push({ id: "inactive", category: "Continuity", message: `Has not appeared for ${stats.daysSinceLastAppearance} days, beyond the ${profile.inactivityWarningDays}-day warning setting.` });
  }
  profile.arcs.filter((arc) => arc.status === "Active" || arc.status === "Planned").forEach((arc) => {
    if (!arc.targetDate && !arc.targetShowId && !arc.turningPoint && !arc.plannedResolution) {
      warnings.push({ id: `arc-${arc.id}`, category: "Arc", message: `${arc.name} has no next step, target show, or planned resolution.` });
    }
    if (arc.linkedStorylineId && !storylines.some((storyline) => storyline.id === arc.linkedStorylineId)) {
      warnings.push({ id: `arc-link-${arc.id}`, category: "Arc", message: `${arc.name} references a storyline that no longer exists.` });
    }
  });

  universe.relationships.filter((relationship) => relationship.workerAId === profile.id || relationship.workerBId === profile.id).forEach((relationship) => {
    const otherId = relationship.workerAId === profile.id ? relationship.workerBId : relationship.workerAId;
    if (!universe.profiles.some((worker) => worker.id === otherId)) {
      warnings.push({ id: `relationship-worker-${relationship.id}`, category: "Relationship", message: `${relationship.type} relationship references a worker who no longer exists.` });
    }
    if (relationship.linkedStorylineId && !storylines.some((storyline) => storyline.id === relationship.linkedStorylineId)) {
      warnings.push({ id: `relationship-story-${relationship.id}`, category: "Relationship", message: `${relationship.type} relationship references a deleted storyline.` });
    }
    if (relationship.type === "Betrayal" && relationship.status === "Ended" && !relationship.history.trim()) {
      warnings.push({ id: `betrayal-${relationship.id}`, category: "Continuity", message: "A completed betrayal has no recorded aftermath or relationship history." });
    }
  });

  const activeRoles = activeStorylines.flatMap((storyline) => storyline.participants
    .filter((participant) => normalizeWorkerName(participant.name) === profileName)
    .map((participant) => participant.role.toLowerCase()));
  if (activeRoles.some((role) => role.includes("protagonist")) && activeRoles.some((role) => role.includes("antagonist"))) {
    warnings.push({ id: "conflicting-role", category: "Continuity", message: "Booked as both protagonist and antagonist across active storylines." });
  }

  if (profile.source === "manual" && snapshot?.workers.some((worker) => normalizeWorkerName(worker.name) === profileName)) {
    warnings.push({ id: "duplicate-import", category: "Duplicate", message: "A TEW worker with the same name exists. Link this profile to the imported record to avoid duplicate history." });
  }
  return warnings;
}
