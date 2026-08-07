import { activeResolutionAttempt, finalizeResolutionForLiveCrowd } from "../matchResolution/engine";
import { calculateLiveAngleAudience } from "../crowd/model";
import type { MatchAnticipation } from "../crowd/types";
import type { MatchResolutionRecord, MatchResolutionUniverse } from "../matchResolution/types";
import { createPlannedSegment, createPlannerId, matchBookingValidation, touchShow } from "../planner/model";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import type {
  GroundedAngleInput,
  LiveCardAuditAction,
  LiveCardAuditEntry,
  LiveCardCorrectionEntry,
  LiveCardResultSnapshot,
  LiveCardSegmentProgress,
  LiveCardSession,
  LiveCardUniverse,
} from "./types";

function now(): string {
  return new Date().toISOString();
}

function audit(action: LiveCardAuditAction, showId: string, segmentId: string, detail: string): LiveCardAuditEntry {
  return { id: createPlannerId(), action, showId, segmentId, detail, createdAt: now() };
}

export function emptyLiveCardUniverse(): LiveCardUniverse {
  return { sessions: [], settings: { selectedShowId: "", showRunnerVisible: true } };
}

export interface LiveCardReadiness {
  ready: boolean;
  blockers: string[];
}

export function liveCardReadiness(show: PlannedShow): LiveCardReadiness {
  const blockers: string[] = [];
  if (!show.name.trim()) blockers.push("Give the show a name.");
  if (show.segments.length === 0) blockers.push("Add at least one match or angle to the card.");
  show.segments.forEach((segment, index) => {
    if (!segment.title.trim()) blockers.push(`Name segment ${index + 1}.`);
    if (segment.type === "match") {
      const validation = matchBookingValidation(segment);
      if (validation !== "Match setup is ready.") blockers.push(`${segment.title || `Match ${index + 1}`}: ${validation}`);
    }
  });
  return { ready: blockers.length === 0, blockers };
}

function resolutionForSegment(showId: string, segmentId: string, universe: MatchResolutionUniverse): MatchResolutionRecord | null {
  return universe.records.find((record) => record.showId === showId && record.segmentId === segmentId) ?? null;
}

function finalizedResult(record: MatchResolutionRecord | null): LiveCardResultSnapshot | null {
  const attempt = activeResolutionAttempt(record);
  if (!record || !attempt?.finalResult || (attempt.status !== "Accepted" && attempt.status !== "Overridden")) return null;
  return {
    resolutionRecordId: record.id,
    resolutionAttemptId: attempt.id,
    status: attempt.status,
    engineWinnerName: attempt.engineResult.winnerName,
    finalResult: attempt.finalResult,
    capturedAt: now(),
  };
}

function progressFromSegment(segment: PlannedSegment, result: LiveCardResultSnapshot | null): LiveCardSegmentProgress {
  const timestamp = now();
  return {
    segmentId: segment.id,
    type: segment.type,
    title: segment.title,
    status: segment.type === "match" && result ? "Result Pending" : "Planned",
    insertedDuringShow: false,
    sourceSegmentId: "",
    result: null,
    audience: null,
    finalAngleOutput: segment.type === "angle" ? segment.segmentOutput : "",
    finalConsequences: segment.consequences,
    finalFollowUp: segment.followUp,
    groundedFacts: [],
    startedAt: "",
    completedAt: "",
    skippedAt: "",
    skipReason: "",
    corrections: [],
    updatedAt: timestamp,
  };
}

export function createLiveCardSession(show: PlannedShow, resolutions: MatchResolutionUniverse): LiveCardSession {
  const timestamp = now();
  return {
    id: createPlannerId(),
    showId: show.id,
    showName: show.name,
    status: "Planned",
    currentSegmentId: "",
    segmentOrder: show.segments.map((segment) => segment.id),
    progress: show.segments.map((segment) => progressFromSegment(segment, finalizedResult(resolutionForSegment(show.id, segment.id, resolutions)))),
    audit: [audit("Session Created", show.id, "", `${show.name} live card session created with ${show.segments.length} segments.`)],
    crowdStart: 50,
    currentCrowd: 50,
    startedAt: "",
    completedAt: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function synchronizeLiveCardSession(
  show: PlannedShow,
  resolutions: MatchResolutionUniverse,
  existing: LiveCardSession | null,
): LiveCardSession {
  if (!existing) return createLiveCardSession(show, resolutions);
  const timestamp = now();
  const known = new Map(existing.progress.map((item) => [item.segmentId, item]));
  const progress = show.segments.map((segment) => {
    const current = known.get(segment.id);
    const result = finalizedResult(resolutionForSegment(show.id, segment.id, resolutions));
    if (!current) return progressFromSegment(segment, result);
    if (["Completed", "Skipped", "Correction"].includes(current.status)) return { ...current, title: segment.title, updatedAt: timestamp };
    return {
      ...current,
      title: segment.title,
      status: segment.type === "match" && result ? "Result Pending" as const : current.status,
      finalAngleOutput: segment.type === "angle" && !current.finalAngleOutput ? segment.segmentOutput : current.finalAngleOutput,
      finalConsequences: current.finalConsequences || segment.consequences,
      finalFollowUp: current.finalFollowUp || segment.followUp,
      updatedAt: timestamp,
    };
  });
  const validIds = new Set(show.segments.map((segment) => segment.id));
  const currentSegmentId = validIds.has(existing.currentSegmentId) ? existing.currentSegmentId : progress.find((item) => !["Completed", "Skipped"].includes(item.status))?.segmentId ?? "";
  return {
    ...existing,
    showName: show.name,
    currentSegmentId,
    segmentOrder: show.segments.map((segment) => segment.id),
    progress,
    updatedAt: timestamp,
  };
}

export function upsertLiveCardSession(universe: LiveCardUniverse, session: LiveCardSession): LiveCardUniverse {
  return {
    sessions: universe.sessions.some((item) => item.showId === session.showId)
      ? universe.sessions.map((item) => item.showId === session.showId ? session : item)
      : [session, ...universe.sessions],
    settings: { ...universe.settings, selectedShowId: session.showId },
  };
}

function currentStatus(progress: LiveCardSegmentProgress): LiveCardSegmentProgress["status"] {
  if (progress.type === "match") return "Result Pending";
  return "Current";
}

export function startLiveCardSession(session: LiveCardSession, crowdStart = session.crowdStart || 50): LiveCardSession {
  if (session.status === "Completed") return session;
  const timestamp = now();
  const currentSegmentId = session.currentSegmentId || session.progress.find((item) => !["Completed", "Skipped"].includes(item.status))?.segmentId || "";
  return {
    ...session,
    status: "In Progress",
    crowdStart,
    currentCrowd: crowdStart,
    currentSegmentId,
    progress: session.progress.map((item) => item.segmentId === currentSegmentId && item.status === "Planned"
      ? { ...item, status: currentStatus(item), startedAt: item.startedAt || timestamp, updatedAt: timestamp }
      : item),
    audit: [audit("Show Started", session.showId, currentSegmentId, `Live card started at ${currentSegmentId || "an empty running order"}.`), ...session.audit],
    startedAt: session.startedAt || timestamp,
    updatedAt: timestamp,
  };
}

export function selectLiveCardSegment(session: LiveCardSession, segmentId: string): LiveCardSession {
  if (!session.progress.some((item) => item.segmentId === segmentId)) return session;
  const timestamp = now();
  return {
    ...session,
    currentSegmentId: segmentId,
    progress: session.progress.map((item) => item.segmentId === segmentId && item.status === "Planned"
      ? { ...item, status: currentStatus(item), startedAt: item.startedAt || timestamp, updatedAt: timestamp }
      : item),
    audit: [audit("Segment Selected", session.showId, segmentId, "Segment opened in the live card runner."), ...session.audit].slice(0, 500),
    updatedAt: timestamp,
  };
}

export function nextUnfinishedSegmentId(session: LiveCardSession, afterSegmentId = session.currentSegmentId): string {
  const start = Math.max(-1, session.segmentOrder.indexOf(afterSegmentId));
  const ordered = [...session.segmentOrder.slice(start + 1), ...session.segmentOrder.slice(0, start + 1)];
  return ordered.find((id) => {
    const item = session.progress.find((progress) => progress.segmentId === id);
    return item && !["Completed", "Skipped"].includes(item.status);
  }) ?? "";
}

export function nextUnfinishedMatchId(session: LiveCardSession, afterSegmentId = session.currentSegmentId): string {
  const start = Math.max(-1, session.segmentOrder.indexOf(afterSegmentId));
  const ordered = [...session.segmentOrder.slice(start + 1), ...session.segmentOrder.slice(0, start + 1)];
  return ordered.find((id) => {
    const item = session.progress.find((progress) => progress.segmentId === id);
    return item?.type === "match" && !["Completed", "Skipped"].includes(item.status);
  }) ?? "";
}

export function lockMatchResult(
  session: LiveCardSession,
  record: MatchResolutionRecord,
  anticipation?: MatchAnticipation,
): LiveCardSession {
  const ratedRecord = finalizeResolutionForLiveCrowd(record, anticipation ?? record.setup.anticipation ?? { score: 50, label: "Interested", popularity: 50, momentum: 50, skills: 50, styleAppeal: 50 }, session.currentCrowd);
  const attempt = activeResolutionAttempt(ratedRecord);
  if (!attempt?.finalResult || (attempt.status !== "Accepted" && attempt.status !== "Overridden")) throw new Error("Accept or explicitly override the engine result before locking the match in the live card.");
  const progress = session.progress.find((item) => item.segmentId === record.segmentId);
  if (!progress || progress.type !== "match") throw new Error("The match is not part of this live card session.");
  if (progress.status === "Completed") throw new Error("The match result is already locked. Open a correction rather than silently replacing it.");
  const timestamp = now();
  const result = finalizedResult(ratedRecord)!;
  const audience = result.finalResult.audience!;
  const nextId = nextUnfinishedSegmentId(session, record.segmentId);
  return {
    ...session,
    currentSegmentId: record.segmentId,
    progress: session.progress.map((item) => item.segmentId === record.segmentId ? {
      ...item,
      status: "Completed",
      result,
      audience,
      completedAt: timestamp,
      updatedAt: timestamp,
    } : item),
    currentCrowd: audience.crowdAfter,
    audit: [audit("Match Result Locked", session.showId, record.segmentId, `${result.finalResult.winnerName} defeated ${result.finalResult.loserName}. Final rating ${audience.finalRating}; crowd ${audience.crowdBefore} to ${audience.crowdAfter}.`), ...session.audit],
    updatedAt: timestamp,
    ...(nextId ? {} : { currentSegmentId: record.segmentId }),
  };
}

export function completeAngleSegment(
  session: LiveCardSession,
  segmentId: string,
  output: string,
  consequences: string,
  followUp: string,
  performanceRating = 50,
): LiveCardSession {
  const progress = session.progress.find((item) => item.segmentId === segmentId);
  if (!progress || progress.type !== "angle") throw new Error("Choose an angle from this live card.");
  if (!output.trim()) throw new Error("Record the final Angle Output before completing the segment.");
  if (progress.status === "Completed") throw new Error("The angle is already completed. Open a correction rather than silently replacing it.");
  const timestamp = now();
  const audience = calculateLiveAngleAudience(performanceRating, session.currentCrowd);
  return {
    ...session,
    currentCrowd: audience.crowdAfter,
    progress: session.progress.map((item) => item.segmentId === segmentId ? {
      ...item,
      status: "Completed",
      finalAngleOutput: output.trim(),
      finalConsequences: consequences.trim(),
      finalFollowUp: followUp.trim(),
      audience,
      completedAt: timestamp,
      updatedAt: timestamp,
    } : item),
    audit: [audit("Angle Completed", session.showId, segmentId, `${progress.title} completed with a final Angle Output.`), ...session.audit],
    updatedAt: timestamp,
  };
}

export function skipLiveCardSegment(session: LiveCardSession, segmentId: string, reason: string): LiveCardSession {
  if (!reason.trim()) throw new Error("Record why the segment was skipped.");
  const progress = session.progress.find((item) => item.segmentId === segmentId);
  if (!progress || progress.status === "Completed") throw new Error("A completed segment cannot be skipped.");
  const timestamp = now();
  return {
    ...session,
    progress: session.progress.map((item) => item.segmentId === segmentId ? { ...item, status: "Skipped", skippedAt: timestamp, skipReason: reason.trim(), updatedAt: timestamp } : item),
    audit: [audit("Segment Skipped", session.showId, segmentId, reason.trim()), ...session.audit],
    updatedAt: timestamp,
  };
}

function groundedFacts(sourceSegment: PlannedSegment, result: LiveCardResultSnapshot): string[] {
  return [
    `${result.finalResult.winnerName} defeated ${result.finalResult.loserName}.`,
    result.finalResult.finishDescription,
    `Official duration: ${result.finalResult.actualDurationMinutes.toFixed(2)} minutes.`,
    `Match score: ${result.finalResult.matchScore.toFixed(1)} (${result.finalResult.starRating} stars).`,
    result.status === "Overridden" ? `Booker override was used: ${result.finalResult.overrideReason}` : "The engine result was accepted.",
    sourceSegment.championship ? `Championship context: ${sourceSegment.championship}.` : "",
    sourceSegment.competitionRoundLabel ? `Competition context: ${sourceSegment.competitionRoundLabel}.` : "",
  ].filter(Boolean);
}

export function insertGroundedAngle(
  show: PlannedShow,
  session: LiveCardSession,
  sourceSegmentId: string,
  input: GroundedAngleInput,
): { show: PlannedShow; session: LiveCardSession; segment: PlannedSegment } {
  const sourceProgress = session.progress.find((item) => item.segmentId === sourceSegmentId);
  const sourceSegment = show.segments.find((item) => item.id === sourceSegmentId);
  if (!sourceProgress?.result || !sourceSegment || sourceProgress.type !== "match") throw new Error("Lock the source match result before creating a grounded post-match angle.");
  if (!input.title.trim()) throw new Error("Name the new post-match angle.");
  const segment = createPlannedSegment("angle");
  const facts = groundedFacts(sourceSegment, sourceProgress.result);
  segment.title = input.title.trim();
  segment.durationMinutes = 5;
  segment.angleLocation = input.location.trim() || "In The Ring";
  segment.angleContentType = input.contentType.trim() || "Serious";
  segment.purpose = input.purpose.trim();
  segment.notes = [`Grounded from the official Wrestling Sim result:`, ...facts].join("\n");
  segment.privateNotes = "The result facts are fixed. No dialogue, attack, challenge, turn, or other creative development has been generated.";
  segment.workers = sourceSegment.workers.map((worker) => ({ ...worker }));
  segment.storylines = sourceSegment.storylines.map((storyline) => ({ ...storyline }));
  const sourceIndex = show.segments.findIndex((item) => item.id === sourceSegmentId);
  const nextSegments = [...show.segments];
  nextSegments.splice(sourceIndex + 1, 0, segment);
  const nextShow = touchShow({ ...show, status: show.status === "Draft" ? "Ready" : show.status, segments: nextSegments });
  const timestamp = now();
  const newProgress: LiveCardSegmentProgress = {
    ...progressFromSegment(segment, null),
    status: "Current",
    insertedDuringShow: true,
    sourceSegmentId,
    groundedFacts: facts,
    startedAt: timestamp,
    updatedAt: timestamp,
  };
  const order = [...session.segmentOrder];
  const orderIndex = order.indexOf(sourceSegmentId);
  order.splice(orderIndex + 1, 0, segment.id);
  const nextSession: LiveCardSession = {
    ...session,
    status: "In Progress",
    currentSegmentId: segment.id,
    segmentOrder: order,
    progress: [...session.progress.slice(0, sourceIndex + 1), newProgress, ...session.progress.slice(sourceIndex + 1)],
    audit: [audit(input.mode === "Follow-Up Angle" ? "Follow-Up Angle Inserted" : "Post-Match Segment Inserted", show.id, segment.id, `${segment.title} inserted after ${sourceSegment.title}. Only official result facts were prefilled.`), ...session.audit],
    updatedAt: timestamp,
  };
  return { show: nextShow, session: nextSession, segment };
}

export function openSegmentCorrection(session: LiveCardSession, segmentId: string, reason: string): LiveCardSession {
  const progress = session.progress.find((item) => item.segmentId === segmentId);
  if (!progress || progress.status !== "Completed") throw new Error("Only a completed segment can enter correction mode.");
  if (!reason.trim()) throw new Error("Record why the completed segment requires a correction.");
  const timestamp = now();
  const correction: LiveCardCorrectionEntry = {
    id: createPlannerId(),
    reason: reason.trim(),
    beforeOutput: progress.type === "angle" ? progress.finalAngleOutput : progress.result?.finalResult.finishDescription ?? "",
    afterOutput: "",
    openedAt: timestamp,
    completedAt: "",
  };
  return {
    ...session,
    currentSegmentId: segmentId,
    progress: session.progress.map((item) => item.segmentId === segmentId ? { ...item, status: "Correction", corrections: [...item.corrections, correction], updatedAt: timestamp } : item),
    audit: [audit("Correction Opened", session.showId, segmentId, reason.trim()), ...session.audit],
    updatedAt: timestamp,
  };
}

export function completeAngleCorrection(session: LiveCardSession, segmentId: string, output: string): LiveCardSession {
  const progress = session.progress.find((item) => item.segmentId === segmentId);
  const correction = progress?.corrections.at(-1);
  if (!progress || progress.type !== "angle" || progress.status !== "Correction" || !correction) throw new Error("No open angle correction was found.");
  if (!output.trim()) throw new Error("Record the corrected Angle Output.");
  const timestamp = now();
  return {
    ...session,
    progress: session.progress.map((item) => item.segmentId === segmentId ? {
      ...item,
      status: "Completed",
      finalAngleOutput: output.trim(),
      corrections: item.corrections.map((entry) => entry.id === correction.id ? { ...entry, afterOutput: output.trim(), completedAt: timestamp } : entry),
      updatedAt: timestamp,
    } : item),
    audit: [audit("Correction Completed", session.showId, segmentId, `Angle correction completed without deleting the earlier output.`), ...session.audit],
    updatedAt: timestamp,
  };
}

export function canCompleteLiveCard(session: LiveCardSession): boolean {
  return session.progress.length > 0 && session.progress.every((item) => ["Completed", "Skipped"].includes(item.status));
}

export function completeLiveCard(session: LiveCardSession): LiveCardSession {
  if (!canCompleteLiveCard(session)) throw new Error("Complete or deliberately skip every segment before completing the live show.");
  const timestamp = now();
  return {
    ...session,
    status: "Completed",
    completedAt: timestamp,
    audit: [audit("Show Completed", session.showId, "", `${session.showName} completed with ${session.progress.filter((item) => item.status === "Completed").length} finalized segments.`), ...session.audit],
    updatedAt: timestamp,
  };
}
